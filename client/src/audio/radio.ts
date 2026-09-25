// The lounge radio's music, generated in the browser with the Web Audio API: no audio files, no
// streams (Discord's Activity sandbox blocks outside hosts, and nothing here needs a licence).
//
// Each station is a little generative arrangement over a chord progression, played by a handful
// of synthesised instruments (soft electric-piano keys, pads, a bass, boom-bap and brushed drums,
// a music-box bell) over a continuous bed (vinyl crackle, rain, a drone). A lookahead scheduler
// (a 50 ms timer queueing notes 0.25 s ahead on the audio clock) keeps the timing steady.
//
// One engine for the page (useRadio): play(station) switches station, stop() goes quiet, and
// dispose() tears everything down. Every source it starts is stopped and disconnected, so nothing
// leaks across station changes. Browsers only let audio start after a user gesture: until then
// the context waits suspended, and the first tap or key anywhere lets the music in.

type Note = number; // MIDI note number
const hz = (n: Note) => 440 * 2 ** ((n - 69) / 12);

interface Station {
  bpm: number;
  /** Swing: how far each off-beat 16th is pushed late, as a fraction of a 16th. */
  swing: number;
  /** One chord (MIDI notes, lowest first) per bar, looping. */
  chords: Note[][];
  /** The continuous bed under it. */
  bed: "crackle" | "rain" | "drone";
  /** Plays one 16th-note step of a bar. */
  step: (e: RadioEngine, step: number, bar: number, chord: Note[], t: number, sixteenth: number) => void;
}

// scales for the melodic flourishes
const PENTA_C = [72, 74, 76, 79, 81, 84, 86, 88];
const chance = (p: number) => Math.random() < p;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

const STATIONS: Station[] = [
  // Cozy Lofi Beats: Fmaj9 - Em7 - Dm9 - Cmaj7 at a lazy 74, a swung boom-bap, dusty keys
  {
    bpm: 74,
    swing: 0.28,
    chords: [
      [53, 57, 60, 64, 67],
      [52, 55, 59, 62],
      [50, 53, 57, 60, 64],
      [48, 52, 55, 59],
    ],
    bed: "crackle",
    step(e, s, _bar, chord, t, six) {
      if (s === 0 || s === 10) e.keys(chord.slice(1), t, six * (s === 0 ? 9 : 6), 0.09);
      if (s === 0 || s === 10) e.bass(chord[0] - 12, t, six * 5, 0.22);
      if (s === 0 || s === 7 || s === 10) e.kick(t, s === 7 ? 0.45 : 0.7);
      if (s === 4 || s === 12) e.snare(t, 0.22);
      if (s % 2 === 0) e.hat(t, s % 4 === 0 ? 0.05 : 0.035);
      if ((s === 6 || s === 14) && chance(0.35)) e.keys([pick(PENTA_C)], t, six * 3, 0.05);
    },
  },
  // Rainy Evening: slow pads under the rain, Am9 - Fmaj7 - Cmaj7 - G6, a few piano notes
  {
    bpm: 58,
    swing: 0,
    chords: [
      [45, 55, 60, 64, 71],
      [41, 53, 57, 60, 64],
      [48, 55, 59, 64],
      [43, 55, 59, 62, 64],
    ],
    bed: "rain",
    step(e, s, _bar, chord, t, six) {
      if (s === 0) e.pad(chord, t, six * 16, 0.07);
      if (s === 0) e.bass(chord[0], t, six * 12, 0.12);
      if (s % 4 === 0 && chance(0.3)) e.keys([pick([69, 71, 72, 74, 76, 79])], t, six * 6, 0.06);
    },
  },
  // Sunny Café Jazz: ii - V - I - VI in C with a walking bass, brushes and comping
  {
    bpm: 112,
    swing: 0.33,
    chords: [
      [50, 53, 57, 60],
      [43, 53, 55, 59],
      [48, 52, 55, 59],
      [45, 49, 52, 55],
    ],
    bed: "crackle",
    step(e, s, _bar, chord, t, six) {
      if (s % 4 === 0) {
        // walking quarters: the root, then chord tones and a passing note toward the next bar
        const walk = [chord[0], chord[0] + 4, chord[0] + 7, chord[0] + 9];
        e.bass(walk[s / 4] - 12, t, six * 3.5, 0.22);
      }
      if (s === 4 || s === 12) e.brush(t, 0.12);
      if (s % 4 === 0 || s % 4 === 3) e.hat(t, 0.03);
      if (s === 6 || s === 14 || (s === 2 && chance(0.4))) e.keys(chord.slice(1), t, six * 2, 0.07);
      if (s % 2 === 0 && chance(0.18)) e.keys([pick([72, 74, 76, 77, 79, 81])], t, six * 2, 0.045);
    },
  },
  // Starlight Ambient: a warm drone and a music box drifting over two slow chords
  {
    bpm: 50,
    swing: 0,
    chords: [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
    ],
    bed: "drone",
    step(e, s, _bar, chord, t, six) {
      if (s === 0) e.pad(chord, t, six * 16, 0.05);
      if (s % 2 === 0 && chance(0.45)) e.bell(pick(PENTA_C) + 12, t, 0.05);
    },
  },
];

export class RadioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private station = -1;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private bed: AudioScheduledSourceNode[] = [];
  /** The bed's filters and gains, disconnected with it. */
  private bedNodes: AudioNode[] = [];
  private volume = 0.6;
  private muted = false;
  private unlock: (() => void) | null = null;

  /** True while the browser is still waiting for a tap before it will play anything. */
  get waiting(): boolean {
    return !!this.ctx && this.ctx.state === "suspended";
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }

  play(station: number) {
    if (station < 0 || station >= STATIONS.length) return this.stop();
    const ctx = this.ensure();
    if (!ctx) return;
    if (station === this.station && this.timer) return;
    this.stop();
    this.station = station;
    this.step = 0;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.startBed(STATIONS[station].bed);
    this.timer = window.setInterval(() => this.schedule(), 50);
    this.schedule();
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.station = -1;
    for (const src of this.bed) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
    this.bed = [];
    for (const node of this.bedNodes) node.disconnect();
    this.bedNodes = [];
  }

  dispose() {
    this.stop();
    if (this.unlock) {
      window.removeEventListener("pointerdown", this.unlock);
      window.removeEventListener("keydown", this.unlock);
      this.unlock = null;
    }
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  // --- plumbing ------------------------------------------------------------------------------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyGain();
    // two seconds of white noise, shared by the drums and the beds
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // the browser holds the audio until the first gesture: let it in then
    if (ctx.state === "suspended") {
      this.unlock = () => {
        void ctx.resume();
        if (this.unlock) {
          window.removeEventListener("pointerdown", this.unlock);
          window.removeEventListener("keydown", this.unlock);
          this.unlock = null;
        }
      };
      window.addEventListener("pointerdown", this.unlock);
      window.addEventListener("keydown", this.unlock);
    }
    return ctx;
  }

  private applyGain() {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.55, this.ctx.currentTime, 0.05);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.station < 0) return;
    const st = STATIONS[this.station];
    const sixteenth = 60 / st.bpm / 4;
    // never fall behind: after the tab slept, pick up from now instead of rushing to catch up
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const offbeat = this.step % 2 === 1;
      const t = this.nextTime + (offbeat ? st.swing * sixteenth : 0);
      const chord = st.chords[this.bar % st.chords.length];
      st.step(this, this.step, this.bar, chord, t, sixteenth);
      this.extraBedTicks(st.bed, t, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  /** Short-lived voice plumbing: a source through an optional filter and an envelope to the master. */
  private voice(src: AudioScheduledSourceNode, t: number, dur: number, peak: number, attack: number, filter?: BiquadFilterNode) {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filter) {
      src.connect(filter);
      filter.connect(env);
    } else src.connect(env);
    env.connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      filter?.disconnect();
      env.disconnect();
    };
  }

  private lowpass(freq: number, q = 0.7) {
    const f = this.ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private noiseSource(loop = false) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  // --- instruments ---------------------------------------------------------------------------

  /** Soft electric-piano keys: a sine and a detuned triangle through a warm low-pass. */
  keys(notes: Note[], t: number, dur: number, vol: number) {
    for (const n of notes) {
      for (const [type, detune] of [["sine", 0], ["triangle", 7]] as const) {
        const o = this.ctx!.createOscillator();
        o.type = type;
        o.frequency.value = hz(n);
        o.detune.value = detune;
        this.voice(o, t, dur, vol / notes.length, 0.012, this.lowpass(1800));
      }
    }
  }

  /** A slow, warm pad: two detuned saws through a dark filter, fading in. */
  pad(notes: Note[], t: number, dur: number, vol: number) {
    for (const n of notes) {
      for (const detune of [-6, 6]) {
        const o = this.ctx!.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(n);
        o.detune.value = detune;
        this.voice(o, t, dur, vol / notes.length, Math.min(1.2, dur * 0.3), this.lowpass(900));
      }
    }
  }

  bass(n: Note, t: number, dur: number, vol: number) {
    const o = this.ctx!.createOscillator();
    o.type = "triangle";
    o.frequency.value = hz(n);
    this.voice(o, t, dur, vol, 0.01, this.lowpass(420));
  }

  /** A music-box bell: a sine with an inharmonic partial, ringing out. */
  bell(n: Note, t: number, vol: number) {
    for (const [ratio, level] of [[1, 1], [2.76, 0.35]] as const) {
      const o = this.ctx!.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(n) * ratio;
      this.voice(o, t, 1.4, vol * level, 0.005);
    }
  }

  kick(t: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    this.voice(o, t, 0.28, vol, 0.004);
  }

  snare(t: number, vol: number) {
    const f = this.ctx!.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1700;
    f.Q.value = 0.8;
    this.voice(this.noiseSource(), t, 0.18, vol, 0.003, f);
  }

  hat(t: number, vol: number) {
    const f = this.ctx!.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    this.voice(this.noiseSource(), t, 0.05, vol, 0.002, f);
  }

  /** A brushed snare: a soft swish of band-passed noise. */
  brush(t: number, vol: number) {
    const f = this.ctx!.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 3200;
    f.Q.value = 0.6;
    this.voice(this.noiseSource(), t, 0.26, vol, 0.06, f);
  }

  // --- beds ----------------------------------------------------------------------------------

  private startBed(kind: Station["bed"]) {
    const ctx = this.ctx!;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.master!);
      this.bedNodes.push(g);
      return g;
    };
    if (kind === "crackle" || kind === "rain") {
      // a soft continuous hiss: vinyl surface noise, or rain on the glass
      const src = this.noiseSource(true);
      const f = kind === "rain" ? this.lowpass(1400, 0.4) : ctx.createBiquadFilter();
      if (kind === "crackle") {
        f.type = "highpass";
        f.frequency.value = 3500;
      }
      src.connect(f);
      f.connect(gain(kind === "rain" ? 0.16 : 0.012));
      src.start();
      this.bed.push(src);
      this.bedNodes.push(f);
    } else {
      // a warm drone: two low sines a fifth apart, breathing slowly
      for (const n of [36, 43]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = hz(n);
        const g = gain(0.05);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07 + n * 0.001;
        const depth = ctx.createGain();
        depth.gain.value = 0.025;
        lfo.connect(depth);
        depth.connect(g.gain);
        this.bedNodes.push(depth);
        o.connect(g);
        o.start();
        lfo.start();
        this.bed.push(o, lfo);
      }
    }
  }

  /** The bed's little events, scheduled with the music: vinyl pops, rain drops. */
  private extraBedTicks(kind: Station["bed"], t: number, sixteenth: number) {
    if (kind === "crackle" && chance(0.12)) {
      const f = this.ctx!.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 2500;
      this.voice(this.noiseSource(), t + Math.random() * sixteenth, 0.012, 0.05, 0.001, f);
    }
    if (kind === "rain" && chance(0.5)) {
      const f = this.ctx!.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2500 + Math.random() * 3000;
      f.Q.value = 4;
      this.voice(this.noiseSource(), t + Math.random() * sixteenth, 0.03, 0.05, 0.002, f);
    }
  }
}
