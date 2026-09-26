import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PLANT_WATER_COINS, msUntilNextDay, parseBag, parseSnack, ROAST_FOOD_INFO, type CampfirePacket, type ChairSyncState, type MapId, type PlayerState, type ToggleableSyncState } from "@shared/types";
import { BARNABY_FRONT, BARNABY_REACH, BUSTER_FRONT, BUSTER_REACH, CAMPFIRE_LAYOUT, PICNIC_REACH } from "@shared/worlds/campfire";
import { WOOD, WOOD_KINDS, type WoodKind } from "@shared/chop";
import type { HearthState } from "../../hooks/useColyseusRoom";
import { BONFIRE_REACH, CAMP_SEAT_LABELS, CHOP_REACH, CRITTER_REACH, FIREFLY_REACH, FISHING_REACH, FORAGE_REACH, FORAGE_SPOTS, STARGAZE_REACH, dockSeatOf, spotOfSeat } from "@shared/worlds/campfire";
import { APPROACH_POINTS, isWaterable, mochiSpot } from "@shared/props";
import { BOARD_REACH, KITCHEN_REACH, MOCHI_REACH, PLANT_REACH, RADIO_REACH, SEAT_REACH } from "@shared/worlds/lounge";
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
//   [💤 AFK Mode: OFF] / [💤 AFK Mode: ON]  sitting at a fishing spot (the dock's edge, the canoe)
//   [🦦 Talk to Barnaby]  at the angler's tackle stall by the dock
//   [🪓 Talk to Buster]  at the lumberjack's firewood stall by the woodpile
//   [🎣 Go Fishing]  at the dock: sit on its edge at the nearest free spot and cast; sitting on the
//                    edge already, [🎣 Cast Line]
//   [✨ Catch Fireflies] / [✨ Release Fireflies]  in the grove between the hammock and the tipi
//   [🍪 Feed Raccoon]  by the raccoon at the camper van (it spins for joy)
//   [🎸 Play Guitar] / [⏹ Stop Guitar]  sitting on a log bench
//   [🔭 Stargaze]    at the brass telescope by the front fence
//   [🪓 Chop Firewood]  at the chopping block by the woodpile
//   [🍄 Forage] / [🫐 Forage]  at a patch under the pines with something to pick
//   [🧍 Stand up · Space]  while you are sitting, always (a panel closed, a reconnect: never stuck);
//                    Space or any movement key does the same
//
// Buttons are deduplicated by action type: only the nearest target of each type gets one, so
// three stools side by side give one "Sit", not three.

interface Action {
  key: string;
  type: "sit" | "pet" | "board" | "brew" | "radio" | "water" | "roast" | "fuel" | "stew" | "picnic" | "afk" | "barnaby" | "buster" | "fish" | "guitar" | "stargaze" | "chop" | "forage" | "fireflies" | "critter" | "stand";
  label: string;
  /** A longer status line, shown as the button's tooltip. */
  hint?: string;
  run: () => void;
}

/** The split wood in a synced camp profile (PlayerState.fishing). */
function woodOf(fishing: string): Partial<Record<WoodKind, number>> {
  try {
    return (JSON.parse(fishing || "{}") as { wood?: Partial<Record<WoodKind, number>> }).wood ?? {};
  } catch {
    return {};
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
}

const SCAN_MS = 120;
/** A keyboard to press Space on (not a phone or tablet, where the pill is the way up). */
const HAS_KEYBOARD = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;

export function ActionDock({ player, players, mapId, chairs, toggleables, localSessionId, hearth, onWater, onCampfire }: DockProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef({ players, chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, action: player.action, onWater, onCampfire, hearth, player });
  latest.current = { players, chairs, toggleables, mapId, localSessionId, sitting: player.sitting, watered: player.watered, action: player.action, onWater, onCampfire, hearth, player };

  useEffect(() => {
    let lastKey = "";
    const scan = () => {
      const { players, chairs, toggleables, mapId, localSessionId, sitting, watered, action, onWater, onCampfire, hearth, player } = latest.current;
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
        // seated, the panel opens where you are; standing, you walk up to the fire first
        const run = onLog ? () => window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: "roast", propId: id } })) : () => interactBridge.current?.useProp(id);
        found.push({ key: `roast:${id}`, type: "roast", label: "🍡 Roast & Grill", hint: "Roast a marshmallow or grill a skewer: pull it out in the green for +5 coins", run });
      }
      // the hearth: wood on the fire, and the Dutch oven over it (from the fire's side or a seat round it)
      if (bonfire && (onLog || (!sitting && reach(bonfire) <= BONFIRE_REACH))) {
        // the humblest wood first (pine, then oak, then Golden Charcoal: it sells best to Buster)
        const wood = woodOf(player.fishing);
        const item = WOOD_KINDS.find((k) => (wood[k] ?? 0) > 0);
        if (item && hearth.fuel < 100 && action !== "grill") {
          const n = wood[item] ?? 0;
          found.push({ key: `fuel:${item}:${n}`, type: "fuel", label: `${WOOD[item].emoji} Add ${WOOD[item].name} ×${n}`, hint: "Build the fire up: above 70% everyone gets the Cozy Aura", run: () => onCampfire({ type: "ADD_FUEL", item }) });
        }
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
        const angler = Object.values(toggleables).find((p) => p.kind === "angler");
        if (angler && Math.min(reach(angler), Math.hypot(BARNABY_FRONT.x - cameraFocus.x, BARNABY_FRONT.z - cameraFocus.z)) <= BARNABY_REACH + 0.6) {
          const id = angler.propId;
          found.push({ key: `barnaby:${id}`, type: "barnaby", label: "🦦 Talk to Barnaby", hint: "Sell your creel, buy rods and bait", run: () => interactBridge.current?.useProp(id) });
        }
        const lumberjack = Object.values(toggleables).find((p) => p.kind === "lumberjack");
        if (lumberjack && Math.min(reach(lumberjack), Math.hypot(BUSTER_FRONT.x - cameraFocus.x, BUSTER_FRONT.z - cameraFocus.z)) <= BUSTER_REACH + 0.6) {
          const id = lumberjack.propId;
          found.push({ key: `buster:${id}`, type: "buster", label: "🪓 Talk to Buster", hint: "Sell your firewood, buy a better axe", run: () => interactBridge.current?.useProp(id) });
        }
      }
      // the dock: sitting on its edge, cast from there; standing, sit down at the nearest free spot
      const mySeat = Object.values(chairs).find((c) => c.occupiedBy === localSessionId);
      const mySpot = mySeat ? spotOfSeat(mySeat.propId) : undefined;
      if (mySpot && action === "") {
        // sitting on the dock's edge or in the canoe: cast from there
        const id = mySpot;
        found.push({ key: `cast:${id}`, type: "fish", label: "🎣 Cast Line", hint: "Cast into the river; tap when the bobber dips, then reel it in", run: () => interactBridge.current?.useProp(id) });
      }
      // sitting at a spot with the line in (or about to be): feet up, and let the fish come to you
      if (mySpot && (action === "" || action === "fish" || action === "afkfish")) {
        const on = action === "afkfish";
        found.push({ key: `afk:${on}`, type: "afk", label: on ? "💤 AFK Mode: ON" : "💤 AFK Mode: OFF", hint: on ? "A fish into the creel every 25-45s (the rarer, the longer). Tap to watch the bobber again" : "Feet up: a fish into the creel every 25-45s, the rarer the longer", run: () => onCampfire({ type: "AFK", on: !on }) });
      }
      if (!mySpot && !sitting && action === "") {
        let spot: { id: string; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "fishing") continue;
          const seat = chairs[dockSeatOf(p.propId)];
          if (seat && seat.occupiedBy && seat.occupiedBy !== localSessionId) continue; // someone's fishing there
          const d = reach(p);
          if (d <= FISHING_REACH + 1.6 && (!spot || d < spot.d)) spot = { id: p.propId, d };
        }
        if (spot) {
          const id = spot.id;
          found.push({ key: `fish:${id}`, type: "fish", label: "🎣 Go Fishing", hint: "Sit on the dock's edge and cast; tap when the bobber dips, then reel it in", run: () => interactBridge.current?.useProp(id) });
        }
      }
      // the telescope, the chopping block and the foraging patches: walk up to them
      if (!sitting && action === "") {
        const tele = Object.values(toggleables).find((p) => p.kind === "telescope");
        if (tele && reach(tele) <= STARGAZE_REACH + 0.3) {
          const id = tele.propId;
          found.push({ key: `gaze:${id}`, type: "stargaze", label: "🔭 Stargaze", hint: "Look through the telescope: tap shooting stars for +10 coins", run: () => interactBridge.current?.useProp(id) });
        }
        // the nearest of the three chopping stations: its log, or the wait for the next one
        let block: { p: ToggleableSyncState; d: number } | null = null;
        for (const p of Object.values(toggleables)) {
          if (p.kind !== "woodchop") continue;
          const d = reach(p);
          if (d <= CHOP_REACH + 0.3 && (!block || d < block.d)) block = { p, d };
        }
        if (block) {
          const id = block.p.propId;
          if (block.p.on) found.push({ key: `chop:${id}`, type: "chop", label: "🪓 Chop Firewood", hint: "Split the log in three clean swings: firewood to burn or sell", run: () => interactBridge.current?.useProp(id) });
          else found.push({ key: `chop:${id}:wait`, type: "chop", label: "🪵 Next log soon…", hint: "This block's next log arrives in under half a minute. Two more stations round the camp!", run: () => pushToast("A fresh log is on its way to this block. Try another station!", { emoji: "🪵" }) });
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
        found.push({ key: "stand", type: "stand", label: HAS_KEYBOARD ? "🧍 Stand up · Space" : "🧍 Stand up", hint: "Press Space or move to stand up", run: () => interactBridge.current?.stand() });
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
          found.push({ key: `sit:${id}`, type: "sit", label: CAMP_SEAT_LABELS[id] ?? "🛋️ Sit", run: () => interactBridge.current?.sit(id) });
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
  return (
    <div style={dockStyle} role="toolbar" aria-label="Actions">
      {actions.map((a) => (
        <button key={a.key} type="button" className="cozy-action" style={actionStyle} onClick={a.run} title={a.hint}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

const dockStyle: CSSProperties = { ...glass, ...hudText, display: "flex", gap: 8, padding: 6, borderRadius: 999 };
const actionStyle: CSSProperties = {
  ...pillButton,
  background: "linear-gradient(180deg, #ffd166, #f4a83a)",
  color: "#3b2410",
  fontSize: 15,
  fontWeight: 800,
  boxShadow: "0 4px 16px rgba(255, 190, 60, 0.55), inset 0 -2px 0 rgba(160, 90, 10, 0.25)",
};
