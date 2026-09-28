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
    range: "v0.7.0",
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
    ],
  },
];

/** The newest patch: its version is the client's. */
export const LATEST_PATCH: PatchNote = PATCH_ERAS[PATCH_ERAS.length - 1].patches[PATCH_ERAS[PATCH_ERAS.length - 1].patches.length - 1];
