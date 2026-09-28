import { useEffect, useRef } from "react";
import type { MapId } from "@shared/types";
import { AMBIENCE_CHANNELS, getSoundSettings, subscribeSoundSettings, type AmbienceChannel } from "./soundSettings";
import { cameraFocus } from "../scene/cameraFocus";
import { CAMPFIRE_LAYOUT, RIVER_Z, riverSpan } from "@shared/worlds/campfire";
import { CasinoJazz } from "./casinoJazz";
import { CasinoCrowd } from "./casinoCrowd";
import { LoungeFolk } from "./loungeFolk";
import { RainAmbience } from "./rain";
import { WORLD_CROSSFADE_S } from "./sound";
import { masterOut } from "./master";
import { daylight } from "@shared/daynight";
import { forestRiver } from "@shared/worlds/forest";

/** The woods' river, sampled along its meander: the murmur comes from its nearest reach. */
const WOODS_RIVER = forestRiver(4);

// Each world's ambient soundscape, generated in the browser like the radio (no audio files: the
// Activity's sandbox and licensing). The Starlight Campfire's is four layers on one master gain:
//
//   the fire     a low rumble and a soft hiss, with crackles and pops scheduled at random
//   the river    filtered noise swelling and ebbing, a brighter trickle over it
//   the breeze   a low whoosh that comes and goes
//   crickets     little three-pulse chirps, two of them, answering each other left and right
//
// It follows the camp's 24-minute day (shared/daynight.ts): the crickets and an owl's hoot by night,
// birdsong by day, each easing in and out with the light. The Whispering Woods play the same
// soundscape without the fire: the meandering river in the campfire river's place, and a
// woodpecker by day.
//
// Arriving at the campfire fades it in; leaving fades it out (the half-second cross-fade with
// whatever the next world plays: audio/sound.ts). The volume is the Settings panel's Ambience slider. Browsers keep audio
// silent until the page has had a tap or a key; the context waits, suspended, until then.
//
// The fire and the river are placed: each has its own gain and stereo pan, set from where you
// stand (cameraFocus) as you walk about, so the crackle swells as you come to the fire and the
// river's rush comes from its side of the screen (the camera looks from +x +z: screen right is
// along (1, 0, -1)). The breeze and the crickets are all round you.

// a trip hands the world's sound over in the travel curtain's half second (audio/sound.ts)
const FADE_S = WORLD_CROSSFADE_S;

/** The master's level once faded in (the channels' faders set the mix under it). */
const MASTER = 1;

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
  private birdAt = 0;
  private owlAt = 8;
  private peckAt = 5;
  /** Which of the camp's worlds it plays: the campfire (the fire, the river) or the woods (the river). */
  private map: "campfire_night" | "whispering_woods" = "campfire_night";
  private beds: AudioScheduledSourceNode[] = [];
  /** The placed layers: the fire (its beds and crackles) and the river. */
  private fire: { gain: GainNode; pan: StereoPannerNode } | null = null;
  private river: { gain: GainNode; pan: StereoPannerNode } | null = null;
  /** The mixer: a gain per channel (its fader), between its layers and the master. The fire's also
   *  follows the bonfire's fuel: silent once it is out, back as it is relit. */
  private channels: Record<AmbienceChannel, GainNode> | null = null;
  private fuel = 60;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(masterOut(c));
    const channel = () => {
      const g = c.createGain();
      g.connect(this.master!);
      return g;
    };
    this.channels = { fire: channel(), river: channel(), forest: channel() };
    for (const k of AMBIENCE_CHANNELS) this.channels[k].gain.value = this.channelLevel(k);
    const placed = (into: GainNode) => {
      const gain = c.createGain();
      const pan = c.createStereoPanner();
      gain.connect(pan).connect(into);
      return { gain, pan };
    };
    this.fire = placed(this.channels.fire);
    this.river = placed(this.channels.river);
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
    this.bed("lowpass", 300, 0.5, 0.05, 0.05, 0.05, this.channels!.forest); // the breeze
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
    const light = daylight(Date.now());
    const out = this.channels?.forest ?? this.master;
    // birdsong by day: a phrase of quick gliding notes, somewhere round you
    if (now > this.birdAt) {
      this.birdAt = now + 1.4 + Math.random() * 3.2;
      if (Math.random() < light * 0.85) this.bird(c, out, now);
    }
    // an owl by night, now and then
    if (now > this.owlAt) {
      this.owlAt = now + 11 + Math.random() * 16;
      if (Math.random() < (1 - light) * 0.9) this.owl(c, out, now);
    }
    // a woodpecker in the woods by day
    if (now > this.peckAt) {
      this.peckAt = now + 8 + Math.random() * 12;
      if (this.map === "whispering_woods" && Math.random() < light) this.peck(c, out, now);
    }
    // crickets: a three-pulse chirp, alternating sides (by night: they fall quiet as the sun rises)
    if (now > this.cricketAt) {
      this.cricketAt = now + 0.7 + Math.random() * 0.9;
      if (Math.random() > 1 - light * 0.95) return;
      this.cricketSide = -this.cricketSide;
      const pan = c.createStereoPanner();
      pan.pan.value = this.cricketSide * (0.3 + Math.random() * 0.4);
      pan.connect(this.channels?.forest ?? this.master);
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

  /** A bird's phrase: three to six quick notes, each gliding, from one spot round you. */
  private bird(c: AudioContext, out: AudioNode, now: number) {
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.4;
    pan.connect(out);
    const base = 2300 + Math.random() * 1900;
    const n = 3 + Math.floor(Math.random() * 4);
    let t = now + 0.05;
    for (let k = 0; k < n; k++) {
      const len = 0.06 + Math.random() * 0.08;
      const f0 = base * (0.85 + Math.random() * 0.35);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.3 : 0.78), t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.011 + Math.random() * 0.006, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + len + 0.02);
      o.onended = () => (o.disconnect(), g.disconnect());
      t += len + 0.03 + Math.random() * 0.07;
    }
    window.setTimeout(() => pan.disconnect(), (t - now) * 1000 + 300);
  }

  /** An owl's soft "hoo, hoo-hoo" from the dark. */
  private owl(c: AudioContext, out: AudioNode, now: number) {
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.2;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(pan).connect(out);
    const notes = [0, 0.55, 0.85];
    for (const [k, at] of notes.entries()) {
      const t = now + 0.05 + at;
      const len = k === 0 ? 0.42 : 0.26;
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(k === 0 ? 390 : 360, t);
      o.frequency.linearRampToValueAtTime(k === 0 ? 350 : 330, t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.08);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + len + 0.05);
      o.onended = () => (o.disconnect(), g.disconnect());
    }
    window.setTimeout(() => (lp.disconnect(), pan.disconnect()), 1800);
  }

  /** A woodpecker's drumming on a far trunk: a quick run of knocks, slowing a little. */
  private peck(c: AudioContext, out: AudioNode, now: number) {
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.5;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500 + Math.random() * 500;
    bp.Q.value = 3;
    bp.connect(pan).connect(out);
    let t = now + 0.05;
    for (let k = 0; k < 9 + Math.floor(Math.random() * 5); k++) {
      const src = c.createBufferSource();
      src.buffer = this.crackles[k % this.crackles.length];
      const g = c.createGain();
      g.gain.value = 0.08 * (1 - k * 0.04);
      src.connect(g).connect(bp);
      src.start(t);
      src.onended = () => (src.disconnect(), g.disconnect());
      t += 0.055 + k * 0.003;
    }
    window.setTimeout(() => (bp.disconnect(), pan.disconnect()), (t - now) * 1000 + 400);
  }

  /** The fire and the river, placed round where you stand: nearer is louder (never quite silent,
   *  so the camp is still there across the island), and each pans toward its side of the screen.
   *  In the woods: no fire, and the meandering river in the campfire river's place. */
  private place(now: number) {
    if (!this.fire || !this.river) return;
    const x = cameraFocus.x;
    const z = cameraFocus.z;
    // screen right is along (1, 0, -1): how far right of you a point is, in units
    const right = (px: number, pz: number) => ((px - x) - (pz - z)) / Math.SQRT2;
    if (this.map === "whispering_woods") {
      this.fire.gain.gain.setTargetAtTime(0, now, 0.25);
      const [rx, rz, rw] = WOODS_RIVER.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? b : a));
      const dr = Math.max(0, Math.hypot(rx - x, rz - z) - rw);
      this.river.gain.gain.setTargetAtTime(0.35 + 1.4 / (1 + (dr / 3.5) ** 2), now, 0.25);
      this.river.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, right(rx, rz) / 5)), now, 0.25);
      return;
    }
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

  /** Which camp world is playing: the campfire, or the woods (no fire, the river). */
  setMap(map: MapId | null) {
    if (map === "campfire_night" || map === "whispering_woods") this.map = map;
  }

  setActive(on: boolean) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    const now = c.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? MASTER : 0, now + FADE_S);
    if (on) {
      this.startBeds();
      if (!this.timer) this.timer = window.setInterval(this.tick, 60);
    } else {
      this.stopAt = now + FADE_S + 0.2;
    }
  }

  /** A channel's level: its fader, gently curved (a fader's middle should sound like the middle);
   *  the fire's scaled by the bonfire (quieter as it burns low, silent once it is out). */
  private channelLevel(k: AmbienceChannel) {
    const v = getSoundSettings()[k];
    const fire = k === "fire" ? (this.fuel <= 0 ? 0 : 0.45 + 0.55 * Math.min(1, this.fuel / 50)) : 1;
    return v * v * 0.9 * fire;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.channels) return;
    const now = c.currentTime;
    for (const k of AMBIENCE_CHANNELS) {
      const g = this.channels[k].gain;
      g.cancelScheduledValues(now);
      // the fire dies away (or catches) over a couple of seconds; a fader moves at once
      g.setTargetAtTime(this.channelLevel(k), now, k === "fire" ? 0.7 : 0.1);
    }
  }

  /** The bonfire's fuel (0..100): the fire's channel follows it. */
  setFuel(fuel: number) {
    if (fuel === this.fuel) return;
    this.fuel = fuel;
    this.refreshVolume();
  }
}

let campfire: CampfireAmbience | null = null;
let folk: LoungeFolk | null = null;
let jazz: CasinoJazz | null = null;
let crowd: CasinoCrowd | null = null;
let ringCrowd: CasinoCrowd | null = null;
let rain: RainAmbience | null = null;

/** The Velvet Ring's crowd reacting (a hit, a knockdown, a knockout), when it is playing. */
export function ringCrowdRoar(size: number) {
  ringCrowd?.roar(size);
}

/** Plays the world's ambience while you are in it: the Cozy Lounge's folk-jazz trio (quiet while the
 *  lounge's radio plays) and the rain on its windows when it rains, the Starlight Campfire's
 *  soundscape, the Velvet Casino's jazz and its crowd (on both of its floors). Travelling
 *  cross-fades them in half a second (audio/sound.ts): the one you leave fades out as the one you
 *  arrive at fades in. `fuel` is the Campfire's bonfire (its crackle follows it). */
export function useWorldAmbience(mapId: MapId | null, fuel = 60, radioPlaying = false, raining = false) {
  useEffect(() => {
    folk ??= new LoungeFolk();
    folk.setActive(mapId === "cozy_lounge", radioPlaying);
  }, [mapId, radioPlaying]);
  useEffect(() => {
    campfire ??= new CampfireAmbience();
    campfire.setFuel(fuel);
  }, [fuel]);
  // the rain: made only once it first rains while you are in the lounge; a trip cross-fades it, the
  // weather turning rolls it in or out more slowly
  const lastMap = useRef(mapId);
  useEffect(() => {
    const on = mapId === "cozy_lounge" && raining;
    if (on) rain ??= new RainAmbience();
    rain?.setActive(on, lastMap.current !== mapId);
    lastMap.current = mapId;
  }, [mapId, raining]);
  useEffect(() => {
    campfire ??= new CampfireAmbience();
    campfire.setMap(mapId);
    campfire.setActive(mapId === "campfire_night" || mapId === "whispering_woods");
    // the casino's band and crowd (the hall's and the penthouse's) start only once someone has gone there
    const casino = mapId === "velvet_casino" || mapId === "casino_vip";
    if (casino) {
      jazz ??= new CasinoJazz();
      crowd ??= new CasinoCrowd();
    }
    jazz?.setActive(casino);
    crowd?.setActive(casino);
    // the Velvet Ring: its own crowd at ringside (the Casino Crowd fader), and no band
    if (mapId === "boxing_ring") ringCrowd ??= new CasinoCrowd("ring");
    ringCrowd?.setActive(mapId === "boxing_ring");
  }, [mapId]);
  useEffect(
    () =>
      subscribeSoundSettings(() => {
        campfire?.refreshVolume();
        folk?.refreshVolume();
        jazz?.refreshVolume();
        crowd?.refreshVolume();
        ringCrowd?.refreshVolume();
        rain?.refreshVolume();
      }),
    []
  );
  useEffect(
    () => () => {
      campfire?.setActive(false);
      folk?.setActive(false, false);
      jazz?.setActive(false);
      crowd?.setActive(false);
      ringCrowd?.setActive(false);
      rain?.setActive(false, true);
    },
    []
  );
}
