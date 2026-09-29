import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CORNER_NAME, METHOD_LABEL, SPAR_TIERS, STAMINA_MAX, oddsText, type BoutResult, type BoxEvent, type RopeSide } from "@shared/boxing";
import { COACH_BRUNO, RING, RING_LAYOUT as R, RING_FLOOR_Y } from "@shared/worlds/boxing_ring";
import { RefBarnaby, RingRegulars, SparringJimmy, kipBag } from "./ringRegulars";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { boutLive, fightersOf, getBout, getBoutClock, subscribeBout } from "../systems/boutStore";
import { advanceCombatClock, clearFight, drawnAt, hitstop, playMove, playReact, punchIn, ringFx, shake, slowMo } from "../systems/fightAnim";
import { resetCombatPrediction } from "../systems/combatInput";
import { worldToScreen } from "../systems/input";
import { liveMotion } from "../systems/liveMotion";
import { distanceVolume, playSfx } from "../audio/sfx";
import { loadRingSounds, playRingSound } from "../audio/ringAudio";
import { ringCrowdRoar } from "../audio/ambience";
import { cameraFocus } from "./cameraFocus";
import { actionEase } from "./actionCamera";
import { GEO, matte, noRaycast } from "./kit";

// The Velvet Ring (shared/worlds/boxing_ring.ts): a vintage boxing hall, one Blender model,
// boxing_ring.glb (scripts/blender/build_boxing_ring.py), its static mesh painted in vertex colours
// over the casino's finishes, and a few named nodes that move:
//
//   the ropes        each side's three (Prop_Ropes_n/s/e/w) bow out when a fighter is driven into
//                    them, and spring back (their vertices bent along the side)
//   the heavy bag    swings on its chain under a flurry (Prop_HeavyBag); the speed bag rattles
//   the chalkboard   its slate (Prop_ChalkSlate) chalked with the bout: the contenders, the round
//                    and its clock, the pools and the live odds, the last result
//   the neon         THE VELVET RING over the lockers, breathing
//
// The dome lamp over the ring lights it: a warm spotlight, a faint beam and chalk dust drifting
// through it. Coach Bruno keeps the pro shop (coach_bruno.glb through CampNpc) and counts the
// knockdowns. Nothing casts a shadow.
//
// The fight itself plays here, from the room's boxEvents (useRingEvents): every punch, feint and
// dash starts its animation on the fighter (systems/fightAnim.ts; your own were already started
// when you pressed), every landing its reaction (a flinch, a whiplash, a punch into the shell, a
// Guard Break, a knockdown, a push-up back up), its sound (audio/ringAudio.ts: the samples, or
// their synthesized stand-ins) and its screen juice: a hitstop for everyone watching (the combat
// clock stops: 0.05 s for an M1, 0.1 s for an M2), and for the two fighters the action camera's
// shake (a nudge for an M1, a shudder for an M2) and a Perfect Dodge's slow-mo pulse, white flash
// and punch-in. The particles: sweat thrown off a head snapped back, a spark where a punch lands.
// Under the local fighter's feet a faint arc shows their stamina (and, inside it, their guard).
//
// The regulars (ringRegulars.tsx): Jimmy the Slugger, the sparring partner, up the steps and down
// them again; Ref Barnaby, the referee, on the apron and in for the count and the result; the
// regulars dozing on the bleachers and the fight night's crowd filling them; Kip the kangaroo on the
// heavy bag (the bag swings to his one-two here) and the trainee skipping rope by the mirrors.

export const BOXING_RING_URL = modelUrl("boxing_ring.glb");
export const COACH_BRUNO_URL = modelUrl("coach_bruno.glb");
export { RING_REGULARS_URL } from "./ringRegulars";

const CLICK_MAT = new THREE.MeshBasicMaterial({ visible: false });
const DECAL_OFFSET: Record<string, number> = { CS_Decal1: -1, CS_Decal2: -3 };
const LAMP_Y = R.lamp.y;

interface Props {
  onFloorClick: (x: number, z: number) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string | null;
}

export function BoxingWorld({ onFloorClick, subscribeMessages, localSessionId }: Props) {
  const click = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useRingEvents(subscribeMessages, localSessionId);
  // the fight anims' clock (it stops for a hitstop)
  useFrame((_, delta) => advanceCombatClock(Math.min(delta, 0.1)));
  return (
    <group>
      {/* the floor, and the canvas over the ring (a click there lands where it looks) */}
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[R.half * 2, R.half * 2, 1]} onPointerDown={click} />
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[RING.x, RING_FLOOR_Y + 0.01, RING.z]} scale={[RING.apron * 2, RING.apron * 2, 1]} onPointerDown={click} />
      <ModelBoundary what="boxing_ring.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <RingModel subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
      <RingLights />
      <SpotBeam />
      <ChalkDust />
      <RingParticles />
      <StaminaArc localSessionId={localSessionId} />
      <SparringJimmy subscribeMessages={subscribeMessages} />
      <RefBarnaby subscribeMessages={subscribeMessages} />
      <RingRegulars subscribeMessages={subscribeMessages} />
      <CampNpc
        url={COACH_BRUNO_URL}
        what="coach_bruno.glb"
        prefix="CoachBruno"
        at={{ x: COACH_BRUNO.x, z: COACH_BRUNO.z, yaw: COACH_BRUNO.yaw }}
        y={COACH_BRUNO.y}
        waveEvent="coachWave"
        standIn={<CoachStandIn />}
        subscribeMessages={subscribeMessages}
        talk={COACH_TALK}
        waveOn={(type, p) => type === "ringProp" && p?.kind === "coach"}
        gestureOn={coachCalls}
      />
    </group>
  );
}

const STAND_IN_TOP = matte("#6e4526", 0.9);
const STAND_IN_SIDE = matte("#2a1a14", 0.85);
const STAND_IN_RING = matte("#e8ddc2", 0.9);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.3, 0]} scale={[R.half * 2, 0.6, R.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[R.half * 2, R.half * 2, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={STAND_IN_RING} position={[RING.x, RING_FLOOR_Y / 2, RING.z]} scale={[RING.apron * 2, RING_FLOOR_Y, RING.apron * 2]} raycast={noRaycast} />
    </group>
  );
}

const COACH_MAT = matte("#6e1a2a", 0.85);
function CoachStandIn() {
  return <mesh geometry={GEO.box} material={COACH_MAT} position={[0, 0.6, 0]} scale={[0.5, 1.2, 0.4]} raycast={noRaycast} />;
}

// --- Coach Bruno -------------------------------------------------------------------------------

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const nameOf = (sessionId: string) => {
  const b = getBout();
  return b.red.sessionId === sessionId ? b.red.name : b.blue.sessionId === sessionId ? b.blue.name : "Our fighter";
};

const COACH_TALK: NpcTalk = {
  height: 1.3,
  clicked: [
    "Gloves up, champ! Step up to a corner to get in line: the winner stays on. 🥊",
    "Jab, straight, hook: throw the string on the beat and it's a true combo. 👊",
    "Dash just before a punch lands: that's a Perfect Dodge, and your next one's a Counter! ⚡",
    "Run your stamina dry and you're Exhausted: no dash, no guard, slow hands. Breathe! 😮‍💨",
    "Smash a guard twice and it breaks. Guard too early on your own Smash and it's a Feint. 🛡️",
    "Backed on the ropes at half health? One Heavy Smash and you're sleeping in the front row. 💥",
    "Three wins in a row and the belt's yours for a day. 🏆",
    "Tiger Stripe Mitts: cheaper M1s, fiercer look. 🐯",
  ],
  greet: {
    inside: (x, z) => x > R.shop.x0 - 1.4 && z < R.shop.counterZ + 2.2,
    lines: ["Welcome to the Velvet Ring! Gloves on the wall, glory in the ring. 🥊", "Here to train, or here to fight? 🐶", "Mind the mouthguard. Coach's orders. 😬"],
  },
  on: {
    boxEvent: (ev: BoxEvent) => {
      if (ev.kind === "perfect") return Math.random() < 0.6 ? "Perfect Dodge! Make 'em pay! ⚡" : null;
      if (ev.kind === "hit" && ev.counter) return "COUNTER! What a shot! 💥";
      if (ev.kind === "hit" && ev.interrupt && ev.move !== "smash") return Math.random() < 0.4 ? "Beat 'em to the punch! 👊" : null;
      if (ev.kind === "guardbreak") return "Guard's broken! Cover up! 🛡️";
      if (ev.kind === "feint") return Math.random() < 0.3 ? "Ooh, a feint! Sneaky! 😏" : null;
      return null;
    },
  },
};

/** The calls Coach Bruno makes at once, whatever he said a moment ago: the bell, the count, the result. */
function coachCalls(type: string, p: any): { gesture: "perk" | "clap" | "knock"; line?: string } | null {
  if (type === "boxEvent") {
    const ev = p as BoxEvent;
    if (ev.kind === "bell" && ev.ring === "start") return { gesture: "perk", line: ev.round === 1 ? "Touch gloves... FIGHT! 🔔" : `Round ${ev.round}! 🔔` };
    if (ev.kind === "knockdown") return { gesture: "perk", line: pick([`Down goes ${nameOf(ev.to)}! 💥`, `${nameOf(ev.to)} is down! 💥`]) };
    if (ev.kind === "count") return { gesture: "knock", line: ev.n >= 10 ? "TEN! That's the fight! 🔔" : `${ev.n}!` };
    if (ev.kind === "up" && ev.beat) return { gesture: "clap", line: `${nameOf(ev.to)} beats the count! 🥊` };
    if (ev.kind === "round") return { gesture: "perk", line: ev.winner ? `Round ${ev.round} to ${getBout()[ev.winner].name || CORNER_NAME[ev.winner]}! 🔔` : `Round ${ev.round}: too close to call! 🔔` };
    if (ev.kind === "ringout") return { gesture: "perk", line: "THROUGH THE ROPES! Ring-Out! 💥" };
    if (ev.kind === "towel") return { gesture: "perk", line: `${nameOf(ev.by)} throws in the towel! 🏳️` };
  }
  if (type === "boxResult") {
    const r = p as BoutResult;
    if (r.towel) return { gesture: "perk", line: r.spar ? "The towel's in. Shake it off and come back stronger! 🏳️" : `The towel's in: ${r.winnerName} wins by T.K.O.! 🏳️` };
    if (r.spar) return { gesture: "clap", line: r.winner ? `Good spar! ${r.winnerName} takes it. 🥊` : "Good spar, both of you! 🥊" };
    if (r.method === "nocontest") return { gesture: "perk", line: r.stays ? `No Contest! Every bet goes back. ${r.winnerName} holds the ring. 🤚` : "No Contest! Every bet goes back. 🤚" };
    if (r.method === "draw") return { gesture: "perk", line: "The judges call it a draw! 🤝" };
    return { gesture: "clap", line: r.belt ? `A NEW CHAMPION! ${r.winnerName}! 🏆` : r.reign > 1 ? `${r.winnerName} wins by ${METHOD_LABEL[r.method]}: ${r.reign} in a row! Who's next? 🏆` : `${r.winnerName} wins by ${METHOD_LABEL[r.method]}! Who's next? 🏆` };
  }
  return null;
}

// --- the model ---------------------------------------------------------------------------------

const SIDES: RopeSide[] = ["n", "s", "e", "w"];
/** The ropes' spring: how stiff, how damped, how hard a fighter hits them (m/s). */
const ROPE_K = 90;
const ROPE_DAMP = 7;
const ROPE_KICK = 1.8;
const BAG_OMEGA = 2.5;
const BAG_DAMP = 0.9;

interface Rope {
  geo: THREE.BufferGeometry;
  rest: Float32Array;
  amp: number;
  vel: number;
  side: RopeSide;
}

function RingModel({ subscribeMessages }: { subscribeMessages: Props["subscribeMessages"] }) {
  const { scene } = useGLTF(BOXING_RING_URL);
  const slate = useSlate();
  const parts = useMemo(() => {
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const sky = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const board = new THREE.MeshBasicMaterial({ map: slate.texture, toneMapped: false });
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CS_Glow") mesh.material = glow;
      else if (m.name === "CS_Neon") mesh.material = neon;
      else if (m.name === "CS_Sky") mesh.material = sky;
      else if (m.name === "CS_Screen") mesh.material = board;
      else {
        const offset = DECAL_OFFSET[m.name];
        if (offset !== undefined) {
          m.polygonOffset = true;
          m.polygonOffsetFactor = offset;
          m.polygonOffsetUnits = offset;
        }
      }
    });
    const ropes: Rope[] = [];
    for (const side of SIDES) {
      const node = scene.getObjectByName(`Prop_Ropes_${side}`) as THREE.Mesh | undefined;
      const geo = node?.isMesh ? node.geometry : undefined;
      if (!geo) continue;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      ropes.push({ geo, rest: new Float32Array(pos.array as Float32Array), amp: 0, vel: 0, side });
    }
    return { glow, neon, sky, board, ropes, bag: scene.getObjectByName("Prop_HeavyBag") ?? null, speed: scene.getObjectByName("Prop_SpeedBag") ?? null };
  }, [scene, slate.texture]);
  useEffect(
    () => () => {
      parts.glow.dispose();
      parts.neon.dispose();
      parts.sky.dispose();
      parts.board.dispose();
    },
    [parts]
  );

  // the ropes kicked, the bags struck (a player's flurry, and Kip's one-two, softer)
  const bag = useRef({ x: 0, z: 0, vx: 0, vz: 0, flurryUntil: 0, nextHit: 0 });
  const speed = useRef({ until: 0 });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "boxEvent" && (payload as BoxEvent).kind === "ropes") {
          const rope = parts.ropes.find((r) => r.side === (payload as { side: RopeSide }).side);
          if (rope) rope.vel += ROPE_KICK;
        } else if (type === "boxEvent" && (payload as BoxEvent).kind === "ringout") {
          const rope = parts.ropes.find((r) => r.side === (payload as { side: RopeSide }).side);
          if (rope) rope.vel += ROPE_KICK * 2.2;
        } else if (type === "ringProp" && payload?.kind === "heavybag") {
          bag.current.flurryUntil = performance.now() + 2300;
          bag.current.nextHit = 0;
        } else if (type === "ringProp" && payload?.kind === "speedbag") {
          speed.current.until = performance.now() + 2300;
        }
      }),
    [subscribeMessages, parts]
  );

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = clock.elapsedTime;
    // the neon breathes, the bulbs glow, the night outside twinkles
    parts.neon.color.setScalar(0.86 + 0.1 * Math.sin(t * 1.7) + (Math.sin(t * 23) > 0.985 ? -0.25 : 0));
    parts.glow.color.setScalar(0.96 + 0.04 * Math.sin(t * 3));
    parts.sky.color.setScalar(0.9 + 0.06 * Math.sin(t * 0.5));
    // the ropes: a damped spring, the side bowed out along its length
    for (const rope of parts.ropes) {
      if (rope.amp === 0 && rope.vel === 0) continue;
      rope.vel += (-ROPE_K * rope.amp - ROPE_DAMP * rope.vel) * dt;
      rope.amp += rope.vel * dt;
      if (Math.abs(rope.amp) < 0.0005 && Math.abs(rope.vel) < 0.005) {
        rope.amp = 0;
        rope.vel = 0;
      }
      bendRope(rope);
    }
    // the heavy bag: a pendulum, pushed back with each punch of a flurry
    const b = bag.current;
    const now = performance.now();
    if (now < b.flurryUntil && now >= b.nextHit) {
      b.vx += 0.9;
      b.nextHit = now + 380;
      playSfx("jab", distanceVolume(cameraFocus.x, cameraFocus.z, R.heavyBag.x, R.heavyBag.z, 4) * 0.7);
    }
    if (now < kipBag.until && now >= kipBag.next) {
      b.vx += 0.5;
      kipBag.next = now + 285;
      playSfx("jab", distanceVolume(cameraFocus.x, cameraFocus.z, R.heavyBag.x, R.heavyBag.z, 3) * 0.22);
    }
    b.vx += (-BAG_OMEGA * BAG_OMEGA * b.x - BAG_DAMP * b.vx) * dt;
    b.x += b.vx * dt;
    b.vz += (-BAG_OMEGA * BAG_OMEGA * b.z - BAG_DAMP * b.vz) * dt + Math.sin(t * 1.3) * 0.0004;
    b.z += b.vz * dt;
    if (parts.bag) {
      parts.bag.rotation.x = b.x * 0.3;
      parts.bag.rotation.z = b.z * 0.3;
    }
    // the speed bag: a blur of rebounds while someone works it
    if (parts.speed) {
      const left = speed.current.until - now;
      parts.speed.rotation.x = left > 0 ? Math.sin(t * 34) * 0.55 * Math.min(1, left / 400) : parts.speed.rotation.x * 0.85;
      if (left > 0 && Math.sin(t * 34) > 0.97) playSfx("blocked", distanceVolume(cameraFocus.x, cameraFocus.z, R.speedBag.x, R.speedBag.z, 4) * 0.35);
    }
  });
  return <primitive object={scene} />;
}

/** A side's ropes bowed out by `amp` (m) in the middle, their ends held at the posts. */
function bendRope(rope: Rope) {
  const pos = rope.geo.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const rp = RING.rope;
  const along = rope.side === "n" || rope.side === "s" ? 0 : 2;
  const across = rope.side === "n" || rope.side === "s" ? 2 : 0;
  const out = rope.side === "s" || rope.side === "e" ? 1 : -1;
  for (let i = 0; i < arr.length; i += 3) {
    const u = Math.max(0, Math.min(1, (rope.rest[i + along] + rp) / (2 * rp)));
    arr[i + along] = rope.rest[i + along];
    arr[i + across] = rope.rest[i + across] + out * rope.amp * Math.sin(Math.PI * u);
    arr[i + 1] = rope.rest[i + 1] - Math.abs(rope.amp) * 0.25 * Math.sin(Math.PI * u);
  }
  pos.needsUpdate = true;
}

// --- the chalkboard ----------------------------------------------------------------------------

const PHASE_LINE: Record<string, string> = { open: "RING OPEN", warmup: "WARM-UP", fight: "ROUND", count: "KNOCKDOWN!", rest: "BETWEEN ROUNDS", result: "RESULT" };

/** The slate's canvas, chalked with the bout whenever it changes (at most a few times a second). */
function useSlate() {
  const s = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = 400;
    const texture = new THREE.CanvasTexture(canvas);
    // (the slate's UVs come from a glTF: its v runs down the image, as three.js's glTF textures do)
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, []);
  useEffect(() => {
    let last = "";
    let timer = 0;
    const paint = () => {
      timer = 0;
      const b = getBout();
      const clock = getBoutClock();
      const key = JSON.stringify([b.phase, b.round, clock, b.count, b.red.name, b.blue.name, b.pools, b.result, Object.keys(b.bets).length, b.rounds, b.spar]);
      if (key === last) return;
      last = key;
      chalk(s.canvas, b, clock);
      s.texture.needsUpdate = true;
    };
    const soon = () => {
      if (!timer) timer = window.setTimeout(paint, 220);
    };
    paint();
    const off = subscribeBout(soon);
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [s]);
  useEffect(() => () => s.texture.dispose(), [s]);
  return s;
}

function chalk(canvas: HTMLCanvasElement, b: ReturnType<typeof getBout>, clock: number) {
  const g = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  // the slate, with the ghosts of old chalk on it
  g.fillStyle = "#1f2a24";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.08;
  g.fillStyle = "#e8e4d8";
  for (let i = 0; i < 26; i++) g.fillRect((i * 97) % W, (i * 61) % H, 60 + (i % 5) * 20, 3);
  g.globalAlpha = 1;
  const text = (s: string, x: number, y: number, size: number, color = "#efeadd", align: CanvasTextAlign = "center") => {
    g.font = `700 ${size}px Fredoka, "Segoe UI", system-ui, sans-serif`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.globalAlpha = 0.92;
    g.fillText(s, x, y);
    g.globalAlpha = 1;
  };
  text("~ RINGSIDE ~", W / 2, 34, 34, "#f2d88a");
  g.strokeStyle = "rgba(239,234,221,0.5)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(40, 62);
  g.lineTo(W - 40, 62);
  g.stroke();
  // the contenders
  const red = b.red.name || "— open —";
  const blue = b.blue.name || "— open —";
  text(red.slice(0, 14), W * 0.26, 104, 28, "#ff8a7a");
  text("vs", W / 2, 104, 22);
  text(blue.slice(0, 14), W * 0.74, 104, 28, "#8ab4ff");
  text("RED", W * 0.26, 138, 16, "#ff8a7a");
  text("BLUE", W * 0.74, 138, 16, "#8ab4ff");
  // the bout
  const mm = `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}`;
  const status = b.phase === "fight" ? `ROUND ${b.round} · ${mm}` : b.phase === "count" ? `COUNT: ${b.count}` : b.phase === "warmup" ? `WARM-UP · BETS OPEN ${mm}` : b.phase === "rest" ? `ROUND ${b.round + 1} IN ${mm}` : PHASE_LINE[b.phase] ?? "";
  text(status, W / 2, 186, 30, b.phase === "count" ? "#ffd166" : "#efeadd");
  if (b.rounds.length > 0) text(`ROUNDS  ${b.rounds.map((r) => (r === "draw" ? "=" : r === "red" ? "RED" : "BLUE")).join(" · ")}`, W / 2, 214, 18, "#f2d88a");
  // the odds (a spar: none)
  if (b.spar) {
    text(`SPARRING: ${SPAR_TIERS[b.spar].name.toUpperCase()}`, W / 2, 246, 26, "#cfe8c4");
    text("NO BETS · NO RECORD", W / 2, 278, 18);
  } else {
    text(`ODDS  ${oddsText(b.pools, "red")}  |  ${oddsText(b.pools, "blue")}`, W / 2, 246, 26);
    text(`POOLS  ${b.pools.red} 🪙  |  ${b.pools.blue} 🪙`, W / 2, 278, 22);
  }
  // the last result
  let last = "Step into a corner to fight";
  try {
    const r = b.result ? (JSON.parse(b.result) as BoutResult) : null;
    if (r) last = r.winner ? `LAST: ${r.winnerName.slice(0, 12)} by ${METHOD_LABEL[r.method]}${r.towel ? " (towel)" : ""}` : `LAST: ${METHOD_LABEL[r.method]}`;
  } catch {
    // an old result: nothing to chalk
  }
  text(last, W / 2, 330, 22, "#cfe8c4");
  text(`${CORNER_NAME.red} steps SW · ${CORNER_NAME.blue} steps NE`, W / 2, 372, 15, "rgba(239,234,221,0.7)");
}

// --- the light: the dome lamp's spot, its beam and the chalk dust in it; the neon's, the case's ----

function RingLights() {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(RING.x, RING_FLOOR_Y, RING.z);
    return o;
  }, []);
  useEffect(() => {
    if (spot.current) spot.current.target = target;
  }, [target]);
  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={["#ffdcb8", "#3a2418", 0.85]} />
      <spotLight ref={spot} color="#ffd58a" intensity={90} distance={16} angle={0.62} penumbra={0.55} decay={1.8} position={[RING.x, LAMP_Y - 0.05, RING.z]} castShadow={false} />
      <pointLight color="#ffc870" intensity={3.2} distance={6} decay={1.6} position={[R.neon.x, R.neon.y, -R.half + 0.9]} castShadow={false} />
      <pointLight color="#ffe0a0" intensity={1.6} distance={3.5} decay={2} position={[R.trophy.x, 1.8, -R.half + 1.2]} castShadow={false} />
      <pointLight color="#ffd9a0" intensity={2.2} distance={7} decay={1.8} position={[R.shop.bruno[0], 2.6, R.shop.bruno[1] + 1.2]} castShadow={false} />
      <pointLight color="#ffd0a0" intensity={2.4} distance={8} decay={1.8} position={[-7.2, 2.6, 1.5]} castShadow={false} />
      <pointLight color="#9fb4ff" intensity={0.9} distance={8} decay={2} position={[-R.half + 1.2, 3.0, -1.2]} castShadow={false} />
    </>
  );
}

const BEAM_H = LAMP_Y - RING_FLOOR_Y;
const BEAM_GEO = new THREE.CylinderGeometry(0.55, 3.1, BEAM_H, 32, 1, true);
const BEAM_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: { color: { value: new THREE.Color("#ffdca0") }, strength: { value: 1 } },
  vertexShader: "varying float vH; void main() { vH = position.y / " + BEAM_H.toFixed(3) + " + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform vec3 color; uniform float strength; varying float vH; void main() { gl_FragColor = vec4(color * (0.02 + 0.09 * pow(vH, 1.6)) * strength, 1.0); }",
});
/** The lamp's beam: a faint cone of light from the dome down onto the canvas (faded out under the
 *  action camera: from down at the ring's edge it looks along the cone's wall, a glare). */
function SpotBeam() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const k = 1 - actionEase();
    BEAM_MAT.uniforms.strength.value = k;
    if (ref.current) ref.current.visible = k > 0.02;
  });
  return <mesh ref={ref} geometry={BEAM_GEO} material={BEAM_MAT} position={[RING.x, RING_FLOOR_Y + BEAM_H / 2, RING.z]} raycast={noRaycast} renderOrder={5} />;
}

const MOTES = 70;
const MOTE_GEO = new THREE.SphereGeometry(0.014, 5, 4);
const MOTE_MAT = new THREE.MeshBasicMaterial({ color: "#fff4dc", toneMapped: false });
/** Chalk dust drifting down through the beam (wrapping round to the top). */
function ChalkDust() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: MOTES }, (_, i) => ({ a: i * 2.39996, r: ((i * 37) % 100) / 100, y: ((i * 53) % 100) / 100, speed: 0.04 + ((i * 17) % 10) / 160, wob: 0.3 + ((i * 11) % 10) / 20 })), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((m, i) => {
      const u = (((m.y - t * m.speed * 0.12) % 1) + 1) % 1; // 0 at the canvas, 1 at the lamp
      const y = RING_FLOOR_Y + 0.15 + u * (BEAM_H - 0.5);
      const reach = (0.55 + (3.1 - 0.55) * (1 - (y - RING_FLOOR_Y) / BEAM_H)) * 0.85;
      const a = m.a + Math.sin(t * 0.2 * m.wob + i) * 0.6;
      dummy.position.set(RING.x + Math.cos(a) * reach * m.r, y, RING.z + Math.sin(a) * reach * m.r);
      dummy.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * m.wob + i)));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[MOTE_GEO, MOTE_MAT, MOTES]} raycast={noRaycast} frustumCulled={false} />;
}

// --- the fight: every boxEvent's animation, sound and juice ------------------------------------

/** Where a fighter is drawn now (your own: where you are). */
function drawnSpot(sessionId: string, localSessionId: string | null) {
  if (sessionId === localSessionId) return { x: cameraFocus.x, z: cameraFocus.z };
  return drawnAt.get(sessionId) ?? liveMotion.get(sessionId) ?? null;
}

/** Every punch, guard, dash and bell of the bout: its animation on the fighters, its sound (heard
 *  from where you stand), its particles, and its juice (the hitstop everyone sees; the shake, the
 *  flashes and the slow-mo for the two in the ring). */
function useRingEvents(subscribeMessages: Props["subscribeMessages"], localSessionId: string | null) {
  useEffect(() => {
    void loadRingSounds();
  }, []);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        const near = distanceVolume(cameraFocus.x, cameraFocus.z, RING.x, RING.z, 8);
        if (type === "boxResult") {
          const r = payload as BoutResult;
          ringCrowdRoar(r.winner ? 1 : 0.35);
          if (r.winner) playSfx("bell", near);
          if (r.stays && r.winner) {
            // King of the Hill: the winner stays on, gloves up
            const id = getBout()[r.winner].sessionId;
            if (id) playMove(id, "victory");
            if (r.method !== "nocontest") window.setTimeout(() => playSfx("fanfare", near), 450);
          }
          return;
        }
        if (type !== "boxEvent") return;
        const ev = payload as BoxEvent;
        const mine = (id: string) => !!localSessionId && id === localSessionId;
        switch (ev.kind) {
          case "swing":
            playMove(ev.by, ev.move, { windup: ev.windup, total: ev.total });
            playSfx("swoosh", near * (ev.move === "smash" ? 0.55 : 0.3));
            break;
          case "feint":
            playMove(ev.by, "feint");
            playSfx("swoosh", near * 0.8);
            break;
          case "hit": {
            const heavy = ev.move === "smash";
            // (which way the head snaps: the punch's way, as the victim sees it)
            playReact(ev.to, heavy ? "whiplash" : "flinch", ev.move === "jab" || ev.move === "leadhook" ? 1 : -1);
            playRingSound(heavy ? "punch_heavy" : "punch_light", near);
            if (heavy) playSfx("skid", near * 0.8);
            ringCrowdRoar(heavy ? 0.5 : ev.counter ? 0.45 : 0.12);
            hitstop(heavy ? 0.1 : 0.05);
            const at = drawnSpot(ev.to, localSessionId);
            if (at) {
              burst(at, ev.dir, heavy ? 14 : ev.counter ? 8 : 4, heavy);
              spark(at, ev.dir, heavy || ev.counter);
            }
            if (mine(ev.by) || mine(ev.to)) {
              const d = worldToScreen(ev.dir[0], ev.dir[1]);
              if (heavy) shake(0.25, 0.15, null);
              else shake(0.08, 0.05, { x: d.x, y: d.y * 0.4 });
              if (mine(ev.to)) ringFx({ kind: "flash", tone: "red" });
            }
            if (ev.counter) ringFx({ kind: "badge", text: "💥 COUNTER! (x1.4)", tone: "red" });
            break;
          }
          case "block":
            playReact(ev.to, "blockhit");
            playSfx("blocked", near * (ev.move === "smash" ? 1 : 0.8));
            if (ev.move === "smash") playSfx("punchLight", near * 0.4);
            break;
          case "whiff":
            playSfx("swoosh", near * 0.25);
            break;
          case "perfect":
            playMove(ev.by, "perfect");
            playRingSound("parry_ding", near);
            ringCrowdRoar(0.45);
            slowMo(0.2, 0.3);
            ringFx({ kind: "badge", text: "⚡ PERFECT DODGE", tone: "gold" });
            if (mine(ev.by) || mine(ev.to)) {
              ringFx({ kind: "mono" });
              ringFx({ kind: "flash", tone: "white" });
              punchIn();
            }
            break;
          case "guardbreak":
            playReact(ev.to, "guardbreak");
            playRingSound("guard_break", near);
            ringCrowdRoar(0.5);
            hitstop(0.08);
            ringFx({ kind: "badge", text: "🛡️ GUARD BREAK", tone: "cyan" });
            if (mine(ev.by) || mine(ev.to)) shake(0.18, 0.12, null);
            break;
          case "dash":
            playMove(ev.by, `dash${ev.side}`);
            playSfx("swoosh", near * 0.35);
            break;
          case "exhausted":
            if (mine(ev.to)) ringFx({ kind: "badge", text: "😮‍💨 EXHAUSTED", tone: "white" });
            break;
          case "ropes":
            playSfx("ropes", near);
            ringCrowdRoar(0.35);
            break;
          case "ringout":
            playSfx("ropes", near);
            playReact(ev.to, "knockdown");
            playRingSound("canvas_thud", near);
            ringCrowdRoar(1);
            ringFx({ kind: "badge", text: "💥 RING-OUT!", tone: "red" });
            break;
          case "knockdown":
            playReact(ev.to, "knockdown");
            window.setTimeout(() => playRingSound("canvas_thud", near), 380);
            ringCrowdRoar(0.85);
            if (mine(ev.to)) ringFx({ kind: "flash", tone: "red" });
            break;
          case "up":
            playMove(ev.to, "getup");
            if (ev.beat) ringCrowdRoar(0.6);
            break;
          case "round":
            ringCrowdRoar(ev.winner ? 0.7 : 0.35);
            break;
          case "towel":
            // thrown in: the crowd gasps, the badge, the bout stopped (the result follows)
            ringCrowdRoar(0.55);
            ringFx({ kind: "badge", text: "🏳️ THE TOWEL'S IN", tone: "white" });
            break;
          case "bell":
            playSfx("bell", near);
            if (ev.ring === "start") {
              ringCrowdRoar(0.4);
              const b = getBout();
              for (const id of [b.red.sessionId, b.blue.sessionId]) if (id) clearFight(id);
              if (localSessionId && fightersOf(b, localSessionId).mine) resetCombatPrediction();
            }
            break;
          case "enter":
          case "leave":
            clearFight(ev.by);
            if (mine(ev.by)) resetCombatPrediction();
            break;
        }
      }),
    [subscribeMessages, localSessionId]
  );
}

// --- the particles: sweat off a snapped head, a spark where a punch lands ------------------------

const DROPS = 64;
const DROP_GEO = new THREE.SphereGeometry(0.026, 6, 5);
const DROP_MAT = new THREE.MeshBasicMaterial({ color: "#dff4ff", transparent: true, opacity: 0.85, depthWrite: false });
const SPARKS = 4;
const SPARK_GEO = new THREE.RingGeometry(0.07, 0.13, 24);
interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}
const drops: Drop[] = [];
const sparks: { x: number; y: number; z: number; age: number; big: boolean }[] = [];
let sparkNext = 0;

/** Sweat thrown off a head (`n` drops, the punch's way). */
function burst(at: { x: number; z: number }, dir: [number, number], n: number, heavy: boolean) {
  for (let i = 0; i < n; i++) {
    if (drops.length >= DROPS) drops.shift();
    const spread = (Math.random() - 0.5) * 1.6;
    const speed = (heavy ? 1.8 : 1.1) * (0.6 + Math.random() * 0.8);
    drops.push({
      x: at.x,
      y: RING_FLOOR_Y + 0.95 + Math.random() * 0.1,
      z: at.z,
      vx: dir[0] * speed - dir[1] * spread,
      vy: 1.0 + Math.random() * (heavy ? 1.6 : 0.9),
      vz: dir[1] * speed + dir[0] * spread,
      life: 0.55 + Math.random() * 0.25,
    });
  }
}

/** A flash of a ring where the punch lands (just in front of the one hit). */
function spark(at: { x: number; z: number }, dir: [number, number], big: boolean) {
  sparks[sparkNext] = { x: at.x - dir[0] * 0.25, y: RING_FLOOR_Y + 0.78, z: at.z - dir[1] * 0.25, age: 0, big };
  sparkNext = (sparkNext + 1) % SPARKS;
}

function RingParticles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const sparkMeshes = useMemo(
    () =>
      Array.from({ length: SPARKS }, () => {
        const m = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: "#fff1c9", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
        m.visible = false;
        m.raycast = noRaycast;
        m.renderOrder = 6;
        return m;
      }),
    []
  );
  useEffect(() => () => sparkMeshes.forEach((m) => (m.material as THREE.Material).dispose()), [sparkMeshes]);
  useFrame(({ camera }, raw) => {
    const dt = Math.min(raw, 0.05);
    const mesh = ref.current;
    if (mesh) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.life -= dt;
        d.vy -= 9.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        if (d.life <= 0 || d.y < RING_FLOOR_Y - 1.2) drops.splice(i, 1);
      }
      for (let i = 0; i < DROPS; i++) {
        const d = drops[i];
        if (d) {
          dummy.position.set(d.x, d.y, d.z);
          dummy.scale.setScalar(Math.max(0.01, Math.min(1, d.life * 2.2)));
        } else dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = Math.max(1, drops.length);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = drops.length > 0;
    }
    sparks.forEach((s, i) => {
      const m = sparkMeshes[i];
      if (!s || !m) return;
      s.age += dt;
      const k = s.age / 0.18;
      m.visible = k < 1;
      if (!m.visible) return;
      m.position.set(s.x, s.y, s.z);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar((s.big ? 1.6 : 1) * (0.8 + k * 2.6));
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      (m.material as THREE.MeshBasicMaterial).color.set(s.big ? "#ffc27a" : "#fff1c9");
    });
  });
  return (
    <>
      <instancedMesh ref={ref} args={[DROP_GEO, DROP_MAT, DROPS]} raycast={noRaycast} frustumCulled={false} visible={false} />
      {sparkMeshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

// --- the stamina arc under the local fighter's feet -----------------------------------------------

const ARC_GEO = new THREE.RingGeometry(0.4, 0.5, 64, 1);
const GUARD_ARC_GEO = new THREE.RingGeometry(0.33, 0.37, 64, 1);
function arcMaterial(color: string, opacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { frac: { value: 1 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // the arc fills clockwise from the front, both ways round: a smile that shrinks toward the back
    fragmentShader:
      "uniform float frac; uniform vec3 color; uniform float opacity; varying vec2 vP; void main() { float a = abs(atan(vP.x, -vP.y)) / 3.14159265; if (a > frac) discard; gl_FragColor = vec4(color, opacity); }",
  });
}

/** A faint arc on the canvas under the local fighter: their stamina (gold; red while Exhausted),
 *  and their guard's meter inside it (cyan). */
function StaminaArc({ localSessionId }: { localSessionId: string | null }) {
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(() => ({ stamina: arcMaterial("#f2c14e", 0.45), guard: arcMaterial("#5fd4ff", 0.35) }), []);
  useEffect(() => () => (mats.stamina.dispose(), mats.guard.dispose()), [mats]);
  const shown = useRef({ stamina: 1, guard: 1 });
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const b = getBout();
    const { mine } = fightersOf(b, localSessionId);
    const on = !!mine && boutLive(b.phase) && mine.state !== "down" && mine.state !== "out";
    g.visible = on;
    if (!on || !mine) return;
    g.position.set(cameraFocus.x, cameraFocus.y + 0.018, cameraFocus.z);
    g.rotation.y = cameraFocus.facing;
    const s = shown.current;
    s.stamina += (mine.stamina / STAMINA_MAX - s.stamina) * 0.25;
    s.guard += (mine.guard / 100 - s.guard) * 0.25;
    mats.stamina.uniforms.frac.value = s.stamina;
    mats.guard.uniforms.frac.value = s.guard;
    (mats.stamina.uniforms.color.value as THREE.Color).set(mine.exhausted ? (Math.sin(clock.elapsedTime * 10) > 0 ? "#ff5a4f" : "#b8322b") : "#f2c14e");
  });
  return (
    <group ref={group} visible={false}>
      <mesh geometry={ARC_GEO} material={mats.stamina} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={3} />
      <mesh geometry={GUARD_ARC_GEO} material={mats.guard} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={3} />
    </group>
  );
}
