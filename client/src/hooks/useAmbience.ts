import { useCallback, useEffect, useState } from "react";
import type { MapId } from "@shared/types";
import { bgmBus, getAudioContext, getAudioSettings, isUnlocked, setAudioSettings, subscribeAudioSettings } from "../audio/SoundManager";

// Per-map soundscapes, synthesised with WebAudio instead of shipped as audio files: a few
// oscillators and a noise buffer cost nothing to download and let each bed be shaped in code.
//
//   Lounge   – whichever record is on the turntable (three little lofi loops), or soft rain on
//              the window when it is off, with a coffee machine bubbling now and then.
//   Campfire – a bed of fire hiss, crackles and pops, and crickets.
//   Beach    – surf that breathes in and out, and a sea breeze.
//   Casino   – a dim little jazz trio (walking bass, brushed snare, ride, soft keys), a low
//              murmur of the room, and the odd clink of chips.
//
// It starts muted. Browsers block audio until a gesture anyway, and an Activity that starts
// making noise the moment it opens is the kind of thing people close the tab over.

type Bed = { stop: () => void };
/** Seconds the outgoing and incoming soundscapes overlap on fast travel. */
const CROSSFADE_S = 1.2;

let sharedNoise: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  sharedNoise = buffer;
  return buffer;
}

function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;
  return source;
}

/** Collects everything a bed starts, so stopping it is one call. */
function bedScope() {
  const sources: (AudioScheduledSourceNode | AudioNode)[] = [];
  const timers: number[] = [];
  return {
    keep<T extends AudioScheduledSourceNode | AudioNode>(node: T): T {
      sources.push(node);
      return node;
    },
    every(ms: () => number, fn: () => void) {
      const loop = () => {
        fn();
        timers.push(window.setTimeout(loop, ms()));
      };
      timers.push(window.setTimeout(loop, ms()));
    },
    stop() {
      timers.forEach((t) => window.clearTimeout(t));
      for (const node of sources) {
        try {
          if ("stop" in node) (node as AudioScheduledSourceNode).stop();
        } catch {
          /* already stopped */
        }
        node.disconnect();
      }
    },
  };
}

/** Surf: filtered noise whose cutoff and gain swell like waves; plus a thin, high breeze. */
function beachBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const surf = scope.keep(noiseSource(ctx));
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  const swell = ctx.createGain();
  swell.gain.value = 0.35;
  const lfo = scope.keep(ctx.createOscillator());
  lfo.frequency.value = 0.11;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.22;
  const cutoffLfo = ctx.createGain();
  cutoffLfo.gain.value = 260;
  lfo.connect(lfoGain).connect(swell.gain);
  lfo.connect(cutoffLfo).connect(filter.frequency);
  surf.connect(filter).connect(swell).connect(out);

  // sea breeze: band-passed noise drifting in pitch and level on its own slow clock
  const wind = scope.keep(noiseSource(ctx));
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 900;
  windFilter.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  const gust = scope.keep(ctx.createOscillator());
  gust.frequency.value = 0.07;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 0.035;
  gust.connect(gustDepth).connect(windGain.gain);
  wind.connect(windFilter).connect(windGain).connect(out);

  surf.start();
  lfo.start();
  wind.start();
  gust.start();
  return scope;
}

/** A stream close by: soft, bubbling filtered noise with a slow ripple in its tone. */
function streamBed(ctx: AudioContext, out: GainNode, level = 0.06): Bed {
  const scope = bedScope();
  const water = scope.keep(noiseSource(ctx));
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1500;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = level;
  const ripple = scope.keep(ctx.createOscillator());
  ripple.frequency.value = 0.35;
  const rippleDepth = ctx.createGain();
  rippleDepth.gain.value = 400;
  ripple.connect(rippleDepth).connect(f.frequency);
  water.connect(f).connect(g).connect(out);
  water.start();
  ripple.start();
  return scope;
}

/** A hearth: a low warm hiss with sparse, softer crackles than the open campfire. */
function hearthBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const hiss = scope.keep(noiseSource(ctx));
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  const bed = ctx.createGain();
  bed.gain.value = 0.07;
  hiss.connect(filter).connect(bed).connect(out);
  hiss.start();
  scope.every(
    () => 260 + Math.random() * 1400,
    () => {
      const now = ctx.currentTime;
      const pop = noiseSource(ctx);
      const popFilter = ctx.createBiquadFilter();
      popFilter.type = "bandpass";
      popFilter.frequency.value = 1200 + Math.random() * 1600;
      const popGain = ctx.createGain();
      popGain.gain.setValueAtTime(0.0001, now);
      popGain.gain.exponentialRampToValueAtTime(0.04 + Math.random() * 0.05, now + 0.005);
      popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      pop.connect(popFilter).connect(popGain).connect(out);
      pop.start(now);
      pop.stop(now + 0.09);
    }
  );
  return scope;
}

/** Campfire: a hiss, randomly timed crackles, and a field of crickets. */
function campfireBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const hiss = scope.keep(noiseSource(ctx));
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.8;
  const bed = ctx.createGain();
  bed.gain.value = 0.22;
  hiss.connect(filter).connect(bed).connect(out);
  hiss.start();

  scope.every(
    () => 120 + Math.random() * 900,
    () => {
      const now = ctx.currentTime;
      const pop = noiseSource(ctx);
      const popFilter = ctx.createBiquadFilter();
      popFilter.type = "bandpass";
      popFilter.frequency.value = 900 + Math.random() * 1800;
      const popGain = ctx.createGain();
      popGain.gain.setValueAtTime(0.0001, now);
      popGain.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.14, now + 0.006);
      popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      pop.connect(popFilter).connect(popGain).connect(out);
      pop.start(now);
      pop.stop(now + 0.12);
    }
  );

  // crickets: short trains of high chirps, from a few "insects" on their own rhythms
  scope.every(
    () => 700 + Math.random() * 1600,
    () => {
      const now = ctx.currentTime;
      const pitch = 4200 + Math.random() * 900;
      const chirps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i++) {
        const start = now + i * 0.085;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = pitch;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.018, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
        osc.connect(g).connect(out);
        osc.start(start);
        osc.stop(start + 0.06);
      }
    }
  );
  return scope;
}

// --- Lofi records -------------------------------------------------------------------------
// Each is a four-chord loop (as MIDI note lists), a tempo, and a feel. The voicing is played on
// a mellow triangle pad through a low-pass, under a lazy kick/hat pattern and vinyl crackle.
const RECORDS: { bpm: number; chords: number[][]; swing: number }[] = [
  // Rainy Window — Fmaj7, Em7, Dm7, Cmaj7
  { bpm: 72, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], swing: 0.12 },
  // Late Night Study — Am7, D9, Gmaj7, Cmaj7
  { bpm: 80, chords: [[57, 60, 64, 67], [50, 54, 57, 64], [55, 59, 62, 66], [48, 52, 55, 59]], swing: 0.08 },
  // Sunday Coffee — Dmaj7, Bm7, Em7, A7
  { bpm: 88, chords: [[50, 54, 57, 61], [47, 50, 54, 57], [52, 55, 59, 62], [45, 49, 52, 55]], swing: 0.15 },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function recordBed(ctx: AudioContext, out: GainNode, track: number): Bed {
  const scope = bedScope();
  const record = RECORDS[track % RECORDS.length];
  const beat = 60 / record.bpm;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1400; // the "warm, slightly muffled" part of lofi
  const mix = ctx.createGain();
  mix.gain.value = 0.55;
  tone.connect(mix).connect(out);

  // vinyl crackle underneath everything
  const crackle = scope.keep(noiseSource(ctx));
  const crackleFilter = ctx.createBiquadFilter();
  crackleFilter.type = "highpass";
  crackleFilter.frequency.value = 3000;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0.012;
  crackle.connect(crackleFilter).connect(crackleGain).connect(out);
  crackle.start();

  // A tiny lookahead scheduler: every 100ms, queue whatever falls in the next 300ms.
  let nextBar = ctx.currentTime + 0.1;
  let bar = 0;
  const scheduleBar = (t: number, chord: number[]) => {
    // pad: the chord held for the bar, softly attacked
    for (const note of chord) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midi(note);
      osc.detune.value = (Math.random() - 0.5) * 12; // a little tape wobble
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 4);
      osc.connect(g).connect(tone);
      osc.start(t);
      osc.stop(t + beat * 4 + 0.05);
    }
    // bass on the root, an octave down
    const bass = ctx.createOscillator();
    bass.type = "sine";
    bass.frequency.value = midi(chord[0] - 12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.8);
    bass.connect(bg).connect(tone);
    bass.start(t);
    bass.stop(t + beat * 2);

    // drums: kick on 1 and 3, a soft hat on the (swung) off-beats
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      if (b % 2 === 0) {
        const kick = ctx.createOscillator();
        kick.frequency.setValueAtTime(110, bt);
        kick.frequency.exponentialRampToValueAtTime(42, bt + 0.12);
        const kg = ctx.createGain();
        kg.gain.setValueAtTime(0.22, bt);
        kg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.18);
        kick.connect(kg).connect(mix);
        kick.start(bt);
        kick.stop(bt + 0.2);
      }
      const ht = bt + beat * (0.5 + record.swing);
      const hat = noiseSource(ctx);
      const hf = ctx.createBiquadFilter();
      hf.type = "highpass";
      hf.frequency.value = 7000;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.03, ht);
      hg.gain.exponentialRampToValueAtTime(0.0001, ht + 0.05);
      hat.connect(hf).connect(hg).connect(out);
      hat.start(ht);
      hat.stop(ht + 0.06);
    }
  };
  scope.every(
    () => 100,
    () => {
      while (nextBar < ctx.currentTime + 0.3) {
        scheduleBar(nextBar, record.chords[bar % record.chords.length]);
        nextBar += beat * 4;
        bar++;
      }
    }
  );
  return scope;
}

/** Lounge with the record player off: rain on the window and a warm hum. */
function rainBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const rain = scope.keep(noiseSource(ctx));
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1600;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.05;
  rain.connect(filter).connect(rainGain).connect(out);
  rain.start();
  const hum = scope.keep(ctx.createOscillator());
  hum.frequency.value = 62;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.03;
  hum.connect(humGain).connect(out);
  hum.start();
  return scope;
}

/** Every so often, the coffee machine gurgles. */
function coffeeBubbles(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  scope.every(
    () => 9000 + Math.random() * 14000,
    () => {
      const now = ctx.currentTime;
      for (let i = 0; i < 9; i++) {
        const t = now + i * (0.05 + Math.random() * 0.06);
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(260 + Math.random() * 260, t);
        osc.frequency.exponentialRampToValueAtTime(600 + Math.random() * 300, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.07);
      }
    }
  );
  return scope;
}

// ii-V-I-VI in F, the oldest trick in the lounge-jazz book: Gm7, C7, Fmaj7, D7
const JAZZ_CHANGES: { chord: number[]; walk: number[] }[] = [
  { chord: [55, 58, 62, 65], walk: [43, 46, 50, 49] },
  { chord: [52, 55, 58, 62], walk: [48, 52, 55, 54] },
  { chord: [53, 57, 60, 64], walk: [41, 45, 48, 49] },
  { chord: [54, 57, 60, 62], walk: [50, 54, 57, 44] },
];

function casinoBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const beat = 60 / 112;
  const swing = 0.16;

  const warm = ctx.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 1800;
  const mix = ctx.createGain();
  mix.gain.value = 0.5;
  warm.connect(mix).connect(out);

  // the room: a low band of murmuring voices
  const murmur = scope.keep(noiseSource(ctx));
  const mf = ctx.createBiquadFilter();
  mf.type = "bandpass";
  mf.frequency.value = 420;
  mf.Q.value = 0.8;
  const mg = ctx.createGain();
  mg.gain.value = 0.02;
  murmur.connect(mf).connect(mg).connect(out);
  murmur.start();

  const hit = (t: number, freq: number, dur: number, gain: number, type: OscillatorType, dest: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const noiseHit = (t: number, hp: number, dur: number, gain: number) => {
    const n = noiseSource(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + dur + 0.02);
  };

  let nextBar = ctx.currentTime + 0.1;
  let bar = 0;
  const scheduleBar = (t: number, change: (typeof JAZZ_CHANGES)[number]) => {
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      hit(bt, midi(change.walk[b]), beat * 0.9, 0.16, "sine", warm); // walking bass
      noiseHit(bt, 6000, 0.12, 0.018); // ride
      noiseHit(bt + beat * (0.5 + swing), 7000, 0.06, 0.012); // ride skip note
      if (b % 2 === 1) noiseHit(bt, 1800, 0.18, 0.02); // brushed snare on 2 and 4
    }
    // soft keys: the chord on 1, a comp on the "and" of 2
    for (const at of [0, 1.5 + swing]) {
      for (const note of change.chord) hit(t + at * beat, midi(note), beat * 1.3, 0.022, "sine", warm);
    }
  };
  scope.every(
    () => 100,
    () => {
      while (nextBar < ctx.currentTime + 0.3) {
        scheduleBar(nextBar, JAZZ_CHANGES[bar % JAZZ_CHANGES.length]);
        nextBar += beat * 4;
        bar++;
      }
    }
  );
  // now and then, chips clicking together somewhere in the room
  scope.every(
    () => 2500 + Math.random() * 5000,
    () => {
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) hit(t + i * 0.05 + Math.random() * 0.02, 2600 + Math.random() * 600, 0.05, 0.012, "triangle", out);
    }
  );
  return scope;
}

/** The gym: a low room hum with reverberant slap, canvas scuffs, crowd murmur and the odd bell. */
function gymBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const hum = scope.keep(ctx.createOscillator());
  hum.frequency.value = 55;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.025;
  hum.connect(humGain).connect(out);
  hum.start();
  const murmur = scope.keep(noiseSource(ctx));
  const mf = ctx.createBiquadFilter();
  mf.type = "bandpass";
  mf.frequency.value = 380;
  mf.Q.value = 0.9;
  const mg = ctx.createGain();
  mg.gain.value = 0.03;
  murmur.connect(mf).connect(mg).connect(out);
  murmur.start();
  // scuffs and glove thumps echo round the hall
  scope.every(
    () => 900 + Math.random() * 2600,
    () => {
      const t = ctx.currentTime;
      const n = noiseSource(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 500 + Math.random() * 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      n.connect(f).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.4);
    }
  );
  // the bell, now and then
  scope.every(
    () => 20000 + Math.random() * 25000,
    () => {
      const t = ctx.currentTime;
      for (const [f, d] of [
        [1760, 1.4],
        [2637, 0.9],
      ]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + d + 0.1);
      }
    }
  );
  return scope;
}

/** The onsen: trickling water, a steam hiss, and the shishi-odoshi's clack-thunk every six seconds. */
function onsenBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const trickle = streamBed(ctx, out, 0.045);
  const hiss = scope.keep(noiseSource(ctx));
  const hf = ctx.createBiquadFilter();
  hf.type = "highpass";
  hf.frequency.value = 5000;
  const hg = ctx.createGain();
  hg.gain.value = 0.012;
  hiss.connect(hf).connect(hg).connect(out);
  hiss.start();
  scope.every(
    () => 6000,
    () => {
      const t = ctx.currentTime + 4.6; // matches the bamboo's tip in OnsenWorld (6 s cycle)
      // clack: a bright wooden knock; thunk: a low hollow note as it swings back
      const clack = ctx.createOscillator();
      clack.type = "square";
      clack.frequency.setValueAtTime(1800, t);
      clack.frequency.exponentialRampToValueAtTime(900, t + 0.05);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      clack.connect(cg).connect(out);
      clack.start(t);
      clack.stop(t + 0.1);
      const thunk = ctx.createOscillator();
      thunk.type = "sine";
      thunk.frequency.setValueAtTime(220, t + 0.35);
      thunk.frequency.exponentialRampToValueAtTime(120, t + 0.6);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.0001, t + 0.35);
      tg.gain.exponentialRampToValueAtTime(0.12, t + 0.37);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      thunk.connect(tg).connect(out);
      thunk.start(t + 0.35);
      thunk.stop(t + 0.8);
    }
  );
  return { stop: () => (scope.stop(), trickle.stop()) };
}

// A bouncy chiptune loop: square-wave lead over a triangle bass, with a hat on the off-beats.
const CHIP_LEAD = [72, 76, 79, 76, 72, 74, 77, 74, 71, 74, 79, 74, 72, 76, 81, 79];
const CHIP_BASS = [48, 48, 55, 55, 53, 53, 50, 50];

function arcadeBed(ctx: AudioContext, out: GainNode): Bed {
  const scope = bedScope();
  const beat = 60 / 132;
  const mix = ctx.createGain();
  mix.gain.value = 0.35;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  tone.connect(mix).connect(out);
  const hum = scope.keep(noiseSource(ctx));
  const hf = ctx.createBiquadFilter();
  hf.type = "bandpass";
  hf.frequency.value = 240;
  const hg = ctx.createGain();
  hg.gain.value = 0.015;
  hum.connect(hf).connect(hg).connect(out);
  hum.start();
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const note = (t: number, m: number, dur: number, type: OscillatorType, gain: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midi(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  scope.every(
    () => 100,
    () => {
      while (next < ctx.currentTime + 0.3) {
        const s = step % 16;
        note(next, CHIP_LEAD[s], beat * 0.45, "square", 0.05);
        if (s % 2 === 0) note(next, CHIP_BASS[(step >> 1) % 8], beat * 0.9, "triangle", 0.08);
        if (s % 2 === 1) {
          const n = noiseSource(ctx);
          const f = ctx.createBiquadFilter();
          f.type = "highpass";
          f.frequency.value = 8000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.02, next);
          g.gain.exponentialRampToValueAtTime(0.0001, next + 0.04);
          n.connect(f).connect(g).connect(out);
          n.start(next);
          n.stop(next + 0.05);
        }
        next += beat / 2;
        step++;
      }
    }
  );
  return scope;
}

function startBeds(ctx: AudioContext, out: GainNode, mapId: MapId, record: number | null): Bed[] {
  if (mapId === "sunset_beach") return [beachBed(ctx, out)];
  if (mapId === "velvet_casino") return [casinoBed(ctx, out)];
  if (mapId === "campfire_night") return [campfireBed(ctx, out), streamBed(ctx, out)];
  if (mapId === "boxing_ring") return [gymBed(ctx, out)];
  if (mapId === "japanese_onsen") return [onsenBed(ctx, out)];
  if (mapId === "retro_arcade") return [arcadeBed(ctx, out)];
  // the lounge: the record (or rain on the window), the hearth, and the coffee machine
  return [record === null ? rainBed(ctx, out) : recordBed(ctx, out, record), hearthBed(ctx, out), coffeeBubbles(ctx, out)];
}

/**
 * Plays the current map's soundscape through the SoundManager's bgm bus whenever ambience is
 * on in the audio settings and the context has been unlocked by a gesture.
 * @param record the lounge turntable's record index while it is playing, or null when it is
 *               off (or when not in the lounge)
 */
export function useAmbience(mapId: MapId, record: number | null) {
  const [settings, setSettings] = useState(getAudioSettings());
  const [unlocked, setUnlocked] = useState(isUnlocked());
  useEffect(
    () =>
      subscribeAudioSettings((s) => {
        setSettings(s);
        setUnlocked(isUnlocked());
      }),
    []
  );
  const enabled = settings.ambience && settings.master > 0 && unlocked;

  useEffect(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(bgmBus());
    const beds = startBeds(ctx, master, mapId, mapId === "cozy_lounge" ? record : null);
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + CROSSFADE_S); // fade in over the crossfade

    return () => {
      // fast travel: the old world's bed lingers under the new one for the crossfade
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_S);
      window.setTimeout(() => {
        beds.forEach((b) => b.stop());
        master.disconnect();
      }, CROSSFADE_S * 1000 + 80);
    };
  }, [enabled, mapId, record]);

  const toggle = useCallback(() => setAudioSettings({ ambience: !getAudioSettings().ambience }), []);
  return { enabled: settings.ambience, toggle };
}
