// Continuous movement input: WASD / arrow keys on a keyboard, and on a touch screen the floating
// joystick (components/hud/TouchControls.tsx: a thumb put down in the screen's lower-left). They
// write screen-space vectors here; the movement hook turns them into a world direction relative to
// the isometric camera every frame. Plain module objects, like cameraFocus: they change many times
// a second and nothing about them belongs in React state. A tap on the floor still walks you there,
// and a tap on a seat, a prop or a person walks you up to it and uses it (the scene's raycast):
// the joystick takes over only once the thumb drags.

export const moveInput = {
  /** Screen-space direction, -1..1 on each axis (x right, y up), length <= 1. */
  x: 0,
  y: 0,
  /** True while a key is actively driving. */
  active: false,
};

// The isometric camera looks along (1, 1, 1): screen-right is the ground diagonal (+x, -z) and
// screen-up is (-x, -z). Both normalised, so a held key is a full walking speed. The camera rig
// keeps them in step with the camera as it is (the Velvet Ring's action camera turns round the
// fighters: a held key still walks the way it points on screen).
const RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
const UP = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

/** The camera's screen-right and screen-up along the ground (unit vectors), each frame. */
export function setScreenAxes(rx: number, rz: number, ux: number, uz: number) {
  const r = Math.hypot(rx, rz);
  const u = Math.hypot(ux, uz);
  if (r < 1e-4 || u < 1e-4) return;
  RIGHT.x = rx / r;
  RIGHT.z = rz / r;
  UP.x = ux / u;
  UP.z = uz / u;
}

/** A world direction as the screen sees it: how much of it runs right, and how much up (the
 *  camera's own right and up along the ground). */
export function worldToScreen(dx: number, dz: number): { x: number; y: number } {
  return { x: dx * RIGHT.x + dz * RIGHT.z, y: dx * UP.x + dz * UP.z };
}

/** The touch joystick's thumb: a screen-space direction (-1..1, y up), `active` once it drags past
 *  its dead zone, `held` while a thumb is on it at all (a second finger is then not a pinch). */
export const stickInput = {
  x: 0,
  y: 0,
  active: false,
  held: false,
};

/** The screen-space direction held right now (the keys first, then the joystick), or null. */
export function heldScreenDirection(): { x: number; y: number } | null {
  if (moveInput.active) return { x: moveInput.x, y: moveInput.y };
  if (stickInput.active) return { x: stickInput.x, y: stickInput.y };
  return null;
}

/** A screen-space direction as a world one (unit length). */
export function screenToWorld(sx: number, sy: number): { x: number; z: number } {
  const x = RIGHT.x * sx + UP.x * sy;
  const z = RIGHT.z * sx + UP.z * sy;
  const n = Math.hypot(x, z) || 1;
  return { x: x / n, z: z / n };
}

/** The current input as a world-space direction (unit length or shorter), or null when idle. */
export function worldMoveDirection(): { x: number; z: number; strength: number } | null {
  const held = heldScreenDirection();
  if (!held) return null;
  const len = Math.hypot(held.x, held.y);
  if (len < 0.05) return null;
  const w = screenToWorld(held.x, held.y);
  return { x: w.x, z: w.z, strength: Math.min(1, len) };
}

const keys = new Set<string>();
function keyVector() {
  let x = 0;
  let y = 0;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
  const n = Math.hypot(x, y) || 1;
  return { x: x / n, y: y / n, any: x !== 0 || y !== 0 };
}

/** Space was pressed since the movement hook last looked: seated, it means "stand up". */
let standPressed = false;
/** Whether Space was pressed since the last call (and forget it either way). */
export function consumeStandPress(): boolean {
  const pressed = standPressed;
  standPressed = false;
  return pressed;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Listens for WASD / arrows for the app's lifetime; returns the teardown. */
export function installKeyboard(): () => void {
  const sync = () => {
    const k = keyVector();
    moveInput.x = k.x;
    moveInput.y = k.y;
    moveInput.active = k.any;
  };
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    // Space stands you up from a seat (a focused button keeps its own Space: it is a click there)
    if (e.code === "Space" && !e.repeat && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
      standPressed = true;
      return;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      keys.add(e.code);
      if (e.code.startsWith("Arrow")) e.preventDefault(); // no page scrolling under the game
      sync();
    }
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
    sync();
  };
  const blur = () => {
    keys.clear();
    sync();
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    keys.clear();
    sync();
  };
}

/** A touch-first device (the controls hint says so); `matchMedia` is the honest test, touch events the fallback. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  return "ontouchstart" in window && navigator.maxTouchPoints > 0;
}
