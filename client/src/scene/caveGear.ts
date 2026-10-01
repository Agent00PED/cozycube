// What the gear worn does to the cave's look (shared/gear.ts): the Lamp Pack's brighter glow round its
// wearer in the dark zones. Set by the app as the camp profile changes, read by the cave's own light
// (caveLight.tsx YourLight), kept out of React state and out of the caverns' own chunk.

export const lampBoost = { value: 1 };
