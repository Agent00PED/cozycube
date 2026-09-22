// Tiny synthesized UI and game sounds. They play through the SoundManager's sfx bus, so the
// settings panel's SFX slider and the master mute both apply, and they stay silent until the
// user's first gesture has unlocked the shared AudioContext.
import { getAudioContext, isUnlocked, sfxBus } from "./SoundManager";

/** Kept for callers that used to mute effects with the ambience toggle; volumes live in settings now. */
export function setSfxMuted(_value: boolean) {}

function audio(): AudioContext | null {
  if (!isUnlocked()) return null;
  return getAudioContext();
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
  osc.connect(g).connect(sfxBus());
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
  osc.connect(g).connect(sfxBus());
  osc.start(t);
  osc.stop(t + 0.25);
  blip(2200, 0.09, 0.08, 0.02);
}

/** The clack of a casino chip landing on the felt. */
export function playChip() {
  blip(3100, 0, 0.04, 0.05, "square");
  blip(2400, 0.035, 0.05, 0.035, "square");
}

/** A sparkly rising run for a big win. */
export function playConfetti() {
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => blip(f, i * 0.06, 0.35, 0.04, "triangle"));
}

/** A tiny, soft "mrrp": a short gliding purr-meow for petting Mochi. */
export function playMeow() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.linearRampToValueAtTime(760, t + 0.12);
  osc.frequency.exponentialRampToValueAtTime(430, t + 0.38);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  osc.connect(g).connect(sfxBus());
  osc.start(t);
  osc.stop(t + 0.45);
}

/** A soft rounded "pop" for panels and drawers opening. */
export function playPop() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.05);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(g).connect(sfxBus());
  osc.start(t);
  osc.stop(t + 0.15);
}

/** A card sliding off the shoe and snapping onto felt. */
export function playCardFlip() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const buffer = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2400;
  f.Q.value = 1.2;
  const g = a.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  src.connect(f).connect(g).connect(sfxBus());
  src.start(t);
  blip(1400, 0.05, 0.04, 0.03, "triangle");
}

/** The slot machine's lever: a ratchet down and a spring back. */
export function playLever() {
  [700, 560, 440].forEach((f, i) => blip(f, i * 0.05, 0.05, 0.05, "square"));
  blip(900, 0.22, 0.12, 0.05, "triangle");
}

/** The roulette ball rattling round the rim and settling. */
export function playBallClatter() {
  for (let i = 0; i < 14; i++) blip(1800 + Math.random() * 900, i * (0.05 + i * 0.012), 0.03, 0.03, "square");
}

/** A short celebratory jingle for jackpots and blackjacks. */
export function playJingle() {
  [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5].forEach((f, i) => blip(f, i * 0.09, 0.28, 0.06, "triangle"));
}

/** A gentle two-tone for a toast notification. */
export function playToast() {
  blip(880, 0, 0.12, 0.035, "sine");
  blip(1174.7, 0.08, 0.16, 0.035, "sine");
}
