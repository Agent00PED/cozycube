// The captain's boat (docs/beach-design.md sections 4 and 5): the ticket from Sunset Beach's pier to the
// Open Sea, the trips between the pier, the sea and (once found) the Hidden Cove, and what is made at
// Dune's shack for it.
//
//   the ticket   TICKET_PRICE, one trip, as long as you like. It is spent as you step aboard, and the
//                trip lasts until you stand on the pier again (`seaTrip` in the camp profile): a
//                dropped connection or a restart leaves it in hand, and the captain takes you back out
//                for nothing. Asking him for the pier, or leaving by the world list, ends it.
//   who sails    anyone with a ticket rides along; casting from the rails takes an Expedition rod (T5)
//                or better (shared/sea_fishing.ts SEA_CAST_ROD), and there is no AFK line out there

export const TICKET_PRICE = 150;
export const SEA_CHANNEL = "beach:sea";
export type SeaPacket =
  /** At the pier's head: aboard, for the Open Sea. */
  | { op: "sail" }
  /** At the wheel: back to the pier (the trip ends). */
  | { op: "home" }
  /** At the wheel, the chart whole: on to the Hidden Cove, or back out to the Open Sea from it. */
  | { op: "cove" }
  | { op: "tosea" }
  /** At Dune's shack: a Tidewater tool made (shared/expedition.ts, place "dune"). */
  | { op: "make"; tool: string }
  /** In the cove: a giant clam pried open. */
  | { op: "pry"; clam: string }
  /** On Sunset Beach's rocky point: a look into a tide pool (its index in TIDE_POOLS). */
  | { op: "peek"; pool: number };
/** The captain's answer to a request he can't grant (shown as a toast). */
export interface SeaNotice {
  message: string;
}
/** The maps a voyage is on (a ticket's trip lasts while you are on one of them). */
export const isSeaMap = (map: string): boolean => map === "open_sea" || map === "hidden_cove";

// --- the torn sea chart (docs/beach-design.md section 5) ---------------------------------------------
//
// Fishing by hand on the Open Sea, a catch now and then comes up with a bottle: in it, a torn piece of
// an old sea chart. Three pieces make it whole; with it the captain knows the way to the Hidden Cove,
// for good (`coveAccess`). The chance climbs with every catch that brings none, so nobody's luck runs
// dry for long. Nothing else in the game names the cove.

/** The pieces a chart is torn into. */
export const CHART_PIECES = 3;
/** A catch's chance of a bottle: `CHART_BASE` to begin with, `CHART_STEP` more for every catch since
 *  the last piece, and certain by the `CHART_SURE`th (about half an hour a piece for a steady hand). */
export const CHART_BASE = 0.002;
export const CHART_STEP = 0.00012;
export const CHART_SURE = 300;
export const chartChance = (dry: number): number => (dry >= CHART_SURE ? 1 : CHART_BASE + CHART_STEP * Math.max(0, dry));
/** Told to the finder: the piece just found (1 to CHART_PIECES). */
export interface ChartPiece {
  piece: number;
  of: number;
}

// --- the Hidden Cove's giant clams ---------------------------------------------------------------------

// --- the tide pools (Sunset Beach's rocky point): a look into one finds whatever the tide left -----------
/** What lives in a tide pool: the common ones turn up most looks, the octopus hardly ever. A kind seen
 *  for the first time is written into the Tide Pool Journal (the camp profile's `tide`) and pays its
 *  coins once; all of them, a bonus. Nothing is taken and nothing is sold: it is a thing to look at. */
export interface TideFind {
  id: string;
  name: string;
  emoji: string;
  /** How often it turns up, against the others. */
  weight: number;
  /** Paid once, the first time it is seen. */
  coins: number;
  line: string;
}
export const TIDE_FINDS: TideFind[] = [
  { id: "limpet", name: "Limpets", emoji: "🐚", weight: 30, coins: 5, line: "Limpets, clamped to the rock like little hats. They will not be moved." },
  { id: "periwinkle", name: "Periwinkles", emoji: "🐌", weight: 26, coins: 5, line: "A slow parade of periwinkles grazing the green off the stone." },
  { id: "anemone", name: "A Sea Anemone", emoji: "🌸", weight: 20, coins: 10, line: "An anemone, open like a flower. A touch and it folds itself away." },
  { id: "starfish", name: "A Starfish", emoji: "⭐", weight: 16, coins: 10, line: "A starfish, one arm curled round a pebble, in no hurry at all." },
  { id: "urchin", name: "A Sea Urchin", emoji: "🦔", weight: 12, coins: 15, line: "A sea urchin wedged in a crack, all spines. Look, do not touch." },
  { id: "blenny", name: "A Rockpool Blenny", emoji: "🐟", weight: 9, coins: 20, line: "A blenny! It props itself up on its fins and looks right back at you." },
  { id: "seaslug", name: "A Sea Slug", emoji: "🌈", weight: 5, coins: 30, line: "A sea slug, frilled and striped in colours no one would believe." },
  { id: "octopus", name: "A Little Octopus", emoji: "🐙", weight: 2, coins: 60, line: "Two eyes under a ledge... a little octopus! It changes colour and is gone." },
];
export const TIDE_FIND_IDS = new Set(TIDE_FINDS.map((f) => f.id));
/** The whole journal's bonus, how near a pool you stand, and how long a pool takes to settle after a look. */
export const TIDE_JOURNAL_BONUS = 150;
export const TIDE_REACH = 1.9;
export const TIDE_REST_MS = 45_000;
/** What a look finds (`rand` in [0, 1)). */
export function rollTideFind(rand = Math.random()): TideFind {
  let t = rand * TIDE_FINDS.reduce((a, f) => a + f.weight, 0);
  for (const f of TIDE_FINDS) {
    t -= f.weight;
    if (t < 0) return f;
  }
  return TIDE_FINDS[0];
}
/** Told to whoever looked: what was there, whether it is new to their journal, what it paid. */
export interface TideLook {
  id: string;
  isNew: boolean;
  coins: number;
  found: number;
  all: number;
  complete: boolean;
}

/** A clam pried open gives this many pearls (1, now and then 2), and is shut again this long. */
export const CLAM_PEARLS: readonly [number, number] = [1, 2];
export const CLAM_DOUBLE = 0.25;
export const CLAM_SHUT_MS = 8 * 60_000;
/** Told to the room's cove: each clam's id to when it opens again (ms; 0 or past: ready). */
export type ClamSync = Record<string, number>;

// --- the Open Sea's living wonders: now and then something comes up beside the boat, for everyone
// aboard (the room's, told to whoever is at sea; never saved) -----------------------------------------
export type SeaEventKind = "whale" | "dolphins" | "shoal";
export interface SeaEvent {
  kind: SeaEventKind;
  /** When it began and when it ends (ms). */
  at: number;
  until: number;
}
export const SEA_EVENT_KINDS: SeaEventKind[] = ["whale", "dolphins", "shoal"];
/** How often one comes (minutes, while anyone is out there), and how long it stays (s). */
export const SEA_EVENT_EVERY_MIN: readonly [number, number] = [9, 15];
export const SEA_EVENT_S = 180;
/** A whale beside the boat: a hand-reeled fish is King Size this much likelier. */
export const WHALE_KING = 0.25;
/** Dolphins round the boat drive the fish in: bites this much sooner (a share of the wait). */
export const DOLPHIN_HASTE = 0.75;
/** A shoal passing under the keel: rare fish this much likelier. */
export const SHOAL_LUCK = 0.5;
export const SEA_EVENT_INFO: Record<SeaEventKind, { name: string; emoji: string; toast: string; pill: string }> = {
  whale: { name: "A Whale Alongside", emoji: "🐋", toast: "A whale rolls up beside the boat! While it stays, a fish you reel in by hand is far likelier King Size", pill: "King Size likelier" },
  dolphins: { name: "Dolphins Round the Boat", emoji: "🐬", toast: "Dolphins! They are driving the fish toward the boat: bites come a quarter sooner", pill: "Bites sooner" },
  shoal: { name: "A Shoal Under the Keel", emoji: "✨", toast: "The water flashes silver under the boat: a shoal. Rare fish are far likelier while it passes", pill: "Rare fish likelier" },
};
export const seaEventOn = (ev: SeaEvent | null | undefined, now = Date.now()): ev is SeaEvent => !!ev && now >= ev.at && now < ev.until;
