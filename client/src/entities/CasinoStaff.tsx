import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BAR_SNACK, CASINO_DRINKS, VIP_SLOT_ID, pocketColor, type BlackjackResult, type CasinoPropEvent, type RouletteResultBroadcast, type SlotBroadcast } from "@shared/casino";
import { CASINO_NPCS, casinoZoneAt } from "@shared/worlds/casino";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { modelUrl } from "../assetVersion";
import { distanceVolume, playSfx } from "../audio/sfx";
import { cameraFocus } from "../scene/cameraFocus";
import { GEO, matte, noRaycast } from "../scene/kit";
import { CampNpc, type NpcGesture, type NpcTalk } from "./CampNpc";

// The Velvet Casino's staff and regulars, each a pure loader for their Blender model through
// CampNpc, standing at their spot in CASINO_LAYOUT (its colliders keep everyone off them), at the
// height of the floor under them (the High-Roller Stage, the lounge's dais, Mr. Vance's and
// Pippin's platforms):
//
//   Mr. Vance        the fox cashier at the Golden Cage's window, on the platform behind its
//                    counter (vance.glb, scripts/blender/build_vance.py): he waves as you open it
//   Boris            the polar bear dealing Three-Card Poker on the High-Roller Stage: he greets you
//                    as you step up, has a word for every hand, and bows for a tip in his jar
//   Madame Vivienne  the poodle croupier at the roulette wheel, rake in paw: she calls each number,
//                    and curtsies for a tip in hers
//   Cedric           the badger dealing both blackjack tables in his green visor and arm garters: he
//                    shuffles now and then, and knocks the felt for a natural ("Clean 21!")
//   Jasper           the tuxedo cat on the stool at his own machine in Neon Alley: a win nearby and
//                    he perks up and claps, purring; a loss and he paws at his coin slot, or dozes off
//   Pippin           the penguin mixologist behind the bar, shaker in flipper (he gives it a rattle
//                    now and then, ice flying): click him (or the menu by him) for the bar menu; he
//                    waves and names each drink he serves, and the house's pretzels
//   Bruno            the bulldog bouncer at the VIP room's doors, arms folded: he lets in a player
//                    holding 500 chips or the Card Shark title, and bows them through
//
// (boris.glb, vivienne.glb, jasper.glb, pippin.glb, bruno.glb and cedric.glb:
// scripts/blender/build_casino_staff.py.)

const URLS = {
  vance: modelUrl("vance.glb"),
  boris: modelUrl("boris.glb"),
  vivienne: modelUrl("vivienne.glb"),
  jasper: modelUrl("jasper.glb"),
  pippin: modelUrl("pippin.glb"),
  bruno: modelUrl("bruno.glb"),
  cedric: modelUrl("cedric.glb"),
} as const;

const FRENCH: Record<"red" | "black" | "green", string> = { red: "rouge", black: "noir", green: "vert" };
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const tipFor = (dealer: "boris" | "vivienne") => (type: string, p: CasinoPropEvent) => type === "casinoProp" && p?.kind === "tipjar" && p.dealer === dealer;
/** A sound from where one of them stands, as loud as you are near. */
const heardFrom = (id: keyof typeof CASINO_NPCS) => distanceVolume(cameraFocus.x, cameraFocus.z, CASINO_NPCS[id].x, CASINO_NPCS[id].z, 4);
const within = (id: keyof typeof CASINO_NPCS, d: number) => Math.hypot(cameraFocus.x - CASINO_NPCS[id].x, cameraFocus.z - CASINO_NPCS[id].z) < d;

const BORIS: NpcTalk = {
  height: 1.3,
  clicked: ["Three-Card Poker, friend: ante up and beat my queen. 🃏", "I play with a queen high or better. Don't tell anyone. ❄️", "At this table a straight beats a flush. Three cards, different rules. 🐻‍❄️", "Keep your paws where I can see them. Kidding! 🐻‍❄️"],
  greet: { inside: (x, z) => casinoZoneAt(x, z).id === "pit", lines: ["Welcome to the High-Roller Stage, friend. 🎩", "Ah, a high roller! Pull up a chair. 🃏", "Evening! Poker's dealt right here. ❄️"] },
  on: {
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "tipjar" && p.dealer === "boris" ? pick(["Much obliged, friend! 🎩", "A gentleman of the felt! ❄️", "Boris thanks you kindly. 🐻‍❄️"]) : null),
    pokerResult: (p: { outcome: string; hand: string }) => {
      if (p?.hand === "Straight Flush" || p?.hand === "Three of a Kind") return p.outcome === "fold" ? null : `A ${p.hand}! Magnificent! 🎉`;
      if (p?.outcome === "win") return pick(["Well played, friend! ❄️", "You have me beaten. Take it! 🐻‍❄️"]);
      if (p?.outcome === "noqualify") return "Bah, no queen for Boris. Your ante pays.";
      if (p?.outcome === "lose") return Math.random() < 0.5 ? "The house thanks you. 🎩" : null;
      if (p?.outcome === "fold") return Math.random() < 0.4 ? "Wise, perhaps. ❄️" : null;
      return null;
    },
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

const CEDRIC: NpcTalk = {
  height: 1.2,
  clicked: ["Evening! Table 1's easy going, Table 2's for the brave. 🃏", "Cedric deals clean: I stand on seventeen, every time.", "Hit, stand, double: your call. A badger is patient. 🦡", "Two tables, one badger. I'm very quick with my paws."],
  on: {
    blackjackResult: (p: BlackjackResult) => (p?.outcome === "win" ? (Math.random() < 0.5 ? "Nicely played. 🦡" : null) : p?.outcome === "bust" ? (Math.random() < 0.4 ? "Ooh, just over the line." : null) : null),
  },
};

const JASPER: NpcTalk = {
  height: 1.38,
  clicked: ["Mrrrow? This one's due. I can feel it in my whiskers.", "Purrhaps one more spin… 🎰", "Don't tell Mr. Vance, but I've been here since Tuesday.", "Seven, seven, seven… meow."],
  on: {
    slotSpin: (payload: SlotBroadcast) => (payload?.win === payload?.bet ? "Mrrp. A pair: your stake back." : null),
  },
};

// Pippin takes no click of his own: the bar menu's pad stands over him (WorldScene)
const PIPPIN: NpcTalk = {
  height: 1.35,
  on: {
    casinoProp: (p: CasinoPropEvent) => (p?.kind === "barmenu" ? (p.snack ? BAR_SNACK.line : p.drink ? CASINO_DRINKS[p.drink].line : null) : null),
  },
};

const BRUNO: NpcTalk = {
  height: 1.3,
  clicked: ["VIP room's through here. Five hundred chips in hand, or a Card Shark's title. 🕶️", "Name's Bruno. The list? You're on it if the chips say so. 📋", "High-stakes slot inside. A hundred a pull, minimum.", "Keep it classy in there, pal."],
  on: {
    casinoProp: (p: CasinoPropEvent) => {
      if (p?.kind !== "vipdoor") return null;
      if (p.vip === "in") return pick(["Right this way. Enjoy the room. 🕶️", "Welcome in, high roller.", "Mind the velvet. Have a good one."]);
      if (p.vip === "out") return Math.random() < 0.5 ? "Come back soon, high roller." : null;
      return pick(["Five hundred chips, or a Card Shark's title. Rules are rules. 🕶️", "Not tonight, pal. Come back with a heavier purse.", "Members only. Win a few hands and we'll talk."]);
    },
  },
};

// --- the little turns ---
/** Cedric knocks the felt for a natural, whoever's it is. */
const cedricGestures = (type: string, p: BlackjackResult) => (type === "blackjackResult" && p?.outcome === "blackjack" ? { gesture: "knock" as NpcGesture, line: "*Knocks table* Clean 21! 🃏" } : null);
/** Jasper's moods at the alley's slots (the VIP room's machine is out of his sight). */
function jasperGestures(type: string, p: SlotBroadcast): { gesture: NpcGesture; line?: string } | null {
  if (type !== "slotSpin" || !p || p.propId === VIP_SLOT_ID) return null;
  if (p.win > p.bet) return { gesture: "clap", line: pick(["Purrrr~ 😻 Lucky paws!", "Meow! Jackpot vibes! 😻", "*claps* Purrrrr~"]) };
  if (p.win > 0) return null;
  const r = Math.random();
  if (r < 0.45) return { gesture: "paw", line: Math.random() < 0.5 ? pick(["Hsss! This machine owes me. 🐾", "*paws at the coin slot*"]) : undefined };
  if (r < 0.75) return { gesture: "sleep", line: "Zzz… 💤" };
  return null;
}
const borisBows = tipFor("boris");
const vivienneBows = tipFor("vivienne");
const pippinServes = (type: string, p: CasinoPropEvent) => type === "casinoProp" && p?.kind === "barmenu";
const brunoBows = (type: string, p: CasinoPropEvent) => type === "casinoProp" && p?.kind === "vipdoor" && p.vip === "in";

const CEDRIC_IDLE = { gesture: "shuffle" as NpcGesture, every: 9 };
const PIPPIN_IDLE = { gesture: "shake" as NpcGesture, every: 13 };

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
  cedric: standIn("#6d6a70", 1.1),
};

/** Set when Pippin rattles his shaker: the ice flies for a moment. */
const shaker = { at: -99 };

export function CasinoStaff({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const N = CASINO_NPCS;
  const onCedric = (g: NpcGesture) => {
    if (g === "knock") playSfx("knock", heardFrom("cedric"));
    else if (g === "shuffle" && within("cedric", 4.5)) playSfx("card", heardFrom("cedric") * 0.5);
  };
  const onJasper = (g: NpcGesture) => {
    if (g === "clap" && within("jasper", 7)) playSfx("purr", heardFrom("jasper"));
  };
  const onPippin = (g: NpcGesture) => {
    if (g !== "shake") return;
    shaker.at = performance.now() / 1000;
    if (within("pippin", 6)) playSfx("shaker", heardFrom("pippin") * 0.7);
  };
  return (
    <>
      <CampNpc url={URLS.vance} what="vance.glb" prefix="Vance" at={N.vance} y={N.vance.y} waveEvent="vanceWave" standIn={STAND_INS.vance} subscribeMessages={subscribeMessages} />
      <CampNpc url={URLS.boris} what="boris.glb" prefix="Boris" at={N.boris} y={N.boris.y} waveEvent="borisWave" standIn={STAND_INS.boris} subscribeMessages={subscribeMessages} talk={BORIS} bowOn={borisBows} />
      <CampNpc url={URLS.vivienne} what="vivienne.glb" prefix="Vivienne" at={N.vivienne} y={N.vivienne.y} waveEvent="vivienneWave" standIn={STAND_INS.vivienne} subscribeMessages={subscribeMessages} talk={VIVIENNE} bowOn={vivienneBows} />
      <CampNpc url={URLS.cedric} what="cedric.glb" prefix="Cedric" at={N.cedric} y={N.cedric.y} waveEvent="cedricWave" standIn={STAND_INS.cedric} subscribeMessages={subscribeMessages} talk={CEDRIC} gestureOn={cedricGestures} idle={CEDRIC_IDLE} onGesture={onCedric} fuseArm={false} />
      <CampNpc url={URLS.jasper} what="jasper.glb" prefix="Jasper" at={N.jasper} y={N.jasper.y} waveEvent="jasperWave" standIn={STAND_INS.jasper} subscribeMessages={subscribeMessages} talk={JASPER} gestureOn={jasperGestures} onGesture={onJasper} fuseArm={false} />
      <CampNpc url={URLS.pippin} what="pippin.glb" prefix="Pippin" at={N.pippin} y={N.pippin.y} waveEvent="pippinWave" standIn={STAND_INS.pippin} subscribeMessages={subscribeMessages} talk={PIPPIN} waveOn={pippinServes} idle={PIPPIN_IDLE} onGesture={onPippin} fuseArm={false} />
      <CampNpc url={URLS.bruno} what="bruno.glb" prefix="Bruno" at={N.bruno} y={N.bruno.y} waveEvent="brunoWave" standIn={STAND_INS.bruno} subscribeMessages={subscribeMessages} talk={BRUNO} bowOn={brunoBows} />
      <ShakerIce />
    </>
  );
}

// --- Pippin's shaker: a spray of ice chips over his flipper while he rattles it ---

const ICE = 14;
const ICE_GEO = new THREE.BoxGeometry(0.035, 0.035, 0.035);
const ICE_MAT = new THREE.MeshBasicMaterial({ color: "#dff4ff", toneMapped: false });
const SHAKE_S = 1.8;

function ShakerIce() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // the shaker's top in the world: Pippin faces +x, his left flipper up by his shoulder
  const top = useMemo(() => {
    const p = CASINO_NPCS.pippin;
    const left = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    const fwd = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    return new THREE.Vector3(p.x + left.x * 0.22 + fwd.x * 0.2, p.y + 1.3, p.z + left.z * 0.22 + fwd.z * 0.2);
  }, []);
  const seeds = useMemo(() => Array.from({ length: ICE }, (_, i) => ({ a: (i / ICE) * Math.PI * 2 + i, v: 0.5 + ((i * 37) % 10) / 12, delay: (i % 7) * 0.2 })), []);
  useEffect(() => {
    if (ref.current) ref.current.frustumCulled = false;
  }, []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const s = performance.now() / 1000 - shaker.at;
    const on = s >= 0 && s < SHAKE_S + 0.6;
    mesh.visible = on;
    if (!on) return;
    seeds.forEach((d, i) => {
      // each chip hops out of the shaker's top on its own little loop, over and over while it shakes
      const u = ((s - d.delay) % 0.6) / 0.6;
      const live = s - d.delay > 0 && s - d.delay < SHAKE_S;
      const r = u * 0.18 * d.v;
      dummy.position.set(top.x + Math.cos(d.a) * r, top.y + Math.sin(u * Math.PI) * 0.16 * d.v, top.z + Math.sin(d.a) * r);
      dummy.rotation.set(u * 6 + i, u * 4, 0);
      dummy.scale.setScalar(live ? 1 - u * 0.5 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[ICE_GEO, ICE_MAT, ICE]} raycast={noRaycast} visible={false} />;
}

/** Fetches the staff quietly (the casino's hall is preloaded the same way, by WorldScene). */
export function preloadCasinoStaff() {
  for (const url of Object.values(URLS)) useGLTF.preload(url);
}
