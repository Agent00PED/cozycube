import { useSyncExternalStore } from "react";
import { onResume, onShutdown } from "../systems/lifecycle";

// The Master Volume: one gain at the root of every sound the game makes. The engines each run their
// own AudioContext (made on first use: the worlds' soundscapes, the lounge's music and radio, the
// rain, the effects and the piano, the kitchen's bubbling, Mochi's purr), and every one of them
// sends its output through masterOut(ctx), that context's master gain node, instead of straight to
// the speakers: the Settings panel's Master Volume scales all of it at once, on top of each
// channel's own fader. Kept in this browser under `master_volume` (0..1, 80% to start); a private
// window or blocked storage just starts from the default.

const KEY = "master_volume";
const DEFAULT = 0.8;

function load(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let volume = load();
const outs = new Map<AudioContext, GainNode>();
const listeners = new Set<() => void>();

/** The node an engine on `ctx` connects its output to (made once per context, at the master level). */
export function masterOut(ctx: AudioContext): AudioNode {
  let out = outs.get(ctx);
  if (!out) {
    out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);
    outs.set(ctx, out);
    // a context closed for good (the kitchen's, Mochi's) is forgotten
    ctx.addEventListener("statechange", () => {
      if (ctx.state === "closed") outs.delete(ctx);
    });
  }
  return out;
}

/** From a tap (the lounge selector's): wakes every audio context made so far, and `also` (the
 *  effects' own), each with a silent blip, so a phone lets them all sound from here on. */
export function unlockAudio(also?: AudioContext | null) {
  const all = new Set(outs.keys());
  if (also) all.add(also);
  all.forEach((ctx) => {
    if (ctx.state === "suspended") void ctx.resume();
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // a closed context: nothing to wake
    }
  });
}

export function getMasterVolume(): number {
  return volume;
}

/** Sets the Master Volume (0..1): every context's master gain follows at once, and it is kept. */
export function setMasterVolume(v: number) {
  volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : DEFAULT));
  outs.forEach((out, ctx) => {
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(volume, ctx.currentTime);
  });
  try {
    localStorage.setItem(KEY, String(volume));
  } catch {
    // storage blocked: the setting holds for this visit
  }
  listeners.forEach((l) => l());
}

export function useMasterVolume(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => volume
  );
}

// a soft restart or an outdated build (systems/lifecycle.ts): every context falls silent at once,
// and wakes again as the game comes back (the page has been tapped before: no new gesture needed)
onShutdown(() => {
  outs.forEach((_, ctx) => {
    void ctx.suspend().catch(() => {});
  });
});
onResume(() => {
  outs.forEach((_, ctx) => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  });
});
