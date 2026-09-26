import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import { walkY } from "@shared/collision";
import { DERBY_HORSES, DERBY_LANES, DERBY_RACE_MS, SLOT_SYMBOLS, type CasinoPropEvent, type CasinoWin } from "@shared/casino";
import { CASINO_LAYOUT as L, CASINO_STAGES, TIP_JARS } from "@shared/worlds/casino";
import { ModelBoundary } from "../entities/ModelBoundary";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { useLampBoost } from "./timeOfDay";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { CasinoStaff } from "../entities/CasinoStaff";
import { AmbientPatrons } from "../entities/AmbientPatrons";
import { cameraFocus } from "./cameraFocus";
import { liveMotion } from "../systems/liveMotion";
import { distanceVolume, playPiano, playSfx } from "../audio/sfx";
import { pushToast } from "../components/hud/toastStore";

// The Velvet Casino (map 3). The hall is one Blender model, casino.glb
// (scripts/blender/build_casino.py, laid out from shared/worlds/casino.ts): everything that stands
// still is a single mesh painted in vertex colours over six shared finishes (six draw calls for the
// whole hall), and the things that move are nodes of their own. This file loads it, lights it and
// brings it to life:
//
//   the finishes     matte clay and a smoother sheen as they come; the glow (bulbs, crystal, flames,
//                    the crystal ball) and the neon drawn unlit at full brightness; the floor's two
//                    decal layers nudged toward the camera in the depth test (never a flicker)
//   the floor        clicks land on the hall's floor, or on the raised pit's and lounge's tops
//   the wheel        turns slowly while bets are open, spins up when the croupier launches it and
//                    runs down over the spin (the room's roulette phase)
//   the neon         Neon Alley's tubes and floor strip breathe, with the odd flutter
//   the marquee      the Big-Win board over the main floor: the room's wins as they happen (a
//                    "casinoWin" message), the house's regulars' in between, scrolling in a ring of
//                    chasing bulbs (a canvas painted on the Prop_Marquee quad)
//   celebrations     a jackpot or a number hit straight up sets the whole hall off: a brass fanfare,
//                    the chandeliers and every bulb flaring, confetti over the winner
//   the extras       the craps dice tumble to the thrower's roll; the Turf Club's five horses race;
//                    the coin pusher's plate slides; the cue ball breaks the rack; the baby grand
//                    plays its arpeggio; Madame Zara's brass owl swivels, and hoots at a reading; a
//                    tip in a dealer's jar sparkles (every one a "casinoProp" message: all see it)
//   the staff        Mr. Vance, Boris, Madame Vivienne, Jasper, Pippin and Bruno (entities/CasinoStaff.tsx)
//   the crowd        a dozen regulars drifting between the tables and the bar (entities/AmbientPatrons.tsx)
//   the light        a warm fill, amber pools under the four chandeliers, washes along the walls,
//                    the banker's lamp, the back bar, the billiards lamp, the lounge's candles, and a
//                    pink and a cyan glow off the slot row
//
// No light casts a shadow, and nothing hangs low over the floor between the camera and the tables.

export const CASINO_URL = modelUrl("casino.glb");

/** The two floor decal layers, nudged toward the camera in the depth test (the neon strip lies on the floor too). */
const DECAL_OFFSET: Record<string, number> = { CS_Decal1: -1, CS_Decal2: -3, CS_Neon: -3 };
// the click planes are never drawn (no draw calls), but they take the clicks
const CLICK_MAT = new THREE.MeshBasicMaterial({ visible: false });

/** The wheel's turn (radians per second): idling while bets are open, launched, and run down. */
const WHEEL_IDLE = 0.35;
const WHEEL_LAUNCH = 9;

interface CasinoWorldProps {
  onFloorClick: (x: number, z: number) => void;
  /** The room, for the roulette's phase (the wheel follows it) and who you are. */
  room: Room | null;
  /** One-shot messages: the staff wave and talk on them, the extras play them out. */
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

/** A module-level pulse the whole hall reads: set by a celebration, decaying. */
const flare = { at: -99 };
const FLARE_S = 3.2;
function flareNow(): number {
  const s = performance.now() / 1000 - flare.at;
  return s >= 0 && s < FLARE_S ? Math.pow(1 - s / FLARE_S, 1.5) * (0.75 + 0.25 * Math.sin(s * 18)) : 0;
}

/** Where a player is right now (you: where you see yourself). */
function whereIs(room: Room | null, sessionId: string): { x: number; z: number } | null {
  if (room && sessionId === room.sessionId && cameraFocus.hasTarget) return { x: cameraFocus.x, z: cameraFocus.z };
  const m = liveMotion.get(sessionId);
  return m ? { x: m.x, z: m.z } : null;
}

export function CasinoWorld({ onFloorClick, room, subscribeMessages }: CasinoWorldProps) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  return (
    <group>
      <CasinoBackdrop />
      <mesh geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[L.half * 2, L.half * 2, 1]} onPointerDown={floorClick} />
      {/* the raised pit and lounge take their own clicks, at their height (the nearer hit wins) */}
      {CASINO_STAGES.map((s) => (
        <mesh key={s.id} geometry={GEO.plane} material={CLICK_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[(s.x0 + s.x1) / 2, s.h + 0.02, (s.z0 + s.z1) / 2]} scale={[s.x1 - s.x0, s.z1 - s.z0, 1]} onPointerDown={floorClick} />
      ))}
      <ModelBoundary what="casino.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CasinoModel room={room} subscribeMessages={subscribeMessages} />
        </Suspense>
      </ModelBoundary>
      <CasinoStaff subscribeMessages={subscribeMessages} />
      <AmbientPatrons subscribeMessages={subscribeMessages} />
      <Confetti room={room} subscribeMessages={subscribeMessages} />
      <CasinoLights />
    </group>
  );
}

// while the model loads, or if it cannot: the hall as a plain slab of burgundy carpet
const STAND_IN_TOP = matte("#5a1424", 0.9);
const STAND_IN_SIDE = matte("#24140f", 0.85);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.3, 0]} scale={[L.half * 2, 0.6, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_TOP} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[L.half * 2, L.half * 2, 1]} raycast={noRaycast} />
    </group>
  );
}

// --- the dice: which way up shows which number (build_casino.py DIE_FACES: +y 1, -y 6, +x 3,
// -x 4, +z 2, -z 5) ---
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const FACE_UP: Record<number, THREE.Quaternion> = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(X, Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(Z, -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2),
};
const ROLL_S = 1.3;
/** A tiny seeded generator, so every client rolls, races and plays the same way. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Roll {
  at: number;
  dice: [number, number];
  from: THREE.Vector3[];
  to: THREE.Vector3[];
  spin: THREE.Vector3[];
  end: THREE.Quaternion[];
}
interface Race {
  at: number;
  winner: number;
  pace: number[][];
}

/** The hall from Blender: its finishes set, its glow kept, the wheel, the neon and the extras alive. */
function CasinoModel({ room, subscribeMessages }: { room: Room | null; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const { scene } = useGLTF(CASINO_URL);
  const boost = useLampBoost();
  const marquee = useMarquee(subscribeMessages);
  const parts = useMemo(() => {
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: DECAL_OFFSET.CS_Neon, polygonOffsetUnits: DECAL_OFFSET.CS_Neon });
    const screen = new THREE.MeshBasicMaterial({ map: marquee.texture, toneMapped: false });
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {}; // the invisible floor planes and the pads take the clicks
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CS_Glow") mesh.material = glow;
      else if (m.name === "CS_Neon") mesh.material = neon;
      else if (m.name === "CS_Screen") mesh.material = screen;
      else {
        const offset = DECAL_OFFSET[m.name];
        if (offset !== undefined) {
          m.polygonOffset = true;
          m.polygonOffsetFactor = offset;
          m.polygonOffsetUnits = offset;
        }
      }
    });
    const get = (name: string) => scene.getObjectByName(name) ?? null;
    const horse = get("Prop_DerbyHorse") as THREE.Mesh | null;
    let horses: THREE.InstancedMesh | null = null;
    if (horse) {
      // the template stands at lane 0's start; five of it race, one a lane, each its own colours
      horse.visible = false;
      horses = new THREE.InstancedMesh(horse.geometry, horse.material, DERBY_LANES);
      horses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      horses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DERBY_LANES * 3), 3);
      ["#c8743a", "#8a5a3a", "#cfcfd6", "#5a5050", "#e8c080"].forEach((c, i) => horses!.setColorAt(i, new THREE.Color(c)));
      horses.frustumCulled = false;
      horses.raycast = () => {};
      (horse.parent ?? scene).add(horses);
    }
    const dice = [get("Prop_CrapsDie1"), get("Prop_CrapsDie2")].filter(Boolean) as THREE.Object3D[];
    return {
      glow,
      neon,
      wheel: get("Prop_RouletteWheel"),
      owl: get("Prop_ZaraOwl"),
      owlHead: get("Prop_ZaraOwlHead"),
      dice,
      diceRest: dice.map((d) => ({ p: d.position.clone(), q: d.quaternion.clone() })),
      horse,
      horses,
      plate: get("Prop_PusherPlate"),
      plateRest: get("Prop_PusherPlate")?.position.clone() ?? null,
      cue: get("Prop_CueBall"),
      cueRest: get("Prop_CueBall")?.position.clone() ?? null,
    };
  }, [scene, marquee.texture]);
  useEffect(
    () => () => {
      parts.glow.dispose();
      parts.neon.dispose();
      parts.horses?.removeFromParent();
      parts.horses?.dispose();
    },
    [parts]
  );

  // the extras, played out from their messages
  const spin = useRef({ phase: "", since: 0, speed: WHEEL_IDLE });
  const roll = useRef<Roll | null>(null);
  const race = useRef<Race | null>(null);
  const hoot = useRef(-99);
  const push = useRef(-99);
  const breakAt = useRef(-99);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "casinoWin") {
          const win = payload as CasinoWin;
          if (win?.celebrate) {
            flare.at = performance.now() / 1000;
            playSfx("jackpot");
          }
          return;
        }
        if (type !== "casinoProp") return;
        const ev = payload as CasinoPropEvent;
        const now = performance.now() / 1000;
        const mine = ev.sessionId === room?.sessionId;
        const heard = (x: number, z: number) => distanceVolume(cameraFocus.x, cameraFocus.z, x, z);
        if (ev.kind === "craps" && ev.dice && parts.dice.length === 2) {
          const r = seeded(ev.seed);
          const felt = parts.diceRest[0].p.y;
          const thrower = whereIs(room, ev.sessionId);
          const nearSide = !thrower || thrower.z > L.craps.z; // the dice cross the table away from the thrower
          const z0 = L.craps.z + (nearSide ? 0.45 : -0.45);
          const z1 = L.craps.z + (nearSide ? -0.35 : 0.35);
          roll.current = {
            at: now,
            dice: ev.dice,
            from: [0, 1].map((k) => new THREE.Vector3(L.craps.x - 0.3 + k * 0.25 + r() * 0.2, felt + 0.25, z0)),
            to: [0, 1].map((k) => new THREE.Vector3(L.craps.x - 0.55 + k * 0.5 + r() * 0.5, felt, z1 + (r() - 0.5) * 0.25)),
            spin: [0, 1].map(() => new THREE.Vector3(8 + r() * 10, 6 + r() * 8, 5 + r() * 8)),
            end: ev.dice.map((n) => new THREE.Quaternion().setFromAxisAngle(Y, r() * Math.PI * 2).multiply(FACE_UP[n])),
          };
          playSfx("dice", heard(L.craps.x, L.craps.z));
          if (mine) window.setTimeout(() => pushToast(`You rolled ${ev.dice![0]} + ${ev.dice![1]} = ${ev.dice![0] + ev.dice![1]}${ev.dice![0] + ev.dice![1] === 7 || ev.dice![0] + ev.dice![1] === 11 ? ": a natural!" : ""}`, { emoji: "🎲" }), ROLL_S * 1000);
        } else if (ev.kind === "derby") {
          const r = seeded(ev.seed);
          // each horse's pace in four stretches; the winner's is made to be the quickest overall
          const pace = Array.from({ length: DERBY_LANES }, () => Array.from({ length: 4 }, () => 0.7 + r() * 0.6));
          const total = (k: number) => pace[k].reduce((a, b) => a + b, 0);
          const best = Math.max(...pace.map((_, k) => total(k)));
          const w = ev.winner ?? 0;
          if (total(w) < best + 0.2) pace[w][3] += best + 0.2 - total(w);
          race.current = { at: now, winner: w, pace };
          playSfx("bugle", heard(L.derby.x, L.derby.z));
          if (mine) {
            pushToast("And they're off at the Turf Club!", { emoji: "🏇" });
            window.setTimeout(() => pushToast(`${DERBY_HORSES[w]} wins by a whisker!`, { emoji: "🏆", tone: "win" }), DERBY_RACE_MS - 400);
          }
        } else if (ev.kind === "pusher") {
          push.current = now;
          playSfx("coins", heard(L.pusher.x, L.pusher.z));
        } else if (ev.kind === "billiards") {
          breakAt.current = now;
          window.setTimeout(() => playSfx("clack", heard(L.billiards.x, L.billiards.z)), 450);
        } else if (ev.kind === "piano") {
          playPiano(ev.seed, heard(L.piano.x, L.piano.z));
        } else if (ev.kind === "fortune") {
          hoot.current = now;
          playSfx("hoot", heard(L.zara.x, L.zara.z));
        } else if (ev.kind === "tipjar" && ev.dealer) {
          const jar = TIP_JARS[ev.dealer];
          sparkle(jar.x, jar.y + 0.18, jar.z);
          playSfx("sparkle", heard(jar.x, jar.z));
        } else if (ev.kind === "vipdoor") {
          playSfx("rattle");
        } else if (ev.kind === "barmenu") {
          playSfx("fizz", heard(L.bar.x1, 6.9));
        }
      }),
    [subscribeMessages, parts, room]
  );

  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpE = useMemo(() => new THREE.Euler(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const now = performance.now() / 1000;
    // the wheel: launched as the spin starts, then running down to a crawl over the spin
    const phase = room?.state?.roulette?.phase ?? "betting";
    const s = spin.current;
    if (phase !== s.phase) {
      s.phase = phase;
      s.since = t;
    }
    const target = phase === "spinning" ? WHEEL_LAUNCH * Math.max(0.08, 1 - (t - s.since) / 6) : WHEEL_IDLE;
    s.speed += (target - s.speed) * Math.min(1, dt * (phase === "spinning" && t - s.since < 0.5 ? 6 : 1.2));
    if (parts.wheel) parts.wheel.rotation.y += s.speed * dt;
    // the neon breathes, with the odd flutter; every bulb sits a touch brighter after dark, and
    // flares with a celebration
    const f = flareNow();
    const flutter = Math.sin(t * 23) > 0.985 ? 0.55 : 1;
    parts.neon.color.setScalar((0.85 + 0.15 * Math.sin(t * 1.7)) * flutter * (1 + f * 0.6));
    parts.glow.color.setScalar(0.92 + 0.06 * Math.min(1.5, boost) + f * 0.5);
    // Madame Zara's owl: an idle swivel and bob; at a reading, a full turn of the head and a flap
    const h = now - hoot.current;
    if (parts.owlHead) parts.owlHead.rotation.y = h >= 0 && h < 1.6 ? Math.PI * 2 * easeInOut(h / 1.6) : 0.9 * Math.sin(t * 0.35) * (0.65 + 0.35 * Math.sin(t * 0.13));
    if (parts.owl) parts.owl.scale.setScalar(h >= 0 && h < 1.2 ? 1 + 0.08 * Math.sin(h * 20) * (1 - h / 1.2) : 1 + 0.01 * Math.sin(t * 2));
    // the dice: a tumble across the felt, bouncing, settling on the roll
    const r = roll.current;
    parts.dice.forEach((d, k) => {
      if (!r) return;
      const u = Math.min(1, (now - r.at) / ROLL_S);
      d.position.lerpVectors(r.from[k], r.to[k], easeOut(u));
      d.position.y = r.to[k].y + Math.abs(Math.sin(u * Math.PI * 3)) * 0.18 * (1 - u);
      if (u < 1) {
        tmpE.set(r.spin[k].x * u * (1 - u * 0.7), r.spin[k].y * u, r.spin[k].z * u * (1 - u * 0.5));
        tmpQ.setFromEuler(tmpE);
        d.quaternion.copy(tmpQ).slerp(r.end[k], Math.max(0, (u - 0.6) / 0.4));
      } else d.quaternion.copy(r.end[k]);
    });
    // the Turf Club: five horses down their lanes; after the finish they trot back to the start
    if (parts.horses && parts.horse) {
      const base = parts.horse.position;
      const lane = (L.derby.w - 0.16) / DERBY_LANES;
      const length = L.derby.len - 0.25 - 0.2;
      const rc = race.current;
      const el = rc ? (now - rc.at) * 1000 : Infinity;
      for (let k = 0; k < DERBY_LANES; k++) {
        let p = 0;
        if (rc && el < DERBY_RACE_MS) {
          const pace = rc.pace[k];
          const total = pace.reduce((a, b) => a + b, 0);
          const best = Math.max(...rc.pace.map((row) => row.reduce((a, b) => a + b, 0)));
          const u = el / (DERBY_RACE_MS - 800);
          // how far along: the stretches at their paces, the fastest arriving at u = 1
          let dist = 0;
          for (let j = 0; j < 4; j++) dist += pace[j] * Math.max(0, Math.min(1, u * 4 - j));
          p = Math.min(1, (dist / best) * (total >= best - 1e-6 ? 1 : 0.985));
        } else if (rc && el < DERBY_RACE_MS + 2600) {
          p = 1 - (el - DERBY_RACE_MS) / 2600;
        }
        const running = rc && el < DERBY_RACE_MS + 2600;
        dummy.position.set(base.x + k * lane, base.y + (running ? Math.abs(Math.sin(now * 14 + k)) * 0.012 : 0), base.z + p * length);
        dummy.rotation.set(running ? Math.sin(now * 14 + k) * 0.08 : 0, running && el > DERBY_RACE_MS ? Math.PI : 0, 0);
        dummy.updateMatrix();
        parts.horses.setMatrixAt(k, dummy.matrix);
      }
      parts.horses.instanceMatrix.needsUpdate = true;
    }
    // the coin pusher's plate: always sliding, briskly for a moment after a push
    if (parts.plate && parts.plateRest) {
      const brisk = now - push.current < 2 ? 2.4 : 1;
      parts.plate.position.x = parts.plateRest.x + 0.06 * Math.sin(t * 1.4 * brisk);
    }
    // the cue ball: a break into the rack, then back to the head spot
    if (parts.cue && parts.cueRest) {
      const b = now - breakAt.current;
      const k = b < 0 ? 0 : b < 0.45 ? easeIn(b / 0.45) : b < 2.2 ? 1 : b < 3.2 ? 1 - easeInOut(b - 2.2) : 0;
      parts.cue.position.x = parts.cueRest.x + k * (L.billiards.len - 1.45);
      parts.cue.rotation.z = -parts.cue.position.x * 20;
    }
    marquee.tick(now);
  });

  return <primitive object={scene} />;
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const easeIn = (x: number) => x * x;
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// --- the Big-Win marquee ---------------------------------------------------------------------

const REGULARS = ["Lady Honeysuckle", "Count Whiskerton", "The Baroness", "Sir Reginald", "Madame Plume", "Dr. Fluffington", "Captain Barnacles", "Duchess Marmalade", "Monsieur Truffle", "Old Tom Tabby"];
const SCROLL_S = 7;

/** The marquee's canvas: a message scrolling across between chasing bulbs, repainted ~20 times a second. */
function useMarquee(subscribeMessages: (listener: RoomMessageListener) => () => void) {
  const state = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 144;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    return { canvas, texture, queue: [] as { text: string; live: boolean }[], current: { text: "★ THE VELVET CASINO ★  BIG WINNERS TONIGHT", live: false }, since: 0, painted: 0 };
  }, []);
  useEffect(() => () => state.texture.dispose(), [state]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "casinoWin") return;
        const w = payload as CasinoWin;
        const game = w.game === "slots" ? "🎰" : w.game === "roulette" ? "🎡" : "🃏";
        state.queue.unshift({ text: `${game} ${w.username.toUpperCase()}  ${w.detail}  +${w.amount} CHIPS${w.celebrate ? "  ★ JACKPOT ★" : ""}`, live: true });
        state.queue = state.queue.slice(0, 6);
      }),
    [subscribeMessages, state]
  );
  const simulated = () => {
    const who = REGULARS[Math.floor(Math.random() * REGULARS.length)].toUpperCase();
    const r = Math.random();
    if (r < 0.45) {
      const sym = SLOT_SYMBOLS[2 + Math.floor(Math.random() * 4)];
      return `🎰 ${who}  ${sym}${sym}${sym}  +${[75, 125, 200, 375][Math.floor(Math.random() * 4)]} CHIPS`;
    }
    if (r < 0.75) return `🎡 ${who}  ${Math.floor(Math.random() * 37)} STRAIGHT UP  +${[180, 360, 900][Math.floor(Math.random() * 3)]} CHIPS`;
    if (r < 0.9) return `🃏 ${who}  BLACKJACK!  +${[25, 62, 125, 250][Math.floor(Math.random() * 4)]} CHIPS`;
    return `🏇 ${who}  BACKED ${DERBY_HORSES[Math.floor(Math.random() * DERBY_HORSES.length)].toUpperCase()} AT THE TURF CLUB`;
  };
  const tick = (now: number) => {
    if (now - state.painted < 0.05) return;
    state.painted = now;
    if (!state.since) state.since = now;
    if (now - state.since > SCROLL_S) {
      state.current = state.queue.shift() ?? { text: simulated(), live: false };
      state.since = now;
    }
    const g = state.canvas.getContext("2d");
    if (!g) return;
    const W = state.canvas.width;
    const H = state.canvas.height;
    g.fillStyle = "#120a0e";
    g.fillRect(0, 0, W, H);
    // the chasing bulbs round the edge
    const step = 24;
    const chase = Math.floor(now * 8);
    let k = 0;
    for (let x = 12; x < W; x += step) {
      for (const y of [10, H - 10]) bulb(g, x, y, (k++ + chase) % 3 === 0);
    }
    for (let y = 10 + step; y < H - 10; y += step) {
      for (const x of [10, W - 10]) bulb(g, x, y, (k++ + chase) % 3 === 0);
    }
    // the message, scrolling in from the right
    const u = (now - state.since) / SCROLL_S;
    g.font = "bold 44px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    g.textBaseline = "middle";
    const width = g.measureText(state.current.text).width;
    const x = W - 20 - u * (width + W - 40);
    g.save();
    g.beginPath();
    g.rect(24, 24, W - 48, H - 48);
    g.clip();
    g.fillStyle = state.current.live ? "#ffe07a" : "#f6d9a8";
    g.shadowColor = state.current.live ? "#ff9f1a" : "#c9722a";
    g.shadowBlur = 12;
    g.fillText(state.current.text, x, H / 2 + 2);
    g.restore();
    state.texture.needsUpdate = true;
  };
  return { texture: state.texture, tick };
}

function bulb(g: CanvasRenderingContext2D, x: number, y: number, lit: boolean) {
  g.beginPath();
  g.arc(x, y, 5, 0, Math.PI * 2);
  g.fillStyle = lit ? "#fff2b0" : "#8a5a24";
  g.fill();
}

// --- confetti over a winner, sparkles over a tip ------------------------------------------------

const BITS = 90;
const CONFETTI_S = 3.4;
const CONFETTI_COLORS = ["#ff4fa3", "#ffd23f", "#4fe3ff", "#7cf0a4", "#ff7a3d", "#b18cff", "#ffffff"].map((c) => new THREE.Color(c));
const GOLD = new THREE.Color("#ffd76a");
const BIT_GEO = new THREE.PlaneGeometry(0.07, 0.045);
const BIT_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  at: number;
  life: number;
}
const bits: Bit[] = [];
let nextBit = 0;
function burst(x: number, y: number, z: number, n: number, speed: number, life: number, colour: (i: number) => THREE.Color, mesh: THREE.InstancedMesh | null) {
  const now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const slot = nextBit++ % BITS;
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    bits[slot] = { x, y, z, vx: Math.cos(a) * v, vy: speed * (0.6 + Math.random()), vz: Math.sin(a) * v, spin: 4 + Math.random() * 8, at: now, life };
    mesh?.setColorAt(slot, colour(i));
  }
  if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
}
/** Set by <Confetti/>: a tip's sparkle is thrown from outside it. */
let sparkle: (x: number, y: number, z: number) => void = () => {};

function Confetti({ room, subscribeMessages }: { room: Room | null; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    sparkle = (x, y, z) => burst(x, y, z, 18, 0.9, 1.4, () => GOLD, ref.current);
    return () => {
      sparkle = () => {};
    };
  }, []);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "casinoWin" || !(payload as CasinoWin)?.celebrate) return;
        const at = whereIs(room, (payload as CasinoWin).sessionId);
        if (!at) return;
        burst(at.x, walkY("velvet_casino", at.x, at.z) + 2.6, at.z, 70, 1.6, CONFETTI_S, () => CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)], ref.current);
      }),
    [subscribeMessages, room]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BITS * 3).fill(1), 3);
    for (let i = 0; i < BITS; i++) mesh.setMatrixAt(i, hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, [hidden]);
  useFrame((_, rawDt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now() / 1000;
    let any = false;
    for (let i = 0; i < BITS; i++) {
      const b = bits[i];
      if (!b || now - b.at > b.life) {
        mesh.setMatrixAt(i, hidden);
        continue;
      }
      any = true;
      b.vy -= 3.2 * dt;
      b.vx *= 0.985;
      b.vz *= 0.985;
      b.vy = Math.max(b.vy, -0.9); // paper flutters down, it does not drop
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const age = (now - b.at) / b.life;
      dummy.position.set(b.x + Math.sin(now * 3 + i) * 0.03, b.y, b.z);
      dummy.rotation.set(now * b.spin, now * b.spin * 0.7, i);
      dummy.scale.setScalar(age > 0.8 ? (1 - age) * 5 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.visible = any;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[BIT_GEO, BIT_MAT, BITS]} raycast={noRaycast} frustumCulled={false} visible={false} />;
}

/** The casino's own lights, all warm and shadowless (a fill, then point lights scaled by the hour's
 *  lamp boost; the chandeliers flare with a celebration). */
function CasinoLights() {
  const boost = useLampBoost();
  const lamp = Math.min(1.6, boost);
  const face = -L.half + L.walls.t;
  const [pinkX, pinkY] = [L.slots.x + 1.2, 1.7];
  const chandeliers = useRef<(THREE.PointLight | null)[]>([]);
  useFrame(() => {
    const f = flareNow();
    chandeliers.current.forEach((l) => {
      if (l) l.intensity = 5 * lamp * (1 + f * 1.4);
    });
  });
  const lounge = L.stages.find((s) => s.id === "lounge")!.h;
  return (
    <>
      {/* the hall's own fill: warm from above, plum from the carpet, so the velvet reads as red, not black */}
      <hemisphereLight args={["#ffd9a8", "#4a1a26", 0.9]} />
      {L.chandeliers.map(([x, y, z], i) => (
        <pointLight key={i} ref={(l) => (chandeliers.current[i] = l)} color="#ffc873" intensity={5 * lamp} distance={13} decay={1.6} position={[x, y - 0.25, z]} castShadow={false} />
      ))}
      {/* the sconces along each wall: one soft wash apiece */}
      <pointLight color="#ffcf8a" intensity={1.1 * lamp} distance={8} decay={2} position={[-4, 2.4, face + 0.6]} castShadow={false} />
      <pointLight color="#ffcf8a" intensity={1.1 * lamp} distance={8} decay={2} position={[face + 0.6, 2.4, -8]} castShadow={false} />
      {/* the banker's lamp in the cage, the back bar, the billiards lamp, the lounge's candles */}
      <pointLight color="#ffd98a" intensity={0.9 * lamp} distance={4} decay={2} position={[L.cage.window - 0.85, 1.5, L.cage.z1 - 0.4]} castShadow={false} />
      <pointLight color="#ffc070" intensity={1.1 * lamp} distance={5} decay={2} position={[face + 0.8, lounge + 2.3, (L.bar.z0 + L.bar.z1) / 2]} castShadow={false} />
      <pointLight color="#ffe2a0" intensity={1.3 * lamp} distance={3.6} decay={2} position={[L.billiards.x, lounge + L.billiards.lamp - 0.2, L.billiards.z]} castShadow={false} />
      <pointLight color="#ffb866" intensity={0.8 * lamp} distance={4.5} decay={2} position={[(L.cocktails[0].x + L.cocktails[1].x) / 2, lounge + 1.0, L.cocktails[0].z]} castShadow={false} />
      {/* Neon Alley: a pink glow and a cyan one off the slot row */}
      <pointLight color="#ff4fa3" intensity={1.0} distance={5} decay={2} position={[pinkX, pinkY, L.slots.zs[1]]} castShadow={false} />
      <pointLight color="#4fe3ff" intensity={0.9} distance={5} decay={2} position={[pinkX, pinkY, L.slots.zs[4]]} castShadow={false} />
    </>
  );
}

/** Inside, there is no sky: a deep plum dark behind the hall, whatever the hour. */
export function CasinoBackdrop() {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#0e0709");
      grad.addColorStop(1, "#22101a");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => {
    const before = scene.background;
    scene.background = texture;
    return () => {
      scene.background = before;
      texture.dispose();
    };
  }, [scene, texture]);
  return null;
}
