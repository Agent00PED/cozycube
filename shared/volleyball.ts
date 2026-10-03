// The beach ball's physics, shared by the server (which owns the ball) and the client (which runs
// the SAME step between network patches, so the ball flies smoothly at 60 FPS instead of hopping at
// the patch rate). A free kick-about on the flat stretch of sand in the middle of Sunset Beach
// (shared/worlds/beach.ts BALL_COURT): no net, no score. The ball's `y` is its height over that
// flat (whoever draws it adds the flat's own height), and it never leaves the stretch: it comes
// back off the rim of the sand round it.
import { BALL_COURT } from "./worlds/beach";

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export const BALL_RADIUS = 0.18;
const GRAVITY = 9.8;
const RESTITUTION = 0.58; // bounce energy kept off the sand
const BOUNCE_FRICTION = 0.78; // horizontal speed kept on each bounce
const ROLL_FRICTION = 2.2; // units/s^2 of deceleration while rolling
const REST_SPEED = 0.06;

/** Where the ball lies to begin with, and where a ball left lying goes back to: the flat's middle. */
export const BALL_HOME: BallState = { x: BALL_COURT.x, y: BALL_RADIUS, z: BALL_COURT.z, vx: 0, vy: 0, vz: 0 };
/** How far from the flat's middle the ball may go (the flat, and a step of the sand round it). */
export const BALL_RANGE = BALL_COURT.r + 0.8;

/** Advances the ball by dt seconds, in place. Returns true while it is still moving. */
export function stepBall(ball: BallState, dt: number): boolean {
  const onGround = ball.y <= BALL_RADIUS + 1e-3 && Math.abs(ball.vy) < 0.05;

  if (onGround) {
    // rolling: decelerate to a stop instead of skating forever
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed < REST_SPEED) {
      ball.vx = 0;
      ball.vz = 0;
      ball.vy = 0;
      ball.y = BALL_RADIUS;
      return false;
    }
    const slowed = Math.max(0, speed - ROLL_FRICTION * dt);
    ball.vx *= slowed / speed;
    ball.vz *= slowed / speed;
  } else {
    ball.vy -= GRAVITY * dt;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  // the sand
  if (ball.y < BALL_RADIUS) {
    ball.y = BALL_RADIUS;
    if (ball.vy < -0.6) {
      ball.vy = -ball.vy * RESTITUTION;
      ball.vx *= BOUNCE_FRICTION;
      ball.vz *= BOUNCE_FRICTION;
    } else {
      ball.vy = 0;
    }
  }

  // the rim of the stretch: the ball comes back off it rather than being lost
  const dx = ball.x - BALL_COURT.x;
  const dz = ball.z - BALL_COURT.z;
  const d = Math.hypot(dx, dz);
  const limit = BALL_RANGE - BALL_RADIUS;
  if (d > limit) {
    const nx = dx / d;
    const nz = dz / d;
    ball.x = BALL_COURT.x + nx * limit;
    ball.z = BALL_COURT.z + nz * limit;
    const out = ball.vx * nx + ball.vz * nz;
    if (out > 0) {
      ball.vx -= 1.5 * out * nx;
      ball.vz -= 1.5 * out * nz;
    }
  }
  return true;
}

/** A player's bump: a lob in their direction of travel. */
export function kickBall(ball: BallState, dirX: number, dirZ: number) {
  const len = Math.hypot(dirX, dirZ) || 1;
  ball.vx = (dirX / len) * 3.6;
  ball.vz = (dirZ / len) * 3.6;
  ball.vy = 6.0;
  ball.y = Math.max(ball.y, BALL_RADIUS + 0.02);
}

/** How close (on the ground plane) a player has to be to bump the ball. */
export const KICK_REACH = 0.62;
