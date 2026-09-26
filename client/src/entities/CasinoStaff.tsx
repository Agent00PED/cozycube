import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import { CASINO_DRINKS, pocketColor, type CasinoPropEvent, type RouletteResultBroadcast, type SlotBroadcast } from "@shared/casino";
import { CASINO_NPCS, casinoZoneAt } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "../scene/kit";
import { CampNpc, type NpcTalk } from "./CampNpc";

// The Velvet Casino's staff and regulars, each a pure loader for their Blender model through
// CampNpc, standing at their spot in CASINO_LAYOUT (its colliders keep everyone off them), at the
// height of the floor under them (the pit's and the lounge's stages, Mr. Vance's and Pippin's
// platforms):
//
//   Mr. Vance        the fox cashier at the Golden Cage's window, on the platform behind its
//                    counter (vance.glb, scripts/blender/build_vance.py): he waves as you open it
//   Boris            the polar bear dealer at the High-Roller Pit's poker table: he greets you as
//                    you step into the pit, and bows for a tip in his jar
//   Madame Vivienne  the poodle croupier at the roulette wheel, rake in paw: she calls each number,
//                    and curtsies for a tip in hers
//   Jasper           the tuxedo cat on the stool at his own gold machine in Neon Alley, a paw on its
//                    lever: he has something to say about every spin
//   Pippin           the penguin mixologist behind the bar, on its step, shaker in flipper: click him
//                    (or the menu by him) for the bar menu; he waves and names each drink he serves
//   Bruno            the bulldog bouncer at the VIP room's doors, arms folded: members only
//
// (boris.glb, vivienne.glb, jasper.glb, pippin.glb and bruno.glb: scripts/blender/build_casino_staff.py.)

const URLS = {
  vance: modelUrl("vance.glb"),
  boris: modelUrl("boris.glb"),
  vivienne: modelUrl("vivienne.glb"),
  jasper: modelUrl("jasper.glb"),
  pippin: modelUrl("pippin.glb"),
  bruno: modelUrl("bruno.glb"),
} as const;

const FRENCH: Record<"red" | "black" | "green", string> = { red: "rouge", black: "noir", green: "vert" };
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const tipFor = (dealer: "boris" | "vivienne") => (type: string, p: CasinoPropEvent) => type === "casinoProp" && p?.kind === "tipjar" && p.dealer === dealer;

const BORIS: NpcTalk = {
  height: 1.3,
  clicked: ["The cards are warm tonight, friend. 🃏", "Big stakes, bigger hearts. ❄️", "Poker nights are coming. For now, I deal the smiles.", "Keep your paws where I can see them. Kidding! 🐻‍❄️"],
  greet: { inside: (x, z) => casinoZoneAt(x, z).id === "pit", lines: ["Welcome to the High-Roller Pit, friend. 🎩", "Ah, a high roller! Pull up a chair. 🃏", "Evening! The good tables are back here. ❄️"] },
  on: {
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "tipjar" && p.dealer === "boris" ? pick(["Much obliged, friend! 🎩", "A gentleman of the felt! ❄️", "Boris thanks you kindly. 🐻‍❄️"]) : null),
  },
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
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "tipjar" && p.dealer === "vivienne" ? pick(["Merci, mon chéri! 💋", "Oh là là, how generous! ✨", "The wheel will remember this. 🎡"]) : null),
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

// Pippin takes no click of his own: the bar menu's pad stands over him (WorldScene)
const PIPPIN: NpcTalk = {
  height: 1.35,
  on: {
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "barmenu" && p.drink ? CASINO_DRINKS[p.drink].line : null),
  },
};

const BRUNO: NpcTalk = {
  height: 1.3,
  clicked: ["Members only, pal. 🕶️", "The VIP room is… occupied. Indefinitely.", "Move along. Nothing to see behind these doors.", "Name's Bruno. The list? Not on it. 📋"],
  on: {
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "vipdoor" ? pick(["Locked. And it stays locked. 🕶️", "Nice try. VIP means Very Invited Persons.", "The doors don't open for rattling, friend.", "Members only. Come back with a membership. Which don't exist."]) : null),
  },
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
  bruno: standIn("#c99a6b", 1.2),
};

const borisBows = tipFor("boris");
const vivienneBows = tipFor("vivienne");
const pippinServes = (type: string, p: CasinoPropEvent) => type === "casinoProp" && p?.kind === "barmenu";

export function CasinoStaff({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const N = CASINO_NPCS;
  return (
    <>
      <CampNpc url={URLS.vance} what="vance.glb" prefix="Vance" at={N.vance} y={N.vance.y} waveEvent="vanceWave" standIn={STAND_INS.vance} subscribeMessages={subscribeMessages} />
      <CampNpc url={URLS.boris} what="boris.glb" prefix="Boris" at={N.boris} y={N.boris.y} waveEvent="borisWave" standIn={STAND_INS.boris} subscribeMessages={subscribeMessages} talk={BORIS} bowOn={borisBows} />
      <CampNpc url={URLS.vivienne} what="vivienne.glb" prefix="Vivienne" at={N.vivienne} y={N.vivienne.y} waveEvent="vivienneWave" standIn={STAND_INS.vivienne} subscribeMessages={subscribeMessages} talk={VIVIENNE} bowOn={vivienneBows} />
      <CampNpc url={URLS.jasper} what="jasper.glb" prefix="Jasper" at={N.jasper} y={N.jasper.y} waveEvent="jasperWave" standIn={STAND_INS.jasper} subscribeMessages={subscribeMessages} talk={JASPER} />
      <CampNpc url={URLS.pippin} what="pippin.glb" prefix="Pippin" at={N.pippin} y={N.pippin.y} waveEvent="pippinWave" standIn={STAND_INS.pippin} subscribeMessages={subscribeMessages} talk={PIPPIN} waveOn={pippinServes} />
      <CampNpc url={URLS.bruno} what="bruno.glb" prefix="Bruno" at={N.bruno} y={N.bruno.y} waveEvent="brunoWave" standIn={STAND_INS.bruno} subscribeMessages={subscribeMessages} talk={BRUNO} />
    </>
  );
}

/** Fetches the staff quietly (the casino's hall is preloaded the same way, by WorldScene). */
export function preloadCasinoStaff() {
  for (const url of Object.values(URLS)) useGLTF.preload(url);
}
