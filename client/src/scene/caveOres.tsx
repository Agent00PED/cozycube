import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashString, type PlayerState } from "@shared/types";
import { ANVIL, FORGE, ORE_NODES, ORE_NODE_AT, cavernsFloorY, type OreNode } from "@shared/worlds/caverns";
import { ORE_ITEMS, ORE_KINDS, ORE_KIND_IDS, oreCenterY, parseOres, type CaveLoot, type CaveShatter, type CaveStrike, type OreKind, type OreItemId } from "@shared/caverns_mining";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { prospectShake } from "./prospectCamera";
import { NODE_YAW } from "./caveNodes";
import { playCaveSfx, setCaveDrone } from "../audio/cavernAmbience";
import { activity, nowS, remoteBlows } from "../systems/activityStore";
import { BLOW, chiselBeat, forgeBeat } from "../entities/activityAnimations";
import { caveFx, releaseCaveFx } from "./caveFx";
import { prospectStore } from "../systems/prospectStore";
import { playSfx } from "../audio/sfx";
import { mistShader, TIME } from "./caveMaterials";
import { MotePoints } from "./caveLight";

// The Glimmering Caverns' ore nodes as drawn (CavernsWorld.tsx): every node instanced from its kind's
// rock in the model, its damage the room's (`ores`) in the shader (fissures glowing in, the shell
// fracturing, the shatter; a broken node a dark cracked stump with dust motes over it until it grows
// back), each strike's sparks and the loot flying to you, the "ready to mine" star on every standing
// node (ReadySparkles), the effects' pools drawn (CaveFxLayer) and everyone's work at the forge and
// the anvil (WorkFx).

/** How much of an ore rock's own colour glows on its own (the cavern's rock: BAKED): its minerals
 *  read as they are, the white calcite white, the shale's beds against the coal's. */
const ORE_BAKED = 0.55;

/** The rock's damage in its shader: darker as it goes, fissures glowing its kind's colour in. */
function crackedRock(base: THREE.MeshStandardMaterial, glow: string): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.vertexColors = true;
  const color = new THREE.Color(glow);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrackGlow = { value: color };
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCrack;\nvarying float vCrack;\nvarying vec3 vRockPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCrack = aCrack;\nvRockPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uCrackGlow;\nuniform float uTime;\nvarying float vCrack;\nvarying vec3 vRockPos;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          // fissures: the zero lines of two warped waves on the rock's own skin
          vec3 p = vRockPos * 9.0;
          float n = sin(p.x + 1.7 * sin(p.y * 0.8)) * sin(p.z * 1.1 + 1.3 * sin(p.x * 0.7)) + 0.35 * sin(p.y * 2.3 + p.z);
          float width = 0.05 + 0.16 * vCrack;
          float line = 1.0 - smoothstep(0.0, width, abs(n));
          float show = smoothstep(0.06, 0.3, vCrack);
          diffuseColor.rgb *= 1.0 - 0.3 * vCrack;
          // (the ore's own colours lit a little on their own, as the cavern's rock is: bakedLight)
          totalEmissiveRadiance += vColor.rgb * ${ORE_BAKED.toFixed(2)} * (1.0 - 0.35 * vCrack);
          totalEmissiveRadiance += uCrackGlow * line * show * (0.8 + 1.6 * vCrack) * (0.8 + 0.2 * sin(uTime * 6.0));
        }`
      );
    mistShader(shader);
  };
  m.customProgramCacheKey = () => `cave-crack-${glow}`;
  return m;
}

interface NodeLook {
  dmg: number;
  up: boolean;
  /** When it last grew back (it swells in), and until when it trembles (a strike). */
  bornAt: number;
  shakeUntil: number;
}

const DUST_PER_STUMP = 6;
const STUMP_DUST = new THREE.Color("#b8a58c");

type Templates = Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>>;

export function OreNodes({ templates, ores, subscribeMessages, localSessionId, players }: { templates: Templates; ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; localSessionId: string | null; players: Record<string, PlayerState> }) {
  const sync = useMemo(() => parseOres(ores), [ores]);
  const looks = useRef(new Map<string, NodeLook>());
  /** Crew nodes just raised (a Rockfall's heap crashing down): their dust and thunder next frame. */
  const arrivals = useRef<string[]>([]);
  // one instanced rock (and its glow) per kind, the nodes of that kind its instances; the rubble for all
  const sets = useMemo(() => {
    const out: { kind: OreKind; nodes: OreNode[]; rock: THREE.InstancedMesh; glow: THREE.InstancedMesh | null; crack: THREE.InstancedBufferAttribute }[] = [];
    for (const kind of ORE_KIND_IDS) {
      const t = templates[kind];
      const nodes = ORE_NODES.filter((n) => n.kind === kind);
      if (!t || !nodes.length) continue;
      const geo = t.rock.geometry.clone();
      const crack = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1);
      geo.setAttribute("aCrack", crack);
      const rock = new THREE.InstancedMesh(geo, crackedRock(t.rock.material as THREE.MeshStandardMaterial, ORE_KINDS[kind].glow), nodes.length);
      const glow = t.glow ? new THREE.InstancedMesh(t.glow.geometry, t.glow.material as THREE.Material, nodes.length) : null;
      for (const im of [rock, glow]) {
        if (!im) continue;
        im.raycast = noRaycast;
        im.frustumCulled = false;
      }
      out.push({ kind, nodes, rock, glow, crack });
    }
    return out;
  }, [templates]);
  const rubble = useMemo(() => {
    const t = templates.rubble;
    if (!t) return null;
    const im = new THREE.InstancedMesh(t.rock.geometry, t.rock.material as THREE.Material, ORE_NODES.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [templates]);
  useEffect(
    () => () => {
      for (const s of sets) {
        s.rock.geometry.dispose();
        (s.rock.material as THREE.Material).dispose();
        s.rock.dispose();
        s.glow?.dispose();
      }
      rubble?.dispose();
    },
    [sets, rubble]
  );
  // the room's word on each node: its damage, and whether it stands (a node back up swells in)
  useEffect(() => {
    const now = performance.now();
    for (const n of ORE_NODES) {
      const s = sync[n.id];
      const crew = !!ORE_KINDS[n.kind].crew;
      const look = looks.current.get(n.id) ?? { dmg: 0, up: !crew, bornAt: -1e9, shakeUntil: 0 };
      if (s) {
        if (s.up && !look.up) {
          look.bornAt = now;
          if (crew) arrivals.current.push(n.id);
        }
        look.up = s.up;
        look.dmg = s.dmg;
      }
      looks.current.set(n.id, look);
    }
  }, [sync]);

  // the sparks, the chips, the shards, the dust and the loot: the cave's pools (caveFx.ts)
  const { fx, puffs } = useMemo(() => caveFx(), []);
  // the dust lingering over a broken node's stump till it grows back
  const dust = useMemo(() => new MotePoints(ORE_NODES.length * DUST_PER_STUMP), []);
  // the "ready to mine" sparkle: one twinkling star on the face of every node that stands
  const sparkles = useMemo(() => new ReadySparkles(ORE_NODES.length), []);
  useEffect(() => () => sparkles.dispose(), [sparkles]);
  const dustSeeds = useMemo(() => ORE_NODES.flatMap(() => Array.from({ length: DUST_PER_STUMP }, () => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.45, p: Math.random(), s: 0.5 + Math.random() * 0.6 }))), []);
  useEffect(() => () => dust.dispose(), [dust]);
  const live = useRef({ players, localSessionId });
  live.current = { players, localSessionId };
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "caveStrike") {
          const st = payload as CaveStrike;
          const node = ORE_NODE_AT.get(st.node);
          if (!node) return;
          const look = looks.current.get(node.id);
          if (look) look.shakeUntil = performance.now() + (st.verdict === "deflect" ? 120 : 200);
          const r = ORE_KINDS[node.kind].radius;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          const at = c.clone().add(new THREE.Vector3(...st.hit).multiplyScalar(r * 0.95));
          const col = st.verdict === "direct" ? ORE_KINDS[node.kind].glow : st.verdict === "near" ? "#ffb46b" : st.verdict === "deflect" ? "#cfe6ff" : "#9a948c";
          const out = new THREE.Vector3(...st.hit);
          fx.sparks(at, out, col, st.verdict === "direct" ? 12 : st.verdict === "deflect" ? 10 : 6, st.verdict === "bedrock" ? 0.6 : 1);
          // (chips of the rock itself and a puff of its dust, but not off a skid)
          if (st.verdict !== "deflect") {
            fx.chips(at, out, CHIP_COLOR[node.kind], st.verdict === "direct" ? 7 : st.verdict === "near" ? 5 : 3);
            puffs.burst(at, out, "#b9ae9c", st.verdict === "direct" ? 4 : 3, 0.32 * (r / 0.5 + 0.5), 0.9, 0.42);
          } else puffs.burst(at, out, "#cfd6de", 2, 0.18, 0.5, 0.3);
          const mine = st.sessionId === live.current.localSessionId;
          prospectStore.strike(st, mine);
          if (mine) prospectShake(st.perfect ? 0.1 : st.verdict === "direct" ? 0.05 : st.verdict === "deflect" ? 0.08 : 0.025);
          // (a Perfect: a chime over the crack, a brighter burst)
          if (st.perfect) {
            if (mine) playSfx(st.streak && st.streak >= 3 ? "crit" : "chime", 0.7);
            fx.sparks(at, new THREE.Vector3(...st.hit), "#fff4d6", 10, 1.3);
          }
          // (the swing: yours was played as you tapped, and a skid jars it back; everyone else's
          // lands now, with its sparks)
          if (mine) activity.deflect = st.verdict === "deflect";
          else remoteBlows.set(st.sessionId, { at: nowS() - BLOW.down, deflect: st.verdict === "deflect" });
          playCaveSfx(st.verdict === "direct" ? "crack" : st.verdict === "near" ? "clink" : st.verdict === "deflect" ? "clang" : "clatter", mine ? 1 : 0.45);
        } else if (type === "caveShatter") {
          const sh = payload as CaveShatter;
          const node = ORE_NODE_AT.get(sh.node);
          if (!node) return;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          fx.shards(c, ORE_KINDS[node.kind].radius, ORE_KINDS[node.kind].glow, node.kind === "monolith" ? 60 : 26);
          fx.chips(c, new THREE.Vector3(0, 0.4, 0), CHIP_COLOR[node.kind], node.kind === "monolith" ? 24 : 12);
          puffs.burst(c, new THREE.Vector3(0, 0.3, 0), "#b9ae9c", node.kind === "monolith" ? 14 : 8, ORE_KINDS[node.kind].radius * 1.8, 1.6, 0.5);
          const look = looks.current.get(node.id);
          if (look) look.up = false;
          playCaveSfx("shatter", 1);
          if (sh.crew.includes(live.current.localSessionId ?? "")) prospectShake(0.14);
        } else if (type === "caveLoot") {
          const loot = payload as CaveLoot;
          const node = ORE_NODE_AT.get(loot.node);
          if (!node) return;
          const c = new THREE.Vector3(node.x, node.y + oreCenterY(node.kind), node.z);
          let k = 0;
          for (const [id, n] of Object.entries(loot.items) as [OreItemId, number][]) {
            for (let j = 0; j < Math.min(6, n); j++) fx.loot(c, ORE_ITEMS[id].color, (k++ * 70) / 1000);
          }
        }
      }),
    [subscribeMessages, fx]
  );

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ camera }) => {
    const now = performance.now();
    // a Rockfall's heap crashing down: a cloud of dust, rock flying, the thunder of it
    for (const id of arrivals.current.splice(0)) {
      const node = ORE_NODE_AT.get(id);
      if (!node) continue;
      const c = new THREE.Vector3(node.x, node.y + 0.4, node.z);
      puffs.burst(c, new THREE.Vector3(0, 0.5, 0), "#b9ae9c", 18, 2.2, 2.4, 0.6);
      fx.chips(c, new THREE.Vector3(0, 1, 0), CHIP_COLOR[node.kind], 24);
      playCaveSfx("shatter", 1);
      if (Math.hypot(cameraFocus.x - node.x, cameraFocus.z - node.z) < 14) prospectShake(0.12);
    }
    for (const set of sets) {
      set.nodes.forEach((n, i) => {
        const look = looks.current.get(n.id) ?? { dmg: 0, up: !ORE_KINDS[n.kind].crew, bornAt: -1e9, shakeUntil: 0 };
        // swelling in when it grows back; a strike's tremble; the outer shell's shudder past 60%
        const born = Math.min(1, (now - look.bornAt) / 600);
        const grow = look.up ? 0.35 + 0.65 * (1 - (1 - born) ** 3) : 0;
        const shaking = now < look.shakeUntil ? 0.03 : 0;
        const shudder = look.dmg > 0.6 ? 0.008 * Math.sin(now * 0.05 + i) : 0;
        const jx = (Math.random() - 0.5) * shaking + shudder;
        const jz = (Math.random() - 0.5) * shaking - shudder;
        q.setFromAxisAngle(yAxis, NODE_YAW.get(n.id) ?? 0);
        const swell = 1 + (look.dmg > 0.6 ? 0.025 * look.dmg : 0);
        s.set(grow * swell, grow, grow * swell);
        p.set(n.x + jx, n.y, n.z + jz);
        m.compose(p, q, s);
        set.rock.setMatrixAt(i, m);
        set.glow?.setMatrixAt(i, m);
        set.crack.setX(i, look.dmg);
      });
      set.rock.instanceMatrix.needsUpdate = true;
      if (set.glow) set.glow.instanceMatrix.needsUpdate = true;
      set.crack.needsUpdate = true;
    }
    if (rubble) {
      ORE_NODES.forEach((n, i) => {
        const up = looks.current.get(n.id)?.up ?? true;
        const r = ORE_KINDS[n.kind].radius / 0.42;
        q.setFromAxisAngle(yAxis, NODE_YAW.get(n.id) ?? 0);
        // (a crew node leaves no stump: its heap is gone back into the rubble)
        s.setScalar(up || ORE_KINDS[n.kind].crew ? 0 : r * (n.kind === "monolith" ? 1.6 : 1));
        p.set(n.x, n.y, n.z);
        m.compose(p, q, s);
        rubble.setMatrixAt(i, m);
      });
      rubble.instanceMatrix.needsUpdate = true;
    }
    const t = now / 1000;
    ORE_NODES.forEach((n, i) => {
      const up = looks.current.get(n.id)?.up ?? true;
      const span = ORE_KINDS[n.kind].radius / 0.42;
      for (let j = 0; j < DUST_PER_STUMP; j++) {
        const k = i * DUST_PER_STUMP + j;
        if (up || ORE_KINDS[n.kind].crew) {
          dust.hide(k);
          continue;
        }
        const sd = dustSeeds[k];
        const rise = (((sd.p + t * 0.08 * sd.s) % 1) + 1) % 1;
        const a = sd.a + t * 0.4 * sd.s;
        dust.set(k, n.x + Math.cos(a) * sd.r * span, n.y + 0.15 + rise * 0.9 * span, n.z + Math.sin(a) * sd.r * span, 0.5 * Math.sin(rise * Math.PI), STUMP_DUST);
      }
    });
    dust.commit();
    ORE_NODES.forEach((n, i) => {
      const look = looks.current.get(n.id);
      if (look && !look.up) {
        sparkles.hide(i);
        return;
      }
      const yaw = NODE_YAW.get(n.id) ?? 0;
      const r = ORE_KINDS[n.kind].radius;
      const out = n.kind === "monolith" ? 0.55 : 0.75;
      sparkles.set(i, n.x + Math.sin(yaw) * r * out, n.y + oreCenterY(n.kind) + r * 0.5, n.z + Math.cos(yaw) * r * out, SPARKLE_COLOR[n.kind], i * 1.37);
    });
    sparkles.commit(t, (camera as THREE.OrthographicCamera).zoom ?? 1);
  });
  return (
    <>
      {sets.map((set) => (
        <group key={set.kind}>
          <primitive object={set.rock} />
          {set.glow && <primitive object={set.glow} />}
        </group>
      ))}
      {rubble && <primitive object={rubble} />}
      <primitive object={dust.points} />
      <primitive object={sparkles.points} />
      <LodeGlows sync={sync} />
      <MonolithAura sync={sync} />
    </>
  );
}

/** The rock chips' colour off each kind of node (its host rock's, dark against the dust). */
const CHIP_COLOR: Record<OreKind, string> = { coal: "#2a2930", copper: "#6c6f6a", iron: "#403f4a", silver: "#4d5667", glimmer: "#2f3242", monolith: "#302e39", rockfall: "#4a4540", reef: "#b89a7c", pearl: "#cfc6d8" };

/** The cave's pools of little pieces (caveFx.ts), drawn and stepped here, let go with the cave. */
export function CaveFxLayer() {
  const { fx, puffs } = useMemo(() => caveFx(), []);
  useEffect(() => () => releaseCaveFx(), []);
  useFrame(({ camera }, dt) => {
    fx.step(dt, cameraFocus);
    puffs.step(dt, (camera as THREE.OrthographicCamera).zoom ?? 60);
  });
  return (
    <>
      <primitive object={fx.mesh} />
      <primitive object={puffs.points} />
    </>
  );
}

/** Everyone at work: the forge's embers as the bellows pump, sparks off each hammer blow, chips and
 *  dust off each chisel blow at the anvil. Yours on your own beats (activityStore.ts), everyone
 *  else's on the loop their avatar is drawn by (activityAnimations.ts forgeBeat, chiselBeat). */
const FORGE_MOUTH = new THREE.Vector3(FORGE.x, 0, FORGE.z);
const ANVIL_AT = new THREE.Vector3(ANVIL.x, 0, ANVIL.z);
/** How long after a beat its blow lands (the hammer's and the mallet's way down). */
const HAMMER_DOWN_S = 0.07;
const MALLET_DOWN_S = 0.06;
export function WorkFx({ players, localSessionId }: { players: Record<string, PlayerState>; localSessionId: string | null }) {
  const { fx, puffs } = useMemo(() => caveFx(), []);
  const last = useRef(new Map<string, { blow: number; pump: number }>());
  const at = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const now = nowS();
    for (const p of Object.values(players)) {
      if (p.map !== "glimmering_caverns" || (p.action !== "forge" && p.action !== "chisel")) continue;
      const mine = p.sessionId === localSessionId;
      const seed = (hashString(p.userId || p.username) % 1000) / 100;
      const seen = last.current.get(p.sessionId) ?? { blow: now, pump: now };
      last.current.set(p.sessionId, seen);
      // where the blow lands: half a metre out from them toward the forge's mould or the anvil
      const target = p.action === "forge" ? FORGE_MOUTH : ANVIL_AT;
      dir.set(target.x - p.x, 0, target.z - p.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
      dir.normalize();
      at.set(p.x + dir.x * 0.55, cavernsFloorY(p.x, p.z) + 0.52, p.z + dir.z * 0.55);
      if (p.action === "forge") {
        const beat = forgeBeat(now, seed);
        const blow = mine ? activity.hammerAt : (beat.blowAt ?? -Infinity);
        if (blow > seen.blow && now >= blow + HAMMER_DOWN_S) {
          seen.blow = blow;
          if (now - blow < 0.4) {
            fx.sparks(at, up, "#ffb347", 14, 1.15);
            fx.sparks(at, dir, "#fff1c2", 6, 0.9);
          }
        }
        // the bellows: embers up out of the forge's mouth with each pump
        const pumping = mine ? activity.forge === "bellows" && (activity.pumping || now - activity.pumpAt < 0.1) : beat.forge === "bellows";
        if (pumping && now - seen.pump >= 0.5) {
          seen.pump = now;
          const mouth = new THREE.Vector3(FORGE.x, cavernsFloorY(FORGE.x, FORGE.z + 0.6) + 0.55, FORGE.z + 0.35);
          fx.embers(mouth, 3);
          puffs.burst(mouth, up, "#6d625c", 1, 0.35, 1.2, 0.18);
        }
      } else {
        const blow = mine ? activity.chiselAt : chiselBeat(now, seed).blowAt;
        if (blow > seen.blow && now >= blow + MALLET_DOWN_S) {
          seen.blow = blow;
          if (now - blow < 0.4) {
            fx.sparks(at, up, "#ffe2b0", 5, 0.7);
            fx.chips(at, up, "#5b4e66", 5);
            puffs.burst(at, up, "#c7bdb0", 3, 0.2, 0.7, 0.4);
          }
        }
      }
    }
  });
  return null;
}

/** Each kind's sparkle: its glow, a touch whiter. */
const SPARKLE_COLOR = Object.fromEntries(ORE_KIND_IDS.map((k) => [k, new THREE.Color(ORE_KINDS[k].glow).lerp(new THREE.Color("#ffffff"), 0.35)])) as Record<OreKind, THREE.Color>;

/** The "ready to mine" sparkle (docs/caverns-design.md phase 4): a four-point star on a node's face,
 *  its size in metres whatever the zoom, twinkling now and then (each on its own beat); hidden while
 *  the node is broken. One Points draw for every node. */
export class ReadySparkles {
  points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private phase: THREE.BufferAttribute;
  private mat: THREE.ShaderMaterial;
  constructor(n: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3).fill(-100), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    this.phase = new THREE.BufferAttribute(new Float32Array(n), 1);
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aCol", this.col);
    geo.setAttribute("aPhase", this.phase);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: Math.min(2, window.devicePixelRatio || 1) }, uTime: { value: 0 }, uZoom: { value: 1 } },
      vertexShader: `
        attribute vec4 aCol;
        attribute float aPhase;
        uniform float uPx;
        uniform float uTime;
        uniform float uZoom;
        varying vec4 vCol;
        void main() {
          float tw = pow(0.5 + 0.5 * sin(uTime * 1.7 + aPhase), 6.0);
          vCol = vec4(aCol.rgb, aCol.a * (0.4 + 0.6 * tw));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp((0.22 + 0.34 * tw) * uZoom, 6.0, 90.0) * uPx;
        }`,
      fragmentShader: `
        varying vec4 vCol;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float star = max(0.0, 1.0 - abs(p.x) * 7.0) * (1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 7.0) * (1.0 - abs(p.x));
          float core = exp(-dot(p, p) * 14.0);
          float a = clamp(star * 0.9 + core, 0.0, 1.0) * vCol.a;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.raycast = noRaycast;
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  set(i: number, x: number, y: number, z: number, c: THREE.Color, phase: number) {
    this.pos.setXYZ(i, x, y, z);
    this.col.setXYZW(i, c.r, c.g, c.b, 1);
    this.phase.setX(i, phase);
  }
  hide(i: number) {
    this.pos.setXYZ(i, 0, -100, 0);
    this.col.setW(i, 0);
  }
  commit(time: number, zoom: number) {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uZoom.value = zoom;
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.phase.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}


// --- the endgame's signs (docs/caverns-roadmap.md R2.8) -----------------------------------------------

const LODE_GOLD = new THREE.Color("#ffd35a");
const AWAKE_VIOLET = new THREE.Color("#c48cff");
const LODE_MOTES = 26;
const HALO_GEO = new THREE.PlaneGeometry(1, 1);
const HALO_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      // (a billboard: the quad turned to the camera round its own centre)
      vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      c.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
      gl_Position = projectionMatrix * c;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uA;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      gl_FragColor = vec4(uColor, pow(max(0.0, 1.0 - r), 2.2) * uA);
    }`,
});
HALO_MAT.toneMapped = false;
const BEAM_GEO = new THREE.CylinderGeometry(0.34, 0.6, 1, 16, 1, true).translate(0, 0.5, 0);
const BEAM_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 0 }, uT: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uA;
    uniform float uT;
    varying vec2 vUv;
    void main() {
      float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
      float band = 0.75 + 0.25 * sin(vUv.y * 22.0 - uT * 3.0);
      gl_FragColor = vec4(vec3(0.77, 0.55, 1.0), fade * band * uA * 0.32);
    }`,
});
BEAM_MAT.toneMapped = false;

/** A Motherlode's glitter (a gold halo round the node and gold motes swirling up off it) and the
 *  Monolith awake (a violet beam up out of the islet and its motes), for as long as the room says. */
function LodeGlows({ sync }: { sync: Record<string, { ml?: number; aw?: number }> }) {
  const halo = useMemo(() => {
    const m = new THREE.Mesh(HALO_GEO, HALO_MAT.clone());
    m.raycast = noRaycast;
    m.renderOrder = 3;
    m.frustumCulled = false;
    return m;
  }, []);
  const beam = useMemo(() => {
    const m = new THREE.Mesh(BEAM_GEO, BEAM_MAT);
    m.raycast = noRaycast;
    m.renderOrder = 3;
    return m;
  }, []);
  const motes = useMemo(() => new MotePoints(LODE_MOTES * 2), []);
  const lodeId = Object.entries(sync).find(([, o]) => (o.ml ?? 0) > 0)?.[0] ?? "";
  const awakeId = Object.entries(sync).find(([, o]) => (o.aw ?? 0) > 0)?.[0] ?? "";
  const lode = lodeId ? ORE_NODE_AT.get(lodeId) : undefined;
  const awake = awakeId ? ORE_NODE_AT.get(awakeId) : undefined;
  const ease = useRef({ lode: 0, awake: 0 });
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const e = ease.current;
    e.lode += ((lode ? 1 : 0) - e.lode) * Math.min(1, dt * 2);
    e.awake += ((awake ? 1 : 0) - e.awake) * Math.min(1, dt * 1.2);
    const hm = halo.material as THREE.ShaderMaterial;
    halo.visible = e.lode > 0.01 && !!lode;
    if (lode) {
      const cy = lode.y + oreCenterY(lode.kind);
      halo.position.set(lode.x, cy, lode.z);
      const s = 3.4 + 0.35 * Math.sin(t * 2.4);
      halo.scale.set(s, s, 1);
      hm.uniforms.uColor.value.copy(LODE_GOLD);
      hm.uniforms.uA.value = 0.95 * e.lode;
      for (let i = 0; i < LODE_MOTES; i++) {
        const k = (t * 0.35 + i / LODE_MOTES) % 1;
        const a = i * 2.39996 + t * 0.9;
        const r = 0.35 + 0.25 * Math.sin(i * 1.7);
        motes.set(i, lode.x + Math.cos(a) * r, cy - 0.3 + k * 1.8, lode.z + Math.sin(a) * r, (1 - k) * e.lode, LODE_GOLD);
      }
    } else for (let i = 0; i < LODE_MOTES; i++) motes.hide(i);
    beam.visible = e.awake > 0.01 && !!awake;
    if (awake) {
      beam.position.set(awake.x, awake.y + 0.2, awake.z);
      beam.scale.set(1, 12, 1);
      BEAM_MAT.uniforms.uA.value = e.awake * (0.8 + 0.2 * Math.sin(t * 1.6));
      BEAM_MAT.uniforms.uT.value = t;
      for (let i = 0; i < LODE_MOTES; i++) {
        const k = (t * 0.18 + i / LODE_MOTES) % 1;
        const a = i * 2.39996 - t * 0.5;
        motes.set(LODE_MOTES + i, awake.x + Math.cos(a) * 0.55, awake.y + 0.3 + k * 6.5, awake.z + Math.sin(a) * 0.55, (1 - k) * 0.9 * e.awake, AWAKE_VIOLET);
      }
    } else for (let i = 0; i < LODE_MOTES; i++) motes.hide(LODE_MOTES + i);
    motes.commit();
  });
  return (
    <>
      <primitive object={halo} />
      <primitive object={beam} />
      <primitive object={motes.points} />
    </>
  );
}

const SHARDS = 7;
const SHARD_GEO = new THREE.OctahedronGeometry(0.07, 0).scale(0.7, 1.6, 0.7);
const SHARD_MAT = new THREE.MeshBasicMaterial({ color: "#c48cff", transparent: true, opacity: 0.9 });
SHARD_MAT.toneMapped = false;
const COLLAR_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const COLLAR_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 0 }, uT: { value: 0 }, uRing: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uA;
    uniform float uT;
    uniform float uRing;
    varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      // the mist collar: a soft band round the dais, wandering in and out as it drifts round
      float band = smoothstep(0.18, 0.34, r) * (1.0 - smoothstep(0.34 + 0.05 * sin(a * 3.0 + uT * 0.4), 0.62, r));
      band *= 0.7 + 0.3 * sin(a * 5.0 - uT * 0.3);
      // the engraved circle breathing with the shaft (its glyphs are the model's own)
      float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - 0.6))) * uRing;
      vec3 col = mix(vec3(0.55, 0.45, 0.78), vec3(0.8, 0.55, 1.0), ring);
      gl_FragColor = vec4(col, (band * 0.22 + ring * 0.55) * uA);
    }`,
});
COLLAR_MAT.toneMapped = false;

/** The Titan Monolith's presence (docs/caverns-roadmap.md R3.5): shards of violet crystal turning slowly
 *  round its broken crown, a mist collar drifting round its dais, the rune circle engraved in the
 *  islet breathing with it, and a low hum as you come near; all of it stronger while it is awake, the
 *  shards gone while it is broken. */
function MonolithAura({ sync }: { sync: Record<string, { up?: boolean; aw?: number }> }) {
  const mono = ORE_NODE_AT.get("monolith");
  const shards = useMemo(() => {
    const m = new THREE.InstancedMesh(SHARD_GEO, SHARD_MAT, SHARDS);
    m.raycast = noRaycast;
    m.frustumCulled = false;
    return m;
  }, []);
  const collar = useMemo(() => {
    const m = new THREE.Mesh(COLLAR_GEO, COLLAR_MAT);
    m.raycast = noRaycast;
    m.renderOrder = 2;
    return m;
  }, []);
  const up = sync.monolith?.up ?? true;
  const awake = (sync.monolith?.aw ?? 0) > 0;
  const ease = useRef({ up: 1, awake: 0 });
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => setCaveDrone(0), []);
  useFrame(({ clock }, dt) => {
    if (!mono) return;
    const t = clock.elapsedTime;
    const e = ease.current;
    e.up += ((up ? 1 : 0) - e.up) * Math.min(1, dt * 1.5);
    e.awake += ((awake ? 1 : 0) - e.awake) * Math.min(1, dt * 1.2);
    const power = e.up * (0.55 + 0.45 * e.awake);
    const breath = 0.75 + 0.25 * Math.sin(t * (1.1 + 0.9 * e.awake));
    const crown = mono.y + 3.0;
    for (let i = 0; i < SHARDS; i++) {
      const a = (i / SHARDS) * Math.PI * 2 + t * (0.18 + 0.35 * e.awake) * (i % 2 ? 1 : -0.7);
      const r = 0.78 + 0.18 * Math.sin(i * 2.1 + t * 0.4);
      tmp.position.set(mono.x + Math.cos(a) * r, crown + 0.25 * Math.sin(t * 0.7 + i * 1.3) + (i % 3) * 0.12, mono.z + Math.sin(a) * r);
      tmp.rotation.set(0.3 * Math.sin(t + i), t * 0.8 + i, 0.25);
      const s = power > 0.02 ? 0.8 + 0.3 * Math.sin(i * 1.7) : 0.0001;
      tmp.scale.setScalar(s * Math.max(0.0001, e.up));
      tmp.updateMatrix();
      shards.setMatrixAt(i, tmp.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    SHARD_MAT.opacity = 0.35 + 0.55 * power * breath;
    collar.position.set(mono.x, mono.y + 0.04, mono.z);
    collar.scale.set(5, 1, 5);
    COLLAR_MAT.uniforms.uA.value = (0.45 + 0.55 * e.awake) * (0.35 + 0.65 * e.up);
    COLLAR_MAT.uniforms.uRing.value = breath * (0.4 + 0.6 * e.awake) * (0.3 + 0.7 * e.up);
    COLLAR_MAT.uniforms.uT.value = t;
    // (the hum: by how near the one you follow stands, fuller while it is awake)
    const d = Math.hypot(cameraFocus.x - mono.x, cameraFocus.z - mono.z);
    setCaveDrone(Math.max(0, 1 - d / 9) * (0.35 + 0.65 * e.awake) * (0.3 + 0.7 * e.up));
  });
  return (
    <>
      <primitive object={shards} />
      <primitive object={collar} />
    </>
  );
}
