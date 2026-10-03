import * as THREE from "three";

/** The sea's shader, for Sunset Beach's one sheet of water (scripts/blender/build_beach.py
 *  `build_sea`). The mesh carries, in its vertex colours, how far out from the waterline each point is
 *  (red: 0 at 0.8 m up the sand to 1 at 11 m out and beyond). From it: pale turquoise shallows
 *  deepening to blue, lines of foam rolling in to the shore and lapping up the sand, a slow glitter
 *  on the open water. The sheet itself rises and falls a hand's height, so the waterline runs up
 *  the sand and back. `time` is the world's clock (seconds), `night` 0 by day to 1 by night, `dusk`
 *  1 at sunrise and sunset (the low sun's gold on the water). */
export function seaWater(m: THREE.MeshStandardMaterial, time: { value: number }, night: { value: number }, dusk: { value: number }) {
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
      // the low sun's gold, at dawn and dusk
      water = mix(water, water * vec3(1.25, 0.95, 0.72) + vec3(0.10, 0.04, 0.0), 0.55 * uDusk);
      // a slow, soft shimmer on the open water (broad, never streaks)
      float g1 = sin(vSeaPos.x * 0.9 + vSeaPos.z * 0.6 - uTime * 0.5 + sin(vSeaPos.x * 0.35 - vSeaPos.z * 0.5 + uTime * 0.2) * 1.4);
      float g2 = sin(vSeaPos.x * 0.7 - vSeaPos.z * 1.1 + uTime * 0.35);
      water *= 0.96 + 0.05 * g1 * g2;
      float glint = smoothstep(0.55, 1.0, g1 * g2);
      water = mix(water, vec3(0.80, 0.95, 1.0), glint * 0.1 * (1.0 - 0.6 * uNight) * smoothstep(0.5, 3.0, sea));
      // waves rolling in: lines of foam that follow the coast, breaking as they reach the shallows
      float wob = sin(vSeaPos.x * 0.9 - vSeaPos.z * 0.7 + uTime * 0.2) * 0.9;
      float roll = sin(sea * 1.25 + uTime * 0.85 + wob);
      float crest = smoothstep(0.86, 1.0, roll) * (1.0 - smoothstep(1.2, 6.5, sea)) * smoothstep(-0.2, 0.6, sea);
      // the lapping edge: foam at the waterline, in and out
      float lap = 0.5 + 0.5 * sin(uTime * 0.85 + vSeaPos.x * 0.8 - vSeaPos.z * 0.6);
      float ragged = 0.5 + 0.5 * sin(vSeaPos.x * 5.3 + vSeaPos.z * 4.1 + uTime * 0.5);
      float edge = 1.0 - smoothstep(0.08 + 0.2 * lap, 0.3 + 0.32 * lap + 0.12 * ragged, sea);
      float foam = clamp(max(edge, crest * (0.6 + 0.4 * ragged)), 0.0, 1.0);
      water = mix(water, mix(vec3(0.96, 0.99, 1.0), vec3(0.55, 0.68, 0.80), uNight), foam * 0.9);
      diffuseColor.rgb = water;`
    );
  };
  m.customProgramCacheKey = () => "sea-water-2";
  m.needsUpdate = true;
}
