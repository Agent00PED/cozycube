// The HUD's action dock and drawers live outside the Canvas but have to trigger exactly what
// clicking a prop in the scene does (walk to its approach point, then use it). WorldScene
// registers its click handlers here; the HUD calls them by id. A plain module slot, like
// cameraFocus.
export interface InteractHandlers {
  useProp: (propId: string) => void;
  sit: (chairId: string) => void;
  /** Walks to and sits on the nearest free seat; returns false when there is none in reach. */
  sitNearest: () => boolean;
  walkTo: (x: number, z: number) => void;
}

export const interactBridge: { current: InteractHandlers | null } = { current: null };
