// One AudioContext for the whole app, three buses (master -> sfx / bgm), and the settings that
// drive them. Nothing makes a sound until the user's first gesture: browsers (and Discord's
// webview) keep the context suspended until then, so the manager listens for that gesture and
// resumes exactly once. Settings persist per browser.

export interface AudioSettings {
  master: number; // 0..1
  sfx: number; // 0..1
  bgm: number; // 0..1
  /** Room soundscapes on/off (the speaker button in the header). */
  ambience: boolean;
  /** Force the on-screen joystick on a desktop (it appears on touch devices by itself). */
  joystick: "auto" | "on" | "off";
}

const KEY = "cozy-hangout.audio.v2";
const DEFAULTS: AudioSettings = { master: 0.8, sfx: 0.8, bgm: 0.55, ambience: true, joystick: "auto" };

let settings: AudioSettings = load();
const listeners = new Set<(s: AudioSettings) => void>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let bgm: GainNode | null = null;
let unlocked = false;

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage: defaults it is */
  }
  return { ...DEFAULTS };
}

function applyGains() {
  if (!ctx || !master || !sfx || !bgm) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.master, t, 0.05);
  sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
  bgm.gain.setTargetAtTime(settings.ambience ? settings.bgm : 0, t, 0.15);
}

/** The shared context, created on first use. Null only where WebAudio does not exist. */
export function getAudioContext(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended" && unlocked) void ctx.resume();
    return ctx;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    sfx = ctx.createGain();
    bgm = ctx.createGain();
    sfx.connect(master);
    bgm.connect(master);
    master.connect(ctx.destination);
    applyGains();
    return ctx;
  } catch {
    return null;
  }
}

/** Where UI blips and game effects go. */
export function sfxBus(): AudioNode {
  getAudioContext();
  return sfx!;
}
/** Where the room soundscapes and records go. */
export function bgmBus(): AudioNode {
  getAudioContext();
  return bgm!;
}

/** True once a user gesture has been seen, i.e. sound is allowed to play. */
export function isUnlocked(): boolean {
  return unlocked;
}

/**
 * Autoplay compliance: the first pointer, touch or key inside the Activity resumes the
 * context. Installed once from the app root; safe to call more than once.
 */
let installed = false;
export function installGestureUnlock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const unlock = () => {
    unlocked = true;
    const c = getAudioContext();
    if (c && c.state === "suspended") void c.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchend", unlock);
    listeners.forEach((l) => l(settings)); // ambience hooks re-check now that sound is allowed
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchend", unlock, { passive: true });
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* fine */
  }
  applyGains();
  listeners.forEach((l) => l(settings));
}

export function subscribeAudioSettings(listener: (s: AudioSettings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
