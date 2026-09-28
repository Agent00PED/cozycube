import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PLANT_WATER_COINS, isCasinoMap, msUntilNextDay, parseBag, parseSnack, ROAST_FOOD_INFO, type CampfirePacket, type ChairSyncState, type MapId, type PlayerState, type ToggleableSyncState } from "@shared/types";
import { BARNABY_FRONT, BARNABY_REACH, BUSTER_FRONT, BUSTER_REACH, CAMPFIRE_LAYOUT, PICNIC_REACH, WORKBENCH_FRONT, WORKBENCH_REACH } from "@shared/worlds/campfire";
import { FIREWOOD_FUEL, TITAN, TREES, WOOD, WOOD_KINDS, type WoodKind } from "@shared/chop";
import { ANIMAL_REACH, BRAMBLE_FRONT, BRAMBLE_REACH, FINLEY_FRONT, FINLEY_REACH, FOREST_ANIMALS, FOREST_FISHING, FOREST_WORKBENCH_FRONT, woodsSpotOfSeat } from "@shared/worlds/forest";
import { FELL_TREE_AT } from "@shared/worlds/trees";
import { treeTarget } from "../../scene/treeTarget";
import type { HearthState } from "../../hooks/useColyseusRoom";
import { BONFIRE_REACH, CAMP_SEAT_LABELS, CRITTER_REACH, FIREFLY_REACH, FISHING_REACH, FORAGE_REACH, FORAGE_SPOTS, STARGAZE_REACH, dockSeatOf, spotOfSeat } from "@shared/worlds/campfire";
import { APPROACH_POINTS, isWaterable, mochiSpot } from "@shared/props";
import { BOARD_REACH, BOUTIQUE, BOUTIQUE_REACH, KITCHEN_REACH, MOCHI_REACH, PLANT_REACH, RADIO_REACH, SEAT_REACH } from "@shared/worlds/lounge";
import { BAR_REACH, BLACKJACK_TABLES, CASHIER_FRONT, CASHIER_REACH, EXIT_FRONT, GACHAPON_FRONT, GAZETTE_REACH, MACHINE_REACH, PIANO_REACH, ROULETTE_BET_RADIUS, ROULETTE_CENTER, TIP_JARS, VIP_DOORS_FRONT, ZARA_FRONT, barDistance, nearGameTable, seatedGameOf, type CasinoGameTable } from "@shared/worlds/casino";
import { VIP_ARRIVAL } from "@shared/worlds/casino_vip";
import { isTouchUi } from "../../systems/inputMode";
import { BAR_SNACK, CAPSULE_COST, DEALER_TIP, TABLE_LIMITS, VAULT_SLOT_ID, chipText, isNpcOccupant, slotLimit, type CasinoPacket } from "@shared/casino";
import { VIP_PASS, VIP_WRISTBAND } from "@shared/items";
import { pushToast } from "./toastStore";
import { cameraFocus } from "../../scene/cameraFocus";
import { interactBridge } from "../../scene/interactBridge";
import { glass, hudText, pillButton } from "./glass";

// The action dock: a floating pill at the bottom-centre that offers exactly what you can do right
// now, and does exactly what clicking it in the scene does.
//
//   [🛋️ Sit]        within SEAT_REACH (1.5) of a free seat, measured to the seat or its approach point
//                    (a seat you lie in says what it is for: [⛺ Rest] in the tent, [🛌 Nap] in the hammock)
//   [🐾 Pet Mochi]  as you approach her (she wanders, so it is measured to where she is right now)
//   [♟️ Play Board Game]  within BOARD_REACH of the games table, or sitting at it
//   [☕ Brew Drink]  within KITCHEN_REACH of the coffee machine
//   [📻 Tune Radio]  within RADIO_REACH of the radio, or sitting on a pouf round its table
//   [🪴 Water Plant] within PLANT_REACH of a plant you have not watered today; after, [🌿 Happy
//                    Plant · 5h] counts down to when it is thirsty again (the day's rollover)
//   [🍡 Roast & Grill]  within BONFIRE_REACH of the campfire, or sitting on a log bench round it
//   [🪵 Add Firewood]  there too, with firewood (or Golden Charcoal) in your bag
//   [🍲 Dutch Oven] / [🥣 Scoop Stew]  there too: the hearth's panel, or a bowl when the stew's up
//   [🍢 Leave on Table] / [🍢 Grab a Skewer]  at the picnic table, a skewer in hand or on a plate
//   [🎣 Manual Reel] [☕ Auto AFK]  at a fishing spot (the dock's edge or the canoe at the campfire;
//                    the woods' river bank, standing or on its log or rock): cast and reel by hand,
//                    or feet up with the line in (12-16s a common, up to 90s a mythic; never a King
//                    Size); fishing by hand, [☕ Auto AFK]; AFK, [🎣 Manual Reel]
//   [🪓 Fell Soft Pine · T1]  the grown tree in reach (the campfire's pines, the woods' trees, a
//                    Colossal Titan): the radial felling panel
//   [🦦 Talk to Barnaby]  at the angler's tackle stall by the dock (in the woods, [🦦 Talk to Finley]
//                    by his boulder on the river, and [🐻 Talk to Bramble] at his counter)
//   [🪓 Talk to Buster]  at the lumberjack's firewood stall by the woodpile
//   [🎣 Go Fishing]  at the dock: sit on its edge at the nearest free spot and cast; sitting on the
//                    edge already, [🎣 Cast Line]
//   [✨ Catch Fireflies] / [✨ Release Fireflies]  in the grove between the hammock and the tipi
//   [🍪 Feed Raccoon]  by the raccoon at the camper van (it spins for joy)
//   [🎸 Play Guitar] / [⏹ Stop Guitar]  sitting on a log bench
//   [🔭 Stargaze]    at the brass telescope by the front fence
//   [🪓 Chop Firewood]  at the chopping block by the woodpile
//   [🍄 Forage] / [🫐 Forage]  at a patch under the pines with something to pick
//   [🏦 Cashier]    at Mr. Vance's cage window in the casino: coins into Velvet Chips and back (and
//                    the Black Velvet VIP Pass, bought or pawned)
//   [🎰 Play Slots]  at a slot machine in Neon Alley (the nearest one), or [🏆 Golden Vault] in the
//                    penthouse; a machine somebody else is playing shows [ In Use by Patron ]
//                    (greyed out), and beside it [ 💬 Excuse Me ] asks the patron to finish up
//   [🎡 Roulette]   within betting reach of the roulette table, from any side: the betting board
//   [🃏 Blackjack]  at a blackjack table: standing, it walks you to its nearest free stool (sitting
//                    down deals you in); a full table, [👀 Watch Blackjack]
//   [♠ Texas Hold'em] / [🂡 Baccarat]  the same, at the poker tables and both baccarat tables (Scarlett's
//                    in the hall, the penthouse's)
//   [🔮 Madame Zara]  at her booth: today's fortune (the owl hoots)
//   [🎁 Capsule Machine]  at the capsule machine: titles and emotes, for chips
//   [🪙 Tip 5 Chips]  at a dealer's tip jar (or a chair beside Boris's): they bow, the jar sparkles
//   [🍸 Bar Menu]   at the bar, standing or on a stool: Pippin's drinks
//   [📰 Read the Gazette]  by the coffee table, or on the Chesterfield
//   [🎹 Play Piano] on the baby grand's bench, or beside it: an arpeggio the lounge hears
//   [🎡 Big Six] / [🎲 Craps] / [🏇 Turf Club] / [🪙 Coin Pusher] / [👑 High-Roller Pusher] /
//   [🎱 Play Pool] / [🕹️ Pinball]  at the Big Six's ledge, the craps table, the Turf Club, either coin
//                    pusher, the billiards table and the pinball cabinets
//   [🕶️ Penthouse]  at Bruno's gilded doors on the stage: up in the elevator with a VIP pass, or
//                    [🎫 VIP Pass] to buy one; in the penthouse, [🛗 Back Down] at the elevator
//   [🚪 Leave Casino]  at the exit doors: the world drawer
//   [🧍 Stand up · Space]  while you are sitting, always (a panel closed, a reconnect: never stuck);
//                    Space or any movement key does the same
//
// Buttons are deduplicated by action type: only the nearest target of each type gets one, so
// three stools side by side give one "Sit", not three.

interface Action {
  key: string;
  type:
    | "sit"
    | "boutique"
    | "pet"
    | "board"
    | "brew"
    | "radio"
    | "water"
    | "roast"
    | "fuel"
    | "stew"
    | "picnic"
    | "afk"
    | "barnaby"
    | "buster"
    | "workbench"
    | "fish"
    | "guitar"
    | "stargaze"
    | "chop"
    | "forage"
    | "fireflies"
    | "critter"
    | "cashier"
    | "slots"
    | "roulette"
    | "blackjack"
    | "fortune"
    | "capsule"
    | "tip"
    | "bar"
    | "gazette"
    | "piano"
    | "fun"
    | "poker"
    | "craps"
    | "derby"
    | "pusher"
    | "billiards"
    | "baccarat"
    | "bigsix"
    | "pinball"
    | "excuse"
    | "vip"
    | "exit"
    | "travel"
    | "slingshot"
    | "split"
    | "stand";
  label: string;
  /** A longer status line, shown as the button's tooltip. */
  hint?: string;
  /** Shown, but not to be pressed (a machine somebody else is playing). */
  disabled?: boolean;
  /** How far its target is (m), where the dock measures it: E reaches only 2.8 m. */
  d?: number;
  run: () => void;
}

// The universal E: the one interaction a key press means, from what the dock offers right now. Never
// while you are typing (chat, a name) or while a panel is open. Within E_REACH, by priority: a shop
// or someone to talk to first, then a station (a workbench, the splitting block, a table, a
// machine), then a resource (a tree, the water, a patch to forage), then a seat; the nearest of a
// rank wins (the dock's order where it doesn't measure).
const E_REACH = 2.8;
const E_PRIORITY: Partial<Record<Action["type"], number>> = {
  barnaby: 1,
  buster: 1,
  boutique: 1,
  cashier: 1,
  bar: 1,
  fortune: 1,
  capsule: 1,
  vip: 1,
  tip: 1,
  workbench: 2,
  split: 2,
  slingshot: 2,
  board: 2,
  brew: 2,
  stew: 2,
  roast: 2,
  travel: 2,
  stargaze: 2,
  radio: 2,
  piano: 2,
  slots: 2,
  roulette: 2,
  blackjack: 2,
  poker: 2,
  craps: 2,
  derby: 2,
  pusher: 2,
  billiards: 2,
  baccarat: 2,
  bigsix: 2,
  pinball: 2,
  gazette: 2,
  chop: 3,
  fish: 3,
  forage: 3,
  fireflies: 3,
  critter: 3,
  water: 3,
  pet: 3,
  sit: 4,
};
/** The action E means among these (none: nothing to do). */
function pickE(actions: readonly Action[]): Action | null {
  let best: Action | null = null;
  for (const a of actions) {
    const rank = E_PRIORITY[a.type];
    if (!rank || a.disabled || (a.d ?? 0) > E_REACH) continue;
    const bestRank = best ? (E_PRIORITY[best.type] ?? 9) : 9;
    if (!best || rank < bestRank || (rank === bestRank && (a.d ?? 0) < (best.d ?? 0))) best = a;
  }
  return best;
}

/** The split wood in a synced camp profile (PlayerState.fishing). */
function woodOf(fishing: string): Partial<Record<WoodKind, number>> {
  try {
    return (JSON.parse(fishing || "{}") as { wood?: Partial<Record<WoodKind, number>> }).wood ?? {};
  } catch {
    return {};
  }
}

/** The woods' permits in a synced camp profile. */
function campOf(fishing: string): { ranger: boolean; dayPermits: number } {
  try {
    const v = JSON.parse(fishing || "{}") as { ranger?: boolean; dayPermits?: number };
    return { ranger: v.ranger === true, dayPermits: Math.max(0, Number(v.dayPermits) || 0) };
  } catch {
    return { ranger: false, dayPermits: 0 };
  }
}

/** The Forest Whisper Incense sticks in a synced camp profile's crate. */
function incenseOf(fishing: string): number {
  try {
    const crafts = (JSON.parse(fishing || "{}") as { crafts?: { c?: string }[] }).crafts ?? [];
    return crafts.filter((c) => c?.c === "whisper_incense").length;
  } catch {
    return 0;
  }
}

/** The Firewood bundles in a synced camp profile. */
function firewoodOf(fishing: string): number {
  try {
    return Math.max(0, Number((JSON.parse(fishing || "{}") as { firewood?: number }).firewood) || 0);
  } catch {
    return 0;
  }
}

/** "5h 12m", "12m", "<1m": the time until the daily rollover. */
function untilTomorrow(short = false) {
  const minutes = Math.floor(msUntilNextDay() / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return short ? `${h}h` : `${h}h ${m}m`;
  return m > 0 ? `${m}m` : "<1m";
}

interface DockProps {
  player: PlayerState;
  /** Everyone in the world (which of the dock's fishing spots are taken). */
  players: Record<string, PlayerState>;
  mapId: MapId;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string;
  /** Water the plant in reach (PLANT_WATER). */
  onWater: (plantId: string) => void;
  /** The campfire's guitar (GUITAR), wood on the fire, the stew, the picnic table and AFK fishing. */
  onCampfire: (packet: CampfirePacket) => void;
  /** The campfire's hearth (the fire's fuel, the Dutch oven, the picnic table's plates). */
  hearth: HearthState;
  /** Who is at each of the casino's one-player machines (state.machines). */
  machines: Record<string, string>;
  /** The casino's packets (Excuse me). */
  onCasino: (packet: CasinoPacket) => void;
}

const SCAN_MS = 120;

export function ActionDock({ player, players, mapId, chairs, toggleables, localSessionId, hearth, machines, onWater, onCampfire, onCasino }: DockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ players, chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, action: player.action, onWater, onCampfire, hearth, player, machines, onCasino });
  latest.current = { players, chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, action: player.action, onWater, onCampfire, hearth, player, machines, onCasino };
  const actionsRef = useRef<Action[]>([]);

  // E: the best action in reach (pickE), never while typing or with a panel open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const best = pickE(actionsRef.current);
      if (!best) return;
      e.preventDefault();
      best.run();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { players, chairs, toggleables, mapId, localSessionId, sitting, watered, action, onWater, onCampfire, hearth, player, machines, onCasino } = latest.current;
      const found: Action[] = [];
      const reach = (p: ToggleableSyncState) => {
        const a = APPROACH_POINTS[p.propId];
        return Math.min(Math.hypot(p.x - cameraFocus.x, p.z - cameraFocus.z), a ? Math.hypot(a.x - cameraFocus.x, a.z - cameraFocus.z) : Infinity);
      };

      // the campfire: roast from beside the fire or a log bench round it; fish from a spot on the dock;
      // play the guitar sitting on a log
      const onLog = Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.style === "log");
      const bonfire = Object.values(toggleables).find((p) => p.kind === "bonfire");
      if (bonfire && action !== "grill" && (onLog || (!sitting && reach(bonfire) <= BONFIRE_REACH))) {
        const id = bonfire.propId;
        if (hearth.fuel <= 0) {
          // the fire's out: relight it with the humblest log you carry (nothing to roast over embers)
          const wood = woodOf(player.fishing);
          const item = WOOD_KINDS.find((k) => (wood[k] ?? 0) > 0);
          found.push({
            key: `relight:${item ?? "none"}`,
            type: "roast",
            label: "🔥 Relight Bonfire (Requires 1 Wood)",
            hint: item ? `Put a ${WOOD[item].name} on the embers` : "Fell a Soft Pine round the clearing for a log first",
            run: () => (item ? onCampfire({ type: "ADD_FUEL", item }) : pushToast("You need a log to relight the fire: fell a Soft Pine round the clearing", { emoji: "🪵" })),
          });
        } else {
          // seated, the panel opens where you are; standing, you walk up to the fire first
          const run = onLog ? () => window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: "roast", propId: id } })) : () => interactBridge.current?.useProp(id);
          found.push({ key: `roast:${id}`, type: "roast", label: "🍡 Roast & Grill", hint: "Roast a marshmallow or grill a skewer: pull it out in the green for +5 coins", run });
        }
      }
      // the hearth: wood on the fire, and the Dutch oven over it (from the fire's side or a seat round it)
      if (bonfire && (onLog || (!sitting && reach(bonfire) <= BONFIRE_REACH))) {
        // the humblest wood first (pine, then oak, then Golden Charcoal: it sells best to Buster)
        const wood = woodOf(player.fishing);
        const item = WOOD_KINDS.find((k) => (wood[k] ?? 0) > 0);
        // split Firewood first when there is some: it is what it is for
        const firewood = firewoodOf(player.fishing);
        if (firewood > 0 && hearth.fuel < 100 && action !== "grill") {
          found.push({ key: `fuel:firewood:${firewood}`, type: "fuel", label: `🪵 Add Firewood ×${firewood}`, hint: `A bundle of split Firewood: +${FIREWOOD_FUEL}% to the fire`, run: () => onCampfire({ type: "ADD_FUEL", item: "firewood" }) });
        } else if (item && hearth.fuel > 0 && hearth.fuel < 100 && action !== "grill") {
          const n = wood[item] ?? 0;
          found.push({ key: `fuel:${item}:${n}`, type: "fuel", label: `${WOOD[item].emoji} Add ${WOOD[item].name} ×${n}`, hint: "Build the fire up: above 70% everyone gets the Cozy Aura", run: () => onCampfire({ type: "ADD_FUEL", item }) });
        }
        // Forest Whisper Incense from the crate onto the fire: luck for the whole room
        const incense = incenseOf(player.fishing);
        if (incense > 0 && hearth.fuel > 0 && action !== "grill") found.push({ key: `incense:${incense}`, type: "fuel", label: `🪔 Burn Incense ×${incense}`, hint: "Forest Whisper Incense on the bonfire: rare fish likelier for everyone in the room for 10 minutes", run: () => onCampfire({ type: "BURN_INCENSE" }) });
        const stew = hearth.stew;
        const ready = stew.phase === "ready" && stew.servings > 0 && !stew.served.includes(player.userId);
        const open = () => window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: "cooking", propId: "bonfire" } }));
        if (ready) found.push({ key: "stew:scoop", type: "stew", label: "🥣 Scoop Stew", hint: "A warm bowl: Well-Fed for 8 minutes", run: () => onCampfire({ type: "STEW_SCOOP" }) });
        else found.push({ key: `stew:${stew.phase}`, type: "stew", label: stew.phase === "cooking" ? "🫕 Stew Simmering" : "🍲 Dutch Oven", hint: "Add fish, mushrooms or berries to the communal pot", run: open });
      }
      // the picnic table: leave the skewer in hand for a friend, or take one somebody left
      if (mapId === "campfire_night" && Math.hypot(CAMPFIRE_LAYOUT.picnic.x - cameraFocus.x, CAMPFIRE_LAYOUT.picnic.z - cameraFocus.z) <= PICNIC_REACH) {
        const snack = parseSnack(player.snack);
        if (player.holding === "skewer" && snack && action !== "grill") {
          found.push({ key: "picnic:place", type: "picnic", label: "🍢 Leave on Table", hint: "Put your skewer on a plate for a friend to grab", run: () => onCampfire({ type: "PICNIC_PLACE" }) });
        } else if (hearth.picnic.length > 0 && (action === "" || action === "guitar") && player.holding !== "jar") {
          const plate = hearth.picnic[0];
          found.push({ key: `picnic:take:${hearth.picnic.length}`, type: "picnic", label: `${ROAST_FOOD_INFO[plate.food].emoji} Grab a Skewer`, hint: `${plate.by} left a ${ROAST_FOOD_INFO[plate.food].name.toLowerCase()} here: Well-Fed for 8 minutes`, run: () => onCampfire({ type: "PICNIC_TAKE", plate: 0 }) });
        }
      }
      // Barnaby's tackle stall by the dock
      if (mapId === "campfire_night" && !sitting) {
        const angler = toggleables.barnaby;
        if (angler && Math.min(reach(angler), Math.hypot(BARNABY_FRONT.x - cameraFocus.x, BARNABY_FRONT.z - cameraFocus.z)) <= BARNABY_REACH + 0.6) {
          const id = angler.propId;
          found.push({ key: `barnaby:${id}`, type: "barnaby", label: "🦦 Talk to Barnaby", hint: "Sell your creel, buy rods and bait", run: () => interactBridge.current?.useProp(id) });
        }
        // Buster's stall and the workbench beside it: only the nearer one is offered, so walking up
        // to either never shows the other's button too
        const lumberjack = toggleables.buster;
        const bench = toggleables.workbench;
        const toBuster = lumberjack ? Math.min(reach(lumberjack), Math.hypot(BUSTER_FRONT.x - cameraFocus.x, BUSTER_FRONT.z - cameraFocus.z)) : Infinity;
        const toBench = bench ? Math.min(reach(bench), Math.hypot(WORKBENCH_FRONT.x - cameraFocus.x, WORKBENCH_FRONT.z - cameraFocus.z)) : Infinity;
        if (lumberjack && toBuster <= BUSTER_REACH + 0.6 && toBuster <= toBench) {
          const id = lumberjack.propId;
          found.push({ key: `buster:${id}`, type: "buster", label: "🦫 Talk to Buster", hint: "Sell wood and carvings, buy axes and bigger carriers", run: () => interactBridge.current?.useProp(id) });
        } else if (bench && toBench <= WORKBENCH_REACH + 0.4) {
          const id = bench.propId;
          found.push({ key: `workbench:${id}`, type: "workbench", label: "🪚 Workbench", hint: "Carve your logs into artisan pieces worth far more", run: () => interactBridge.current?.useProp(id) });
        }
      }
      // the camp's newer corners: the archway between the campfire and the woods, the slingshot
      // gallery, the splitting blocks; in the woods, the tree in reach, Bramble, the animals
      if ((mapId === "campfire_night" || mapId === "whispering_woods") && !sitting && action === "") {
        const px = cameraFocus.x;
        const pz = cameraFocus.z;
        const arch = Object.values(toggleables).find((p) => p.kind === "archway");
        if (arch && reach(arch) <= 2.0) {
          const id = arch.propId;
          const camp = campOf(player.fishing);
          if (mapId === "whispering_woods") found.push({ key: `arch:${id}`, type: "travel", label: "🏕️ Back to the Campfire", hint: "Through the branch archway, back to the fire", run: () => interactBridge.current?.useProp(id) });
          else
            found.push({
              key: `arch:${id}:${camp.ranger}:${camp.dayPermits}`,
              type: "travel",
              label: "🌲 Enter the Whispering Woods",
              hint: camp.ranger ? "Your Ranger's Badge: the woods are yours" : camp.dayPermits > 0 ? `A Day Trip Permit is stamped on the way in (you hold ${camp.dayPermits})` : "You'll need a Day Trip Permit or the Ranger's Badge (Buster sells both)",
              run: () => interactBridge.current?.useProp(id),
            });
        }
        const gallery = Object.values(toggleables).find((p) => p.kind === "slingshot");
        if (gallery && reach(gallery) <= 2.4) {
          const id = gallery.propId;
          found.push({ key: `sling:${id}`, type: "slingshot", label: "🎯 Slingshot Gallery", hint: "45 seconds, 15 stones: knock down the cans, ducks and owls (and the Golden Acorn!)", run: () => interactBridge.current?.useProp(id) });
        }
        const block = Object.values(toggleables).find((p) => p.kind === "splitblock");
        if (block && reach(block) <= 1.9) {
          const id = block.propId;
          found.push({ key: `split:${id}`, type: "split", label: "🪓 Split Logs", hint: "Split your logs into Firewood bundles for the bonfire", run: () => interactBridge.current?.useProp(id) });
        }
        const tree = treeTarget.id ? FELL_TREE_AT.get(treeTarget.id) : undefined;
        if (tree && tree.map === mapId) {
          const info = TREES[tree.kind];
          const d = Math.hypot(tree.x - cameraFocus.x, tree.z - cameraFocus.z);
          if (tree.titan) found.push({ key: `fell:${tree.id}`, type: "chop", d, label: `🌳 Fell the ${TITAN.name}`, hint: `${TITAN.rounds[0]}-${TITAN.rounds[1]} rounds on the ring, any axe: ${TITAN.logs[0]}-${TITAN.logs[1]} heavy logs worth ${TITAN.mult}x each`, run: () => interactBridge.current?.useProp(`tree_${tree.id}`) });
          else found.push({ key: `fell:${tree.id}`, type: "chop", d, label: `🪓 Fell ${info.name} · T${info.tier}`, hint: `Land ${info.rounds[0]}-${info.rounds[1]} rounds on the ring and it comes down (${WOOD[info.wood].name} logs, bigger trees worth more). Needs a T${info.tier} axe or better`, run: () => interactBridge.current?.useProp(`tree_${tree.id}`) });
        }
        if (mapId === "whispering_woods") {
          if (Math.hypot(BRAMBLE_FRONT.x - px, BRAMBLE_FRONT.z - pz) <= BRAMBLE_REACH + 0.6) found.push({ key: "bramble", type: "barnaby", label: "🐻 Talk to Bramble", hint: "The forester: sell logs and by-products, buy any axe and a bigger carrier", run: () => interactBridge.current?.useProp("bramble") });
          // Bramble's advanced workbench, right beside his counter
          if (Math.hypot(FOREST_WORKBENCH_FRONT.x - px, FOREST_WORKBENCH_FRONT.z - pz) <= WORKBENCH_REACH + 0.6) found.push({ key: "workbench_adv", type: "workbench", label: "🪚 Advanced Workbench", hint: "Bramble's bench: finer tools, a better chance of a Masterwork", run: () => interactBridge.current?.useProp("workbench_adv") });
          if (Math.hypot(FINLEY_FRONT.x - px, FINLEY_FRONT.z - pz) <= FINLEY_REACH + 0.6) found.push({ key: "finley", type: "barnaby", label: "🦦 Talk to Finley", hint: "The river's angler: sell fish, buy any rod, a bigger livewell and bait", run: () => interactBridge.current?.useProp("finley") });
          for (const a of FOREST_ANIMALS) {
            if (Math.hypot(a.x - px, a.z - pz) > ANIMAL_REACH + 0.3) continue;
            found.push({ key: `feed:${a.propId}`, type: "critter", label: a.kind === "deer" ? "🦌 Feed the Deer" : "🐇 Feed the Rabbits", hint: "A berry or a mushroom from your forage bag", run: () => interactBridge.current?.useProp(a.propId) });
          }
        }
      }
      // the Velvet Casino: Mr. Vance's cage, the slot row, the roulette and blackjack tables, the doors
      if (isCasinoMap(mapId)) {
        const px = cameraFocus.x;
        const pz = cameraFocus.z;
        if (!sitting) {
          const cage = Object.values(toggleables).find((p) => p.kind === "cashier");
          if (cage && Math.min(reach(cage), Math.hypot(CASHIER_FRONT.x - px, CASHIER_FRONT.z - pz)) <= CASHIER_REACH + 0.4) {
            const id = cage.propId;
            found.push({ key: `cashier:${id}`, type: "cashier", label: "🏦 Cashier", hint: "Mr. Vance changes coins into Velvet Chips and back, one for one", run: () => interactBridge.current?.useProp(id) });
          }
          let slot: { id: string; d: number } | null = null;
          for (const p of Object.values(toggleables)) {
            if (p.kind !== "slot") continue;
            const d = reach(p);
            if (d <= 1.3 && (!slot || d < slot.d)) slot = { id: p.propId, d };
          }
          if (slot) {
            const id = slot.id;
            const limit = slotLimit(id);
            const who = machines[id] ?? "";
            if (who && who !== localSessionId) {
              // somebody else's machine: shown, greyed out; a patron can be asked to finish up
              const npc = isNpcOccupant(who);
              found.push({ key: `slots:${id}:busy`, type: "slots", label: npc ? "[ In Use by Patron ]" : "[ In Use ]", hint: "Someone is currently playing here! Please wait a moment or find an open machine.", disabled: true, run: () => {} });
              if (npc) found.push({ key: `excuse:${id}`, type: "excuse", label: "[ 💬 Excuse Me ]", hint: "Ask the patron, nicely, to finish up: the machine is held for you a moment", run: () => onCasino({ type: "EXCUSE_ME", propId: id }) });
            } else {
              found.push({ key: `slots:${id}`, type: "slots", label: id === VAULT_SLOT_ID ? "🏆 Golden Vault" : "🎰 Play Slots", hint: `Stake ${chipText(limit.min)} to ${chipText(limit.max)} chips: three of a kind pays up to 75x`, run: () => interactBridge.current?.useProp(id) });
            }
          }
          if (mapId === "velvet_casino" && Math.hypot(ROULETTE_CENTER.x - px, ROULETTE_CENTER.z - pz) < ROULETTE_BET_RADIUS) {
            found.push({ key: "roulette", type: "roulette", label: "🎡 Roulette", hint: "Open the betting board: chips on red, black, odd, even or a number", run: () => window.dispatchEvent(new CustomEvent("cozy-open-roulette")) });
          }
          const doors = Object.values(toggleables).find((p) => p.kind === "portal");
          if (doors && Math.min(reach(doors), Math.hypot(EXIT_FRONT.x - px, EXIT_FRONT.z - pz)) <= 1.6) {
            const id = doors.propId;
            found.push({ key: `exit:${id}`, type: "exit", label: "🚪 Leave Casino", hint: "Back to the Lounge, or anywhere else", run: () => interactBridge.current?.useProp(id) });
          }
          const kindNear = (kind: string, within: number) => {
            let best: { p: ToggleableSyncState; d: number } | null = null;
            for (const p of Object.values(toggleables)) {
              if (p.kind !== kind) continue;
              const d = reach(p);
              if (d <= within && (!best || d < best.d)) best = { p, d };
            }
            return best?.p ?? null;
          };
          const use = (p: ToggleableSyncState) => () => interactBridge.current?.useProp(p.propId);
          const zara = kindNear("fortune", MACHINE_REACH);
          if (zara && Math.hypot(ZARA_FRONT.x - px, ZARA_FRONT.z - pz) <= MACHINE_REACH + 0.4) found.push({ key: "fortune", type: "fortune", label: "🔮 Madame Zara", hint: "Today's fortune (a lucky one brings a few chips)", run: use(zara) });
          const capsule = kindNear("gachapon", 1.5);
          if (capsule && Math.hypot(GACHAPON_FRONT.x - px, GACHAPON_FRONT.z - pz) <= MACHINE_REACH) found.push({ key: "capsule", type: "capsule", label: "🎁 Capsule Machine", hint: `A title or an emote for ${CAPSULE_COST} chips`, run: use(capsule) });
          // the tables played from a panel beside them
          const games: [Exclude<CasinoGameTable, "poker" | "poker_vip" | "baccarat" | "baccarat_hall">, string, string, string][] = [
            ["bigsix", "big_six", "🎡 Big Six", `The Big Six wheel: 1x to the 40x Joker (${chipText(TABLE_LIMITS.bigsix.min)} to ${chipText(TABLE_LIMITS.bigsix.max)} a bet)`],
            ["craps", "craps_table", "🎲 Craps", `Your own dice: Pass Line, Field or Any 7 (${chipText(TABLE_LIMITS.craps.min)} to ${chipText(TABLE_LIMITS.craps.max)} a bet)`],
            ["derby", "derby_table", "🏇 Turf Club", `A ticket on one of four clockwork horses (${chipText(TABLE_LIMITS.derby.min)} to ${chipText(TABLE_LIMITS.derby.max)})`],
            ["pusher", "coin_pusher", "🪙 Coin Pusher", "Drop a coin in the green: the better the drop, the bigger the push"],
            ["pusher_high", "coin_pusher_high", "👑 High-Roller Pusher", "The gold-trimmed pusher: bigger coins, bigger cascades"],
            ["billiards", "billiards_table", "🎱 Play Pool", "8-ball on the floor's table: a rack of your own, or a match against a friend"],
            ["pinball", "pinball_01", "🕹️ Pinball", "A vintage pinball machine: free play, for the high score"],
          ];
          for (const [game, propId, label, hint] of games) {
            const p = toggleables[propId];
            if (!p || !nearGameTable(game, px, pz)) continue;
            // the coin pusher is one player's at a time, like the slots
            const who = game === "pusher" || game === "pusher_high" ? (machines[propId] ?? "") : "";
            if (who && who !== localSessionId) {
              const npc = isNpcOccupant(who);
              found.push({ key: `pusher:busy`, type: "pusher", label: npc ? "[ In Use by Patron ]" : "[ In Use ]", hint: "Someone is currently playing here! Please wait a moment or find an open machine.", disabled: true, run: () => {} });
              if (npc) found.push({ key: `excuse:${propId}`, type: "excuse", label: "[ 💬 Excuse Me ]", hint: "Ask the patron, nicely, to finish up: the machine is held for you a moment", run: () => onCasino({ type: "EXCUSE_ME", propId }) });
            } else found.push({ key: `${game}:${propId}`, type: game as Action["type"], label, hint, run: use(p) });
          }
          // Bruno's gilded doors on the stage: up to the penthouse with a pass (or one to buy); in
          // the penthouse, the elevator back down
          const up = mapId === "casino_vip";
          const door = toggleables[up ? "vip_exit" : "vip_door"];
          const spot = up ? VIP_ARRIVAL : VIP_DOORS_FRONT;
          if (door && Math.hypot(spot.x - px, spot.z - pz) <= MACHINE_REACH + (up ? 0.4 : 0)) {
            if (up) found.push({ key: "vip:out", type: "vip", label: "🛗 Back Down to the Hall", hint: "The elevator down to the High-Roller Stage", run: use(door) });
            else if (player.vipPass) found.push({ key: "vip:in", type: "vip", label: "🕶️ Up to the Penthouse", hint: "Bruno checks your Black Card and rings the elevator", run: use(door) });
            else if (player.vipWristbands > 0) found.push({ key: "vip:in", type: "vip", label: "🎟️ Up to the Penthouse", hint: `Bruno snips one Velvet VIP Wristband (you hold ${player.vipWristbands})`, run: use(door) });
            else found.push({ key: "vip:buy", type: "vip", label: "🎟️ Bruno: VIP Entry", hint: `A Velvet VIP Wristband (${VIP_WRISTBAND.price} coins, one night) or The Black Card (${VIP_PASS.price.toLocaleString("en-US")} coins, for good)`, run: use(door) });
          }
        }
        // what you can use standing or from a seat within reach: the tip jars, the bar, the paper, the piano
        for (const [dealer, jar] of Object.entries(TIP_JARS)) {
          const near = sitting ? Math.hypot(jar.x - px, jar.z - pz) <= MACHINE_REACH : Math.min(Math.hypot(jar.front.x - px, jar.front.z - pz), Math.hypot(jar.x - px, jar.z - pz)) <= MACHINE_REACH - 0.2;
          const prop = toggleables[`tipjar_${dealer}`];
          if (near && prop) found.push({ key: `tip:${dealer}`, type: "tip", label: `🪙 Tip ${DEALER_TIP} Chips`, hint: `A tip for ${dealer === "boris" ? "Boris" : "Madame Vivienne"}: a bow and a sparkle`, run: () => interactBridge.current?.useProp(prop.propId) });
        }
        const menu = toggleables.bar_menu;
        if (menu && barDistance(px, pz) <= BAR_REACH) found.push({ key: "bar", type: "bar", label: "🍸 Bar Menu", hint: `Pippin's drinks, and his ${BAR_SNACK.name} on the house`, run: () => interactBridge.current?.useProp(menu.propId) });
        // the tables played sitting down: standing by one, the dock walks you to its nearest free seat
        // (sitting down opens it); a full one you can still watch (blackjack, baccarat); on a seat of
        // its own, it opens right there
        const seated = (propId: string, near: boolean, label: string, watch: string, hint: string, type: Action["type"]) => {
          const game = seatedGameOf(propId);
          const prop = toggleables[propId];
          if (!game || !prop) return;
          const mine = game.seats.some((s) => chairs[s]?.occupiedBy === localSessionId);
          if (!mine && (sitting || !near)) return;
          const full = !mine && game.seats.every((s) => chairs[s]?.occupiedBy && chairs[s].occupiedBy !== localSessionId);
          found.push({ key: `${type}:${propId}:${full}`, type, label: full ? (game.spectate ? watch : `${label} · Full`) : label, hint: full ? "Table is full — please wait or spectate" : hint, run: () => interactBridge.current?.useProp(propId) });
        };
        seated("poker_table", nearGameTable("poker", px, pz), "♠ Texas Hold'em", "", `No-Limit Hold'em with Boris and the regulars: buy in for ${chipText(TABLE_LIMITS.poker.min)} to ${chipText(TABLE_LIMITS.poker.max)}`, "poker");
        seated("vip_poker_table", nearGameTable("poker_vip", px, pz), "♠ High-Limit Hold'em", "", `Buy in for ${chipText(TABLE_LIMITS.poker_vip.min)} to ${chipText(TABLE_LIMITS.poker_vip.max)} with Boris and Baron von Fox`, "poker");
        seated("baccarat_table", nearGameTable("baccarat", px, pz), "🂡 Baccarat", "👀 Watch Baccarat", `Punto Banco, ${chipText(TABLE_LIMITS.baccarat.min)} to ${chipText(TABLE_LIMITS.baccarat.max)} a coup: Player, Banker or Tie`, "baccarat");
        seated("hall_baccarat_table", nearGameTable("baccarat_hall", px, pz), "🂡 Baccarat", "👀 Watch Baccarat", `Scarlett's Punto Banco, ${chipText(TABLE_LIMITS.baccarat_hall.min)} to ${chipText(TABLE_LIMITS.baccarat_hall.max)} a coup: Player, Banker or Tie`, "baccarat");
        const paper = toggleables.velvet_gazette;
        if (paper && Math.hypot(paper.x - px, paper.z - pz) <= GAZETTE_REACH) found.push({ key: "gazette", type: "gazette", label: "📰 Read the Gazette", hint: "The Velvet Gazette: tonight's big wins and the house's gossip", run: () => interactBridge.current?.useProp(paper.propId) });
        const keys = toggleables.piano_keys;
        if (keys) seated("piano_keys", Math.hypot(keys.x - px, keys.z - pz) <= PIANO_REACH, "🎹 Play Piano", "", "Sit at the baby grand: a recital for the hall, or play it yourself", "piano");
        // blackjack is played from the tables' stools
        for (const table of BLACKJACK_TABLES) {
          const limit = TABLE_LIMITS[table.tier];
          const dealer = table.dealer === "gideon" ? "Gideon" : "Cedric";
          seated(table.id, Math.hypot(table.x - px, table.z - pz) < table.reach, `🃏 Blackjack · ${table.label}`, `👀 Watch ${table.label}`, `${table.tier === "blackjack_high" ? "High stakes" : "Casual"}: ${chipText(limit.min)} to ${chipText(limit.max)} chips, ${dealer} stands on 17, blackjack pays 3:2`, "blackjack");
        }
      }
      // a fishing spot: at the campfire, sitting on the dock's edge or in the canoe; in the woods, on
      // the river bank (standing at a spot, or sitting on its log or rock). There: cast and reel by
      // hand, or feet up (AFK) with the line in
      const mySeat = Object.values(chairs).find((c) => c.occupiedBy === localSessionId);
      const woodsStand = mapId === "whispering_woods" && !sitting ? FOREST_FISHING.find((f) => Math.hypot(f.stand.x - cameraFocus.x, f.stand.z - cameraFocus.z) <= FISHING_REACH + 0.8) : undefined;
      const mySpot = mySeat ? (spotOfSeat(mySeat.propId) ?? woodsSpotOfSeat(mySeat.propId)) : woodsStand?.propId;
      const AFK_HINT = "Feet up, line in: a common every 12-16s, rarer fish longer (up to 90s for a mythic; premium bait a quarter quicker). Never a King Size: those take a hand on the reel";
      if (mySpot && action === "") {
        const id = mySpot;
        found.push({ key: `cast:${id}`, type: "fish", label: "🎣 Manual Reel", hint: "Cast into the river; tap when the bobber dips, then reel it in (in a King-Size Surge, 4 in 10 are King Size)", run: () => interactBridge.current?.useProp(id) });
        found.push({ key: "afk:on", type: "afk", label: "☕ Auto AFK", hint: AFK_HINT, run: () => onCampfire({ type: "AFK", on: true }) });
      }
      if (mySpot && action === "fish") found.push({ key: "afk:on", type: "afk", label: "☕ Auto AFK", hint: AFK_HINT, run: () => onCampfire({ type: "AFK", on: true }) });
      if (mySpot && action === "afkfish") found.push({ key: "afk:off", type: "afk", label: "🎣 Manual Reel", hint: "Back to watching the bobber: tap when it dips, then reel it in", run: () => onCampfire({ type: "AFK", on: false }) });
      // the livewell full: resting by the water with a mug until there's room again
      if (mySpot && action === "rest") {
        found.push({ key: "afk:resume", type: "afk", label: "☕ Resume Auto AFK", hint: "Once there's room in the livewell (sell to Barnaby or Finley), back to AFK fishing", run: () => onCampfire({ type: "AFK", on: true }) });
      }
      if (!mySpot && !sitting && action === "") {
        let spot: { id: string; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "fishing") continue;
          const seat = chairs[dockSeatOf(p.propId) || (FOREST_FISHING.find((f) => f.propId === p.propId)?.seat ?? "")];
          if (seat && seat.occupiedBy && seat.occupiedBy !== localSessionId) continue; // someone's fishing there
          const d = reach(p);
          if (d <= FISHING_REACH + 1.6 && (!spot || d < spot.d)) spot = { id: p.propId, d };
        }
        if (spot) {
          const id = spot.id;
          found.push({ key: `fish:${id}`, type: "fish", label: "🎣 Go Fishing", hint: mapId === "whispering_woods" ? "Step up to the bank (or sit on its log or rock) and cast; then reel by hand, or Auto AFK" : "Sit on the dock's edge and cast; then reel by hand, or Auto AFK", run: () => interactBridge.current?.useProp(id) });
        }
      }
      // the telescope, the raccoon, the fireflies and the foraging patches: walk up to them
      if (!sitting && action === "") {
        const tele = Object.values(toggleables).find((p) => p.kind === "telescope");
        if (tele && reach(tele) <= STARGAZE_REACH + 0.3) {
          const id = tele.propId;
          found.push({ key: `gaze:${id}`, type: "stargaze", label: "🔭 Stargaze", hint: "Look through the telescope: tap shooting stars for +10 coins", run: () => interactBridge.current?.useProp(id) });
        }
        const raccoon = Object.values(toggleables).find((p) => p.kind === "critter");
        if (raccoon && reach(raccoon) <= CRITTER_REACH + 0.3) {
          const id = raccoon.propId;
          found.push({ key: `critter:${id}`, type: "critter", label: "🍪 Feed Raccoon", hint: "Toss it a treat", run: () => interactBridge.current?.useProp(id) });
        }
        const grove = Object.values(toggleables).find((p) => p.kind === "fireflies");
        if (grove && reach(grove) <= FIREFLY_REACH + 0.3) {
          const id = grove.propId;
          const jar = players[localSessionId]?.holding === "jar";
          found.push({ key: `fireflies:${id}:${jar}`, type: "fireflies", label: jar ? "✨ Release Fireflies" : "✨ Catch Fireflies", hint: jar ? "Let the fireflies go" : "A swipe of the net: a glowing jar of fireflies to carry", run: () => interactBridge.current?.useProp(id) });
        }
        let patch: { id: string; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "foraging" || !p.on) continue;
          const d = reach(p);
          if (d <= FORAGE_REACH + 0.3 && (!patch || d < patch.d)) patch = { id: p.propId, d };
        }
        if (patch) {
          const id = patch.id;
          const berries = FORAGE_SPOTS.find((f) => f.propId === id)?.kind === "berries";
          found.push({ key: `forage:${id}`, type: "forage", label: berries ? "🫐 Forage" : "🍄 Forage", hint: berries ? "Pick the glowing night berries: +5 coins" : "Pick the spotted red mushrooms: +5 coins", run: () => interactBridge.current?.useProp(id) });
        }
      }
      if (onLog) {
        const playing = action === "guitar";
        found.push({ key: `guitar:${playing}`, type: "guitar", label: playing ? "⏹ Stop Guitar" : "🎸 Play Guitar", run: () => onCampfire({ type: "GUITAR", playing: !playing }) });
      }

      // the radio: tune it from beside it, or from a pouf round its table
      const radio = Object.values(toggleables).find((p) => p.kind === "radio");
      const onPouf = Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.propId.startsWith("pouf_"));
      if (radio && (onPouf || (!sitting && reach(radio) <= RADIO_REACH))) {
        const id = radio.propId;
        found.push({ key: `radio:${id}`, type: "radio", label: "📻 Tune Radio", run: () => interactBridge.current?.useProp(id) });
      }
      if (!sitting) {
        // Chloe at the Velvet Boutique, by her cheval mirror
        const boutique = toggleables.boutique_chloe;
        if (boutique && Math.min(Math.hypot(BOUTIQUE.chloe.x - cameraFocus.x, BOUTIQUE.chloe.z - cameraFocus.z), Math.hypot(BOUTIQUE.approach.x - cameraFocus.x, BOUTIQUE.approach.z - cameraFocus.z)) <= BOUTIQUE_REACH) {
          found.push({ key: "boutique", type: "boutique", label: "🎀 The Velvet Boutique", hint: "Chloe's latest collection: try it on in the mirror", run: () => interactBridge.current?.useProp("boutique_chloe") });
        }
        // the coffee machine
        const kitchen = Object.values(toggleables).find((p) => p.kind === "kitchen");
        if (kitchen && reach(kitchen) <= KITCHEN_REACH) {
          const id = kitchen.propId;
          found.push({ key: `brew:${id}`, type: "brew", label: "☕ Brew Drink", run: () => interactBridge.current?.useProp(id) });
        }
        // the nearest plant in reach: water it, or (already watered today) it is happy
        let plant: { id: string; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (!isWaterable(p.propId)) continue;
          const d = reach(p);
          if (d <= PLANT_REACH && (!plant || d < plant.d)) plant = { id: p.propId, d };
        }
        if (plant) {
          const id = plant.id;
          const done = watered.split(",").includes(id);
          if (done) {
            // watered today: happy until the day rolls over, and the pill counts down to it
            const left = untilTomorrow(true);
            found.push({ key: `water:${id}:done:${left}`, type: "water", label: `🌿 Happy Plant · ${left}`, hint: `Watered today. Thirsty again in ${untilTomorrow()}.`, run: () => pushToast(`The plant is happy and hydrated! Thirsty again in ${untilTomorrow()}.`, { emoji: "🌿" }) });
          } else {
            found.push({ key: `water:${id}`, type: "water", label: "🪴 Water Plant", hint: `Thirsty! Water it for +${PLANT_WATER_COINS} coins (each plant once a day).`, run: () => onWater(id) });
          }
        }
      }

      // the games table: offered as you walk up to it, and while you sit on one of its chairs
      const board = Object.values(toggleables).find((p) => p.kind === "boardgame");
      if (board) {
        const a = APPROACH_POINTS[board.propId];
        const atTable = Object.values(chairs).some((c) => c.occupiedBy === localSessionId && c.propId.startsWith("games_"));
        const d = Math.min(Math.hypot(board.x - cameraFocus.x, board.z - cameraFocus.z), a ? Math.hypot(a.x - cameraFocus.x, a.z - cameraFocus.z) : Infinity);
        if (atTable || (!sitting && d <= BOARD_REACH)) {
          const id = board.propId;
          // both of its chairs taken by others: walking up just opens the board to watch
          const full = Object.values(chairs).filter((c) => c.propId.startsWith("games_") && c.occupiedBy && c.occupiedBy !== localSessionId).length >= 2;
          found.push({ key: `board:${id}:${full}`, type: "board", label: full ? "👀 Watch Board Game" : "♟️ Play Board Game", run: () => interactBridge.current?.useProp(id) });
        }
      }

      if (sitting) {
        found.push({ key: "stand", type: "stand", label: isTouchUi() ? "🧍 Stand up" : "🧍 Stand up · Space", hint: "Press Space or move to stand up", run: () => interactBridge.current?.stand() });
      } else {
        const px = cameraFocus.x;
        const pz = cameraFocus.z;

        // the nearest free seat in reach
        let seat: { id: string; d: number } | null = null;
        for (const c of Object.values(chairs)) {
          if (c.occupiedBy && c.occupiedBy !== localSessionId) continue;
          const a = APPROACH_POINTS[c.propId];
          const d = Math.min(Math.hypot(c.x - px, c.z - pz), a ? Math.hypot(a.x - px, a.z - pz) : Infinity);
          if (d <= SEAT_REACH && (!seat || d < seat.d)) seat = { id: c.propId, d };
        }
        if (seat) {
          const id = seat.id;
          found.push({ key: `sit:${id}`, type: "sit", d: seat.d, label: CAMP_SEAT_LABELS[id] ?? "🛋️ Sit", run: () => interactBridge.current?.sit(id) });
        }

        // Mochi is wherever her day has taken her, not at her home spot
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "cat") continue;
          const at = mochiSpot(mapId, Date.now() / 1000);
          const d = Math.min(Math.hypot(at.x - px, at.z - pz), Math.hypot(at.ax - px, at.az - pz));
          if (d <= MOCHI_REACH) {
            const id = p.propId;
            found.push({ key: `pet:${id}`, type: "pet", label: "🐾 Pet Mochi", run: () => interactBridge.current?.useProp(id) });
          }
        }
      }

      // (E reads the freshest list, run closures and all)
      actionsRef.current = found;
      // only touch React state when the set of buttons really changed
      const key = found.map((a) => a.key).join("|");
      if (key !== lastKey) {
        lastKey = key;
        setActions(found);
      }
    };
    scan();
    const timer = window.setInterval(scan, SCAN_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (actions.length === 0) return null;
  const eKey = pickE(actions)?.key;
  return (
    <div style={dockStyle} role="toolbar" aria-label="Actions">
      {actions.map((a) => (
        <button key={a.key} type="button" className={a.disabled ? undefined : "cozy-action"} style={a.disabled ? busyStyle : actionStyle} onClick={a.run} disabled={a.disabled} aria-disabled={a.disabled} title={a.hint}>
          {a.label}
          {a.key === eKey && (
            <span className="kbd-hint" style={eHintStyle} aria-hidden>
              E
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const dockStyle: CSSProperties = { ...glass, ...hudText, display: "flex", gap: 8, padding: 6, borderRadius: 999 };
/** The key cap on the action E would take. */
const eHintStyle: CSSProperties = { marginLeft: 8, padding: "1px 6px", borderRadius: 6, border: "1px solid rgba(59, 36, 16, 0.45)", background: "rgba(255, 255, 255, 0.35)", fontSize: 11, fontWeight: 900 };
const actionStyle: CSSProperties = {
  ...pillButton,
  background: "linear-gradient(180deg, #ffd166, #f4a83a)",
  color: "#3b2410",
  fontSize: 15,
  fontWeight: 800,
  boxShadow: "0 4px 16px rgba(255, 190, 60, 0.55), inset 0 -2px 0 rgba(160, 90, 10, 0.25)",
};
/** A machine somebody else is at: there, but not to be pressed. */
const busyStyle: CSSProperties = { ...actionStyle, background: "linear-gradient(180deg, #8a8078, #6a625c)", color: "#f3ece4", boxShadow: "inset 0 -2px 0 rgba(0, 0, 0, 0.2)", cursor: "not-allowed", opacity: 0.85 };
