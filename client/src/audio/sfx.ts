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

/** A bright two-note coin "ting". */
export function playCoin() {
  blip(1976, 0, 0.18, 0.06, "square");
  blip(2637, 0.07, 0.35, 0.05, "square");
}

/** The ratchet of a slot reel going round. */
export function playReelTick() {
  blip(420, 0, 0.03, 0.025, "triangle");
}

/** A little bell for roulette wins. */
export function playWinBell() {
  [1318.5, 1568, 2093].forEach((f, i) => blip(f, i * 0.09, 0.6, 0.05));
}

/** A soft water "plip": a falling sine drop, for fish coming in while chill-fishing. */
export function playSplash() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(380, t + 0.16);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.25);
  blip(2200, 0.09, 0.08, 0.02);
}

/** The clack of a casino chip landing on the felt. */
export function playChip() {
  blip(3100, 0, 0.04, 0.05, "square");
  blip(2400, 0.035, 0.05, 0.035, "square");
}
