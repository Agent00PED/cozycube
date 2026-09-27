// The Velvet Casino's inventory items: things a player owns in their account (kept in the casino's
// slice of the player record, shared/casino.ts CasinoProfile) rather than won as a title or an emote.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

export interface CasinoItem {
  id: string;
  name: string;
  emoji: string;
  /** What it costs, in Velvet Chips. */
  price: number;
  /** What Mr. Vance gives back for it at the cage (a pawn: half its price). */
  pawn: number;
  blurb: string;
}

/** The Black Velvet VIP Pass: bought from Mr. Vance at the cage (or from Bruno at the penthouse
 *  doors), kept in your account for good, and shown to Bruno to ride up to the Velvet Penthouse. A
 *  player down on their luck can pawn it back to Mr. Vance for half. */
export const VIP_PASS: CasinoItem = {
  id: "vip_pass",
  name: "Black Velvet VIP Pass",
  emoji: "🎫",
  price: 5000,
  pawn: 2500,
  blurb: "Your key to the Velvet Penthouse: high-limit poker, baccarat and the Golden Vault. Yours for good, or pawn it back to Mr. Vance for 2,500.",
};

// --- The Velvet Pioneer set -------------------------------------------------------------------------
// A thank-you to everyone who played the beta: the accounts that existed before the Phase 3 wipe
// (their record's created_at earlier than the wipe's timestamp, kept by the server) may claim it free
// in the wardrobe for PIONEER_CLAIM_DAYS after the wipe. Never sold, never in the gachapon.

export const PIONEER_CLAIM_DAYS = 14;
export const PIONEER_SET = {
  name: "The Velvet Pioneer",
  /** An artisan beret with a miniature brass gear pin. */
  hat: "pioneercap",
  /** Washed denim overalls with a brass ruler in the bib pocket. */
  outfit: "outfit_blueprint_overalls",
  /** Worn over the name in glowing gold. */
  title: "beta_tester",
} as const;

/** What the server tells a player about the set on joining (and after a claim). */
export interface PioneerInfo {
  eligible: boolean;
  claimed: boolean;
  /** When the claim window closes (epoch ms; 0 with no wipe on record). */
  until: number;
}

/** Whether an account may claim the set: made before the wipe, and the window still open. */
export function pioneerEligible(createdAt: number, wipeAt: number, now = Date.now()): boolean {
  return wipeAt > 0 && createdAt > 0 && createdAt < wipeAt && now < pioneerUntil(wipeAt);
}
export function pioneerUntil(wipeAt: number): number {
  return wipeAt > 0 ? wipeAt + PIONEER_CLAIM_DAYS * 86_400_000 : 0;
}

// --- titles that aren't from the capsule machine -----------------------------------------------------

/** Worn over the name like a capsule title (the same unlock id: title_<id>), drawn in glowing gold. */
export const SPECIAL_TITLES: Record<string, { name: string }> = {
  beta_tester: { name: "[ 🛠️ BETA TESTER ]" },
};
export function specialTitle(id: string): { name: string } | undefined {
  return Object.prototype.hasOwnProperty.call(SPECIAL_TITLES, id) ? SPECIAL_TITLES[id] : undefined;
}
