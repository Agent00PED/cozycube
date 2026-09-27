// CozyCube's patch notes, as the in-game Patch Notes panel shows them (PatchNotesModal): the whole
// history of the Activity in six eras, from the first lounge to the living, weathered world, each
// patch's changes grouped under four badges. Newest last within an era; the panel opens on the
// newest era. Plain data: adding a patch is adding an entry (and bumping the client's version).

export type PatchCategory = "features" | "visuals" | "economy" | "fixes";

/** The four badges a patch's changes are grouped under, in the order the panel lists them. */
export const PATCH_CATEGORIES: { id: PatchCategory; icon: string; label: string }[] = [
  { id: "features", icon: "🚀", label: "New Features & World Systems" },
  { id: "visuals", icon: "🎨", label: "Visuals, Atmosphere & Audio" },
  { id: "economy", icon: "⚖️", label: "Economy, Gathering & Progression" },
  { id: "fixes", icon: "🛠️", label: "Bug Fixes, Network & Controls" },
];

export interface PatchNote {
  version: string;
  /** When it shipped (YYYY-MM-DD). */
  date: string;
  title: string;
  /** One line on what the patch was about. */
  summary: string;
  changes: Partial<Record<PatchCategory, string[]>>;
}

export interface PatchEra {
  /** 1 to 6. */
  era: number;
  name: string;
  /** Its first and last versions, as the timeline labels them. */
  range: string;
  icon: string;
  blurb: string;
  patches: PatchNote[];
}

export const PATCH_ERAS: PatchEra[] = [
  {
    era: 1,
    name: "The Cozy Foundations",
    range: "v0.1.0 – v0.1.2",
    icon: "🛋️",
    blurb: "A clay-doll hangout in an isometric loft, then a starlit campfire in the woods and a timber trail behind it.",
    patches: [
      {
        version: "0.1.0",
        date: "2026-09-19",
        title: "The Cozy Loft",
        summary: "CozyCube opens its doors: one shared isometric lounge for everyone in the server.",
        changes: {
          features: [
            "The Cozy Lounge: a 15x15 loft with a hearth, a kitchen counter and island, a reading nook, a games table and a pouf circle.",
            "Clay-doll chibi avatars with a wardrobe of hats, hairstyles and outfits.",
            "Click-to-move and WASD walking with pathfinding round the furniture, and sitting on any seat.",
            "Activity status badges (Available, AFK and friends), emotes and chat bubbles.",
          ],
          visuals: ["A shared time-of-day engine: sunrise, day, sunset and night light the loft differently.", "A click ripple where you tap, and a camera that zooms and pans."],
          fixes: ["A client-authoritative movement engine: no rollback when you walk."],
        },
      },
      {
        version: "0.1.1",
        date: "2026-09-25",
        title: "The Starlight Campfire",
        summary: "A second world: a campfire on a floating island in the woods, always under the stars.",
        changes: {
          features: [
            "The Starlight Campfire: a 22x22 night diorama with a bonfire, a river, a dock, a canoe, a tipi and log seats round the fire.",
            "Stardew-style fishing: eight river species, bite timing, line tension, sunken treasure and AFK fishing.",
            "Barnaby the otter angler's stall, marshmallow roasting, the Dutch-oven stew and the Well-Fed buff.",
            "Stargazing with meteor-shower combos and constellation tracing, foraging, firefly jars and the guitar.",
          ],
          visuals: ["Wildlife round the camp: ducks that dive, a raccoon to feed and an owl.", "A synthesized forest soundscape: the fire's crackle, the river and the crickets."],
          economy: ["Persistent accounts in PostgreSQL: your coins and camp gear are kept between visits."],
          fixes: ["Kitchenette brewing, the lofi radio and plant watering in the lounge.", "A heartbeat keepalive and silent reconnects: no more zombie seats after a drop."],
        },
      },
      {
        version: "0.1.2",
        date: "2026-09-26",
        title: "The Northern Timber Trail",
        summary: "Wood chopping, Buster the lumberjack and a carpenter's workbench join the camp.",
        changes: {
          features: [
            "The Northern Timber Trail: four chopping stations with a three-hit combo meter (two greens split the log).",
            "Buster the beaver's stall: he buys wood and carvings and sells axes, carriers and utility gear.",
            "The carpenter's workbench: Safe Carve or Masterwork Push, with salvage and Sawdust on a break.",
          ],
          visuals: ["A three-channel ambience mixer (fire, river, forest).", "The bonfire's smoke follows its fuel; at 0% it goes cold, with no flames or sparks."],
          economy: ["Six Fish Creel tiers (5 to 50 fish) and seven wood carrier tiers (10 to 100 slots).", "Gold-centre critical chops pay a bonus or a Pine Resin, and gear widens the meter's gold."],
        },
      },
    ],
  },
  {
    era: 2,
    name: "The Velvet Casino Debut",
    range: "v0.2.0 – v0.2.1",
    icon: "🎰",
    blurb: "A grand Art-Deco hall of chips, tables and animal croupiers opens its doors.",
    patches: [
      {
        version: "0.2.0",
        date: "2026-09-26",
        title: "The Velvet Casino Opens",
        summary: "A third world: a mid-century casino hall with its own currency and staff.",
        changes: {
          features: [
            "The Velvet Casino: roulette, slots, blackjack and Three-Card Poker in one grand hall.",
            "Mr. Vance's Golden Cage exchanges coins for Velvet Chips (1:1) and back.",
            "Five animal staff: Mr. Vance, Boris, Vivienne, Jasper and Pippin.",
            "The High Rollers board ranks the guild's biggest balances.",
          ],
          visuals: ["A synthesized late-night jazz combo plays in the hall."],
          economy: ["Persistent Velvet Chips, counted with coins toward your net worth.", "Slot returns rebalanced."],
        },
      },
      {
        version: "0.2.1",
        date: "2026-09-27",
        title: "The Grand Expansion",
        summary: "More games, more people, and a camera that follows you round the floor.",
        changes: {
          features: ["Craps, the 8-ball table, the Mechanical Turf Club's horse derby and the coin pusher.", "A crowd of chibi patrons wanders the floor."],
          visuals: ["Elevated stages on the casino floor.", "A crowd murmur under the band: glasses clinking, chips clicking."],
          fixes: ["A camera follow mode that stays locked on you.", "Panels no longer pop up on their own: walk up and choose."],
        },
      },
    ],
  },
  {
    era: 3,
    name: "Casino Depth & VIP Architecture",
    range: "v0.3.0 – v0.3.2",
    icon: "🥂",
    blurb: "A compact six-zone hall, a betting matrix at every table, and the Velvet Penthouse upstairs.",
    patches: [
      {
        version: "0.3.0",
        date: "2026-09-27",
        title: "The Compact Revamp",
        summary: "The casino rebuilt as a 20x20 hall in six zones, every stake within its table's limits.",
        changes: {
          features: ["Cedric the badger deals at the casual blackjack table.", "Playable mini-games at every machine."],
          visuals: ["The Velvet Chip gets its own drawn icon.", "A chibi patron overhaul."],
          economy: ["A tiered betting matrix: presets, a table minimum and ALL IN capped at each table's maximum, shown on brass placards."],
        },
      },
      {
        version: "0.3.1",
        date: "2026-09-27",
        title: "The Velvet Penthouse",
        summary: "A private suite above the floor, reached only with the Black Velvet VIP Pass.",
        changes: {
          features: [
            "The Velvet Penthouse: a 10x10 map of its own, behind Bruno and Boris at the gilded doors.",
            "High-limit poker beside Baron von Fox, baccarat beside Duchess Penelope, and the Golden Vault slot.",
          ],
          visuals: ["The city's lights through the penthouse windows and a champagne tower."],
          economy: ["The Black Velvet VIP Pass: 5,000 chips from Bruno or Mr. Vance, pawned back to Vance for 2,500."],
        },
      },
      {
        version: "0.3.2",
        date: "2026-09-27",
        title: "Tables, Machines & Manners",
        summary: "The tables face the floor, the machines take turns, and the band plays clean.",
        changes: {
          features: ["A machine in use refuses anyone else; \"Excuse me\" asks a patron to finish up.", "Multi-seat blackjack: two tables, rounds for everyone seated, with split and double."],
          visuals: ["The dealers stand behind their tables, facing the floor.", "Cinzel, Outfit and Playfair Display with gold foil on every casino panel.", "The jazz combo remixed with no noise bed."],
        },
      },
    ],
  },
  {
    era: 4,
    name: "The Grand Ecosystem Overhaul",
    range: "v0.4.0 – v0.4.4",
    icon: "🌿",
    blurb: "A fresh start for every account, worlds you walk on your own, a living market and Chloe's boutique.",
    patches: [
      {
        version: "0.4.0",
        date: "2026-09-27",
        title: "The players_v3 Wipe",
        summary: "Every account starts fresh on one calibrated economy.",
        changes: {
          economy: [
            "The Phase 3 wipe: every account back to 50 coins and 0 chips, with the starter wardrobe and an empty camp profile.",
            "Lifetime stats kept; test accounts left behind; the old table kept as an untouched backup.",
            "A deflated tier economy in one calibrated table: fish, wood, carvings, creels, carriers and gear.",
          ],
          fixes: ["The wipe runs once under an advisory lock and is recorded, so a restart never repeats it."],
        },
      },
      {
        version: "0.4.1",
        date: "2026-09-27",
        title: "Independent Traversal",
        summary: "One room per server, and everyone walks its worlds on their own.",
        changes: {
          features: [
            "One persistent instance per Discord server: everyone who launches it anywhere in the server shares it.",
            "Each player travels on their own: you see, hear and bump into only the world you are in.",
            "Chat and the casino's jackpots still reach every world.",
          ],
          visuals: ["A burgundy velvet curtain for every trip, with a cozy tip.", "Soundscapes cross-fade in half a second between worlds."],
          fixes: ["A client on an older build counts down and reloads itself after a deploy."],
        },
      },
      {
        version: "0.4.2",
        date: "2026-09-27",
        title: "The Dynamic Market Ticker",
        summary: "The camp's prices move on the hour, and every sale nudges them.",
        changes: {
          economy: [
            "Every good's price moves each hour between 50% and 200% of its base.",
            "Each sale knocks 2% off the next, so a glut sells cheaper.",
            "Barnaby's outdoor chalkboard shows the hour's prices with ▲/▼ arrows.",
          ],
        },
      },
      {
        version: "0.4.3",
        date: "2026-09-27",
        title: "Chloe's Velvet Boutique",
        summary: "A cat-maid couturier and a 3D try-on studio in the lounge.",
        changes: {
          features: [
            "Chloe the cat maid and her gilded cheval mirror open the wardrobe at the Velvet Boutique.",
            "A 360-degree studio turntable: try anything on before you buy it, with a live bill.",
            "The Velvet Pioneer set (Pioneer Cap, Blueprint Overalls and a gold BETA TESTER title), free for beta players for two weeks.",
          ],
          economy: ["The wardrobe in Common (120-200), Rare (450-800) and Prestige (1,500-2,500) bands."],
        },
      },
      {
        version: "0.4.4",
        date: "2026-09-27",
        title: "Economy Fine-Tune",
        summary: "Payouts tuned to the new baseline.",
        changes: {
          economy: ["Chopping, the daily checklist and hang-out payouts matched to the v3 baseline."],
          fixes: ["The client's version bumped for the ecosystem release."],
        },
      },
    ],
  },
  {
    era: 5,
    name: "The Casino Definitive Remaster",
    range: "v0.5.0 – v0.5.3",
    icon: "🎲",
    blurb: "The hall rebuilt in marble and gold, with new games, Texas Hold'em and panels that never scroll.",
    patches: [
      {
        version: "0.5.0",
        date: "2026-09-27",
        title: "Art-Deco Floors & Walls",
        summary: "Marble, gold inlay and warm light from wall to wall.",
        changes: {
          visuals: [
            "Art-Deco marble floors with gold inlay, wainscoted walls, sconces and framed posters.",
            "Warm light baked into the hall's walls and a neon glow on the floor.",
            "The whole hall drawn in about 64 draw calls.",
          ],
        },
      },
      {
        version: "0.5.1",
        date: "2026-09-27",
        title: "Big Six, Baccarat & Darts",
        summary: "Three new games and new corners to linger in.",
        changes: {
          features: [
            "The Big Six wheel: 53 segments, bets from its ledge.",
            "A hall baccarat table with Scarlett.",
            "English pub darts: 501 and Cricket, solo or head to head.",
          ],
          visuals: ["Velvet booths and potted palms round the floor."],
        },
      },
      {
        version: "0.5.2",
        date: "2026-09-27",
        title: "Texas Hold'em",
        summary: "Buy in and play a hand against Boris and the regulars.",
        changes: {
          features: ["Texas Hold'em on the High-Roller Stage: buy in, check, call, raise or fold against the house's players.", "Leaving mid-hand folds it and returns your unbet stack."],
        },
      },
      {
        version: "0.5.3",
        date: "2026-09-27",
        title: "Landscape Tables & a Livelier Crowd",
        summary: "Every table panel fits the screen, and the floor fills with more faces.",
        changes: {
          features: ["Blackjack split hands played each on their own.", "Patrons drop their own chips into the coin pusher."],
          visuals: ["Landscape, zero-scroll panels for every table game.", "Eight kinds of patron on the floor.", "The staff drawn as one skinned mesh each."],
          fixes: ["Models served compressed: the casino loads about four times lighter.", "A connection orb in the header shows your ping and status."],
        },
      },
    ],
  },
  {
    era: 6,
    name: "The Living World & Atmosphere Sync",
    range: "v0.6.0 – v0.6.5",
    icon: "🌦️",
    blurb: "Skies that follow the hour and the weather, a surer step between worlds, and a new heart for the lounge.",
    patches: [
      {
        version: "0.6.0",
        date: "2026-09-27",
        title: "Skies & Weather Sync",
        summary: "The lounge's sky follows the hour and the weather, and the casino gets its stars.",
        changes: {
          features: ["Weather for the lounge, shared by the server: clear skies or rain, chosen from the hour's menu.", "Auto Cycle may bring a shower in, or blow it over, with each new hour."],
          visuals: [
            "An animated sky: pastel cerulean days with drifting clouds, amber-to-violet sunsets and a twinkling midnight starfield.",
            "Rain turns the sky to a slate overcast with streaks falling past the loft.",
            "Light through the lounge's windows: golden by day, deep amber at sunset, a silver moonbeam at night, dim and diffuse in the rain.",
            "Drops run down every pane while it rains, with a soft rain ASMR in the ambience (its own fader in Settings).",
            "The Velvet Casino's backdrop becomes a midnight-indigo starfield over a warm amber horizon.",
          ],
        },
      },
      {
        version: "0.6.1",
        date: "2026-09-27",
        title: "Spawn Sync & Touch Controls",
        summary: "You land on the floor of every world, and phones walk by tapping.",
        changes: {
          fixes: [
            "Server-authoritative spawn points: every trip places you on the new world's floor before the curtain lifts.",
            "A step reported from the world you just left is refused, so nobody arrives floating off the rails.",
            "The avatar, its shadow and the camera snap to the spawn at once.",
            "The on-screen joystick is gone: on touch, tap the floor to walk and tap a seat, prop or person to walk up and use it.",
          ],
        },
      },
      {
        version: "0.6.2",
        date: "2026-09-27",
        title: "The Sunken Living Nook",
        summary: "A new heart for the lounge, plus title badges, resin glue and a proper game board.",
        changes: {
          features: [
            "The Sunken Living Nook: the sectional, the coffee table and the big rug in a conversation pit in the middle of the loft, where everyone arrives.",
            "Chess & checkers on a big landscape board: carved ivory and walnut pieces, glowing moves and captures, player clocks and captured-piece trays.",
            "The wardrobe opens only at the Velvet Boutique: talk to Chloe or her cheval mirror in the lounge.",
          ],
          visuals: ["Titles are micro badges set 4px over the name, both sized to the camera.", "Settings can hide player titles or player names."],
          economy: [
            "Pine Resin takes a slot in the wood carrier.",
            "The workbench's Adhesive Slot: spend one resin to bond a carving (it can't break) or to gild it (+25% Masterwork chance).",
            "Buster buys spare resin for 10 coins each.",
          ],
        },
      },
      {
        version: "0.6.3",
        date: "2026-09-27",
        title: "Patch Notes",
        summary: "The whole history, in the game.",
        changes: {
          features: ["These patch notes: every update since the first lounge, era by era, from Settings."],
        },
      },
      {
        version: "0.6.4",
        date: "2026-09-27",
        title: "A Cozier Lounge & a Smoother Casino",
        summary: "A snugger loft, a casino floor that flows, a master volume, and updates that reload by themselves.",
        changes: {
          features: [
            "Master Volume in Settings: one slider over the music, the ambience and every effect (80% to start).",
            "Two vintage pinball cabinets at the end of Neon Alley's slot row.",
          ],
          visuals: [
            "The Cozy Lounge is a quarter smaller and cozier: the L-shaped sofa and the hearth rug are back in front of the fireplace, with 1.8m walkways round the kitchen island, the chess table and Chloe's corner.",
            "The Big Six wheel moves to the floor's left flank, framing the way into Neon Alley: the entrance from the foyer is wide open.",
            "Neon Alley's obsidian tiles run all the way to the front rail; the Turf Club and the coin pusher step toward it.",
            "Scarlett's baccarat table is turned about: its felt and stools face the middle of the floor, like the blackjack tables.",
            "The way up to Pippin's bar is clear: one booth gone, the pool table moved over, the bar stools tucked in.",
            "Buster's workbench stands back by the pines, leaving a wide path between it and the tipi.",
          ],
          economy: ["Pine Resin is sap, not wood: it rides in its own jar beside the carrier, taking no slots and with no limit."],
          fixes: [
            "Updates reload the Activity by themselves: the page lets go of the room, the renderer and the audio, waits for the server to answer, and comes back with Discord's parameters intact.",
            "A missing script chunk after a deploy reloads the page onto the new build instead of freezing it.",
            "The penthouse's people (Boris, the Baron, the Duchess) no longer float in the night round the hall: each floor draws only its own.",
          ],
        },
      },
      {
        version: "0.6.5",
        date: "2026-09-27",
        title: "The Wardrobe, Re-Tailored",
        summary: "Every outfit rebuilt on its own silhouette, footwear to match, four new looks, and a tidier boutique.",
        changes: {
          features: [
            "Five cuts, each built from scratch: Formal (a jacket over a shirt with 3D lapels, a bow tie or a tie, long trousers, dress shoes), Robe (a robe over the thighs, wide bell sleeves, a knotted sash or obi), Streetwear (a hood down the back, gathered cuffs, baggy joggers, sneakers), Summer (an open collar, short sleeves, knee-length shorts, deck shoes or sandals) and Workwear (thick straps on metal clips, deep pockets, hammer loops, lug-soled work boots).",
            "Every outfit brings its own footwear: oxfords, velvet slippers, spectators, geta, flip-flops, boxing boots, wading boots, garden boots and more.",
            "New: the Starry Night Yukata (midnight silk, silver constellations, a gold obi), the High Roller Pinstripe (double-breasted, six gold buttons, a pocket-watch chain), the Beach Swim Set and Velvet Loungewear.",
            "Each outfit in the boutique is tagged with its cut.",
          ],
          visuals: [
            "The Velvet Evening Tuxedo's satin peaked lapels stand proud of a pleated shirt, with a crimson bow tie and patent oxfords.",
            "The Vintage Smoking Jacket wears a quilted black satin shawl collar and a sash with gold tassels.",
            "The olive tree that stood in front of Chloe and her mirror now grows in the kitchen's railing corner.",
          ],
          economy: [
            "Wardrobe bands: Common 120–280, Rare 450–800, Prestige 1,500–3,200 coins.",
            "New prices: Flannel Camp Vest 220, Lumberjack Suspenders 280, Boxing Robe & Shorts 520, River Wader Dungarees 650, Velvet Evening Tuxedo 2,000, Vintage Smoking Jacket 2,400. Anything already bought stays yours.",
          ],
          fixes: ["The boutique's bill shows only while you try on something you don't own yet; what you wear is marked ✓ Wearing in the list."],
        },
      },
    ],
  },
];

/** The newest patch: its version is the client's. */
export const LATEST_PATCH: PatchNote = PATCH_ERAS[PATCH_ERAS.length - 1].patches[PATCH_ERAS[PATCH_ERAS.length - 1].patches.length - 1];
