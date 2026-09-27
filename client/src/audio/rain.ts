import { getSoundSettings } from "./soundSettings";
import { WORLD_CROSSFADE_S } from "./sound";
import { masterOut } from "./master";

// The rain on the Cozy Lounge's windows, generated in the browser like the rest (no audio files):
// a soft, close ASMR rain, heard while it rains over the loft (the room's weather, shared by the
// guild) and you are in it. Four layers on one master gain:
//
//   the fall      pink-ish noise through a low-pass: the steady hush of rain on the roof
//   the sheen     a quiet high band over it, swaying: the spray against the glass
//   the patter    tiny taps scheduled at random, panned across: drops on the sills and the panes
//   the drips     now and then a soft, round plink: a drop running off the gutter
//
// The rain arrives and leaves over a couple of seconds (a shower rolling in); a trip in or out of
// the lounge cross-fades it with the other worlds' soundscapes (audio/sound.ts). Its level is the
// Settings panel's Rain fader. Browsers keep audio silent until the page has had a tap or a key; the
// context waits, suspended, until then.

/** How long the rain takes to arrive or clear away when the weather turns (a trip uses the crossfade). */
const WEATHER_FADE_S = 2.2;

export class RainAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private level: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private dripAt = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.level = c.createGain();
    this.level.gain.value = this.fader();
    this.master.connect(this.level).connect(masterOut(c));
    // three seconds of pink-ish noise (a running average tilts white noise down toward the lows)
    this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + 0.03 * w;
      b1 = 0.6 * b1 + 0.4 * w;
      d[i] = (b0 * 3 + b1 * 0.6) * 0.5;
    }
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
  }

  /** The fader, gently curved (its middle should sound like the middle). */
  private fader() {
    const v = getSoundSettings().rain;
    return v * v * 0.9;
  }

  private bed(type: BiquadFilterType, freq: number, q: number, gain: number, lfoHz = 0, lfoDepth = 0) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start(c.currentTime, Math.random() * 2.5);
    this.beds.push(src);
    if (lfoHz > 0) {
      const lfo = c.createOscillator();
      lfo.frequency.value = lfoHz;
      const depth = c.createGain();
      depth.gain.value = lfoDepth;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      this.beds.push(lfo);
    }
  }

  private startBeds() {
    if (this.beds.length) return;
    this.bed("lowpass", 1500, 0.5, 0.34, 0.07, 0.06); // the fall
    this.bed("lowpass", 240, 0.6, 0.12, 0.03, 0.04); // its low body, the roof
    this.bed("bandpass", 5200, 0.7, 0.03, 0.19, 0.015); // the sheen on the glass
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

  /** The scheduled bits: the patter's taps and the gutter's drips. */
  private tick = () => {
    const c = this.ctx;
    if (!c || !this.master || c.state !== "running") return;
    const now = c.currentTime;
    if (!this.active && now > this.stopAt) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.stopBeds();
      return;
    }
    // the patter: a few tiny taps every tick, each a click of noise through a narrow band
    const taps = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < taps; k++) {
      const t = now + Math.random() * 0.06;
      const len = 0.006 + Math.random() * 0.01;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2200 + Math.random() * 4200;
      f.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.07, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      src.connect(f).connect(g).connect(pan).connect(this.master);
      src.start(t, Math.random() * 2.5, len + 0.02);
      src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect(), pan.disconnect());
    }
    // a drip off the gutter: a soft round plink that falls a little in pitch
    if (now > this.dripAt) {
      this.dripAt = now + 0.9 + Math.random() * 2.4;
      const t = now + 0.02;
      const o = c.createOscillator();
      o.type = "sine";
      const pitch = 900 + Math.random() * 700;
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.62, t + 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035 + Math.random() * 0.03, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      const pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 1.2 - 0.6;
      o.connect(g).connect(pan).connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
      o.onended = () => (o.disconnect(), g.disconnect(), pan.disconnect());
    }
  };

  /** Rain on (it is raining over the lounge and you are there) or off. `trip`: the change is a trip
   *  between worlds (the half-second crossfade), not the weather turning (a slower roll in or out). */
  setActive(on: boolean, trip = false) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    if (on === this.active) return;
    this.active = on;
    const fade = trip ? WORLD_CROSSFADE_S : WEATHER_FADE_S;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? 1 : 0, now + fade);
    if (on) {
      this.startBeds();
      if (!this.timer) this.timer = window.setInterval(this.tick, 70);
    } else {
      this.stopAt = now + fade + 0.2;
    }
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.level) return;
    this.level.gain.setTargetAtTime(this.fader(), c.currentTime, 0.1);
  }
}
