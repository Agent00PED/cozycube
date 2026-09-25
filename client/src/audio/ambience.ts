import { useEffect } from "react";
import type { MapId } from "@shared/types";
import { getSoundSettings, subscribeSoundSettings } from "./soundSettings";
import { cameraFocus } from "../scene/cameraFocus";
import { CAMPFIRE_LAYOUT, RIVER_Z, riverSpan } from "@shared/worlds/campfire";

// Each world's ambient soundscape, generated in the browser like the radio (no audio files: the
// Activity's sandbox and licensing). The Starlight Campfire's is four layers on one master gain:
//
//   the fire     a low rumble and a soft hiss, with crackles and pops scheduled at random
//   the river    filtered noise swelling and ebbing, a brighter trickle over it
//   the breeze   a low whoosh that comes and goes
//   crickets     little three-pulse chirps, two of them, answering each other left and right
//
// Arriving at the campfire fades it in; leaving fades it out (a slow cross-fade with whatever the
// next world plays). The volume is the Settings panel's Ambience slider. Browsers keep audio
// silent until the page has had a tap or a key; the context waits, suspended, until then.
//
// The fire and the river are placed: each has its own gain and stereo pan, set from where you
// stand (cameraFocus) as you walk about, so the crackle swells as you come to the fire and the
// river's rush comes from its side of the screen (the camera looks from +x +z: screen right is
// along (1, 0, -1)). The breeze and the crickets are all round you.

const FADE_S = 1.8;

class CampfireAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crackles: AudioBuffer[] = [];
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private cricketAt = 0;
  private cricketSide = 1;
  private beds: AudioScheduledSourceNode[] = [];
  /** The placed layers: the fire (its beds and crackles) and the river. */
  private fire: { gain: GainNode; pan: StereoPannerNode } | null = null;
  private river: { gain: GainNode; pan: StereoPannerNode } | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    const placed = () => {
      const gain = c.createGain();
      const pan = c.createStereoPanner();
      gain.connect(pan).connect(this.master!);
      return { gain, pan };
    };
    this.fire = placed();
    this.river = placed();
    // two seconds of white noise, looped by every bed
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a handful of crackles: very short noise bursts with a sharp decay
    for (let k = 0; k < 6; k++) {
      const len = Math.floor(c.sampleRate * (0.012 + Math.random() * 0.035));
      const b = c.createBuffer(1, len, c.sampleRate);
      const x = b.getChannelData(0);
      for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      this.crackles.push(b);
    }
    const unlock = () => {
      if (c.state === "suspended") void c.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return c;
  }

  /** A looping noise bed through a filter, its gain swayed by a slow LFO, into `out` (the master,
   *  or a placed layer). */
  private bed(type: BiquadFilterType, freq: number, q: number, gain: number, lfoHz = 0, lfoDepth = 0, out: AudioNode = this.master!) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start(c.currentTime, Math.random() * 1.5);
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
    this.bed("lowpass", 380, 0.7, 0.22, 0, 0, this.fire!.gain); // the fire's rumble
    this.bed("bandpass", 1600, 0.8, 0.025, 0.4, 0.012, this.fire!.gain); // its hiss
    this.bed("bandpass", 650, 0.6, 0.11, 0.13, 0.05, this.river!.gain); // the river
    this.bed("bandpass", 2400, 1.2, 0.022, 0.31, 0.012, this.river!.gain); // its trickle
    this.bed("lowpass", 300, 0.5, 0.05, 0.05, 0.05); // the breeze
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

  /** The scheduled bits: the fire's crackles and the crickets' chirps. */
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
    this.place(now);
    // crackles: now and then one, sometimes a quick run of them
    if (Math.random() < 0.28) {
      const n = Math.random() < 0.2 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (let k = 0; k < n; k++) {
        const src = c.createBufferSource();
        src.buffer = this.crackles[Math.floor(Math.random() * this.crackles.length)];
        const f = c.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 1400 + Math.random() * 2800;
        const g = c.createGain();
        g.gain.value = 0.05 + Math.random() * (Math.random() < 0.1 ? 0.35 : 0.14);
        src.connect(f).connect(g).connect(this.fire!.gain);
        src.start(now + k * (0.02 + Math.random() * 0.05) + Math.random() * 0.05);
        src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
      }
    }
    // crickets: a three-pulse chirp, alternating sides
    if (now > this.cricketAt) {
      this.cricketAt = now + 0.7 + Math.random() * 0.9;
      this.cricketSide = -this.cricketSide;
      const pan = c.createStereoPanner();
      pan.pan.value = this.cricketSide * (0.3 + Math.random() * 0.4);
      pan.connect(this.master);
      const pitch = this.cricketSide > 0 ? 4550 : 4250;
      const level = 0.012 + Math.random() * 0.01;
      for (let k = 0; k < 3; k++) {
        const t = now + 0.05 + k * 0.075;
        const o = c.createOscillator();
        o.frequency.value = pitch + Math.random() * 60;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        o.connect(g).connect(pan);
        o.start(t);
        o.stop(t + 0.05);
        o.onended = () => (o.disconnect(), g.disconnect());
      }
      window.setTimeout(() => pan.disconnect(), 800);
    }
  };

  /** The fire and the river, placed round where you stand: nearer is louder (never quite silent,
   *  so the camp is still there across the island), and each pans toward its side of the screen. */
  private place(now: number) {
    if (!this.fire || !this.river) return;
    const x = cameraFocus.x;
    const z = cameraFocus.z;
    // screen right is along (1, 0, -1): how far right of you a point is, in units
    const right = (px: number, pz: number) => ((px - x) - (pz - z)) / Math.SQRT2;
    const f = CAMPFIRE_LAYOUT.fire;
    const df = Math.hypot(f.x - x, f.z - z);
    this.fire.gain.gain.setTargetAtTime(0.25 + 0.95 / (1 + (df / 3.5) ** 2), now, 0.25);
    this.fire.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, right(f.x, f.z) / 6)), now, 0.25);
    // the river's nearest reach: its middle at your depth along it (or its nearer end)
    const rz = Math.max(RIVER_Z.from + 0.5, Math.min(RIVER_Z.to - 0.5, z));
    const span = riverSpan(rz) ?? { x0: 7, x1: 8 };
    const rx = (span.x0 + span.x1) / 2;
    const dr = Math.max(0, Math.hypot(rx - x, rz - z) - (span.x1 - span.x0) / 2);
    this.river.gain.gain.setTargetAtTime(0.2 + 1.0 / (1 + (dr / 3) ** 2), now, 0.25);
    this.river.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, right(rx, rz) / 5)), now, 0.25);
  }

  setActive(on: boolean) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? this.level() : 0, now + FADE_S);
    if (on) {
      this.startBeds();
      if (!this.timer) this.timer = window.setInterval(this.tick, 60);
    } else {
      this.stopAt = now + FADE_S + 0.2;
    }
  }

  /** The master level: the Ambience slider, gently curved (a slider's middle should sound like the middle). */
  private level() {
    const v = getSoundSettings().ambience;
    return v * v * 0.9;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.master || !this.active) return;
    const now = c.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.level(), now, 0.1);
  }
}

let campfire: CampfireAmbience | null = null;

/** Plays the world's ambience while you are in it (only the Starlight Campfire has one so far). */
export function useWorldAmbience(mapId: MapId | null) {
  useEffect(() => {
    campfire ??= new CampfireAmbience();
    campfire.setActive(mapId === "campfire_night");
  }, [mapId]);
  useEffect(() => subscribeSoundSettings(() => campfire?.refreshVolume()), []);
  useEffect(() => () => campfire?.setActive(false), []);
}
