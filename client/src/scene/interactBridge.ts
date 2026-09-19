// The HUD's action dock lives outside the Canvas but has to trigger exactly what clicking a prop
// in the scene does (walk to its approach point, then use it). WorldScene registers its click
// handlers here; the dock calls them by id. A plain module slot, like cameraFocus.
export interface InteractHandlers {
  useProp: (propId: string) => void;
  sit: (chairId: string) => void;
  walkTo: (x: number, z: number) => void;
}

export const interactBridge: { current: InteractHandlers | null } = { current: null };
