import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Room } from "colyseus.js";
import type { Group } from "three";
import type { ChairSyncState, PlayerState, ToggleableSyncState } from "@shared/types";

const MOVE_SPEED = 3; // units/sec — must match MOVE_SPEED_PER_SEC in server/src/rooms/HangoutRoom.ts
const SEND_INTERVAL = 1 / 20; // 20 ticks/sec input throttle
const SNAP_THRESHOLD = 1.5; // authoritative drift beyond this snaps instead of drifting back
const ARRIVE_THRESHOLD = 0.05; // world units from target counted as "arrived"
const INTERACT_RADIUS = 1.5; // must match INTERACT_RADIUS in server/src/rooms/HangoutRoom.ts
const NEARBY_CHECK_INTERVAL = 1 / 10; // recompute the "Press E" target 10x/sec, not every frame

export interface NearbyInteractable {
  kind: "chair" | "toggleable";
  propId: string;
  x: number;
  z: number;
}

export interface MoveTarget {
  x: number;
  z: number;
}

function findNearest(
  x: number,
  z: number,
  mySessionId: string,
  chairs: Record<string, ChairSyncState>,
  toggleables: Record<string, ToggleableSyncState>
): NearbyInteractable | null {
  let best: NearbyInteractable | null = null;
  let bestDist = INTERACT_RADIUS;

  for (const chair of Object.values(chairs)) {
    if (chair.occupiedBy !== "" && chair.occupiedBy !== mySessionId) continue; // taken by someone else
    const dist = Math.hypot(x - chair.x, z - chair.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: "chair", propId: chair.propId, x: chair.x, z: chair.z };
    }
  }
  for (const prop of Object.values(toggleables)) {
    const dist = Math.hypot(x - prop.x, z - prop.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: "toggleable", propId: prop.propId, x: prop.x, z: prop.z };
    }
  }
  return best;
}

// Click-to-move: predicts local movement toward targetPosRef.current every frame, throttles
// the network "move" message to SEND_INTERVAL, and clears the target (sending a final stop)
// on arrival. Reconciles softly against the server's authoritative position whenever it
// changes (e.g. after a collision correction, a sit snap, or a map change).
export function useLocalPlayerMovement(
  groupRef: React.RefObject<Group>,
  room: Room | null,
  player: PlayerState,
  chairs: Record<string, ChairSyncState>,
  toggleables: Record<string, ToggleableSyncState>,
  onNearbyChange: (nearby: NearbyInteractable | null) => void,
  // Written to by the floor's onPointerDown handler (see ProceduralRoom.tsx) — the shared
  // "walk here" target, lifted up to WorldScene so the click marker can read the same state.
  targetPosRef: React.MutableRefObject<MoveTarget | null>,
  // Read by Character3D's walk-cycle wobble/bob animation — 0 when stationary, 1 when moving.
  speedRef: React.MutableRefObject<number>
) {
  const posRef = useRef({ x: player.x, z: player.z });
  const sendTimerRef = useRef(0);
  const nearbyTimerRef = useRef(0);
  const seqRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (player.sitting) {
      posRef.current = { x: player.x, z: player.z };
      return;
    }
    if (!initializedRef.current) {
      posRef.current = { x: player.x, z: player.z };
      initializedRef.current = true;
      return;
    }
    const drift = Math.hypot(player.x - posRef.current.x, player.z - posRef.current.z);
    if (drift > SNAP_THRESHOLD) {
      posRef.current = { x: player.x, z: player.z }; // large desync (map change, sit snap) -> snap
    }
    // small drift is left alone — local prediction stays visually smooth and
    // converges naturally as new inputs keep syncing with the server.
  }, [player.x, player.z, player.sitting]);

  useFrame((_, delta) => {
    let dirX = 0;
    let dirZ = 0;

    if (!player.sitting) {
      const target = targetPosRef.current;
      if (target) {
        const dx = target.x - posRef.current.x;
        const dz = target.z - posRef.current.z;
        const distance = Math.hypot(dx, dz);

        if (distance > ARRIVE_THRESHOLD) {
          dirX = dx / distance;
          dirZ = dz / distance;
          if (groupRef.current) {
            groupRef.current.rotation.y = Math.atan2(dirX, dirZ);
          }
          posRef.current.x += dirX * MOVE_SPEED * delta;
          posRef.current.z += dirZ * MOVE_SPEED * delta;
        } else {
          targetPosRef.current = null; // arrived — dirX/dirZ stay 0, sent as the stop below
        }
      }

      if (room) {
        sendTimerRef.current += delta;
        if (sendTimerRef.current >= SEND_INTERVAL) {
          sendTimerRef.current -= SEND_INTERVAL;
          room.send("move", { dirX, dirZ, seq: seqRef.current++ });
        }
      }
    }

    speedRef.current = Math.hypot(dirX, dirZ);

    if (groupRef.current) {
      groupRef.current.position.set(posRef.current.x, 0, posRef.current.z);
      if (player.sitting) groupRef.current.rotation.y = player.sitRotationY;
    }

    nearbyTimerRef.current += delta;
    if (nearbyTimerRef.current >= NEARBY_CHECK_INTERVAL) {
      nearbyTimerRef.current -= NEARBY_CHECK_INTERVAL;
      const nearest = findNearest(posRef.current.x, posRef.current.z, player.sessionId, chairs, toggleables);
      onNearbyChange(nearest);
    }
  });
}
