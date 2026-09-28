import { useSyncExternalStore } from "react";
import { COMPOSURE_MAX, STAMINA_MAX, poolsOf, type BoutView, type FighterState, type FighterView } from "@shared/boxing";

// The Velvet Ring's bout as the room's state carries it (server/src/rooms/boxing.ts BoutSchema),
// kept OUT of React state like liveMotion: a fighter's stamina moves up to twenty times a second,
// and only the ring's own HUD, its chalkboard and the fighters' avatars want to hear about it (the
// rest of the app would re-render for nothing). The room hook writes it (setBout); readers take a
// snapshot (getBout) in a frame loop or subscribe (useBout).

const emptyFighter = (): FighterView => ({ sessionId: "", name: "", stamina: STAMINA_MAX, composure: COMPOSURE_MAX, state: "", knockdowns: 0, taps: 0, need: 0, dealt: 0, hookReady: 0, guardReady: 0, swayReady: 0, counterUntil: 0, gloves: "red", away: false });

let bout: BoutView = { phase: "open", round: 0, until: 0, count: 0, red: emptyFighter(), blue: emptyFighter(), bets: {}, pools: { red: 0, blue: 0 }, result: "", now: 0 };
/** Whole seconds left on the phase's clock (the server's `clock`). */
let clock = 0;
const listeners = new Set<() => void>();

export function getBout(): BoutView {
  return bout;
}
export function getBoutClock(): number {
  return clock;
}

/** Read from the room's BoutSchema (and its fighters and bets), whenever any of it changes. */
export function setBoutFromSchema(s: any) {
  if (!s) return;
  const fighter = (f: any): FighterView => ({
    ...emptyFighter(),
    sessionId: f?.sessionId ?? "",
    name: f?.name ?? "",
    stamina: Number(f?.stamina ?? STAMINA_MAX),
    composure: Number(f?.composure ?? COMPOSURE_MAX),
    state: f?.state ?? "",
    knockdowns: Number(f?.knockdowns ?? 0),
    taps: Number(f?.taps ?? 0),
    need: Number(f?.need ?? 0),
    dealt: Number(f?.dealt ?? 0),
    gloves: f?.gloves === "tiger" ? "tiger" : "red",
    away: !!f?.away,
  });
  const bets: Record<string, string> = {};
  s.bets?.forEach?.((v: string, k: string) => (bets[k] = v));
  clock = Number(s.clock ?? 0);
  bout = {
    phase: s.phase ?? "open",
    round: Number(s.round ?? 0),
    until: 0,
    count: Number(s.count ?? 0),
    red: fighter(s.red),
    blue: fighter(s.blue),
    bets,
    pools: poolsOf(Object.values(bets)),
    result: s.result ?? "",
    now: Date.now(),
  };
  listeners.forEach((l) => l());
}

export function subscribeBout(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The bout (re-renders on every change: the ring's HUD and chalkboard). */
export function useBout(): BoutView {
  return useSyncExternalStore(subscribeBout, getBout, getBout);
}
export function useBoutClock(): number {
  return useSyncExternalStore(subscribeBout, getBoutClock, getBoutClock);
}

/** A fighter's state in the bout (null: not one of its fighters): an avatar's own subscription,
 *  re-rendering only when that changes. */
export function useFighterState(sessionId: string | null | undefined): FighterState | null {
  const pick = () => (!sessionId ? null : bout.red.sessionId === sessionId ? bout.red.state : bout.blue.sessionId === sessionId ? bout.blue.state : null);
  return useSyncExternalStore(subscribeBout, pick, pick);
}

/** The corner a session fights from in this bout, if any. */
export function cornerOfSession(b: BoutView, sessionId: string | null | undefined): "red" | "blue" | null {
  if (!sessionId) return null;
  if (b.red.sessionId === sessionId) return "red";
  if (b.blue.sessionId === sessionId) return "blue";
  return null;
}
