import { Pool } from "pg";
import { DEFAULT_STATS, STARTING_COINS, type PlayerStats } from "../../../shared/types";

// Player persistence: Railway PostgreSQL when DATABASE_URL is set, an in-memory store when it
// is not (local dev, offline tests). Both speak the same interface, so the room never knows
// which it is talking to. Writes are queued and debounced (a wallet that changes five times in
// a second is written once), and flushed immediately for a player who leaves.

export interface PlayerRecord {
  discordId: string;
  username: string;
  coins: number;
  unlockedItems: string[];
  /** The wardrobe look as parsed fields, or {} for "never opened the wardrobe". */
  equippedLook: Record<string, string>;
  stats: PlayerStats;
  lastDailyClaim: Date | null;
}

export interface LeaderboardEntry {
  username: string;
  coins: number;
}

export interface PlayerStore {
  readonly kind: "postgres" | "memory";
  load(discordId: string): Promise<PlayerRecord | null>;
  upsert(record: PlayerRecord): Promise<void>;
  topCoins(limit: number): Promise<LeaderboardEntry[]>;
  close(): Promise<void>;
}

export function newPlayerRecord(discordId: string, username: string): PlayerRecord {
  return { discordId, username, coins: STARTING_COINS, unlockedItems: [], equippedLook: {}, stats: { ...DEFAULT_STATS }, lastDailyClaim: null };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS players (
  discord_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  coins INTEGER DEFAULT 150,
  unlocked_items JSONB DEFAULT '[]'::jsonb,
  equipped_look JSONB DEFAULT '{}'::jsonb,
  stats JSONB DEFAULT '{"roulette_wins":0,"blackjack_wins":0,"slots_spins":0,"fish_caught":0,"marshmallows_roasted":0}'::jsonb,
  last_daily_claim TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_players_coins ON players (coins DESC);
`;

function rowToRecord(row: any): PlayerRecord {
  return {
    discordId: row.discord_id,
    username: row.username,
    coins: Number(row.coins ?? STARTING_COINS),
    unlockedItems: Array.isArray(row.unlocked_items) ? row.unlocked_items.map(String) : [],
    equippedLook: row.equipped_look && typeof row.equipped_look === "object" ? row.equipped_look : {},
    stats: { ...DEFAULT_STATS, ...(row.stats && typeof row.stats === "object" ? row.stats : {}) },
    lastDailyClaim: row.last_daily_claim ? new Date(row.last_daily_claim) : null,
  };
}

class PostgresStore implements PlayerStore {
  readonly kind = "postgres" as const;
  constructor(private pool: Pool) {}

  static async connect(url: string): Promise<PostgresStore> {
    const pool = new Pool({
      connectionString: url,
      // Railway's public proxy needs TLS; its private network does not. `sslmode` in the URL
      // wins when present; otherwise trust the platform's certificate chain loosely.
      ssl: /sslmode=disable|localhost|127\.0\.0\.1|\.railway\.internal/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    await pool.query(SCHEMA_SQL);
    return new PostgresStore(pool);
  }

  async load(discordId: string) {
    const res = await this.pool.query("SELECT * FROM players WHERE discord_id = $1", [discordId]);
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }

  async upsert(r: PlayerRecord) {
    await this.pool.query(
      `INSERT INTO players (discord_id, username, coins, unlocked_items, equipped_look, stats, last_daily_claim, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (discord_id) DO UPDATE SET
         username = EXCLUDED.username,
         coins = EXCLUDED.coins,
         unlocked_items = EXCLUDED.unlocked_items,
         equipped_look = EXCLUDED.equipped_look,
         stats = EXCLUDED.stats,
         last_daily_claim = EXCLUDED.last_daily_claim,
         updated_at = CURRENT_TIMESTAMP`,
      [r.discordId, r.username.slice(0, 100), r.coins, JSON.stringify(r.unlockedItems), JSON.stringify(r.equippedLook), JSON.stringify(r.stats), r.lastDailyClaim]
    );
  }

  async topCoins(limit: number) {
    const res = await this.pool.query("SELECT username, coins FROM players ORDER BY coins DESC, updated_at ASC LIMIT $1", [limit]);
    return res.rows.map((row) => ({ username: String(row.username), coins: Number(row.coins) }));
  }

  async close() {
    await this.pool.end();
  }
}

/** Process-lifetime store for local development: the same API, nothing on disk. */
class MemoryStore implements PlayerStore {
  readonly kind = "memory" as const;
  private rows = new Map<string, PlayerRecord>();
  async load(discordId: string) {
    const r = this.rows.get(discordId);
    return r ? { ...r, unlockedItems: [...r.unlockedItems], stats: { ...r.stats }, equippedLook: { ...r.equippedLook } } : null;
  }
  async upsert(r: PlayerRecord) {
    this.rows.set(r.discordId, { ...r, unlockedItems: [...r.unlockedItems], stats: { ...r.stats }, equippedLook: { ...r.equippedLook } });
  }
  async topCoins(limit: number) {
    return [...this.rows.values()]
      .sort((a, b) => b.coins - a.coins)
      .slice(0, limit)
      .map((r) => ({ username: r.username, coins: r.coins }));
  }
  async close() {}
}

let store: PlayerStore | null = null;

/** Connects (or falls back) once at startup; safe to call again, it returns the same store. */
export async function initPlayerStore(): Promise<PlayerStore> {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[db] DATABASE_URL is not set: player progress is kept in memory for this process only. Attach a Railway PostgreSQL service to persist it.");
    store = new MemoryStore();
    return store;
  }
  try {
    store = await PostgresStore.connect(url);
    console.log("[db] connected to PostgreSQL; players table ready");
  } catch (err) {
    console.error("[db] PostgreSQL unavailable, falling back to the in-memory store:", err instanceof Error ? err.message : err);
    store = new MemoryStore();
  }
  return store;
}

export function getPlayerStore(): PlayerStore {
  if (!store) {
    // A room created before init finished (should not happen: index.ts awaits it) still works.
    store = new MemoryStore();
  }
  return store;
}

// --- Debounced writer ------------------------------------------------------------------------
// Rooms hand in the latest record whenever something changed; the queue writes each player at
// most once per DEBOUNCE_MS, and `flush` writes a player right away (used on leave).

const DEBOUNCE_MS = 2500;

export class PersistenceQueue {
  private pending = new Map<string, PlayerRecord>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private store: () => PlayerStore) {}

  /** Records the newest state; the write happens on the next debounce tick. */
  mark(record: PlayerRecord) {
    this.pending.set(record.discordId, record);
    if (!this.timer) this.timer = setTimeout(() => void this.drain(), DEBOUNCE_MS);
  }

  /** Writes one player now (or everything pending when no id is given). */
  async flush(discordId?: string) {
    if (discordId) {
      const r = this.pending.get(discordId);
      if (!r) return;
      this.pending.delete(discordId);
      await this.write(r);
      return;
    }
    await this.drain();
  }

  private async drain() {
    this.timer = null;
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const r of batch) await this.write(r);
  }

  private async write(r: PlayerRecord) {
    try {
      await this.store().upsert(r);
    } catch (err) {
      console.error(`[db] failed to save ${r.discordId}, will retry on the next change:`, err instanceof Error ? err.message : err);
      // put it back so the next mark/flush tries again
      if (!this.pending.has(r.discordId)) this.pending.set(r.discordId, r);
    }
  }
}
