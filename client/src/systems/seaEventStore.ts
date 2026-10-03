import { useSyncExternalStore } from "react";
import type { SeaEvent } from "@shared/voyage";

// The Open Sea's living wonder (shared/voyage.ts SeaEvent), as the room last told it: kept out of React
// state so the scene and the HUD read the same one. Cleared on leaving the sea.

let current: SeaEvent | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const seaEventStore = {
  get: () => current,
  set(ev: SeaEvent | null) {
    current = ev;
    listeners.forEach((fn) => fn());
  },
};
export function useSeaEvent(): SeaEvent | null {
  return useSyncExternalStore(subscribe, () => current);
}
