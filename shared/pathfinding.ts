import type { MapId } from "./types";
import { GRID_LIMIT, isBlocked } from "./collision";

// Grid A* over the same collision the server validates against.
//
// Click-to-move used to walk a straight line and rely on wall-sliding to get round furniture,
// which works for a coffee table but leaves you grinding against the far side of an L-sofa.
// A path around obstacles fixes that at the source. It is shared (not client-only) so the world
// validator can prove every seat is actually reachable from every spawn, using the exact code
// the game runs.

export interface Point {
  x: number;
  z: number;
}

const CELL = 0.25;
// One grid size for every map (the largest, the 28x28 valley); smaller maps simply have their
// outer cells blocked by isBlocked's per-map limit.
const SIZE = Math.ceil((GRID_LIMIT * 2) / CELL) + 1;
const PLAYER_RADIUS = 0.3;

const gridCache = new Map<MapId, Uint8Array>();

function toCell(v: number): number {
  return Math.round((v + GRID_LIMIT) / CELL);
}
function toWorld(c: number): number {
  return c * CELL - GRID_LIMIT;
}

/** 1 = walkable. Built once per map, lazily — about 5.8k collision tests. */
function walkGrid(mapId: MapId): Uint8Array {
  let grid = gridCache.get(mapId);
  if (grid) return grid;
  grid = new Uint8Array(SIZE * SIZE);
  for (let cz = 0; cz < SIZE; cz++) {
    for (let cx = 0; cx < SIZE; cx++) {
      grid[cz * SIZE + cx] = isBlocked(toWorld(cx), toWorld(cz), mapId, PLAYER_RADIUS) ? 0 : 1;
    }
  }
  gridCache.set(mapId, grid);
  return grid;
}

function walkable(grid: Uint8Array, cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < SIZE && cz < SIZE && grid[cz * SIZE + cx] === 1;
}

/** Nearest walkable cell to (cx, cz), searching outward in rings. */
function nearestWalkable(grid: Uint8Array, cx: number, cz: number, maxRing = 12): [number, number] | null {
  if (walkable(grid, cx, cz)) return [cx, cz];
  for (let r = 1; r <= maxRing; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!walkable(grid, cx + dx, cz + dz)) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = [cx + dx, cz + dz];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** True if a straight walk from a to b stays clear of every obstacle (sampled every 0.1). */
export function hasLineOfWalk(mapId: MapId, a: Point, b: Point): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(dist / 0.1));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, mapId, PLAYER_RADIUS)) return false;
  }
  return true;
}

// Tiny binary heap keyed on f-score — A* over a few thousand cells does not need more.
class MinHeap {
  private items: number[] = [];
  private scores: Float32Array;
  constructor(size: number) {
    this.scores = new Float32Array(size);
  }
  get size() {
    return this.items.length;
  }
  push(node: number, score: number) {
    this.scores[node] = score;
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[items[parent]] <= score) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = node;
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      let i = 0;
      const score = this.scores[last];
      for (;;) {
        const l = i * 2 + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const c = r < items.length && this.scores[items[r]] < this.scores[items[l]] ? r : l;
        if (this.scores[items[c]] >= score) break;
        items[i] = items[c];
        i = c;
      }
      items[i] = last;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Waypoints from `from` to `to` (excluding the start), routed around furniture. If `to` is
 * blocked, the path ends at the nearest reachable point instead. Returns null only when no
 * route exists at all.
 */
export function findPath(mapId: MapId, from: Point, to: Point): Point[] | null {
  // Most walks are across open floor — skip the search entirely when nothing is in the way.
  if (!isBlocked(to.x, to.z, mapId, PLAYER_RADIUS) && hasLineOfWalk(mapId, from, to)) return [to];

  const grid = walkGrid(mapId);
  const start = nearestWalkable(grid, toCell(from.x), toCell(from.z), 3);
  const goal = nearestWalkable(grid, toCell(to.x), toCell(to.z));
  if (!start || !goal) return null;

  const startId = start[1] * SIZE + start[0];
  const goalId = goal[1] * SIZE + goal[0];
  const g = new Float32Array(SIZE * SIZE).fill(Infinity);
  const came = new Int32Array(SIZE * SIZE).fill(-1);
  const closed = new Uint8Array(SIZE * SIZE);
  const open = new MinHeap(SIZE * SIZE);

  const h = (id: number) => {
    const dx = Math.abs((id % SIZE) - goal[0]);
    const dz = Math.abs(Math.floor(id / SIZE) - goal[1]);
    return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz); // octile distance
  };

  g[startId] = 0;
  open.push(startId, h(startId));
  let found = false;
  while (open.size > 0) {
    const current = open.pop();
    if (current === goalId) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % SIZE;
    const cz = Math.floor(current / SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!walkable(grid, nx, nz)) continue;
        // No cutting corners: a diagonal step needs both orthogonal neighbours open.
        if (dx !== 0 && dz !== 0 && (!walkable(grid, cx + dx, cz) || !walkable(grid, cx, cz + dz))) continue;
        const next = nz * SIZE + nx;
        if (closed[next]) continue;
        const cost = g[current] + (dx !== 0 && dz !== 0 ? SQRT2 : 1);
        if (cost < g[next]) {
          g[next] = cost;
          came[next] = current;
          open.push(next, cost + h(next));
        }
      }
    }
  }
  if (!found) return null;

  // Walk back, then string-pull: drop every waypoint you can see past.
  const cells: Point[] = [];
  for (let id = goalId; id !== -1 && id !== startId; id = came[id]) {
    cells.push({ x: toWorld(id % SIZE), z: toWorld(Math.floor(id / SIZE)) });
  }
  cells.reverse();
  // End exactly on the requested point when it is itself walkable.
  if (!isBlocked(to.x, to.z, mapId, PLAYER_RADIUS)) cells[cells.length - 1] = { x: to.x, z: to.z };

  const smoothed: Point[] = [];
  let anchor: Point = from;
  let i = 0;
  while (i < cells.length) {
    let furthest = i;
    for (let j = cells.length - 1; j > i; j--) {
      if (hasLineOfWalk(mapId, anchor, cells[j])) {
        furthest = j;
        break;
      }
    }
    smoothed.push(cells[furthest]);
    anchor = cells[furthest];
    i = furthest + 1;
  }
  return smoothed;
}

/** For tests and the validator: whether any route exists between two points. */
export function isReachable(mapId: MapId, from: Point, to: Point): boolean {
  const path = findPath(mapId, from, to);
  if (!path || path.length === 0) return false;
  const end = path[path.length - 1];
  return Math.hypot(end.x - to.x, end.z - to.z) < 0.35;
}
