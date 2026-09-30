import { ASSET_VERSION } from "../assetVersion";
import { masterOut } from "./master";
import { crossfade } from "./sound";
import { CAVE_CHANNELS, getSoundSettings, type CaveChannel } from "./soundSettings";
import { cameraFocus } from "../scene/cameraFocus";
import { CAVE_LAKE, CAVERNS_LAYOUT, HEARTH, SURFACE, TERRACES, cavernsSurface, cavernsZoneAt, riverDistance } from "@shared/worlds/caverns";

// The Glimmering Caverns' soundscape and its effects, generated in the browser like every world's
// (no audio files needed). Its own context, five channels on one master (each a Settings fader):
//
//   cavern    the cave's air (a low rumble breathing), the stalactites' drips (a plink falling in
//             pitch, now here now there), the overlook hearth's crackle and pops by how near it is,
//             your footsteps (each ground its own: stone, gravel, mud,
//             sand, travertine, leaf litter, a splash through the fords and the shallows), the
//             bats' squeaks over the mudflats
//   water     each placed by how near you are: the waterfall's roar under the collapse, the
//             stream's babble along its reaches, the lake lapping at its shore
//   crystal   the crystals' resonance: glassy sine clusters swelling and fading, slowly detuned (and
//             ringing far more often down in the Glimmer Rift)
//   steam     the Travertine Terraces' hiss and bubbling, louder as you near their pools
//   music     a sparse, gentle phrase now and then (a kalimba's tines in A minor pentatonic over a
//             soft drone swelling in under it), each zone its own register and pace: glassy and
//             high in the rift, slow and low by the lake
//
// Everything that sounds in the cave goes through a reverb, and each zone answers in its own voice
// (ROOMS: the jungle open to the sky short and dry, the breakdown and the mudflats a hall, the
// overlook and the lake long, the rift deepest): two convolvers, the one not sounding given the new
// zone's impulse and the two cross-faded as you walk in (so the tail never clicks).
//
// Sample slots (docs/caverns-roadmap.md phase 5): every effect, every footstep and every bed is a
// recorded sample when client/public/sounds/caverns/<name>.mp3 is there and named in that folder's
// manifest.json (a JSON list of the names: the effects' below, `step_<ground>`, `bed_<name>`; a bed's
// sample loops in place of its synthesized voices), synthesized otherwise: never an error, and no
// manifest no requests but the one. A Reinforced Pickaxe's hum near the weak spot is a pair of
// sines whose level follows the pointer (setCaveHum). The effects follow the Settings' Effects switch.

export type CaveSfx = "clink" | "crack" | "clang" | "clatter" | "shatter" | "drip" | "smelt" | "anvil";
const SFX_NAMES: CaveSfx[] = ["clink", "crack", "clang", "clatter", "shatter", "drip", "smelt", "anvil"];

/** The grounds a footstep can fall on. */
type Ground = "stone" | "gravel" | "mud" | "sand" | "travertine" | "leaves" | "splash";
const GROUNDS: Ground[] = ["stone", "gravel", "mud", "sand", "travertine", "leaves", "splash"];
/** Each surface of the cave floor (shared/worlds/caverns.ts SURFACE) underfoot. */
const GROUND_OF: Record<number, Ground> = {
  [SURFACE.basecamp]: "stone",
  [SURFACE.jungle]: "leaves",
  [SURFACE.breakdown]: "gravel",
  [SURFACE.mudflats]: "mud",
  [SURFACE.overlook]: "stone",
  [SURFACE.travertine]: "travertine",
  [SURFACE.rift]: "stone",
  [SURFACE.shore]: "sand",
  [SURFACE.bed]: "splash",
  [SURFACE.trail]: "gravel",
  [SURFACE.stream]: "splash",
  [SURFACE.pool]: "splash",
};

/** The beds that take a sample in place of their synthesized voices. */
type BedName = "air" | "steam" | "waterfall" | "stream" | "lake" | "fire";
const BED_NAMES: BedName[] = ["air", "steam", "waterfall", "stream", "lake", "fire"];

/** Each zone's acoustics: the tail's length (s), how quickly it dies (the impulse's time constant, s)
 *  and how much of every sound goes into it. */
const ROOMS: Record<string, { len: number; tau: number; wet: number }> = {
  basecamp: { len: 1.3, tau: 0.2, wet: 0.5 },
  jungle: { len: 0.8, tau: 0.11, wet: 0.3 },
  breakdown: { len: 1.5, tau: 0.24, wet: 0.58 },
  mudflats: { len: 1.3, tau: 0.2, wet: 0.5 },
  terraces: { len: 1.7, tau: 0.28, wet: 0.58 },
  overlook: { len: 2.1, tau: 0.36, wet: 0.66 },
  lake: { len: 2.5, tau: 0.44, wet: 0.7 },
  rift: { len: 3.2, tau: 0.6, wet: 0.82 },
};
const ROOM_FADE_S = 1.4;
/** A zone must hold this long before the reverb follows it (no flicker along a border). */
const ROOM_SETTLE_S = 0.5;

/** The music's scale (A minor pentatonic, as MIDI notes) and each zone's register, pace and voice. */
const PENTA = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const MUSIC: Record<string, { low: number; high: number; gap: [number, number]; step: [number, number]; glass: boolean }> = {
  basecamp: { low: 4, high: 10, gap: [28, 48], step: [0.42, 0.7], glass: false },
  jungle: { low: 3, high: 9, gap: [26, 44], step: [0.36, 0.6], glass: false },
  breakdown: { low: 2, high: 8, gap: [30, 50], step: [0.5, 0.8], glass: false },
  mudflats: { low: 2, high: 8, gap: [30, 52], step: [0.5, 0.85], glass: false },
  terraces: { low: 5, high: 11, gap: [26, 44], step: [0.45, 0.75], glass: false },
  overlook: { low: 4, high: 11, gap: [28, 46], step: [0.5, 0.85], glass: false },
  lake: { low: 1, high: 8, gap: [32, 54], step: [0.7, 1.1], glass: false },
  rift: { low: 8, high: 15, gap: [22, 38], step: [0.38, 0.62], glass: true },
};
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

const FADE_MASTER = 1;

class CavernAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The cave's sound: dry (a share) into the master, and sent into the reverb (the zone's). */
  private dry: GainNode | null = null;
  private send: GainNode | null = null;
  private revs: { conv: ConvolverNode; gain: GainNode; room: string }[] = [];
  private live = 0;
  private room = "";
  private roomSeen = { id: "", at: 0 };
  private impulses = new Map<string, AudioBuffer>();
  private channels: Record<CaveChannel, GainNode> | null = null;
  private steamPlace: GainNode | null = null;
  /** The water's three voices, each at its level for where you stand. */
  private fallPlace: GainNode | null = null;
  private streamPlace: GainNode | null = null;
  private lakePlace: GainNode | null = null;
  /** The overlook hearth's crackle, at its level for where you stand. */
  private firePlace: GainNode | null = null;
  private popAt = 0;
  private noise: AudioBuffer | null = null;
  /** The beds' voices by name (a sample, when it comes, takes a bed's place). */
  private beds = new Map<string, AudioScheduledSourceNode[]>();
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private dripAt = 0;
  private chimeAt = 0;
  private batAt = 0;
  private stepAt = 0;
  private stepFoot = 0;
  private musicAt = 0;
  private last = { x: 0, z: 0, ready: false };
  private hum: { a: OscillatorNode; b: OscillatorNode; g: GainNode } | null = null;
  private samples = new Map<string, AudioBuffer | null>();
  private loading = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(masterOut(c));
    this.dry = c.createGain();
    this.dry.gain.value = 0.7;
    this.dry.connect(this.master);
    // the reverb: two convolvers, one sounding, the other waiting for the next zone's impulse
    this.send = c.createGain();
    this.send.gain.value = 1;
    for (let k = 0; k < 2; k++) {
      const conv = c.createConvolver();
      const gain = c.createGain();
      gain.gain.value = 0;
      this.send.connect(conv);
      conv.connect(gain).connect(this.master);
      this.revs.push({ conv, gain, room: "" });
    }
    this.enterRoom("basecamp", true);
    const channel = (k: CaveChannel) => {
      const g = c.createGain();
      g.gain.value = this.level(k);
      g.connect(this.dry!);
      g.connect(this.send!);
      return g;
    };
    this.channels = { cavern: channel("cavern"), water: channel("water"), crystal: channel("crystal"), steam: channel("steam"), music: channel("music") };
    this.steamPlace = c.createGain();
    this.steamPlace.gain.value = 0.2;
    this.steamPlace.connect(this.channels.steam);
    const place = () => {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.channels!.water);
      return g;
    };
    this.fallPlace = place();
    this.streamPlace = place();
    this.lakePlace = place();
    this.firePlace = c.createGain();
    this.firePlace.gain.value = 0;
    this.firePlace.connect(this.channels.cavern);
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

  /** A channel's level: its fader, gently curved. */
  private level(k: CaveChannel) {
    const v = getSoundSettings()[k];
    return v * v * 0.9;
  }

  refreshVolume() {
    const c = this.ctx;
    if (!c || !this.channels) return;
    for (const k of CAVE_CHANNELS) this.channels[k].gain.setTargetAtTime(this.level(k), c.currentTime, 0.1);
  }

  /** The zone's reverb: its impulse on the convolver not sounding, then the two cross-faded. */
  private enterRoom(id: string, at_once = false) {
    const c = this.ctx;
    const room = ROOMS[id];
    if (!c || !room || id === this.room) return;
    this.room = id;
    let buf = this.impulses.get(id);
    if (!buf) {
      buf = impulse(c, room.len, room.tau);
      this.impulses.set(id, buf);
    }
    const now = c.currentTime;
    const next = at_once ? this.live : 1 - this.live;
    const r = this.revs[next];
    if (r.room !== id) {
      r.conv.buffer = buf;
      r.room = id;
    }
    if (at_once) {
      r.gain.gain.setValueAtTime(room.wet, now);
      return;
    }
    const old = this.revs[this.live];
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setTargetAtTime(0, now, ROOM_FADE_S / 3);
    r.gain.gain.cancelScheduledValues(now);
    r.gain.gain.setTargetAtTime(room.wet, now, ROOM_FADE_S / 3);
    this.live = next;
  }

  private bed(name: BedName, type: BiquadFilterType, freq: number, q: number, gain: number, out: AudioNode, lfoHz = 0, lfoDepth = 0) {
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
    src.connect(f).connect(g).connect(out);
    src.start(c.currentTime, Math.random() * 1.5);
    const list = this.beds.get(name) ?? [];
    list.push(src);
    if (lfoHz > 0) {
      const lfo = c.createOscillator();
      lfo.frequency.value = lfoHz;
      const depth = c.createGain();
      depth.gain.value = lfoDepth;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      list.push(lfo);
    }
    this.beds.set(name, list);
  }

  /** Where each bed plays. */
  private bedOut(name: BedName): AudioNode | null {
    switch (name) {
      case "air":
        return this.channels?.cavern ?? null;
      case "steam":
        return this.steamPlace;
      case "waterfall":
        return this.fallPlace;
      case "stream":
        return this.streamPlace;
      case "lake":
        return this.lakePlace;
      case "fire":
        return this.firePlace;
    }
  }

  private startBeds() {
    if (this.beds.size || !this.channels || !this.steamPlace || !this.fallPlace || !this.streamPlace || !this.lakePlace) return;
    for (const name of BED_NAMES) {
      const sample = this.samples.get(`bed_${name}`);
      if (sample) {
        this.loopSample(name, sample);
        continue;
      }
      switch (name) {
        case "air":
          this.bed(name, "lowpass", 110, 0.7, 0.3, this.channels.cavern, 0.07, 0.12); // the cave breathing
          this.bed(name, "bandpass", 420, 0.6, 0.02, this.channels.cavern, 0.11, 0.012); // air moving in the dark
          break;
        case "steam":
          this.bed(name, "highpass", 3200, 0.6, 0.07, this.steamPlace, 0.4, 0.03); // the terraces' hiss
          this.bed(name, "bandpass", 900, 2.5, 0.05, this.steamPlace, 1.7, 0.04); // its bubbling
          break;
        case "waterfall":
          this.bed(name, "lowpass", 520, 0.5, 0.26, this.fallPlace, 0.23, 0.03); // the waterfall's roar
          this.bed(name, "bandpass", 1900, 0.6, 0.07, this.fallPlace, 0.37, 0.02); // its spray
          break;
        case "stream":
          this.bed(name, "bandpass", 1250, 3.2, 0.07, this.streamPlace, 3.1, 0.04); // the stream's babble
          this.bed(name, "bandpass", 2300, 4.5, 0.035, this.streamPlace, 4.7, 0.025); // its trickle over stones
          break;
        case "lake":
          this.bed(name, "lowpass", 360, 0.9, 0.1, this.lakePlace, 0.16, 0.07); // the lake lapping
          break;
        case "fire":
          if (!this.firePlace) break;
          this.bed(name, "lowpass", 220, 0.7, 0.16, this.firePlace, 0.5, 0.06); // the fire's low roar
          this.bed(name, "bandpass", 2600, 1.2, 0.03, this.firePlace, 9.0, 0.025); // its fizz
          break;
      }
    }
  }

  /** A bed's recording, looped in place of its synthesized voices. */
  private loopSample(name: BedName, buf: AudioBuffer) {
    const c = this.ctx;
    const out = this.bedOut(name);
    if (!c || !out) return;
    this.stopBed(name);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0.5;
    src.connect(g).connect(out);
    src.start(c.currentTime, Math.random() * buf.duration);
    this.beds.set(name, [src]);
  }

  private stopBed(name: string) {
    for (const n of this.beds.get(name) ?? []) {
      try {
        n.stop();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    this.beds.delete(name);
  }

  private stopBeds() {
    for (const name of [...this.beds.keys()]) this.stopBed(name);
  }

  private tick = () => {
    const c = this.ctx;
    if (!c || !this.channels || c.state !== "running") return;
    const now = c.currentTime;
    if (!this.active && now > this.stopAt) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.stopBeds();
      return;
    }
    // the steam louder as you near the terraces' pools (against the west cliff)
    const tx = Math.max(TERRACES.x0, Math.min(TERRACES.x1, cameraFocus.x));
    const tz = Math.max(TERRACES.pools[0].z0, Math.min(TERRACES.pools[TERRACES.pools.length - 1].z1, cameraFocus.z));
    const d = Math.hypot(cameraFocus.x - tx, cameraFocus.z - tz);
    this.steamPlace?.gain.setTargetAtTime(0.15 + 1.6 / (1 + (d / 3) ** 2), now, 0.3);
    // the water: the falls under the collapse, the stream along its reaches, the lake at its shore
    const { x, z } = cameraFocus;
    const fall = CAVERNS_LAYOUT.river.plunge;
    const fd = Math.max(0, Math.hypot(x - fall.x, z - fall.z) - fall.r);
    this.fallPlace?.gain.setTargetAtTime(0.04 + 1.5 / (1 + (fd / 4.5) ** 2), now, 0.3);
    const rd = riverDistance(x, z);
    this.streamPlace?.gain.setTargetAtTime(1.3 / (1 + (rd / 2.5) ** 2), now, 0.3);
    const lq = Math.hypot((x - CAVE_LAKE.x) / CAVE_LAKE.rx, (z - CAVE_LAKE.z) / CAVE_LAKE.rz);
    const ld = Math.max(0, (lq - 1) * Math.min(CAVE_LAKE.rx, CAVE_LAKE.rz));
    this.lakePlace?.gain.setTargetAtTime(0.05 + 1.1 / (1 + (ld / 3) ** 2), now, 0.3);
    // the hearth: its roar and fizz, and now and then a pop, by how near it is
    const hd = Math.hypot(x - HEARTH.x, z - HEARTH.z);
    const near = 1.4 / (1 + (hd / 3.2) ** 2);
    this.firePlace?.gain.setTargetAtTime(near, now, 0.3);
    if (near > 0.08 && now > this.popAt && this.firePlace) {
      this.popAt = now + 0.12 + Math.random() * 0.7;
      this.pop(this.firePlace, 0.5 + Math.random() * 0.5);
    }
    const zone = cavernsZoneAt(x, z)?.id ?? "lake";
    // the zone's own reverb, once it has held a moment
    if (zone !== this.roomSeen.id) this.roomSeen = { id: zone, at: now };
    else if (zone !== this.room && now - this.roomSeen.at >= ROOM_SETTLE_S) this.enterRoom(zone);
    // the stalactites dripping, now here now there
    if (now > this.dripAt) {
      this.dripAt = now + 0.9 + Math.random() * 2.6;
      this.plink(this.channels.cavern, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 1.6);
    }
    // the crystals ringing: a glassy chord swelling and fading
    if (now > this.chimeAt) {
      this.chimeAt = now + (zone === "rift" ? 0.9 + Math.random() * 1.6 : 3 + Math.random() * 4);
      this.chime(this.channels.crystal);
    }
    // the bats over the mudflats: a few squeaks in a flurry, now here now there
    if (zone === "mudflats" && now > this.batAt) {
      this.batAt = now + 1.4 + Math.random() * 3.2;
      this.squeaks(this.channels.cavern, (Math.random() - 0.5) * 1.6);
    }
    // a little music now and then
    if (!this.musicAt) this.musicAt = now + 8 + Math.random() * 7;
    else if (now > this.musicAt) {
      const m = MUSIC[zone] ?? MUSIC.basecamp;
      this.musicAt = now + m.gap[0] + Math.random() * (m.gap[1] - m.gap[0]);
      if (getSoundSettings().music > 0.01) this.phrase(this.channels.music, m);
    }
    // your footsteps, each ground its own, while you walk
    const moved = this.last.ready ? Math.hypot(cameraFocus.x - this.last.x, cameraFocus.z - this.last.z) : 0;
    this.last = { x: cameraFocus.x, z: cameraFocus.z, ready: true };
    if (moved > 0.02 && now > this.stepAt) {
      this.stepAt = now + 0.34;
      this.stepFoot = 1 - this.stepFoot;
      this.footstep(this.channels.cavern, GROUND_OF[cavernsSurface(x, z)] ?? "stone", this.stepFoot ? 0.12 : -0.12);
    }
  };

  /** A drip: a sine falling in pitch, a short noise tick on its front, placed left or right. */
  private plink(out: AudioNode, level: number, pan: number) {
    const c = this.ctx!;
    const t = c.currentTime + 0.02;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    const o = c.createOscillator();
    const f0 = 1400 + Math.random() * 1400;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.2);
    o.onended = () => (o.disconnect(), g.disconnect(), p.disconnect());
  }

  /** A crackle in the fire: a sharp little noise burst, bright or dull. */
  private pop(out: AudioNode, level: number) {
    const c = this.ctx!;
    const t = c.currentTime + 0.01;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1200 + Math.random() * 3200;
    f.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.1);
    src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
  }

  /** A bat's flurry: two to four quick high chirps, each a sine sweeping down. */
  private squeaks(out: AudioNode, pan: number) {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    const n = 2 + Math.floor(Math.random() * 3);
    const f0 = 3600 + Math.random() * 1400;
    for (let k = 0; k < n; k++) {
      const t = c.currentTime + 0.02 + k * (0.055 + Math.random() * 0.03);
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f0 * (1 + 0.04 * k), t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.035);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.05);
      o.onended = () => (o.disconnect(), g.disconnect());
    }
    window.setTimeout(() => p.disconnect(), 600);
  }

  private chime(out: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + 0.05;
    const base = [523.25, 659.25, 783.99, 987.77, 1174.66][Math.floor(Math.random() * 5)];
    for (const [k, mul] of [1, 1.5, 2.01].entries()) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = base * mul;
      o.detune.setValueAtTime(-6 + Math.random() * 12, t);
      const g = c.createGain();
      const peak = 0.018 / (k + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.6 + k * 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 3.3);
      o.onended = () => (o.disconnect(), g.disconnect());
    }
  }

  /** A phrase of the cave's music: three to six notes wandering up and down the scale, a soft drone
   *  swelling in under it; the zone's register and pace, a glassier voice in the rift. */
  private phrase(out: AudioNode, m: (typeof MUSIC)[string]) {
    const c = this.ctx!;
    const t0 = c.currentTime + 0.1;
    const n = 3 + Math.floor(Math.random() * 4);
    let i = m.low + Math.floor(Math.random() * (m.high - m.low + 1));
    let t = t0 + 0.9;
    for (let k = 0; k < n; k++) {
      this.tine(out, midi(PENTA[i]), t, m.glass, k === n - 1 ? 1.6 : 1);
      // the last note now and then a dyad (a fifth, or a third, below)
      if (k === n - 1 && Math.random() < 0.4 && i - 2 >= 0) this.tine(out, midi(PENTA[i - 2]), t + 0.02, m.glass, 0.6);
      t += m.step[0] + Math.random() * (m.step[1] - m.step[0]);
      const move = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
      i = Math.max(m.low, Math.min(m.high, i + move));
    }
    // the drone: the scale's root and fifth, low and soft, a slow swell and a slower ebb
    const end = t + 2.5;
    for (const [f, peak] of [[110, 0.012], [164.81, 0.008]] as const) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = -4 + Math.random() * 8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 2.5);
      g.gain.setValueAtTime(peak, end - 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, end + 3);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(end + 3.1);
      o.onended = () => (o.disconnect(), g.disconnect());
    }
  }

  /** A kalimba's tine (or, `glass`, a glass bell): a sine with a bright partial dying quicker. */
  private tine(out: AudioNode, f: number, t: number, glass: boolean, hold: number) {
    const c = this.ctx!;
    const voice = (freq: number, peak: number, decay: number, type: OscillatorType) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
      o.onended = () => (o.disconnect(), g.disconnect());
    };
    voice(f, 0.05, 1.4 * hold, "sine");
    if (glass) voice(f * 2.01, 0.018, 0.9 * hold, "sine");
    else voice(f * 3.0, 0.012, 0.22, "triangle");
  }

  /** A step on a ground: its recording if there is one, else its own noise (pitched a little each
   *  time, the feet a touch apart). */
  private footstep(out: AudioNode, ground: Ground, pan: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    window.setTimeout(() => p.disconnect(), 700);
    const sample = this.samples.get(`step_${ground}`);
    if (sample) {
      const src = c.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = 0.92 + Math.random() * 0.16;
      const g = c.createGain();
      g.gain.value = 0.55;
      src.connect(g).connect(p);
      src.start(t);
      src.onended = () => (src.disconnect(), g.disconnect());
      return;
    }
    const grain = (at: number, type: BiquadFilterType, freq: number, q: number, peak: number, len: number, attack = 0.006) => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq * (0.9 + Math.random() * 0.2);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(peak, t + at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      src.connect(f).connect(g).connect(p);
      src.start(t + at, Math.random());
      src.stop(t + at + len + 0.02);
      src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
    };
    const knock = (f0: number, f1: number, peak: number, len: number) => {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + len + 0.02);
      o.onended = () => (o.disconnect(), g.disconnect());
    };
    switch (ground) {
      case "stone": // a soft scuff on the rock
        grain(0, "lowpass", 600, 0.7, 0.09, 0.09, 0.008);
        knock(150, 90, 0.03, 0.06);
        break;
      case "gravel": // a crunch: a scatter of little grains
        for (let k = 0; k < 4; k++) grain(k * (0.012 + Math.random() * 0.012), "bandpass", 2600 + Math.random() * 1600, 1.3, 0.05, 0.035, 0.003);
        grain(0, "lowpass", 700, 0.7, 0.05, 0.07);
        break;
      case "mud": // a squelch: a soft suck and a wet slap
        grain(0, "lowpass", 360, 1.2, 0.11, 0.16, 0.03);
        knock(220, 80, 0.04, 0.14);
        grain(0.05, "bandpass", 1100, 2.5, 0.025, 0.06);
        break;
      case "sand": // a hush of sand under the sole
        grain(0, "bandpass", 2400, 0.5, 0.045, 0.14, 0.03);
        break;
      case "travertine": // a hard clack on wet flowstone
        grain(0, "bandpass", 1800, 2.2, 0.08, 0.05, 0.003);
        knock(900, 760, 0.02, 0.05);
        break;
      case "leaves": // leaf litter crackling
        for (let k = 0; k < 3; k++) grain(k * (0.018 + Math.random() * 0.02), "highpass", 3800 + Math.random() * 1500, 0.8, 0.035, 0.05, 0.004);
        grain(0, "lowpass", 500, 0.7, 0.05, 0.08);
        break;
      case "splash": // a foot through shallow water
        grain(0, "bandpass", 1300, 0.9, 0.12, 0.18, 0.01);
        grain(0.04, "highpass", 3500, 0.7, 0.04, 0.12);
        knock(700, 1300, 0.012, 0.08);
        break;
    }
  }

  setActive(on: boolean) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    crossfade(c, this.master.gain, on ? FADE_MASTER : 0);
    if (on) {
      this.loadSamples();
      this.startBeds();
      if (!this.timer) this.timer = window.setInterval(this.tick, 60);
    } else {
      this.stopAt = c.currentTime + 0.8;
      this.setHum(0);
    }
  }

  /** The recorded samples, when there are any (asked for once, those the folder's manifest names): the
   *  effects, the footsteps and the beds (a bed's, arriving, takes its place at once). */
  private loadSamples() {
    const c = this.ctx;
    if (!c || this.loading) return;
    this.loading = true;
    const known = new Set<string>([...SFX_NAMES, ...GROUNDS.map((g) => `step_${g}`), ...BED_NAMES.map((b) => `bed_${b}`)]);
    void (async () => {
      let names: string[] = [];
      try {
        const res = await fetch(`/sounds/caverns/manifest.json?v=${ASSET_VERSION}`);
        if (res.ok && /json/i.test(res.headers.get("content-type") ?? "")) {
          const list: unknown = await res.json();
          if (Array.isArray(list)) names = list.filter((n): n is string => typeof n === "string" && known.has(n));
        }
      } catch {
        // (no manifest: every sound synthesized)
      }
      for (const name of names) this.loadSample(c, name);
    })();
  }

  private loadSample(c: AudioContext, name: string) {
    void (async () => {
      try {
        const res = await fetch(`/sounds/caverns/${name}.mp3?v=${ASSET_VERSION}`);
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !/audio|mpeg|octet-stream/i.test(type)) throw new Error("not a sample");
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        this.samples.set(name, buf);
        if (name.startsWith("bed_") && this.beds.size) this.loopSample(name.slice(4) as BedName, buf);
      } catch {
        this.samples.set(name, null);
      }
    })();
  }

  /** A cave effect through the cavern's reverb (only while you are down here). */
  sfx(kind: CaveSfx, level = 1) {
    const c = this.ctx;
    if (!c || !this.active || !this.channels || !getSoundSettings().effects) return;
    const out = c.createGain();
    out.gain.value = Math.max(0, Math.min(1.2, level));
    out.connect(this.dry!);
    out.connect(this.send!);
    window.setTimeout(() => out.disconnect(), 2500);
    const sample = this.samples.get(kind);
    if (sample) {
      const src = c.createBufferSource();
      src.buffer = sample;
      src.connect(out);
      src.start();
      src.onended = () => src.disconnect();
      return;
    }
    const t = c.currentTime;
    const tone = (f0: number, f1: number, len: number, peak: number, type: OscillatorType = "sine") => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.02);
      o.onended = () => (o.disconnect(), g.disconnect());
    };
    const burst = (type: BiquadFilterType, freq: number, q: number, len: number, peak: number) => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + len + 0.02);
      src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
    };
    switch (kind) {
      case "clink": // the pickaxe near the weak spot: a bright ring off the stone
        tone(2600, 1900, 0.18, 0.12, "triangle");
        tone(3900, 3100, 0.1, 0.05);
        burst("highpass", 3000, 0.7, 0.05, 0.1);
        break;
      case "crack": // right on it: a crack opening, a deep knock under it
        burst("bandpass", 1800, 1.2, 0.09, 0.35);
        tone(180, 70, 0.22, 0.28);
        tone(2400, 1500, 0.12, 0.08, "triangle");
        break;
      case "clang": // skidding off a rock too hard for the pickaxe
        tone(1250, 1180, 0.55, 0.14, "square");
        tone(1870, 1800, 0.45, 0.07, "triangle");
        burst("highpass", 4000, 0.8, 0.06, 0.12);
        break;
      case "clatter": // solid bedrock: dull
        burst("lowpass", 700, 0.8, 0.12, 0.3);
        tone(140, 90, 0.1, 0.12);
        break;
      case "shatter": // the node gives: a burst, pieces raining down
        burst("lowpass", 1400, 0.6, 0.55, 0.5);
        tone(90, 38, 0.6, 0.4);
        for (let k = 0; k < 7; k++) window.setTimeout(() => this.sfx("clatter", 0.35 * level), 90 + k * 70 + Math.random() * 40);
        break;
      case "drip":
        if (this.channels) this.plink(out, 1.2, 0);
        break;
      case "smelt": // the forge taking an ingot: a hiss and a low roar
        burst("highpass", 2500, 0.6, 0.4, 0.12);
        burst("lowpass", 300, 0.7, 0.6, 0.2);
        break;
      case "anvil": // a hammer on the anvil
        tone(1500, 1420, 0.5, 0.16, "triangle");
        tone(620, 600, 0.35, 0.08);
        burst("bandpass", 2400, 1.5, 0.05, 0.12);
        break;
    }
  }

  /** The hum near the weak spot (0 silent .. 1 on it). */
  setHum(level: number) {
    const c = this.ctx;
    if (!c) return;
    if (!this.hum && level > 0 && this.active) {
      const g = c.createGain();
      g.gain.value = 0;
      const a = c.createOscillator();
      const b = c.createOscillator();
      a.frequency.value = 196;
      b.frequency.value = 294;
      a.connect(g);
      b.connect(g);
      g.connect(this.dry!);
      g.connect(this.send!);
      a.start();
      b.start();
      this.hum = { a, b, g };
    }
    if (!this.hum) return;
    const now = c.currentTime;
    const on = this.active && getSoundSettings().effects ? Math.max(0, Math.min(1, level)) : 0;
    this.hum.g.gain.setTargetAtTime(0.05 * on * on, now, 0.05);
    this.hum.b.frequency.setTargetAtTime(294 + 90 * on, now, 0.05);
  }

  /** The zone whose reverb is sounding (for a look from outside). */
  get roomNow() {
    return this.room;
  }
}

/** A room's answer to a sound: stereo noise, a few early reflections (further apart the bigger the
 *  room), then a tail decaying away. */
function impulse(c: AudioContext, seconds: number, tau: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, n, c.sampleRate);
  const spread = Math.max(0.6, Math.min(2, tau / 0.2));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t / tau) * (t < 0.012 ? t / 0.012 : 1);
    }
    for (const [at, amp] of [[0.019, 0.6], [0.031, 0.45], [0.047, 0.35], [0.066, 0.25]] as const) {
      const i = Math.floor((at * spread + ch * 0.003) * c.sampleRate);
      if (i < n) d[i] += amp * (ch ? -1 : 1);
    }
  }
  return buf;
}

let engine: CavernAmbience | null = null;

/** The caverns' soundscape on or off (the world's cross-fade). */
export function setCavernsActive(on: boolean) {
  if (on) engine ??= new CavernAmbience();
  engine?.setActive(on);
}
export function refreshCavernsVolume() {
  engine?.refreshVolume();
}
/** A cave effect (a pickaxe's blow, a shatter, a drip), through the cavern's reverb. */
export function playCaveSfx(kind: CaveSfx, level = 1) {
  engine?.sfx(kind, level);
}
/** The hum near the weak spot (0 .. 1). */
export function setCaveHum(level: number) {
  engine?.setHum(level);
}
/** The zone whose reverb is sounding ("" before the caverns were ever entered). */
export function caveRoom(): string {
  return engine?.roomNow ?? "";
}
