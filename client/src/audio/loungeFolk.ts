import { getSoundSettings } from "./soundSettings";
import { WORLD_CROSSFADE_S, crossfade } from "./sound";

// The Cozy Lounge's soundscape: a little folk-jazz trio by the fireplace, synthesized in the browser
// like the casino's combo (no audio files). An easy two-feel at 92 bpm round an 8-bar form in G:
//
//   | Gmaj7 | Em7 | Am7 | D7 | Bm7 | E7 | Am7 | D9 |
//
//   nylon guitar   fingerpicked: the bass string on one and three, the chord's upper voices rolled
//                  across the "ands" (a triangle through a closing low-pass: a soft pluck, no hiss)
//   upright bass   a two-feel: the root on one, the fifth (or a step into the next bar) on three
//   brushes        a slow swish on two and four, very low
//   melodica       now and then a lazy phrase from the chord, with a late vibrato
//
// It plays in the lounge, under the radio: while the room's radio is on it fades away (the radio is
// the music then) and comes back when it stops. Arriving and leaving cross-fade it with the other
// worlds' soundscapes (audio/sound.ts). Its level is the Settings panel's Lounge Folk-Jazz fader.

const BPM = 92;
const BEAT = 60 / BPM;
const LOOKAHEAD_S = 0.25;
const TICK_MS = 40;

interface Chord {
  root: number;
  tones: number[];
}
const FORM: Chord[] = [
  { root: 43, tones: [4, 7, 11, 14] }, // Gmaj7
  { root: 40, tones: [3, 7, 10, 14] }, // Em7
  { root: 45, tones: [3, 7, 10, 14] }, // Am7
  { root: 38, tones: [4, 7, 10, 14] }, // D7
  { root: 47, tones: [3, 7, 10, 14] }, // Bm7
  { root: 40, tones: [4, 7, 10, 13] }, // E7
  { root: 45, tones: [3, 7, 10, 14] }, // Am7
  { root: 38, tones: [4, 7, 10, 14] }, // D9
];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class LoungeFolk {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private level: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private active = false;
  private radio = false;
  private stopAt = 0;
  private nextBeat = 0;
  private beat = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    this.level = c.createGain();
    this.level.gain.value = this.fader();
    this.level.connect(this.master);
    const warm = c.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 3800;
    warm.Q.value = 0.5;
    warm.connect(this.level);
    this.bus = c.createGain();
    this.bus.connect(warm);
    // a small wooden room
    const echo = c.createDelay(1);
    echo.delayTime.value = 0.19;
    const back = c.createGain();
    back.gain.value = 0.22;
    const dull = c.createBiquadFilter();
    dull.type = "lowpass";
    dull.frequency.value = 1900;
    const wet = c.createGain();
    wet.gain.value = 0.18;
    this.bus.connect(echo);
    echo.connect(dull).connect(back).connect(echo);
    dull.connect(wet).connect(warm);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.72 + (Math.random() * 2 - 1) * 0.28;
      d[i] = last * 2.2;
    }
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
  }

  private fader() {
    const v = getSoundSettings().lounge;
    return v * v * 1.1;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.level) return;
    this.level.gain.setTargetAtTime(this.fader(), c.currentTime, 0.1);
  }

  /** In the lounge (and whether its radio is playing: then the trio fades away under it). */
  setActive(inLounge: boolean, radioPlaying: boolean) {
    const on = inLounge && !radioPlaying;
    if (on === this.active && radioPlaying === this.radio) return;
    this.radio = radioPlaying;
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    crossfade(c, this.master.gain, on ? 1 : 0);
    if (on) {
      if (!this.timer) {
        this.nextBeat = c.currentTime + 0.1;
        this.beat = 0;
        this.timer = window.setInterval(this.tick, TICK_MS);
      }
    } else this.stopAt = c.currentTime + WORLD_CROSSFADE_S + 0.3;
  }

  private tick = () => {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const now = c.currentTime;
    if (!this.active && now > this.stopAt) {
      window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    if (this.nextBeat < now) this.nextBeat = now + 0.05;
    while (this.nextBeat < now + LOOKAHEAD_S) {
      this.playBeat(this.beat, this.nextBeat);
      this.beat += 1;
      this.nextBeat += BEAT;
    }
  };

  private playBeat(n: number, t: number) {
    const inBar = n % 4;
    const bar = Math.floor(n / 4) % FORM.length;
    const chord = FORM[bar];
    const next = FORM[(bar + 1) % FORM.length];
    // the bass: a two-feel
    if (inBar === 0) this.bass(chord.root, t, 1);
    if (inBar === 2) this.bass(Math.random() < 0.35 ? next.root + pick([-1, 1, 2]) : chord.root + 7, t, 0.8);
    // the guitar: the thumb on one and three, the fingers rolling the upper voices on the "ands"
    const voices = chord.tones.map((iv) => chord.root % 12 + 55 + iv);
    if (inBar === 0 || inBar === 2) this.pluck(hz(chord.root + 12), t, 0.9, BEAT * 1.6);
    const roll = inBar % 2 === 0 ? voices.slice(0, 3) : voices.slice(1, 4);
    roll.forEach((m, k) => this.pluck(hz(m), t + BEAT * 0.5 + k * 0.035, 0.55, BEAT * 1.4));
    // the brushes
    if (inBar === 1 || inBar === 3) this.swish(t);
    // the melodica, now and then
    if (inBar === 0 && bar % 4 === 1 && Math.random() < 0.5) this.phrase(chord, t + BEAT);
  }

  private bass(midi: number, t: number, accent: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.value = hz(midi);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * accent, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 1.9);
    o.connect(lp).connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + BEAT * 2);
    o.onended = () => (o.disconnect(), lp.disconnect(), g.disconnect());
  }

  /** A nylon string: a triangle and a quieter octave, a low-pass that closes fast after the pluck. */
  private pluck(f: number, t: number, accent: number, len: number) {
    const c = this.ctx!;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(Math.min(5200, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * accent, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(this.bus!);
    for (const [mul, lvl] of [[1, 1], [2, 0.25]] as const) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * mul;
      const og = c.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + len + 0.05);
      o.onended = () => (o.disconnect(), og.disconnect());
    }
    window.setTimeout(() => (lp.disconnect(), g.disconnect()), (t - c.currentTime + len + 0.2) * 1000);
  }

  private swish(t: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t - 0.03);
    g.gain.exponentialRampToValueAtTime(0.018, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(bp).connect(g).connect(this.bus!);
    src.start(Math.max(c.currentTime, t - 0.03), Math.random() * 1.5);
    src.stop(t + 0.3);
    src.onended = () => (src.disconnect(), bp.disconnect(), g.disconnect());
  }

  /** A lazy melodica line: reedy (a square through a soft band-pass), a vibrato on the held note. */
  private phrase(chord: Chord, t: number) {
    const c = this.ctx!;
    const tones = [0, ...chord.tones].map((iv) => chord.root % 12 + 67 + iv).filter((m) => m <= 88);
    let at = t;
    let m = pick(tones);
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const long = k === n - 1;
      const dur = long ? BEAT * 2 : BEAT * pick([0.5, 1]);
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = hz(m);
      if (long) {
        const vib = c.createOscillator();
        vib.frequency.value = 5;
        const depth = c.createGain();
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(hz(m) * 0.005, at + 0.4);
        vib.connect(depth).connect(o.frequency);
        vib.start(at);
        vib.stop(at + dur + 0.05);
        vib.onended = () => (vib.disconnect(), depth.disconnect());
      }
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 0.9;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.018, at + 0.06);
      g.gain.setValueAtTime(0.018, at + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(bp).connect(g).connect(this.bus!);
      o.start(at);
      o.stop(at + dur + 0.02);
      o.onended = () => (o.disconnect(), bp.disconnect(), g.disconnect());
      at += dur;
      m = pick(tones.filter((x) => Math.abs(x - m) <= 5 && x !== m).concat([m]));
    }
  }
}
