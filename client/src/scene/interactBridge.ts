// The HUD's action dock lives outside the Canvas but has to trigger exactly what clicking a seat or
// Mochi in the scene does (walk to the approach point, then sit or use). The scene registers its
// handlers here; the HUD calls them by id. A plain module slot, like cameraFocus.
export interface InteractHandlers {
  /** Walk to a prop's approach point and use it (Mochi opens her playroom). */
  useProp: (propId: string) => void;
  /** Walk to a seat and sit on it; if you are already sitting on it, stand up. */
  sit: (chairId: string) => void;
  /** Sit on the nearest free seat in reach; false when there is none. */
  sitNearest: () => boolean;
  /** Get up from wherever you are sitting. */
  stand: () => void;
  walkTo: (x: number, z: number) => void;
}

export const interactBridge: { current: InteractHandlers | null } = { current: null };
