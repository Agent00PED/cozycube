// The Velvet Casino's inventory items: things a player owns in their account (kept in the casino's
// slice of the player record, shared/casino.ts CasinoProfile) rather than won as a title or an emote.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

export interface CasinoItem {
  id: string;
  name: string;
  emoji: string;
  /** What it costs, in coins. */
  price: number;
  /** What Mr. Vance gives back for it at the cage, in chips (a pawn: half its price; 0: not pawned). */
  pawn: number;
  blurb: string;
}

/** The Black Card: the Velvet Penthouse's permanent pass, bought for coins from Mr. Vance at the
 *  cage (or from Bruno at the penthouse doors), kept in your account for good. A player down on their
 *  luck can pawn it back to Mr. Vance for half, in chips. (The account's `vipPass`.) */
export const VIP_PASS: CasinoItem = {
  id: "vip_pass",
  name: "The Black Card",
  emoji: "💳",
  price: 6500,
  pawn: 3250,
  blurb: "The Velvet Penthouse for good: high-limit poker, baccarat and the Golden Vault, every night.",
};
/** The Velvet VIP Wristband: one ride up to the Velvet Penthouse (Bruno takes it at the doors), for
 *  coins; wristbands keep in the account until used. A Black Card holder never needs one. */
export const VIP_WRISTBAND: CasinoItem = {
  id: "vip_wristband",
  name: "Velvet VIP Wristband",
  emoji: "🎟️",
  price: 600,
  pawn: 0,
  blurb: "One night in the Velvet Penthouse: Bruno takes it at the doors.",
};
/** The most wristbands one account keeps. */
export const MAX_WRISTBANDS = 20;

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
