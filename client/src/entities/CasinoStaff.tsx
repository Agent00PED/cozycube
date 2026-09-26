import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import { pocketColor, type RouletteResultBroadcast, type SlotBroadcast } from "@shared/casino";
import { CASINO_LAYOUT as L, CASINO_NPCS, casinoZoneAt } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "../scene/kit";
import { CampNpc, type NpcTalk } from "./CampNpc";

// The Velvet Casino's staff and regulars, each a pure loader for their Blender model through
// CampNpc, standing at their spot in CASINO_LAYOUT (its colliders keep everyone off them):
//
//   Mr. Vance        the fox cashier at the Golden Cage's window, on the platform behind its
//                    counter (vance.glb, scripts/blender/build_vance.py): he waves as you open it
//   Boris            the polar bear dealer at the High-Roller Pit's poker table: he greets you as
//                    you step into the pit
//   Madame Vivienne  the poodle croupier at the roulette wheel, rake in paw: she calls each number
//   Jasper           the tuxedo cat on the stool at his own gold machine in Neon Alley, a paw on its
//                    lever: he has something to say about every spin
//   Pippin           the penguin mixologist behind the bar, on its step, shaker in flipper
//
// (boris.glb, vivienne.glb, jasper.glb and pippin.glb: scripts/blender/build_casino_staff.py.)
// Everyone but Mr. Vance, whose window is the cashier's, answers a click with a line of their own.

const URLS = {
  vance: modelUrl("vance.glb"),
  boris: modelUrl("boris.glb"),
  vivienne: modelUrl("vivienne.glb"),
  jasper: modelUrl("jasper.glb"),
  pippin: modelUrl("pippin.glb"),
} as const;

const FRENCH: Record<"red" | "black" | "green", string> = { red: "rouge", black: "noir", green: "vert" };

const BORIS: NpcTalk = {
  height: 1.3,
  clicked: ["The cards are warm tonight, friend. 🃏", "Big stakes, bigger hearts. ❄️", "Poker nights are coming. For now, I deal the smiles.", "Keep your paws where I can see them. Kidding! 🐻‍❄️"],
  greet: { inside: (x, z) => casinoZoneAt(x, z).id === "pit", lines: ["Welcome to the High-Roller Pit, friend. 🎩", "Ah, a high roller! Pull up a chair. 🃏", "Evening! The good tables are back here. ❄️"] },
};

const VIVIENNE: NpcTalk = {
  height: 1.2,
  clicked: ["Faites vos jeux, mes chéris! 🎡", "Rien ne va plus… when I say so. 💋", "Red, black, or your lucky number? ✨", "The wheel remembers everyone who smiles at it."],
  on: {
    rouletteResult: (payload: RouletteResultBroadcast) => {
      if (typeof payload?.result !== "number") return null;
      const colour = FRENCH[pocketColor(payload.result)];
      return payload.winners?.length ? `${payload.result}, ${colour}! Félicitations! ✨` : `${payload.result}, ${colour}. La maison gagne. 🎡`;
    },
  },
};

const JASPER: NpcTalk = {
  height: 1.38,
  clicked: ["Mrrrow? This one's due. I can feel it in my whiskers.", "Purrhaps one more spin… 🎰", "Don't tell Mr. Vance, but I've been here since Tuesday.", "Seven, seven, seven… meow."],
  on: {
    slotSpin: (payload: SlotBroadcast) => {
      if (typeof payload?.win !== "number") return null;
      if (payload.win > payload.bet) return payload.win >= payload.bet * 12 ? "MEOW!! Jackpot paws! 💰" : "Meow! Lucky paws! 🍀";
      if (payload.win === payload.bet) return "Mrrp. A pair: your stake back.";
      return Math.random() < 0.5 ? (Math.random() < 0.5 ? "Meow… so close. 🎰" : "*tail swish*") : null;
    },
  },
};

const PIPPIN: NpcTalk = {
  height: 1.35,
  clicked: ["One Velvet Fizz: shaken, never stirred! 🍸", "The house special? A Midnight Waddle. 🐧", "Care for a cherry on top? 🍒", "Smooth music tonight, eh? 🎷", "Chips at the tables, cocktails on the house!"],
};

const standIn = (color: string, h: number) => {
  const m = matte(color, 0.85);
  return <StandIn material={m} h={h} />;
};
function StandIn({ material, h }: { material: THREE.Material; h: number }) {
  return <mesh geometry={GEO.round} material={material} position={[0, h / 2, 0]} scale={[0.4, h, 0.36]} raycast={noRaycast} />;
}
const STAND_INS = {
  vance: standIn("#c8612b", 1.0),
  boris: standIn("#f2efe8", 1.2),
  vivienne: standIn("#f1e6d2", 1.1),
  jasper: standIn("#1c1a1f", 0.9),
  pippin: standIn("#1e2128", 0.95),
};

export function CasinoStaff({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  return (
    <>
      <CampNpc url={URLS.vance} what="vance.glb" prefix="Vance" at={CASINO_NPCS.vance} y={L.cage.floor} waveEvent="vanceWave" standIn={STAND_INS.vance} subscribeMessages={subscribeMessages} />
      <CampNpc url={URLS.boris} what="boris.glb" prefix="Boris" at={CASINO_NPCS.boris} waveEvent="borisWave" standIn={STAND_INS.boris} subscribeMessages={subscribeMessages} talk={BORIS} />
      <CampNpc url={URLS.vivienne} what="vivienne.glb" prefix="Vivienne" at={CASINO_NPCS.vivienne} waveEvent="vivienneWave" standIn={STAND_INS.vivienne} subscribeMessages={subscribeMessages} talk={VIVIENNE} />
      <CampNpc url={URLS.jasper} what="jasper.glb" prefix="Jasper" at={CASINO_NPCS.jasper} waveEvent="jasperWave" standIn={STAND_INS.jasper} subscribeMessages={subscribeMessages} talk={JASPER} />
      <CampNpc url={URLS.pippin} what="pippin.glb" prefix="Pippin" at={CASINO_NPCS.pippin} y={L.bar.floor} waveEvent="pippinWave" standIn={STAND_INS.pippin} subscribeMessages={subscribeMessages} talk={PIPPIN} />
    </>
  );
}

/** Fetches the staff quietly (the casino's hall is preloaded the same way, by WorldScene). */
export function preloadCasinoStaff() {
  for (const url of Object.values(URLS)) useGLTF.preload(url);
}
