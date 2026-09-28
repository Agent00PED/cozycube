import { useEffect } from "react";
import { BUFFER_S, CHAIN_WINDOW_S, FEINT_WINDOW_S, M1_CHAIN, dashSide, moveTiming, type BoxMove, type BoxingPacket } from "@shared/boxing";
import { heldScreenDirection, screenToWorld } from "./input";
import { cornerOfSession, getBout } from "./boutStore";
import { drawnAt, playMove } from "./fightAnim";
import { liveMotion } from "./liveMotion";
import { cameraFocus } from "../scene/cameraFocus";

// The Velvet Ring's controls, for the local fighter (the HUD mounts useCombatInput while they are in
// the ring). No cooldowns: every move goes to the server the moment it is pressed, and the server
// throws it when the fighter is free (a press in a move's last BUFFER_S waits for its end). On a
// keyboard and mouse:
//
//   left click          M1: the three-punch string (a Counter's uppercut after a Perfect Dodge)
//   right click         M2: the Heavy Smash (guard within its first 0.15 s: a Feint)
//   F or Shift, held    the guard (release to drop it); in an M2's wind-up, the Feint
//   Space (+ WASD)      a dash that way (a slip left or right, a sway back, a step in); none held,
//                       straight back
//   down on the canvas  any of them (Space too) is a tap toward getting up
//
// On a touch screen the HUD's combat cluster calls the same moves (the floating joystick aims the
// dash). Never while something is being typed or a panel is open. Your own punches, feints and
// dashes start animating the moment you press (the prediction below: the server's echo is not
// played twice), on the same frames the server runs.

/** Whether the local player is fighting in the ring right now (a left click on the floor is then an
 *  M1, not a walk; the right button an M2, never a pan). */
export const combatInput = { active: false, downed: false };

/** The local prediction: when the move being played is over (performance.now ms), the next punch of
 *  the M1 string while its window is open, and when an M2 was thrown (for the Feint). */
const local = { busyUntil: 0, chain: 0, chainUntil: 0, smashAt: -1e9, queued: 0 };

/** Whether keys and clicks belong to the ring right now (nothing typed, no panel open). */
function free(target: EventTarget | null): boolean {
  const el = (target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  const active = document.activeElement as HTMLElement | null;
  for (const e of [el, active]) if (e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable)) return false;
  return !document.querySelector('[role="dialog"]');
}

/** The local fighter as the bout has them (null: not in it). */
function me(sessionId: string) {
  const b = getBout();
  const c = cornerOfSession(b, sessionId);
  return c ? { f: b[c], foe: b[c === "red" ? "blue" : "red"], phase: b.phase } : null;
}

/** The moves, as the HUD's buttons and the keys throw them. */
export function makeMoves(send: (p: BoxingPacket) => void, sessionId: string) {
  /** Play a punch the moment it would come out (now, or at the end of what is playing if that is
   *  within the buffer), as the server will. */
  const predictPunch = (kind: "m1" | "m2") => {
    const at = me(sessionId);
    if (!at || at.f.state === "hurt" || at.f.state === "stun" || at.f.state === "stagger" || at.f.state === "down" || at.f.state === "out") return;
    if (at.phase !== "fight" && at.phase !== "warmup") return;
    const now = performance.now();
    const wait = local.busyUntil - now;
    if (wait > BUFFER_S * 1000) return;
    const fire = () => {
      const t = performance.now();
      let move: BoxMove;
      if (kind === "m2") move = "smash";
      else if (at.f.counter && at.phase === "fight") move = "uppercut";
      else {
        const step = t <= local.chainUntil ? local.chain : 0;
        move = M1_CHAIN[step];
        local.chain = (step + 1) % M1_CHAIN.length;
      }
      if (kind === "m2" || move === "uppercut") local.chain = 0;
      const timing = moveTiming(move, at.f.exhausted && at.phase === "fight");
      local.busyUntil = t + timing.total * 1000;
      local.chainUntil = local.busyUntil + CHAIN_WINDOW_S * 1000;
      if (move === "smash") local.smashAt = t;
      playMove(sessionId, move, { windup: timing.windup, total: timing.total, predicted: true });
    };
    if (wait > 0) {
      window.clearTimeout(local.queued);
      local.queued = window.setTimeout(fire, wait);
    } else fire();
  };

  const m = {
    m1() {
      if (combatInput.downed) return send({ type: "MASH" });
      send({ type: "M1" });
      predictPunch("m1");
    },
    m2() {
      if (combatInput.downed) return send({ type: "MASH" });
      send({ type: "M2" });
      predictPunch("m2");
    },
    guard(on: boolean) {
      if (combatInput.downed) {
        if (on) send({ type: "MASH" });
        return;
      }
      send({ type: "GUARD", on });
      // guarding early in your own M2's wind-up: the Feint
      if (on && performance.now() - local.smashAt <= FEINT_WINDOW_S * 1000) {
        local.smashAt = -1e9;
        local.busyUntil = 0;
        playMove(sessionId, "feint", { predicted: true });
      }
    },
    dash(dir?: { x: number; z: number } | null) {
      if (combatInput.downed) return send({ type: "MASH" });
      const held =
        dir ??
        (() => {
          const s = heldScreenDirection();
          return s ? screenToWorld(s.x, s.y) : null;
        })();
      send(held ? { type: "DASH", dx: held.x, dz: held.z } : { type: "DASH" });
      const at = me(sessionId);
      if (!at || at.f.exhausted || (at.f.state !== "" && at.f.state !== "block") || performance.now() < local.busyUntil) return;
      // the way it goes, seen from the fighter squared up to the other one
      const foe = at.foe.sessionId ? (drawnAt.get(at.foe.sessionId) ?? liveMotion.get(at.foe.sessionId)) : undefined;
      const facing = foe ? { x: foe.x - cameraFocus.x, z: foe.z - cameraFocus.z } : { x: 0, z: -1 };
      const side = dashSide(facing, held ?? { x: 0, z: 0 });
      local.busyUntil = performance.now() + 160;
      playMove(sessionId, `dash${side}`, { predicted: true });
    },
  };
  return m;
}
export type Moves = ReturnType<typeof makeMoves>;

/** A fresh round: nothing held over from the last. */
export function resetCombatPrediction() {
  window.clearTimeout(local.queued);
  local.busyUntil = 0;
  local.chain = 0;
  local.chainUntil = 0;
  local.smashAt = -1e9;
}

const GUARD_KEYS = new Set(["KeyF", "ShiftLeft", "ShiftRight"]);

/** Listens for the keyboard and mouse controls while `active` (the local fighter in the ring). */
export function useCombatInput(active: boolean, moves: Moves) {
  useEffect(() => {
    combatInput.active = active;
    if (!active) return;
    const held = new Set<string>();
    const onPointerDown = (e: PointerEvent) => {
      // the mouse on the scene itself (a click on the HUD is the HUD's; a touch is the cluster's)
      if (e.pointerType !== "mouse" || (e.target as HTMLElement | null)?.tagName !== "CANVAS" || !free(e.target)) return;
      if (e.button === 0) moves.m1();
      else if (e.button === 2) {
        e.preventDefault();
        moves.m2();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !free(e.target)) return;
      if (GUARD_KEYS.has(e.code)) {
        e.preventDefault();
        if (held.size === 0) moves.guard(true);
        held.add(e.code);
      } else if (e.code === "Space") {
        e.preventDefault(); // never a click on a focused button
        moves.dash();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!GUARD_KEYS.has(e.code) || !held.delete(e.code)) return;
      if (held.size === 0) moves.guard(false);
    };
    const onBlur = () => {
      if (held.size > 0) moves.guard(false);
      held.clear();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      combatInput.active = false;
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      if (held.size > 0) moves.guard(false);
    };
  }, [active, moves]);
}
