import { useSyncExternalStore } from "react";

// The game's own sound settings (the lounge radio keeps its volume in its panel): how loud each
// world's ambience is, and whether the little effects (a catch's chime, a chop) play. Kept in
// this browser; a private window or blocked storage just starts from the defaults.

export interface SoundSettings {
  /** The world's ambient soundscape (the campfire's crackle, water and crickets), 0..1. */
  ambience: number;
  /** The one-shot effects: chimes, splashes, chops. */
  effects: boolean;
}

const KEY = "cozy-sound-settings";
const DEFAULTS: SoundSettings = { ambience: 0.55, effects: true };

function load(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SoundSettings> | null;
    return {
      ambience: typeof raw?.ambience === "number" ? Math.max(0, Math.min(1, raw.ambience)) : DEFAULTS.ambience,
      effects: typeof raw?.effects === "boolean" ? raw.effects : DEFAULTS.effects,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSoundSettings(): SoundSettings {
  return current;
}

export function setSoundSettings(patch: Partial<SoundSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage blocked: the setting holds for this visit
  }
  listeners.forEach((l) => l());
}

export function subscribeSoundSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribeSoundSettings, getSoundSettings);
}
