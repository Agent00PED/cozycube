import * as THREE from "three";

/** The sea's shader, for Sunset Beach's one sheet of water (scripts/blender/build_beach.py
 *  `build_sea`). The mesh carries, in its vertex colours, how far out from the waterline each point is
 *  (red: 0 at 0.8 m up the sand to 1 at 11 m out and beyond). From it: pale turquoise shallows
 *  deepening to blue, lines of foam rolling in to the shore and lapping up the sand, a slow glitter
 *  on the open water. The sheet itself rises and falls a hand's height, so the waterline runs up
 *  the sand and back. `time` is the world's clock (seconds), `night` 0 by day to 1 by night, `dusk`
 *  1 at sunrise and sunset (the low sun's gold on the water). `calm`: still water (the Hidden Cove's
 *  lagoon): no waves rolling in, only the lapping edge. */
export function seaWater(m: THREE.MeshStandardMaterial, time: { value: number }, night: { value: number }, dusk: { value: number }, calm = false) {
  m.color.set("#ffffff");
  m.roughness = 0.2;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.uniforms.uDusk = dusk;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSeaPos;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // the swell: the whole sheet breathes, a little more out at sea
        transformed.y += 0.035 * sin(uTime * 0.7 + position.x * 0.21 + position.z * 0.17) + 0.02 * sin(uTime * 1.1 - position.x * 0.13 + position.z * 0.29);
        vSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSeaPos;\nuniform float uTime;\nuniform float uNight;\nuniform float uDusk;").replace(
      "#include <color_fragment>",
      `// (the vertex colours are data, not paint: metres out from the waterline)
      float sea = vColor.r * 12.0 - 0.8;
      vec3 shallow = mix(vec3(0.50, 0.86, 0.80), vec3(0.10, 0.26, 0.34), uNight);
      vec3 mid = mix(vec3(0.16, 0.64, 0.74), vec3(0.05, 0.16, 0.28), uNight);
      vec3 deep = mix(vec3(0.07, 0.36, 0.60), vec3(0.03, 0.08, 0.19), uNight);
      vec3 water = mix(shallow, mid, smoothstep(0.2, 3.2, sea));
      water = mix(water, deep, smoothstep(2.8, 10.0, sea));
      // the low sun, at dawn and dusk: its own water, gold and rose in the shallows, going to violet
      // out deep (a tint over the half-night water was mud)
      vec3 duskWater = mix(vec3(1.0, 0.74, 0.50), vec3(0.78, 0.52, 0.52), smoothstep(0.2, 3.2, sea));
      duskWater = mix(duskWater, vec3(0.34, 0.30, 0.52), smoothstep(2.6, 9.0, sea));
      water = mix(water, duskWater, uDusk * 0.88);
      // the swell: long soft bands running in toward the shore, a finer chop across them, and the
      // sun's glints where the two crests meet (lines of light, never spots)
      float sw1 = sin((vSeaPos.x + vSeaPos.z) * 0.42 + uTime * 0.5 + 1.3 * sin((vSeaPos.x - vSeaPos.z) * 0.16 + uTime * 0.11));
      float sw2 = sin((vSeaPos.x + vSeaPos.z) * 1.05 + (vSeaPos.x - vSeaPos.z) * 0.38 + uTime * 0.85 + 0.9 * sin((vSeaPos.x - vSeaPos.z) * 0.45 - uTime * 0.2));
      water *= 0.955 + 0.04 * sw1 + 0.022 * sw2;
      // (the crests catch the light in broad soft bands; by the low sun they go gold)
      float glint = smoothstep(0.45, 1.0, sw1) * (0.55 + 0.45 * sw2);
      vec3 glintColor = mix(vec3(0.72, 0.92, 0.98), vec3(1.0, 0.72, 0.42), uDusk);
      water = mix(water, glintColor, glint * (0.09 + 0.12 * uDusk) * (1.0 - 0.7 * uNight * (1.0 - uDusk)) * smoothstep(0.5, 3.0, sea));
      // waves rolling in: lines of foam that follow the coast, breaking as they reach the shallows
      float wob = sin(vSeaPos.x * 0.9 - vSeaPos.z * 0.7 + uTime * 0.2) * 0.9;
      float roll = sin(sea * 1.25 + uTime * 0.85 + wob);
      float crest = smoothstep(0.86, 1.0, roll) * (1.0 - smoothstep(1.2, 6.5, sea)) * smoothstep(-0.2, 0.6, sea) * ${calm ? "0.0" : "1.0"};
      // the lapping edge: foam at the waterline, in and out
      float lap = 0.5 + 0.5 * sin(uTime * 0.85 + vSeaPos.x * 0.8 - vSeaPos.z * 0.6);
      float ragged = 0.5 + 0.5 * sin(vSeaPos.x * 5.3 + vSeaPos.z * 4.1 + uTime * 0.5);
      float edge = 1.0 - smoothstep(0.08 + 0.2 * lap, 0.3 + 0.32 * lap + 0.12 * ragged, sea);
      // (still water, the creek's and the tide pools' (green in the mesh): no surf, a brackish green-brown)
      float still = vColor.g;
      water = mix(water, mix(vec3(0.34, 0.46, 0.36), vec3(0.06, 0.14, 0.15), uNight) * (0.94 + 0.06 * sw2), still * 0.78);
      float foam = clamp(max(edge, crest * (0.6 + 0.4 * ragged)), 0.0, 1.0) * (1.0 - still);
      water = mix(water, mix(vec3(0.96, 0.99, 1.0), vec3(0.55, 0.68, 0.80), uNight), foam * 0.9);
      diffuseColor.rgb = water;
      // (by night the breaking water glows a little of its own: sea sparkle in the surf)
      seaGlow = foam * uNight * (0.55 + 0.45 * ragged);`
    )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.12, 0.62, 0.66) * seaGlow * 0.55;`)
      .replace("void main() {", `float seaGlow = 0.0;
void main() {`);
  };
  m.customProgramCacheKey = () => (calm ? "sea-water-8-calm" : "sea-water-8");
  m.needsUpdate = true;
}
