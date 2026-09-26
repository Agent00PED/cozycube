import * as THREE from "three";
import type { PlayerState, ToggleableSyncState } from "@shared/types";
import { canoeBob, canoePitch, canoeRoll } from "./canoeMotion";
import { CAMPFIRE_LAYOUT as L, CHOP_STATIONS, CRITTER_NOTICE, DUCK_PATHS, LIGHT_STRINGS, stringBulbs, FENCE_SWAGS, type Vec3 } from "@shared/worlds/campfire";

// The campfire's living parts, driven every frame from the nodes campfire.glb names for them
// (scripts/blender/build_campfire.py builds each as its own node, its origin where it pivots):
//
//   Fauna_Duck_01/02        paddling slow ovals on the river, bobbing and rocking
//   Fauna_Critter (+ _Head, _Tail)   a raccoon by the camper van: sniffs, scratches, looks about;
//                           someone near with a roasted snack and it begs (a hop, hearts)
//   Fauna_Owl (+ _Head, _Lids)       on a pine branch by the tent: blinks, and turns its head
//                           (within a 60 degree cone) to watch whoever walks nearest
//   Prop_Canoe              bobbing on its rope
//   Prop_WoodChop_0N_*      each chopping station's hatchet (in the stump, until someone takes it
//                           up to chop there) and the log on its block (until it is split)
//   Forage_0N_Yield         the mushrooms and berries, there while they are there to pick
//   StringLight_0N / _Fence the light strings, swinging gently about the line between their ends
//
// and the materials it animates: the river's flow (a scrolling ripple in its shader), the pines'
// sway in the wind (a vertex sway, stronger up the tree), the berries' glow.

/** Shared by the shaders: seconds, for the flow and the wind (and, `real`, when that frame ran). */
export const CAMP_TIME = { value: 0, real: 0 };
/** The scene clock right now, even between frames: an event (a treat, a dive) is stamped with it. */
export function campNow(): number {
  return CAMP_TIME.value + (performance.now() / 1000 - CAMP_TIME.real);
}
/** When each duck last dived (a tap on it), and when the raccoon last got a treat, in CAMP_TIME. */
export const DUCK_DIVE_AT: number[] = [];
export const CRITTER_TREAT = { at: -99 };
/** How long a duck's dive and the raccoon's joyful spin take. */
export const DUCK_DIVE_S = 1.0;
const TREAT_SPIN_S = 1.1;

/** Where each bulb hangs at rest (its glow follows it as its string swings). */
export const STRING_BULBS: { string: number; rest: THREE.Vector3; anchor: THREE.Vector3; axis: THREE.Vector3 }[] = [];
[...LIGHT_STRINGS, ...FENCE_SWAGS.map((s) => ({ ...s, id: "fence" }))].forEach((s, i) => {
  const fence = i >= LIGHT_STRINGS.length;
  const anchor = fence ? new THREE.Vector3(...FENCE_SWAGS[0].a) : new THREE.Vector3(...s.a);
  const axis = fence ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(...s.b).sub(new THREE.Vector3(...s.a)).normalize();
  for (const p of stringBulbs(s.a as Vec3, s.b as Vec3, s.sag)) STRING_BULBS.push({ string: fence ? LIGHT_STRINGS.length : i, rest: new THREE.Vector3(p[0], p[1] - 0.055, p[2]), anchor, axis });
});

/** Each string's swing now (the fence's swags swing as one, the last entry). */
export const STRING_SWING: THREE.Quaternion[] = Array.from({ length: LIGHT_STRINGS.length + 1 }, () => new THREE.Quaternion());

/** Where duck i is paddling at time t, and its heading along its oval. */
export function duckPose(i: number, t: number) {
  const d = DUCK_PATHS[i];
  const a = t * d.speed * Math.PI * 2 * 0.25 + i * 2.1;
  return { x: d.cx + Math.cos(a) * d.rx, z: d.cz + Math.sin(a) * d.rz, heading: Math.atan2(-Math.sin(a) * d.rx, Math.cos(a) * d.rz), bob: Math.sin(t * 2.2 + i * 2.1) };
}

function flowWater(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = CAMP_TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;\nuniform float uTime;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      // the river runs toward the camera: ripples scrolling down it, bent by a slow cross-current
      float w1 = sin(vFlowPos.z * 2.6 - uTime * 0.9 + sin(vFlowPos.x * 3.1 + uTime * 0.4) * 1.2);
      float w2 = sin(vFlowPos.z * 6.3 - uTime * 1.7 + vFlowPos.x * 2.0);
      float streak = smoothstep(0.72, 1.0, w1 * 0.6 + w2 * 0.4);
      diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.08 * w1), vec3(0.72, 0.86, 0.95), streak * 0.25);`
    );
  };
  m.needsUpdate = true;
}

function swayPines(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = CAMP_TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      // the night wind: more sway the higher up the tree, rippling across the wood
      float swayH = max(0.0, transformed.y - 0.45);
      float swayPh = transformed.x * 0.35 + transformed.z * 0.27;
      transformed.x += sin(uTime * 1.2 + swayPh) * 0.022 * swayH;
      transformed.z += sin(uTime * 0.9 + swayPh * 1.3) * 0.016 * swayH;`
    );
  };
  m.needsUpdate = true;
}

const BULB_MATERIALS = new Set(["CF_Bulb", "CF_BerryGlow"]);
const FLICKER_MATERIALS = new Set(["CF_Ember", "CF_FlameOuter", "CF_FlameInner", "CF_LanternGlass", "CF_LanternWarm"]);

export interface CampfireLife {
  flames: { outer?: THREE.Object3D; inner?: THREE.Object3D };
  /** The fire's glowing materials (they flicker with it). */
  flicker: THREE.MeshStandardMaterial[];
  /** The critter's head, for the hearts over it. */
  critterAt: THREE.Vector3;
  update: (t: number, dt: number, players: Record<string, PlayerState>, toggleables: Record<string, ToggleableSyncState>) => { begging: boolean };
}

/** Finds the campfire's living parts in its scene and returns what animates them. */
export function bindCampfireLife(scene: THREE.Object3D, decalOffset: Record<string, number>): CampfireLife {
  const node = (name: string) => scene.getObjectByName(name);
  const flicker = new Set<THREE.MeshStandardMaterial>();
  const berries = new Set<THREE.MeshStandardMaterial>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.raycast = () => {}; // the invisible floor plane takes the clicks
    const m = mesh.material as THREE.MeshStandardMaterial;
    const offset = decalOffset[m.name];
    if (offset !== undefined) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = offset;
      m.polygonOffsetUnits = offset;
    }
    if (m.emissive && m.emissive.getHex() !== 0) {
      // glowing things keep their colour: the tone mapping would bleach a bright orange white
      m.toneMapped = false;
      if (FLICKER_MATERIALS.has(m.name)) flicker.add(m);
      if (m.name === "CF_BerryGlow") berries.add(m);
      if (BULB_MATERIALS.has(m.name)) m.emissiveIntensity = 1;
    }
    if (m.name === "CF_Water" && !m.userData.flowing) {
      m.userData.flowing = true;
      flowWater(m);
    }
    if ((m.name === "CF_Pine" || m.name === "CF_PineLight") && !m.userData.swaying) {
      m.userData.swaying = true;
      swayPines(m);
    }
  });

  const ducks = DUCK_PATHS.map((_, i) => node(`Fauna_Duck_0${i + 1}`));
  const critter = { root: node("Fauna_Critter"), head: node("Fauna_Critter_Head"), tail: node("Fauna_Critter_Tail") };
  const owl = { root: node("Fauna_Owl"), head: node("Fauna_Owl_Head"), lids: node("Fauna_Owl_Lids"), yaw: 0, blinkAt: 2, rest: Math.PI / 4 };
  const canoe = node("Prop_Canoe");
  const canoeY = canoe?.position.y ?? L.river.water;
  // the chopping stations: each one's hatchet (taken up while someone chops there) and its log
  const stations = CHOP_STATIONS.map((s, i) => ({ ...s, hatchet: node(`Prop_WoodChop_0${i + 1}_Hatchet`), log: node(`Prop_WoodChop_0${i + 1}_Log`), hiddenUntil: 0 }));
  const yields = L.forage.map((_, i) => ({ id: `forage_0${i + 1}`, node: node(`Forage_0${i + 1}_Yield`) }));
  const strings = LIGHT_STRINGS.map((s) => ({ node: node(s.id), axis: new THREE.Vector3(...s.b).sub(new THREE.Vector3(...s.a)).normalize() }));
  const fence = node("StringLight_Fence");
  const critterHome = critter.root?.position.clone() ?? new THREE.Vector3(L.critter.x, 0, L.critter.z);
  const critterAt = critterHome.clone().add(new THREE.Vector3(0, 0.62, 0));
  let critterYaw = 0;

  return {
    flames: { outer: node("Fire_Flame_Outer"), inner: node("Fire_Flame_Inner") },
    flicker: [...flicker],
    critterAt,
    update(t, dt, players, toggleables) {
      CAMP_TIME.value = t;
      CAMP_TIME.real = performance.now() / 1000;
      const everyone = Object.values(players);

      // the ducks paddle their ovals, bobbing
      ducks.forEach((duck, i) => {
        if (!duck) return;
        const p = duckPose(i, t);
        // a tap: the duck tips head-first under and bobs back up
        const dk = (t - (DUCK_DIVE_AT[i] ?? -99)) / DUCK_DIVE_S;
        const dive = dk >= 0 && dk < 1 ? Math.sin(Math.PI * dk) : 0;
        duck.position.set(p.x, L.river.water + 0.012 * p.bob - 0.1 * dive, p.z);
        duck.rotation.set(1.3 * dive, p.heading, 0.05 * p.bob);
      });

      // the raccoon: begs at a snack nearby, otherwise potters about
      let begging = false;
      if (critter.root && critter.head && critter.tail) {
        let target: PlayerState | null = null;
        let best = CRITTER_NOTICE;
        for (const p of everyone) {
          if (p.holding !== "skewer" || !p.snack) continue;
          const d = Math.hypot(p.x - critterHome.x, p.z - critterHome.z);
          if (d < best) {
            best = d;
            target = p;
          }
        }
        begging = !!target;
        // a treat: a joyful hop and a full spin
        const tk = (t - CRITTER_TREAT.at) / TREAT_SPIN_S;
        const treating = tk >= 0 && tk < 1;
        const wantYaw = target ? Math.atan2(target.x - critterHome.x, target.z - critterHome.z) : Math.sin(t * 0.13) * 0.6;
        critterYaw += (wantYaw - critterYaw) * Math.min(1, dt * 4);
        critter.root.rotation.set(0, critterYaw, 0);
        const cycle = t % 9;
        if (treating) {
          const e = tk * tk * (3 - 2 * tk);
          critter.root.rotation.y = critterYaw + Math.PI * 2 * e;
          critter.root.position.set(critterHome.x, Math.sin(Math.PI * tk) * 0.14, critterHome.z);
          critter.head.rotation.set(-0.3, 0, 0);
          critter.tail.rotation.set(0, Math.sin(t * 18) * 0.6, 0);
          begging = true; // the hearts
        } else if (begging) {
          critter.root.position.set(critterHome.x, Math.abs(Math.sin(t * 6)) * 0.05, critterHome.z);
          critter.head.rotation.set(-0.35 + Math.sin(t * 6) * 0.05, 0, Math.sin(t * 3) * 0.15);
          critter.tail.rotation.set(0, Math.sin(t * 14) * 0.5, 0);
        } else {
          critter.root.position.copy(critterHome);
          const sniff = cycle < 3.5;
          const scratch = cycle >= 3.5 && cycle < 5.5;
          critter.root.rotation.z = scratch ? 0.14 + Math.sin(t * 16) * 0.03 : 0;
          critter.head.rotation.set(sniff ? 0.18 + Math.sin(t * 15) * 0.05 : scratch ? 0.05 : -0.05, sniff || scratch ? 0 : Math.sin(t * 0.9) * 0.55, scratch ? -0.22 + Math.sin(t * 16) * 0.05 : 0);
          critter.tail.rotation.set(0, Math.sin(t * 2.1) * 0.3, 0);
        }
      }

      // the owl: turns to watch the nearest walker (a 60 degree cone), blinks now and then
      if (owl.root && owl.head && owl.lids) {
        const ox = owl.root.position.x;
        const oz = owl.root.position.z;
        let near: PlayerState | null = null;
        let best = 7;
        for (const p of everyone) {
          const d = Math.hypot(p.x - ox, p.z - oz);
          if (d < best) {
            best = d;
            near = p;
          }
        }
        let want = near ? Math.atan2(near.x - ox, near.z - oz) - owl.rest : Math.sin(t * 0.35) * 0.25;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        const cone = Math.PI / 6;
        want = Math.max(-cone, Math.min(cone, want));
        owl.yaw += (want - owl.yaw) * Math.min(1, dt * 2.5);
        owl.root.rotation.set(0, owl.rest, 0);
        owl.head.rotation.set(0, owl.yaw, Math.sin(t * 0.5) * 0.08);
        if (t > owl.blinkAt + 0.3) owl.blinkAt = t + 2.5 + Math.random() * 3.5;
        const blink = t > owl.blinkAt ? Math.sin(Math.min(1, (t - owl.blinkAt) / 0.28) * Math.PI) : 0;
        owl.lids.scale.set(1, 0.06 + 0.94 * blink, 1);
      }

      // the canoe on its rope, rocking harder while its angler fights a fish
      if (canoe) {
        const struggling = everyone.some((p) => p.sitting && p.action === "reel" && Math.hypot(p.x - (L.canoe.x - 0.45), p.z - L.canoe.z) < 0.2);
        canoe.position.y = canoeY + canoeBob(t);
        canoe.rotation.set(canoeRoll(t, struggling), 0, canoePitch(t, struggling));
      }

      // each station's hatchet leaves its stump while someone chops there (and a moment after), and
      // its log is on the block until it is split (it comes back when the station's `on` does)
      for (const s of stations) {
        if (everyone.some((p) => p.action === "chop" && Math.hypot(p.x - s.x, p.z - s.z) < 2)) s.hiddenUntil = t + 0.9;
        if (s.hatchet) s.hatchet.visible = t > s.hiddenUntil;
        if (s.log) s.log.visible = toggleables[s.propId]?.on ?? true;
      }

      // the pickings, there while there is something to pick
      for (const y of yields) if (y.node) y.node.visible = toggleables[y.id]?.on ?? true;
      for (const m of berries) m.emissiveIntensity = 0.8 + 0.25 * Math.sin(t * 1.7);

      // the light strings swing a little in the wind, about the line between their ends
      strings.forEach((s, i) => {
        STRING_SWING[i].setFromAxisAngle(s.axis, Math.sin(t * 0.9 + i * 1.7) * 0.07);
        s.node?.quaternion.copy(STRING_SWING[i]);
      });
      STRING_SWING[strings.length].setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(t * 0.8) * 0.06);
      fence?.quaternion.copy(STRING_SWING[strings.length]);

      return { begging };
    },
  };
}
