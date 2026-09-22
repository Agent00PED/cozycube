import { useEffect, useState } from "react";
import { playToast } from "../../audio/sfx";

// A tiny store for floating banners (coin gains, achievements, arrivals). Anything can push;
// the <Toasts /> component at the top of the screen renders them and lets them float away.
export interface Toast {
  id: number;
  text: string;
  emoji?: string;
  tone: "info" | "coin" | "win" | "arrive";
}

const TOAST_LIFE_MS = 3600;
const MAX_TOASTS = 4;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function pushToast(text: string, opts: { emoji?: string; tone?: Toast["tone"]; silent?: boolean } = {}) {
  const toast: Toast = { id: nextId++, text, emoji: opts.emoji, tone: opts.tone ?? "info" };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  emit();
  if (!opts.silent) playToast();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, TOAST_LIFE_MS);
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
