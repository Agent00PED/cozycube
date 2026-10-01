import { CAVE_WINCH, RAFT_EMPTY_S, RAFT_RIDE_S, WINCH_DOWN_S, WINCH_RIDE_S, raftAt, raftRest, raftRidePose, winchDownPose, winchReturn, winchRidePose, type RaftSide } from "@shared/worlds/caverns";

// Gus's winch lift, drawn: the server sets a rider down on the ledge at once and marks them riding
// ("winch") for WINCH_RIDE_S; every client draws the same climb from the moment it sees the ride
// start (winchRidePose: a step into the cage, the climb, a step off onto the ledge), and the empty
// cage going back down after it (winchReturn). Players.tsx and useLocalPlayerMovement ask `riderPose`
// for a rider's pose each frame; CavernsWorld's WinchRig moves the cage, the rope and the drum from
// `cageLift`.

const rides = new Map<string, number>();
/** Who is walking (on the landing, into or out of the cage) rather than riding, this frame. */
const walkers = new Set<string>();
export function riderWalking(sessionId: string): boolean {
  return walkers.has(sessionId);
}
const downs = new Map<string, number>();

/** The raft (docs/caverns-roadmap.md R2.10), as the room last said: the side it is headed for or
 *  rests at, its crossing under way (a ride or an empty drift) and when this client saw it begin. */
export const raftState: { side: RaftSide; move: "" | "ride" | "empty"; seenAt: number } = { side: "north", move: "", seenAt: -1 };
/** The room's raft (JSON) taken in: a new crossing starts its clock here and now. */
export function takeRaft(raw: string, now = performance.now()) {
  let v: { side?: RaftSide; move?: "ride" | "empty"; at?: number } = {};
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    v = {};
  }
  const side: RaftSide = v.side === "islet" ? "islet" : "north";
  const move = v.move === "ride" || v.move === "empty" ? v.move : "";
  if (side !== raftState.side || move !== raftState.move || raftState.seenAt < 0) {
    raftState.side = side;
    raftState.move = move;
    // (a crossing already under way when this client joined: drawn as done)
    raftState.seenAt = raftState.seenAt < 0 && move ? now - 60_000 : now;
  }
}
/** Where the raft is drawn this frame. */
export function raftPose(now = performance.now()): { x: number; z: number; yaw: number } {
  const { side, move, seenAt } = raftState;
  const t = (now - seenAt) / 1000;
  if (move === "ride" && t < RAFT_RIDE_S) return raftRidePose(t, side).raft;
  if (move === "empty" && t < RAFT_EMPTY_S) return raftAt(t, side, RAFT_EMPTY_S);
  return raftRest(side);
}
const raftRides = new Map<string, number>();

/** Where the rider `sessionId` is drawn this frame (null: not riding). */
export function riderPose(sessionId: string, action: string, now = performance.now()) {
  if (action === "raft") {
    let at = raftRides.get(sessionId);
    if (at === undefined) {
      at = raftState.move === "ride" ? raftState.seenAt : now;
      raftRides.set(sessionId, at);
    }
    const p = raftRidePose(Math.min(RAFT_RIDE_S, (now - at) / 1000), raftState.side);
    walkers.delete(sessionId);
    return { x: p.x, z: p.z, y: p.y, facing: p.facing, cage: 0, walking: false };
  }
  raftRides.delete(sessionId);
  // the way down (docs/caverns-roadmap.md R5.3): the cage wound up for the rider, then lowered
  if (action === "winchdown") {
    let at = downs.get(sessionId);
    // (a ride long over, its entry stale: a new one)
    if (at !== undefined && now - at > WINCH_DOWN_S * 1000 + 3000) at = undefined;
    if (at === undefined) {
      at = now;
      downs.set(sessionId, at);
    }
    const d = winchDownPose(Math.min(WINCH_DOWN_S, (now - at) / 1000));
    if (d.walking) walkers.add(sessionId);
    else walkers.delete(sessionId);
    return d;
  }
  // (the cage keeps the ride's own clock: never cut short by a frame that saw another action)
  if (action !== "winch") {
    rides.delete(sessionId);
    walkers.delete(sessionId);
    return null;
  }
  let at = rides.get(sessionId);
  // (a ride long over whose end this client never drew: a new one)
  if (at !== undefined && now - at > WINCH_RIDE_S * 1000 + 3000) at = undefined;
  if (at === undefined) {
    at = now;
    rides.set(sessionId, at);
  }
  const up = winchRidePose(Math.min(WINCH_RIDE_S, (now - at) / 1000), CAVE_WINCH.lower);
  if (up.walking) walkers.add(sessionId);
  else walkers.delete(sessionId);
  return up;
}

/** The cage's own clock (docs/caverns-roadmap.md R8.8): it watches the riders in the room itself, never
 *  a side effect of drawing one, so it moves whoever draws the rider and whenever this client joined.
 *  `watch` is fed the room's players once a frame; `lift` is how far up the cage is (0: at the rift's
 *  floor). */
export class CageClock {
  private rideAt = -1;
  private doneAt = -1;
  private downAt = -1;
  private riding = new Set<string>();
  private lowering = new Set<string>();
  watch(players: Iterable<[string, { map?: string; action?: string }]>, now = performance.now()) {
    const up = new Set<string>();
    const down = new Set<string>();
    for (const [id, p] of players) {
      if (p.map !== "glimmering_caverns") continue;
      if (p.action === "winch") up.add(id);
      else if (p.action === "winchdown") down.add(id);
    }
    for (const id of up)
      if (!this.riding.has(id)) {
        this.rideAt = now;
        this.doneAt = -1;
        this.downAt = -1;
      }
    // (the rider off: the cage goes back down from where the ride left it)
    if (this.riding.size && !up.size && this.rideAt >= 0 && this.doneAt < 0) this.doneAt = Math.min(now, this.rideAt + WINCH_RIDE_S * 1000);
    for (const id of down)
      if (!this.lowering.has(id)) {
        this.downAt = now;
        this.rideAt = -1;
      }
    this.riding = up;
    this.lowering = down;
  }
  lift(now = performance.now()): number {
    if (this.downAt >= 0) return now - this.downAt < WINCH_DOWN_S * 1000 ? winchDownPose((now - this.downAt) / 1000).cage : 0;
    if (this.rideAt < 0) return 0;
    if (this.doneAt < 0) return winchRidePose(Math.min(WINCH_RIDE_S, (now - this.rideAt) / 1000), CAVE_WINCH.lower).cage;
    return Math.max(0, winchReturn((now - this.doneAt) / 1000));
  }
}
