// The tree you would fell right now, on the campfire's clearing or in the Whispering Woods: the
// nearest grown one within reach (FellableTrees writes it every frame; the action dock reads it). A
// plain module object, like cameraFocus: a 60 Hz value is never routed through React.
export const treeTarget: { id: string | null } = { id: null };
