// The beach ball as the room last told it (shared/volleyball.ts), kept OUT of React state: it
// changes twenty times a second. The room's hook writes it; the beach's ball reads it each frame and
// steps the same physics between patches.
export interface BallSnapshot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  receivedAt: number;
}
export const ballStore: { current: BallSnapshot | null } = { current: null };
