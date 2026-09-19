// Tiny synthesized UI sounds: a soft click and a little wardrobe chime. They use their own
// lazily created AudioContext (made on the first gesture that plays one) and stay silent while
// ambience is muted, so the mute toggle really means quiet.
let ctx: AudioContext | null = null;
let muted = true;

export function setSfxMuted(value: boolean) {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A soft wooden tick for taps on HUD buttons and swatches. */
export function playClick() {
  blip(1800, 0, 0.05, 0.05, "triangle");
}

/** Three rising bell notes, for opening the wardrobe. */
export function playChime() {
  [880, 1108.7, 1318.5].forEach((f, i) => blip(f, i * 0.07, 0.45, 0.05));
}
