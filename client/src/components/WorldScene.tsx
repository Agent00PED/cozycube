import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Room } from "colyseus.js";
import { Character3D } from "./Character3D";
import { ChairProp } from "./ChairProp";
import { ToggleableProp } from "./ToggleableProp";
import { ClickMarker } from "./ClickMarker";
import { DioramaRoom } from "../scene/DioramaRoom";
import { ROOM_THEMES, type RoomTheme } from "../scene/roomThemes";
import { useLocalPlayerMovement, type MoveTarget, type NearbyInteractable } from "../systems/useLocalPlayerMovement";
import type { ChairSyncState, MapId, PlayerState, ToggleableSyncState } from "@shared/types";

// The on-screen "PRESS E TO SIT" prompt is gone — the game is click-to-move only, so there is
// no key to press. The proximity scan itself stays wired up (it still feeds the server's sit
// logic) but no longer drives any UI.
const NOOP_NEARBY = (_nearby: NearbyInteractable | null) => {};

interface WorldSceneProps {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  mapId: MapId;
}

export function WorldScene({ room, players, chairs, toggleables, localSessionId, mapId }: WorldSceneProps) {
  const theme = ROOM_THEMES[mapId];

  // Click-to-move target, shared between the floor's click handler, the movement hook, and
  // the marker's visual — lifted here so all three read/write the exact same object.
  const moveTargetRef = useRef<MoveTarget | null>(null);
  const handleFloorClick = (x: number, z: number) => {
    moveTargetRef.current = { x, z };
  };

  return (
    <>
      <RoomLighting theme={theme} />
      {/* key={mapId} forces a full unmount of the old room's meshes/geometries before the new
          one mounts, instead of React diffing/reusing nodes across themes — guarantees no
          overlap between rooms and lets R3F's default dispose-on-unmount reclaim GPU memory. */}
      <DioramaRoom key={mapId} mapId={mapId} onFloorClick={handleFloorClick} />

      <ClickMarker targetRef={moveTargetRef} />

      {Object.values(chairs).map((chair) => (
        <ChairProp key={chair.propId} chair={chair} />
      ))}
      {Object.values(toggleables).map((prop) => (
        <ToggleableProp key={prop.propId} prop={prop} />
      ))}

      {Object.entries(players).map(([sessionId, player]) =>
        sessionId === localSessionId ? (
          <LocalPlayerAvatar
            key={sessionId}
            room={room}
            player={player}
            chairs={chairs}
            toggleables={toggleables}
            onNearbyChange={NOOP_NEARBY}
            targetPosRef={moveTargetRef}
          />
        ) : (
          <RemotePlayerAvatar key={sessionId} player={player} />
        )
      )}

    </>
  );
}

function RoomLighting({ theme }: { theme: RoomTheme }) {
  return (
    <>
      <ambientLight intensity={theme.ambientIntensity} color={theme.ambient} />
      <directionalLight
        // Deliberately OFF the camera's azimuth. The iso camera sits at roughly (11,11,11), so
        // a light at (6,11,6) shares its bearing exactly — every shadow then falls directly
        // behind its own caster and is completely hidden from view, which looks identical to
        // having no shadows at all. Swinging the light toward +X separates the two bearings so
        // shadows are thrown across the floor where the camera can actually see them, while
        // staying on the open side of the room so the back walls never shadow the interior.
        position={[11, 13, 3]}
        intensity={theme.directionalIntensity}
        color={theme.directional}
        castShadow
        shadow-mapSize={[2048, 2048]}
        // Negative bias pushes the depth comparison away from the surface, killing the
        // self-shadowing "acne" you otherwise get on the large flat floor plane.
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
        // A directional light's shadow camera is orthographic and defaults to a 10-unit box,
        // which would clip the 10x10 room. These bounds cover the whole slab with margin so
        // shadows never cut off partway across the floor.
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
      />
    </>
  );
}

function LocalPlayerAvatar({
  room,
  player,
  chairs,
  toggleables,
  onNearbyChange,
  targetPosRef,
}: {
  room: Room | null;
  player: PlayerState;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  onNearbyChange: (nearby: NearbyInteractable | null) => void;
  targetPosRef: React.MutableRefObject<MoveTarget | null>;
}) {
  const groupRef = useRef<Group>(null);
  const speedRef = useRef(0);
  useLocalPlayerMovement(groupRef, room, player, chairs, toggleables, onNearbyChange, targetPosRef, speedRef);
  return (
    <Character3D
      ref={groupRef}
      color={player.color}
      username={player.username}
      sitting={player.sitting}
      speedRef={speedRef}
    />
  );
}

const REMOTE_LERP_FACTOR = 0.2;

function RemotePlayerAvatar({ player }: { player: PlayerState }) {
  const groupRef = useRef<Group>(null);
  const speedRef = useRef(0);
  const targetRef = useRef({ x: player.x, z: player.z, rotationY: player.sitRotationY });

  useEffect(() => {
    targetRef.current = { x: player.x, z: player.z, rotationY: player.sitRotationY };
  }, [player.x, player.z, player.sitRotationY]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const dx = targetRef.current.x - g.position.x;
    const dz = targetRef.current.z - g.position.z;
    speedRef.current = Math.hypot(dx, dz) > 0.02 ? 1 : 0;
    g.position.x += dx * REMOTE_LERP_FACTOR;
    g.position.z += dz * REMOTE_LERP_FACTOR;
    if (player.sitting) g.rotation.y = targetRef.current.rotationY;
  });

  return (
    <Character3D
      ref={groupRef}
      color={player.color}
      username={player.username}
      sitting={player.sitting}
      speedRef={speedRef}
    />
  );
}
