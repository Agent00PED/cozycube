import { useSyncExternalStore } from "react";

// The game's own sound settings (the lounge radio keeps its volume in its panel): the ambience
// mixer, a fader for each channel of a world's soundscape (at the campfire: the fire's crackle,
// the river, and the forest's breeze and crickets; in the Whispering Woods the wind in the trees),
// the casino's jazz and its crowd (the murmur, glasses and chips), the rain on the lounge's windows,
// the campfire's night guitar,
// the Glimmering Caverns' five (its air, drips and footsteps, its water, its crystals' resonance, its
// thermal terraces' steam, its sparse music),
// and whether the little effects (a catch's chime, a chop, a pickaxe's clink) play. Kept in this
// browser; a private window or blocked storage just starts from the defaults. A single Ambience level
// saved before the mixer sets all three of the camp's faders.

export type AmbienceChannel = "fire" | "river" | "forest" | "wind" | "guitar";
export const AMBIENCE_CHANNELS: AmbienceChannel[] = ["fire", "river", "forest", "wind", "guitar"];
/** The Glimmering Caverns' channels (audio/cavernAmbience.ts). */
export type CaveChannel = "cavern" | "water" | "crystal" | "steam" | "music";
export const CAVE_CHANNELS: CaveChannel[] = ["cavern", "water", "crystal", "steam", "music"];

export interface SoundSettings {
  /** Each ambience channel's fader, 0..1. */
  fire: number;
  river: number;
  forest: number;
  /** The Whispering Woods' wind in the trees, 0..1. */
  wind: number;
  /** The Starlight Campfire's night guitar: a fingerpicked phrase now and then after dusk, 0..1. */
  guitar: number;
  /** The Glimmering Caverns (audio/cavernAmbience.ts), 0..1 each: the cavern's air, drips and footsteps; its
   *  water (the waterfall, the stream, the lake); its crystals' resonance; the thermal terraces' steam; its
   *  sparse music. */
  cavern: number;
  water: number;
  crystal: number;
  steam: number;
  music: number;
  /** The Velvet Casino's jazz combo (audio/casinoJazz.ts), 0..1. */
  jazz: number;
  /** The Cozy Lounge's folk-jazz trio (audio/loungeFolk.ts), 0..1. */
  lounge: number;
  /** The Velvet Casino's crowd: the murmur, the clink of glasses, chips clicking (audio/casinoCrowd.ts), 0..1. */
  crowd: number;
  /** The rain on the lounge's windows when it rains (audio/ambience.ts), 0..1. */
  rain: number;
  /** The one-shot effects: chimes, splashes, chops. */
  effects: boolean;
}

const KEY = "cozy-sound-settings";
const DEFAULTS: SoundSettings = { fire: 0.55, river: 0.55, forest: 0.55, wind: 0.5, guitar: 0.4, cavern: 0.6, water: 0.55, crystal: 0.45, steam: 0.5, music: 0.4, jazz: 0.5, lounge: 0.45, crowd: 0.5, rain: 0.5, effects: true };

function load(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Partial<SoundSettings> & { ambience?: number }) | null;
    const legacy = typeof raw?.ambience === "number" ? raw.ambience : undefined;
    const level = (v: unknown) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : legacy ?? DEFAULTS.fire);
    return {
      fire: level(raw?.fire),
      river: level(raw?.river),
      forest: level(raw?.forest),
      wind: typeof raw?.wind === "number" ? Math.max(0, Math.min(1, raw.wind)) : DEFAULTS.wind,
      guitar: typeof raw?.guitar === "number" ? Math.max(0, Math.min(1, raw.guitar)) : DEFAULTS.guitar,
      cavern: typeof raw?.cavern === "number" ? Math.max(0, Math.min(1, raw.cavern)) : DEFAULTS.cavern,
      water: typeof raw?.water === "number" ? Math.max(0, Math.min(1, raw.water)) : DEFAULTS.water,
      crystal: typeof raw?.crystal === "number" ? Math.max(0, Math.min(1, raw.crystal)) : DEFAULTS.crystal,
      steam: typeof raw?.steam === "number" ? Math.max(0, Math.min(1, raw.steam)) : DEFAULTS.steam,
      music: typeof raw?.music === "number" ? Math.max(0, Math.min(1, raw.music)) : DEFAULTS.music,
      jazz: typeof raw?.jazz === "number" ? Math.max(0, Math.min(1, raw.jazz)) : DEFAULTS.jazz,
      lounge: typeof raw?.lounge === "number" ? Math.max(0, Math.min(1, raw.lounge)) : DEFAULTS.lounge,
      crowd: typeof raw?.crowd === "number" ? Math.max(0, Math.min(1, raw.crowd)) : DEFAULTS.crowd,
      rain: typeof raw?.rain === "number" ? Math.max(0, Math.min(1, raw.rain)) : DEFAULTS.rain,
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
