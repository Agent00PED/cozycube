// The Glimmering Caverns' codex and its living wonders (docs/caverns-roadmap.md phase 6).
//
// The codex: a field journal kept in the camp profile (`codex`: the ids found), in five sections:
//
//   zones     a stamp for each of the eight zones, the first time you walk into it
//   fauna     the cave's creatures, met in their homes: the shore's glowing crabs, the doline's
//             swiftlets, the mudflats' bats, the bathing capybara, the rift's glowworms
//   finds     the cave pearls in the terraces' dry basins (picked up, each once), and the fossils a
//             broken node now and then turns up (FOSSIL_CHANCE a break, the ones you haven't found)
//   journal   six torn pages of Old Flint's expedition journal, dropped round the cave
//   wonders   the living wonders witnessed (a Cave Cloud, a Glimmer Bloom, a Rockfall, the Bat Exodus
//             at the camp's dusk) and a photo at the Explorers' Rest
//
// Each new entry pays its coins, and a section completed pays its bonus (the server's `addCodex`).
//
// The living wonders: one at a time while anyone is down there, every CAVE_EVENT_EVERY_MIN minutes
// or so, the room's `caveEvent` (synced to everyone, late joiners too):
//
//   cloud     a Cave Cloud: a mist rolls through the whole cavern and the cenote's rare fish bite
//             more (CLOUD_LUCK) for CAVE_EVENT_S
//   bloom     a Glimmer Bloom: the rift's crystals flare and pulse, its glimmer nodes yield half as
//             much again and grow back twice as fast (BLOOM_YIELD, BLOOM_REGROW) for CAVE_EVENT_S
//   rockfall  a Rockfall: a heap of fallen rock crashes down in the Coal Breakdown, a crew node (the
//             `rockfall` ore node: mixed coal, copper and iron, and a geode likely) standing until
//             it is broken or ROCKFALL_S runs out
//
// and the Bat Exodus, the camp's dusk every day (shared/daynight.ts): the mudflats' bats pouring
// out of the west wall and up through the jungle's collapse (the client's; no server event).

export type CodexSection = "zones" | "fauna" | "finds" | "journal" | "wonders";
/** Each section's bonus and the gold title it gives (shared/items.ts SPECIAL_TITLES): a codex is
 *  worn over your name, not only spent (docs/caverns-roadmap.md R2.2). */
export const CODEX_SECTIONS: { id: CodexSection; name: string; emoji: string; bonus: number; title: string }[] = [
  { id: "zones", name: "Zone Stamps", emoji: "🗺️", bonus: 200, title: "cave_cartographer" },
  { id: "fauna", name: "Cave Fauna", emoji: "🦇", bonus: 150, title: "cave_naturalist" },
  { id: "finds", name: "Pearls & Fossils", emoji: "🐚", bonus: 300, title: "pearl_hunter" },
  { id: "journal", name: "Flint's Journal", emoji: "📜", bonus: 250, title: "flints_heir" },
  { id: "wonders", name: "Living Wonders", emoji: "✨", bonus: 250, title: "wonder_witness" },
];
/** The hearth's stories (docs/caverns-roadmap.md R2.10): while anyone sits by the overlook's fire, a
 *  tale comes round every HEARTH_STORY_S, heard by everyone sitting there or standing near
 *  (HEARTH_EARSHOT). Old Flint's and the expedition's, told the way a fire gets them told. */
export const HEARTH_STORY_S: readonly [number, number] = [45, 70];
export const HEARTH_EARSHOT = 7;
export const HEARTH_STORIES: readonly string[] = [
  "Old Flint swears the Hound's Hand was a real hound once, who sat down to wait for its miner and never got up again.",
  "They say the first crew down here followed a single bat for three days, and it led them to the lake.",
  "Gus keeps one lump of coal in his breast pocket. He won't say why. He just pats it now and then.",
  "The cenote's water was here before the cave was. The cave grew round it, drip by drip.",
  "A miner once struck the Monolith so true it rang for an hour. The glimmer in the rift still hums that note.",
  "If you hold your breath by the rift, you can hear the crystals growing. Or maybe that's just your ears.",
  "Finnegan claims the Elder Olm has been caught three times, and let go three times, by the same angler.",
  "The capybara was here before the basecamp. Gus says it has seniority, and the warmest pool.",
  "The jungle's sun only shows up half the day. The rest of the time the stars climb down through the hole to visit.",
  "Every cave pearl is a grain of sand that fell into the right pool at the right time and was very, very patient.",
  "Nobody knows who first lit this fire. It has never been let go out since, and nobody means to be the first.",
  "The Rockfalls aren't the cave falling apart. They're the cave making room for more of itself.",
  "Old Flint's journal has seven pages, not six. The seventh, he says, he's still writing.",
  "A copper vein, they say, grows back faster if you thank it. Gus thanks every one. Nobody has proved him wrong.",
  "The bats leave at dusk and come back at dawn with news of the whole world above. They just won't share it.",
  "When the mist rolls in, the fish forget to be careful. So do the anglers.",
];

/** The whole codex filled: its own title. */
export const CODEX_TITLE = "cave_chronicler";
/** The titles a codex has earned (a section each, and the whole). */
export function codexTitles(found: readonly string[]): string[] {
  const out = CODEX_SECTIONS.filter((s) => {
    const p = codexProgress(found, s.id);
    return p.all > 0 && p.found === p.all;
  }).map((s) => s.title);
  if (out.length === CODEX_SECTIONS.length) out.push(CODEX_TITLE);
  return out;
}

export interface CodexEntry {
  id: string;
  section: CodexSection;
  name: string;
  emoji: string;
  /** A line or two of lore (a journal page's whole text). */
  lore: string;
  coins: number;
}

const zone = (id: string, name: string, emoji: string, lore: string): CodexEntry => ({ id: `zone_${id}`, section: "zones", name, emoji, lore, coins: 15 });
const fauna = (id: string, name: string, emoji: string, lore: string): CodexEntry => ({ id: `fauna_${id}`, section: "fauna", name, emoji, lore, coins: 20 });

export const CODEX: CodexEntry[] = [
  zone("basecamp", "The Expedition Basecamp", "⛺", "Gus's tarp, the forge in its basalt cleft and the old adit's timbers: where every expedition starts."),
  zone("jungle", "The Doline Jungle", "🌿", "Where the roof fell in long ago, the sun found the cave floor and a forest grew up to meet it."),
  zone("breakdown", "The Coal Breakdown", "🪨", "A field of fallen slabs, coal in their beds; the mountain still settling, a groan at a time."),
  zone("mudflats", "The Iron Mudflats", "🟤", "Dried plates cracked apart over the iron lodes, rust bleeding down the wall, bats in the dark over them."),
  zone("terraces", "The Pearl Terraces", "♨️", "Rimstone steps down the south-west, a warm pool on each, cave pearls in the dry basins below."),
  zone("overlook", "The Hound's Overlook", "🐾", "The plateau under the basecamp's cliff, where the Hound's Hand stood until it fell; the expedition camps there now."),
  zone("rift", "The Glimmer Rift", "💠", "A crevasse walled in basalt, its crystal wall ringing and its fungi glowing in the deep."),
  zone("lake", "The Great Lake", "🌊", "The cenote's still green water, the islet under its own skylight, the Titan Monolith on it."),
  fauna("crab", "Glowing Shore Crab", "🦀", "Skitters sideways along the lake's beach, its shell lit from within. Shy, but curious about lanterns."),
  fauna("swift", "Cave Swiftlet", "🐦", "Circles in the doline's sunbeams all day and nests high on the collapse's rim, out of reach."),
  fauna("bat", "Horseshoe Bat", "🦇", "Roosts on the mudflats' west wall by the hundred, and pours out through the collapse at dusk."),
  fauna("capybara", "The Bathing Capybara", "🦫", "Has claimed the upper warm pool, a towel folded on its head. Always glad of company."),
  fauna("glowworm", "Rift Glowworm", "✨", "Hangs its sticky, glowing threads up the rift's crystal wall, a starfield in a crack of the earth."),
  { id: "pearl_1", section: "finds", name: "Cave Pearl: the First Basin", emoji: "🫧", lore: "A perfect little sphere of calcite, turned smooth by centuries of dripping water.", coins: 25 },
  { id: "pearl_2", section: "finds", name: "Cave Pearl: the Twin Basin", emoji: "🫧", lore: "Two pearls grew touching here; this one came away whole.", coins: 25 },
  { id: "pearl_3", section: "finds", name: "Cave Pearl: the Shallow Basin", emoji: "🫧", lore: "Faintly gold: the terraces' warm water left a little iron in it.", coins: 25 },
  { id: "pearl_4", section: "finds", name: "Cave Pearl: the Far Basin", emoji: "🫧", lore: "Tucked right against the Great Wall's foot, the flowstone's own pearl.", coins: 25 },
  { id: "pearl_5", section: "finds", name: "Cave Pearl: the Lake Basin", emoji: "🫧", lore: "The last basin before the lake; its pearl is the largest of them all.", coins: 25 },
  { id: "fossil_trilobite", section: "finds", name: "Trilobite", emoji: "🐚", lore: "A sea creature in the limestone: this cave was the floor of an ocean once.", coins: 40 },
  { id: "fossil_ammonite", section: "finds", name: "Ammonite", emoji: "🌀", lore: "A coiled shell, its chambers filled in with glittering calcite.", coins: 40 },
  { id: "fossil_fern", section: "finds", name: "Fossil Fern Frond", emoji: "🌿", lore: "Pressed into the coal like a flower in a book: the forest the coal once was.", coins: 40 },
  { id: "fossil_tooth", section: "finds", name: "Cave Bear Tooth", emoji: "🦷", lore: "Enormous, and very old. Something slept down here long before the badgers came.", coins: 40 },
  { id: "page_1", section: "journal", name: "Journal, page 1: The Collapse", emoji: "📜", lore: "Day one. The roof fell in here long before any of us: sunlight on a cave floor, and a forest grew up to meet it. Gus says the copper tastes of rain.", coins: 20 },
  { id: "page_2", section: "journal", name: "Journal, page 2: The Breakdown", emoji: "📜", lore: "The breakdown groans at night. Old slabs settling, Gus says. I say the mountain is still deciding where to lie down. Mind your head, and mind the coal seams.", coins: 20 },
  { id: "page_3", section: "journal", name: "Journal, page 3: The Bats", emoji: "📜", lore: "The bats know the way out. At dusk they pour from the west wall in a river of wings and up through the collapse. I followed them once, as far as a badger can.", coins: 20 },
  { id: "page_4", section: "journal", name: "Journal, page 4: The Hound's Hand", emoji: "📜", lore: "We named the great stalagmite the Hound's Hand. The quake took it in the night; we pitched our tents where it stood. Light a fire there and tell a story: the cave listens. It always has.", coins: 20 },
  { id: "page_5", section: "journal", name: "Journal, page 5: The Bloom", emoji: "📜", lore: "The crystals in the rift ring when no one touches them. Some nights they bloom with light, and the glimmer comes away from the rock as if it wants to be carried.", coins: 20 },
  { id: "page_6", section: "journal", name: "Journal, page 6: The Elder", emoji: "📜", lore: "The Elder Olm is real. I saw its pale shape under the islet, older than the lantern I held. Finnegan believes me. Nobody else does.", coins: 20 },
  { id: "wonder_cloud", section: "wonders", name: "A Cave Cloud", emoji: "☁️", lore: "Warm air met cold and a cloud formed inside the mountain, rolling slow over the lake.", coins: 30 },
  { id: "wonder_bloom", section: "wonders", name: "A Glimmer Bloom", emoji: "💠", lore: "The whole rift lit up at once, every crystal humming the same note.", coins: 30 },
  { id: "wonder_rockfall", section: "wonders", name: "A Rockfall", emoji: "🪨", lore: "A thunder in the breakdown, dust in the light, and a heap of fresh ore where there was none.", coins: 30 },
  { id: "wonder_exodus", section: "wonders", name: "The Bat Exodus", emoji: "🦇", lore: "At the camp's dusk, a river of wings out of the west wall and up through the collapse.", coins: 30 },
  { id: "wonder_photo", section: "wonders", name: "A Photo at the Explorers' Rest", emoji: "📸", lore: "Every expedition takes one. Now yours is on the survey board too.", coins: 20 },
  { id: "wonder_wade", section: "wonders", name: "Wading to the Monolith", emoji: "🌊", lore: "The old causeway lies a hand's depth under the lake now. You waded it out to the islet, cold water to your ankles, the Monolith humming ahead.", coins: 25 },
];
export const CODEX_BY_ID: ReadonlyMap<string, CodexEntry> = new Map(CODEX.map((e) => [e.id, e]));
export const isCodexId = (v: unknown): v is string => typeof v === "string" && CODEX_BY_ID.has(v);
export const FOSSILS = CODEX.filter((e) => e.id.startsWith("fossil_")).map((e) => e.id);
/** A fossil's chance on each node you help break (while you are missing one). */
export const FOSSIL_CHANCE = 0.035;
/** The fauna's homes: where you must be to meet each (a zone, or the capybara's pool within 6 m). */
export const FAUNA_ZONE: Record<string, string> = { fauna_crab: "lake", fauna_swift: "jungle", fauna_bat: "mudflats", fauna_capybara: "terraces", fauna_glowworm: "rift" };

/** Where a section stands in a codex: found and all. */
export function codexProgress(found: readonly string[], section: CodexSection): { found: number; all: number } {
  const all = CODEX.filter((e) => e.section === section);
  return { found: all.filter((e) => found.includes(e.id)).length, all: all.length };
}

// --- the living wonders ------------------------------------------------------------------------------

export type CaveEventKind = "cloud" | "bloom" | "rockfall";
export interface CaveEvent {
  kind: CaveEventKind;
  /** When it began and ends (epoch ms, the server's clock; a Rockfall ends early when broken). */
  at: number;
  until: number;
}
export const CAVE_EVENT_INFO: Record<CaveEventKind, { name: string; emoji: string; toast: string }> = {
  cloud: { name: "Cave Cloud", emoji: "☁️", toast: "A Cave Cloud is rolling through the caverns: rare fish are biting at the cenote!" },
  bloom: { name: "Glimmer Bloom", emoji: "💠", toast: "A Glimmer Bloom lights up the rift: its glimmer yields half as much again, and grows back fast!" },
  rockfall: { name: "Rockfall", emoji: "🪨", toast: "A Rockfall in the Coal Breakdown! A heap of fresh ore to break together: bring a crew" },
};
/** Every so often while anyone is down there (minutes, a random pick in the range), and how long. */
export const CAVE_EVENT_EVERY_MIN: readonly [number, number] = [18, 30];
export const CAVE_EVENT_S = 4 * 60;
export const ROCKFALL_S = 6 * 60;
/** A Cave Cloud's pull on the cenote's rare fish; a Glimmer Bloom's glimmer yield and regrowth. */
export const CLOUD_LUCK = 0.35;
export const BLOOM_YIELD = 1.5;
export const BLOOM_REGROW = 0.5;
/** The Bat Exodus: from the camp's dusk (dayPhase 0.5) for this long (s). */
export const EXODUS_S = 45;

export function parseCaveEvent(raw: string): CaveEvent | null {
  try {
    const v = raw ? (JSON.parse(raw) as CaveEvent) : null;
    return v && (v.kind === "cloud" || v.kind === "bloom" || v.kind === "rockfall") && Number.isFinite(v.until) ? v : null;
  } catch {
    return null;
  }
}
export const caveEventOn = (ev: CaveEvent | null, kind: CaveEventKind, now = Date.now()) => !!ev && ev.kind === kind && now < ev.until;
