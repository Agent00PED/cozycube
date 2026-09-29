import { useEffect, useState } from "react";

// A tiny store for floating banners (coin gains, achievements, arrivals). Anything can push;
// the <Toasts /> component at the top of the screen renders them and lets them float away.
export interface Toast {
  id: number;
  text: string;
  emoji?: string;
  tone: "info" | "coin" | "win" | "arrive";
  /** How long it stays (ms): a long one, a letter, stays long enough to read. */
  life: number;
}

const TOAST_LIFE_MS = 3600;
/** A long toast's time to read: about 45 ms a character, at most 12 s. */
export const toastLife = (text: string) => Math.max(TOAST_LIFE_MS, Math.min(12_000, text.length * 45));
const MAX_TOASTS = 4;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function pushToast(text: string, opts: { emoji?: string; tone?: Toast["tone"]; silent?: boolean } = {}) {
  const toast: Toast = { id: nextId++, text, emoji: opts.emoji, tone: opts.tone ?? "info", life: toastLife(text) };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, toast.life);
}

export function useToasts(): Toast[] {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
