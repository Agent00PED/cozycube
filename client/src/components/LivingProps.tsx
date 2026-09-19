import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NPCS, type ToggleableSyncState } from "@shared/types";
import { APPROACH_POINTS } from "@shared/props";
import { GEO, noRaycast, onHitLayer } from "../scene/kit";
import { TimeOfDayContext } from "../scene/timeOfDay";
import { useRoomMessage } from "../scene/roomEvents";
import { Character3D, type FloatingEmote } from "./Character3D";

// Interactive "living" props: the two NPC traders, forage bushes, and Mochi the lounge cat.
// Each is a walk-up toggleable (see shared/types isWalkUpProp); the server decides what
// using it does, these only draw it and react to its synced state.

const HIT_PAD = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
const M = {
  crate: mat("#9a6a3e"),
  crateDark: mat("#6b452b"),
  awningA: mat("#3f6d8c"),
  awningB: mat("#f3ead8"),
  fish: mat("#9fb8c8", { roughness: 0.4, metalness: 0.3 }),
  ice: mat("#e6f4f8", { roughness: 0.2 }),
  basket: mat("#c49a5a", { roughness: 1 }),
  leaf: mat("#3f7a45"),
  leafLight: mat("#5a9a55"),
  berry: mat("#4a5bd0", { roughness: 0.4 }),
  firefly: new THREE.MeshBasicMaterial({ color: "#fff2a0", toneMapped: false }),
  catOrange: mat("#e89a52", { roughness: 0.9 }),
  catCream: mat("#f6e2c4", { roughness: 0.9 }),
  catDark: mat("#b8703a", { roughness: 0.9 }),
  nose: mat("#e88a8a"),
  sign: mat("#f2e2bf"),
};

function HitPad({ size, position, onUse }: { size: [number, number, number]; position: [number, number, number]; onUse: () => void }) {
  return (
    <mesh
      ref={onHitLayer}
      geometry={GEO.box}
      material={HIT_PAD}
      position={position}
      scale={size}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button === 2) return;
        e.stopPropagation();
        onUse();
      }}
    />
  );
}

type Part = { geo: THREE.BufferGeometry; p: [number, number, number]; r?: [number, number, number]; s: [number, number, number] };
/** Several fixed shapes baked into one geometry: one draw call for the set. */
function bake(parts: Part[]) {
  const m = new THREE.Matrix4();
  return mergeGeometries(
    parts.map(({ geo, p, r = [0, 0, 0], s }) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      return g.applyMatrix4(m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
    })
  )!;
}

const STALL = {
  crate: bake([
    { geo: GEO.box, p: [0, 0.4, 0], s: [1.4, 0.8, 0.5] },
    ...[-0.66, 0.66].map((x) => ({ geo: GEO.cyl, p: [x, 1.1, -0.2] as [number, number, number], s: [0.06, 2.2, 0.06] as [number, number, number] })),
  ]),
  ice: bake([{ geo: GEO.box, p: [0, 0.82, 0], s: [1.3, 0.05, 0.42] }]),
  fish: bake([-0.4, -0.15, 0.1, 0.35].map((x, i) => ({ geo: GEO.sphereLow, p: [x, 0.87, (i % 2) * 0.08 - 0.04] as [number, number, number], r: [0, 0.4 * (i % 2 ? 1 : -1), 0] as [number, number, number], s: [0.26, 0.07, 0.1] as [number, number, number] }))),
  awningA: bake([0, 2, 4].map((i) => ({ geo: GEO.box, p: [-0.56 + i * 0.28, 2.18, 0.05] as [number, number, number], r: [0.35, 0, 0] as [number, number, number], s: [0.28, 0.04, 0.7] as [number, number, number] }))),
  awningB: bake([
    ...[1, 3].map((i) => ({ geo: GEO.box, p: [-0.56 + i * 0.28, 2.18, 0.05] as [number, number, number], r: [0.35, 0, 0] as [number, number, number], s: [0.28, 0.04, 0.7] as [number, number, number] })),
    { geo: GEO.box, p: [0, 1.95, 0.4], r: [0.35, 0, 0], s: [0.9, 0.22, 0.03] },
  ]),
};

// --- NPC traders ---------------------------------------------------------------------------

const NPC_LOOKS: Record<string, string> = {
  npc_bob: "#d9a47c,cap,#e5d3a6,#9ab8d8,#c8b090,straw",
  npc_oak: "#b67c56,cap,#3b2a20,#5c6b5a,#c8b090,beanie",
};
const NO_EMOTES: FloatingEmote[] = [];

export function NpcTrader({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const info = NPCS[prop.propId];
  const speedRef = useRef(0);
  const [line, setLine] = useState<string | null>(null);
  useRoomMessage<{ propId: string; text: string }>("npcSay", (msg) => {
    if (msg.propId === prop.propId) setLine(msg.text);
  });
  useEffect(() => {
    if (!line) return;
    const t = window.setTimeout(() => setLine(null), 3200);
    return () => window.clearTimeout(t);
  }, [line]);

  const approach = APPROACH_POINTS[prop.propId] ?? { x: prop.x, z: prop.z + 1 };
  const facing = Math.atan2(approach.x - prop.x, approach.z - prop.z);
  const isBob = info?.npc === "bob";

  return (
    <group position={[prop.x, 0, prop.z]}>
      <group rotation={[0, facing, 0]}>
        <Character3D
          userId={prop.propId}
          look={NPC_LOOKS[prop.propId]}
          color="#9ab8d8"
          username={info?.name ?? "Trader"}
          pose="stand"
          speedRef={speedRef}
          holding=""
          action=""
          actionProgress={0}
          toast={0}
          speaking={false}
          emotes={NO_EMOTES}
        />
        {isBob ? <BaitStall /> : <ForageBasket />}
      </group>
      {line && (
        <Html position={[0, 2.25, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-bubble">{line}</div>
        </Html>
      )}
      <HitPad size={[1.2, 1.8, 1.2]} position={[0, 0.9, 0]} onUse={onUse} />
    </group>
  );
}

/** Bob's stall: a striped awning over a crate of fish on ice, beside him (not between him and
 *  the camera, which looks at his stall from the sea side). */
function BaitStall() {
  return (
    <group position={[1.0, 0, -0.1]} rotation={[0, -Math.PI / 2, 0]} scale={0.85}>
      <mesh geometry={STALL.crate} material={M.crate} castShadow raycast={noRaycast} />
      <mesh geometry={STALL.ice} material={M.ice} raycast={noRaycast} />
      <mesh geometry={STALL.fish} material={M.fish} raycast={noRaycast} />
      <mesh geometry={STALL.awningA} material={M.awningA} castShadow raycast={noRaycast} />
      <mesh geometry={STALL.awningB} material={M.awningB} raycast={noRaycast} />
    </group>
  );
}

/** Oak's spot: a wicker basket and a stump behind him. */
function ForageBasket() {
  return (
    <group position={[0.55, 0, -0.35]}>
      <mesh geometry={GEO.cyl} material={M.crateDark} position={[0, 0.22, 0]} scale={[0.5, 0.44, 0.5]} raycast={noRaycast} />
      <mesh geometry={GEO.cylTaper} material={M.basket} position={[0, 0.58, 0]} rotation={[Math.PI, 0, 0]} scale={[0.36, 0.26, 0.36]} raycast={noRaycast} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={GEO.sphereLow} material={M.berry} position={[Math.cos(i * 1.6) * 0.08, 0.72, Math.sin(i * 1.6) * 0.08]} scale={0.07} raycast={noRaycast} />
      ))}
      <mesh geometry={GEO.torus} material={M.basket} position={[0, 0.8, 0]} rotation={[0, 0, 0]} scale={[0.3, 0.3, 0.6]} raycast={noRaycast} />
    </group>
  );
}

// --- Forage bushes ---------------------------------------------------------------------------

export function ForageBush({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const night = useContext(TimeOfDayContext) === "night";
  const firefliesRef = useRef<THREE.Group>(null);
  const berries = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = i * 2.4;
        return [Math.cos(a) * (0.3 + (i % 3) * 0.06), 0.35 + (i % 4) * 0.1, Math.sin(a) * (0.3 + (i % 3) * 0.06)] as [number, number, number];
      }),
    []
  );
  useFrame(({ clock }) => {
    const g = firefliesRef.current;
    if (!g) return;
    g.visible = night && prop.on;
    if (!g.visible) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      c.position.set(Math.sin(t * 0.8 + i * 2) * 0.55, 0.7 + Math.sin(t * 1.3 + i) * 0.25, Math.cos(t * 0.7 + i * 1.7) * 0.55);
      c.scale.setScalar(0.035 * (0.6 + 0.4 * Math.sin(t * 6 + i * 3)));
    });
  });
  return (
    <group position={[prop.x, 0, prop.z]}>
      <mesh geometry={GEO.sphereLow} material={M.leaf} position={[0, 0.35, 0]} scale={[0.95, 0.7, 0.9]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.leafLight} position={[0.22, 0.52, 0.1]} scale={[0.6, 0.5, 0.55]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.leaf} position={[-0.25, 0.46, -0.1]} scale={[0.55, 0.45, 0.5]} raycast={noRaycast} />
      {prop.on &&
        !night &&
        berries.map((p, i) => <mesh key={i} geometry={GEO.sphereLow} material={M.berry} position={p} scale={0.09} raycast={noRaycast} />)}
      <group ref={firefliesRef} visible={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} geometry={GEO.sphereLow} material={M.firefly} raycast={noRaycast} />
        ))}
      </group>
      <HitPad size={[1.0, 1.0, 1.0]} position={[0, 0.45, 0]} onUse={onUse} />
    </group>
  );
}

// --- Beachcombing sparkles --------------------------------------------------------------------

const GLINT = new THREE.MeshBasicMaterial({ color: "#fff6c8", toneMapped: false, transparent: true, depthWrite: false });
// Both blades and the core as one geometry: one draw per sparkle.
const GLINT_GEO = bake([
  { geo: GEO.box, p: [0, 0, 0], s: [0.34, 0.035, 0.035] },
  { geo: GEO.box, p: [0, 0, 0], s: [0.035, 0.34, 0.035] },
  { geo: GEO.sphereLow, p: [0, 0, 0], s: [0.07, 0.07, 0.07] },
]);

/** A glint on the sand: two crossed star blades that twinkle and turn. Nothing when picked. */
export function Sparkle({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const seed = useMemo(() => prop.propId.length * 1.7, [prop.propId]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime + seed;
    g.rotation.y = t * 1.2;
    const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1));
    g.scale.setScalar(0.8 + pulse * 0.5);
    g.position.y = 0.18 + Math.sin(t * 2) * 0.04;
  });
  if (!prop.on) return null;
  return (
    <group position={[prop.x, 0, prop.z]}>
      <group ref={ref}>
        <mesh geometry={GLINT_GEO} material={GLINT} raycast={noRaycast} />
      </group>
      <HitPad size={[0.9, 0.6, 0.9]} position={[0, 0.3, 0]} onUse={onUse} />
    </group>
  );
}

// --- Mochi the cat -----------------------------------------------------------------------------

export function Cat({ prop, onUse }: { prop: ToggleableSyncState; onUse: () => void }) {
  const bodyRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const earRef = useRef<THREE.Mesh>(null);
  const petted = prop.boost > 0;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (bodyRef.current) bodyRef.current.scale.y = 0.2 * (1 + Math.sin(t * (petted ? 5 : 1.6)) * 0.05);
    if (headRef.current) {
      headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, petted ? 0.24 : 0.14, 0.1);
      headRef.current.rotation.z = petted ? Math.sin(t * 3) * 0.15 : 0;
    }
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(t * (petted ? 4 : 0.8)) * (petted ? 0.5 : 0.15);
    // One ear flicks back for a moment every ~3.7 s, like a cat half-listening in its sleep.
    if (earRef.current) {
      const phase = t % 3.7;
      earRef.current.rotation.x = phase < 0.25 ? Math.sin((phase / 0.25) * Math.PI) * 0.7 : 0;
    }
  });
  return (
    <group position={[prop.x, 0, prop.z]} rotation={[0, 0.6, 0]}>
      {/* curled body */}
      <mesh ref={bodyRef} geometry={GEO.sphere} material={M.catOrange} position={[0, 0.1, 0]} scale={[0.42, 0.2, 0.3]} raycast={noRaycast} />
      <mesh geometry={GEO.sphereLow} material={M.catCream} position={[0.05, 0.08, 0.1]} scale={[0.26, 0.12, 0.14]} raycast={noRaycast} />
      {[-0.08, 0.06].map((x) => (
        <mesh key={x} geometry={GEO.sphereLow} material={M.catDark} position={[x, 0.19, 0]} scale={[0.06, 0.03, 0.26]} raycast={noRaycast} />
      ))}
      <group ref={headRef} position={[0.2, 0.14, 0.08]}>
        <mesh geometry={GEO.sphere} material={M.catOrange} scale={[0.19, 0.16, 0.17]} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={M.catOrange} position={[-0.01, 0.09, -0.05]} scale={[0.07, 0.08, 0.06]} raycast={noRaycast} />
        <mesh ref={earRef} geometry={GEO.cone} material={M.catOrange} position={[-0.01, 0.09, 0.05]} scale={[0.07, 0.08, 0.06]} raycast={noRaycast} />
        <mesh geometry={GEO.sphereLow} material={M.nose} position={[0.09, -0.01, 0]} scale={0.022} raycast={noRaycast} />
        {/* closed sleepy eyes */}
        {[-0.035, 0.035].map((z) => (
          <mesh key={z} geometry={GEO.box} material={M.catDark} position={[0.085, 0.02, z]} scale={[0.005, 0.006, 0.03]} raycast={noRaycast} />
        ))}
      </group>
      <group ref={tailRef} position={[-0.18, 0.06, 0]}>
        <mesh geometry={GEO.sphereLow} material={M.catOrange} position={[-0.05, 0, 0.14]} rotation={[0, 0.6, 0]} scale={[0.09, 0.07, 0.34]} raycast={noRaycast} />
      </group>
      {petted && (
        <Html position={[0.1, 0.6, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ position: "relative", width: 0, height: 0 }}>
            <span className="cozy-emote">💕</span>
          </div>
        </Html>
      )}
      <HitPad size={[0.8, 0.6, 0.7]} position={[0, 0.25, 0]} onUse={onUse} />
    </group>
  );
}

// --- The roulette dealer -------------------------------------------------------------------------

const DEALER_LOOK = "#e8c29c,bob,#2a1c14,#1d1d24,#1d1d24,bunny";
const BOW_TIE = new THREE.MeshStandardMaterial({ color: "#b3202e", roughness: 0.5 });
const SHIRT_FRONT = new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.7 });

/** A chibi croupier in a black tux and bunny ears, behind the wheel. Calls the phases. */
export function Dealer({ phase }: { phase: string }) {
  const speedRef = useRef(0);
  const [line, setLine] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const text = phase === "betting" ? "Place your bets! 🎲" : phase === "spinning" ? "No more bets!" : "";
    if (!text) return;
    setLine(text);
    const t = window.setTimeout(() => setLine(null), 2600);
    return () => window.clearTimeout(t);
  }, [phase]);
  return (
    <group position={[2.4, 0, -1.3]}>
      <Character3D
        userId="dealer"
        look={DEALER_LOOK}
        color="#1d1d24"
        username="Dealer"
        pose="stand"
        speedRef={speedRef}
        holding=""
        action=""
        actionProgress={0}
        toast={0}
        speaking={false}
        emotes={NO_EMOTES}
      />
      {/* white shirt front and a red bow tie over the tux */}
      <mesh geometry={GEO.box} material={SHIRT_FRONT} position={[0, 0.56, 0.225]} rotation={[-0.3, 0, 0]} scale={[0.14, 0.18, 0.02]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={BOW_TIE} position={[0, 0.69, 0.25]} scale={[0.15, 0.06, 0.04]} raycast={noRaycast} />
      {line && (
        <Html position={[0, 2.25, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="cozy-bubble">{line}</div>
        </Html>
      )}
    </group>
  );
}
