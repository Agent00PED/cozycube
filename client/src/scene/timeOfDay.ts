import { createContext, useContext } from "react";
import type { TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "./roomThemes";

// Lamps, bulbs and the campfire have to know the hour: the same desk lamp should read as
// decorative at noon and as the only light in the room at night. Context rather than props
// because the prop components are memoized on their synced state — context still reaches them,
// and it keeps the time out of every prop's signature.
export const TimeOfDayContext = createContext<TimeOfDay>("day");

export function useTimePreset() {
  return TIME_PRESETS[useContext(TimeOfDayContext)];
}

/** Multiplier for every artificial light in the scene at the current hour. */
export function useLampBoost(): number {
  return useTimePreset().lampBoost;
}
