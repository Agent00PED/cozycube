import * as THREE from "three";
import { CAVE_LAKE, CAVE_SKYLIGHT, CAVE_WATER_Y } from "@shared/worlds/caverns";
import { HEARTH } from "@shared/worlds/caverns";
import { BLOOM, CLOUD } from "./caveAtmosphere";
import { CAVE_GRID_GLSL, caveFloorTexture, caveSurfaceTime } from "./caveSurface";

// The Glimmering Caverns' finishes (CavernsWorld.tsx loads the model and hands its materials here):
// the uniforms every cave material shares (the clock, the camp's daylight, the glow round you, the
// hearth's firelight, how strongly the baked light glows), the model's baked light kept as a lightmap
// (bakedLight), the height mist over the low ground and down the edges (heightMist), what glows from
// its own vertex colour (glowFromVertexColour), the lake's bed lit by moving caustics (causticBed) and
// the see-through still water of the lake and the pools (stillWater).

export const TIME = caveSurfaceTime;
/** The camp's daylight (shared/daynight.ts: the same 24-minute day as the campfire and the woods, 0
 *  night .. 1 day), for the collapse's sun, its godrays and the sky through it. */
export const DAY = { value: 1 };
/** The glow round you in the dark zones: where you stand (xyz) and how strong it is (w, 0 .. 1). A
 *  term in the cave's own materials (the floor, the rock, the walls), not a light: no light added to
 *  every material's shading, and the dark basalt still lit up round you without the avatar glaring. */
export const YOU = { value: new THREE.Vector4(0, -99, 0, 0) };
/** The overlook hearth's firelight on the cave round it (xyz its fire, w its flicker): a term in the
 *  cave's own materials like YOU, never a light. */
export const FIRE = { value: new THREE.Vector4(HEARTH.x, HEARTH.y + 0.3, HEARTH.z, 1) };
/** The lanterns set down (shared/caverns_mining.ts LANTERN_MAX of them: xyz where, w how bright,
 *  flickering; w 0 none): a warm glow on the cave round each, a term in the cave's own materials like
 *  FIRE, never a light. */
export const LANTERNS = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -99, 0, 0)) };
export const CAVE_DARK = new THREE.Color("#0e131b");
/** How much of the model's baked light (its vertex colours) glows on its own: the rest of what you
 *  see comes from the game's lights. */
const BAKED = { value: 0.66 };
/** The caverns' exposure under ACES (the doline's sun never bleaches the sand under it). */
export const CAVE_EXPOSURE = 0.88;

/** The model's baked light as a lightmap: its vertex colours glow at BAKED on their own (under the
 *  scene's lights, which add the sun, its shadows and the lamps). Chained after any patch already on
 *  the material. */
export function bakedLight(m: THREE.MeshStandardMaterial) {
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
    shader.uniforms.uLanterns = LANTERNS;
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
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uBaked;\nuniform float uDay;\nuniform vec4 uYou;\nuniform vec4 uFire;\nuniform vec4 uLanterns[8];\nvarying vec3 vBakedPos;").replace(
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
        // (as strong as the ground is dark: the rift's basalt lit up, pale stone and dried mud never
        // washed to white round you)
        float albedo = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
        totalEmissiveRadiance += (diffuseColor.rgb * mix(5.0, 0.8, smoothstep(0.03, 0.3, albedo)) + 0.03) * vec3(1.0, 0.8, 0.55) * you;
        // the overlook hearth's firelight, flickering on the ground and the rock round it
        float fireD = distance(vBakedPos, uFire.xyz);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.55, 0.22) * 2.0 * uFire.w * (1.0 - smoothstep(0.5, 3.8, fireD));
        // the lanterns set down: each a warm pool of light round it
        for (int i = 0; i < 8; i++) {
          vec4 ln = uLanterns[i];
          if (ln.w <= 0.0) continue;
          float lnD = distance(vBakedPos, ln.xyz);
          // (as the glow round you: as strong as the ground is dark)
          totalEmissiveRadiance += (diffuseColor.rgb * mix(4.5, 0.9, smoothstep(0.03, 0.3, albedo)) + 0.02) * vec3(1.0, 0.72, 0.38) * ln.w * pow(1.0 - smoothstep(0.2, 3.0, lnD), 1.6);
        }
      }`
    );
  };
  m.customProgramCacheKey = () => `${prevKey()}|cave-baked-day-fire-lanterns`;
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
export function mistShader(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
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
export function heightMist(m: THREE.MeshStandardMaterial) {
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
export function glowFromVertexColour(m: THREE.MeshStandardMaterial, strength: number) {
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
        float up = smoothstep(8.0, 22.0, vGlowWorld.y);
        vec3 night = mix(vec3(0.04, 0.06, 0.14), vec3(0.09, 0.13, 0.27), up) + star * vec3(0.9, 0.95, 1.0);
        // by day a sky, not a lamp: warm and hazy low over the rim, a soft blue high up, clouds
        // drifting across it, never brighter than the daylight it is (docs/caverns-roadmap.md R2.3)
        vec2 cp = vec2(vGlowWorld.x + vGlowWorld.z, vGlowWorld.y * 1.8) * 0.16 + vec2(uTime * 0.02, 0.0);
        float cloud = 0.5 + 0.25 * sin(cp.x * 1.3 + sin(cp.y * 1.7)) + 0.25 * sin(cp.x * 2.9 - cp.y * 2.1 + 1.7);
        cloud = smoothstep(0.55, 0.9, cloud) * (0.35 + 0.65 * up);
        vec3 day = mix(vec3(0.96, 0.88, 0.72), vec3(0.5, 0.68, 0.86), up);
        day = mix(day, vec3(0.97, 0.97, 0.95), cloud * 0.55) * 0.92;
        vec3 sky = mix(night, day, uDay);
        // (and it ends in the cave's own dark, not at a quad's hard edge: the north side's east end,
        // the west side's south end)
        float edge = vGlowWorld.z < vGlowWorld.x ? smoothstep(-8.0, -12.5, vGlowWorld.x) : smoothstep(-11.5, -15.5, vGlowWorld.z);
        totalEmissiveRadiance = mix(vec3(0.055, 0.075, 0.106), sky, edge);
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
export function causticBed(m: THREE.MeshStandardMaterial) {
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
export function stillWater(m: THREE.MeshStandardMaterial, opacity: number) {
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
        // (where the water falls, its surface steep: white streaks running down it, a little more opaque,
        // docs/caverns-roadmap.md R7.3)
        {
          vec3 wn = normalize(cross(dFdx(vWaterPos), dFdy(vWaterPos)));
          float fallK = smoothstep(0.3, 0.65, 1.0 - abs(wn.y));
          if (fallK > 0.01) {
            float lane = sin(vWaterPos.x * 9.0 + vWaterPos.z * 7.0 + sin(vWaterPos.x * 3.1 + vWaterPos.z * 2.3) * 2.0);
            float run = fract(vWaterPos.y * 1.7 + uTime * 1.5 + lane * 0.3);
            float streak = smoothstep(0.35, 0.95, lane * 0.5 + 0.5) * smoothstep(0.0, 0.2, run) * (1.0 - smoothstep(0.3, 0.85, run));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 0.97), fallK * (0.22 + 0.55 * streak));
            diffuseColor.a = mix(diffuseColor.a, 0.9, fallK * 0.45);
          }
        }
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
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      {
        // the sheen (docs/caverns-roadmap.md R2.10): the cave's cool dark caught on the water where you
        // look across it, brighter where the ripples tilt it toward you, glinting as they move
        // (no glints painted on it: they read as white spots drifting across the water; the ripples'
        // tilt catches the lights instead: docs/caverns-roadmap.md R5.2)
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(0.16, 0.24, 0.3) * fres * 0.55;
      }`
      );
  };
  m.customProgramCacheKey = () => `cave-water6-${opacity}`;
  m.needsUpdate = true;
}
