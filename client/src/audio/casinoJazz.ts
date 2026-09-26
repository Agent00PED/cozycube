import { getSoundSettings } from "./soundSettings";

// The Velvet Casino's soundscape: a small late-night jazz combo, synthesized in the browser like the
// radio and the campfire (no audio files: the Activity's sandbox and licensing). A slow swing
// (84 bpm, eighths swung 2:1) round a 16-bar form in F:
//
//   | Gm7 | C7 | Fmaj7 | D7 | Gm7 | C7 | Fmaj7 | C7 | Bbmaj7 | Bbm6 | Am7 | D7 | Gm7 | C7 | F6 | C7 |
//
//   upright bass   a walking line: the root on one, chord tones on two and three, a chromatic
//                  step into the next bar's root on four; a warm pluck under a low-pass
//   drums          the ride's swung "ding, ding-a ding", brushes on two and four with a soft swirl
//                  between, a feathered bass drum on every beat
//   keys           Rhodes-like comping: three-note shells (the third, the seventh, a colour tone)
//                  on the Charleston and its cousins, a bell in the attack, a long decay
//   muted trumpet  now and then, a short phrase of swung eighths from the chord (a harmon-muted
//                  buzz: a sawtooth through a narrow band-pass, a late vibrato)
//
// all through a short room echo and a gentle top-end roll-off, with a faint vinyl hiss. Arriving at
// the casino fades it in and leaving fades it out (the campfire's cross-fade time). Its level is
// the Settings panel's Casino Jazz fader. The notes are scheduled a little ahead on the audio
// clock (the usual look-ahead scheduler), so a busy frame never makes the band drag.

const FADE_S = 1.8;
const BPM = 84;
const BEAT = 60 / BPM;
/** Where a swung off-beat falls, in beats after its beat. */
const SWING = 2 / 3;
const LOOKAHEAD_S = 0.25;
const TICK_MS = 40;

interface Chord {
  /** The bass's root (a MIDI note, in the upright's range). */
  root: number;
  /** Chord tones over the root, in semitones: the third, fifth, seventh and a colour tone. */
  third: number;
  fifth: number;
  seventh: number;
  colour: number;
}
const ch = (root: number, third: number, fifth: number, seventh: number, colour: number): Chord => ({ root, third, fifth, seventh, colour });
const Gm7 = ch(43, 3, 7, 10, 14);
const C7 = ch(36, 4, 7, 10, 14);
const Fmaj7 = ch(41, 4, 7, 11, 14);
const D7 = ch(38, 4, 7, 10, 13);
const Bbmaj7 = ch(46, 4, 7, 11, 14);
const Bbm6 = ch(46, 3, 7, 9, 14);
const Am7 = ch(45, 3, 7, 10, 14);
const F6 = ch(41, 4, 7, 9, 14);
const FORM: Chord[] = [Gm7, C7, Fmaj7, D7, Gm7, C7, Fmaj7, C7, Bbmaj7, Bbm6, Am7, D7, Gm7, C7, F6, C7];

/** Comping rhythms, in beats into the bar: the Charleston and a few of its cousins. */
const COMPS = [[0, 1 + SWING], [1 + SWING, 3 + SWING], [SWING, 2], [0, 2 + SWING], [1 + SWING]];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class CasinoJazz {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The Settings fader, between the band and the master fade. */
  private level: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private nextBeat = 0;
  private beat = 0;
  private hiss: AudioBufferSourceNode | null = null;

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
    // the band's bus: a gentle roll-off of the top, and a short room echo beside the dry sound
    const warm = c.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 5200;
    warm.connect(this.level);
    this.bus = c.createGain();
    this.bus.connect(warm);
    const echo = c.createDelay(1);
    echo.delayTime.value = 0.23;
    const back = c.createGain();
    back.gain.value = 0.26;
    const dull = c.createBiquadFilter();
    dull.type = "lowpass";
    dull.frequency.value = 2200;
    const wet = c.createGain();
    wet.gain.value = 0.2;
    this.bus.connect(echo);
    echo.connect(dull).connect(back).connect(echo);
    dull.connect(wet).connect(warm);
    // noise for the drums and the record's hiss
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
  }

  /** The Casino Jazz fader, gently curved like the ambience's. */
  private fader() {
    const v = getSoundSettings().jazz;
    return v * v * 0.9;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.level) return;
    this.level.gain.setTargetAtTime(this.fader(), c.currentTime, 0.1);
  }

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
      if (!this.timer) {
        this.nextBeat = now + 0.1;
        this.beat = 0;
        this.startHiss();
        this.timer = window.setInterval(this.tick, TICK_MS);
      }
    } else {
      this.stopAt = now + FADE_S + 0.3;
    }
  }

  private tick = () => {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const now = c.currentTime;
    if (!this.active && now > this.stopAt) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.stopHiss();
      return;
    }
    if (this.nextBeat < now) this.nextBeat = now + 0.05; // back from a suspended context: pick up the beat
    while (this.nextBeat < now + LOOKAHEAD_S) {
      this.playBeat(this.beat, this.nextBeat);
      this.beat += 1;
      this.nextBeat += BEAT;
    }
  };

  /** One beat of the band: the bass and the drums every beat; the keys and the horn from the bar's top. */
  private playBeat(n: number, t: number) {
    const inBar = n % 4;
    const bar = Math.floor(n / 4) % FORM.length;
    const chord = FORM[bar];
    const next = FORM[(bar + 1) % FORM.length];
    // the walking bass
    const walk = inBar === 0 ? chord.root : inBar === 1 ? chord.root + pick([chord.third, chord.fifth]) : inBar === 2 ? chord.root + pick([chord.fifth, chord.seventh - 12, 12]) : next.root + pick([-1, 1]);
    this.bass(walk, t, inBar === 0 ? 1 : 0.85);
    // the drums: the ride on every beat and the swung "a" after two and four, brushes on two and four
    this.ride(t, inBar % 2 === 1 ? 1 : 0.7);
    if (inBar % 2 === 1) {
      this.ride(t + SWING * BEAT, 0.55);
      this.brush(t, 1);
    } else {
      this.brush(t + 0.5 * BEAT, 0.35); // the swirl between the hits
    }
    this.kick(t);
    if (inBar !== 0) return;
    // the keys: shells on this bar's comping rhythm
    for (const at of pick(COMPS)) this.comp(chord, t + at * BEAT, Math.random() < 0.3 ? 0.55 : 0.9);
    // the horn: now and then a phrase, starting on the "and" of one
    if (bar % 4 === 2 && Math.random() < 0.55) this.phrase(chord, t + SWING * BEAT);
  }

  private bass(midi: number, t: number, accent: number) {
    const c = this.ctx!;
    const f = hz(midi);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * accent, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.09 * accent, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 0.98);
    lp.connect(g).connect(this.bus!);
    for (const [type, mul, lvl] of [["triangle", 1, 1], ["sine", 2, 0.25]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = c.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + BEAT);
      o.onended = () => (o.disconnect(), og.disconnect());
    }
    window.setTimeout(() => (lp.disconnect(), g.disconnect()), (t - c.currentTime + BEAT + 0.2) * 1000);
  }

  /** A short burst of filtered noise: the ride, the brushes. */
  private hit(t: number, type: BiquadFilterType, freq: number, q: number, level: number, decay: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.bus!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.02);
    src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
  }

  private ride(t: number, accent: number) {
    this.hit(t, "bandpass", 7200, 1.4, 0.028 * accent, 0.32);
    // the bell's ping in it
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.value = 5120;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.004 * accent, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + 0.27);
    o.onended = () => (o.disconnect(), g.disconnect());
  }

  private brush(t: number, accent: number) {
    this.hit(t, "bandpass", 2600, 0.7, 0.035 * accent, accent > 0.5 ? 0.16 : 0.3);
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + 0.18);
    o.onended = () => (o.disconnect(), g.disconnect());
  }

  /** A three-note shell voiced round middle C: the third, the seventh and the colour tone. */
  private comp(chord: Chord, t: number, accent: number) {
    const c = this.ctx!;
    const base = chord.root % 12 + 48; // the root's pitch class, from C3
    const notes = [chord.third, chord.seventh, chord.colour].map((iv) => {
      let m = base + iv;
      while (m < 55) m += 12;
      while (m > 70) m -= 12;
      return m;
    });
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1900;
    lp.connect(this.bus!);
    const len = BEAT * (0.9 + Math.random() * 0.8);
    for (const m of notes) {
      const f = hz(m);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045 * accent, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.018 * accent, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.5);
      g.connect(lp);
      for (const [mul, lvl] of [[1, 1], [2, 0.18], [4.02, 0.05]]) {
        const o = c.createOscillator();
        o.frequency.value = f * mul;
        const og = c.createGain();
        og.gain.value = lvl;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + len + 0.55);
        o.onended = () => (o.disconnect(), og.disconnect());
      }
      window.setTimeout(() => g.disconnect(), (t - c.currentTime + len + 0.7) * 1000);
    }
    window.setTimeout(() => lp.disconnect(), (t - c.currentTime + len + 0.8) * 1000);
  }

  /** A short muted-trumpet phrase: swung eighths from the chord, a late vibrato on the last note. */
  private phrase(chord: Chord, t: number) {
    const c = this.ctx!;
    const tones = [0, chord.third, chord.fifth, chord.seventh, chord.colour, 12].map((iv) => chord.root % 12 + 60 + iv + (Math.random() < 0.2 ? 12 : 0));
    const n = 3 + Math.floor(Math.random() * 4);
    let at = t;
    let m = pick(tones);
    for (let k = 0; k < n; k++) {
      const long = k === n - 1;
      const dur = long ? BEAT * 1.4 : (k % 2 === 0 ? SWING : 1 - SWING) * BEAT;
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      if (long) {
        const vib = c.createOscillator();
        vib.frequency.value = 5.2;
        const depth = c.createGain();
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(hz(m) * 0.006, at + 0.35);
        vib.connect(depth).connect(o.frequency);
        vib.start(at);
        vib.stop(at + dur + 0.1);
        vib.onended = () => (vib.disconnect(), depth.disconnect());
      }
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1350;
      bp.Q.value = 1.6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.03, at + 0.04);
      g.gain.setValueAtTime(0.03, at + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(bp).connect(g).connect(this.bus!);
      o.start(at);
      o.stop(at + dur + 0.02);
      o.onended = () => (o.disconnect(), bp.disconnect(), g.disconnect());
      at += dur;
      m = pick(tones.filter((x) => Math.abs(x - m) <= 7 && x !== m).concat([m + 2]));
    }
  }

  private startHiss() {
    const c = this.ctx!;
    if (this.hiss) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 4200;
    f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.004;
    src.connect(f).connect(g).connect(this.level!);
    src.start();
    this.hiss = src;
  }

  private stopHiss() {
    try {
      this.hiss?.stop();
    } catch {
      // already stopped
    }
    this.hiss?.disconnect();
    this.hiss = null;
  }
}
