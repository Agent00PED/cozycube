import * as THREE from "three";

/** The river's shader, for the worlds whose river is one sheet built by their Blender builder
 *  (build_campfire.py and build_forest.py `build_water`). The mesh carries, in its vertex colours,
 *  what the water is at each point: red how far from the nearer bank (0 at the bank to 1 a metre and a
 *  half out), green 1 on falling water, blue how far down a fall. From them: green shallows deepening
 *  to blue mid-stream, ripples scrolling down it, foam lapping at the banks, white streaks running
 *  down the falls. `time` is the world's clock (seconds), `night` 0 by day to 1 by night. */
export function riverWater(m: THREE.MeshStandardMaterial, time: { value: number }, night: { value: number }) {
  m.color.set("#ffffff");
  m.roughness = 0.22;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vFlowPos;\nuniform float uTime;\nuniform float uNight;").replace(
      "#include <color_fragment>",
      `// (the vertex colours are data, not paint)
      float shore = vColor.r;
      float fall = vColor.g;
      float down = vColor.b;
      vec3 shallow = mix(vec3(0.30, 0.62, 0.60), vec3(0.10, 0.22, 0.30), uNight);
      vec3 deep = mix(vec3(0.13, 0.36, 0.52), vec3(0.04, 0.10, 0.20), uNight);
      vec3 water = mix(shallow, deep, smoothstep(0.08, 0.75, shore));
      // ripples scrolling down the river, bent by a slow cross-current
      float w1 = sin(vFlowPos.z * 2.6 - uTime * 0.9 + sin(vFlowPos.x * 3.1 + uTime * 0.4) * 1.2);
      float w2 = sin(vFlowPos.z * 6.3 - uTime * 1.7 + vFlowPos.x * 2.0);
      float streak = smoothstep(0.72, 1.0, w1 * 0.6 + w2 * 0.4);
      water = mix(water * (0.92 + 0.08 * w1), vec3(0.72, 0.86, 0.95), streak * 0.22 * (1.0 - 0.5 * uNight));
      // foam lapping at the banks: a ragged line that breathes in and out
      float lap = 0.5 + 0.5 * sin(uTime * 0.8 + vFlowPos.z * 1.9 + vFlowPos.x * 1.3);
      float ragged = 0.5 + 0.5 * sin(vFlowPos.z * 7.0 + vFlowPos.x * 5.0 + uTime * 0.6);
      float foam = 1.0 - smoothstep(0.035 + 0.05 * lap, 0.085 + 0.07 * lap + 0.04 * ragged, shore);
      water = mix(water, vec3(0.86, 0.94, 0.96), foam * (0.75 - 0.3 * uNight));
      // falling water: white streaks running down it, thickest at the lip and the foot
      float run = sin(vFlowPos.x * 23.0 + sin(vFlowPos.x * 7.0) * 2.0) * 0.5 + 0.5;
      float streaks = smoothstep(0.35, 0.9, fract(down * 2.2 - uTime * 1.3 + run * 0.7) * run + 0.25 * run);
      vec3 falling = mix(shallow * 1.15, vec3(0.92, 0.97, 1.0), clamp(streaks + 0.35 * smoothstep(0.75, 1.0, down), 0.0, 1.0));
      diffuseColor.rgb = mix(water, mix(falling, falling * 0.62, uNight), fall);`
    );
  };
  m.needsUpdate = true;
}
