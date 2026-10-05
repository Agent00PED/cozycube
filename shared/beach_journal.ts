import type { TimeOfDay } from "./types";
import { BEACH_OBSTACLES, CREEK, MANGROVES, at, beachBlocked, beachWading } from "./worlds/beach";

// The Beach Journal: what a walk along Sunset Beach, a trip out on the captain's boat and an evening
// in the cove turn up. Three sections kept in the camp profile's `beach` (the tide pools keep their own
// `tide`: shared/voyage.ts TIDE_FINDS, shown in the same book):
//
//   shells     beachcombing: a handful of things wash up along the wet sand, a new handful every
//              COMB_EVERY_MS, the same for everyone; picking one up finds a shell by weight
//   shore      the beach's own wildlife, noted when you come near where it lives, at its hour
//   sea        what swims by the boat, and what glows in the cove
//
// A kind new to the journal pays its coins once, a section completed its bonus. Nothing here is taken
// or sold: it is a book of things seen.

export type JournalSection = "shells" | "shore" | "sea";
export interface JournalEntry {
  id: string;
  section: JournalSection;
  name: string;
  emoji: string;
  line: string;
  coins: number;
  /** Shells only: how often it washes up, against the others. */
  weight?: number;
  /** Where to look, shown while it is still to find. */
  hint: string;
}

const shell = (id: string, name: string, emoji: string, weight: number, coins: number, line: string): JournalEntry => ({ id: `shell_${id}`, section: "shells", name, emoji, weight, coins, line, hint: "Washed up along the wet sand" });
const shore = (id: string, name: string, emoji: string, coins: number, line: string, hint: string): JournalEntry => ({ id: `shore_${id}`, section: "shore", name, emoji, coins, line, hint });
const sea = (id: string, name: string, emoji: string, coins: number, line: string, hint: string): JournalEntry => ({ id: `sea_${id}`, section: "sea", name, emoji, coins, line, hint });

export const BEACH_JOURNAL: JournalEntry[] = [
  shell("cockle", "A Cockle Shell", "🐚", 30, 5, "Ribbed like a little fan, and still shut tight on a grain of sand."),
  shell("scallop", "A Scallop Shell", "🪭", 24, 5, "Sunset pink at the hinge, fading to cream at the rim."),
  shell("whelk", "A Whelk", "🐌", 18, 10, "Hold it to your ear. That is not the sea: it is the room. Still."),
  shell("driftwood", "A Driftwood Knot", "🪵", 16, 10, "Silver grey and smooth as a pebble. It has been a long way."),
  shell("seaglass", "Sea Glass", "💚", 12, 15, "A bottle once. The sea took its edges off and gave it back frosted."),
  shell("sanddollar", "A Sand Dollar", "⚪", 8, 20, "Whole, with its five-petalled flower. They hardly ever come in whole."),
  shell("cowrie", "A Tiger Cowrie", "🟤", 5, 30, "Spotted and glossy, as if someone had polished it and left it for you."),
  shell("conch", "A Queen Conch", "🐚", 2, 60, "Big as two hands, pink inside. The tide does not leave these often."),
  shore("gull", "Herring Gull", "🕊️", 5, "Wheels over the shore all day, and has opinions about everything.", "Over the shore, by day"),
  shore("sandpiper", "Sandpiper", "🐦", 10, "Runs after each wave as it draws back, and away again before the next.", "At the water's edge, by day"),
  shore("crab", "Sand Crab", "🦀", 10, "Sideways down the wet sand, and gone the moment you come close.", "On the wet sand"),
  shore("hermit", "Hermit Crab", "🐚", 15, "A borrowed shell with legs. It stops and pretends to be a shell when watched.", "Up the beach, among the driftwood"),
  shore("egret", "Little Egret", "🦢", 15, "Stands in the creek on one leg for an hour, then is quicker than you can see.", "Wading in the tidal creek"),
  shore("fiddler", "Fiddler Crab", "🎻", 15, "Waves its one great claw at the world from the door of its burrow.", "On the mud by the mangroves"),
  shore("firefly", "Grove Firefly", "✨", 15, "Each keeps to its own palm, blinking in its own time.", "Among the palms, after dark"),
  shore("hatchling", "Turtle Hatchlings", "🐢", 40, "A dozen of them, each no bigger than a shell, all running for the moonlit water.", "On the open sand below the bar, some nights"),
  sea("turtle", "Green Sea Turtle", "🐢", 15, "Comes up for one slow breath, looks at you with an old eye, and goes down again.", "In the shallows off the east beach"),
  sea("dolphin", "Dolphins", "🐬", 20, "A pod of them, in step, as if they had rehearsed it.", "Passing the beach, or round the boat"),
  sea("flyingfish", "Flying Fish", "🐟", 15, "Out of the water by the hull and away, low and flat, further than seems right.", "From the boat, out at sea"),
  sea("manta", "Manta Ray", "🪁", 30, "A slate-blue kite gliding past the hull, its wings beating once in a long while.", "From the boat, out at sea"),
  sea("whale", "The Whale", "🐋", 50, "A back like an island alongside, a breath like a geyser, and the flukes going down.", "From the boat, when it comes"),
  sea("jelly", "Moon Jelly", "🪼", 25, "Drifts in the dark lagoon giving off its own pale light.", "Somewhere the captain keeps to himself"),
];
export const JOURNAL_BY_ID: Record<string, JournalEntry> = Object.fromEntries(BEACH_JOURNAL.map((e) => [e.id, e]));
export const isJournalId = (v: unknown): v is string => typeof v === "string" && v in JOURNAL_BY_ID;
export const JOURNAL_SECTIONS: { id: JournalSection; name: string; emoji: string; bonus: number }[] = [
  { id: "shells", name: "Beachcombing", emoji: "🐚", bonus: 150 },
  { id: "shore", name: "Shore Life", emoji: "🦀", bonus: 150 },
  { id: "sea", name: "Sea Life", emoji: "🐬", bonus: 200 },
];
export const sectionOf = (s: JournalSection) => BEACH_JOURNAL.filter((e) => e.section === s);

/** Told to whoever found something: what, whether it is new, what it paid, a section just completed. */
export interface JournalFind {
  id: string;
  isNew: boolean;
  coins: number;
  section: JournalSection | "";
  /** Beachcombing: the spot picked up (so the client hides its twinkle). */
  spot?: number;
  bucket?: number;
}

// --- beachcombing ------------------------------------------------------------------------------------------
export const COMB_EVERY_MS = 8 * 60_000;
export const COMB_SPOTS = 6;
export const COMB_REACH = 1.7;
export const combBucket = (now: number) => Math.floor(now / COMB_EVERY_MS);
const hash = (n: number) => {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Where this stretch of time's finds lie: along the wet sand of the front beach, dry underfoot. */
export function combSpots(bucket: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let k = 0; out.length < COMB_SPOTS && k < 80; k++) {
    const v = -15 + 30 * hash(bucket * 131 + k * 7 + 1);
    const d = 0.5 + 1.5 * hash(bucket * 131 + k * 7 + 2);
    const p = at(d, v);
    if (beachBlocked(p.x, p.z) || beachWading(p.x, p.z)) continue;
    // (clear of what stands on the sand: a lounger, a parasol's pole, the pier's piles)
    if (BEACH_OBSTACLES.some((o) => p.x > o.minX - 0.6 && p.x < o.maxX + 0.6 && p.z > o.minZ - 0.6 && p.z < o.maxZ + 0.6)) continue;
    if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 2.5)) continue;
    out.push({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
  }
  return out;
}
/** What a find turns out to be (`rand` in [0, 1)). */
export function rollShell(rand = Math.random()): JournalEntry {
  const shells = sectionOf("shells");
  let t = rand * shells.reduce((a, s) => a + (s.weight ?? 0), 0);
  for (const s of shells) {
    t -= s.weight ?? 0;
    if (t < 0) return s;
  }
  return shells[0];
}

// --- the hatchlings' run -------------------------------------------------------------------------------------
/** Some nights a nest in the open sand below the bar hatches: for HATCH_S at the start of every HATCH_EVERY_MS of
 *  the wall clock, while the room's hour is night (the same moment on every client). */
export const HATCH_EVERY_MS = 10 * 60_000;
export const HATCH_S = 150;
export const HATCH_NEST = at(5.6, -1.6);
export const HATCH_SEA = at(-0.7, -1.2);
export const HATCH_REACH = 9;
/** Seconds into the run, or -1 when none is on. */
export function hatchClock(now: number, hour: TimeOfDay): number {
  if (hour !== "night") return -1;
  const s = (now % HATCH_EVERY_MS) / 1000;
  return s < HATCH_S ? s : -1;
}

// --- sightings -------------------------------------------------------------------------------------------------
/** Whether a sighting a client reports could be true from where its player stands (the server's check:
 *  the map, the hour, and for the creatures with a home, being near it). The sea's passing wonders
 *  (dolphins by the boat, the whale) are given by the room itself as they come. */
export function sightingHolds(id: string, map: string, x: number, z: number, hour: TimeOfDay, now: number): boolean {
  const day = hour !== "night";
  const beach = map === "sunset_beach";
  switch (id) {
    case "shore_gull":
      return beach && day;
    case "shore_sandpiper":
    case "shore_crab":
    case "shore_hermit":
    case "sea_turtle":
    case "sea_dolphin":
      return beach && (id !== "shore_sandpiper" || day);
    case "shore_egret":
      return beach && Math.hypot(x - CREEK.pool.x, z - CREEK.pool.z) < 12;
    case "shore_fiddler":
      return beach && MANGROVES.some((m) => Math.hypot(x - m.x, z - m.z) < 6);
    case "shore_firefly":
      return beach && !day;
    case "shore_hatchling":
      return beach && hatchClock(now, hour) >= 0 && Math.hypot(x - HATCH_NEST.x, z - HATCH_NEST.z) < HATCH_REACH + 3;
    case "sea_flyingfish":
    case "sea_manta":
      return map === "open_sea";
    case "sea_jelly":
      return map === "hidden_cove";
    default:
      return false;
  }
}
