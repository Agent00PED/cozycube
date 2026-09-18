import { useCallback, useEffect, useRef, useState } from "react";
import type { MapId } from "@shared/types";

// Per-map ambience, synthesised with WebAudio rather than shipped as audio files: a few
// oscillators and a noise buffer cost nothing to download and let each map's bed be shaped in
// code (surf that breathes, a fire that crackles, rain on the window).
//
// It starts muted. Browsers block audio until a gesture anyway, and a room that starts making
// noise the moment it loads is the kind of thing people close the tab over.

type Bed = {
  stop: () => void;
};

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Surf: filtered noise whose cutoff and gain swell and fall like waves on a shore. */
function beachBed(ctx: AudioContext, out: GainNode): Bed {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 0.6;

  const swell = ctx.createGain();
  swell.gain.value = 0.35;

  // the swell itself: a very slow LFO on both gain and cutoff
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.22;
  const cutoffLfo = ctx.createGain();
  cutoffLfo.gain.value = 260;

  lfo.connect(lfoGain).connect(swell.gain);
  lfo.connect(cutoffLfo).connect(filter.frequency);

  source.connect(filter).connect(swell).connect(out);
  source.start();
  lfo.start();

  return {
    stop: () => {
      source.stop();
      lfo.stop();
      source.disconnect();
      lfo.disconnect();
    },
  };
}

/** Campfire: a low bed of hiss plus randomly timed crackles. */
function campfireBed(ctx: AudioContext, out: GainNode): Bed {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.8;

  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.22;
  source.connect(filter).connect(bedGain).connect(out);
  source.start();

  let timer = 0;
  const crackle = () => {
    const pop = ctx.createBufferSource();
    pop.buffer = noiseBuffer(ctx, 0.08);
    const popFilter = ctx.createBiquadFilter();
    popFilter.type = "bandpass";
    popFilter.frequency.value = 900 + Math.random() * 1800;
    const popGain = ctx.createGain();
    const now = ctx.currentTime;
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.14, now + 0.006);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    pop.connect(popFilter).connect(popGain).connect(out);
    pop.start();
    pop.stop(now + 0.12);
    timer = window.setTimeout(crackle, 120 + Math.random() * 900);
  };
  timer = window.setTimeout(crackle, 400);

  return {
    stop: () => {
      window.clearTimeout(timer);
      source.stop();
      source.disconnect();
    },
  };
}

/** Lounge: soft rain on the window, with a warm low hum under it. */
function loungeBed(ctx: AudioContext, out: GainNode): Bed {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1600;

  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.05;
  source.connect(filter).connect(rainGain).connect(out);
  source.start();

  const hum = ctx.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 62;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.035;
  hum.connect(humGain).connect(out);
  hum.start();

  return {
    stop: () => {
      source.stop();
      hum.stop();
      source.disconnect();
      hum.disconnect();
    },
  };
}

const BEDS: Record<MapId, (ctx: AudioContext, out: GainNode) => Bed> = {
  cozy_lounge: loungeBed,
  campfire_night: campfireBed,
  sunset_beach: beachBed,
};

export function useAmbience(mapId: MapId) {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const bedRef = useRef<Bed | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    masterRef.current = master;

    bedRef.current = BEDS[mapId](ctx, master);
    // fade in, so switching maps does not thump
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);

    return () => {
      const bed = bedRef.current;
      bedRef.current = null;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      window.setTimeout(() => {
        try {
          bed?.stop();
        } catch {
          /* the context may already be closing */
        }
        master.disconnect();
      }, 300);
    };
  }, [enabled, mapId]);

  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    []
  );

  const toggle = useCallback(() => setEnabled((v) => !v), []);
  return { enabled, toggle };
}
