import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "colyseus.js";
import type { PlayerState } from "@shared/types";
import { parseTrees } from "@shared/chop";
import { FellableTrees } from "./FellableTrees";
import { ReefRock } from "./ReefRock";
import { SEA_CHANNEL, type ClamSync } from "@shared/voyage";
import { COVE_CAPTAIN, COVE_CLAMS, COVE_GRID, COVE_LANTERNS, COVE_LAYOUT as L, COVE_WADE_DEPTH, COVE_WATER_Y, coveAt, coveBlocked, coveLand, coveWading } from "@shared/worlds/cove";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { seaWater } from "./seaWater";
import { WadeRipples } from "./caveLife";
import { BRINE_URL, BrineStandIn } from "./SeaWorld";
import { BEACH_LIFE_URL } from "./BeachLife";
import { instanced, template } from "./faunaKit";
import { LightShafts } from "./LightShafts";
import { MotePoints } from "./caveLight";
import { cameraFocus } from "./cameraFocus";

// The Hidden Cove (map "hidden_cove", docs/beach-design.md section 5): a sea cave, reached only on the
// captain's boat once the torn chart is whole. One Blender model, cove.glb
// (scripts/blender/build_cove.py, from shared/worlds/cove.ts).
//
//   the lagoon    still, glowing water (seaWater, held at dusk's dim light): a click lands on the
//                 cave's floor, the grid the ground is modelled from
//   the light     a shaft through a hole in the roof, the pearl crystals breathing in the wall, a
//                 lantern on the old bench; it is always evening in here
//   the clams     a twinkle over each one that is ready to be pried open
//   the captain   Brine on the sand by his boat

export const COVE_URL = modelUrl("cove.glb");

const COVE_TIME = { value: 0 };
const COVE_NIGHT = { value: 0.62 };
const COVE_DUSK = { value: 0.15 };
/** The dark round the cave, where its walls end and the page would show. */
const COVE_DARK = new THREE.Color("#060a11");
const CLICK_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const CLICK_GROUND = (() => {
  const { n, cell, ground } = COVE_GRID;
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  for (let k = 0; k <= n; k++)
    for (let i = 0; i <= n; i++) {
      const at = (k * (n + 1) + i) * 3;
      pos[at] = -L.half + i * cell;
      pos[at + 1] = Math.max(ground[k * (n + 1) + i], COVE_WATER_Y - COVE_WADE_DEPTH);
      pos[at + 2] = -L.half + k * cell;
    }
  const index: number[] = [];
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const a = k * (n + 1) + i;
      index.push(a, a + n + 2, a + 1, a, a + n + 1, a + n + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
})();

const COVE_BRINE_TALK: NpcTalk = {
  height: 1.7,
  clicked: ["Thirty years I've kept this place to myself", "Mind the clams: they bite back", "The old shipwright left his bench. Nobody's used it since", "Say the word and we put back to sea"],
  greet: {
    inside: (x, z) => Math.hypot(x - COVE_CAPTAIN.x, z - COVE_CAPTAIN.z) < 3.2,
    lines: ["Well. Here we are", "Not a word of this ashore, mind", "Quiet, isn't it?"],
  },
};

export function CoveWorld({ onFloorClick, room, players, localSessionId, subscribeMessages, trees, ores, onUseProp, onStrike }: { trees: string; ores: string; onUseProp: (propId: string) => void; onStrike: (node: string, dir: [number, number, number], t: number) => void; onFloorClick: (x: number, z: number) => void; room: Room | null; players: Record<string, PlayerState>; localSessionId: string | null; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  const treeState = useMemo(() => parseTrees(trees), [trees]);
  // which clams are shut (the room's): asked for on arriving, told whenever one is pried
  const [clams, setClams] = useState<ClamSync>({});
  useEffect(() => {
    room?.send(SEA_CHANNEL, { op: "pry", clam: "" });
  }, [room]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "coveClams") setClams((payload ?? {}) as ClamSync);
      }),
    [subscribeMessages]
  );
  useFrame((_, dt) => {
    COVE_TIME.value += dt;
  });
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const before = scene.background;
    scene.background = COVE_DARK;
    return () => {
      scene.background = before;
    };
  }, [scene]);
  return (
    <group>
      <mesh geometry={CLICK_GROUND} material={CLICK_MAT} onPointerDown={floorClick} />
      <ModelBoundary what="cove.glb" fallback={<StandIn />}>
        <Suspense fallback={<StandIn />}>
          <CoveModel />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={BRINE_URL} what="brine.glb" prefix="Brine" at={COVE_CAPTAIN} y={coveLand(COVE_CAPTAIN.x, COVE_CAPTAIN.z)} waveEvent="brineWave" standIn={<BrineStandIn />} subscribeMessages={subscribeMessages} talk={COVE_BRINE_TALK} />
      <FellableTrees mapId="hidden_cove" trees={treeState} players={players} localSessionId={localSessionId} subscribeMessages={subscribeMessages} onUseProp={onUseProp} />
      <ReefRock map="hidden_cove" ores={ores} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onStrike={onStrike} />
      <CoveLights />
      <LightShafts shafts={SHAFTS} landY={coveLand} />
      <ModelBoundary what="beach_life.glb" fallback={null}>
        <Suspense fallback={null}>
          <CoveLife />
        </Suspense>
      </ModelBoundary>
      <ClamTwinkles shut={clams} />
      <WadeRipples players={players} localSessionId={localSessionId} mapId="hidden_cove" inWater={coveWading} waterY={COVE_WATER_Y} />
    </group>
  );
}

const STAND_IN_SAND = matte("#efe6d2", 0.9);
const STAND_IN_WATER = matte("#2f7f8f", 0.4);
function StandIn() {
  return (
    <group>
      <mesh geometry={GEO.plane} material={STAND_IN_WATER} rotation={[-Math.PI / 2, 0, 0]} position={[0, COVE_WATER_Y, 0]} scale={[60, 60, 1]} raycast={noRaycast} />
      <mesh geometry={GEO.plane} material={STAND_IN_SAND} rotation={[-Math.PI / 2, 0, 0]} position={[-5, 0.4, -5]} scale={[12, 12, 1]} raycast={noRaycast} />
    </group>
  );
}

function CoveModel() {
  const { scene } = useGLTF(COVE_URL);
  const glow = useMemo(() => {
    let found: THREE.MeshStandardMaterial | null = null;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      if (o.name === "Cove_Water") o.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive && m.emissive.getHex() !== 0) m.toneMapped = false;
        if (m.name === "CV_PearlGlow") found = m;
        if (m.name === "BC_Sea" && !m.userData.flowing) {
          m.userData.flowing = true;
          seaWater(m, COVE_TIME, COVE_NIGHT, COVE_DUSK, true);
        }
      }
    });
    return found as THREE.MeshStandardMaterial | null;
  }, [scene]);
  // the pearl crystals breathe
  useFrame(() => {
    if (glow) glow.emissiveIntensity = 2.2 + 0.7 * Math.sin(COVE_TIME.value * 0.9);
  });
  return <primitive object={scene} />;
}

/** The cave's own light: a soft shaft through the roof, the crystals' glow along the wall, the bench's
 *  lantern, the lagoon's shimmer. */
function CoveLights() {
  const pulse = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (pulse.current) pulse.current.intensity = 5.5 + 1.5 * Math.sin(COVE_TIME.value * 0.9);
  });
  const sky = L.skylight;
  return (
    <>
      <ambientLight color="#8fb7d6" intensity={0.5} />
      <pointLight position={[sky.x, 9, sky.z]} color="#fff2cf" intensity={30} distance={22} decay={1.4} />
      <pointLight ref={pulse} position={[-7.5, 2.2, -6.2]} color="#9fe8ff" intensity={5.5} distance={14} decay={1.6} />
      <pointLight position={[2.5, 2.0, -9.0]} color="#9fe8ff" intensity={4.5} distance={12} decay={1.6} />
      {COVE_LANTERNS.map((p, i) => (
        <pointLight key={i} position={[p.x + 0.3, coveLand(p.x, p.z) + 1.5, p.z + 0.1]} color="#ffd9a0" intensity={2.6} distance={6.5} decay={1.6} />
      ))}
      <pointLight position={[L.lagoon.x - 1.5, 1.2, L.lagoon.z - 1.5]} color="#5fe0d0" intensity={5} distance={13} decay={1.5} />
    </>
  );
}

/** The daylight through the roof: one broad shaft and a thin one beside it. */
const SHAFTS = [
  { x: L.skylight.x, z: L.skylight.z, r: 1.7 },
  { x: L.skylight.x + 1.6, z: L.skylight.z - 0.9, r: 0.8 },
];
const JELLIES = 6;
const CAVE_CRABS = 4;
const MOTES = 36;
const MOTE_COLOR = new THREE.Color("#fff4d6");
/** The cove's little lives (beach_life.glb's templates), client-side: moon jellies glowing in the
 *  lagoon, pale crabs on the wet sand that hurry off from you, dust rising in the skylight's shaft. */
function CoveLife() {
  const { scene } = useGLTF(BEACH_LIFE_URL);
  const jelly = useMemo(() => {
    const t = template(scene, "Fauna_Jelly");
    if (!t) return null;
    const mat = (t.material as THREE.MeshStandardMaterial).clone();
    mat.emissive = new THREE.Color("#6fd6ff");
    mat.emissiveIntensity = 0.9;
    mat.transparent = true;
    mat.opacity = 0.85;
    mat.toneMapped = false;
    return instanced({ ...t, material: mat }, JELLIES, ["#ffffff", "#ffe3f4", "#e2fff6"]);
  }, [scene]);
  const crabs = useMemo(() => instanced(template(scene, "Fauna_SandCrab"), CAVE_CRABS, ["#cfe3ff", "#e8dcff"]), [scene]);
  const motes = useMemo(() => new MotePoints(MOTES), []);
  useEffect(
    () => () => {
      jelly?.mesh.dispose();
      (jelly?.mesh.material as THREE.Material | undefined)?.dispose();
      crabs?.mesh.dispose();
      motes.dispose();
    },
    [jelly, crabs, motes]
  );
  const herd = useMemo(() => Array.from({ length: CAVE_CRABS }, (_, i) => ({ ...coveAt(-50 + i * 32, 0.9), home: -50 + i * 32, tx: 0, tz: 0, rest: 1 + i, yaw: i })), []);
  const seeds = useMemo(() => Array.from({ length: MOTES }, () => ({ a: Math.random() * 6.283, r: Math.random() * 1.5, p: Math.random(), v: 0.05 + Math.random() * 0.06 })), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), w: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), scl: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    const { m, w, q, pos, scl, up } = tmp;
    if (jelly) {
      for (let i = 0; i < JELLIES; i++) {
        // each drifts a slow round of its own in the lagoon, pulsing as it goes
        const a = i * 1.05 + t * 0.035 * (i % 2 ? 1 : -1);
        const r = 2.0 + (i % 3) * 1.25;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 1.3);
        q.setFromAxisAngle(up, a);
        m.compose(pos.set(L.lagoon.x + Math.cos(a) * r, COVE_WATER_Y - 0.04 + 0.03 * pulse, L.lagoon.z + Math.sin(a) * r), q, scl.set(1.5 + 0.2 * pulse, 1.5 - 0.3 * pulse, 1.5 + 0.2 * pulse));
        jelly.mesh.setMatrixAt(i, w.copy(m).multiply(jelly.t.matrix));
      }
      jelly.mesh.instanceMatrix.needsUpdate = true;
    }
    if (crabs) {
      herd.forEach((c, i) => {
        const near = cameraFocus.hasTarget ? Math.hypot(cameraFocus.x - c.x, cameraFocus.z - c.z) : 99;
        let speed = 0.4;
        if (near < 2.0) {
          c.tx = c.x + ((c.x - cameraFocus.x) / (near || 1)) * 2.2;
          c.tz = c.z + ((c.z - cameraFocus.z) / (near || 1)) * 2.2;
          c.rest = 0;
          speed = 2.2;
        } else if (c.rest > 0) {
          c.rest -= dt;
          if (c.rest <= 0) {
            const p = coveAt(c.home + (Math.random() - 0.5) * 22, 0.5 + Math.random() * 1.6);
            c.tx = p.x;
            c.tz = p.z;
          }
        }
        const dx = c.tx - c.x;
        const dz = c.tz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05 && c.rest <= 0) {
          const step = Math.min(d, speed * dt);
          const nx = c.x + (dx / d) * step;
          const nz = c.z + (dz / d) * step;
          if (coveBlocked(nx, nz)) c.rest = 0.6 + Math.random();
          else {
            c.x = nx;
            c.z = nz;
            c.yaw = Math.atan2(dx, dz) + Math.PI / 2;
          }
        } else if (c.rest <= 0) c.rest = 2 + Math.random() * 4;
        q.setFromAxisAngle(up, c.yaw);
        m.compose(pos.set(c.x, coveLand(c.x, c.z), c.z), q, scl.setScalar(1.2));
        crabs.mesh.setMatrixAt(i, w.copy(m).multiply(crabs.t.matrix));
      });
      crabs.mesh.instanceMatrix.needsUpdate = true;
    }
    // dust rising slowly in the shaft
    seeds.forEach((sd, i) => {
      const u = (sd.p + t * sd.v) % 1;
      const a = sd.a + t * 0.1;
      motes.set(i, L.skylight.x + Math.cos(a) * sd.r, coveLand(L.skylight.x, L.skylight.z) + 0.3 + u * 5.5, L.skylight.z + Math.sin(a) * sd.r, 0.5 * Math.sin(Math.PI * u), MOTE_COLOR);
    });
    motes.commit();
  });
  return (
    <>
      {jelly && <primitive object={jelly.mesh} />}
      {crabs && <primitive object={crabs.mesh} />}
      <primitive object={motes.points} />
    </>
  );
}

const TWINKLE_GEO = new THREE.OctahedronGeometry(0.07, 0);
const TWINKLE_MAT = new THREE.MeshBasicMaterial({ color: "#eaffff", transparent: true, opacity: 0.9, toneMapped: false });
/** A twinkle over each clam that is ready to be pried open. */
function ClamTwinkles({ shut }: { shut: ClamSync }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const now = Date.now();
    const t = COVE_TIME.value;
    COVE_CLAMS.forEach((c, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.visible = !(shut[c.id] > now);
      mesh.position.y = coveLand(c.x, c.z) + 0.62 + 0.06 * Math.sin(t * 2 + i);
      mesh.rotation.y = t * 1.5 + i;
      const s = 0.8 + 0.3 * Math.sin(t * 3 + i * 1.7);
      mesh.scale.setScalar(s);
    });
  });
  return (
    <>
      {COVE_CLAMS.map((c, i) => (
        <mesh key={c.id} ref={(m) => {
            refs.current[i] = m;
          }} geometry={TWINKLE_GEO} material={TWINKLE_MAT} position={[c.x, 0.6, c.z]} raycast={noRaycast} />
      ))}
    </>
  );
}
