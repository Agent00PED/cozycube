// The tree in the Whispering Woods you would fell right now: the nearest mature one within reach
// (ForestWorld writes it every frame; the action dock reads it). A plain module object, like
// cameraFocus: a 60 Hz value is never routed through React.
export const forestTarget: { id: string | null } = { id: null };
