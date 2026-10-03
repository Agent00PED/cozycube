import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ORE_KINDS, parseOres, type CaveShatter, type CaveStrike, type OreKind } from "@shared/caverns_mining";
import { REEF_NODES } from "@shared/worlds/beach";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { BLOW } from "../entities/activityAnimations";
import { modelUrl } from "../assetVersion";
import { playCaveSfx } from "../audio/cavernAmbience";
import { activity, nowS, remoteBlows } from "../systems/activityStore";
import { prospectStore } from "../systems/prospectStore";
import { noRaycast } from "./kit";
import { NODE_YAW } from "./caveNodes";
import { prospectShake } from "./prospectCamera";
import { ProspectingView } from "./ProspectingView";

// Sunset Beach's fossil reef rock (shared/worlds/beach.ts REEF_NODES): six nodes in the headland's
// seaward face, prospected as the caverns' are (the same room rules, the same close-up: ProspectingView).
// Each rock is drawn from reef.glb (scripts/blender/build_beach.py `build_reef_looks`: `Ore_reef` and
// `Ore_reef_Rubble`); a broken one is its rubble until it grows back; a struck one shudders. The
// blows' verdicts go to the HUD (prospectStore), the swing to the avatar (activityStore).

export const REEF_URL = modelUrl("reef.glb");

type Look = { rock: THREE.Mesh; rubble: THREE.Mesh | null };

export function ReefRock({ ores, subscribeMessages, localSessionId, onStrike }: { ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; localSessionId: string | null; onStrike: (node: string, dir: [number, number, number], t: number) => void }) {
  return (
    <ModelBoundary what="reef.glb" fallback={null}>
      <Suspense fallback={null}>
        <ReefModels ores={ores} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onStrike={onStrike} />
      </Suspense>
    </ModelBoundary>
  );
}

function ReefModels({ ores, subscribeMessages, localSessionId, onStrike }: { ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; localSessionId: string | null; onStrike: (node: string, dir: [number, number, number], t: number) => void }) {
  const { scene } = useGLTF(REEF_URL);
  const look = useMemo((): Look | null => {
    const find = (name: string) => {
      let out: THREE.Mesh | null = null;
      scene.getObjectByName(name)?.traverse((o) => {
        if (!out && (o as THREE.Mesh).isMesh) out = o as THREE.Mesh;
      });
      return out as THREE.Mesh | null;
    };
    const rock = find("Ore_reef");
    return rock ? { rock, rubble: find("Ore_reef_Rubble") } : null;
  }, [scene]);
  const templates = useMemo(() => (look ? ({ reef: { rock: look.rock, glow: null } } as Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>>) : {}), [look]);
  const sync = useMemo(() => parseOres(ores), [ores]);
  const shake = useRef(new Map<string, number>());
  const rocks = useRef(new Map<string, THREE.Mesh>());
  const me = useRef(localSessionId);
  me.current = localSessionId;

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "caveStrike") {
          const st = payload as CaveStrike;
          if (!REEF_NODES.some((n) => n.id === st.node)) return;
          shake.current.set(st.node, performance.now() + (st.verdict === "deflect" ? 120 : 200));
          const mine = st.sessionId === me.current;
          prospectStore.strike(st, mine);
          if (mine) {
            prospectShake(st.perfect ? 0.1 : st.verdict === "direct" ? 0.05 : st.verdict === "deflect" ? 0.08 : 0.025);
            activity.deflect = st.verdict === "deflect";
          } else remoteBlows.set(st.sessionId, { at: nowS() - BLOW.down, deflect: st.verdict === "deflect" });
          playCaveSfx(st.verdict === "direct" ? "crack" : st.verdict === "near" ? "clink" : st.verdict === "deflect" ? "clang" : "clatter", mine ? 1 : 0.45);
        } else if (type === "caveShatter") {
          const sh = payload as CaveShatter;
          if (!REEF_NODES.some((n) => n.id === sh.node)) return;
          playCaveSfx("shatter", 1);
          if (sh.crew.includes(me.current ?? "")) prospectShake(0.14);
        }
      }),
    [subscribeMessages]
  );

  // a struck rock shudders a moment
  useFrame(() => {
    const now = performance.now();
    for (const n of REEF_NODES) {
      const mesh = rocks.current.get(n.id);
      if (!mesh) continue;
      const until = shake.current.get(n.id) ?? 0;
      const k = until > now ? (until - now) / 200 : 0;
      mesh.position.x = n.x + Math.sin(now * 0.09) * 0.02 * k;
      mesh.position.z = n.z + Math.cos(now * 0.11) * 0.02 * k;
    }
  });

  if (!look) return null;
  const r = ORE_KINDS.reef.radius;
  return (
    <group>
      {REEF_NODES.map((n) => {
        const up = sync[n.id]?.up ?? true;
        const yaw = NODE_YAW.get(n.id) ?? 0;
        return up ? (
          <mesh
            key={n.id}
            ref={(m) => {
              if (m) rocks.current.set(n.id, m);
              else rocks.current.delete(n.id);
            }}
            geometry={look.rock.geometry}
            material={look.rock.material}
            position={[n.x, n.y, n.z]}
            rotation={[0, yaw, 0]}
            raycast={noRaycast}
          />
        ) : look.rubble ? (
          <mesh key={n.id} geometry={look.rubble.geometry} material={look.rubble.material} position={[n.x, n.y, n.z]} rotation={[0, yaw, 0]} raycast={noRaycast} />
        ) : (
          <mesh key={n.id} position={[n.x, n.y + 0.08, n.z]} scale={[r, 0.16, r]} raycast={noRaycast}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#8e8679" roughness={0.9} />
          </mesh>
        );
      })}
      <ProspectingView templates={templates} onStrike={onStrike} />
    </group>
  );
}
