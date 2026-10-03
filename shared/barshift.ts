// A Shift at the Bar: Sunset Beach's bartender minigame (docs/beach-design.md section 2).
//
// A player steps behind the counter at one of the bar's three stations and takes an order: a ticket
// from a player on a stool who asked for a drink, else from one of the bar's regulars. The drink is
// made in three short stages, and graded in stars:
//
//   build   the ticket shows the recipe a moment, then hides it: tap its ingredients, in order,
//           from the shelf of eight
//   pour    hold to pour; let go with the glass filled to the line (a narrower band for the finer
//           drinks; over the brim is spilt)
//   shake   four beats, a ring closing onto the shaker for each: tap as it lands
//
// The server deals the ticket and judges the log on its own clock (judgeDrink, the same function the
// panel grades its preview with; a shift can't be played faster than its stages take). A drink is
// served to whoever ordered it: they hold it, wear its aura, and a Good or Perfect one leaves them
// Refreshed (a little quicker on their feet for a while). Tips are small and capped by the hour, so
// the bar is never the best way to earn.

export const BAR_INGREDIENTS = ["mango", "lime", "coconut", "mint", "berry", "pineapple", "ice", "soda"] as const;
export type BarIngredient = (typeof BAR_INGREDIENTS)[number];
export const INGREDIENT_INFO: Record<BarIngredient, { name: string; emoji: string }> = {
  mango: { name: "Mango", emoji: "🥭" },
  lime: { name: "Lime", emoji: "🍋‍🟩" },
  coconut: { name: "Coconut", emoji: "🥥" },
  mint: { name: "Mint", emoji: "🌿" },
  berry: { name: "Berries", emoji: "🫐" },
  pineapple: { name: "Pineapple", emoji: "🍍" },
  ice: { name: "Ice", emoji: "🧊" },
  soda: { name: "Soda", emoji: "🫧" },
};

export interface Drink {
  name: string;
  emoji: string;
  /** 1 to 3: how fine it is (the pour's band, the shake's tempo, the tip). */
  band: 1 | 2 | 3;
  recipe: BarIngredient[];
  /** The aura its drinker wears (a colour). */
  aura: string;
  blurb: string;
  /** Listed only for a player who has found the Hidden Cove. */
  secret?: boolean;
}
export const DRINKS = {
  sunset_punch: { name: "Sunset Punch", emoji: "🍹", band: 1, recipe: ["mango", "pineapple", "ice"], aura: "#ff9a5c", blurb: "Mango and pineapple over ice: the house drink" },
  blue_lagoon: { name: "Blue Lagoon", emoji: "🧊", band: 1, recipe: ["lime", "soda", "ice"], aura: "#6fd3ff", blurb: "Lime and soda, cold as the deep water" },
  berry_fizz: { name: "Berry Fizz", emoji: "🫧", band: 1, recipe: ["berry", "soda", "mint"], aura: "#c98fff", blurb: "Berries, bubbles and a sprig of mint" },
  coconut_cooler: { name: "Coconut Cooler", emoji: "🥥", band: 2, recipe: ["coconut", "lime", "ice", "mint"], aura: "#fff1c9", blurb: "Fresh coconut, sharpened with lime" },
  mint_breeze: { name: "Mint Breeze", emoji: "🌿", band: 2, recipe: ["mint", "lime", "soda", "ice"], aura: "#8ff0b8", blurb: "All mint and sparkle" },
  pineapple_spark: { name: "Pineapple Spark", emoji: "🍍", band: 2, recipe: ["pineapple", "soda", "lime", "ice"], aura: "#ffd85c", blurb: "Pineapple with a fizz on its tail" },
  tidewater_tonic: { name: "Tidewater Tonic", emoji: "🌊", band: 3, recipe: ["coconut", "mint", "soda", "lime"], aura: "#5fe0d0", blurb: "The fishermen's drink: bracing" },
  midnight_pearl: { name: "Midnight Pearl", emoji: "🦪", band: 3, recipe: ["coconut", "berry", "ice", "mint"], aura: "#e6d6ff", blurb: "Dark berries over pearl-white coconut", secret: true },
} as const satisfies Record<string, Drink>;
export type DrinkId = keyof typeof DRINKS;
export const DRINK_IDS = Object.keys(DRINKS) as DrinkId[];
export const isDrinkId = (v: unknown): v is DrinkId => typeof v === "string" && v in DRINKS;
/** The drinks on the menu (the secret one only for whoever has found the cove). */
export const menuOf = (cove: boolean): DrinkId[] => DRINK_IDS.filter((id) => cove || !(DRINKS[id] as Drink).secret);

// --- the stages ----------------------------------------------------------------------------------

/** How long the ticket shows its recipe before hiding it (s). */
export const RECIPE_SHOWN_S = 2.4;
/** The pour: the glass fills from empty to the brim in POUR_FULL_S; the line to stop at, and how
 *  close counts (a band's half-width, as a share of the glass). */
export const POUR_FULL_S = 2.2;
export const POUR_LINE = 0.8;
export const POUR_BAND: Record<1 | 2 | 3, number> = { 1: 0.075, 2: 0.055, 3: 0.04 };
/** How full the glass is after holding `ms` (over 1: spilt). */
export const pourFill = (ms: number) => Math.max(0, ms) / (POUR_FULL_S * 1000);
/** The shake: four beats, `SHAKE_BEAT_S` apart by band, the first a beat after the stage opens; a
 *  tap within SHAKE_WINDOW_S of a beat lands it. */
export const SHAKE_BEATS = 4;
export const SHAKE_BEAT_S: Record<1 | 2 | 3, number> = { 1: 0.7, 2: 0.58, 3: 0.48 };
export const SHAKE_WINDOW_S = 0.15;
/** When each beat falls (ms after the stage opens). */
export const shakeBeats = (band: 1 | 2 | 3): number[] => Array.from({ length: SHAKE_BEATS }, (_, i) => Math.round((i + 1) * SHAKE_BEAT_S[band] * 1000));
/** The least time a shift can honestly take (ms): the recipe read, the taps, the pour, the beats. */
export const minShiftMs = (id: DrinkId): number => {
  const d = DRINKS[id] as Drink;
  return Math.round(600 + d.recipe.length * 120 + POUR_FULL_S * 1000 * (POUR_LINE - POUR_BAND[d.band] * 2) + SHAKE_BEATS * SHAKE_BEAT_S[d.band] * 1000 * 0.9);
};
/** A ticket left unfinished this long is dropped (ms). */
export const SHIFT_TIMEOUT_MS = 75_000;

/** What the panel reports: the ingredients tapped (in order), how long the pour was held (ms), and
 *  when the shaker was tapped (ms after the shake stage opened). */
export interface DrinkLog {
  picks: string[];
  pourMs: number;
  taps: number[];
}
export type DrinkGrade = "perfect" | "good" | "sloppy";
export const GRADE_STARS: Record<DrinkGrade, number> = { perfect: 3, good: 2, sloppy: 1 };
export interface DrinkVerdict {
  grade: DrinkGrade;
  /** Each stage, 0 to 1. */
  build: number;
  pour: number;
  shake: number;
  /** Beats landed. */
  beats: number;
}

/** The build's score: 1 for the recipe in order, a half for the right things out of order. */
export function judgeBuild(recipe: readonly string[], picks: readonly string[]): number {
  if (picks.length !== recipe.length) return 0;
  if (recipe.every((r, i) => picks[i] === r)) return 1;
  return [...recipe].sort().join() === [...picks].sort().join() ? 0.5 : 0;
}
/** The pour's score: 1 inside the band round the line, a half within twice it, nothing if spilt. */
export function judgePour(band: 1 | 2 | 3, ms: number): number {
  const fill = pourFill(ms);
  if (fill > 1) return 0;
  const off = Math.abs(fill - POUR_LINE);
  return off <= POUR_BAND[band] ? 1 : off <= POUR_BAND[band] * 2 ? 0.5 : 0;
}
/** How many beats the taps landed (each tap lands at most one beat, each beat once). */
export function beatsLanded(band: 1 | 2 | 3, taps: readonly number[]): number {
  const beats = shakeBeats(band);
  const used = new Set<number>();
  let n = 0;
  for (const b of beats) {
    const k = taps.findIndex((t, i) => !used.has(i) && Math.abs(t - b) <= SHAKE_WINDOW_S * 1000);
    if (k >= 0) {
      used.add(k);
      n++;
    }
  }
  return n;
}
/** The drink as made: Perfect with every stage right, Good with two stages' worth, else Sloppy. */
export function judgeDrink(id: DrinkId, log: DrinkLog): DrinkVerdict {
  const d = DRINKS[id] as Drink;
  const build = judgeBuild(d.recipe, Array.isArray(log.picks) ? log.picks.slice(0, 8) : []);
  const pour = judgePour(d.band, Number(log.pourMs) || 0);
  const beats = beatsLanded(d.band, Array.isArray(log.taps) ? log.taps.filter((t) => Number.isFinite(t)).slice(0, 12) : []);
  const shake = beats / SHAKE_BEATS;
  const total = build + pour + shake;
  const grade: DrinkGrade = build === 1 && pour === 1 && beats === SHAKE_BEATS ? "perfect" : build > 0 && total >= 2 ? "good" : "sloppy";
  return { grade, build, pour, shake, beats };
}

// --- what a drink does, what a shift pays ----------------------------------------------------------

/** What a player pays Mango for a drink, and what the bartender who made it gets of it. */
export const DRINK_PRICE = 8;
export const BARTENDER_SHARE = 6;
/** A regular's tip, by the drink's stars (a finer drink a coin more). */
export const TIP: Record<DrinkGrade, number> = { sloppy: 2, good: 4, perfect: 6 };
export const tipFor = (id: DrinkId, grade: DrinkGrade) => TIP[grade] + ((DRINKS[id] as Drink).band - 1);
/** Tipped drinks an hour, by account: after that, drinks are made for the fun of it. */
export const TIPS_PER_HOUR = 30;
/** How long a drink's aura lasts, and Refreshed (a Good or Perfect drink: +10% walking pace; it
 *  does not stack with the S'more, the stronger counts). */
export const DRINK_AURA_MS = 10 * 60_000;
export const REFRESHED_MS = 10 * 60_000;
export const REFRESHED_PACE = 1.1;
/** A player's order waits this long for a bartender before Mango makes it himself (ms). */
export const ORDER_WAIT_MS = 60_000;
/** What Mango's own drinks come out as. */
export const MANGO_GRADE: DrinkGrade = "good";

/** The bar's regulars, who order when no player has (their names on the ticket). */
export const REGULARS = ["Old Pete", "Marisol", "Captain Brine", "Dune", "Coco", "Sandy", "Tiki Tom", "Luna"] as const;

/** The Bar Book: what a bartender has made (kept in the camp profile). */
export interface BarBook {
  /** Each drink's count and best stars. */
  made: Partial<Record<DrinkId, { n: number; best: number }>>;
  /** Perfects in a row now, and the longest run. */
  streak: number;
  bestStreak: number;
}
export const emptyBarBook = (): BarBook => ({ made: {}, streak: 0, bestStreak: 0 });
export function sanitizeBarBook(raw: unknown): BarBook {
  const out = emptyBarBook();
  const r = raw as Partial<BarBook> | null;
  if (!r || typeof r !== "object") return out;
  for (const id of DRINK_IDS) {
    const m = (r.made as Record<string, { n?: unknown; best?: unknown }> | undefined)?.[id];
    if (m && Number(m.n) > 0) out.made[id] = { n: Math.min(999_999, Math.floor(Number(m.n))), best: Math.max(1, Math.min(3, Math.floor(Number(m.best) || 1))) };
  }
  out.streak = Math.max(0, Math.min(9999, Math.floor(Number(r.streak) || 0)));
  out.bestStreak = Math.max(out.streak, Math.min(9999, Math.floor(Number(r.bestStreak) || 0)));
  return out;
}
/** A drink noted in the book. */
export function noteDrink(book: BarBook, id: DrinkId, grade: DrinkGrade) {
  const m = book.made[id] ?? { n: 0, best: 1 };
  book.made[id] = { n: m.n + 1, best: Math.max(m.best, GRADE_STARS[grade]) };
  book.streak = grade === "perfect" ? book.streak + 1 : 0;
  book.bestStreak = Math.max(book.bestStreak, book.streak);
}
/** The book's gold titles: every drink of a band made Perfect, and all of them. */
export const BAR_TITLES: Record<1 | 2 | 3, string> = { 1: "Beach Bartender", 2: "Cocktail Artist", 3: "Tidewater Mixer" };
export const MASTER_TITLE = "Master Mixologist";
export function barTitles(book: BarBook, cove: boolean): string[] {
  const perfect = (id: DrinkId) => book.made[id]?.best === 3;
  const menu = menuOf(cove);
  const out = ([1, 2, 3] as const).filter((b) => DRINK_IDS.filter((id) => (DRINKS[id] as Drink).band === b && !(DRINKS[id] as Drink).secret).every(perfect)).map((b) => BAR_TITLES[b]);
  if (menu.every(perfect) && DRINK_IDS.every(perfect)) out.push(MASTER_TITLE);
  return out;
}

// --- the wire --------------------------------------------------------------------------------------

export const BAR_CHANNEL = "beach:bar";
export type BarPacket =
  | { op: "shift"; station: string }
  | { op: "finish"; log: DrinkLog }
  | { op: "leave" }
  | { op: "order"; drink: string };
/** A ticket dealt to a bartender. */
export interface BarTicket {
  drink: DrinkId;
  /** Who it is for: a player's name, or a regular's. */
  forName: string;
  /** True when a player on a stool ordered it. */
  player: boolean;
  /** How many tipped drinks are left this hour. */
  tipsLeft: number;
}
/** How a shift's drink came out. */
export interface BarResult {
  drink: DrinkId;
  verdict: DrinkVerdict;
  coins: number;
  forName: string;
  streak: number;
  /** A title newly earned. */
  title?: string;
}
/** Told to the bar's whole map when a drink is served: who made it (a sessionId, or "" for Mango),
 *  who got it, what and how good. */
export interface DrinkServed {
  by: string;
  to: string;
  toName: string;
  drink: DrinkId;
  grade: DrinkGrade;
}
