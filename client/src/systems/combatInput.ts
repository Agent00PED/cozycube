import { useEffect, useSyncExternalStore } from "react";
import { GUARD, MOVES, SWAY, type BoxingPacket } from "@shared/boxing";
import { heldScreenDirection, screenToWorld } from "./input";

// The Velvet Ring's controls, for the local fighter (the HUD mounts useCombatInput while they are
// in a round). On a keyboard and mouse:
//
//   left click     Jab (a Counter Uppercut instead, right after a Perfect Parry)
//   right click    Heavy Hook (3.5 s)
//   Space          Guard, held (1 s at most, 2 s between guards); down on the canvas, a tap to get up
//   R (+ WASD)     Sway: a slip that way (back, with no direction), 0.2 s untouchable (2.5 s)
//
// On a touch screen the HUD's combat cluster sends the same packets (and the floating joystick
// moves you). Never while something is being typed or a panel is open. The cooldowns here are the
// client's own prediction (the server keeps the real ones and refuses a punch thrown too soon): the
// cluster's sweeps and the key hints read them.

/** Whether the local player is fighting a round right now (the canvas's right button then throws a
 *  hook instead of panning; a left click on the floor is a jab, not a walk). */
export const combatInput = { active: false, downed: false };

/** When each move is ready again (performance.now ms). */
export const cooldowns = { jab: 0, hook: 0, guard: 0, sway: 0 };
/** The guard is up (the local press), since then (performance.now ms). */
let guardSince = 0;
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  listeners.forEach((l) => l());
}
export function useCooldownVersion(): number {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
    () => version
  );
}

/** Whether keys and clicks belong to the ring right now (nothing typed, no panel open). */
function free(target: EventTarget | null): boolean {
  const el = (target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  const active = document.activeElement as HTMLElement | null;
  for (const e of [el, active]) if (e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable)) return false;
  return !document.querySelector('[role="dialog"]');
}

/** The moves, as the HUD's buttons and the keys throw them (each checks its own cooldown). */
export function makeMoves(send: (p: BoxingPacket) => void) {
  const m = {
    jab() {
      if (combatInput.downed) return send({ type: "MASH" });
      const now = performance.now();
      if (now < cooldowns.jab) return;
      cooldowns.jab = now + MOVES.jab.cooldown * 1000;
      send({ type: "JAB" });
      changed();
    },
    hook() {
      if (combatInput.downed) return send({ type: "MASH" });
      const now = performance.now();
      if (now < cooldowns.hook) return;
      cooldowns.hook = now + MOVES.hook.cooldown * 1000;
      cooldowns.jab = Math.max(cooldowns.jab, now + MOVES.jab.cooldown * 1000);
      send({ type: "HOOK" });
      changed();
    },
    guard(on: boolean) {
      if (combatInput.downed) {
        if (on) send({ type: "MASH" });
        return;
      }
      const now = performance.now();
      if (on) {
        if (now < cooldowns.guard || guardSince) return;
        guardSince = now;
        send({ type: "GUARD", on: true });
        // it drops by itself after its longest hold
        window.setTimeout(() => {
          if (guardSince && performance.now() - guardSince >= GUARD.maxHold * 1000 - 20) m.guard(false);
        }, GUARD.maxHold * 1000);
      } else {
        if (!guardSince) return;
        guardSince = 0;
        cooldowns.guard = now + GUARD.cooldown * 1000;
        send({ type: "GUARD", on: false });
      }
      changed();
    },
    sway(dir?: { x: number; z: number } | null) {
      if (combatInput.downed) return;
      const now = performance.now();
      if (now < cooldowns.sway) return;
      cooldowns.sway = now + SWAY.cooldown * 1000;
      const held = dir ?? (() => {
        const s = heldScreenDirection();
        return s ? screenToWorld(s.x, s.y) : null;
      })();
      send(held ? { type: "SWAY", dx: held.x, dz: held.z } : { type: "SWAY" });
      changed();
    },
    guarding: () => guardSince > 0,
  };
  return m;
}
export type Moves = ReturnType<typeof makeMoves>;

/** A fresh bout: every cooldown ready. */
export function resetCooldowns() {
  cooldowns.jab = cooldowns.hook = cooldowns.guard = cooldowns.sway = 0;
  guardSince = 0;
  changed();
}

/** Listens for the keyboard and mouse controls while `active` (the local fighter in a round). */
export function useCombatInput(active: boolean, moves: Moves) {
  useEffect(() => {
    combatInput.active = active;
    if (!active) return;
    const onMouseDown = (e: MouseEvent) => {
      // only on the scene itself (a click on the HUD is the HUD's)
      if ((e.target as HTMLElement | null)?.tagName !== "CANVAS" || !free(e.target)) return;
      if (e.button === 0) moves.jab();
      else if (e.button === 2) {
        e.preventDefault();
        moves.hook();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !free(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault(); // never a click on a focused button
        moves.guard(true);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        moves.sway();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") moves.guard(false);
    };
    const onBlur = () => moves.guard(false);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      combatInput.active = false;
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      moves.guard(false);
    };
  }, [active, moves]);
}
