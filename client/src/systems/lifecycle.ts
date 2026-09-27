import { useEffect, useSyncExternalStore } from "react";
import { ASSET_VERSION } from "../assetVersion";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";
import { markRejoin } from "./lounge";

// The page's life across updates, without ever reloading it. Inside Discord's Activity frame a
// reload (or `location.replace`) is a dead end: Discord greets the frame only once, so the reloaded
// page waits forever on the SDK's handshake ("Timed out waiting for Discord SDK handshake"). So the
// page never reloads itself; the Discord session stays in memory (hooks/useDiscordAuth.ts), and:
//
//   a server restart ("server_restarting": a deploy, or a restart on the same build) is a SOFT
//   RESTART, in memory: everything that registered a teardown lets go at once (the room's socket,
//   left without consent so the seat is held, its listeners and its reconnect loop; the render loop;
//   every audio context, suspended), the game's React tree is unmounted (the 3D scene, its GPU
//   buffers and the world's sounds with it) behind the "Updating CozyCube" curtain, the server is
//   asked for its build (/build.json) until it answers, and if it still serves this page's build
//   the game is mounted afresh (`generation`) and rejoins the same lounge, the curtain up until the
//   room answers;
//
//   a newer client build (the server serves another one: the version handshake's "welcome", or the
//   restarted server's /build.json) or a missing chunk (`vite:preloadError`: a lazy chunk a deploy
//   no longer serves) needs new JS and CSS, which only a fresh start of the Activity loads: the game
//   lets go of everything and says so ("A new CozyCube update is live! ..."), with a button that
//   asks Discord to close the Activity.

export type LifecyclePhase = "live" | "restarting" | "rejoining" | "outdated";

type Teardown = () => void;
const teardowns = new Set<Teardown>();
const resumes = new Set<Teardown>();
const listeners = new Set<() => void>();
let shuttingDown = false;
let phase: LifecyclePhase = "live";
/** Bumped by each soft restart: the game's tree is keyed by it, so it mounts afresh. */
let generation = 0;
let snapshot: { phase: LifecyclePhase; generation: number } = { phase, generation };

function emit() {
  snapshot = { phase, generation };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Runs `fn` each time the page lets go of its live parts (a soft restart, an outdated build);
 *  returns its unregister. Kept until unregistered, so a module's teardown serves every restart. */
export function onShutdown(fn: Teardown): () => void {
  teardowns.add(fn);
  return () => {
    teardowns.delete(fn);
  };
}

/** Runs `fn` as a soft restart brings the game back (the audio contexts wake). */
export function onResume(fn: Teardown): () => void {
  resumes.add(fn);
  return () => {
    resumes.delete(fn);
  };
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** True while the page has let go of its live parts (the render loop stops on it). */
export function useShuttingDown(): boolean {
  return useSyncExternalStore(subscribe, () => shuttingDown);
}

/** The phase and the game tree's generation (main.tsx mounts the game by them). */
export function useLifecycle(): { phase: LifecyclePhase; generation: number } {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Lets go of everything at once (the room, the render loop, the audio). Idempotent until resumed. */
export function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const fn of [...teardowns]) {
    try {
      fn();
    } catch {
      // one teardown failing must not keep the others from letting go
    }
  }
  emit();
}

function resume() {
  shuttingDown = false;
  for (const fn of [...resumes]) {
    try {
      fn();
    } catch {
      // a context that will not wake stays quiet; the game goes on
    }
  }
}

/** How long to keep asking a restarting server for its build before rejoining anyway (the room's
 *  own retries take it from there). */
const READY_WAIT_MS = 45_000;
const READY_POLL_MS = 1_500;
/** How long a server still serving this build is given to hand over to a new one (a deploy's old
 *  container, draining), before it is taken to be a plain restart on the same build. */
const DRAIN_MS = 8_000;
/** The curtain stays up at most this long while the remounted game rejoins; after that the loading
 *  screen's own "we'll keep knocking" (and its Reconnect button) shows through. */
const REJOIN_CURTAIN_MS = 15_000;

/** The build the server serves once it answers (null: it never did). While it still serves
 *  `current`, keep asking for a little: a deploy's new container may be about to take over. */
async function serverBuild(current: string): Promise<string | null> {
  const until = Date.now() + READY_WAIT_MS;
  const drainUntil = Date.now() + DRAIN_MS;
  while (Date.now() < until) {
    try {
      const res = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const build = ((await res.json()) as { build?: string })?.build ?? null;
        if (build !== current || Date.now() > drainUntil) return build;
      }
    } catch {
      // the server is between containers: ask again
    }
    await new Promise((r) => window.setTimeout(r, READY_POLL_MS));
  }
  return null;
}

/** Whether `build` (the server's) needs a newer client than this page: only a real build against
 *  a real build (the dev server says "dev"). */
function needsNewClient(build: unknown): boolean {
  return import.meta.env.PROD && typeof build === "string" && build !== "dev" && build !== ASSET_VERSION;
}

let restarting = false;
let rejoinTimer: number | undefined;

/**
 * The soft restart, in memory: let go of the room, the scene and the sound, show the "Updating"
 * curtain, wait for the server, then mount the game afresh into the same lounge (or, if the server
 * now serves a newer client build, say an update is live). Safe to call more than once.
 */
export async function softRestart(): Promise<void> {
  if (restarting || phase === "outdated") return;
  restarting = true;
  window.clearTimeout(rejoinTimer);
  // the room goes first (without consent: the seat is held), then the tree unmounts behind the curtain
  shutdown();
  phase = "restarting";
  emit();
  let build: string | null = null;
  // (the dev server is the game server's neighbour, not its host: the room's retries find it)
  if (import.meta.env.PROD) build = await serverBuild(ASSET_VERSION);
  else await new Promise((r) => window.setTimeout(r, 800));
  restarting = false;
  if (needsNewClient(build)) {
    showOutdated();
    return;
  }
  markRejoin();
  resume();
  generation++;
  phase = "rejoining";
  emit();
  rejoinTimer = window.setTimeout(rejoined, REJOIN_CURTAIN_MS);
}

/** The remounted game is back in its room (or has stopped waiting for it): the curtain lifts. */
export function rejoined() {
  window.clearTimeout(rejoinTimer);
  if (phase !== "rejoining") return;
  phase = "live";
  emit();
}

/** This page's JS and CSS are older than the server's: let go of everything and ask for a fresh
 *  start of the Activity (the only way new code arrives inside Discord's frame). */
export function showOutdated() {
  window.clearTimeout(rejoinTimer);
  shutdown();
  phase = "outdated";
  emit();
}

/** The live version handshake, from inside the game: the server's "welcome" names the client build
 *  it serves (server/src/build.ts), and "server_restarting" comes before a deploy or a restart. */
export function useUpdateWatch(subscribeMessages: (listener: RoomMessageListener) => () => void) {
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "server_restarting") void softRestart();
        else if (type === "welcome" && needsNewClient((payload as { build?: unknown })?.build)) showOutdated();
      }),
    [subscribeMessages]
  );
}

// A chunk from an older build that the server no longer has (the page outlived a deploy): new code
// is needed, and only a fresh start of the Activity brings it.
export function installPreloadErrorHandler() {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    showOutdated();
  });
}
