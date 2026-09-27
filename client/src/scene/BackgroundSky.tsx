import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TimeOfDay, Weather } from "@shared/types";
import { noRaycast } from "./kit";

// The sky behind a diorama: one full-screen quad drawn before anything else (no depth, no raycast),
// its fragment shader painting everything the world leaves uncovered.
//
//   the gradient   three stops, bottom to top, and a soft glow band low on the horizon
//   the clouds     fbm puffs drifting slowly across, lit on top and shaded underneath
//   the stars      a hashed field twinkling on their own clocks, a brighter sparse layer over a
//                  faint fine one
//   the rain       slanted streaks falling past in three depths
//
// A sky is a set of targets (SkyLook); a change of hour or weather eases every uniform to the new
// look over a couple of seconds, so the sun sets and a shower rolls in rather than cutting.
//
//   the Cozy Lounge   follows the room's hour and weather: a pastel cerulean day with drifting
//                     clouds, an amber, peach and dusky-violet sunset, a midnight-indigo starfield
//                     at night; rain turns any of them to a muted slate overcast with streaks falling
//   the Velvet Casino a deep midnight-indigo starfield over a warm amber horizon glow, both floors

export interface SkyLook {
  top: string;
  mid: string;
  bottom: string;
  glow: string;
  glowAmt: number;
  clouds: number;
  cloudLit: string;
  cloudShade: string;
  stars: number;
  rain: number;
}

const CLEAR: Record<TimeOfDay, SkyLook> = {
  sunrise: { top: "#8fb3e2", mid: "#f4c3b0", bottom: "#ffe3bf", glow: "#ffc48a", glowAmt: 0.22, clouds: 0.55, cloudLit: "#fff1e8", cloudShade: "#e3b3a6", stars: 0, rain: 0 },
  day: { top: "#7fc4ec", mid: "#b9e1f5", bottom: "#e8f6fc", glow: "#ffffff", glowAmt: 0.08, clouds: 0.8, cloudLit: "#ffffff", cloudShade: "#d5e4ee", stars: 0, rain: 0 },
  sunset: { top: "#3d2f6b", mid: "#c9728a", bottom: "#ffb15e", glow: "#ff9a3c", glowAmt: 0.32, clouds: 0.45, cloudLit: "#ffc79c", cloudShade: "#7c4f78", stars: 0.2, rain: 0 },
  night: { top: "#050816", mid: "#0c1330", bottom: "#1a2248", glow: "#3a4c96", glowAmt: 0.16, clouds: 0, cloudLit: "#2a3358", cloudShade: "#151b33", stars: 1, rain: 0 },
};
const RAIN: Record<TimeOfDay, SkyLook> = {
  sunrise: { top: "#6d7682", mid: "#8e959e", bottom: "#aeb2b6", glow: "#d9b9a0", glowAmt: 0.08, clouds: 0.92, cloudLit: "#a3a9b0", cloudShade: "#6f7782", stars: 0, rain: 1 },
  day: { top: "#66727e", mid: "#87929c", bottom: "#a9b1b8", glow: "#dfe5ea", glowAmt: 0.05, clouds: 0.95, cloudLit: "#a5adb5", cloudShade: "#6c7580", stars: 0, rain: 1 },
  sunset: { top: "#383c4c", mid: "#585c6c", bottom: "#7b7a82", glow: "#b38a78", glowAmt: 0.1, clouds: 0.9, cloudLit: "#6e7080", cloudShade: "#3c3f4c", stars: 0, rain: 0.9 },
  night: { top: "#0a0d14", mid: "#131822", bottom: "#212833", glow: "#394556", glowAmt: 0.08, clouds: 0.8, cloudLit: "#2c3440", cloudShade: "#161b23", stars: 0, rain: 0.75 },
};

/** The lounge's sky for an hour and a weather. */
export function loungeSky(hour: TimeOfDay, weather: Weather): SkyLook {
  return (weather === "rain" ? RAIN : CLEAR)[hour];
}
/** The casino's (both floors): a deep indigo starfield over a warm amber horizon. */
export const CASINO_SKY: SkyLook = { top: "#04051a", mid: "#0d1233", bottom: "#231b3a", glow: "#ffae52", glowAmt: 0.2, clouds: 0, cloudLit: "#000000", cloudShade: "#000000", stars: 1, rain: 0 };
/** The penthouse's: the same stars, the city's warmer glow under them. */
export const CASINO_VIP_SKY: SkyLook = { ...CASINO_SKY, bottom: "#2e1f3e", glow: "#ff9a62", glowAmt: 0.26 };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uTop, uMid, uBottom, uGlow, uCloudLit, uCloudShade;
uniform float uGlowAmt, uClouds, uStars, uRain;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 3.7);
    a *= 0.5;
  }
  return v;
}
float starLayer(vec2 p, float cells, float density, float size, float seed) {
  vec2 g = p * cells;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id + seed);
  if (h < density) return 0.0;
  vec2 off = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) - 0.5;
  float d = length(f - off * 0.6);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + h * 2.6) + h * 57.0);
  return smoothstep(size, 0.0, d) * twinkle;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = uv.y < 0.5 ? mix(uBottom, uMid, uv.y * 2.0) : mix(uMid, uTop, (uv.y - 0.5) * 2.0);
  // the horizon's glow, low on the screen
  col += uGlow * uGlowAmt * exp(-pow((uv.y - 0.1) / 0.24, 2.0));
  // the stars, brighter higher up (and hidden behind the clouds below)
  float stars = starLayer(p, 70.0, 0.955, 0.16, 0.0) + 0.55 * starLayer(p, 150.0, 0.93, 0.12, 11.0);
  vec3 starCol = vec3(1.0, 0.95, 0.84) * stars * uStars * (0.45 + 0.55 * uv.y);
  // the clouds, drifting right
  float cover = 0.0;
  vec3 cloud = uCloudLit;
  if (uClouds > 0.001) {
    vec2 q = p * vec2(1.8, 3.2) + vec2(uTime * 0.01, 0.0);
    float n = fbm(q);
    float lo = mix(0.62, 0.36, uClouds);
    cover = smoothstep(lo, lo + 0.2, n) * min(1.0, uClouds * 1.2);
    float shade = fbm(q * 1.3 + vec2(0.0, 0.35));
    cloud = mix(uCloudLit, uCloudShade, smoothstep(0.35, 0.75, shade));
  }
  col += starCol * (1.0 - cover);
  col = mix(col, cloud, cover);
  // the rain: slanted streaks falling past, near ones longer and brighter
  if (uRain > 0.001) {
    vec2 r = p;
    r.x += r.y * 0.22;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float cells = 70.0 + fk * 45.0;
      vec2 rp = vec2(r.x * cells, r.y * cells * 0.09 + uTime * (1.5 + fk * 0.55));
      vec2 id = floor(rp);
      vec2 f = fract(rp);
      float h = hash(id + fk * 13.0);
      float streak = step(0.62, h) * smoothstep(0.14, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.55, f.y);
      col = mix(col, vec3(0.86, 0.9, 0.96), streak * uRain * (0.42 - fk * 0.1));
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const color = (hex: string) => new THREE.Color(hex);
/** A change of hour or weather eases in over about this long. */
const EASE_S = 1.8;

/** The sky for `look`: a quad behind everything, easing to each new look. */
export function BackgroundSky({ look }: { look: SkyLook }) {
  const size = useThree((s) => s.size);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uTop: { value: color(look.top) },
          uMid: { value: color(look.mid) },
          uBottom: { value: color(look.bottom) },
          uGlow: { value: color(look.glow) },
          uGlowAmt: { value: look.glowAmt },
          uClouds: { value: look.clouds },
          uCloudLit: { value: color(look.cloudLit) },
          uCloudShade: { value: color(look.cloudShade) },
          uStars: { value: look.stars },
          uRain: { value: look.rain },
        },
      }),
    // the first look only: later ones are eased to in the frame loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry]
  );
  // the targets, as colours once
  const target = useRef({ look, top: color(look.top), mid: color(look.mid), bottom: color(look.bottom), glow: color(look.glow), lit: color(look.cloudLit), shade: color(look.cloudShade) });
  if (target.current.look !== look) target.current = { look, top: color(look.top), mid: color(look.mid), bottom: color(look.bottom), glow: color(look.glow), lit: color(look.cloudLit), shade: color(look.cloudShade) };

  useFrame((state, delta) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    (u.uRes.value as THREE.Vector2).set(size.width, size.height);
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * (3 / EASE_S));
    const t = target.current;
    (u.uTop.value as THREE.Color).lerp(t.top, k);
    (u.uMid.value as THREE.Color).lerp(t.mid, k);
    (u.uBottom.value as THREE.Color).lerp(t.bottom, k);
    (u.uGlow.value as THREE.Color).lerp(t.glow, k);
    (u.uCloudLit.value as THREE.Color).lerp(t.lit, k);
    (u.uCloudShade.value as THREE.Color).lerp(t.shade, k);
    u.uGlowAmt.value += (t.look.glowAmt - u.uGlowAmt.value) * k;
    u.uClouds.value += (t.look.clouds - u.uClouds.value) * k;
    u.uStars.value += (t.look.stars - u.uStars.value) * k;
    u.uRain.value += (t.look.rain - u.uRain.value) * k;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1000} raycast={noRaycast} />;
}
