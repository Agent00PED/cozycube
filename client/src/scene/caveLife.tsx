import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashString, type PlayerState } from "@shared/types";
import { CAVE_WATER_Y, CAVERNS_LAYOUT as L, FORGE, TERRACES, cavernsFloorY, cavernsZoneAt, thermalPoolY } from "@shared/worlds/caverns";
import { DRIP_S, type CaveDrip } from "@shared/caverns_fishing";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { playCaveSfx } from "../audio/cavernAmbience";
import { pushToast } from "../components/hud/toastStore";
import { MotePoints } from "./caveLight";

// The Glimmering Caverns' water and life (CavernsWorld.tsx): the waterfall's spray, each zone's name
// in a toast as you come in (ZoneToasts), the terraces' steam and the warm motes round every bather,
// a fish's shadow under each float on the cenote, the forge's smoke and the lucky drip's ripples.

/** The jungle waterfall's spray: pale drops thrown up where it lands in its plunge pool, rising a
 *  little, drifting, fading, and thrown up again. */
const SPRAY = 34;
const SPRAY_COLOR = new THREE.Color("#e8fbff");
export function WaterfallSpray() {
  const motes = useMemo(() => new MotePoints(SPRAY), []);
  const at = useMemo(() => {
    const P = L.river.plunge;
    const x = P.fall[0];
    const z = P.z - P.r * 0.3;
    return { x, z, y: cavernsFloorY(P.x, P.z) - 0.3 };
  }, []);
  const seeds = useMemo(() => Array.from({ length: SPRAY }, () => ({ a: Math.random() * 6.283, r: 0.2 + Math.random() * 0.7, p: Math.random(), s: 0.6 + Math.random() * 0.6 })), []);
  useEffect(() => () => motes.dispose(), [motes]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((d, i) => {
      const k = (t * 0.45 * d.s + d.p) % 1;
      const r = d.r * (0.6 + 0.8 * k);
      motes.set(i, at.x + Math.cos(d.a + k * 0.6) * r, at.y + 0.25 + k * 1.3, at.z + Math.sin(d.a + k * 0.6) * r * 0.8, 0.5 * Math.sin(Math.PI * k), SPRAY_COLOR);
    });
    motes.commit();
  });
  return <primitive object={motes.points} />;
}

/** Each zone's name as you come into it (held a moment, so its edge never flickers it; the same zone
 *  not again for half a minute). */
const ZONE_TOAST: Record<string, { emoji: string; what: string }> = {
  basecamp: { emoji: "⛺", what: "Gus, the forge, the anvil" },
  jungle: { emoji: "🌿", what: "Copper · T1" },
  breakdown: { emoji: "⚫", what: "Coal · T1" },
  overlook: { emoji: "🗿", what: "The Hound's Hand" },
  mudflats: { emoji: "🦇", what: "Iron · T2" },
  rift: { emoji: "💠", what: "Glimmer · T4" },
  terraces: { emoji: "♨️", what: "Silver · T3 · hot springs" },
  lake: { emoji: "🌊", what: "The Titan Monolith · fishing" },
};
export function ZoneToasts() {
  useEffect(() => {
    let current = "";
    let pending = "";
    let since = 0;
    const shown = new Map<string, number>();
    const id = window.setInterval(() => {
      const zone = cavernsZoneAt(cameraFocus.x, cameraFocus.z);
      const zid = zone?.id ?? "";
      const now = Date.now();
      if (zid !== pending) {
        pending = zid;
        since = now;
        return;
      }
      if (!zone || zid === current || now - since < 900) return;
      current = zid;
      if (now - (shown.get(zid) ?? -1e9) < 30000) return;
      shown.set(zid, now);
      const info = ZONE_TOAST[zid];
      pushToast(info ? `${zone.name} · ${info.what}` : zone.name, { emoji: info?.emoji, tone: "arrive", silent: true });
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

const STEAM_PER_POOL = 10;
const STEAM_GEO = new THREE.SphereGeometry(0.22, 8, 6);
const STEAM_MAT = new THREE.MeshBasicMaterial({ color: "#f4f1ff", transparent: true, opacity: 0.1, depthWrite: false });
/** Steam curling up off the Travertine Terraces' three pools. */
export function ThermalSteam() {
  const pools = TERRACES.pools;
  const n = pools.length * STEAM_PER_POOL;
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(STEAM_GEO, STEAM_MAT, n);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [n]);
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  const seeds = useMemo(
    () =>
      pools.flatMap((pool) =>
        Array.from({ length: STEAM_PER_POOL }, () => ({ x: TERRACES.x0 + 0.6 + Math.random() * (TERRACES.x1 - TERRACES.x0 - 1.0), z: pool.z0 + 0.3 + Math.random() * (pool.z1 - pool.z0 - 0.6), y: pool.y, p: Math.random() * 6, s: 0.6 + Math.random() * 0.6 }))
      ),
    [pools]
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((t * 0.18 * sd.s + sd.p) % 1) + 1) % 1;
      const sc = (0.5 + 1.6 * k) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      m.makeScale(sc, sc * 0.8, sc).setPosition(sd.x + Math.sin(t * 0.6 + sd.p) * 0.25 * k + k * 0.6, sd.y + 0.1 + k * 1.9, sd.z + Math.cos(t * 0.5 + sd.p) * 0.25 * k);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const SOAK_MOTES = 12;
const SOAK_MOTE = new THREE.Color("#fff4e6");
/** Warm motes of steam rising round everyone soaking in the terraces' pools. */
export function SoakSteam({ players }: { players: Record<string, PlayerState> }) {
  const motes = useMemo(() => new MotePoints(8 * SOAK_MOTES), []);
  useEffect(() => () => motes.dispose(), [motes]);
  const seeds = useMemo(() => Array.from({ length: 8 * SOAK_MOTES }, () => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.35, p: Math.random(), s: 0.5 + Math.random() * 0.5 })), []);
  const live = useRef(players);
  live.current = players;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const bathers = Object.values(live.current).filter((p) => p.map === "glimmering_caverns" && p.action === "soak").slice(0, 8);
    for (let b = 0; b < 8; b++) {
      const who = bathers[b];
      for (let k = 0; k < SOAK_MOTES; k++) {
        const i = b * SOAK_MOTES + k;
        if (!who) {
          motes.hide(i);
          continue;
        }
        const sd = seeds[i];
        const u = (((t * 0.22 * sd.s + sd.p) % 1) + 1) % 1;
        const y = thermalPoolY(who.x, who.z) + 0.05 + u * 1.3;
        const a = sd.a + u * 1.8;
        motes.set(i, who.x + Math.cos(a) * sd.r * (1 + u), y, who.z + Math.sin(a) * sd.r * (1 + u), 0.5 * Math.sin(Math.PI * u), SOAK_MOTE);
      }
    }
    motes.commit();
  });
  return <primitive object={motes.points} />;
}

// --- the wait at the cenote: a fish's shadow under each float ---------------------------------------------

/** A fish's shadow circling under each float out on the cenote while its angler waits: wide and lazy
 *  at first, closer and quicker as the bite nears (the nibbles), darting in on the bite and gone
 *  once it's hooked; a slow circle under an AFK line. A glowing rim, as the cave's fish have. One
 *  instanced draw for every float. */
const SHADOW_MAX = 8;
const SHADOW_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.7, 0.3).rotateX(-Math.PI / 2);
  g.setAttribute("aFade", new THREE.InstancedBufferAttribute(new Float32Array(SHADOW_MAX), 1));
  return g;
})();
const SHADOW_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uGlow: { value: new THREE.Color("#63f2e2") } },
  vertexShader: `
    attribute float aFade;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      vUv = uv;
      vFade = aFade;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uGlow;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      // the body an ellipse toward the head (+x), the tail a fan behind it
      vec2 b = (vUv - vec2(0.6, 0.5)) / vec2(0.36, 0.4);
      float lb = length(b);
      float body = 1.0 - smoothstep(0.82, 1.0, lb);
      float w = 0.06 + 0.3 * clamp((0.3 - vUv.x) / 0.28, 0.0, 1.0);
      float tail = (1.0 - smoothstep(w - 0.05, w, abs(vUv.y - 0.5))) * step(0.03, vUv.x) * step(vUv.x, 0.32);
      float shape = max(body, tail);
      float rim = body * smoothstep(0.55, 0.92, lb) + tail * 0.5;
      vec3 col = mix(vec3(0.015, 0.05, 0.06), uGlow, 0.45 * rim);
      gl_FragColor = vec4(col, shape * (0.42 + 0.25 * rim) * vFade);
    }`,
});
SHADOW_MAT.toneMapped = false;

export function FloatShadows({ players }: { players: Record<string, PlayerState> }) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(SHADOW_GEO, SHADOW_MAT, SHADOW_MAX);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 2;
    return im;
  }, []);
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  const live = useRef(players);
  live.current = players;
  const fish = useRef(new Map<string, { fade: number; r: number; a: number }>());
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const fade = SHADOW_GEO.getAttribute("aFade") as THREE.InstancedBufferAttribute;
    const seen = new Set<string>();
    let i = 0;
    for (const [id, p] of Object.entries(live.current)) {
      if (i >= SHADOW_MAX) break;
      const waiting = p.map === "glimmering_caverns" && (p.action === "fish" || p.action === "afkfish") && (p.floatX !== 0 || p.floatZ !== 0);
      const st = fish.current.get(id) ?? { fade: 0, r: 1.2, a: hashString(id) % 628 / 100 };
      if (!waiting && st.fade <= 0.01) {
        fish.current.delete(id);
        continue;
      }
      seen.add(id);
      fish.current.set(id, st);
      const afk = p.action === "afkfish";
      const u = afk ? 0.25 : Math.min(1, p.actionProgress);
      const bite = waiting && !afk && p.actionProgress >= 1;
      const dir = hashString(id) % 2 ? 1 : -1;
      // wide and lazy, then nearer and quicker as the bite comes; on the bite, in at the float
      const wantR = bite ? 0.06 : 1.15 - 0.75 * u * u;
      st.r += (wantR - st.r) * Math.min(1, dt * (bite ? 7 : 1.5));
      st.a += dir * dt * (bite ? 0 : 0.55 + 1.5 * u);
      st.fade += ((waiting ? 1 : 0) - st.fade) * Math.min(1, dt * (waiting ? 1.2 : 3));
      // (its circle out on the lake's side of the float, never over the shore: it passes under the
      // float and swings out into the deep)
      const a = st.a;
      const ox = p.floatX - p.x;
      const oz = p.floatZ - p.z;
      const ol = Math.hypot(ox, oz) || 1;
      const cx = p.floatX + (ox / ol) * st.r * 0.85;
      const cz = p.floatZ + (oz / ol) * st.r * 0.85;
      const x = cx + Math.cos(a) * st.r * 0.85;
      const z = cz + Math.sin(a) * st.r * 0.85;
      // heading along the circle (in toward the float on the bite), a swimmer's wiggle
      const dx = bite ? p.floatX - x : -Math.sin(a) * dir;
      const dz = bite ? p.floatZ - z : Math.cos(a) * dir;
      const yaw = Math.atan2(-dz, dx) + 0.14 * Math.sin(t * (6 + 6 * u) + a);
      tmp.q.setFromEuler(tmp.e.set(0, yaw, 0));
      tmp.m.compose(tmp.p.set(x, CAVE_WATER_Y + 0.012, z), tmp.q, tmp.s.setScalar(0.85 + 0.3 * ((hashString(id) % 10) / 10)));
      mesh.setMatrixAt(i, tmp.m);
      fade.setX(i, st.fade);
      i++;
    }
    for (const id of [...fish.current.keys()]) if (!seen.has(id)) fish.current.delete(id);
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const SMOKE_PUFFS = 14;
const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: "#6d625c", transparent: true, opacity: 0.16, depthWrite: false });
/** Faint wisps of smoke rising off the hearth's crucible and drawn back up the combustion chamber. */
export function ForgeSmoke() {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(STEAM_GEO, SMOKE_MAT, SMOKE_PUFFS);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, []);
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  const base = useMemo(() => ({ x: FORGE.x, y: cavernsFloorY(FORGE.x, FORGE.z + FORGE.d / 2 + 0.3) + 0.95, z: FORGE.z + 0.1 }), []);
  const seeds = useMemo(() => Array.from({ length: SMOKE_PUFFS }, () => ({ p: Math.random(), s: 0.7 + Math.random() * 0.6, dx: (Math.random() - 0.5) * 0.5 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((t * 0.12 * sd.s + sd.p) % 1) + 1) % 1;
      const sc = (0.6 + 2.2 * k) * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
      m.makeScale(sc, sc * 1.2, sc).setPosition(base.x + sd.dx * (1 - 0.6 * k) + Math.sin(t * 0.5 + sd.p * 6) * 0.2 * k, base.y + k * 3.2, base.z - 0.9 * Math.min(1, k * 2.5));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const RIPPLE_GEO = new THREE.RingGeometry(0.2, 0.26, 36);
/** The drop's height when it lets go: the cenote's dark vault, high over the float. */
const DRIP_FROM = 7.5;
/** The lucky drip: a drop falls from the vault and a cyan ripple spreads round a float. */
export function DripRipples({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const drip = useRef<{ x: number; z: number; at: number; until: number } | null>(null);
  const rings = useMemo(
    () =>
      [0, 1, 2].map(() => {
        const mat = new THREE.MeshBasicMaterial({ color: "#5ff2ff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(RIPPLE_GEO, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.raycast = noRaycast;
        return mesh;
      }),
    []
  );
  const drop = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: "#bff8ff", toneMapped: false }));
    mesh.raycast = noRaycast;
    return mesh;
  }, []);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "caveDrip") return;
        const d = payload as CaveDrip;
        const now = performance.now();
        drip.current = { x: d.x, z: d.z, at: now, until: now + DRIP_S * 1000 };
        playCaveSfx("drip", 1);
      }),
    [subscribeMessages]
  );
  useEffect(
    () => () => {
      rings.forEach((r) => (r.material as THREE.Material).dispose());
      drop.geometry.dispose();
      (drop.material as THREE.Material).dispose();
    },
    [rings, drop]
  );
  useFrame(() => {
    const d = drip.current;
    const now = performance.now();
    const on = !!d && now < d.until;
    rings.forEach((r, k) => {
      const mat = r.material as THREE.MeshBasicMaterial;
      if (!on || !d) {
        mat.opacity = 0;
        return;
      }
      const age = ((now - d.at) / 1000 - 0.6 - k * 0.55 + 10) % 1.6;
      r.position.set(d.x, CAVE_WATER_Y + 0.02, d.z);
      r.scale.setScalar(1 + age * 3.2);
      mat.opacity = Math.max(0, 0.75 * (1 - age / 1.6)) * Math.min(1, (d.until - now) / 800);
    });
    // the drop: falling from the vault onto the float, then gone
    const fall = d ? (now - d.at) / 600 : 2;
    drop.visible = fall >= 0 && fall < 1;
    if (d && drop.visible) drop.position.set(d.x, DRIP_FROM + (CAVE_WATER_Y - DRIP_FROM) * fall * fall, d.z);
  });
  return (
    <>
      {rings.map((r, k) => (
        <primitive key={k} object={r} />
      ))}
      <primitive object={drop} />
    </>
  );
}
