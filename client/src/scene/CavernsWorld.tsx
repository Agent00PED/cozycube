import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { hashString, type PlayerState } from "@shared/types";
import { ANVIL, CAVE_LAKE, CAVE_LIGHTS, CAVE_SKYLIGHT, CAVE_SUN, CAVE_WATER_Y, CAVERNS_LAYOUT as L, DOLINE_BEAMS, FINNEGAN, FORGE, GUS, ORE_NODES, ORE_NODE_AT, TERRACES, cavernsFloorY, cavernsZoneAt, thermalPoolY, type OreNode } from "@shared/worlds/caverns";
import { ORE_ITEMS, ORE_KINDS, ORE_KIND_IDS, oreCenterY, parseOres, type CaveLoot, type CaveShatter, type CaveStrike, type OreKind, type OreItemId } from "@shared/caverns_mining";
import { DRIP_S, type CaveDrip } from "@shared/caverns_fishing";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { ModelBoundary } from "../entities/ModelBoundary";
import { CampNpc, type NpcGesture, type NpcTalk } from "../entities/CampNpc";
import { modelUrl } from "../assetVersion";
import { GEO, matte, noRaycast } from "./kit";
import { cameraFocus } from "./cameraFocus";
import { daylight } from "@shared/daynight";
import { CAVE_PEARLS, HEARTH, JOURNAL_PAGES } from "@shared/worlds/caverns";
import { parseCaveEvent, type CaveEvent } from "@shared/caverns_codex";
import { OcclusionDriver, ditherOccluder } from "./occlusionDither";
import { prospectShake } from "./prospectCamera";
import { ProspectingView } from "./ProspectingView";
import { NODE_YAW } from "./caveNodes";
import { playCaveSfx } from "../audio/cavernAmbience";
import { CaveFauna } from "./caveFauna";
import { BLOOM, CLOUD, CaveMist, CrystalLights } from "./caveAtmosphere";
import { pushToast } from "../components/hud/toastStore";
import { cageLift } from "./winchRide";
import { CAVE_GRID_GLSL, caveFloorTexture, caveSurface, caveSurfaceTime } from "./caveSurface";
import { activity, nowS, remoteBlows } from "../systems/activityStore";
import { BLOW, chiselBeat, forgeBeat } from "../entities/activityAnimations";
import { caveFx, releaseCaveFx } from "./caveFx";
import { prospectStore } from "../systems/prospectStore";
import { playSfx } from "../audio/sfx";

// The Glimmering Caverns (map "glimmering_caverns"), down the Whispering Woods' old mine adit: 45 x 45,
// after Hang Son Doong (docs/caverns-design.md), eight zones stepping down from the basecamp's shelf to
// the Great Lake. The cavern is one Blender model, caverns.glb (scripts/blender/build_caverns.py, laid
// out from shared/worlds/caverns.ts): this file loads it and brings it to life.
//
//   the floor     the model's own floor, which is its walk collider (`caverns_walk_collider`, drawn):
//                 the very grid cavernsFloorY walks you on (every zone, the trails cut across the
//                 cliffs, the fords, the lake's shore and the causeway), triangle for triangle, so a
//                 click lands at the exact height you see (the only mesh of the model a click is tested
//                 against); while the model loads (or if it fails) the same grid built here in its
//                 place; its own copy of the clay paints every bank too steep to walk bare rock
//                 (caveSurface.ts, from the ground's steepness over a metre)
//   the finishes  the rock and the shell as painted (each zone's ground and tint in their vertex
//                 colours), with detail below the grid on everything natural (caveSurface.ts: mottling,
//                 cracks, strata, rust, moss, rimstone, ripples, grain, glints), the lake's bed lit by
//                 moving caustics (brightest under the islet's
//                 skylight); what glows (crystals, fungi, lanterns, the forge's mouth) a
//                 MeshStandardMaterial whose emission is its own vertex colour, breathing; the lake's
//                 and the pools' water see-through with no depth write (nothing z-fights under it);
//                 the jungle's trees and the Hound's Hand dithered to 30% where they stand between
//                 you and the camera
//   the light     the game's own (CaveLights): ACES tone mapping at a balanced exposure, a deep cool
//                 navy ambient and hemisphere (#161c26 at 0.28), the sun through the jungle's collapse
//                 a soft golden spotlight casting real shadows, a key light from high over the collapse
//                 (every cliff facing the camera in its own shade) and a softer fill from over your
//                 shoulder, the model's baked light kept as a dim lightmap (bakedLight: its colours'
//                 own glow), three moving point lights (the forge's flicker, the pools' warmth, the
//                 lake's heart) and four small ones for the crystals nearest you (caveAtmosphere.tsx);
//                 the jungle's godrays and the islet's skylight shaft (additive, soft-edged, dust
//                 drifting in them); dust in the collapse's light over the basecamp and the
//                 breakdown; a thin pale mist over the lake's water and a height mist on everything
//                 (heightMist: a haze over the low ground, the deep dark below the water line and
//                 down the edges); nothing ever hangs into the view
//   the shore     the sand the water touches damp: darker, and glossy (lower roughness) in the
//                 bed's finish
//   the zones     each one's name in a toast as you come into it (ZoneToasts)
//   the nodes     every ore node from its kind's rock (the model's Ore_<kind>), instanced: its damage
//                 the room's (`ores`): surface fissures glowing in, then the outer shell fracturing
//                 (a tremble), then the shatter (a burst of shards); a broken node leaves a dark
//                 cracked stump with dust motes over it until it grows back; each strike throws sparks
//                 where it landed; the loot flies to you
//   the folk      Gus the mole at his log workstation (gus.glb), Finnegan the Grotto Angler on his
//                 driftwood log on the lake's north shore, his reed creel and lantern by him
//                 (finnegan.glb), and a capybara soaking in the terraces' upper pool, a towel folded
//                 on its head (capybara.glb)
//   the fauna     glowing crabs skittering on the shore, swiftlets circling in the jungle's sunbeams,
//                 bats fluttering over the mudflats (caveFauna.tsx, instanced from the model's Fauna_*
//                 templates)
//   the terraces  steam curling off their pools, and warm motes rising round every bather
//   the drip      a lucky drip's cyan ripple on the lake (the fishing's luck)

export const CAVERNS_URL = modelUrl("caverns.glb");
export const GUS_URL = modelUrl("gus.glb");
export const FINNEGAN_URL = modelUrl("finnegan.glb");
export const CAPYBARA_URL = modelUrl("capybara.glb");

const TIME = caveSurfaceTime;
/** The camp's daylight (shared/daynight.ts: the same 24-minute day as the campfire and the woods, 0
 *  night .. 1 day), for the collapse's sun, its godrays and the sky through it. */
const DAY = { value: 1 };
/** The glow round you in the dark zones: where you stand (xyz) and how strong it is (w, 0 .. 1). A
 *  term in the cave's own materials (the floor, the rock, the walls), not a light: no light added to
 *  every material's shading, and the dark basalt still lit up round you without the avatar glaring. */
const YOU = { value: new THREE.Vector4(0, -99, 0, 0) };
/** The overlook hearth's firelight on the cave round it (xyz its fire, w its flicker): a term in the
 *  cave's own materials like YOU, never a light. */
const FIRE = { value: new THREE.Vector4(HEARTH.x, HEARTH.y + 0.3, HEARTH.z, 1) };
const CAVE_DARK = new THREE.Color("#0e131b");
/** How much of the model's baked light (its vertex colours) glows on its own: the rest of what you
 *  see comes from the game's lights. */
const BAKED = { value: 0.72 };
/** The caverns' exposure under ACES (the doline's sun never bleaches the sand under it). */
const CAVE_EXPOSURE = 0.92;

/** The model's baked light as a lightmap: its vertex colours glow at BAKED on their own (under the
 *  scene's lights, which add the sun, its shadows and the lamps). Chained after any patch already on
 *  the material. */
function bakedLight(m: THREE.MeshStandardMaterial) {
  if (m.userData.caveBaked) return;
  m.userData.caveBaked = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uBaked = BAKED;
    shader.uniforms.uDay = DAY;
    shader.uniforms.uYou = YOU;
    shader.uniforms.uFire = FIRE;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBakedPos;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec4 bw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          bw = instanceMatrix * bw;
        #endif
        vBakedPos = (modelMatrix * bw).xyz;
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uBaked;\nuniform float uDay;\nuniform vec4 uYou;\nuniform vec4 uFire;\nvarying vec3 vBakedPos;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        // the jungle by night: the sun gone from the collapse, its ground under a cool moonlit dusk
        // (the rest of the cave keeps its own lights, day or night)
        float jungle = (1.0 - smoothstep(-11.5, -8.5, vBakedPos.x)) * (1.0 - smoothstep(-14.0, -11.0, vBakedPos.z));
        float night = jungle * (1.0 - uDay);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.58, 0.86), night);
        #ifdef USE_COLOR
          totalEmissiveRadiance += diffuseColor.rgb * uBaked * (1.0 - 0.65 * night);
        #endif
        // the warm glow round you in the dark zones, like a lamp at your shoulder
        float youD = distance(vBakedPos, uYou.xyz);
        float you = uYou.w * (1.0 - smoothstep(0.4, 4.8, youD)) * (1.0 - smoothstep(1.8, 3.2, vBakedPos.y - uYou.y));
        totalEmissiveRadiance += (diffuseColor.rgb * 5.0 + 0.03) * vec3(1.0, 0.8, 0.55) * you;
        // the overlook hearth's firelight, flickering on the ground and the rock round it
        float fireD = distance(vBakedPos, uFire.xyz);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.55, 0.22) * 2.0 * uFire.w * (1.0 - smoothstep(0.5, 3.8, fireD));
      }`
    );
  };
  m.customProgramCacheKey = () => `${prevKey()}|cave-baked-day-fire`;
  m.needsUpdate = true;
}

/** The height mist (docs/caverns-design.md phase 5, after Son Doong's clouds): the lower you go, the
 *  mistier, a cool haze over the low ground and the lake's shore, and below the lake's surface and
 *  down the pedestal's sides a deep mist the colour of the dark round the cavern, so its open edges
 *  fall away into it (never a hard edge against black). In the output's own colours (applied after the
 *  tone mapping, as three's fog is). */
const MIST_LOW = new THREE.Vector3(0x44 / 255, 0x52 / 255, 0x62 / 255);
const MIST_DEEP = new THREE.Vector3(0x0e / 255, 0x13 / 255, 0x1b / 255);
const MIST_CLOUD = new THREE.Vector3(0x9a / 255, 0xaa / 255, 0xba / 255);
const MIST_GLSL = `
      {
        float mistLow = 0.16 * (1.0 - smoothstep(-0.2, 2.2, vMistY));
        float mistDeep = 0.92 * (1.0 - smoothstep(-2.4, -0.25, vMistY));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistLow, mistLow);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistDeep, mistDeep);
        // a Cave Cloud (a living wonder): a pale mist rolling through the whole cavern in slow banks
        float bank = 0.22 + 0.13 * sin(vMistXZ.x * 0.21 + uMistTime * 0.13) * sin(vMistXZ.y * 0.17 - uMistTime * 0.1) + 0.07 * sin((vMistXZ.x - vMistXZ.y) * 0.45 + uMistTime * 0.22);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistCloud, uCloud * bank * (1.0 - 0.35 * smoothstep(4.0, 7.0, vMistY)));
      }`;
function mistShader(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
  shader.uniforms.uMistLow = { value: MIST_LOW };
  shader.uniforms.uMistDeep = { value: MIST_DEEP };
  shader.uniforms.uMistCloud = { value: MIST_CLOUD };
  shader.uniforms.uCloud = CLOUD;
  shader.uniforms.uMistTime = TIME;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vMistY;\nvarying vec2 vMistXZ;").replace(
    "#include <project_vertex>",
    `#include <project_vertex>
    {
      vec4 mistW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mistW = instanceMatrix * mistW;
      #endif
      vec4 mistP = modelMatrix * mistW;
      vMistY = mistP.y;
      vMistXZ = mistP.xz;
    }`
  );
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vMistY;\nvarying vec2 vMistXZ;\nuniform vec3 uMistLow;\nuniform vec3 uMistDeep;\nuniform vec3 uMistCloud;\nuniform float uCloud;\nuniform float uMistTime;").replace("#include <fog_fragment>", `#include <fog_fragment>${MIST_GLSL}`);
}
/** The height mist chained after any patch already on the material. */
function heightMist(m: THREE.MeshStandardMaterial) {
  if (m.userData.caveMist) return;
  m.userData.caveMist = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    mistShader(shader);
  };
  m.customProgramCacheKey = () => `${prevKey()}|cave-mist-cloud`;
  m.needsUpdate = true;
}

/** A glowing finish: its emission is its own vertex colour (times `strength`), breathing a little. */
function glowFromVertexColour(m: THREE.MeshStandardMaterial, strength: number) {
  if (m.userData.caveGlow) return;
  m.userData.caveGlow = true;
  m.vertexColors = true;
  m.emissive = new THREE.Color(1, 1, 1);
  m.emissiveIntensity = strength;
  m.toneMapped = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.uniforms.uDay = DAY;
    shader.uniforms.uBloom = BLOOM;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGlowWorld;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec4 gw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gw = instanceMatrix * gw;
        #endif
        vGlowWorld = (modelMatrix * gw).xyz;
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uDay;\nuniform float uBloom;\nvarying vec3 vGlowWorld;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance *= vColor.rgb * (0.85 + 0.15 * sin(uTime * 1.3 + vColor.g * 9.0));
      #endif
      // a Glimmer Bloom: the rift's crystals and fungi flaring, a slow wave running along it
      if (vGlowWorld.x > 11.0 && vGlowWorld.z < 6.0 && vGlowWorld.z > -13.0) totalEmissiveRadiance *= 1.0 + uBloom * (1.1 + 0.7 * sin(uTime * 2.2 - vGlowWorld.z * 0.6));
      // the sky through the jungle's collapse (behind its broken rim, outside the cave): by night a
      // deep blue, starry
      if (min(vGlowWorld.x, vGlowWorld.z) < -23.0 && vGlowWorld.y > 7.5) {
        vec2 sp = floor(vec2(vGlowWorld.x + vGlowWorld.z, vGlowWorld.y) * 3.0);
        float h = fract(sin(dot(sp, vec2(12.9898, 78.233))) * 43758.5453);
        float star = step(0.975, h) * (0.55 + 0.45 * sin(uTime * (1.5 + 3.0 * h) + h * 60.0));
        vec3 night = mix(vec3(0.04, 0.06, 0.14), vec3(0.09, 0.13, 0.27), smoothstep(8.0, 22.0, vGlowWorld.y)) + star * vec3(0.9, 0.95, 1.0);
        totalEmissiveRadiance = mix(night, totalEmissiveRadiance, uDay);
      }`
    );
  };
  m.customProgramCacheKey = () => `cave-glow-${strength}-sky-bloom`;
  m.needsUpdate = true;
}

/** The caustics' pattern (GLSL): bright thin lines where a warped grid folds, drifting with time. */
const CAUSTIC_GLSL = `
float caveCaustic(vec2 p, float t) {
  vec2 q = p * 1.9;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    q += vec2(sin(q.y * 1.7 + t * 0.9 + k), cos(q.x * 1.5 - t * 0.8 + k * 1.3)) * 0.45;
  }
  float v = sin(q.x) * sin(q.y);
  return 1.0 - smoothstep(0.0, 0.2, abs(v));
}`;

/** The lake's shore (GLSL): shared/worlds/caverns.ts lakeFactor, under 1 the water, 1 the waterline. */
const LAKE_GLSL = `
float caveLakeFactor(vec2 p) {
  vec2 d = (p - vec2(${CAVE_LAKE.x.toFixed(2)}, ${CAVE_LAKE.z.toFixed(2)})) / vec2(${CAVE_LAKE.rx.toFixed(2)}, ${CAVE_LAKE.rz.toFixed(2)});
  float a = atan(d.y, d.x);
  float wob = 1.0 + 0.08 * sin(2.0 * a + 0.4) + 0.06 * sin(3.0 * a + 0.7) + 0.04 * sin(5.0 * a + 2.1) + 0.025 * sin(9.0 * a + 1.3);
  return length(d) / wob;
}`;

/** The rock's finish, and the cenote's bed lit from above through the water: caustics dancing on
 *  whatever lies under the lake's surface (strongest in the shallows and under the skylight). */
function causticBed(m: THREE.MeshStandardMaterial) {
  if (m.userData.caveCaustic) return;
  m.userData.caveCaustic = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBedPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBedPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vBedPos;\nuniform float uTime;\n${CAUSTIC_GLSL}\n${LAKE_GLSL}`).replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      {
        // the damp rim of sand the water touches: darker and glossy
        float lf = caveLakeFactor(vBedPos.xz);
        float wet = smoothstep(0.97, 1.03, lf) * (1.0 - smoothstep(1.12, 1.24, lf)) * (1.0 - smoothstep(0.12, 0.22, vBedPos.y - ${CAVE_WATER_Y.toFixed(3)})) * step(${(CAVE_WATER_Y - 0.04).toFixed(3)}, vBedPos.y);
        roughnessFactor = mix(roughnessFactor, 0.2, wet);
        diffuseColor.rgb *= mix(1.0, 0.8, wet);
      }`
    ).replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec2 lk = (vBedPos.xz - vec2(${CAVE_LAKE.x.toFixed(2)}, ${CAVE_LAKE.z.toFixed(2)})) / vec2(${CAVE_LAKE.rx.toFixed(2)}, ${CAVE_LAKE.rz.toFixed(2)});
        float inLake = 1.0 - smoothstep(0.98, 1.12, length(lk));
        float under = ${CAVE_WATER_Y.toFixed(3)} - vBedPos.y;
        float depth = smoothstep(0.01, 0.12, under) * (1.0 - smoothstep(0.5, 1.4, under));
        float sky = exp(-pow(length(vBedPos.xz - vec2(${CAVE_SKYLIGHT.x.toFixed(2)}, ${CAVE_SKYLIGHT.z.toFixed(2)})) / ${(CAVE_SKYLIGHT.r * 1.6).toFixed(2)}, 2.0));
        float c = caveCaustic(vBedPos.xz, uTime) * 0.7 + caveCaustic(vBedPos.xz * 1.7 + 3.1, uTime * 1.3) * 0.4;
        totalEmissiveRadiance += vec3(0.32, 0.86, 1.0) * c * inLake * depth * (0.12 + 0.45 * sky);
      }`
    );
  };
  m.customProgramCacheKey = () => "cave-caustic-bed";
  m.needsUpdate = true;
}

/** The water: see-through, no depth write (the bed under it never fights it), a slow shimmer and the
 *  sun's glints tracking the caustics below. */
/** The lake's and the pools' water: see-through, its colour its depth's (the model's vertex colours),
 *  lighter and clearer in the shallows with the caustics glinting there only, slow broad ripples that
 *  catch the light (a tilt of the surface's normal, never a pattern painted over it), stiller in the
 *  deep and under the islet's skylight, and a line of foam lapping wherever it meets the shore. */
function stillWater(m: THREE.MeshStandardMaterial, opacity: number) {
  if (m.userData.caveWater) return;
  m.userData.caveWater = true;
  m.transparent = true;
  m.depthWrite = false;
  m.opacity = opacity;
  m.side = THREE.DoubleSide;
  m.roughness = 0.18;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.uniforms.uBed = { value: caveFloorTexture() };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vWaterPos;
      uniform float uTime;
      uniform sampler2D uBed;
      ${CAUSTIC_GLSL}
      ${CAVE_GRID_GLSL}
      float waterDepth() {
        return max(0.0, vWaterPos.y - texture2D(uBed, caveGridUv(vWaterPos.xz)).r);
      }
      // (how much the surface stirs here: less out in the deep, least under the islet's skylight)
      float waterStir(float depth) {
        float sky = exp(-pow(length(vWaterPos.xz - vec2(${CAVE_SKYLIGHT.x.toFixed(2)}, ${CAVE_SKYLIGHT.z.toFixed(2)})) / ${(CAVE_SKYLIGHT.r * 1.4).toFixed(2)}, 2.0));
        return mix(1.0, 0.45, smoothstep(0.4, 1.4, depth)) * (1.0 - 0.7 * sky);
      }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      {
        float depth = waterDepth();
        float shallow = 1.0 - smoothstep(0.04, 0.8, depth);
        float stir = waterStir(depth);
        // broad slow swells, two crossing ways, barely shading the colour
        float sw = sin(dot(vWaterPos.xz, vec2(0.83, 0.42)) * 1.35 + uTime * 0.55) * sin(dot(vWaterPos.xz, vec2(-0.31, 0.95)) * 1.9 - uTime * 0.42);
        diffuseColor.rgb *= 1.0 + 0.05 * sw * stir;
        // the shallows lighter, clearer and a touch greener
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + vec3(0.015, 0.05, 0.04), shallow * 0.55);
        diffuseColor.a *= mix(1.0, 0.75, shallow);
        // the caustics glinting on the surface only where it is shallow
        diffuseColor.rgb += vec3(0.1, 0.17, 0.19) * caveCaustic(vWaterPos.xz * 0.9 + 1.7, uTime * 0.6) * shallow * 0.55;
        // foam where it laps at the shore, coming and going
        float lap = 0.5 + 0.5 * sin(uTime * 1.25 + (vWaterPos.x * 0.8 + vWaterPos.z) * 1.6);
        float foam = 1.0 - smoothstep(0.012, 0.07 + 0.05 * lap, depth);
        foam *= 0.55 + 0.45 * smoothstep(0.2, 0.9, caveCaustic(vWaterPos.xz * 2.4, uTime * 0.8));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.9, 0.88), foam * 0.8);
        diffuseColor.a = mix(diffuseColor.a, 0.95, foam * 0.7);
      }`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
      {
        // the ripples tilt the surface a little, so the lights glint off them
        float stir = waterStir(waterDepth());
        vec2 q = vWaterPos.xz;
        float gx = cos(q.x * 2.1 + uTime * 0.8) * 0.5 + cos((q.x + q.y) * 3.3 - uTime * 1.1) * 0.35;
        float gz = cos(q.y * 1.8 - uTime * 0.7) * 0.5 + cos((q.x - q.y) * 2.9 + uTime * 0.95) * 0.35;
        vec3 wn = normalize(vec3(gx * 0.09 * stir, 1.0, gz * 0.09 * stir));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`
      );
  };
  m.customProgramCacheKey = () => `cave-water3-${opacity}`;
  m.needsUpdate = true;
}

/** The cavern's floor as one invisible heightfield (a cell every 0.5 m, the terrain's grid), from the
 *  room's own floor: the click surface while the model's collider is not there. */
function floorGeometry(): THREE.BufferGeometry {
  const half = L.half;
  const n = Math.round((half * 2) / 0.5);
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, cavernsFloorY(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

interface CavernsWorldProps {
  onFloorClick: (x: number, z: number) => void;
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  /** The room's ore nodes (shared/caverns_mining.ts OreSyncState as JSON). */
  ores: string;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  /** A strike on the node being prospected (its channel's packet; `t`: ms since the close-up opened). */
  onStrike: (node: string, dir: [number, number, number], t: number) => void;
  /** The living wonder under way (shared/caverns_codex.ts CaveEvent as JSON; "" none). */
  caveEvent: string;
}

/** The codex entries found, from a synced camp profile (PlayerState.fishing). */
function codexOf(fishing: string | undefined): string[] {
  try {
    const v = (JSON.parse(fishing || "{}") as { codex?: unknown }).codex;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const GUS_TALK: NpcTalk = {
  height: 1.3,
  clicked: ["Ore, ingots, geodes, gems: Gus buys the lot!", "Mind the Monolith when it wakes. Takes a crew to crack it", "A good pickaxe is half the work, friend", "Smelt your copper before you sell it: every bit counts"],
  greet: {
    inside: (x, z) => Math.hypot(x - GUS.x, z - GUS.z) < 3.4,
    lines: ["Welcome to the basecamp!", "The sun only reaches this far down at the jungle's doline", "Fresh from the rock? Let's see what you've got", "The forge is hot and the anvil's ready"],
  },
};
const FINNEGAN_TALK: NpcTalk = {
  height: 1.25,
  clicked: ["The lake's fish glow, friend. Mind the drip", "A silver spinner for the patient angler", "Fish bones and prismatic scales: that's the currency down here", "The elder olm's been in this lake longer than the cavern"],
  greet: {
    inside: (x, z) => Math.hypot(x - FINNEGAN.x, z - FINNEGAN.z) < 3.6,
    lines: ["Ahoy up there!", "Come, sit a while, the fish are biting", "The lake's still as glass today", "Got anything glowing in that livewell?"],
  },
};

/** The folk's own turns (constants: an object made afresh each render would reset their clocks):
 *  Gus writing up his ledger, Finnegan casting afresh, the capybara nodding off in its bath. */
const GUS_IDLE = { gesture: "write" as const, every: 7 };
const FINNEGAN_IDLE = { gesture: "cast" as const, every: 11 };
const CAPY_IDLE = { gesture: "sleep" as const, every: 16 };

/** The capybara in the upper pool: dozing while it has the terraces to itself, waking to watch the
 *  nearest bather (a little perk as each one settles in), shaking off a splash nearby, perking up
 *  at your deep breath, and a contented word when it's clicked. */
const CAPY_WATCH = 9;
const CAPY_TALK: NpcTalk = { height: 0.55, clicked: ["♨️ …", "*a contented squeak*", "*blinks slowly at you*", "Mmm. Warm.", "*scoots over to make room*"] };
const capyReact = (type: string, payload: { x?: number; z?: number; deep?: boolean }): { gesture: NpcGesture; line?: string } | null => {
  if (type === "splash" && Math.hypot((payload.x ?? 99) - L.capybara.x, (payload.z ?? 99) - L.capybara.z) < 4) return { gesture: "shake", line: "💦 !" };
  if (type === "soakBreath" && payload.deep) return { gesture: "perk" };
  return null;
};
function CapybaraBath({ players, subscribeMessages }: { players: Record<string, PlayerState>; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const live = useRef(players);
  live.current = players;
  const gesture = useRef<((g: NpcGesture) => void) | null>(null);
  const bathers = useRef(new Set<string>());
  const watch = useRef<{ x: number; z: number } | null>(null);
  useFrame(() => {
    const now = new Set<string>();
    let best: { x: number; z: number } | null = null;
    let bestD = CAPY_WATCH;
    for (const [id, p] of Object.entries(live.current)) {
      if (p.map !== "glimmering_caverns" || p.action !== "soak") continue;
      now.add(id);
      const d = Math.hypot(p.x - L.capybara.x, p.z - L.capybara.z);
      if (d < bestD) {
        bestD = d;
        best = { x: p.x, z: p.z };
      }
    }
    for (const id of now) if (!bathers.current.has(id)) gesture.current?.("perk");
    bathers.current = now;
    watch.current = best;
  });
  return <CampNpc url={CAPYBARA_URL} what="capybara.glb" prefix="Capy" at={{ x: L.capybara.x, z: L.capybara.z, yaw: L.capybara.yaw }} y={TERRACES.pools[0].y} waveEvent="capybaraWave" standIn={null} subscribeMessages={subscribeMessages} loop="bathe" idle={CAPY_IDLE} talk={CAPY_TALK} gestureOn={capyReact} gestureRef={gesture} lookAt={capyLook(watch)} mood={capyMood(watch)} />;
}
// (made once per ref: CampNpc reads them every frame)
const capyLook = (watch: { current: { x: number; z: number } | null }) => () => watch.current;
const capyMood = (watch: { current: { x: number; z: number } | null }) => () => (watch.current ? null : ("doze" as const));

export function CavernsWorld({ onFloorClick, players, localSessionId, ores, subscribeMessages, onStrike, caveEvent }: CavernsWorldProps) {
  const ev = useMemo(() => parseCaveEvent(caveEvent), [caveEvent]);
  const fishing = localSessionId ? players[localSessionId]?.fishing : undefined;
  const found = useMemo(() => codexOf(fishing), [fishing]);
  const floorClick = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFloorClick(e.point.x, e.point.z);
  };
  useFrame((_, dt) => {
    TIME.value += dt;
  });
  // the dark round the shell (no sky down here): the scene's own background while you are here
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const before = scene.background;
    scene.background = CAVE_DARK;
    return () => {
      scene.background = before;
    };
  }, [scene]);
  return (
    <group>
      <ModelBoundary what="caverns.glb" fallback={<StandIn onClick={floorClick} />}>
        <Suspense fallback={<StandIn onClick={floorClick} />}>
          <CavernModel ores={ores} subscribeMessages={subscribeMessages} players={players} localSessionId={localSessionId} onStrike={onStrike} onClick={floorClick} found={found} />
        </Suspense>
      </ModelBoundary>
      <CampNpc url={GUS_URL} what="gus.glb" prefix="Gus" at={{ x: GUS.x, z: GUS.z, yaw: GUS.yaw }} y={cavernsFloorY(GUS.x, GUS.z)} waveEvent="gusWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={GUS_TALK} idle={GUS_IDLE} />
      <CampNpc url={FINNEGAN_URL} what="finnegan.glb" prefix="Finnegan" at={{ x: FINNEGAN.x, z: FINNEGAN.z, yaw: FINNEGAN.yaw }} y={cavernsFloorY(FINNEGAN.x, FINNEGAN.z)} waveEvent="finneganWave" standIn={<NpcStandIn />} subscribeMessages={subscribeMessages} talk={FINNEGAN_TALK} idle={FINNEGAN_IDLE} fuseArm={false} />
      <CapybaraBath players={players} subscribeMessages={subscribeMessages} />
      <CaveLights />
      <CrystalLights />
      <Godrays />
      <CaveMist />
      <ThermalSteam />
      <SoakSteam players={players} />
      <FloatShadows players={players} />
      <HearthFire />
      <EventLooks ev={ev} />
      <ForgeSmoke />
      <DustMotes />
      <WaterfallSpray />
      <CaveFxLayer />
      <WorkFx players={players} localSessionId={localSessionId} />
      <ZoneToasts />
      <DripRipples subscribeMessages={subscribeMessages} />
      <OcclusionDriver />
    </group>
  );
}

const STAND_IN_TOP = matte("#3d4556", 0.9);
const STAND_IN_SIDE = matte("#241f26", 0.9);
/** The model not there (loading, or broken): the floor's own heightfield, plainly drawn and clicked. */
function StandIn({ onClick }: { onClick: (e: ThreeEvent<PointerEvent>) => void }) {
  const floor = useMemo(floorGeometry, []);
  useEffect(() => () => floor.dispose(), [floor]);
  return (
    <group>
      <mesh geometry={GEO.box} material={STAND_IN_SIDE} position={[0, -0.6, 0]} scale={[L.half * 2, 1.2, L.half * 2]} raycast={noRaycast} />
      <mesh geometry={floor} material={STAND_IN_TOP} onPointerDown={onClick} />
    </group>
  );
}
const NPC_STAND_IN = matte("#4a4550", 0.85);
function NpcStandIn() {
  return <mesh geometry={GEO.box} material={NPC_STAND_IN} position={[0, 0.55, 0]} scale={[0.6, 1.1, 0.5]} raycast={noRaycast} />;
}

function CavernModel({ ores, subscribeMessages, players, localSessionId, onStrike, onClick, found }: { ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; players: Record<string, PlayerState>; localSessionId: string | null; onStrike: CavernsWorldProps["onStrike"]; onClick: (e: ThreeEvent<PointerEvent>) => void; found: string[] }) {
  const { scene } = useGLTF(CAVERNS_URL);
  // the floor is the walk collider itself (caverns_walk_collider: the walk grid's triangles exactly,
  // drawn): the only mesh of the model a click is tested against
  const walk = useMemo(() => (scene.getObjectByName("caverns_walk_collider") as THREE.Mesh | undefined) ?? null, [scene]);
  const fallbackFloor = useMemo(() => (walk ? null : floorGeometry()), [walk]);
  const fauna = useMemo(() => ({ crab: (scene.getObjectByName("Fauna_Crab") as THREE.Mesh | undefined) ?? null, swift: (scene.getObjectByName("Fauna_Swift") as THREE.Mesh | undefined) ?? null, bat: (scene.getObjectByName("Fauna_Bat") as THREE.Mesh | undefined) ?? null }), [scene]);
  useEffect(() => () => fallbackFloor?.dispose(), [fallbackFloor]);
  // the model's finishes, and the node rocks' templates taken out of it (instanced below)
  const templates = useMemo(() => {
    const t: Partial<Record<OreKind | "rubble", { rock: THREE.Mesh; glow: THREE.Mesh | null }>> = {};
    // (the floor its own copy of the clay: only it takes the banks)
    if (walk && !(walk.material as THREE.Material).userData.caveFloor) {
      const own = (walk.material as THREE.MeshStandardMaterial).clone();
      own.userData = { caveFloor: true };
      walk.material = own;
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.name === "CV_Glow") glowFromVertexColour(m, 1.7);
      else if (m.name === "CV_OreGlow") glowFromVertexColour(m, 1.6);
      else if (m.name === "CV_Water") stillWater(m, 0.66);
      else if (m.name === "CV_ThermalWater") stillWater(m, 0.62);
      else if (m.name === "CV_Clay") {
        causticBed(m);
        caveSurface(m, !!m.userData.caveFloor);
        bakedLight(m);
        heightMist(m);
      } else if (m.name === "CV_Shell") {
        caveSurface(m, false);
        bakedLight(m);
        heightMist(m);
      } else if (m.name === "CV_Occluder") {
        ditherOccluder(m);
        caveSurface(m, false);
        bakedLight(m);
        heightMist(m);
      }
      // (the rock, the walls and the pillars cast the sun's shadows; the floor and they take them)
      if (mesh.name === "Cave_Rock" || mesh.name === "Cave_Shell" || mesh.name === "Cave_Roots") {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      } else if (mesh.name === "caverns_walk_collider") mesh.receiveShadow = true;
    });
    if (walk) walk.raycast = THREE.Mesh.prototype.raycast;
    // (the fauna's templates: drawn instanced, never where they were modelled)
    for (const name of ["Fauna_Crab", "Fauna_Swift", "Fauna_Bat", "Find_Page"]) {
      const o = scene.getObjectByName(name);
      if (o) o.visible = false;
    }
    for (const kind of [...ORE_KIND_IDS, "rubble"] as const) {
      const rock = scene.getObjectByName(kind === "rubble" ? "Ore_Rubble" : `Ore_${kind}`) as THREE.Mesh | undefined;
      if (!rock) continue;
      rock.visible = false;
      const glow = (scene.getObjectByName(`Ore_${kind}_Glow`) as THREE.Mesh | undefined) ?? null;
      t[kind] = { rock, glow };
    }
    return t;
  }, [scene]);
  return (
    <>
      {/* (a click lands on the floor, the model's collider: every other mesh of it is left out) */}
      <primitive object={scene} onPointerDown={onClick} />
      {!walk && <mesh geometry={fallbackFloor!} visible={false} onPointerDown={onClick} />}
      <OreNodes templates={templates} ores={ores} subscribeMessages={subscribeMessages} localSessionId={localSessionId} players={players} />
      <ProspectingView templates={templates} onStrike={onStrike} />
      <CaveFauna crab={fauna.crab} swift={fauna.swift} bat={fauna.bat} />
      <CaveFinds page={(scene.getObjectByName("Find_Page") as THREE.Mesh | undefined) ?? null} found={found} />
      <WinchRig scene={scene} />
    </>
  );
}

/** Gus's winch as someone rides it up (winchRide.ts): the cage lifted, the rope paid in over the
 *  drum as it climbs, the drum turning; the empty cage let back down after. */
const DRUM_R = 0.2;
function WinchRig({ scene }: { scene: THREE.Object3D }) {
  const rig = useMemo(() => {
    const cage = scene.getObjectByName("Prop_WinchCage");
    const rope = scene.getObjectByName("Prop_WinchRope");
    const drum = scene.getObjectByName("Prop_WinchDrum");
    if (!cage || !rope || !drum) return null;
    // (the rope hangs from the boom's end to the ring over the cage's top, 2.35 m over its floor)
    const hang = rope.position.y - (cage.position.y + 2.35);
    return { cage, rope, drum, cageY: cage.position.y, hang: Math.max(0.1, hang) };
  }, [scene]);
  useFrame(() => {
    if (!rig) return;
    const lift = cageLift();
    rig.cage.position.y = rig.cageY + lift;
    rig.rope.scale.y = Math.max(0.02, (rig.hang - lift) / rig.hang);
    rig.drum.rotation.x = -lift / DRUM_R;
  });
  return null;
}

// --- the nodes ------------------------------------------------------------------------------------

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

function OreNodes({ templates, ores, subscribeMessages, localSessionId, players }: { templates: Templates; ores: string; subscribeMessages: (listener: RoomMessageListener) => () => void; localSessionId: string | null; players: Record<string, PlayerState> }) {
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
    </>
  );
}

/** The rock chips' colour off each kind of node (its host rock's, dark against the dust). */
const CHIP_COLOR: Record<OreKind, string> = { coal: "#2a2930", copper: "#6c6f6a", iron: "#403f4a", silver: "#4d5667", glimmer: "#2f3242", monolith: "#302e39", rockfall: "#4a4540" };

/** The cave's pools of little pieces (caveFx.ts), drawn and stepped here, let go with the cave. */
function CaveFxLayer() {
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
function WorkFx({ players, localSessionId }: { players: Record<string, PlayerState>; localSessionId: string | null }) {
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

// --- the light: three moving lights, the godrays, the steam, the drip ----------------------------------

/** The cavern's light: a dim cool fill (the rock's own light is painted in), the sun's warm slant
 *  down the doline, and the three point lights that move: the forge's mouth flickering, the
 *  terraces' warm glow breathing, the cenote's heart pulsing. */
/** The doline's skylight: a soft golden spot high over the jungle's broken roof, falling only on the
 *  jungle under it (its cone and penumbra), casting real shadows there (the layout's `sun`). */
const SKY_FROM = new THREE.Vector3(...CAVE_SUN.from);
const SKY_AT = new THREE.Vector3(...CAVE_SUN.at);

function CaveLights() {
  const gl = useThree((s) => s.gl);
  const forge = useRef<THREE.PointLight>(null);
  const thermal = useRef<THREE.PointLight>(null);
  const cenote = useRef<THREE.PointLight>(null);
  const sun = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  /** The key light: from high over the collapse in the north-west, so every cliff facing the camera
   *  stands in its own shade against the lit ground over it. */
  const key = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(SKY_AT);
    return o;
  }, []);
  const fillAt = useMemo(() => new THREE.Object3D(), []);
  // ACES under a balanced exposure, and the shadow map, while you are down here (put back as you leave)
  useEffect(() => {
    const before = { tone: gl.toneMapping, exposure: gl.toneMappingExposure, shadows: gl.shadowMap.enabled, type: gl.shadowMap.type };
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = CAVE_EXPOSURE;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.toneMapping = before.tone;
      gl.toneMappingExposure = before.exposure;
      gl.shadowMap.enabled = before.shadows;
      gl.shadowMap.type = before.type;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target = target;
    const c = l.shadow.camera;
    c.near = 4;
    c.far = 30;
    c.updateProjectionMatrix();
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0001;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 3;
  }, [target]);
  // the sun's shadow map: only the cave's own rock casts it (nothing that moves), so it is drawn while
  // the model settles in and then only now and then, never every frame
  const shadowAt = useRef({ start: -1, last: -99 });
  useFrame(({ clock, camera }) => {
    // the sun over the collapse on the camp's day: a warm gold by day, a cool silver moon by night
    const d = daylight(Date.now());
    DAY.value = d;
    if (sun.current) {
      const l = sun.current;
      l.color.copy(MOON_COLOR).lerp(SUN_COLOR, d);
      l.intensity = 0.95 + 1.65 * d;
      if (l.shadow.autoUpdate) l.shadow.autoUpdate = false;
      const ct = clock.elapsedTime;
      if (shadowAt.current.start < 0) shadowAt.current.start = ct;
      if (ct - shadowAt.current.start < 4 || ct - shadowAt.current.last > 3) {
        shadowAt.current.last = ct;
        l.shadow.needsUpdate = true;
      }
    }
    // (the soft fill from over your shoulder: the folk and the players are never silhouettes)
    if (fill.current) {
      fill.current.target = fillAt;
      fillAt.position.set(cameraFocus.x, cameraFocus.y + 0.8, cameraFocus.z);
      fill.current.position.copy(camera.position);
    }
    if (key.current) {
      key.current.target = fillAt;
      key.current.position.set(cameraFocus.x - 6, cameraFocus.y + 12, cameraFocus.z - 5);
    }
    // (the canvas's own configuration turns the shadow map off again on any re-render of it: held on
    // here, a frame at a time, before anything is drawn)
    if (!gl.shadowMap.enabled) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.shadowMap.needsUpdate = true;
      if (sun.current) sun.current.shadow.needsUpdate = true;
    }
    const t = clock.elapsedTime;
    if (forge.current) forge.current.intensity = 2.6 + 0.6 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.3 * Math.sin(t * 17);
    if (thermal.current) thermal.current.intensity = 1.5 + 0.2 * Math.sin(t * 0.7);
    if (cenote.current) cenote.current.intensity = 1.9 + 0.45 * Math.sin(t * 0.9);
  });
  return (
    <>
      {/* (a deep cool navy penumbra: the rock's faces away from every light sink into it) */}
      <ambientLight color="#161c26" intensity={0.28} />
      <hemisphereLight args={["#161c26", "#0d0f13", 0.28]} />
      <primitive object={target} />
      <spotLight ref={sun} color="#ffd79c" intensity={2.6} distance={0} decay={0} angle={0.62} penumbra={0.75} position={SKY_FROM.toArray()} castShadow />
      <primitive object={fillAt} />
      <directionalLight ref={fill} color="#dde4f4" intensity={0.5} castShadow={false} />
      <directionalLight ref={key} color="#fff0d8" intensity={0.6} castShadow={false} />
      <pointLight ref={forge} color="#ff8a3a" distance={11} decay={1.4} position={CAVE_LIGHTS.forge as [number, number, number]} castShadow={false} />
      <pointLight ref={thermal} color="#ffc78a" distance={9} decay={1.5} position={CAVE_LIGHTS.thermal as [number, number, number]} castShadow={false} />
      <pointLight ref={cenote} color="#3ff0ff" distance={13} decay={1.3} position={CAVE_LIGHTS.cenote as [number, number, number]} castShadow={false} />
      <YourLight />
    </>
  );
}
const SUN_COLOR = new THREE.Color("#ffd79c");
const MOON_COLOR = new THREE.Color("#a9c2ff");

/** How dark each zone is away from its own lights (0 lit .. 1 dark): the light round you there. */
const ZONE_DARK: Record<string, number> = { basecamp: 0.15, jungle: 0, breakdown: 0.45, mudflats: 0.7, terraces: 0.35, overlook: 0.6, lake: 0.65, rift: 0.9 };
/** The warm glow round you in the dark zones (a lamp's at your shoulder: `YOU` in the cave's
 *  materials), eased in and out as you walk between them; the jungle dark too once the sun is down. */
function YourLight() {
  const level = useRef(0);
  useFrame((_, dt) => {
    const zone = cavernsZoneAt(cameraFocus.x, cameraFocus.z)?.id ?? "lake";
    const dark = zone === "jungle" ? 0.55 * (1 - DAY.value) : (ZONE_DARK[zone] ?? 0.5);
    level.current += (dark - level.current) * Math.min(1, dt * 1.5);
    YOU.value.set(cameraFocus.x, cameraFocus.y, cameraFocus.z, level.current);
  });
  return null;
}

// The godrays: soft shafts of sunlight pouring down through the doline's broken ceiling, and the
// skylight's over the islet; one instanced open cylinder, additive, its edges and its ends fading (no
// depth write: never a hard edge), a faint shimmer running down it. Dust drifts in each.
const RAY_TOP = 13.5;
const RAY_TILT = 0.16;
const RAY_GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1.3, 1, 24, 1, true);
  g.translate(0, 0.5, 0);
  return g;
})();
const RAY_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: TIME, uDay: DAY },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying float vUp;
    varying float vFace;
    varying vec3 vRayPos;
    void main() {
      vec4 p = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        n = mat3(instanceMatrix) * n;
      #endif
      vUp = position.y;
      vRayPos = p.xyz;
      vec3 nv = normalize(normalMatrix * n);
      vFace = abs(nv.z);
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying float vUp;
    varying float vFace;
    varying vec3 vRayPos;
    void main() {
      // (soft all round: a long fade at each end, a gentle falloff to its edges, a slow breath)
      float ends = smoothstep(0.0, 0.14, vUp) * (1.0 - smoothstep(0.42, 1.0, vUp));
      float core = pow(vFace, 1.2) * smoothstep(0.0, 0.35, vFace);
      float shimmer = 0.82 + 0.18 * sin(vRayPos.y * 2.3 - uTime * 1.1 + vRayPos.x * 0.7);
      float breath = 0.85 + 0.15 * sin(uTime * 0.35 + vRayPos.x * 0.5 + vRayPos.z * 0.3);
      float a = ends * core * shimmer * breath * 0.095 * mix(0.55, 1.0, uDay);
      gl_FragColor = vec4(mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.9, 0.68), uDay), a);
    }`,
});
const RAYS = [...DOLINE_BEAMS.map(([x, z, r]) => ({ x, z, r, sky: false })), { x: CAVE_SKYLIGHT.x, z: CAVE_SKYLIGHT.z, r: CAVE_SKYLIGHT.r * 0.72, sky: true }];
// where each shaft lands: a soft warm pool of sunlight on the floor (additive, fading to its rim)
const POOL_GEO = (() => {
  const g = new THREE.CircleGeometry(1, 32);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const POOL_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: TIME, uDay: DAY },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vDisc;
    void main() {
      vDisc = position.xz;
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying vec2 vDisc;
    void main() {
      float r = length(vDisc);
      float a = (1.0 - smoothstep(0.2, 1.0, r)) * (0.065 + 0.012 * sin(uTime * 0.8 + vDisc.x * 3.0)) * mix(0.6, 1.0, uDay);
      gl_FragColor = vec4(mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.88, 0.62), uDay), a);
    }`,
});
const MOTES_PER_RAY = 10;

function Godrays() {
  const rays = useMemo(() => {
    const im = new THREE.InstancedMesh(RAY_GEO, RAY_MAT, RAYS.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-RAY_TILT, 0, 0));
    RAYS.forEach((r, i) => {
      const y = cavernsFloorY(r.x, r.z) - 0.05;
      m.compose(new THREE.Vector3(r.x, y, r.z), q, new THREE.Vector3(r.r, RAY_TOP - y, r.r));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  const pools = useMemo(() => {
    const im = new THREE.InstancedMesh(POOL_GEO, POOL_MAT, RAYS.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 1;
    const m = new THREE.Matrix4();
    RAYS.forEach((r, i) => {
      m.makeScale(r.r * 1.25, 1, r.r * 1.25).setPosition(r.x, cavernsFloorY(r.x, r.z) + 0.04, r.z);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  // the dust in the light: slow motes drifting down each shaft, sparkling as they turn
  const motes = useMemo(() => new MotePoints(RAYS.length * MOTES_PER_RAY), []);
  const seeds = useMemo(() => RAYS.flatMap((r) => Array.from({ length: MOTES_PER_RAY }, () => ({ r, a: Math.random() * Math.PI * 2, d: Math.sqrt(Math.random()) * r.r * 0.8, p: Math.random(), s: 0.4 + Math.random() * 0.5 }))), []);
  useEffect(
    () => () => {
      rays.dispose();
      pools.dispose();
      motes.dispose();
    },
    [rays, pools, motes]
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const k = (((sd.p - t * 0.03 * sd.s) % 1) + 1) % 1;
      const floor = cavernsFloorY(sd.r.x, sd.r.z);
      const y = floor + 0.3 + k * 5.5;
      const a = sd.a + t * 0.15 * sd.s;
      // (the shaft leans with its tilt, its top toward the doline's broken north: the higher, the further)
      const lean = (y - floor) * Math.tan(RAY_TILT);
      motes.set(i, sd.r.x + Math.cos(a) * sd.d, y, sd.r.z - lean + Math.sin(a) * sd.d, 0.55 + 0.45 * Math.sin(t * 2 + i), MOTE_SUN);
    });
    motes.commit();
  });
  return (
    <>
      <primitive object={pools} />
      <primitive object={rays} />
      <primitive object={motes.points} />
    </>
  );
}

const MOTE_SUN = new THREE.Color("#ffe7b0");
/** Little soft round motes (one draw for many): each its place, its brightness and its colour. */
class MotePoints {
  points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  constructor(n: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3).fill(-100), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aCol", this.col);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `
        attribute vec4 aCol;
        uniform float uPx;
        varying vec4 vCol;
        void main() {
          vCol = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 4.5 * uPx;
        }`,
      fragmentShader: `
        varying vec4 vCol;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.2, 1.0, r)) * vCol.a;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.raycast = noRaycast;
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  set(i: number, x: number, y: number, z: number, alpha: number, c: THREE.Color) {
    this.pos.setXYZ(i, x, y, z);
    this.col.setXYZW(i, c.r, c.g, c.b, alpha);
  }
  hide(i: number) {
    this.pos.setXYZ(i, 0, -100, 0);
    this.col.setW(i, 0);
  }
  commit() {
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Each kind's sparkle: its glow, a touch whiter. */
const SPARKLE_COLOR = Object.fromEntries(ORE_KIND_IDS.map((k) => [k, new THREE.Color(ORE_KINDS[k].glow).lerp(new THREE.Color("#ffffff"), 0.35)])) as Record<OreKind, THREE.Color>;

/** The "ready to mine" sparkle (docs/caverns-design.md phase 4): a four-point star on a node's face,
 *  its size in metres whatever the zoom, twinkling now and then (each on its own beat); hidden while
 *  the node is broken. One Points draw for every node. */
class ReadySparkles {
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

/** Dust drifting in the light over the breakdown and the basecamp (the collapse's), slow and pale. */
const DUST_MOTES = 70;
const DUST_COLOR = new THREE.Color("#fff1d6");
function DustMotes() {
  const motes = useMemo(() => new MotePoints(DUST_MOTES), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: DUST_MOTES }, (_, i) => {
        const east = i % 2 === 0;
        const x = east ? 9.5 + Math.random() * 11.5 : -6.5 + Math.random() * 14;
        const z = -21 + Math.random() * 8;
        return { x, z, y: cavernsFloorY(x, z) + 0.6 + Math.random() * 3.4, a: Math.random() * 6.283, s: 0.3 + Math.random() * 0.5, p: Math.random() * 10 };
      }),
    []
  );
  useEffect(() => () => motes.dispose(), [motes]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((d, i) => {
      const a = d.a + t * 0.05 * d.s;
      const bob = Math.sin(t * 0.3 * d.s + d.p);
      motes.set(i, d.x + Math.cos(a) * 0.8, d.y + bob * 0.35, d.z + Math.sin(a) * 0.8, 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.7 + d.p)), DUST_COLOR);
    });
    motes.commit();
  });
  return <primitive object={motes.points} />;
}

/** The jungle waterfall's spray: pale drops thrown up where it lands in its plunge pool, rising a
 *  little, drifting, fading, and thrown up again. */
const SPRAY = 34;
const SPRAY_COLOR = new THREE.Color("#e8fbff");
function WaterfallSpray() {
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
function ZoneToasts() {
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
function ThermalSteam() {
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
function SoakSteam({ players }: { players: Record<string, PlayerState> }) {
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

// --- the overlook's hearth, the living wonders' looks, the codex's finds -----------------------------

/** The flames of the overlook's campfire: a few tongues of fire (camera-facing, additive, each its own
 *  flicker) over the builder's charred logs, embers rising, and its light on the cave round it (FIRE,
 *  in the cave's own materials). The crackle is the ambience's (audio/cavernAmbience.ts). */
const FLAMES = 6;
const FLAME_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  g.translate(0, 0.5, 0);
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: FLAMES }, (_, i) => i * 1.37)), 1));
  return g;
})();
const FLAME_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: TIME },
  vertexShader: `
    attribute float aSeed;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      vUv = uv;
      vSeed = aSeed;
      // (turned to the camera: the instance's centre in view space, the quad spread in its plane)
      vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sx = length(instanceMatrix[0].xyz);
      float sy = length(instanceMatrix[1].xyz);
      c.xy += vec2(position.x * sx, position.y * sy);
      gl_Position = projectionMatrix * c;
    }`,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      float y = vUv.y;
      float wob = 0.1 * sin(y * 7.0 - uTime * 8.0 + vSeed * 3.0) * y;
      float w = 0.5 * (1.0 - y) * (0.8 + 0.2 * sin(uTime * 11.0 + vSeed * 5.0)) + 0.04;
      float x = abs(vUv.x - 0.5 - wob) / w;
      float body = (1.0 - smoothstep(0.45, 1.0, x)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55, 1.0, y));
      vec3 col = mix(vec3(1.0, 0.93, 0.55), vec3(1.0, 0.36, 0.08), smoothstep(0.05, 0.75, y + x * 0.35));
      gl_FragColor = vec4(col, body * 0.9);
    }`,
});
const EMBERS = 22;
const EMBER_COLOR = new THREE.Color("#ffb45a");
function HearthFire() {
  const flames = useMemo(() => {
    const im = new THREE.InstancedMesh(FLAME_GEO, FLAME_MAT, FLAMES);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    im.renderOrder = 3;
    return im;
  }, []);
  const embers = useMemo(() => new MotePoints(EMBERS), []);
  useEffect(
    () => () => {
      flames.dispose();
      embers.dispose();
    },
    [flames, embers]
  );
  const seeds = useMemo(() => Array.from({ length: EMBERS }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.25, p: Math.random(), s: 0.6 + Math.random() * 0.8, w: (Math.random() - 0.5) * 0.6 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const y = HEARTH.y + 0.06;
    for (let i = 0; i < FLAMES; i++) {
      const a = (i / FLAMES) * Math.PI * 2 + 0.3;
      const r = i === 0 ? 0 : 0.13 + 0.05 * Math.sin(i * 2.1);
      const h = (i === 0 ? 1.25 : 0.75 + 0.25 * ((i * 0.37) % 1)) * (0.82 + 0.18 * Math.sin(t * (6 + i) + i * 1.7) * Math.sin(t * 3.3 + i));
      const w = i === 0 ? 0.55 : 0.36;
      m.makeScale(w, h, w).setPosition(HEARTH.x + Math.cos(a) * r, y, HEARTH.z + Math.sin(a) * r);
      flames.setMatrixAt(i, m);
    }
    flames.instanceMatrix.needsUpdate = true;
    // the light on the cave round it: a flicker
    FIRE.value.w = 0.85 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.05 * Math.sin(t * 17);
    for (let i = 0; i < EMBERS; i++) {
      const sd = seeds[i];
      const u = (((t * 0.35 * sd.s + sd.p) % 1) + 1) % 1;
      embers.set(i, HEARTH.x + Math.cos(sd.a) * sd.r + sd.w * u + 0.08 * Math.sin(t * 2 + i), y + 0.25 + u * 2.2, HEARTH.z + Math.sin(sd.a) * sd.r + 0.08 * Math.cos(t * 1.7 + i), 0.9 * Math.sin(Math.PI * u) * (1 - u * 0.5), EMBER_COLOR);
    }
    embers.commit();
  });
  return (
    <>
      <primitive object={flames} />
      <primitive object={embers.points} />
    </>
  );
}

/** The living wonder's looks, eased in and out (caveAtmosphere.tsx CLOUD, BLOOM): the Cloud's mist in
 *  the height mist and over the lake, the Bloom's crystals flaring. */
function EventLooks({ ev }: { ev: CaveEvent | null }) {
  useFrame((_, dt) => {
    const now = Date.now();
    const on = (k: CaveEvent["kind"]) => (ev && ev.kind === k && now < ev.until ? 1 : 0);
    CLOUD.value += (on("cloud") - CLOUD.value) * Math.min(1, dt * 0.4);
    BLOOM.value += (on("bloom") - BLOOM.value) * Math.min(1, dt * 0.8);
  });
  useEffect(
    () => () => {
      CLOUD.value = 0;
      BLOOM.value = 0;
    },
    []
  );
  return null;
}

/** The codex's finds, where they lie until you have them (your codex: `found`): Old Flint's journal
 *  pages (the builder's `Find_Page`, one instanced draw) and a twinkle over each page and each cave
 *  pearl's basin still to find. */
const FIND_TWINKLE = new THREE.Color("#fff1c8");
function CaveFinds({ page, found }: { page: THREE.Mesh | null; found: string[] }) {
  const pages = useMemo(() => {
    if (!page) return null;
    const im = new THREE.InstancedMesh(page.geometry, page.material as THREE.Material, JOURNAL_PAGES.length);
    im.raycast = noRaycast;
    im.frustumCulled = false;
    return im;
  }, [page]);
  const twinkles = useMemo(() => new ReadySparkles(JOURNAL_PAGES.length + CAVE_PEARLS.length), []);
  useEffect(
    () => () => {
      pages?.dispose();
      twinkles.dispose();
    },
    [pages, twinkles]
  );
  const have = useMemo(() => new Set(found), [found]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ clock, camera }) => {
    JOURNAL_PAGES.forEach((pg, i) => {
      const got = have.has(pg.id);
      const y = cavernsFloorY(pg.x, pg.z);
      if (pages) {
        q.setFromAxisAngle(up, i * 1.9 + 0.4);
        m.compose(v.set(pg.x, y, pg.z), q, sc.setScalar(got ? 0 : 1.6));
        pages.setMatrixAt(i, m);
      }
      if (got) twinkles.hide(i);
      else twinkles.set(i, pg.x, y + 0.35, pg.z, FIND_TWINKLE, i * 2.1);
    });
    if (pages) pages.instanceMatrix.needsUpdate = true;
    CAVE_PEARLS.forEach((pl, k) => {
      const i = JOURNAL_PAGES.length + k;
      if (have.has(pl.id)) twinkles.hide(i);
      else twinkles.set(i, pl.x, cavernsFloorY(pl.x, pl.z) + 0.3, pl.z, FIND_TWINKLE, i * 1.3);
    });
    twinkles.commit(clock.elapsedTime, (camera as THREE.OrthographicCamera).zoom ?? 1);
  });
  return (
    <>
      {pages && <primitive object={pages} />}
      <primitive object={twinkles.points} />
    </>
  );
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

function FloatShadows({ players }: { players: Record<string, PlayerState> }) {
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
function ForgeSmoke() {
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
function DripRipples({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
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

useGLTF.preload(GUS_URL);
useGLTF.preload(FINNEGAN_URL);
useGLTF.preload(CAPYBARA_URL);
