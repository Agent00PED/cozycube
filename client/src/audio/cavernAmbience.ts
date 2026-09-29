import { ASSET_VERSION } from "../assetVersion";
import { masterOut } from "./master";
import { crossfade } from "./sound";
import { CAVE_CHANNELS, getSoundSettings, type CaveChannel } from "./soundSettings";
import { cameraFocus } from "../scene/cameraFocus";
import { TERRACES } from "@shared/worlds/caverns";

// The Glimmering Caverns' soundscape and its effects, generated in the browser like every world's
// (no audio files needed). Its own context, three channels on one master (each a Settings fader):
//
//   cavern    the cave's air (a low rumble breathing), the stalactites' drips (a plink falling in
//             pitch, now here now there), your footsteps on the stone as you walk
//   crystal   the crystals' resonance: glassy sine clusters swelling and fading, slowly detuned
//   steam     the Travertine Terraces' hiss and bubbling, louder as you near their pools
//
// Everything that sounds in the cave (the drips, the footsteps, a pickaxe's blow) goes through a
// ConvolverNode: an impulse response made here, a decay tail of about 1.2 s with a few early
// reflections off the walls, so the cavern answers every sound. The effects (the pickaxe's clink on
// the weak spot, its dull clatter on bedrock, the clang of a deflected blow, a rock's crack and its
// shatter, the drip's plink) are recorded samples when client/public/sounds/caverns/<name>.mp3 are
// there, synthesized otherwise (oscillators' pitch drops, noise bursts through filters): never an
// error. A Reinforced Pickaxe's hum near the weak spot is a pair of sines whose level follows the
// pointer (setCaveHum). The effects follow the Settings' Effects switch.

export type CaveSfx = "clink" | "crack" | "clang" | "clatter" | "shatter" | "drip" | "smelt" | "anvil";
const SAMPLE_NAMES: CaveSfx[] = ["clink", "crack", "clang", "clatter", "shatter", "drip"];

const FADE_MASTER = 1;

class CavernAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  /** The cave's sound: dry (a share) and wet (through the reverb) into the master. */
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private channels: Record<CaveChannel, GainNode> | null = null;
  private steamPlace: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private active = false;
  private stopAt = 0;
  private dripAt = 0;
  private chimeAt = 0;
  private stepAt = 0;
  private last = { x: 0, z: 0, ready: false };
  private hum: { a: OscillatorNode; b: OscillatorNode; g: GainNode } | null = null;
  private samples = new Map<CaveSfx, AudioBuffer | null>();
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
    // the reverb: a stereo impulse, early reflections then a tail decaying over about 1.2 s
    this.reverb = c.createConvolver();
    this.reverb.buffer = impulse(c, 1.35, 0.2);
    this.dry = c.createGain();
    this.dry.gain.value = 0.7;
    this.wet = c.createGain();
    this.wet.gain.value = 0.55;
    this.dry.connect(this.master);
    this.reverb.connect(this.wet).connect(this.master);
    const channel = (k: CaveChannel) => {
      const g = c.createGain();
      g.gain.value = this.level(k);
      g.connect(this.dry!);
      g.connect(this.reverb!);
      return g;
    };
    this.channels = { cavern: channel("cavern"), crystal: channel("crystal"), steam: channel("steam") };
    this.steamPlace = c.createGain();
    this.steamPlace.gain.value = 0.2;
    this.steamPlace.connect(this.channels.steam);
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

  private bed(type: BiquadFilterType, freq: number, q: number, gain: number, out: AudioNode, lfoHz = 0, lfoDepth = 0) {
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
    if (this.beds.length || !this.channels || !this.steamPlace) return;
    this.bed("lowpass", 110, 0.7, 0.3, this.channels.cavern, 0.07, 0.12); // the cave breathing
    this.bed("bandpass", 420, 0.6, 0.02, this.channels.cavern, 0.11, 0.012); // air moving in the dark
    this.bed("highpass", 3200, 0.6, 0.07, this.steamPlace, 0.4, 0.03); // the terraces' hiss
    this.bed("bandpass", 900, 2.5, 0.05, this.steamPlace, 1.7, 0.04); // its bubbling
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
    // the stalactites dripping, now here now there
    if (now > this.dripAt) {
      this.dripAt = now + 0.9 + Math.random() * 2.6;
      this.plink(this.channels.cavern, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 1.6);
    }
    // the crystals ringing: a glassy chord swelling and fading
    if (now > this.chimeAt) {
      this.chimeAt = now + 3 + Math.random() * 4;
      this.chime(this.channels.crystal);
    }
    // your footsteps on the stone, while you walk
    const moved = this.last.ready ? Math.hypot(cameraFocus.x - this.last.x, cameraFocus.z - this.last.z) : 0;
    this.last = { x: cameraFocus.x, z: cameraFocus.z, ready: true };
    if (moved > 0.02 && now > this.stepAt) {
      this.stepAt = now + 0.34;
      this.footstep(this.channels.cavern);
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

  private footstep(out: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 520 + Math.random() * 160;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.12);
    src.onended = () => (src.disconnect(), f.disconnect(), g.disconnect());
  }

  setActive(on: boolean) {
    const c = on ? this.ensure() : this.ctx;
    if (!c || !this.master) return;
    this.active = on;
    crossfade(c, this.master.gain, on ? FADE_MASTER : 0);
    if (on) {
      this.startBeds();
      this.loadSamples();
      if (!this.timer) this.timer = window.setInterval(this.tick, 60);
    } else {
      this.stopAt = c.currentTime + 0.8;
      this.setHum(0);
    }
  }

  /** The recorded samples, when there are any (asked for once). */
  private loadSamples() {
    const c = this.ctx;
    if (!c || this.loading) return;
    this.loading = true;
    for (const name of SAMPLE_NAMES) {
      void (async () => {
        try {
          const res = await fetch(`/sounds/caverns/${name}.mp3?v=${ASSET_VERSION}`);
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || !/audio|mpeg|octet-stream/i.test(type)) throw new Error("not a sample");
          this.samples.set(name, await c.decodeAudioData(await res.arrayBuffer()));
        } catch {
          this.samples.set(name, null);
        }
      })();
    }
  }

  /** A cave effect through the cavern's reverb (only while you are down here). */
  sfx(kind: CaveSfx, level = 1) {
    const c = this.ctx;
    if (!c || !this.active || !this.channels || !getSoundSettings().effects) return;
    const out = c.createGain();
    out.gain.value = Math.max(0, Math.min(1.2, level));
    out.connect(this.dry!);
    out.connect(this.reverb!);
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
      g.connect(this.reverb!);
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
}

/** A room's answer to a sound: stereo noise, a few early reflections, then a tail decaying away. */
function impulse(c: AudioContext, seconds: number, tau: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t / tau) * (t < 0.012 ? t / 0.012 : 1);
    }
    for (const [at, amp] of [[0.019, 0.6], [0.031, 0.45], [0.047, 0.35], [0.066, 0.25]] as const) {
      const i = Math.floor((at + ch * 0.003) * c.sampleRate);
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
