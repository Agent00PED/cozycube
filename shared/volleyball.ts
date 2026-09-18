// Beach volleyball physics, shared by the server (which owns the ball) and the client (which
// runs the SAME step between network patches, so the ball flies smoothly at 60 FPS instead of
// hopping at the patch rate).
import { SHORELINE_Z, WORLD_LIMIT } from "./collision";

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

// The net sits between the two posts on x = NET_X, across the court's z range.
export const COURT = { x0: -7.4, x1: -2.4, z0: -3.6, z1: 0.0 };
export const NET_X = -4.9;
export const NET_TOP = 1.75;

export const BALL_HOME: BallState = { x: -3.6, y: BALL_RADIUS, z: -1.8, vx: 0, vy: 0, vz: 0 };

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

  const prevX = ball.x;
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

  // the net: crossing its plane below the tape sends the ball back
  const crossed = (prevX - NET_X) * (ball.x - NET_X) < 0;
  if (crossed && ball.z > COURT.z0 && ball.z < COURT.z1 && ball.y - BALL_RADIUS < NET_TOP) {
    ball.x = prevX;
    ball.vx = -ball.vx * 0.35;
  }

  // the island's edges, and the waterline — the ball bounces back rather than being lost
  const limit = WORLD_LIMIT - BALL_RADIUS;
  if (Math.abs(ball.x) > limit) {
    ball.x = Math.sign(ball.x) * limit;
    ball.vx = -ball.vx * 0.5;
  }
  if (ball.z < -limit) {
    ball.z = -limit;
    ball.vz = -ball.vz * 0.5;
  }
  const shore = SHORELINE_Z - BALL_RADIUS - 0.1;
  if (ball.z > shore) {
    ball.z = shore;
    ball.vz = -ball.vz * 0.5;
  }
  return true;
}

/** A player's bump: a lob in their direction of travel, high enough to clear the net. */
export function kickBall(ball: BallState, dirX: number, dirZ: number) {
  const len = Math.hypot(dirX, dirZ) || 1;
  ball.vx = (dirX / len) * 3.6;
  ball.vz = (dirZ / len) * 3.6;
  ball.vy = 6.0;
  ball.y = Math.max(ball.y, BALL_RADIUS + 0.02);
}

/** How close (on the ground plane) a player has to be to bump the ball. */
export const KICK_REACH = 0.62;
