import { useSyncExternalStore } from "react";
import { GUARD_MAX, HEALTH_MAX, STAMINA_MAX, isBotTier, isCorner, poolsOf, type BoutView, type FighterState, type FighterView, type RoundWinner } from "@shared/boxing";

// The Velvet Ring's bout as the room's state carries it (server/src/rooms/boxing.ts BoutSchema),
// kept OUT of React state like liveMotion: a fighter's stamina moves up to twenty times a second,
// and only the ring's own HUD, its chalkboard and the fighters' avatars want to hear about it (the
// rest of the app would re-render for nothing). The room hook writes it (setBoutFromSchema); readers
// take a snapshot (getBout) in a frame loop or subscribe (useBout).

const emptyFighter = (): FighterView => ({ sessionId: "", name: "", health: HEALTH_MAX, stamina: STAMINA_MAX, guard: GUARD_MAX, state: "", exhausted: false, counter: false, knockdowns: 0, taps: 0, need: 0, dealt: 0, gloves: "red", away: false, reign: 0, wins: 0, bot: "", x: 0, z: 0 });

let bout: BoutView = { phase: "open", round: 0, count: 0, red: emptyFighter(), blue: emptyFighter(), bets: {}, pools: { red: 0, blue: 0 }, result: "", queue: [], rounds: [], spar: "", now: 0 };
/** Whole seconds left on the phase's clock (the server's `clock`). */
let clock = 0;
const listeners = new Set<() => void>();

export function getBout(): BoutView {
  return bout;
}
export function getBoutClock(): number {
  return clock;
}

/** Read from the room's BoutSchema (and its fighters, bets and queue), whenever any of it changes. */
export function setBoutFromSchema(s: any) {
  if (!s) return;
  const fighter = (f: any): FighterView => ({
    ...emptyFighter(),
    sessionId: f?.sessionId ?? "",
    name: f?.name ?? "",
    health: Number(f?.health ?? HEALTH_MAX),
    stamina: Number(f?.stamina ?? STAMINA_MAX),
    guard: Number(f?.guard ?? GUARD_MAX),
    state: f?.state ?? "",
    exhausted: !!f?.exhausted,
    counter: !!f?.counter,
    knockdowns: Number(f?.knockdowns ?? 0),
    taps: Number(f?.taps ?? 0),
    need: Number(f?.need ?? 0),
    dealt: Number(f?.dealt ?? 0),
    gloves: f?.gloves === "tiger" ? "tiger" : "red",
    away: !!f?.away,
    reign: Number(f?.reign ?? 0),
    wins: Number(f?.wins ?? 0),
    bot: isBotTier(f?.bot) ? f.bot : "",
    x: Number(f?.x ?? 0),
    z: Number(f?.z ?? 0),
  });
  const bets: Record<string, string> = {};
  s.bets?.forEach?.((v: string, k: string) => (bets[k] = v));
  const queue: string[] = [];
  s.queue?.forEach?.((id: string) => queue.push(id));
  clock = Number(s.clock ?? 0);
  bout = {
    phase: s.phase ?? "open",
    round: Number(s.round ?? 0),
    count: Number(s.count ?? 0),
    red: fighter(s.red),
    blue: fighter(s.blue),
    bets,
    pools: poolsOf(Object.values(bets)),
    result: s.result ?? "",
    queue,
    rounds: String(s.rounds ?? "")
      .split(",")
      .filter((r): r is RoundWinner => isCorner(r) || r === "draw"),
    spar: isBotTier(s.spar) ? s.spar : "",
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

/** The fighter a session is, in this bout, and the one they face. */
export function fightersOf(b: BoutView, sessionId: string | null | undefined): { mine: FighterView | null; theirs: FighterView | null } {
  const c = cornerOfSession(b, sessionId);
  if (!c) return { mine: null, theirs: null };
  return { mine: b[c], theirs: b[c === "red" ? "blue" : "red"] };
}

/** A bout is being fought (the countdown, a round, a count, the rest between rounds): the ring's
 *  own camera and HUD take over for its fighters. */
export function boutLive(phase: BoutView["phase"]): boolean {
  return phase === "warmup" || phase === "fight" || phase === "count" || phase === "rest";
}

/** Whether `sessionId` is fighting a live bout right now (the ring's banners take the top of the
 *  screen): re-renders only when that changes. */
export function useRingTakeover(sessionId: string | null | undefined): boolean {
  const pick = () => !!sessionId && boutLive(bout.phase) && cornerOfSession(bout, sessionId) !== null;
  return useSyncExternalStore(subscribeBout, pick, pick);
}
