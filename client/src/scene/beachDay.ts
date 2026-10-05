import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { TimeOfDay } from "@shared/types";

// The beach's and the Open Sea's light follow the room's own hour (the header's time menu and its
// Auto Cycle, as in the lounge), not the camp's 24-minute day: sunrise, day, sunset, night. The hour
// sets a target and the light eases to it, so a change of hour is a slow turn, never a cut.
//
// `beachDay.light` is 0 by night to 1 by day; `beachDay.dusk` is the low sun's gold on the water and
// the sand (full at sunset, a little at sunrise). The worlds' frame loops step it (`stepBeachDay`)
// and read it; React reads it through `BeachLightContext` (a coarse value, so nothing re-renders
// outside a change of hour).

const LIGHT: Record<TimeOfDay, number> = { sunrise: 0.62, day: 1, sunset: 0.45, night: 0 };
const DUSK: Record<TimeOfDay, number> = { sunrise: 0.6, day: 0, sunset: 1, night: 0 };
/** The tide: how far the sea stands under its full height at each hour (m). Low at sunrise (a stride
 *  more wet sand and the tide pools standing clear), full by sunset. Drawn only: the ground you may
 *  walk and wade is the same at every hour (shared/worlds/beach.ts knows no tide). */
const TIDE: Record<TimeOfDay, number> = { sunrise: -0.14, day: -0.07, sunset: 0, night: -0.03 };
/** Seconds a whole turn from night to day takes. */
const TURN_S = 2.4;

export const beachDay = { light: 1, dusk: 0, tide: TIDE.day, hour: "day" as TimeOfDay };

/** The room's hour, as it changes. */
export function setBeachHour(hour: TimeOfDay, snap = false) {
  beachDay.hour = hour;
  if (snap) {
    beachDay.light = LIGHT[hour];
    beachDay.dusk = DUSK[hour];
    beachDay.tide = TIDE[hour];
  }
}
const toward = (v: number, to: number, step: number) => (Math.abs(to - v) <= step ? to : v + Math.sign(to - v) * step);
/** A frame of the turn. */
export function stepBeachDay(dt: number) {
  const step = Math.min(dt, 0.1) / TURN_S;
  beachDay.light = toward(beachDay.light, LIGHT[beachDay.hour], step);
  beachDay.dusk = toward(beachDay.dusk, DUSK[beachDay.hour], step);
  // (the tide turns slowly: half a minute from low to full)
  beachDay.tide = toward(beachDay.tide, TIDE[beachDay.hour], Math.min(dt, 0.1) * 0.005);
}
/** By day on the beach (the gulls, the day's fish): the server's rule is the same (not "night"). */
export const beachIsDay = () => beachDay.hour !== "night";

/** The beach's light for React (null off the beach's maps). */
export const BeachLightContext = createContext<number | null>(null);
const coarse = (v: number) => Math.round(v * 20) / 20;
export function useBeachLight(on: boolean, hour: TimeOfDay): number {
  const [d, setD] = useState(() => coarse(LIGHT[hour]));
  const here = useRef(false);
  useEffect(() => {
    if (!on) {
      here.current = false;
      return;
    }
    // (arriving: the hour as it is; after that, a turn)
    setBeachHour(hour, !here.current);
    here.current = true;
    setD(coarse(beachDay.light));
    const t = window.setInterval(() => setD((was) => (coarse(beachDay.light) === was ? was : coarse(beachDay.light))), 120);
    return () => window.clearInterval(t);
  }, [on, hour]);
  return d;
}
/** The light where a component stands: the beach's, else full day. */
export const useBeachDaylight = () => useContext(BeachLightContext) ?? 1;
