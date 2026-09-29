import { useSyncExternalStore } from "react";
import type { CaveProspect, Vec3 } from "@shared/caverns_mining";

// The local player's prospecting at a node in the Glimmering Caverns, kept out of React state like
// the ring's bout (systems/boutStore.ts): the server's "caveProspect" opens it (the node, its weak
// spot, the pickaxe's reach on it), "caveWeak" moves the weak spot as a direct strike runs the
// fissure on, and "caveProspectEnd" (walked off, stepped back, the node broke, a trip) closes it. The
// camera (scene/prospectCamera.ts), the rock's tells and its proxy collider (scene/ProspectingView.tsx)
// and the walk (a floor click is no walk order while it is open) all read it.

export interface ProspectState extends CaveProspect {
  /** Bumped each time the weak spot moves (the tells re-seat on the rock). */
  rev: number;
}

let current: ProspectState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const prospectStore = {
  get active() {
    return current !== null;
  },
  get(): ProspectState | null {
    return current;
  },
  open(p: CaveProspect) {
    current = { ...p, rev: (current?.rev ?? 0) + 1 };
    emit();
  },
  weak(node: string, weak: Vec3) {
    if (!current || current.node !== node) return;
    current = { ...current, weak, rev: current.rev + 1 };
    emit();
  },
  close() {
    if (!current) return;
    current = null;
    emit();
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProspect(): ProspectState | null {
  return useSyncExternalStore(subscribe, () => current);
}
