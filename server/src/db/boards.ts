import fs from "fs";
import path from "path";
import type { Pool } from "pg";
import type { BoardSnapshot } from "../rooms/boardgame";
import { createPool } from "./players";

// Board-game persistence: the table in each voice channel's room (the chess or checkers game in
// progress, who sits where), so a server restart or a redeploy does not wipe it. One row per
// channel, rewritten after every change and deleted once nobody is at the table.
//
//   postgres  when DATABASE_URL is set (Railway): a board_tables table beside players
//   file      local development without a database: a JSON file (server/.data/boards.json), so
//             the dev server's restarts on every edit do not wipe a game either
//   memory    if neither works: this process only

export interface BoardStore {
  readonly kind: "postgres" | "file" | "memory";
  load(channelId: string): Promise<BoardSnapshot | null>;
  /** Saves a channel's table; null deletes it (nobody at the table). */
  save(channelId: string, snapshot: BoardSnapshot | null): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS board_tables (
  channel_id VARCHAR(128) PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`;

export class PostgresBoardStore implements BoardStore {
  readonly kind = "postgres" as const;
  constructor(private pool: Pool) {}

  static async connect(url: string): Promise<PostgresBoardStore> {
    return PostgresBoardStore.over(createPool(url));
  }

  /** The store over an existing pool (its table created if missing). */
  static async over(pool: Pool): Promise<PostgresBoardStore> {
    await pool.query(SCHEMA_SQL);
    return new PostgresBoardStore(pool);
  }

  async load(channelId: string) {
    const res = await this.pool.query("SELECT state FROM board_tables WHERE channel_id = $1", [channelId]);
    const state = res.rows[0]?.state;
    return state ? ((typeof state === "string" ? JSON.parse(state) : state) as BoardSnapshot) : null;
  }

  async save(channelId: string, snapshot: BoardSnapshot | null) {
    if (!snapshot) {
      await this.pool.query("DELETE FROM board_tables WHERE channel_id = $1", [channelId]);
      return;
    }
    await this.pool.query(
      `INSERT INTO board_tables (channel_id, state, updated_at) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (channel_id) DO UPDATE SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP`,
      [channelId, JSON.stringify(snapshot)]
    );
  }

  async close() {
    await this.pool.end();
  }
}

/** Every channel's table in one JSON file, rewritten whole (write, then rename) on each save. */
class FileBoardStore implements BoardStore {
  readonly kind = "file" as const;
  private tables: Record<string, BoardSnapshot> = {};
  private writing: Promise<void> = Promise.resolve();

  constructor(private file: string) {
    try {
      this.tables = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      this.tables = {}; // no file yet, or not readable: start empty
    }
  }

  async load(channelId: string) {
    return this.tables[channelId] ?? null;
  }

  async save(channelId: string, snapshot: BoardSnapshot | null) {
    if (snapshot) this.tables[channelId] = snapshot;
    else delete this.tables[channelId];
    const text = JSON.stringify(this.tables);
    // one write at a time, each of the whole current set
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.promises.writeFile(tmp, text, "utf8");
      await fs.promises.rename(tmp, this.file);
    });
    await this.writing;
  }

  async close() {
    await this.writing;
  }
}

class MemoryBoardStore implements BoardStore {
  readonly kind = "memory" as const;
  private tables = new Map<string, BoardSnapshot>();
  async load(channelId: string) {
    return this.tables.get(channelId) ?? null;
  }
  async save(channelId: string, snapshot: BoardSnapshot | null) {
    if (snapshot) this.tables.set(channelId, snapshot);
    else this.tables.delete(channelId);
  }
  async close() {}
}

let store: BoardStore | null = null;

export async function initBoardStore(): Promise<BoardStore> {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      store = await PostgresBoardStore.connect(url);
      console.log("[db] board_tables ready: board games survive restarts");
      return store;
    } catch (err) {
      console.error("[db] board_tables unavailable, keeping board games in memory:", err instanceof Error ? err.message : err);
      store = new MemoryBoardStore();
      return store;
    }
  }
  const file = process.env.BOARD_STORE_FILE || path.resolve(process.cwd(), ".data", "boards.json");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    store = new FileBoardStore(file);
    console.log(`[db] DATABASE_URL is not set: board games are saved to ${file}`);
  } catch (err) {
    console.error("[db] board file unavailable, keeping board games in memory:", err instanceof Error ? err.message : err);
    store = new MemoryBoardStore();
  }
  return store;
}

export function getBoardStore(): BoardStore {
  if (!store) store = new MemoryBoardStore(); // a room created before init finished (index.ts awaits it)
  return store;
}
