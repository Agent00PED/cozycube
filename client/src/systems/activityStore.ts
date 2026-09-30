// The local player's own beats at work in the Glimmering Caverns, kept out of React state like the
// prospect (prospectStore.ts): each written the moment it happens, never waiting for the server's
// echo, so your own avatar swings as you tap (entities/activityAnimations.ts) and the sparks fly
// with it (scene/caveFx.ts). Everyone else is drawn from the room's state: their action and the
// server's gestures, their forge and chisel on a loop of their own.
//
// Times are performance.now() in seconds.

export const activity = {
  /** A blow at a rock (a tap on its proxy), and whether it skidded off (the server's word). */
  blowAt: -Infinity,
  deflect: false,
  /** The forge's panel: which half is on (null: not at the forge), the bellows held, the last pump,
   *  the last hammer blow. */
  forge: null as null | "bellows" | "hammer",
  pumping: false,
  pumpAt: -Infinity,
  hammerAt: -Infinity,
  /** The geode's panel: turning it or winding the mallet (null: not at the anvil), the power, the blow. */
  geode: null as null | "aim" | "gauge",
  power: 0,
  chiselAt: -Infinity,
};

export const nowS = () => performance.now() / 1000;

/** A blow at the rock, as it is tapped. */
export function noteBlow() {
  activity.blowAt = nowS();
  activity.deflect = false;
}

/** Everyone's blows at the rocks as the room tells them (caveStrike: who, and whether it skidded
 *  off), by session: the other miners' swings are timed by them. */
export const remoteBlows = new Map<string, { at: number; deflect: boolean }>();
