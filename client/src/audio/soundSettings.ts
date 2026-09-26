import { useSyncExternalStore } from "react";

// The game's own sound settings (the lounge radio keeps its volume in its panel): the ambience
// mixer, a fader for each channel of a world's soundscape (at the campfire: the fire's crackle,
// the river, and the forest's breeze and crickets), and whether the little effects (a catch's
// chime, a chop) play. Kept in this browser; a private window or blocked storage just starts from
// the defaults. A single Ambience level saved before the mixer sets all three faders.

export type AmbienceChannel = "fire" | "river" | "forest";
export const AMBIENCE_CHANNELS: AmbienceChannel[] = ["fire", "river", "forest"];

export interface SoundSettings {
  /** Each ambience channel's fader, 0..1. */
  fire: number;
  river: number;
  forest: number;
  /** The one-shot effects: chimes, splashes, chops. */
  effects: boolean;
}

const KEY = "cozy-sound-settings";
const DEFAULTS: SoundSettings = { fire: 0.55, river: 0.55, forest: 0.55, effects: true };

function load(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Partial<SoundSettings> & { ambience?: number }) | null;
    const legacy = typeof raw?.ambience === "number" ? raw.ambience : undefined;
    const level = (v: unknown) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : legacy ?? DEFAULTS.fire);
    return {
      fire: level(raw?.fire),
      river: level(raw?.river),
      forest: level(raw?.forest),
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
