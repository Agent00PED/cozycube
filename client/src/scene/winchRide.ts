import { CAVE_WINCH, WINCH_RIDE_S, winchReturn, winchRidePose } from "@shared/worlds/caverns";

// Gus's winch lift, drawn: the server sets a rider down on the ledge at once and marks them riding
// ("winch") for WINCH_RIDE_S; every client draws the same climb from the moment it sees the ride
// start (winchRidePose: a step into the cage, the climb, a step off onto the ledge), and the empty
// cage going back down after it (winchReturn). Players.tsx and useLocalPlayerMovement ask `riderPose`
// for a rider's pose each frame; CavernsWorld's WinchRig moves the cage, the rope and the drum from
// `cageLift`.

const rides = new Map<string, number>();
const cage = { rideAt: -1, doneAt: -1 };

/** Where the rider `sessionId` is drawn this frame (null: not riding). */
export function riderPose(sessionId: string, action: string, now = performance.now()) {
  if (action !== "winch") {
    if (rides.delete(sessionId)) cage.doneAt = now;
    return null;
  }
  let at = rides.get(sessionId);
  if (at === undefined) {
    at = now;
    rides.set(sessionId, at);
    cage.rideAt = now;
    cage.doneAt = -1;
  }
  const t = (now - at) / 1000;
  if (t >= WINCH_RIDE_S) {
    // (the server's word that the ride is over is on its way: the rider waits on the ledge)
    if (cage.doneAt < 0) cage.doneAt = at + WINCH_RIDE_S * 1000;
    return winchRidePose(WINCH_RIDE_S, CAVE_WINCH.lower);
  }
  return winchRidePose(t, CAVE_WINCH.lower);
}

/** How far up the cage is this frame (0: waiting at the rift's floor). */
export function cageLift(now = performance.now()): number {
  if (cage.rideAt < 0) return 0;
  if (cage.doneAt < 0) return winchRidePose(Math.min(WINCH_RIDE_S, (now - cage.rideAt) / 1000), CAVE_WINCH.lower).cage;
  return Math.max(0, winchReturn((now - cage.doneAt) / 1000));
}
