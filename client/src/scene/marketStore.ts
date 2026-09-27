import { useSyncExternalStore } from "react";

// The camp's market as the room last synced it (shared/market.ts MarketState as JSON), for the
// things in the world that show it (Barnaby's chalkboard) without threading it through the scene.
// App sets it; readers subscribe.

let current = "";
const listeners = new Set<() => void>();

export function setMarketRaw(raw: string) {
  if (raw === current) return;
  current = raw;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMarketRaw(): string {
  return useSyncExternalStore(subscribe, () => current);
}
