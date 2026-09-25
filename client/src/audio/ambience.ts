import { useEffect } from "react";
import type { MapId } from "@shared/types";
import { getSoundSettings, subscribeSoundSettings } from "./soundSettings";

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

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
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

  /** A looping noise bed through a filter, its gain swayed by a slow LFO. */
  private bed(type: BiquadFilterType, freq: number, q: number, gain: number, lfoHz = 0, lfoDepth = 0) {
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
    src.connect(f).connect(g).connect(this.master!);
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
    this.bed("lowpass", 380, 0.7, 0.22); // the fire's rumble
    this.bed("bandpass", 1600, 0.8, 0.025, 0.4, 0.012); // its hiss
    this.bed("bandpass", 650, 0.6, 0.11, 0.13, 0.05); // the river
    this.bed("bandpass", 2400, 1.2, 0.022, 0.31, 0.012); // its trickle
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
        src.connect(f).connect(g).connect(this.master);
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
