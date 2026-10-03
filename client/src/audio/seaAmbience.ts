import { isCampDay } from "@shared/daynight";
import { getSoundSettings } from "./soundSettings";
import { WORLD_CROSSFADE_S } from "./sound";
import { masterOut } from "./master";

// The sea, for Sunset Beach, the Open Sea and the Hidden Cove, generated in the browser like the rest
// (no audio files). One engine, three places:
//
//   the beach   the surf's hush rising and falling, a wave breaking on the sand every few seconds
//               and drawing back, gulls calling by day
//   the sea     the same swell with no shore to break on: a slow slap against the hull, a gull now
//               and then by day, the rigging's creak
//   the cove    the sea heard through rock: a low hush, the lagoon lapping, drips off the roof
//
// Two faders, both ones the Settings panel already has: the water (the campfire's River fader, shown
// on these maps as Sea & Waves) and the wildlife (Forest & Crickets, shown as Gulls & Drips). A trip
// cross-fades it with the other worlds' soundscapes (audio/sound.ts). Browsers keep audio silent
// until the page has had a tap or a key; the context waits, suspended, until then.

export type SeaPlace = "beach" | "sea" | "cove";

export class SeaAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private water: GainNode | null = null;
  private life: GainNode | null = null;
  private music: GainNode | null = null;
  private musicAt = 0;
  private noise: AudioBuffer | null = null;
  private beds: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private place: SeaPlace | null = null;
  private stopAt = 0;
  private waveAt = 0;
  private lifeAt = 0;
  private creakAt = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(masterOut(c));
    this.water = c.createGain();
    this.life = c.createGain();
    this.music = c.createGain();
    this.water.connect(this.master);
    this.life.connect(this.master);
    this.music.connect(this.master);
    this.refreshVolume();
    // four seconds of pink-ish noise (a running average tilts white noise down toward the lows)
    this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.985 * b0 + 0.015 * w;
      b1 = 0.7 * b1 + 0.3 * w;
      d[i] = (b0 * 4 + b1 * 0.5) * 0.5;
    }
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
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
    src.connect(f).connect(g).connect(this.water!);
    src.start(c.currentTime, Math.random() * 3.5);
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

  private startBeds(place: SeaPlace) {
    this.stopBeds();
    if (place === "cove") {
      this.bed("lowpass", 260, 0.6, 0.3, 0.05, 0.1); // the sea beyond the rock
      this.bed("bandpass", 900, 0.8, 0.035, 0.13, 0.02); // the lagoon's sheen
    } else {
      this.bed("lowpass", 620, 0.5, place === "sea" ? 0.2 : 0.24, 0.085, 0.11); // the swell's hush, in and out
      this.bed("lowpass", 150, 0.6, 0.2, 0.05, 0.07); // its low body
      this.bed("bandpass", 3400, 0.7, 0.02, 0.11, 0.012); // the spray
      if (place === "beach") this.bed("bandpass", 2100, 0.5, 0.012, 0.23, 0.01); // the breeze in the palms' fronds
    }
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

  /** A wave: noise swelling as it runs in, breaking, hissing back down the sand (or, at sea and in the
   *  cove, a shorter slap or lap). */
  private wave(now: number, place: SeaPlace) {
    const c = this.ctx!;
    const rise = place === "beach" ? 1.1 + Math.random() * 0.7 : 0.35 + Math.random() * 0.3;
    const fall = place === "beach" ? 2.2 + Math.random() * 1.2 : 0.9 + Math.random() * 0.6;
    const peak = (place === "beach" ? 0.5 : place === "sea" ? 0.26 : 0.16) * (0.7 + Math.random() * 0.5);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.6;
    const top = place === "cove" ? 700 : 1500 + Math.random() * 900;
    f.frequency.setValueAtTime(place === "cove" ? 300 : 420, now);
    f.frequency.exponentialRampToValueAtTime(top, now + rise);
    f.frequency.exponentialRampToValueAtTime(place === "cove" ? 420 : 2600, now + rise + fall);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + rise);
    g.gain.exponentialRampToValueAtTime(0.0001, now + rise + fall);
    const pan = c.createStereoPanner();
    const side = Math.random() * 1.2 - 0.6;
    pan.pan.setValueAtTime(side, now);
    pan.pan.linearRampToValueAtTime(-side * 0.6, now + rise + fall);
    src.connect(f).connect(g).connect(pan).connect(this.water!);
    src.start(now, Math.random() * 0.5, rise + fall + 0.1);
    src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect(), pan.disconnect());
  }

  /** A gull: two or three falling cries, each a bright tone bent down (by day, on the beach and at sea). */
  private gull(now: number) {
    const c = this.ctx!;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.life!);
    const cries = 2 + Math.floor(Math.random() * 3);
    const base = 1500 + Math.random() * 500;
    const far = 0.35 + Math.random() * 0.65;
    for (let k = 0; k < cries; k++) {
      const t = now + k * (0.26 + Math.random() * 0.08);
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(base * (1.12 - k * 0.03), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.78, t + 0.2);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = base * 1.1;
      f.Q.value = 2.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * far, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f).connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.25);
      o.onended = () => (o.disconnect(), f.disconnect(), g.disconnect());
    }
    window.setTimeout(() => pan.disconnect(), 2500);
  }

  /** A drip off the cove's roof into the lagoon: a soft round plink falling a little in pitch. */
  private drip(now: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sine";
    const pitch = 700 + Math.random() * 900;
    o.frequency.setValueAtTime(pitch, now);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.6, now + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    o.connect(g).connect(pan).connect(this.life!);
    o.start(now);
    o.stop(now + 0.35);
    o.onended = () => (o.disconnect(), g.disconnect(), pan.disconnect());
  }

  /** The bar's ukulele after dusk: four chords strummed slow and soft, each string plucked a little
   *  after the last (C, A minor, F, G7: the oldest beach tune there is), then quiet a while. */
  private ukulele(now: number) {
    const c = this.ctx!;
    const chords = [
      [392.0, 261.63, 329.63, 440.0],
      [440.0, 261.63, 329.63, 440.0],
      [440.0, 261.63, 349.23, 440.0],
      [392.0, 293.66, 349.23, 493.88],
    ];
    const beat = 0.62;
    const pan = c.createStereoPanner();
    pan.pan.value = -0.25;
    pan.connect(this.music!);
    let k = 0;
    for (let bar = 0; bar < 2; bar++)
      for (const chord of chords) {
        for (const down of [0, 1]) {
          const t0 = now + k * beat + down * beat * 0.5;
          const strings = down ? [...chord].reverse() : chord;
          strings.forEach((f, i) => {
            const t = t0 + i * 0.018;
            const o = c.createOscillator();
            o.type = "triangle";
            o.frequency.value = f;
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime((down ? 0.022 : 0.034) * (0.85 + Math.random() * 0.3), t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
            o.connect(g).connect(pan);
            o.start(t);
            o.stop(t + 0.46);
            o.onended = () => (o.disconnect(), g.disconnect());
          });
        }
        k++;
      }
    window.setTimeout(() => pan.disconnect(), (k * beat + 1.5) * 1000);
    return k * beat;
  }

  /** The boat's timbers: a slow, low creak as she rides the swell. */
  private creak(now: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sawtooth";
    const pitch = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(pitch, now);
    o.frequency.linearRampToValueAtTime(pitch * (1.15 + Math.random() * 0.2), now + 0.5);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 420;
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.03, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(f).connect(g).connect(this.water!);
    o.start(now);
    o.stop(now + 0.65);
    o.onended = () => (o.disconnect(), f.disconnect(), g.disconnect());
  }

  private tick = () => {
    const c = this.ctx;
    if (!c || !this.master || c.state !== "running") return;
    const now = c.currentTime;
    const place = this.place;
    if (!place) {
      if (now > this.stopAt) {
        window.clearInterval(this.timer);
        this.timer = 0;
        this.stopBeds();
      }
      return;
    }
    if (now > this.waveAt) {
      this.waveAt = now + (place === "beach" ? 4.5 + Math.random() * 4 : place === "sea" ? 2.6 + Math.random() * 3 : 3.5 + Math.random() * 4);
      this.wave(now + 0.05, place);
    }
    if (now > this.lifeAt) {
      if (place === "cove") {
        this.lifeAt = now + 1.4 + Math.random() * 3.5;
        this.drip(now + 0.05);
      } else {
        this.lifeAt = now + (place === "beach" ? 8 : 14) + Math.random() * 14;
        if (isCampDay(Date.now())) this.gull(now + 0.05);
      }
    }
    if (place === "beach" && now > this.musicAt) {
      // (the bar plays from dusk to dawn)
      this.musicAt = now + 20 + Math.random() * 14;
      if (!isCampDay(Date.now())) this.musicAt += this.ukulele(now + 0.1);
    }
    if (place === "sea" && now > this.creakAt) {
      this.creakAt = now + 5 + Math.random() * 9;
      this.creak(now + 0.05);
    }
  };

  /** Which of the sea's places you are in (null: none of them: it fades out). */
  setPlace(place: SeaPlace | null) {
    const c = place ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    if (place === this.place) return;
    const was = this.place;
    this.place = place;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (place) {
      // (from one of its places to another: a dip while the beds change)
      if (was) g.linearRampToValueAtTime(0.25, now + WORLD_CROSSFADE_S * 0.5);
      g.linearRampToValueAtTime(1, now + WORLD_CROSSFADE_S);
      this.startBeds(place);
      this.waveAt = now + 0.8;
      this.lifeAt = now + 3 + Math.random() * 5;
      this.creakAt = now + 4;
      this.musicAt = now + 5;
      if (!this.timer) this.timer = window.setInterval(this.tick, 200);
    } else {
      g.linearRampToValueAtTime(0, now + WORLD_CROSSFADE_S);
      this.stopAt = now + WORLD_CROSSFADE_S + 0.3;
    }
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.water || !this.life || !this.music) return;
    const s = getSoundSettings();
    this.water.gain.setTargetAtTime(s.river * s.river * 1.1, c.currentTime, 0.1);
    this.life.gain.setTargetAtTime(s.forest * s.forest * 1.2, c.currentTime, 0.1);
    this.music.gain.setTargetAtTime(s.guitar * s.guitar * 1.6, c.currentTime, 0.1);
  }
}
