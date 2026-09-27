import { useSyncExternalStore } from "react";

// The page's way out: a reload onto a new build (the version handshake, a deploy's restart, a chunk
// that no longer exists), done cleanly so the Discord Activity comes back by itself instead of
// freezing on a half-torn page.
//
//   1. everything that registered a teardown lets go at once: the room's socket (left without
//      consent, so the seat is held for the reloaded page's token) and its reconnect loop, the 3D
//      render loop, every audio context
//   2. the server is asked for its build (/build.json) until it answers: a deploy's new container
//      may still be coming up, and reloading into a gateway error is what stranded players before
//   3. the page is replaced with its own address, so Discord's query parameters (frame_id,
//      instance_id, platform) come back with it; never a bare reload or a redirect to "/"

type Teardown = () => void;
const teardowns = new Set<Teardown>();
const listeners = new Set<() => void>();
let shuttingDown = false;

/** Runs `fn` once the page starts shutting down for a reload; returns its unregister. */
export function onShutdown(fn: Teardown): () => void {
  teardowns.add(fn);
  return () => {
    teardowns.delete(fn);
  };
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** True once the page is shutting down (the render loop stops on it). */
export function useShuttingDown(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => shuttingDown
  );
}

/** How long to keep asking a restarting server for its build before reloading anyway. */
const READY_WAIT_MS = 45_000;
const READY_POLL_MS = 1_500;

/** The server answers with a build: it is up and serving the page. `newerThan`: keep waiting (a
 *  little) while it still serves that one (a deploy's old container, draining). */
async function waitForServer(newerThan?: string): Promise<void> {
  const until = Date.now() + READY_WAIT_MS;
  const drainUntil = Date.now() + 8_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const build = ((await res.json()) as { build?: string })?.build;
        if (!newerThan || build !== newerThan || Date.now() > drainUntil) return;
      }
    } catch {
      // the server is between containers: ask again
    }
    await new Promise((r) => window.setTimeout(r, READY_POLL_MS));
  }
}

/** Replaces the page with itself: every query parameter Discord gave the frame stays. */
export function replacePage() {
  window.location.replace(window.location.href);
}

/**
 * Tears the page down cleanly and reloads it onto the build being served. `current`: this page's
 * build, so a server still serving it (a deploy's old container) is given a few seconds to hand
 * over first. Safe to call more than once: only the first goes.
 */
export async function reloadCleanly(current?: string): Promise<void> {
  if (reloading) return;
  reloading = true;
  shutdown();
  // (the dev server is the game server's neighbour, not its host: nothing to wait for)
  if (import.meta.env.PROD) await waitForServer(current);
  else await new Promise((r) => window.setTimeout(r, 800));
  replacePage();
}
let reloading = false;

/** Lets go of everything at once (the room, the render loop, the audio): the page is about to be
 *  replaced. Idempotent. */
export function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  listeners.forEach((l) => l());
  for (const fn of teardowns) {
    try {
      fn();
    } catch {
      // a teardown that fails must not keep the page from reloading
    }
  }
  teardowns.clear();
}

// A chunk from an older build that the new server no longer has (the page outlived a deploy): the
// page reloads onto the new build instead of throwing. At most once a minute, so a truly missing
// chunk cannot loop.
const PRELOAD_KEY = "cozy-preload-reload";
export function installPreloadErrorReload() {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(PRELOAD_KEY)) || 0;
      sessionStorage.setItem(PRELOAD_KEY, String(Date.now()));
    } catch {
      // storage blocked: reload anyway
    }
    if (Date.now() - last < 60_000) return;
    void reloadCleanly();
  });
}
