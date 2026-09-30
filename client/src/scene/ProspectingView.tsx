import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { ORE_NODE_AT } from "@shared/worlds/caverns";
import { ORE_KINDS, PICKAXES, STRIKE_DEBOUNCE_S, oreCenterY, strikeRadii, type OreKind } from "@shared/caverns_mining";
import { useProspect } from "../systems/prospectStore";
import { prospectCam } from "./prospectCamera";
import { noRaycast } from "./kit";
import { setCaveHum } from "../audio/cavernAmbience";
import { NODE_YAW } from "./caveNodes";
import { noteBlow } from "../systems/activityStore";

// Prospecting, in the scene (tactile, zero UI): while you are at a node (systems/prospectStore.ts),
// the camera frames its rock close up (prospectCamera.ts) and:
//
//   the proxy    an invisible convex hull round the rock (its bounds and 5% more) takes the pointer:
//                a tap or a click is a strike there (onPointerDown, a quarter second's debounce so a
//                phone's or an iPad's double tap is one strike), sent as its direction from the
//                rock's centre; the server judges it against the weak spot
//   the tells    the weak spot is never marked: it shows only in the rock itself, where it is on its
//                surface (found by casting onto the rock's own mesh): stress fissures glowing faintly
//                in its kind's colour, a mineral's glint twinkling (50% brighter with a Glimmer
//                Pickaxe or better), and dust sifting down from it
//   the hum      a Reinforced Pickaxe or better hums in your ear as the pointer nears the weak spot

type Templates = Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>>;

const PROXY_GEO = new THREE.IcosahedronGeometry(1, 2);
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
const GLINT_GEO = new THREE.OctahedronGeometry(1, 0);
const DUST_GEO = new THREE.SphereGeometry(1, 5, 4);
const DUST_N = 14;

/** A weak spot's fissures: jagged strokes radiating from its middle, in a small patch of the
 *  surface's tangent plane (x, y), lifted a hair off it (z). */
function fissureGeometry(seed: number): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos: number[] = [];
  const quad = (a: THREE.Vector2, b: THREE.Vector2, w: number) => {
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    const n = new THREE.Vector2(-d.y, d.x).multiplyScalar(w);
    const p = [a.x + n.x, a.y + n.y, a.x - n.x, a.y - n.y, b.x - n.x, b.y - n.y, b.x + n.x, b.y + n.y];
    pos.push(p[0], p[1], 0, p[2], p[3], 0, p[4], p[5], 0, p[0], p[1], 0, p[4], p[5], 0, p[6], p[7], 0);
  };
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2 + rnd() * 0.6;
    let at = new THREE.Vector2(0, 0);
    let a = a0;
    const len = 0.05 + rnd() * 0.07;
    for (let j = 0; j < 3; j++) {
      a += (rnd() - 0.5) * 0.9;
      const next = new THREE.Vector2(at.x + Math.cos(a) * len * (1 - j * 0.25), at.y + Math.sin(a) * len * (1 - j * 0.25));
      quad(at, next, 0.007 * (1 - j * 0.3));
      at = next;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function ProspectingView({ templates, onStrike }: { templates: Templates; onStrike: (node: string, dir: [number, number, number]) => void }) {
  const pr = useProspect();
  const node = pr ? ORE_NODE_AT.get(pr.node) : undefined;
  // the camera frames the node while it is open
  useEffect(() => {
    prospectCam.node = node?.id ?? "";
    return () => {
      prospectCam.node = "";
      setCaveHum(0);
    };
  }, [node?.id]);

  // the rock's centre, its proxy's place and size (its template's bounds, 5% more), and a stand-in
  // mesh of the rock itself (its template, where the node is) to find the weak spot's place on it
  const shape = useMemo(() => {
    if (!node) return null;
    const t = templates[node.kind];
    if (!t) return null;
    const geo = t.rock.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5 * 1.05);
    const mid = bb.getCenter(new THREE.Vector3());
    const yaw = NODE_YAW.get(node.id) ?? 0;
    const rock = new THREE.Mesh(geo);
    rock.position.set(node.x, node.y, node.z);
    rock.rotation.y = yaw;
    rock.updateMatrixWorld(true);
    const centre = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
    const proxyAt = mid.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(node.x, node.y, node.z));
    return { rock, centre, proxyAt, size, yaw };
  }, [node, templates]);

  // where the weak spot is on the rock's surface, and the way its surface faces there
  const spot = useMemo(() => {
    if (!pr || !shape || !node) return null;
    const dir = new THREE.Vector3(...pr.weak).normalize();
    const r = ORE_KINDS[node.kind].radius;
    const ray = new THREE.Raycaster(shape.centre.clone().addScaledVector(dir, r * 3), dir.clone().negate(), 0, r * 4);
    const hit = ray.intersectObject(shape.rock, false)[0];
    const at = hit ? hit.point.clone() : shape.centre.clone().addScaledVector(dir, r);
    const normal = hit?.face ? hit.face.normal.clone().transformDirection(shape.rock.matrixWorld) : dir.clone();
    return { at, normal, dir };
    // (pr.rev: the fissure ran on, the spot moved)
  }, [pr?.rev, shape, node]); // eslint-disable-line react-hooks/exhaustive-deps

  const fissure = useMemo(() => fissureGeometry(Math.floor(Math.random() * 1e6) + 1), [pr?.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => fissure.dispose(), [fissure]);
  const glowColor = node ? ORE_KINDS[node.kind].glow : "#ffb347";
  const bright = pr ? PICKAXES[pr.pick].glint : 1;
  const fissureMat = useMemo(() => new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [glowColor]);
  const glintMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fffbe6", toneMapped: false, transparent: true, depthWrite: false }), []);
  const dustMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d9d2c3", transparent: true, depthWrite: false }), []);
  useEffect(
    () => () => {
      fissureMat.dispose();
      glintMat.dispose();
      dustMat.dispose();
    },
    [fissureMat, glintMat, dustMat]
  );

  const fissureRef = useRef<THREE.Mesh>(null);
  const glints = useRef<(THREE.Mesh | null)[]>([]);
  const dust = useMemo(() => {
    const im = new THREE.InstancedMesh(DUST_GEO, dustMat, DUST_N);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [dustMat]);
  useEffect(() => () => {
    dust.dispose();
  }, [dust]);
  const seeds = useMemo(() => Array.from({ length: DUST_N }, () => ({ p: Math.random(), dx: (Math.random() - 0.5) * 0.1, dz: (Math.random() - 0.5) * 0.1, s: 0.006 + Math.random() * 0.008 })), []);
  const glintSeeds = useMemo(() => Array.from({ length: 4 }, () => ({ u: (Math.random() - 0.5) * 0.14, v: (Math.random() - 0.5) * 0.14, p: Math.random() * 6, f: 2 + Math.random() * 3 })), [pr?.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => new THREE.Matrix4(), []);
  const basis = useMemo(() => ({ q: new THREE.Quaternion(), u: new THREE.Vector3(), v: new THREE.Vector3() }), []);

  useFrame(({ clock }) => {
    if (!spot) return;
    const t = clock.elapsedTime;
    // the tangent plane at the spot
    basis.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spot.normal);
    basis.u.set(1, 0, 0).applyQuaternion(basis.q);
    basis.v.set(0, 1, 0).applyQuaternion(basis.q);
    const f = fissureRef.current;
    if (f) {
      f.position.copy(spot.at).addScaledVector(spot.normal, 0.012);
      f.quaternion.copy(basis.q);
      fissureMat.opacity = Math.min(1, (0.35 + 0.25 * Math.sin(t * 2.4)) * bright);
    }
    glints.current.forEach((g, i) => {
      if (!g) return;
      const sd = glintSeeds[i];
      const tw = Math.max(0, Math.sin(t * sd.f + sd.p)) ** 6;
      g.position.copy(spot.at).addScaledVector(basis.u, sd.u).addScaledVector(basis.v, sd.v).addScaledVector(spot.normal, 0.03);
      g.scale.setScalar(0.004 + 0.022 * tw * bright);
      g.rotation.set(t, t * 1.3, 0);
    });
    glintMat.opacity = Math.min(1, 0.9 * bright);
    // dust sifting down from the weak spot, looping
    seeds.forEach((sd, i) => {
      const k = (t * 0.45 + sd.p) % 1;
      m.makeScale(sd.s, sd.s, sd.s).setPosition(spot.at.x + spot.normal.x * 0.05 + sd.dx * (1 + k), spot.at.y - k * 0.7, spot.at.z + spot.normal.z * 0.05 + sd.dz * (1 + k));
      dust.setMatrixAt(i, m);
    });
    dust.instanceMatrix.needsUpdate = true;
    dustMat.opacity = 0.55;
  });

  // a strike: where the pointer met the proxy, as a direction from the rock's centre (a quarter
  // second between taps: a double tap is one strike)
  const lastTap = useRef(0);
  const strike = (e: ThreeEvent<PointerEvent>) => {
    if (!pr || !shape) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const now = performance.now();
    if (now - lastTap.current < STRIKE_DEBOUNCE_S * 1000) return;
    lastTap.current = now;
    const d = e.point.clone().sub(shape.centre).normalize();
    noteBlow();
    onStrike(pr.node, [Math.round(d.x * 1000) / 1000, Math.round(d.y * 1000) / 1000, Math.round(d.z * 1000) / 1000]);
  };
  // the Reinforced Pickaxe (and up) hums as the pointer nears the weak spot
  const hum = (e: ThreeEvent<PointerEvent>) => {
    if (!pr || !shape || !spot || !node || !PICKAXES[pr.pick].hum) return;
    const d = e.point.clone().sub(shape.centre).normalize();
    const dist = d.distanceTo(spot.dir) * ORE_KINDS[node.kind].radius;
    const { near } = strikeRadii(node.kind, pr.pick, false);
    setCaveHum(Math.max(0, 1 - dist / (near * 1.6)));
  };

  if (!pr || !shape || !spot) return null;
  return (
    <group>
      <mesh geometry={PROXY_GEO} material={PROXY_MAT} position={shape.proxyAt} rotation={[0, shape.yaw, 0]} scale={shape.size} onPointerDown={strike} onPointerMove={hum} onPointerOut={() => setCaveHum(0)} />
      <mesh ref={fissureRef} geometry={fissure} material={fissureMat} raycast={noRaycast} renderOrder={2} />
      {glintSeeds.map((_, i) => (
        <mesh key={i} ref={(el) => (glints.current[i] = el)} geometry={GLINT_GEO} material={glintMat} raycast={noRaycast} renderOrder={3} />
      ))}
      <primitive object={dust} />
    </group>
  );
}
