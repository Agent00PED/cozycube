// CozyCube's patch notes, as the in-game Patch Notes panel shows them (PatchNotesModal): the whole
// history of the Activity in seven eras, from the first lounge to the living, weathered world, each
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
  /** 1 to 7. */
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
    range: "v0.6.0 – v0.6.15",
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
      {
        version: "0.6.6",
        date: "2026-09-27",
        title: "Three Lounges & a Playable Arcade",
        summary: "Pick your lounge, flip real pinball, feed a coin pusher that pushes real coins, and find the casino floor opened up.",
        changes: {
          features: [
            "Choose your lounge: every server now has three, Velvet Lounge 01, 02 and 03, each its own evening with its own fire, tables and company (25 guests each). The lobby shows how full each is, your ping, and where the friends playing with you in your call are (👥 Friends Here); Quick Join takes you to them, or else to the liveliest lounge with room. Settings → Switch lounge brings the lobby back.",
            "Velvet Nights Pinball is playable: pop bumpers, slingshots, a bank of drop targets, rollover lanes that raise your multiplier, a plunger you pull and let go, three balls a game and your best score kept. ← / A and → / D flip; on a touch screen tap the left or right half, and drag the plunger down.",
            "The coin pushers push real coins: every coin on the shelf is its own, it rattles down the brass pegs where you drop it, the plate shoves the pile, and whatever goes over the edge into the tray is yours. The shelf is shared and stays as the last player left it.",
            "The gold-trimmed High-Roller Pusher stands beside the house's.",
            "Lucky Reels is played by its lever: grab the handle and pull it down (or press Space).",
          ],
          visuals: [
            "The casino floor, opened up: the hall's baccarat on navy felt with a lit bead road, craps behind velvet ropes with two cocktail tables, leather stools and palms, the emerald booth moved to the right rail so the stage stairs are clear, the Big Six against the stage's left wall, and the pool table out on the open floor with room to walk round it.",
            "Names in Thai, and in every other script, now show properly on the nametags, drawn sharp on high-density screens with room for tone marks.",
            "Chloe's boutique drops its greeting banner, and the bill hides while you look at something you already own.",
          ],
          economy: [
            "The High-Roller Pusher takes 25 to 250 chips a coin; the house's pusher keeps 2 to 25.",
            "Over time a well-aimed pusher coin brings back about 92% of its stake; a wild one down the outer lanes, less.",
          ],
          fixes: [
            "The pub darts board is gone; its wall is the Big Six's now.",
            "Buttons are at least 48 pixels to tap, keyboard hints hide on touch screens, and panels keep clear of notches and Discord's overlays.",
            "Sound starts the moment you pick a lounge.",
          ],
        },
      },
      {
        version: "0.6.7",
        date: "2026-09-28",
        title: "No More Stuck Doors",
        summary: "Updates and server restarts reconnect you in place, without ever reloading the Activity.",
        changes: {
          features: [
            "When the lounge's server restarts, a velvet curtain reads \"Updating CozyCube to latest patch... Reconnecting\" and you're put straight back into the same lounge, with no lobby and no reload.",
            "When an update brings new features, a card says so and a Close Activity button closes it for you: start CozyCube again from your voice channel to get them.",
          ],
          fixes: [
            "Updates no longer end on \"Couldn't reach Discord: Timed out waiting for Discord SDK handshake\": the Activity never reloads itself, and your Discord login is kept in memory.",
            "Settings → Switch lounge takes you back to the lobby at once, without a reload.",
            "The loading screen's Try again logs in again without reloading, with a Close Activity button if Discord never answers.",
          ],
        },
      },
      {
        version: "0.6.8",
        date: "2026-09-28",
        title: "Pinball for Chips & a Cozier Welcome",
        summary: "Velvet Nights plays for chips in a snug arcade cabinet, the pool table moves up by the Big Six, the coin pusher's coins tumble for real, and the lobby and Patch Notes put on CozyCube's warm paper.",
        changes: {
          features: [
            "Velvet Nights pinball is played for chips: pick a credit of 10, 25, 50 or 100 and pull the plunger for three balls. Score 3,000 for your stake back, 5,000 for 1.5x, 10,000 for 2.5x and 20,000 or more for the 5x Jackpot.",
            "The pinball panel is now a compact arcade cabinet: the playfield on the left, your stake, score, payout tiers and the plunger on the right.",
          ],
          visuals: [
            "The 8-ball table now stands on the Velvet Lounge's oak parquet, in front of the Big Six wheel.",
            "The velvet ropes round craps are gone, and roulette and craps sit a little closer to the blackjack tables: an open, balanced floor.",
            "Coins dropped into the pusher tumble down the brass pegs as spinning discs (no more thin slivers), and they tip face-on as they fall into the tray.",
            "The pusher's plate glides in a smooth sine stroke, and the coins it shoves slide on a little before settling.",
            "The lounge selector and the Patch Notes wear CozyCube's own warm cream paper and rounded letters, the selector over the Starlight Campfire at night.",
          ],
          economy: [
            "A pinball game is scored on the server, which replays your flips and launches, so every payout is earned. A steady game about breaks even, and great ones win big.",
          ],
          fixes: [
            "Closing the pinball cabinet mid-game ends the game there, paid on the score so far.",
          ],
        },
      },
      {
        version: "0.6.9",
        date: "2026-09-28",
        title: "The Living Campfire & the Whispering Woods",
        summary: "The campfire keeps its own 24-minute day, a branch archway opens onto the Whispering Woods, a slingshot gallery sets up along the fence, and felling, fishing and the menus all get a cozy new coat.",
        changes: {
          features: [
            "The Whispering Woods: walk through the branch archway at the campfire's west fence with a Day Trip Permit (200 coins, one trip in) or the Ranger's Badge (3,800 coins, for good), both from Buster.",
            "Fell twenty trees in five tiers: Soft Pine, Silver Birch, Highland Cedar, Autumn Maple and the Whispering Elderwood in its ring of standing stones. Three notches in the green bring one down; it grows back from a stump, a sprout and a sapling.",
            "The tree you're next to glows with a soft outline: click it, tap it or press E to fell it. Each tier needs an axe of its tier or better.",
            "Bramble the Bear keeps a trading post in the woods: he buys your logs and fish, and sells the Golden Felling and Runic Elderwood axes and the Starlight and Moonlight rods.",
            "Fish the woods' rapids from the bank: the wild waters hold their own legendaries and mythics.",
            "Thirty freshwater fish now, fifteen that bite by day and fifteen by night, from Common to Mythic.",
            "The Whispering Pines Slingshot Gallery: 45 seconds and 15 stones against tin cans, ducks and owls. Drag back on the sling to aim (dots show the flight), build a combo up to x4, and hit the Golden Acorn for 15 coins on the spot.",
            "The splitting blocks (by the campfire's woodpile and in the woods) split your logs into Firewood bundles in one go: each feeds the bonfire 10%.",
            "Put a fish and a log in the Dutch oven for a Campfire Stew: when it's done, everyone is Well-Fed at once.",
            "The Backpack (B, or the 🎒 in the header): your wood, fish and tools, and the Nature Logbook with a silhouette for every fish and tree you haven't found yet.",
            "The canoe seats two, a marshmallow on a stick comes to hand when you sit by the fire, and anyone lying in the hammock or a tent dozes with a drift of Zzz.",
          ],
          visuals: [
            "The campfire and the woods keep their own 24-minute day: twelve minutes of sun and twelve of stars, the light, fog and sky easing through dawn and dusk.",
            "The firepit is an intimate horseshoe round a braided rug, open to the tents, with floor cushions, a kettle on its stump and a guitar leaning by the logs.",
            "Trees between you and the camera thin to let you through.",
            "Reeling in, you only see the fish's shadow on the line: what it is waits until it's landed, then it turns on a stand with its weight.",
            "Every panel, the lobby and the patch notes wear a dark cozy look: roasted cocoa, oak cards and amber embers.",
            "Birdsong by day, crickets and an owl by night, and a woodpecker in the woods.",
          ],
          economy: [
            "Axes and rods go up to tier five (Buster and Barnaby sell up to tier three), carriers hold up to 300 logs and livewells up to 200 fish.",
            "The slingshot gallery pays 12, 28 or 60 coins by score (the top tier also brings the Eagle Eye: a wider green for ten minutes), for six paid rounds an hour.",
            "Sell All Logs and Sell All Fish at Buster's, Barnaby's and Bramble's, at the hour's market prices.",
            "The penthouse takes a Velvet VIP Wristband (600 coins, one visit) or The Black Card (6,500 coins, for good).",
          ],
          fixes: [
            "Switch lounge counts you in your own lounge and marks it Current.",
            "Nametags draw crisp at twice the resolution on every screen.",
          ],
        },
      },
      {
        version: "0.6.10",
        date: "2026-09-28",
        title: "Living Wonders & the Radial Felling",
        summary: "Every Discord server now shares the same three lounges, trees come down round by round on a new radial dial, the woods get a winding river, the slingshot fires in a flash, and a Colossal Titan or a King-Size Surge can turn up for everyone.",
        changes: {
          features: [
            "The three Velvet Lounges are open to every Discord server at once: meet players from other communities. Each lounge holds 15, and a full one shows [ FULL ].",
            "Precision Radial Felling: a round dial over the trunk's rings, a ring closing in from the bark. Swing when it meets the gold (Space, a click, or the big CHOP button on a phone). Bigger trees take more rounds, the dial stays open between them, and the notch stays in the tree if you step away.",
            "Every round that lands drops a log (or bark, resin and shavings from the tougher trees), and a big tree's logs are worth more: size squared.",
            "Eight Soft Pines round the campfire's clearing to fell, each its own size, growing back from their stumps.",
            "Living wonders, shared by everyone in the lounge: a King-Size Fish Surge (golden ripples where 4 in 10 hand-reeled catches are King Size, worth 2.5x) or a Colossal Titan maple in the woods (any axe, 5-6 rounds, heavy logs worth 3x).",
            "Fish by hand or feet up at every spot: [ 🎣 Manual Reel ] or [ ☕ Auto AFK ], at the campfire's dock and on the woods' river bank, standing or on its log or boulder.",
            "AFK fishing is quicker: a common every 12-16 seconds, a mythic in 75-90, and premium bait a quarter faster. It stops by itself with a gentle notice when your livewell is full.",
            "The Logbook's Day and Night pages crown your King Size records, the Ocean page waits for the beach, and the new Timber Collection keeps each tree's story, your widest trunk, your count and your best log sale.",
            "Buster buys Firewood bundles at 5 coins each.",
          ],
          visuals: [
            "The Whispering Woods' groves blend into one another naturally, a meandering river winds through them and spills off the island, and Bramble's cabin sits snug against the eastern pines.",
            "The campfire is back to nature: river stones, raw logs and boulders round the fire, and the archway into the woods now stands at the head of the north path beside Buster.",
            "Walking into the woods: a cocoa-dark fog, a glowing pine and \"Entering the Whispering Woods...\".",
            "The slingshot gallery is a cozy carnival booth: paper lanterns, painted wooden targets, a crosshair, and every shot a flash and a pop.",
          ],
          economy: [
            "Wood carriers hold 8, 18, 35, 60 or 100 and livewells 5, 12, 25, 45 or 70. Anything you already carry is kept: new catches and logs just wait until there's room.",
            "The slingshot's prizes are set for instant shots: 1,500, 3,000 and 5,000 points.",
          ],
          fixes: [
            "The fishing reel's catch bar fills exactly with the number beside it.",
          ],
        },
      },
      {
        version: "0.6.11",
        date: "2026-09-28",
        title: "Drawers, Finley & the Forest's Gifts",
        summary: "Your wood and your fish each get a drawer of their own, Finley the river otter sets up shop in the woods, every tree tier leaves a little gift behind, and nobody vanishes behind a tree any more.",
        changes: {
          features: [
            "Two drawers instead of a backpack: the 🪵 gauge opens your wood (every log and its size, the by-products, Firewood, resin, carvings, your axe's stats) and the 🪣 gauge your fish (length, weight, stars, your rod, your baits, the livewell's room), on every map. B reopens whichever you had open last.",
            "📖 Timber Collection and 📖 Fish Collection open from their drawers: the trees' lore and your records, and the Day, Night and Ocean pages.",
            "Meet Finley the river otter, fishing from his boulder on the woods' river: he buys every fish and sells rods up to tier five, livewells and every bait pack.",
            "Five bait packs: Earthworms, Sweet Corn Dough, Glow-Crickets (at their best by night), Dragonfly Larva and Stardust Pellets.",
            "Bramble is the woods' forester now: logs, Firewood and by-products bought, every axe from tier one to five and the wood carriers sold, with the advanced workbench right beside his counter.",
            "A felling round that brings no log leaves its tree's gift instead: Birch Bark, Amber Resin, Golden Leaf Amber from the maples and the Titan, or Ancient Wood Shavings from the Elderwood.",
            "The living wonders take turns: a King-Size Surge, then a Colossal Titan that stands until someone fells it (even across a server restart), each announced to the whole room.",
          ],
          visuals: [
            "A tree between you and the camera thins to a light 30% screen, and your silhouette glows warm through it: no more vanishing into the pines.",
            "The Whispering Woods: songbirds on the pines' lower boughs that scatter when you walk up, butterflies over the meadows by day, fireflies along the riverbanks by evening, and birches and cedars lining the trail to Bramble's cabin.",
            "The fairy rings are gone: a Colossal Titan rises from plain grass in its clearing.",
            "The campfire is tidier: the little A-frame tent is gone (the tipi stays), the splitting block stands on open grass in front of the camper van, and wild mushrooms and berry bushes grow among the roots and the fence's corners.",
          ],
          economy: [
            "By-products sell to Buster or Bramble: Birch Bark 2, Amber Resin 5, Golden Leaf Amber 12 and Ancient Wood Shavings 30 coins, or the shavings feed the bonfire 15%.",
            "The slingshot's prizes are back to 800 (12 coins), 1,800 (28 coins) and 3,000 points (60 coins and the Eagle Eye).",
          ],
          fixes: [
            "The Deerskin Grip Gloves' bonus log drops again on the radial felling.",
          ],
        },
      },
      {
        version: "0.6.12",
        date: "2026-09-28",
        title: "Gear Slots, Fish Locks & Tidy Counters",
        summary: "Twelve new pieces of gear worn in four slots, a lock for your favourite fish, shop counters with Sell All always in reach, matching drawers for wood and fish, and a more natural campfire and woods.",
        changes: {
          features: [
            "Gear slots: hands, waist, two rings and a charm. Twelve pieces, six for the woodcutter and six for the angler, all mixable; a new piece goes straight on, and a third ring takes the oldest one's place. Swap them any time from either drawer's gear tab.",
            "Woodcutter's gear (Buster up to tier 3, Bramble every tier): Amber Resin Band, Deerskin Felling Gloves, Forester's Toolbelt, Ancient Ring of Oak, Dryad's Sprout Amulet and the Titan-Grip Gauntlets.",
            "Angler's gear (Barnaby up to tier 3, Finley every tier): Sunburst River Band, Neoprene Wader Gloves, Tackle Master's Holster, Moonlit Abyssal Ring, Golden Scale Ring and Finley's Lucky Bell, which chimes 30 seconds before a King-Size Surge.",
            "Lock your favourite fish: tap 🔓 on its card in the livewell or at the shop. A locked fish gets an amber frame, Sell All passes it by, and it stays out of the stew.",
            "Every shop has the same counter: the tabs on top, Sell All right under them (no scrolling), one list that scrolls, and the hour's market clock with the Field Guide or Timber Collection at the foot.",
            "The wood drawer matches the fish drawer: two-column cards (trunk, size, stars and worth for each wood) in Timber, Byproducts, Crafts & Fuel and Axe & Gear tabs.",
          ],
          visuals: [
            "The campfire's west pines are staggered in size and spacing, with a wide open walk from the tipi to the slingshot gallery and the picnic table, lined with river stones, mushrooms and berry bushes; wildflowers and a berry shrub by the telescope.",
            "The Whispering Woods: an open clearing in front of Bramble's counter and workbench, a birch grove spaced as it would grow, trees round the archway's meadow, and a Titan clearing on the Cedar Ridge instead.",
          ],
          economy: [
            "The retired Canvas Work Gloves, Traction Boots and Leather Apron are paid back in full; the Deerskin gloves carry over and go straight on.",
          ],
          fixes: [
            "Locking fish, switching rods, bait and axes, and changing gear now work from the drawers on every map, not only at the camp.",
            "The fish drawer no longer lists rod-switch buttons (switch rods at the shops), and the wood drawer no longer shows fire-fuel previews.",
          ],
        },
      },
      {
        version: "0.6.13",
        date: "2026-09-28",
        title: "The Workbench Matrix & a Fairer Market",
        summary: "Fifteen workbench recipes with a material filter, a rebalanced market with a next-hour forecast on two chalkboards, cleaner shops and drawers, AFK fishing that uses your bait, a true radial notch in the felling, and E for everything.",
        changes: {
          features: [
            "The workbench has fifteen recipes to filter by material: Soft Pine, Birch, Cedar, Maple, Elderwood, and Resins & Byproducts. They use logs, Firewood, Pine Resin and the felling's by-products, from a Rustic Camp Stool to the Elderwood Grand Clock (1,650 coins).",
            "Made once, for good: the Marshmallow Roasting Stick (sit on a log bench by the fire and there's a marshmallow on it), the Lumberjack Pack Frame (+5 carrier slots) and the Reinforced Tackle Box (+3 livewell slots).",
            "A Resin Amber Torch in your crate lights your way: 10% quicker at the camp by night. Burn Forest Whisper Incense at the bonfire and rare fish bite 20% more for everyone in the room for 10 minutes.",
            "Carved pieces stack in their own crate (up to 99 of a kind) and no longer take up wood carrier slots.",
            "E does the best thing in reach: talk to a keeper, then use a station, then a tree or the water, then a seat. It never fires while you're typing or have a panel open, and the action it will take wears an E.",
            "AFK fishing uses the bait on your hook, one per catch, with its full speed and rarity; when it runs out, the line carries on unbaited and tells you so.",
            "A legendary or mythic fish comes up locked (🔒 Auto-Locked), safe from Sell All.",
            "Buster has his own chalkboard now, and both boards chalk up a forecast: the good most in demand next hour.",
          ],
          visuals: [
            "The shops lose the speech bubble: title and tabs on top, the list in the middle, and Sell All pinned to the bottom on the Trade/Sell tab only. Every price button and lock lines up in its column; the keeper's answer pops up for a moment.",
            "The wood and fish drawers keep one fixed size across every tab, and each fish and log shows this hour's price against its base (+16% ▲, -10% ▼).",
            "Felling cuts a true radial notch through the bark, deepening to 70% of the trunk on the last round. On a phone, tap anywhere to swing (no CHOP button).",
            "The Whispering Woods: the deer wanders its trail and the rabbits hop about, ferns grow at the trees' feet and berry bushes along the trail, and the trail birch by Bramble's cabin stepped aside so the Soft Pine behind it shows.",
            "The campfire's western lawn has more berry shrubs, mossy river stones and mushrooms at every pine's roots.",
          ],
          economy: [
            "Fish are worth far more: commons 5-8 coins, uncommons 28-40, rares 75-110, legendaries 380-480, mythics 1,500-1,800.",
            "Timber, per 1x log: Soft Pine 4, Birch 12, Cedar 32, Maple 80, Elderwood 290 (bigger trees still worth more). Golden Leaf Amber 15, Ancient Wood Shavings 35.",
            "Firewood sells for 2 coins a bundle: it's for the bonfire now, not a profit loop.",
            "The Black Card is 7,500 coins (pawned for 3,750); the wristband stays 600.",
            "Chloe's outfits are the wardrobe's big goal: everyday and rare sets 1,200-2,500 coins, prestige sets 3,500-6,000. Hats and hair keep their prices.",
          ],
          fixes: [
            "The shops' and the workbench's price buttons no longer wrap onto two lines.",
          ],
        },
      },
      {
        version: "0.6.14",
        date: "2026-09-28",
        title: "The Clean Split & a Living Wood",
        summary: "A rhythm game at the splitting block, a tidier workbench, wild rabbits, squirrels and deer on both camp maps, curved ferns and mossy stones, Buster's board moved out of the way, and a snappier slingshot gallery.",
        changes: {
          features: [
            "The splitting block is a rhythm game now: a log stands on the block and the axe is raised while a marker glides up and down a gauge. Strike (Space, a click or a tap) on its golden sweet spot. Hit the gold for a thunderous clean split of 3-5 logs and a bonus bundle of Firewood; the sweet spot splits two; anywhere else the axe glances off, so strike again. Clean strikes in a row quicken the gauge.",
            "Carrying more than 15 logs? Bulk Process All splits the whole carrier at once, at the plain yield (no clean-split bonuses).",
            "Wild rabbits, red squirrels and dappled does now roam the campfire and the Whispering Woods. They amble and hop about their own patch, stop to sniff the air and nibble the grass, and bolt if anyone comes within 3 m. The squirrels curl up in their dreys at night.",
          ],
          visuals: [
            "The workbench is decluttered: just its title on top, the materials in a swipeable carousel (a mouse wheel scrolls it sideways), the recipes, and a slim footer with the Mode (🛡️ Safe / 🔥 Push) and Resin (🍯 None / Bond / Gild) dropdowns.",
            "Buster's chalkboard now stands behind his stall by the log rack, against the pines, facing the path to the archway. The way to Buster and the workbench is clear.",
            "Curved ferns grow at the pines' feet on both maps, mossy stones line the campfire's river and the woods' banks, and red mushroom patches cluster round the woods' tree roots.",
            "Slingshot gallery: a struck target springs and wobbles on its peg before it drops, a big bouncy score (+150) floats up, and every hit lands with a crisp wooden knock.",
          ],
          fixes: [
            "The gallery's bullseye no longer flickers or clips through the rails and hay: it's one target board on two posts behind the bales.",
            "On a touch screen the gallery's targets are 15% easier to hit, for a fingertip's blunter aim.",
          ],
        },
      },
      {
        version: "0.6.15",
        date: "2026-09-28",
        title: "Time-to-Earn & the Penthouse Restaged",
        summary: "A real-time economy: prices tuned to the minutes they take, a supply-and-demand market, rod-by-rod fishing odds and boss fish, harvesting fatigue against lounge-hopping, pouches that grow with your carrier, a 12-slot craft stash, ten new workbench recipes, and a restaged penthouse with a blackjack table and twin Golden Vaults.",
        changes: {
          features: [
            "Harvesting fatigue: fell an Autumn Maple, a Whispering Elderwood or a Colossal Titan in one lounge and you can't fell another in a different lounge for 8, 15 or 45 minutes. In the lounge where you felled it, nothing changes.",
            "What bites now depends on your rod and on how you fish. Reeling by hand, a T1 rod lands commons with the odd uncommon, and a T5 lands rare fish 38% of the time, legendaries 12% and mythics 3% in the Whispering Woods' rapids. An AFK line brings in only commons without bait. With bait it gets up to 2% legendaries on a T5, never a mythic: if one ever bites, the line snaps.",
            "Legendary and mythic fish are boss fights: a green 60% smaller, fake runs and thrashing. Every rod has a tension window before the line starts to strain, from 0.8 s (T1) to 1.8 s (T5).",
            "Ten new workbench recipes, under new Relics, Consumables and Trade Goods filters. Passive Relics are carved once and worn in a gear slot: the Lumberjack's Carved Belt (+6 carrier slots, a slower splitting gauge), the Otter-Carved Hook Charm (steadier on boss fish) and the Amber Bark Bangle (+20% by-products). Consumables: a Campfire S'more (+15% walking pace), Pine Pitch Grip Wax (a bigger gold sweet spot) and a Herbal Scent Pouch (quick commons). Trade goods: the Whittled Forest Diorama, the Carved Cedar Wall Clock, the Grand Maple Rocking Chair and the Elder Runic Totem.",
            "Fish Scales: a landed fish sheds one now and then, for the Hook Charm's inlay.",
            "The craft stash: 12 slots of up to 99 each, in the wood drawer's Crafts & Fuel tab, where you use your consumables.",
            "The Velvet Penthouse gets a new blackjack table in its southern lounge (Gideon dealing, three stools, 1,000 to 25,000), and a second Golden Vault beside the first against the western glass.",
          ],
          visuals: [
            "The penthouse's baccarat table is turned round: Scarlett deals facing the elevator and the room, and the players sit on its curve facing her. A little Art-Deco jukebox glows beside the twin vaults.",
            "Your consumables' buffs show as slim pills under the header, counting down.",
            "The wood drawer's Byproducts tab shows how full your pouches are.",
          ],
          economy: [
            "Fish base prices: commons 4 coins, uncommons 18, rares 70, legendaries 380-420, mythics 1,500. An AFK line waits longer (a common every 44-58 s): about 4-6 coins a minute on a starter rod, several times that by hand.",
            "Timber, per 1x log: Soft Pine 4, Birch 9, Cedar 20, Maple 48, Elderwood 120. A Colossal Titan's heavy logs are worth 750 together. Firewood stays at 2 coins a bundle.",
            "Supply and demand: every price moves between 70% and 130% of its base. Past 30 of a kind sold in your lounge in an hour, each sale knocks 2% off the next; anything left unsold, burned or carved opens the next hour 3% higher. The chalkboards forecast the climber.",
            "Tools: T2 250, T3 850, T4 2,400, T5 6,000 (rods and axes). Storage: T2 300, T3 950, T4 2,600, T5 6,500 (carriers and livewells).",
            "The pouches (by-products, resin and sawdust) grow with your wood carrier: 30, 60, 100, 160 and 250.",
            "The Black Card is 8,500 coins (pawned for 4,250). Chloe's wardrobe: cozy hats from 800, everyday outfits about 2,200, rare archetypes about 5,500, prestige sets up to 8,000.",
          ],
          fixes: [
            "The penthouse's walk-up seating now reaches its poker and baccarat seats.",
          ],
        },
      },
    ],
  },
  {
    era: 7,
    name: "Fight Nights at the Velvet Ring",
    range: "v0.7.0–v0.7.32",
    icon: "🥊",
    blurb: "A vintage boxing hall with a raised canvas, a social brawler judged by the server, ringside betting, and a joystick for every touch screen.",
    patches: [
      {
        version: "0.7.0",
        date: "2026-09-29",
        title: "The Velvet Ring",
        summary: "The Boxing Gym becomes the Velvet Ring: a brick-and-parquet fight hall with a raised canvas under a dome lamp, a server-judged brawler of jabs, hooks, guards, parries and slips, knockdowns and the ten-count, ringside betting on the chalkboard, Coach Bruno's pro shop, the Velvet Championship Belt, and a floating joystick on every map.",
        changes: {
          features: [
            "The Velvet Ring is open on the fast-travel grid: step up the Red or Blue corner's steps to fight. When both corners are filled, a 20-second warm-up opens the betting, then the bell: up to three 45-second rounds.",
            "Two gauges: Stamina (swings and the guard spend it, it comes back fast; swing with too little and your punches go slow and soft) and Composure (a clean punch takes it away, and it doesn't come back during a round).",
            "Jab (quick, cheap, and it knocks a Heavy Hook out of its wind-up), Heavy Hook (hard, drives them toward the ropes), Guard (75% less damage; raise it just as a punch lands for a Perfect Parry, a golden flash, and a free Counter Uppercut), and Sway (a slip that nothing touches).",
            "Knockdowns: at zero composure you hit the canvas and Coach Bruno counts to ten. Mash to get up (the second knockdown is much harder to beat); a third is a T.K.O.",
            "Ring-Outs: with little composure left and your back on the ropes, one Heavy Hook sends you through them.",
            "Ringside betting at the chalkboard in the lounge: back Red or Blue during the warm-up, pari-mutuel, with the live odds chalked up for the room.",
            "Coach Bruno's pro shop: the Tiger Stripe Mitts, your record, the belt and the rules of the ring. The heavy bag, the speed bag and the balance-beam scale in the gym are yours to use.",
            "The Velvet Championship Belt: win three bouts in a row and it shines over your name for 24 hours.",
            "A floating joystick on every map on phones and tablets: put your thumb down in the screen's lower left and drag. A tap there still walks you to the spot or up to a seat or a prop.",
            "In the ring on a touch screen: a combat cluster at the bottom right (Jab, and round it Block, Heavy Hook and Dodge, each with its cooldown sweeping round it). On a keyboard and mouse: left click Jab, right click Heavy Hook, Space Guard, R with WASD to Sway.",
          ],
          visuals: [
            "Warm red brick over oak wainscoting, steel sash windows onto a starry night, burgundy velvet drapes, aged herringbone parquet and black-and-white tiles, and a yellow neon THE VELVET RING over the lockers.",
            "A cream canvas with a faded gold star, padded Red, Blue and neutral corners, ropes that bow and spring back when a fighter is driven into them, and the dome lamp's beam with chalk dust drifting through it.",
            "Boxing gloves on your hands in the ring, a fighter's stance, guards, punches and slips, stars when you're stunned, and a flat-out fall on the canvas.",
            "Coach Bruno, the casino's bouncer by night, in his burgundy hoodie with a whistle and a mouthguard: he calls every round and every count.",
            "A ringside crowd that roars at the big punches, the timekeeper's bell, and a thud for every jab and hook.",
          ],
          economy: [
            "A win pays a 30-coin purse (six purses an hour).",
            "Bets are 50 to 300 coins, one ticket a bout. Winners share the losers' pool; the house keeps 5% of the winnings.",
            "The Tiger Stripe Mitts: 850 coins at Coach Bruno's, and every jab costs 10% less stamina. The Classic Red Gloves are free.",
          ],
          fixes: [
            "Fair fights: a bout decided in under 15 seconds, or one whose loser never threw a punch, is a No Contest. Nothing is paid and every ticket comes back.",
            "A fighter whose connection drops mid-bout has 5 seconds to come back while the bout waits; after that it's a forfeit. A server restart mid-bout is a No Contest.",
            "Spectators can't walk onto the canvas: only fighters stepping in at the corners can.",
            "Other players no longer overshoot on your screen when the server moves them in a single step.",
          ],
        },
      },
      {
        version: "0.7.1",
        date: "2026-09-29",
        title: "Untitled Fight Night",
        summary: "The Velvet Ring fights like Untitled Boxing Game: no cooldowns, only stamina, a three-punch string, a telegraphed Heavy Smash you can feint, dashes and Perfect Dodges, a guard that breaks; King of the Hill in the ring; a new animation suite, a low ringside action camera, an arcade HUD and multi-touch controls.",
        changes: {
          features: [
            "King of the Hill: step up to a corner to get in line. The winner stays on in their corner, patched up to full, and the next in line steps in against them; the loser is walked to the bleachers. The champion can Step Down between bouts.",
            "No more cooldowns: every move is gated by stamina, its own frames and a short input buffer. Run your stamina dry and you're Exhausted until it's back to 25: no dash, no guard, slow hands.",
            "M1 (left click) is a three-punch string: the Snap Jab, the Corkscrew Straight and the Leaping Lead Hook. Thrown on the beat, it's a true combo.",
            "M2 (right click) is the Heavy Smash: a big telegraphed wind-up, a crushing overhand and heavy knockback. Raise your guard in its first 0.15 s to Feint.",
            "Guard (hold F or Shift) takes 80% off every punch, and its meter takes the chip damage: at zero it's a Guard Break, gloves flung wide and dazed.",
            "Dash (Space with WASD): slip left or right, sway back, or step in. Dash just as a punch lands for a Perfect Dodge: they whiff and stagger, and your next punch is a Counter (x1.4).",
            "Health replaces Composure, and rounds are 90 seconds. The countdown before the bell (and the betting window) is 15 seconds.",
            "On phones and tablets: a new combat cluster (the big M1, M2 above it, Dash to its left, Block under it). It squeezes when pressed, dims when you're out of stamina, and never fights the joystick for your thumbs.",
            "Every fight sound has a synthesized stand-in, so the ring is never silent, even where no recorded sample ships.",
          ],
          visuals: [
            "A new boxing animation suite: the peek-a-boo stance with its heel-toe bounce, a low Ring Shuffle, snappy punches with real wind-ups, the High Shell, slips and sways, flinches and whiplash, a Guard Break's daze, a knockdown sprawl and a push-up back to your feet, and a victory pose for the one who stays.",
            "A ringside action camera for the two fighters: low, side on and tracking the pair, tightening in an exchange, shaking with every clean hit, and freezing a beat on impact. Perfect Dodges get a slow-mo pulse and a flash.",
            "An arcade fight HUD: portraits, health, stamina and guard bars, the clock and knockdown pips across the top, comic badges in the middle, and a stamina arc under your feet. Spectators get a compact banner under the header.",
            "Classic gloves now come in your corner's colour: red or blue.",
            "The Heavy Smash's wind-up shimmers the air round your rear glove; sweat flies off a snapped head and a spark flashes where a punch lands.",
          ],
          economy: [
            "The Tiger Stripe Mitts now make every M1 10% cheaper.",
          ],
          fixes: [
            "The wood carrier and livewell gauges show only where you gather (the campfire, the woods, the beach), not in the lounge, the casino or the ring. B follows suit.",
            "A fighter in a live bout has the whole top of the screen: the header fades away and comes back when the bout ends.",
            "A No Contest never costs the fighter still standing: they keep the ring.",
          ],
        },
      },
      {
        version: "0.7.2",
        date: "2026-09-29",
        title: "Sparring Night",
        summary: "Bouts are best of three rounds, the guard stays up as long as you hold it, and Jimmy the Slugger spars anyone in a free ring. A new floating joystick on every map, a combat cluster sized to your screen, and a ringside camera that always shows the whole ring.",
        changes: {
          features: [
            "Best of three: a K.O., a T.K.O., a Ring-Out or the judges' card wins a round. Both fighters go back to their corners patched up to full for the next one, and the first to two rounds takes the bout.",
            "Jimmy the Slugger waits by the Blue Corner's steps: spar him at Rookie, Contender or Champion. A whole bout with no purse, no record and no bets. The fighter waiting alone in the ring can call him in too.",
            "The guard stays up for as long as you hold it: it only drops when you let go, your stamina runs dry or it breaks.",
            "A new floating joystick on every map for phones and tablets: put your thumb down anywhere in the lower left and it appears right there. Drag past the rim and it follows your thumb, and it always steers the way you push on screen, whatever the camera.",
          ],
          visuals: [
            "A cyan aura shows a raised guard, M1s leave a white trail, and a dash leaves a ghost behind for a moment.",
            "Round pips on the fight HUD and a ROUND N... FIGHT! banner at every bell.",
            "The ringside camera sits a little lower and wider: the whole canvas, the ropes, the steps and the apron always stay in view, from a phone to a 4:3 tablet.",
            "New regulars at the Velvet Ring: two fans on the bleachers who clap along, and Kip the kangaroo working the heavy bag all night.",
          ],
          fixes: [
            "The touch combat cluster is sized to your screen, and the key hints on a PC fold into a small capsule that fades four seconds after the first bell.",
            "The guard no longer drops by itself partway through a hold.",
          ],
        },
      },
      {
        version: "0.7.3",
        date: "2026-09-29",
        title: "Ref Barnaby's Ring",
        summary: "Real boxer footwork in the ring, a referee who counts and raises the winner's arm, a crowd that fills the bleachers on fight night, and a towel you can throw in from any device.",
        changes: {
          features: [
            "Boxer footwork: in a bout you stay squared up to your opponent whichever way you move. Step in with a shuffle, back-pedal away, and circle left or right with side-steps. Your stride now matches how fast you're actually moving, so your feet no longer slide.",
            "Meet Ref Barnaby, the Velvet Ring's referee. He walks the apron through each round with his eyes on the action, rushes in to count a knockdown with his arm, and at the end raises the winner's arm and waves the bout off.",
            "Fight night: five more fans fill the bleachers when a bout starts. They clap, gasp at a Heavy Smash and cheer a knockdown, then drift off when it's over. Between bouts the regulars doze.",
            "Throw in the Towel works everywhere: tap the button (or press T), then confirm. You concede the bout by T.K.O. on the spot and walk out of the ring, even mid-spar or while you're down.",
            "A young pug now skips rope in front of new gym mirrors on the north wall.",
          ],
          fixes: [
            "Jimmy the Slugger no longer sinks through the ring on his way home. He walks to his corner, ducks through the ropes and goes down the steps, and climbs in the same way.",
            "Turning while you walk is snappier outside the ring.",
          ],
        },
      },
      {
        version: "0.7.4",
        date: "2026-09-29",
        title: "The Workshop Retrofit",
        summary: "A rebuilt workbench with seventeen recipes in four tabs, four kinds of Colossal tree to fell together, trickier high-tier trees, fairer boss fish, and every old item carried over safely.",
        changes: {
          features: [
            "The workbench has four tabs: 🎣 Tackles, 🧪 Consumables, 🧿 Relics and 🪑 Furniture. Each tab shows how many of its recipes you can make right now.",
            "Tackles are made once and work whenever you fish or fell: the Whittled Otter Float (quicker bites), the Resin-Weighted Sinker (a bigger green bar), the Braided Silk Line (slower tension), the Wedge & Mallet Kit (Wood Knots never deflect your axe) and the Titan Felling Lever (your rounds on a Colossal count 1.5x toward your share).",
            "New consumables: Silverwood Sap Ointment (a slower felling ring) and Glow-Spore Chum (quicker bites and better rare odds), alongside the S'more, Grip Wax and Scent Pouch.",
            "Three relics, one of each, worn in a gear slot: the Carved Lumberjack Belt (+8 carrier slots), the Deepriver Fisherman Ring (+6 livewell slots) and the Heartwood Compass, which chimes when a Colossal rises and points the way to it under the header.",
            "Four Colossals now rise in the Whispering Woods: the Silver Birch (15-20 birch logs and 4-6 Silver Bark), the Ancient Cedar (14-18 cedar logs and 3-5 Pine Resin), the Autumn Maple (Golden Leaf Amber every round) and the rare Primordial Elderwood (elderwood logs and 1-2 Titan Heartwood).",
            "Fell a Colossal together: everyone who lands a round shares the haul, split by the rounds each of you landed.",
            "Items from the old workbench keep working. Buster and Bramble trade them in for their full listed price (a Masterwork at its Masterwork price), and trade in the two old relics for every material they took.",
          ],
          visuals: [
            "Each Colossal has its own aura: silver, mossy green, a storm of golden leaves or a deep azure glow, on the tree and around its trunk in the felling panel.",
            "A boss fish's fake runs are telegraphed: a ❗ flashes over it and the reel's column pulses red 0.3 s before it lunges.",
            "Wood Knots show as dark red bands in the felling ring, faint when your axe bites straight through them.",
            "The string of lights by the camper van now hangs from a wooden peg in the pine beside the archway, not from thin air.",
          ],
          economy: [
            "Every rod's tension window is 0.3 s longer (1.1 s on the Bamboo Rod up to 2.1 s on the Mythril Moonlight Rod).",
            "Boss fish are fairer: the green bar is 35% smaller on a legendary and 40% smaller on a mythic, down from 60%.",
            "The Starlight Master Rod's Starlight Dampener slows a boss's darts by 25%. The Mythril Moonlight Rod's Abyssal Tether slows them by 35%, cuts fake runs by 40% and forgives one snap per fight.",
            "Higher-tier trees are trickier: a narrower notch (60 degrees at T1 down to 14 at T5), a pendulum ring at T3, an accelerating ring and a Wood Knot at T4, and a pulsing ring with two knots at T5. A knot strike costs 0.4 s, unless you have a T5 axe or the Wedge & Mallet Kit.",
            "New by-products for your pouches: Silver Bark (15 🪙), Titan Heartwood (150 🪙), Fine Fish Bone (30 🪙, off rare fish and better) and Prismatic Scale (180 🪙, off legendary and mythic fish).",
            "Furniture sells at the hour's market price (70% to 130%). Tackles, relics and consumables are made to use, not to sell.",
          ],
          fixes: [
            "Every saved profile is upgraded safely: rods and axes keep their ids and gain their new perks, the retired Pack Frame, Tackle Box and Roasting Stick come back as their materials, and a letter on your next visit says exactly what changed.",
            "Roasting a marshmallow on a log no longer needs a Roasting Stick: anyone can.",
            "Long notices (like the retrofit letter) show as a card and stay up long enough to read.",
          ],
        },
      },
      {
        version: "0.7.5",
        date: "2026-09-29",
        title: "The Penthouse Promenade",
        summary: "The Velvet Penthouse is rearranged around its champagne tower: the baccarat and blackjack tables now flank it as a matching pair, with room to walk everywhere.",
        changes: {
          features: [
            "The baccarat and blackjack tables flank the champagne tower as mirror images, with a wide promenade from the front rail up to the tower between them.",
            "Walk all the way round the champagne tower: the stools keep well clear of it, and the way from the jukebox to the elevator runs straight past it.",
          ],
          visuals: [
            "Scarlett and Gideon deal from the fountain's side, facing you over their tables.",
            "The high-limit poker table sits a little further back, and the potted palms stand in the corners.",
          ],
          fixes: [
            "The penthouse's blackjack panel closes when you walk away from the table, like the hall's.",
            "Clicking the penthouse's baccarat table lands on the table itself.",
          ],
        },
      },
      {
        version: "0.7.6",
        date: "2026-09-29",
        title: "The Glimmering Caverns",
        summary: "An old mine adit behind the Whispering Woods' maples leads down into the Glimmering Caverns: a two-tier cavern to prospect by hand, an Ancient Forge, a Geode Anvil, a hot-spring onsen and a glowing Grotto Pool to fish.",
        changes: {
          features: [
            "Old Flint the Badger waits by an overgrown mine adit behind the Autumn Maples in the Whispering Woods. The first time you talk to him, he tells you what lies below and gives you his Rusted Pickaxe. From then on, the adit is always open to you.",
            "The Glimmering Caverns have two tiers. On the warm Upper Terrace: Gus the Mole's workshop, the Ancient Forge, the Geode Anvil, a six-seat onsen, and coal and copper to mine. Down the stair, in the Sunken Basin: iron on the wet cliffs, silver in the lower chasm, glimmerstone among the mushrooms, the Titan Monolith in the sanctuary, and the Grotto Pool with its pier.",
            "Tactile prospecting: step up to a node and the camera closes in on the rock. There's no gauge or dial. Find its weak spot by the glowing fissures, the glint and the sifting dust, and click or tap it. A direct hit does full damage, a near miss half, and bare bedrock very little. The weak spot moves after every direct hit.",
            "A pickaxe above a rock's tier breaks it in one blow. One tier below, it still bites at 60%. Two or more below, it skids off with a stagger.",
            "Mine together: everyone who does more than 15% of the damage to a rock takes home 40% more for each other miner (a crew of up to four). The Titan Monolith (T5) takes a crew, and it resurfaces every 25 to 30 minutes.",
            "The ⛏️ ore satchel sits next to the 🪵 and 🪣 gauges. Its drawer sorts Raw Ores, Ingots, Geodes and Gems, with Quick Smelt All and Sell All Cut Gems. Press B to reopen it.",
            "The Ancient Forge smelts ore into ingots: Copper (3 Raw Copper and 1 Coal), Iron (3 Raw Iron and 2 Coal) and Silver (2 Raw Silver and 2 Coal). It makes one ingot every 3 seconds and keeps working while you're away.",
            "The Geode Anvil: crack a geode in three strikes along its seam. Clean strikes turn up the finer gems: Amethyst, Topaz, Opal, and the rare Star Shard.",
            "The onsen: soak for 60 seconds to get Deep Warmth for 20 minutes, on every map. You walk 15% faster, your pickaxe's fracture radius is 20% larger, and your stamina comes back 25% faster in the Velvet Ring.",
            "Fish the Grotto Pool from its pier: six glowing cave fish, from the Blind Cave Tetra up to the mythic Elder Olm of the Rift. Every 20 seconds a stalactite drips onto one float. Cast into the ripple and the sweet spot is wider, and nothing common bites.",
          ],
          visuals: [
            "The terrace glows warm amber and the basin glows bioluminescent cyan and violet. Crystals, mushrooms and lanterns breathe with their own light, the forge flickers, the onsen steams, and the pool's heart pulses.",
            "Rocks crack as you strike them: fissures glow in, then the shell fractures and trembles, then it shatters in a burst of shards, and the loot flies to you.",
            "The overhang, its stalactites and the old timber shoring fade away when they block your view.",
            "A lantern swings in the dark of the tunnel on the way down the adit, in place of the curtain.",
            "The caverns have their own soundscape: a cave reverb with drips, a crystal resonance and the onsen's steam. Settings now shows only the sliders for the world you're in (Master and Effects always). The woods also get a Wind in the Trees slider.",
          ],
          economy: [
            "Gus the Mole buys ore, ingots, geodes, gems and the Grotto Pool's fish at the hour's market price. He sells four pickaxes: Copper (1,500 🪙), Reinforced (4,500), Glimmer (11,000) and the Deep Core Drill (25,000). Each is quicker, hits harder and finds weak spots more easily than the last.",
            "Five satchel upgrades at Gus's, from 8 to 40 slots, each paid for in coins and materials from all over the camp: sawdust and Pine Resin, then ingots, bark, cedar, glimmer shards, and at the top Titan Heartwood and Ancient Core Fragments.",
            "Ingots are worth more than the ore and coal that went into them, and a cut Star Shard fetches 1,200 🪙.",
          ],
          fixes: [
            "Every saved profile gets an empty satchel, the Rusted Pickaxe slot and the caverns' fields, and a letter tells you where to find Old Flint.",
            "Leaving mid-soak frees your onsen seat at once, and you're set down on the dry side of the rim.",
          ],
        },
      },
      {
        version: "0.7.7",
        date: "2026-09-29",
        title: "The Grand Karst",
        summary: "The Glimmering Caverns are rebuilt from the ground up as a vast karst sanctuary: a sunlit doline, a cenote lake, travertine terraces and crystal fissures. The forge and the anvil become hands-on minigames, every store is rebalanced, and the market moves more each hour.",
        changes: {
          features: [
            "The caverns are now a 45 by 45 metre karst. The Sunlit Doline at the top of the ramp holds Gus's log workstation, the Thermal Bellows Forge in a basalt fissure, the meteorite anvil and the copper and coal. Down the ramp is the Abyssal Cenote Lake with its sandy beach, a limestone islet under a skylight and a driftwood fishing outcrop. The Travertine Terraces step down the west cliff, and the Deep Crystal Fissures on either side hold the iron, silver and glimmerstone.",
            "Finnegan the Grotto Angler sits on his driftwood crate by the cenote. He buys your catch, sells every rod, livewell and bait pack, and in his new Barter tab trades advanced tackle for coins, ingots and the river's materials: the Silverline Spinner, the Cenote Glow Lure and the Abyssal Swivel.",
            "The Thermal Bellows Forge: pick 1, 3 or 5 ingots, then pump the bellows (hold or tap) to keep the furnace inside the drifting Optimal Temperature band for four seconds. After that, strike the glowing ingot twice as the sparks burst. Get both right and the whole batch comes out Masterwork, worth 25% more. Quick Smelt All still makes plain ingots on the forge's own clock.",
            "The Geode Chisel: turn the geode in your hands (drag, swipe or use the arrow keys) until its glowing seam faces you and the chime rings. Then raise the mallet and let go at the right power: 65 to 80% is a perfect cleavage, under 40% the chisel rings off, and over 85% the core crumbles into Fine Stone Dust.",
            "Four mining relics are forged at the forge: the Tempered Knuckle Guards, the Deepvein Satchel Strap, the Geode Hunter's Ring and the Lodestone Pendant.",
            "Three brews are made right in the drawers: Feller's Pine Pitch (more logs), Phosphor Glow Bait (rarer fish by night and underground) and Miner's Stout (harder pickaxe strikes). Your buffs now show as countdown pills in the top-left corner on every map. Using the same one again refreshes its clock and never stacks it.",
            "Each drawer's gear tab shows only its own discipline: the Forester's, the Angler's, or the Miner's pickaxes and relics.",
            "The Travertine Terraces have six warm-pool seats. Soak for 60 seconds for the Deep Warmth, and you're set down on the dry landing when you get up.",
          ],
          visuals: [
            "Godrays pour down through the doline's broken ceiling and the islet's skylight, with dust drifting in them. Caustics dance on the cenote's bed, and the terraces steam.",
            "A broken node leaves a dark, cracked stump with dust hanging over it until it grows back.",
            "The cave fish's fins glow when they're revealed on the stand.",
            "In the Whispering Woods, the dirt road to the adit is gone. The old mine's mouth is set deeper into a cliff alcove behind the maples, with grass, fallen leaves and stones in front of it. Old Flint leans on its post with his brass lantern lit.",
            "The Velvet Penthouse's blackjack and baccarat tables move further apart, leaving a wide ring around the champagne tower and a broader promenade.",
            "The caverns' Onsen Steam slider is now called Thermal Steam.",
          ],
          economy: [
            "Storage rebalance. Wood carriers hold 15, 25, 40, 55 and 70 logs, and livewells hold 12, 20, 32, 45 and 60 fish. The ore satchel stacks 10 to a slot (5 for geodes), from 2 slots in your coat pockets up to 20.",
            "By-products, resin, sawdust, fish scales and bones, and stone dust now go in a store of their own, up to 99 of each kind.",
            "Nothing you already carry is ever taken away. If a store holds more than its new size, you can still sell, smelt and craft from it, but gathering into it waits until you're back under.",
            "The market moves more: each good drifts 10 to 25% up or down every hour, heavy selling can knock up to 30% off, and unsold goods recover. The chalkboards show it as +18% ▲, 0% ▬ or −15% ▼.",
            "The cenote now holds eleven cave fish, from Common to Epic to Mythic, with Gus's fish trade moving to Finnegan. Gus buys Fine Stone Dust instead.",
          ],
          fixes: [
            "A full livewell during AFK fishing now reels in, leaves AFK, chimes, and shows a 🪣 Full! sign over your head.",
            "Your saved satchel's stone dust moves into the new materials store, and a letter explains the storage changes.",
          ],
        },
      },
      {
        version: "0.7.8",
        date: "2026-09-29",
        title: "The Organic Karst",
        summary: "The Glimmering Caverns are reshaped by hand into one organic karst: no stairs or flat slabs, a meandering switchback down from the doline to the Limestone Overlook, trails to the terraces and the sandy shore, and fishing from anywhere along the cenote. Every trip gets a loading screen dressed as its world, the caverns get a close camera that follows you down, the header's gauges fold into one 🎒 pill, and the penthouse's card tables turn to face the fountain.",
        changes: {
          features: [
            "The caverns' floor is one continuous karst from the doline at the top to the lake at the bottom. A switchback trail winds down from the doline to the Limestone Overlook, and from there one trail runs to the Travertine Terraces and another to the sandy shore. There are no stairs anywhere, and nothing you walk on is steeper than 28 degrees.",
            "Shore fishing: the driftwood pier is gone. Walk up to the cenote anywhere along its shore, face the water, and 🎣 Cast Line (within 1.5 m of the water, and only when you're facing it). Your float lands out where the water is deep enough, and Auto AFK works there too.",
            "The lucky drip now falls beside a float that is out on the water, so whoever is fishing gets the chance to Cast into the Drip.",
            "The caverns have a close camera: it glides in over 1.2 seconds as you arrive, stays 6 metres behind you, and follows you up and down the karst. The wheel or a pinch moves it only between 5.5 and 7.5 m.",
            "The header's wood, fish and ore gauges now fold into one 🎒 pill showing the total you carry. Tap it to see 🪵, 🪣 and ⛏️ with their room, and tap one to open its drawer. Tap the pill again, or anywhere else, to fold it away.",
          ],
          visuals: [
            "Every trip has a loading screen dressed as the world you're going to: a starlit night with rising embers for the campfire, a midnight skyline for the lounge, black lacquer and gold rays for the casino, sepia canvas under a spotlight for the Velvet Ring, misty pines and falling maple leaves for the woods, and wet slate with cyan and violet crystal motes for the caverns. The velvet curtain now belongs only to the Velvet Penthouse.",
            "The Velvet Penthouse: the blackjack table (emerald) and the baccarat table (crimson) stand in the front half of the room. Gideon and Scarlett deal from the balcony side facing the fountain, and the stools face them from the fountain side. The champagne tower keeps a clear 2-metre walk all the way round.",
            "The twin Golden Vaults move to the back wall beside the elevator, and the loveseat sits under the windows next to them.",
            "Finnegan now sits on a driftwood log on the cenote's north shore, with a reed creel and a lantern beside him.",
            "The Titan Monolith faces the sandbar, so you mine it from the side you walk in on.",
            "Old Flint now leans on the cliff to the right of the old mine's portal, his lantern lighting the way down.",
          ],
          fixes: [
            "No more invisible ledges: the trails' shoulders, the sandbar's flanks and the banks between switchbacks are no longer walkable, so you never step off a steep edge.",
          ],
        },
      },
      {
        version: "0.7.9",
        date: "2026-09-30",
        title: "Hang Son Doong",
        summary: "The Glimmering Caverns are rebuilt from the rock up after the world's largest cave: sculpted limestone, a sunlit doline of moss-draped karst, a great talus of fallen blocks, an emerald cenote with a crag and its ancient banyan, and a proper expedition camp. The caverns' camera is yours to zoom again.",
        changes: {
          features: [
            "The caverns' camera zooms freely again: roll the wheel or pinch anywhere from 3.5 to 16 metres. It starts at 7 metres and still follows you up and down the karst.",
            "The cenote's shoal lies just under the water now: you wade out to the islet ankle-deep, and the shore trail runs right down to where it starts.",
            "Nothing you walk on is steeper than 24 degrees.",
          ],
          visuals: [
            "Every wall, mound, outcrop and crag is carved from one mass of limestone, fused, weathered into pits and strata, and faceted. The west cliff towers higher.",
            "The Sunlit Doline: a limestone floor rolling in low swells under patches of deep green and lime moss, terraced mounds draped in moss, fallen rubble, and aerial vines hanging from the broken roof into the sunbeams.",
            "The great talus: fractured limestone blocks heaped down every slope between the doline, the overlook and the shore, mammoth outcrops along the switchbacks.",
            "The Abyssal Cenote: a shore of coves and points around emerald and turquoise water with shallow shoals. The islet is a rugged limestone crag, gripped by an ancient banyan whose roots spiral down into the deep.",
            "The Travertine Terraces: turquoise pools held in flowing rimstone collars.",
            "The Abyssal Chasm sinks into the bedrock down the east, under towering slate cliffs with crystals in their cracks. Each vein's nodes are strung on a fault seam glinting with their mineral.",
            "Gus's Expedition Basecamp: a canvas tarp on timber posts, oil lanterns, a crate stack with glowing specimen jars, and a brass survey transit on its tripod.",
            "The forge sits in a cleft of dark columnar basalt: a crucible of bubbling magma, veins of it rising up the rock, ember runes burnt into the columns, and smoke curling up.",
            "The meteorite anvil rests on a limestone pedestal, with chisels, a mallet and split geodes glittering at its foot. The adit is a rock-cut bore propped by timber sets, its rails running out on sleepers.",
            "Stalagmites and stalactites are fluted candles of flowstone, clustered in the vault's pockets and at the walls' feet.",
            "Finnegan keeps an iron tackle box beside his reed creel and lantern.",
          ],
        },
      },
      {
        version: "0.7.10",
        date: "2026-09-30",
        title: "The Living Karst",
        summary: "The Glimmering Caverns come alive: a real basalt crucible forge with its blacksmith's corner, stone partitions shaping the terraces and the chasm, and crabs, swiftlets, beetles and a very relaxed capybara to share them with.",
        changes: {
          features: [
            "A capybara soaks in the Travertine Terraces' upper pool, a striped towel folded on its head. It turns to watch you as you pass.",
            "Glowing cave crabs skitter along the cenote's beach, and swiftlets circle in the doline's sunbeams.",
          ],
          visuals: [
            "The Basalt Crucible Forge: a deep combustion chamber carved into the basalt columns, glowing from the embers up. In front of it stands a carved stone hearth with an arched fire-mouth, glowing runic vents and a crucible of molten metal. A stone spout pours into an ingot mould, a quench trough sits beside it with tongs across, and the bellows are at its flank. Charcoal grit and slag lie round its foot. The smoke now rises off the crucible and up the chamber.",
            "The blacksmith's corner: the meteorite anvil, its chisel rack and the tool crate now stand together beside the forge, out of the path from the adit.",
            "The West Limestone Buttress curves round the Travertine Terraces, their rimstone flowing into its feet, making a sheltered thermal grotto.",
            "The East Slate Spine rises between the central slope and the chasm. The chasm floor has sunk into a bedrock trench of grey slate, cracked and mossy, with no more blue wash over it.",
            "The glimmerstone crystals burst out of jagged fractures in the chasm's cliffs and the spine, with glowing prism beetles perched on them.",
            "The talus lies in natural piles on the outside of the switchbacks' bends, instead of lines across the slope.",
            "Groundwater runs off the doline's rim and the terraces down to the lake in thin, dark, wet rivulets, with moss along them.",
            "The northwest shelf's slate blends into the limestone instead of ending in a hard dark edge.",
            "On the beach, a sunken dinghy lies half-buried at the waterline, with driftwood logs, tidal rock pools and cave ferns around it.",
            "At the east shore's mining overlook, an overturned rusted mine cart has spilled its ore beside a stretch of broken rail. A brass survey lantern is staked on a rock above the lake.",
          ],
        },
      },
      {
        version: "0.7.11",
        date: "2026-09-30",
        title: "Basalt and Lantern Light",
        summary: "The Glimmering Caverns get real light and shadow, basalt pillars in the chasm, a trail you can follow, and far less to snag on.",
        changes: {
          features: [
            "Walk the caverns without snagging. Boulders, mounds, outcrops, the forge and Gus's camp take up about half the room they used to. Crystals, mushrooms, ferns, reeds, rock pools, lanterns and tool racks can be walked through.",
            "The explorer's trails from the doline down to the overlook and the beach are packed dirt edged with small stones, and nowhere on them is steeper than 22 degrees.",
            "♨️ Soak in Springs: bathers now sit chest-deep in the terraces' pools, with warm steam rising round them. A seventh seat waits in the middle of the middle pool.",
          ],
          visuals: [
            "The caverns are lit in real time. The doline's sun casts true shadows through the collapsed vault, the rest of the cave sinks into a deep slate-blue dark, and the sand under the sunbeams no longer washes out to white.",
            "Crystals glow from within, lighting only the rock right round them, and the chasm's fungi do the same.",
            "A low, dark mist lies over the lower floor and the water's edge.",
            "Dark stalactites hang along the top of the view, drifting as the camera moves.",
            "The Abyssal Chasm is walled by crisp hexagonal basalt pillars with stepped, fractured tops, and the East Spine is a crest of them. Crystals burst out of the cracks between them.",
            "The black lines that ran between ore nodes are gone: each node sits in its own fissure.",
            "Green ferns grow only in the sunlit doline. The twilight has pale cave ferns and reeds, and the chasm only glowing fungi.",
            "The beach's wreck is gathered round its boulder: the sunken dinghy, tangled driftwood, fallen blocks, rock pools and pale ferns. The mine cart lies in a collapsed survey alcove, with rails buckled up off their sleepers, fallen timbers and the brass lantern on the rock behind.",
            "The sand the water touches is damp, dark and glossy. The forge's chamber is arched in basalt with runic vents, and the anvil, rack and crate share a flagstone floor with it.",
          ],
          fixes: [
            "The black wedge past the cavern's south edge is gone: the ground's cut face now shows there.",
          ],
        },
      },
      {
        version: "0.7.12",
        date: "2026-09-30",
        title: "Into the Dark Karst",
        summary: "The Glimmering Caverns are rebuilt from bare rock around the one part that worked, the Basalt Crucible Forge and its workshop. The cave is darker, damper and more like a real cave.",
        changes: {
          features: [
            "Nowhere you can walk in the caverns is steeper than 22 degrees. The wading shoal to the Titan Monolith is wider, so you can walk straight out to the islet.",
            "Casting from the cenote's shore works where shallows lie straight ahead: the float lands a little to one side, still in front of you.",
            "Cairns of stacked flat stones mark where the trails meet.",
          ],
          visuals: [
            "The floor is dark, damp limestone bedrock, with fractured slate and compacted cave silt. Fine river sediment appears only in a band along the cenote, dark and wet where the water laps. The pale beach is gone.",
            "The trails are no longer painted strips. The ground is simply trampled a shade darker, with cairns at the junctions.",
            "The east wall is one towering cliff of hexagonal basalt columns. It steps down into terraces and drops to a low ledge along the lake. Its ore nodes sit in hollow vugs, and amethyst and cyan crystals glow out of its fractures.",
            "The north and west walls are limestone cliffs rising into the vault's broken lip. The nodes set in them sit in dark pockets ringed with crystals.",
            "The Travertine Terraces' rimstone dams grow out of the west buttress. Their lips are irregular and crenulated, stepped in little gours and banded cream and grey. Nothing glows against the grotto's back wall any more.",
            "Rocks are faceted blocks of weathered limestone, not smooth pebbles. The islet's crag is stacked blocks gripped by the banyan's roots.",
            "A waterlogged dinghy lies half-buried at the south-west waterline among driftwood and pale reeds. The mine cart lies overturned against the basalt ledge on the east shore, with its rails buckled against the rock.",
            "The light is the game's own. A deep navy dark fills the cave, a golden skylight falls only on the doline and casts real shadows, and a thin pale mist hangs over the water.",
            "Nothing hangs over the top of the screen any more. A solid dark skirt runs round the cavern's edge.",
          ],
        },
      },
      {
        version: "0.7.13",
        date: "2026-09-30",
        title: "The Son Doong Expedition",
        summary: "The Glimmering Caverns are redrawn from a new plan after Hang Son Doong: eight zones stepping down from Gus's basecamp to a great underground lake, one zone for each ore, with its own ground, rock, life, light and sound. The forge and its workshop are just as they were.",
        changes: {
          features: [
            "Eight zones, each named in a toast as you step into it: the Expedition Basecamp, the Doline Jungle, the Coal Breakdown, the Iron Mudflats, the Pearl Terraces, the Hound's Overlook, the Glimmer Rift and the Great Lake.",
            "Every ore has a zone of its own: copper in the jungle, coal in the breakdown, iron on the mudflats, silver on the terraces, glimmerstone in the rift and the Titan Monolith on the lake's islet.",
            "The whole cave is open to explore. Your pickaxe's tier only decides what you can mine.",
            "🪢 Gus's winch lift runs between the Coal Breakdown and the Glimmer Rift, so the deepest ore is a quick ride from the basecamp.",
            "A switchback runs from the basecamp down to the Hound's Overlook, and ramps go on from there to the lake and the rift. A rope descent leads from the jungle to the mudflats, and the pearl trail runs down the terraces.",
            "Cross the stream at its fords, and walk out to the Monolith's islet on stepping stones.",
            "Nowhere you can walk is steeper than 20 degrees, and every drop between two levels is either a cliff you can see or a trail cut across it.",
            "Finnegan fishes from a driftwood log on the lake's north shore. Cast from anywhere along the shore, as before.",
            "Soak in the three warm pools that step down the Pearl Terraces. The capybara still has the top one.",
          ],
          visuals: [
            "A waterfall drops through the jungle's collapsed roof into a plunge pool. The stream crosses the mudflats, flows down through the terraces' pools and falls into the lake, which drains away east into the dark.",
            "The Doline Jungle has tall thin trees, ferns, moss and leaf litter, with vines hanging from the broken rim and golden light falling through the collapse.",
            "The Coal Breakdown is strewn with fallen limestone slabs and gravel. The Iron Mudflats are dried red-ochre mud cracked into plates, with rust bleeding down the wall.",
            "The Pearl Terraces are white rimstone dams with cave pearls in their dry basins, under the Great Wall's cream flowstone. The Hound's Hand, a 9-metre stalagmite, rises from the overlook.",
            "The Glimmer Rift is a black-rock floor under a crystal-lined wall, lit by glowworms and glowing fungi. The Great Lake runs from emerald shallows to near-black deep water, with a second skylight over its islet.",
            "Each ore has its own rock. Coal is shale striped with black seams, copper is limestone crusted green with native copper nuggets, iron is rusty kidney-shaped hematite, silver is white calcite threaded with shining wire, and glimmerstone is a great crystal with a crown of smaller ones.",
            "A twinkling star marks every node that is ready to mine.",
            "New light from high over the collapse: cliffs facing you stand in their own shade, and each zone has its own tint. The steep banks read as crisp rock, and the trails blend into the ground around them.",
            "Mist gathers the lower you go, and the cavern's open edges fade into the dark.",
            "Bats roost on the west wall and flutter over the mudflats. Dust drifts in the light under the collapse.",
            "You can hear the waterfall, the stream and the lake lapping as you come near them, bats squeaking over the mudflats, and crystals chiming more often down in the rift.",
          ],
        },
      },
      {
        version: "0.7.14",
        date: "2026-09-30",
        title: "The Caverns, Reshaped",
        summary: "The Glimmering Caverns lose their straight edges: every zone takes a natural shape, the deeper ores sit deeper in, Gus's winch now carries you up in its cage, and the lake, the jungle and the Great Wall are redrawn.",
        changes: {
          features: [
            "🪢 Gus's winch now runs up only, from the Glimmer Rift back to the basecamp. Step into the cage and ride it up the cliff; the empty cage then goes back down for the next rider.",
            "Depth is progress: walking in from the arrival reaches copper and coal first, then iron, silver, glimmerstone and the Titan Monolith, each further in than the last.",
            "The Glimmer Rift is now a crevasse down the cavern's east side, entered by a ramp cut down the Hound's Overlook's east cliff. Its glimmerstone lies at its deep north end.",
            "The stepping stones to the Monolith's islet now start from the east shore, past the rift.",
            "The Pearl Terraces' three warm pools are now rimstone basins of different sizes, with seven seats round them.",
          ],
          visuals: [
            "No more rectangles: every zone has a natural outline, the mudflats in lobes, the overlook with bays, and the open south and east edges fall away over a broken rim into the dark.",
            "The lake is calm in the deep and under the skylight, with slow ripples, a foam line where it laps the shore and light glinting in the shallows.",
            "The Doline Jungle is a little roomier, with buttressed trees, layered canopies, lianas, leaf litter and daylight glowing through the broken roof. The waterfall is streaked white and throws up spray at its foot.",
            "The Great Wall's flowstone falls in sharp folds and rimstone ledges instead of a pale haze.",
            "The Hound's Hand is carved as one tall column swelling into a knuckled paw.",
            "The empty stretches are dressed with rubble, driftwood, reeds, shards and fungi.",
            "Each ore reads at a glance, even on a phone: copper as bright native-copper chunks, coal as a black boulder heaped with glossy lumps, iron as dark banded rock striped red with metal plates, and silver as dark rock veined white with shining silver wire.",
          ],
          fixes: [
            "On a phone or a tablet held upright, the caverns' camera now shows the ground around you instead of a narrow strip.",
          ],
        },
      },
      {
        version: "0.7.15",
        date: "2026-09-30",
        title: "Every Stone in the Caverns",
        summary: "The Glimmering Caverns get detail down to the stone: cracked limestone, moss, rust, rimstone and glinting basalt, crisp trodden trails, broken scree on the steep slopes, and walls standing in layered beds under a broken vault hung with stalactites.",
        changes: {
          visuals: [
            "Every zone's ground has its own texture: cracked limestone plates in the Coal Breakdown, moss in patches in the Doline Jungle, tiny rimstone pools on the Pearl Terraces, ripples on the beach, and flecks glinting in the Glimmer Rift's basalt.",
            "Every trail is a crisp trodden path from end to end, easy to follow even down into the dark of the rift.",
            "Slopes too steep to walk are bare rock or broken scree, with no more smoky smears.",
            "The cavern walls stand in layered beds, each ledge catching the light, under the vault's broken lip hung with stalactites.",
            "The Great Wall behind the terraces is cream and amber flowstone again, not grey limestone.",
            "Rust streaks down the mudflats' wall, and the ground by the water is dark and wet.",
            "Rocks and walls are weathered, with paler edges and darker cracks.",
            "The haze over the low ground is lighter, so the terraces and the lakeshore keep their colour.",
          ],
        },
      },
      {
        version: "0.7.16",
        date: "2026-09-30",
        title: "Hard at Work Underground",
        summary: "Every job in the Glimmering Caverns now moves the whole body: a real pickaxe swing, the bellows and the smith's hammer at the forge, the chisel at the anvil, a long soak in the springs. Chips, dust and sparks fly from every blow, and Gus, Finnegan and the capybara go about their own business.",
        changes: {
          visuals: [
            "⛏️ Mining is a real swing: the pick held up by your shoulder, driven down onto the rock, held on it and swung back up. A heavier pickaxe swings bigger, and a pick that skids off jars your arms back.",
            "🔥 At the forge you pump the bellows with your whole body, then take up the smith's hammer and tongs and bring the hammer down on every beat, with sparks flying.",
            "💎 At the anvil you crouch over the geode, turn it in both hands, set the chisel and draw the mallet back as the power builds, then strike, and chips and dust fly.",
            "♨️ In the warm pools you lean back with your arms spread along the rim and your eyes happily closed.",
            "🪢 On Gus's winch you hold the rope with one hand and the cage with the other, and on the rope descent you keep a hand on the rope.",
            "🎣 Fishing casts with the whole body, starts at the bite and braces for the reel, everywhere you fish.",
            "Everyone at work turns to face their rock, the forge or the anvil, and everyone nearby sees the whole thing: your swing, your hammer, your chisel.",
            "Every blow sends chips of rock and a puff of dust flying. Sparks streak, and everything lands on the cave floor instead of falling through it on high ground.",
            "Gus writes up his ledger between customers, Finnegan casts his rod afresh now and then, and the capybara bobs in its bath and nods off.",
          ],
          fixes: [
            "Your own swings, pumps and hammer blows now play the moment you tap, instead of waiting for the server.",
          ],
        },
      },
      {
        version: "0.7.17",
        date: "2026-09-30",
        title: "The Caverns' Games, Remade",
        summary: "Every mini-game in the Glimmering Caverns has been rebuilt to be clearer and more fun: Perfect strikes and streaks at the rock, the forge and the anvil played right there in the cave, a geode that splits open in your hands, a breathing rhythm in the springs, and a fish's shadow to watch while you wait.",
        changes: {
          features: [
            "⛏️ Prospecting: a glowing ring marks the rock's weak spot, and a white ring closes onto it every second or so. Strike just as it closes for a PERFECT: 30% more damage. Perfects in a row build a streak (🔥 ×5 at most) that adds up to 40% to every haul. A crack meter shows how far the rock has gone.",
            "🔥 The forge is played in the cave itself: the camera frames the forge and your avatar at the bellows, with a curved heat gauge and a big bellows button. Then strike the glowing ingot as each ring closes on it. Every batch is graded Plain, Fine or Masterwork, and a Fine batch gives its coal back.",
            "💎 The geode anvil is played in the cave too. The seam glows from ice blue to gold, the stage warms and a crystal ping rises as you turn the seam toward you. The mallet's power swings round the geode, and the geode shakes, splits and falls open, with the gem bursting out on rays in its rarity's colour.",
            "⚡ Quick crack: once you've cleaved a geode by hand, crack the rest with one blow and no game. It's always a rough cleave and never turns to dust.",
            "♨️ In the warm pools, breathe with the slow ring: tap as it's fullest for a deep breath. Each one adds a minute of Deep Warmth, up to 10 a soak. It's entirely optional.",
            "🦫 The capybara dozes when it has the pools to itself, wakes to watch whoever gets in, perks up at your deep breaths, shakes off a splash and has a word when you click it.",
            "🎣 While you wait at the cenote, a fish's shadow circles under your float, drawing closer and quicker as the nibbles start, then darting in on the bite.",
            "🌟 Every result is graded in stars, and what you win flies straight into your 🎒 satchel. New players get a one-line tip for each game until they've played it well.",
          ],
          fixes: [
            "On a touch screen the bite's ❗ mark is now thumb-sized, and a thumb that slides off the reel button keeps reeling.",
          ],
        },
      },
      {
        version: "0.7.18",
        date: "2026-09-30",
        title: "Echoes and Moonlight",
        summary: "The Glimmering Caverns now sound and glow like a real cave: every zone has its own echo, your footsteps change with the ground, and a little music drifts by now and then. The Doline Jungle's sun follows the camp's day, with moonlight and stars after dusk, and a warm glow keeps you company in the dark places.",
        changes: {
          features: [
            "🔊 Every zone answers in its own voice: the jungle, open to the sky, is short and dry; the halls of the breakdown and the mudflats ring; the overlook and the lake echo long; the Glimmer Rift echoes deepest of all.",
            "👣 Your footsteps change with the ground: stone, crunching gravel, squelching mud, soft sand, clacking travertine, crackling leaf litter, and a splash when you wade through the fords and shallows.",
            "🎵 Now and then a few quiet kalimba notes drift through the cave over a soft drone, in each zone's own register: glassy and high in the rift, slow and low by the lake.",
            "🎚️ New faders in Settings while you're in the caverns: Cavern Air & Footsteps, Water, Crystal Resonance, Thermal Steam and Cave Music.",
            "🌙 The sun through the jungle's collapsed roof keeps the camp's day: golden by day, then a silver moon and a starry sky through the broken rim by night, with the jungle cooler and darker.",
            "🏮 A warm glow keeps you company in the cave's dark places: the Glimmer Rift, the mudflats, the overlook and the lake's shore.",
            "☀️ Softer godrays that breathe slowly and turn a pale moonlit blue at night.",
          ],
          fixes: [
            "The jungle's sun shadows are now redrawn only when they change instead of every frame, so the caverns run lighter everywhere.",
          ],
        },
      },
      {
        version: "0.7.19",
        date: "2026-09-30",
        title: "A Living Cave",
        summary: "The Glimmering Caverns come alive: a campfire on the Hound's Overlook, living wonders rolling through (a Cave Cloud, a Glimmer Bloom, a Rockfall), the Bat Exodus at every dusk, and the Cave Codex, a field journal of zone stamps, cave fauna, pearls, fossils and Old Flint's lost pages.",
        changes: {
          features: [
            "🔥 A campfire on the Hound's Overlook: a ring of river stones and four log benches beneath the great stalagmite. Sit on a bench for a marshmallow on a stick. The fire never goes out.",
            "📸 Stand on the brass paw plaque for a photo with the Hound's Hand: the camera frames you with the Hand behind you, then the flash goes off.",
            "☁️ Living wonders roll through the caverns every so often. A Cave Cloud fills the cavern with mist while rare fish bite at the cenote. A Glimmer Bloom lights up the rift, and its glimmer yields more and grows back fast. A Rockfall crashes a heap of fresh ore into the Coal Breakdown for a crew to break together.",
            "🦇 Every dusk on the camp's clock, the Bat Exodus: a river of bats pours out of the mudflats' wall and up through the jungle's collapsed roof.",
            "📖 The Cave Codex, the expedition's field journal: stamp all eight zones, meet the cave's creatures, pick up the five cave pearls, find fossils in the rubble of broken nodes, collect Old Flint's six torn journal pages, and witness the wonders. Every entry pays coins, and every completed section pays a bonus. Open it from your ore satchel.",
          ],
        },
      },
      {
        version: "0.7.20",
        date: "2026-09-30",
        title: "Lighter on Every Screen",
        summary: "CozyCube runs lighter everywhere: every avatar is about half the weight with the same look, the caverns draw your see-through silhouette only when something actually hides you, and phones and tablets get a render profile of their own.",
        changes: {
          visuals: [
            "🧸 Every avatar, outfit, hat and hairdo is slimmed to about half its triangles with the same look, and the avatar is less than half the download. Every map benefits.",
            "✨ In the Glimmering Caverns your glowing see-through silhouette appears only while rock actually stands between you and the camera, so the cave draws less the rest of the time.",
          ],
          fixes: [
            "📱 Phones and tablets get their own render profile: no extra edge smoothing on their already sharp screens, no real-time shadows in the Doline Jungle (its shade is painted in), and fewer little crystal lights in the caverns. Smoother frames and cooler phones.",
          ],
        },
      },
      {
        version: "0.7.21",
        date: "2026-10-01",
        title: "Deeper Caverns",
        summary: "Walking snags far less on every map, the caverns' economy is brought in line, and the caverns gain an endgame (mastery, Motherlodes, the awakened Monolith, weekly orders) plus a Cave Map, lanterns, a raft to the islet and stream fishing.",
        changes: {
          fixes: [
            "🚶 Walking with WASD or the joystick no longer gets stuck on rocks, tree trunks, table legs and cliff edges: you slide round them instead, on every map. Round things now have round edges to bump into.",
            "⚖️ The caverns paid far more than anything else in the game. Ore, ingots, gems and the cenote's fish now pay about twice what the river does on tools of the same tier. Iron lodes take a little longer to grow back, and an uncracked geode sells for a fair share of what cracking it pays.",
            "☀️ The sky through the jungle's collapsed roof is a real sky by day, no longer a flat white patch at the far zoom.",
            "💠 Two glimmer nodes in the rift no longer share the same spot to mine from.",
          ],
          visuals: [
            "🪨 Every floor looks like what it is: sand is gritty with pebbles, the breakdown is broken slabs, the terraces' travertine ripples, the rift's basalt has its columns, and only the mud cracks. No more paving everywhere.",
            "🎨 A colour pass: the mudflats are a calmer brown, and your lamp's glow no longer bleaches pale stone white round you.",
            "🗿 The Titan Monolith is remade as an ancient megalith: a weathered shaft, a broken crown of violet crystal, glowing runes and seams.",
            "💧 Drips fall from the stalactites, dust hangs in your light in the dark zones, the lake has a soft sheen, faint glints show the cave going on far below the open edges, and the jungle's canopies are fuller.",
          ],
          features: [
            "🏅 Mining mastery: every ore has five ranks. Each rank adds a chance of an extra ore, and a Master gets a wider sweet spot and a gold title. Master all six for the Grandmaster's.",
            "✨ Motherlodes: now and then a node glitters gold for three minutes and pays triple. The Titan Monolith surfaces awake: break it within five minutes for a second core each.",
            "📋 Weekly Expedition Orders: three goals a week, each paying when met, and a bonus for all three.",
            "🗺️ The Cave Map (M): every node and when it grows back, the Motherlode, and everyone down there.",
            "🏮 Set down a lantern (one lump of coal) for ten minutes of warm light where you stand.",
            "🛶 A raft poles across the Great Lake to the Monolith's islet.",
            "🎣 Fish the stream from its banks: the cave's smaller fish, quick and calm.",
            "📖 Filling a section of the Cave Codex now earns a gold title too, and the Prospector's Ledger keeps your lifetime marks.",
            "🔥 Sit by the overlook's fire to hear the cave's stories.",
          ],
        },
      },
      {
        version: "0.7.22",
        date: "2026-10-01",
        title: "The Cave, Made Natural",
        summary: "The Glimmering Caverns look lived in and grown rather than built: faint expedition trails, Gus's new trading post, real waterfalls, natural hot-spring rims, a proper home for the Titan Monolith and an old mine entrance you believe goes somewhere.",
        changes: {
          visuals: [
            "👣 The trails are no longer roads. They are faint worn paths with scuffs and bootprints, and the expedition's leavings mark the way: survey stakes with faded ribbon, chalk arrows, a cold campfire, a dropped canteen and a scrap of map.",
            "🏚️ Gus has a real trading post against the cave wall: a shingled lean-to, a counter with his brass scales, bins of ore, a rack of pickaxes and a sign. He's easy to see behind his counter now.",
            "💦 The stream falls properly: white curtains of water into splashing pools with spray, white water over stones, and stepping stones at the fords.",
            "♨️ The hot springs' rims look grown from travertine, uneven and cream to ochre, with the water spilling over a notch and down a flowstone curtain into the next pool.",
            "🗿 The Titan Monolith stands on a stepped basalt dais carved with glowing runes, inside a rune circle and a ring of old standing stones, with violet crystal breaking out of the ground and shards turning round its crown. Stand near it and you'll hear it hum.",
            "⛏️ The old mine entrance is set into the rock: a carved sign over it, the tunnel bending away into the dark with a lantern far inside, rails running out to a tipped ore cart and a spoil heap, and a signpost back to the woods.",
            "🟤 The mudflats' dried plates are thin and curled, in every size. Where two kinds of cliff meet they blend, and the Coal Breakdown and the Overlook are a shade darker.",
          ],
          fixes: [
            "🚶 Gus's camp no longer blocks the basecamp: walks from the adit to the rope descent and the switchback are straight lines now.",
            "🛶 The raft lands on the islet's west side, away from the Monolith's mining spot.",
          ],
        },
      },
      {
        version: "0.7.23",
        date: "2026-10-01",
        title: "No More Invisible Walls",
        summary: "Walking the Glimmering Caverns no longer stops you against nothing: gentle slopes are walkable, you walk right up to the edges you can see, and anything that stops you now looks like it.",
        changes: {
          fixes: [
            "🚶 No more getting stuck on empty ground in the caverns. Small bumps in the floor, the stream's banks and the ground round the hot springs used to stop you with nothing there. You can now walk up gentle slopes and right up to the edge of a cliff or the water.",
            "🪨 Anything you can't walk onto now looks like bare rock, so where you stop is where you see the rock begin.",
            "🧭 Tap-to-walk no longer gets stuck going round corners (the boxing ring's steps, the casino's tables): it walks round them instead of cutting in.",
            "♨️ The hot springs' west ledges, which you could see but never reach, are now fields of little dry rimstone pools and stalagmites, and one pool seat moved to a spot you can reach.",
          ],
        },
      },
      {
        version: "0.7.24",
        date: "2026-10-01",
        title: "Water Finds Its Way",
        summary: "The caverns' water behaves: it falls into its pools, runs between them in little rivulets, never through rock, and the jungle waterfall has a proper basin. The Hound's Hand is a natural stalagmite now, and Gus's winch goes down as well as up.",
        changes: {
          features: [
            "🪢 Gus's winch goes both ways: from the ledge by the Coal Breakdown, ride it down into the Glimmer Rift. The cage is wound up to fetch you, then lowers you down.",
          ],
          visuals: [
            "🗿 The Hound's Hand is now a towering natural stalagmite on a flowstone mound, drip streaks running down it.",
            "💦 The jungle waterfall pours into a deep green basin ringed with mossy boulders, foam spreading where it lands.",
            "♨️ The stream falls straight into the top hot spring, and each pool spills into the next down a little rivulet through a notch in its rim.",
          ],
          fixes: [
            "🪨 Water no longer runs through rock or earth anywhere: the falls clear the slopes, the overflows run in the open, and the stream meets the lake at its level.",
            "✨ The white spots drifting across the water are gone, and the waterfalls' spray is a short puff at the splash.",
            "🧹 Stray stones no longer sit in the hot springs' water.",
          ],
        },
      },
      {
        version: "0.7.25",
        date: "2026-10-01",
        title: "Wading to the Monolith",
        summary: "Wade out to the Titan Monolith, talk to Finnegan and mine rocks from any side, and see the waterfalls pour cleanly down the rock.",
        changes: {
          features: [
            "🌊 The stepping stones to the Monolith are gone: wade out along the causeway, a hand's depth under the water.",
            "🧭 Talk to Finnegan, use the anvil and mine any ore rock from whichever side you walk up to.",
            "⛏️ When you take up a rock, its weak spot shows on your side of it, never round the back.",
          ],
          visuals: [
            "🦎 Finnegan now fishes from the water's edge.",
            "💦 The waterfalls pour down the rock as one sheet with their stream, and the jungle's basin holds its water, spilling into its stream.",
            "⛏️ The old mine entrance is set cleanly into the rock, and the Hound's Hand has a rimstone ring and little stalagmites round its foot.",
          ],
          fixes: [
            "🪨 The row of rocks along the cave's open edges is gone, and the second ramp down into the Glimmer Rift has been removed (walk along the lake's shore or ride Gus's winch down).",
            "🏮 Setting down lanterns has been removed.",
          ],
        },
      },
      {
        version: "0.7.26",
        date: "2026-10-01",
        title: "Rock, Water and Wading",
        summary: "The caverns' rock looks more like rock, the waterfalls stream and roar, and wading slows you down with ripples round your legs.",
        changes: {
          features: [
            "🌊 Wading through water slows you a little and leaves ripples spreading round you.",
            "📖 A new Cave Codex entry: wade out along the causeway to the Titan Monolith.",
            "🪧 A sign at the top of Gus's winch shows the way down.",
          ],
          visuals: [
            "💦 White water streams down every waterfall, and each one roars louder as you come near.",
            "🪨 The hot springs' terraces are cream travertine, the mudflats' plates a cracked orange, and the Coal Breakdown's fallen slabs sheared and seamed with coal.",
            "🗿 The standing stones round the Monolith are slim menhirs, and the Hound's Hand is all pale calcite.",
            "⛺ Tents and sacks at the basecamp, and dry rimstone pools on the Hound's Overlook.",
          ],
          fixes: [],
        },
      },
      {
        version: "0.7.27",
        date: "2026-10-01",
        title: "The Explorers' Rest",
        summary: "Gus's winch carries you up and down again, the springs' water flows from pool to pool, and the overlook's campfire has become an explorers' rest.",
        changes: {
          features: [
            "⛺ The Explorers' Rest: tents, sacks, a bedroll and a lantern post round the campfire on the Hound's Overlook.",
            "💦 Every waterfall splashes: drops thrown up and rings spreading over the water where it lands.",
          ],
          visuals: [
            "♨️ The stream and the overflows run through gaps in the hot springs' rims, and each pool spills into the next down a channel of its own.",
            "🌊 The jungle's basin and its stream are one sheet of water, and the stream churns wider where it falls.",
            "🗿 The Hound's Hand is a plain, natural stalagmite again.",
          ],
          fixes: [
            "🪢 Gus's winch cage now rises and lowers with its rider for everyone.",
            "🏖️ The steep bank at the Glimmer Rift's mouth is now a gentle beach you can walk.",
            "⛺ The tents no longer float off the basecamp's edge, and a silver rock no longer hangs off the cave's south rim.",
          ],
        },
      },
      {
        version: "0.7.28",
        date: "2026-10-01",
        title: "The Winch Landing",
        summary: "Gus's winch now has a landing to step out onto, a stew pot simmers at the Explorers' Rest, and the jungle's waterfall pours in a proper curtain.",
        changes: {
          features: [
            "🪜 A timber landing beside Gus's winch at the top: step off the cage onto it and walk to the ledge.",
            "🍲 A stew pot hangs over the Explorers' Rest campfire, steaming away.",
          ],
          visuals: [
            "💦 The jungle's waterfall arcs off the cliff in a thick, streaked curtain.",
            "🗿 The Hound's Hand stands as a tall, tiered stalagmite.",
            "🌊 The stream flows smoothly into the Great Lake.",
            "🛏️ A proper sleeping bag at the campfire, and the hot springs' ledges are less cluttered.",
          ],
          fixes: [
            "🪢 Riding the winch no longer walks you through its timber frame.",
          ],
        },
      },
      {
        version: "0.7.29",
        date: "2026-10-01",
        title: "Lucky Glints and Clean Breaks",
        summary: "Mining has two new tricks, the Explorers' Rest has grown into a proper camp, and the caverns' water finally runs as one.",
        changes: {
          features: [
            "✨ Lucky Glint: now and then a rock's weak spot shines gold. Land a Perfect on it and one more ore pops straight into your satchel.",
            "💥 Clean Break: finish a rock with a Perfect and your haul is a quarter bigger.",
            "🚶 Step back from a rock by clicking the floor away from it, or just walk off.",
            "⛺ The Explorers' Rest is a full camp now: tents, sleeping bags, a woodpile, a drying rack and lanterns round the fire, built where the Hound's Hand stood before it fell.",
          ],
          visuals: [
            "💦 The waterfalls pour clear of the rock off their lips, and the streams run into and out of the pools and the jungle's basin without a break.",
            "🪢 On Gus's winch you walk on and off the cage, and the cage swings and settles with a click of its ratchet.",
          ],
          fixes: [
            "♨️ The hot springs' rims no longer end in cut-off stubs where the water crosses them.",
          ],
        },
      },
      {
        version: "0.7.30",
        date: "2026-10-01",
        title: "A Clear View of the Rock",
        summary: "A rock's weak spot always shows on the side you can see, and the caverns' camera can be dragged around like everywhere else.",
        changes: {
          features: [
            "🎥 In the Glimmering Caverns the Free Pan camera now lets you drag the view around, just like every other world.",
          ],
          visuals: [
            "⛺ The Explorers' Rest's sleeping bags are laid out inside its tents.",
          ],
          fixes: [
            "⛏️ A rock's weak spot no longer hides round its back: it always shows on the side your close-up sees, and tapping the ring strikes the ring.",
            "🪨 The boulder blocking the top of Gus's winch is gone.",
            "🌊 The little stream at the Great Lake's south-east corner is gone, and the shore there is plain beach.",
            "🛏️ The stray sleeping bag in front of Gus's trading post is gone.",
          ],
        },
      },
      {
        version: "0.7.31",
        date: "2026-10-01",
        title: "The Vein Chase",
        summary: "Mining has a rhythm now: every good hit sends the crack running along a glowing vein, and chasing it makes each blow hit harder.",
        changes: {
          features: [
            "⚡ The Vein Chase: a direct hit runs the crack on along a glowing vein to a spot nearby. Hit that next spot quickly and you are on a chase.",
            "💪 Every link in a row strikes 8% harder, up to five links, so a clean chase breaks a rock much faster.",
            "🎯 A chip under the rock's meter counts your links and shows how long the next spot stays hot.",
          ],
          visuals: [
            "✨ The vein glows across the rock from the last spot to the next, with a bright spark running along it to show the way.",
          ],
          fixes: [],
        },
      },
      {
        version: "0.7.32",
        date: "2026-10-01",
        title: "A Coin Is a Minute",
        summary: "The first step of the new economy: fishing, woodcutting and mining now pay fairly against each other, and a better tool is always a better hour.",
        changes: {
          features: [
            "⚖️ Every rod, axe and pickaxe now earns what its tier should: each step up is a clear raise, and the three crafts pay alike at the same tier (the caverns a step above, as the deepest map).",
            "💰 Nothing you were holding lost its worth: the traders pay you the difference on every log, fish, shard, geode, gem, Firewood bundle and piece of furniture you had, the next time you come in.",
          ],
          visuals: [],
          economy: [
            "🪵 Timber sells for less (pine 2, birch 3, cedar 6, maple 18, elderwood 100), and the Colossal trees' logs with it.",
            "🎣 Rare fish sell for 50, legendaries about 220 and mythics 900; the better rods find them a little less often, so a big catch is still an event.",
            "⛏️ Silver and glimmer keep their worth but grow back slower (5 and 10 minutes), and their mastery ranks need fewer breaks. Geodes and gems sell for about half.",
            "🕳️ The cenote's fish are repriced to pay about 1.7x the river on the same rod.",
            "🪑 Workbench furniture: the stool 28, the keepsake box 80, the rocking chair 230, the clock still 950.",
            "🔥 Firewood sells at 1 coin for two bundles: it is fuel for the fire, and no longer worth more than the log it came from.",
          ],
          fixes: ["✨ The Lucky Glint is rolled once per rock: it no longer comes back each time the weak spot moves, which paid the weakest pickaxes the most."],
        },
      },
    ],
  },
];

/** The newest patch: its version is the client's. */
export const LATEST_PATCH: PatchNote = PATCH_ERAS[PATCH_ERAS.length - 1].patches[PATCH_ERAS[PATCH_ERAS.length - 1].patches.length - 1];
