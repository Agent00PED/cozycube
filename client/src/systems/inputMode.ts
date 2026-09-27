import { useSyncExternalStore } from "react";

// Touch or keyboard: whichever the player last used. A phone or a tablet starts in touch mode; a
// finger on the screen switches to it, a key or a mouse switches back (a touch laptop moves between
// the two as it is used). In touch mode <html> carries `touch-ui`, which hides every keyboard hint
// (`.kbd-hint`, index.css), shows the touch ones (`.touch-hint`), and widens every button's hit
// area to at least 48x48 without moving the layout.

let touch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === touch) return;
  touch = next;
  document.documentElement.classList.toggle("touch-ui", touch);
  listeners.forEach((l) => l());
}

/** Start following the input (once, at startup). */
export function installInputMode() {
  document.documentElement.classList.toggle("touch-ui", touch);
  window.addEventListener("pointerdown", (e) => set(e.pointerType === "touch" || (e.pointerType === "pen" && touch)), { capture: true, passive: true });
  window.addEventListener("keydown", () => set(false), { capture: true, passive: true });
}

export const isTouchUi = () => touch;

/** Whether the player is on touch right now (re-renders when that changes). */
export function useTouchUi(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => touch,
    () => false
  );
}
