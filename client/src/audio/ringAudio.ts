import { ASSET_VERSION } from "../assetVersion";
import { masterOut } from "./master";
import { getSoundSettings } from "./soundSettings";
import { playSfx, sharedAudio, type Sfx } from "./sfx";

// The Velvet Ring's fight sounds, resilient: recorded samples when there are any, the synthesizer
// otherwise. The first visit to the ring asks for the five files once each
// (client/public/sounds/boxing/<name>.mp3); whatever does not answer as audio (missing, the dev
// server's page instead of a file, a decode that fails) plays from its procedural stand-in in
// audio/sfx.ts (a sine's pitch drop for a punch, filtered noise for a swoosh, the bell's two
// sines, a noise crunch for a Guard Break). A sound asked for before the files are in plays
// synthesized too, so every hit is heard from the first one, and nothing ever throws.

export type RingSound = "punch_light" | "punch_heavy" | "parry_ding" | "guard_break" | "canvas_thud";
const NAMES: RingSound[] = ["punch_light", "punch_heavy", "parry_ding", "guard_break", "canvas_thud"];
const SYNTH: Record<RingSound, Sfx> = { punch_light: "punchLight", punch_heavy: "punchHeavy", parry_ding: "parryDing", guard_break: "glassBreak", canvas_thud: "canvasThud" };

/** The decoded samples: a buffer, or null (not there: synthesized). */
const samples = new Map<RingSound, AudioBuffer | null>();
let loading: Promise<void> | null = null;

/** Fetch and decode the ring's samples, once (the ring's scene calls it on arrival). */
export function loadRingSounds(): Promise<void> {
  if (loading) return loading;
  const c = sharedAudio();
  if (!c) return (loading = Promise.resolve());
  loading = Promise.all(
    NAMES.map(async (name) => {
      try {
        const res = await fetch(`/sounds/boxing/${name}.mp3?v=${ASSET_VERSION}`);
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !/audio|mpeg|octet-stream/i.test(type)) throw new Error("not a sample");
        samples.set(name, await c.decodeAudioData(await res.arrayBuffer()));
      } catch {
        samples.set(name, null);
      }
    })
  ).then(() => undefined);
  return loading;
}

/** A fight sound at `volume` (0..1): the sample if there is one, else its synthesized stand-in. */
export function playRingSound(kind: RingSound, volume = 1) {
  if (!getSoundSettings().effects) return;
  const buffer = samples.get(kind);
  const c = buffer ? sharedAudio() : null;
  if (buffer && c) {
    try {
      const src = c.createBufferSource();
      src.buffer = buffer;
      const g = c.createGain();
      g.gain.value = Math.max(0, Math.min(1, volume));
      src.connect(g).connect(masterOut(c));
      src.start();
      src.onended = () => (src.disconnect(), g.disconnect());
      return;
    } catch {
      // (a context that could not play it: the synthesizer can)
    }
  }
  playSfx(SYNTH[kind], volume);
}
