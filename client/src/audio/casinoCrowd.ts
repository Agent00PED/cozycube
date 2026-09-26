import { getSoundSettings } from "./soundSettings";

// The Velvet Casino's crowd, under the jazz: synthesized in the browser like the rest of the
// soundscape (no audio files: the Activity's sandbox and licensing).
//
//   the murmur     two bands of filtered noise swelling and ebbing on slow drifts, and over them a
//                  walla of half-heard voices: short noise bursts through two vowel-like resonances
//                  (a pair of formants picked for each), placed left and right, now and then
//   glasses        the clink of a glass, sometimes two together (a toast): a bright pair of partials
//                  with a quick ring
//   chips          a stack of chips being shuffled or set down: a run of tiny clicks
//   the machines   far off, a slot machine's bell pair
//
// Its level is the Settings panel's Casino Crowd fader; arriving at the casino fades it in and
// leaving fades it out, with the jazz. The bits are scheduled a little ahead on the audio clock.

const FADE_S = 1.8;
const TICK_MS = 80;
/** Vowel-ish formant pairs (Hz): ah, eh, ee, oh, oo. */
const VOWELS: [number, number][] = [
  [730, 1090],
  [530, 1840],
  [300, 2200],
  [570, 840],
  [330, 870],
];

export class CasinoCrowd {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private level: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private nextVoice = 0;
  private nextClink = 0;
  private nextChips = 0;
  private nextBell = 0;

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
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    // pinkish noise (a running average tilts white noise down), softer on the ear for a crowd
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
      d[i] = last * 3;
    }
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
  }

  /** The Casino Crowd fader, gently curved like the others. */
  private fader() {
    const v = getSoundSettings().crowd;
    return v * v * 0.9;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.level) return;
    this.level.gain.setTargetAtTime(this.fader(), c.currentTime, 0.1);
  }

  private bed(freq: number, q: number, gain: number, lfoHz: number, depth: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.level!);
    src.start(c.currentTime, Math.random() * 1.5);
    const lfo = c.createOscillator();
    lfo.frequency.value = lfoHz;
    const amt = c.createGain();
    amt.gain.value = depth;
    lfo.connect(amt).connect(g.gain);
    lfo.start();
    this.beds.push(src, lfo);
  }

  private startBeds() {
    if (this.beds.length) return;
    this.bed(480, 0.9, 0.05, 0.11, 0.02);
    this.bed(1250, 1.1, 0.025, 0.07, 0.012);
  }

  private stopBeds() {
    for (const n of this.beds) {
      try {
        n.stop();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    this.beds = [];
  }

  /** A half-heard voice: a breath of noise through two vowel resonances, placed to one side. */
  private voice(at: number) {
    const c = this.ctx!;
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const len = 0.12 + Math.random() * 0.28;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const a = c.createBiquadFilter();
    a.type = "bandpass";
    a.frequency.value = f1 * (0.85 + Math.random() * 0.3);
    a.Q.value = 7;
    const b = c.createBiquadFilter();
    b.type = "bandpass";
    b.frequency.value = f2 * (0.85 + Math.random() * 0.3);
    b.Q.value = 9;
    const g = c.createGain();
    const peak = 0.05 + Math.random() * 0.05;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + len * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(a).connect(g);
    src.connect(b).connect(g);
    g.connect(pan).connect(this.level!);
    src.start(at, Math.random() * 1.5, len + 0.05);
    src.onended = () => (src.disconnect(), a.disconnect(), b.disconnect(), g.disconnect(), pan.disconnect());
  }

  /** A glass's clink (twice, for a toast). */
  private clink(at: number) {
    const c = this.ctx!;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.level!);
    const times = Math.random() < 0.3 ? [0, 0.09] : [0];
    const base = 2600 + Math.random() * 1400;
    for (const dt of times) {
      for (const [ratio, gain] of [
        [1, 0.03],
        [2.76, 0.012],
      ] as const) {
        const o = c.createOscillator();
        o.frequency.value = base * ratio;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at + dt);
        g.gain.exponentialRampToValueAtTime(gain, at + dt + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dt + 0.35);
        o.connect(g).connect(pan);
        o.start(at + dt);
        o.stop(at + dt + 0.4);
        o.onended = () => (o.disconnect(), g.disconnect());
      }
    }
    window.setTimeout(() => pan.disconnect(), 900);
  }

  /** Chips shuffled or set down: a run of tiny clicks. */
  private chips(at: number) {
    const c = this.ctx!;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.level!);
    const n = 3 + Math.floor(Math.random() * 6);
    let t = at;
    for (let k = 0; k < n; k++) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3200 + Math.random() * 1800;
      f.Q.value = 3;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      src.connect(f).connect(g).connect(pan);
      src.start(t, Math.random(), 0.03);
      src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
      t += 0.03 + Math.random() * 0.05;
    }
    window.setTimeout(() => pan.disconnect(), 1200);
  }

  /** Far off, a slot machine's bells. */
  private bell(at: number) {
    const c = this.ctx!;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() < 0.5 ? -0.6 : 0.6;
    pan.connect(this.level!);
    [1568, 1976, 1568, 1976].forEach((f, k) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      const t = at + k * 0.11;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.3);
      o.onended = () => (o.disconnect(), g.disconnect());
    });
    window.setTimeout(() => pan.disconnect(), 1200);
  }

  private tick = () => {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const now = c.currentTime;
    if (!this.active && now > this.stopAt) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.stopBeds();
      return;
    }
    const ahead = now + 0.1;
    if (now >= this.nextVoice) {
      this.voice(ahead);
      this.nextVoice = now + 0.12 + Math.random() * 0.45;
    }
    if (now >= this.nextClink) {
      this.clink(ahead);
      this.nextClink = now + 1.6 + Math.random() * 4;
    }
    if (now >= this.nextChips) {
      this.chips(ahead);
      this.nextChips = now + 1.4 + Math.random() * 3.6;
    }
    if (now >= this.nextBell) {
      if (this.nextBell > 0) this.bell(ahead);
      this.nextBell = now + 9 + Math.random() * 14;
    }
  };

  setActive(on: boolean) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? 1 : 0, now + FADE_S);
    if (on) {
      this.startBeds();
      if (!this.timer) this.timer = window.setInterval(this.tick, TICK_MS);
    } else {
      this.stopAt = now + FADE_S + 0.2;
    }
  }
}
