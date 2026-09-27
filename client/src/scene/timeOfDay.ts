import { createContext, useContext } from "react";
import type { TimeOfDay, Weather } from "@shared/types";
import { CampDaylightContext, campLook } from "./campDay";

// The shared hour, as the scene wears it. Warm ambient light is the base of the whole look
// (`#fff5e6` at about 0.8 at midday); the hour only tints it, dims it, changes the sky behind the
// diorama and scales how hard the lamps, the pendants and the hearth glow. Lamps read as
// decorative by day and as the room's real light after dark.
export interface HourLook {
  sky: string;
  ambientColor: string;
  ambient: number;
  /** A soft key light, with no shadow map: it only gives the clay its form. */
  sun: number;
  sunColor: string;
  /** Multiplies every lamp, pendant and the fire. */
  lampBoost: number;
}

export const HOUR_LOOKS: Record<TimeOfDay, HourLook> = {
  sunrise: { sky: "#f3c3ab", ambientColor: "#ffe8d6", ambient: 0.72, sun: 0.42, sunColor: "#ffd2b0", lampBoost: 0.9 },
  day: { sky: "#bfe0f2", ambientColor: "#fff5e6", ambient: 0.8, sun: 0.45, sunColor: "#fff8ec", lampBoost: 0.7 },
  sunset: { sky: "#5a4577", ambientColor: "#ffd9b8", ambient: 0.62, sun: 0.32, sunColor: "#ffb98a", lampBoost: 1.1 },
  night: { sky: "#141d33", ambientColor: "#c4c0e6", ambient: 0.52, sun: 0.2, sunColor: "#9fb4e8", lampBoost: 2.2 },
};

export const TimeOfDayContext = createContext<TimeOfDay>("day");
/** The weather outside (the lounge's; everywhere else is always clear). */
export const WeatherContext = createContext<Weather>("clear");

export function useWeather(): Weather {
  return useContext(WeatherContext);
}

/** The hour's look under the weather: rain dims and cools the daylight, and the lamps come up. */
export function weatherLook(look: HourLook, weather: Weather): HourLook {
  if (weather !== "rain") return look;
  return { ...look, ambient: look.ambient * 0.86, sun: look.sun * 0.55, sunColor: "#c6d0dc", lampBoost: Math.max(look.lampBoost * 1.15, 1.25) };
}

export function useHourLook(): HourLook {
  const hour = useContext(TimeOfDayContext);
  const weather = useContext(WeatherContext);
  const camp = useContext(CampDaylightContext);
  return camp === null ? weatherLook(HOUR_LOOKS[hour], weather) : campLook(camp);
}

/** Multiplier for every artificial light in the scene at the current hour. */
export function useLampBoost(): number {
  return useHourLook().lampBoost;
}
