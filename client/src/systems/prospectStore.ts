import { useSyncExternalStore } from "react";
import type { CaveProspect, CaveStrike, StrikeVerdict, Vec3 } from "@shared/caverns_mining";

// The local player's prospecting at a node in the Glimmering Caverns, kept out of React state like
// the ring's bout (systems/boutStore.ts): the server's "caveProspect" opens it (the node, its weak
// spot, the pickaxe's reach on it), "caveWeak" moves the weak spot as a direct strike runs the
// fissure on, and "caveProspectEnd" (walked off, stepped back, the node broke, a trip) closes it. The
// camera (scene/prospectCamera.ts), the rock's ring and tells and its proxy collider
// (scene/ProspectingView.tsx), the HUD (components/hud/ProspectingHud.tsx) and the walk (a floor
// click is no walk order while it is open) all read it.
//
// It also keeps how the rock is going (its damage, as every strike on it is told) and your own last
// blow (its verdict, a Perfect, your run of Perfects), for the HUD; the run outlives the close-up
// (it goes on from node to node).

export interface ProspectState extends CaveProspect {
  /** Bumped each time the weak spot moves (the tells re-seat on the rock). */
  rev: number;
  /** When the close-up opened (performance.now ms): the ring's pulse runs from it, as the server's. */
  openedAt: number;
  /** The node's damage (0 whole .. 1 broken), as the strikes on it are told. */
  dmg: number;
}

/** Your own last blow, and your run of Perfects (the HUD's pop and chip). */
export interface BlowNote {
  verdict: StrikeVerdict;
  perfect: boolean;
  at: number;
}

let current: ProspectState | null = null;
let blow: BlowNote | null = null;
let streak = 0;
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
    const same = current?.node === p.node;
    current = { ...p, rev: (current?.rev ?? 0) + 1, openedAt: performance.now(), dmg: same ? (current?.dmg ?? 0) : 0 };
    emit();
  },
  weak(node: string, weak: Vec3) {
    if (!current || current.node !== node) return;
    current = { ...current, weak, rev: current.rev + 1 };
    emit();
  },
  /** A strike on a node (anyone's): the rock's damage; yours, the verdict and your run. */
  strike(st: CaveStrike, mine: boolean) {
    if (mine) {
      blow = { verdict: st.verdict, perfect: !!st.perfect, at: performance.now() };
      if (typeof st.streak === "number") streak = st.streak;
    }
    if (current && current.node === st.node) current = { ...current, dmg: st.dmg };
    if (mine || current?.node === st.node) emit();
  },
  close() {
    if (!current) return;
    current = null;
    emit();
  },
  /** When the ring's pulse started, ms (performance.now), or null. */
  openedAt(): number | null {
    return current?.openedAt ?? null;
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
export function useBlow(): { blow: BlowNote | null; streak: number } {
  const b = useSyncExternalStore(subscribe, () => blow);
  const n = useSyncExternalStore(subscribe, () => streak);
  return { blow: b, streak: n };
}
