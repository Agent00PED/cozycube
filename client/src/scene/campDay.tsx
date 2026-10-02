import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TimeOfDay } from "@shared/types";
import { daylight } from "@shared/daynight";
import type { HourLook } from "./timeOfDay";

// The camp's own 24-minute day (shared/daynight.ts): the Starlight Campfire and the Whispering Woods
// ease between a bright forest day and a starlit night over a minute at dawn and at dusk, on the wall
// clock, so everyone sees the same sky. WorldScene reads the daylight (0 night .. 1 day) every half
// second while you are there and hands it down: the lights, the lamps' boost, the sky's gradient,
// the fog, the stars and the fireflies all follow it.

/** The daylight at the camp (0..1), or null anywhere else. */
export const CampDaylightContext = createContext<number | null>(null);

const round = (d: number) => Math.round(d * 400) / 400;

/** The camp's daylight now, re-read every half second while `on` (a steady value otherwise, so
 *  nothing re-renders outside dawn and dusk). */
export function useCampDaylight(on: boolean): number {
  const [d, setD] = useState(() => round(daylight(Date.now())));
  useEffect(() => {
    if (!on) return;
    setD(round(daylight(Date.now())));
    const t = window.setInterval(() => setD(round(daylight(Date.now()))), 500);
    return () => window.clearInterval(t);
  }, [on]);
  return d;
}

/** The hour the rest of the scene wears at the camp: day, night, or the dawn and dusk between. */
export function campHour(d: number, now = Date.now()): TimeOfDay {
  if (d >= 0.85) return "day";
  if (d <= 0.15) return "night";
  // rising (dawn) or setting (dusk): the daylight a little later tells
  return daylight(now + 5000) >= d ? "sunrise" : "sunset";
}

const mixColor = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The camp's night look (a touch cooler and brighter than the lounge's, for the moonlit clay) and
 *  its day look (a warm forest noon), eased by the daylight. */
const CAMP_NIGHT: HourLook = { sky: "#141d33", ambientColor: "#c4c0e6", ambient: 0.52, sun: 0.2, sunColor: "#9fb4e8", lampBoost: 2.2 };
// (the day's key is strong and warm, its fill low and sky-cool: lit faces and shaded faces differ, so
// a tree, a rock and a roof have a form; the ground's painted shade lies the way this key throws it)
const CAMP_DAY: HourLook = { sky: "#9fd0ea", ambientColor: "#e4ecfa", ambient: 0.56, sun: 0.98, sunColor: "#ffe8c2", lampBoost: 0.55 };
export function campLook(d: number): HourLook {
  return {
    sky: mixColor(CAMP_NIGHT.sky, CAMP_DAY.sky, d),
    ambientColor: mixColor(CAMP_NIGHT.ambientColor, CAMP_DAY.ambientColor, d),
    ambient: mix(CAMP_NIGHT.ambient, CAMP_DAY.ambient, d),
    sun: mix(CAMP_NIGHT.sun, CAMP_DAY.sun, d),
    sunColor: mixColor(CAMP_NIGHT.sunColor, CAMP_DAY.sunColor, d),
    lampBoost: mix(CAMP_NIGHT.lampBoost, CAMP_DAY.lampBoost, d),
  };
}

/** How much of the night's magic shows (stars, fireflies, the moon): 1 at night, 0 by day. */
export function useCampNight(): number | null {
  const d = useContext(CampDaylightContext);
  return d === null ? null : 1 - d;
}

// the sky's gradient, top and bottom: midnight navy by night, a hazy forest blue by day
const SKY_NIGHT = ["#0b0e14", "#182030"];
const SKY_DAY = ["#6fb2dc", "#d6ecef"];
// the fog: a blue-black haze by night, a pale green-gold one by day, thin either way
const FOG_NIGHT = "#141c2c";
const FOG_DAY = "#cfe2da";
/** How far the isometric camera stands from the point it looks at (IsometricCanvas). */
const CAMERA_DISTANCE = 60;

/** The camp's sky behind the island (a vertical gradient, eased with the daylight) and a thin fog
 *  over it: the far side of the island a little hazier than the near. */
export function CampSky({ daylight: d }: { daylight: number }) {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    const g = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!g) return;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, mixColor(SKY_NIGHT[0], SKY_DAY[0], d));
    grad.addColorStop(1, mixColor(SKY_NIGHT[1], SKY_DAY[1], d));
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    texture.needsUpdate = true;
  }, [texture, d]);
  const fog = useMemo(() => new THREE.Fog(FOG_NIGHT, 30, 90), []);
  useEffect(() => {
    const beforeBg = scene.background;
    const beforeFog = scene.fog;
    scene.background = texture;
    scene.fog = fog;
    return () => {
      scene.background = beforeBg;
      scene.fog = beforeFog;
      texture.dispose();
    };
  }, [scene, texture, fog]);
  useEffect(() => {
    fog.color.set(mixColor(FOG_NIGHT, FOG_DAY, d));
  }, [fog, d]);
  // the fog's band, measured from the camera (always CAMERA_DISTANCE from what it looks at): it
  // starts just in front of the middle of the view and reaches about a third by the island's far
  // edge (a quarter by day)
  useEffect(() => {
    fog.near = CAMERA_DISTANCE - 4;
    fog.far = CAMERA_DISTANCE + 60 + 20 * d;
  }, [fog, d]);
  return null;
}
