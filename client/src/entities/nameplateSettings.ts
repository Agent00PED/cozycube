import { useSyncExternalStore } from "react";

// What floats over everyone's head: their name, and the title they wear over it (a capsule title
// or a special one, the Velvet Pioneer's). Each can be hidden in Settings; kept in this browser, and
// a private window or blocked storage just starts with both shown.

export interface NameplateSettings {
  showNames: boolean;
  showTitles: boolean;
}

const KEY = "cozy-nameplates";
const DEFAULTS: NameplateSettings = { showNames: true, showTitles: true };

function load(): NameplateSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<NameplateSettings> | null;
    return {
      showNames: typeof raw?.showNames === "boolean" ? raw.showNames : DEFAULTS.showNames,
      showTitles: typeof raw?.showTitles === "boolean" ? raw.showTitles : DEFAULTS.showTitles,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function setNameplateSettings(patch: Partial<NameplateSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage blocked: the setting holds for this visit
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNameplateSettings(): NameplateSettings {
  return useSyncExternalStore(subscribe, () => current);
}
