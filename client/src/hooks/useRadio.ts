import { useCallback, useEffect, useRef, useState } from "react";
import type { ToggleableSyncState } from "@shared/types";
import { RadioEngine } from "../audio/radio";

// The lounge radio, heard in this browser. Which station plays, and whether it plays at all, is
// the radio prop's synced state (the server's RADIO_UPDATE sets it for the whole room); this hook
// follows it with the page's one RadioEngine. Volume and mute are this player's own, remembered
// in localStorage.

const VOLUME_KEY = "cozy-radio-volume";
const MUTED_KEY = "cozy-radio-muted";

function load<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the setting just isn't remembered */
  }
}

export interface RadioState {
  /** The station index (RADIO_STATIONS), and whether the room's radio is playing. */
  station: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  /** The browser is holding the audio until this player taps or presses a key. */
  waiting: boolean;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

export function useRadio(toggleables: Record<string, ToggleableSyncState>): RadioState {
  const radio = Object.values(toggleables).find((t) => t.kind === "radio");
  const station = radio?.track ?? 0;
  const playing = !!radio?.on;
  const engine = useRef<RadioEngine | null>(null);
  const [volume, setVolumeState] = useState(() => load(VOLUME_KEY, 0.6, (s) => Math.max(0, Math.min(1, Number(s) || 0))));
  const [muted, setMutedState] = useState(() => load(MUTED_KEY, false, (s) => s === "1"));
  const [waiting, setWaiting] = useState(false);

  // one engine for the page, torn down with it
  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    []
  );

  // follow the room's radio
  useEffect(() => {
    if (!playing) {
      engine.current?.stop();
      setWaiting(false);
      return;
    }
    const e = (engine.current ??= new RadioEngine());
    e.setVolume(volume);
    e.setMuted(muted);
    e.play(station);
    // until the browser lets the audio in, say so (checked lightly, only while it plays)
    setWaiting(e.waiting);
    const timer = window.setInterval(() => setWaiting(e.waiting), 700);
    return () => window.clearInterval(timer);
    // volume and mute are applied by their own setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, station]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    save(VOLUME_KEY, String(v));
    engine.current?.setVolume(v);
  }, []);
  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    save(MUTED_KEY, m ? "1" : "0");
    engine.current?.setMuted(m);
  }, []);

  return { station, playing, volume, muted, waiting, setVolume, setMuted };
}
