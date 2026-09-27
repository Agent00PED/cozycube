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
