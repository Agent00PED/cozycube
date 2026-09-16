import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Room } from "colyseus.js";
import { Character3D } from "./Character3D";
import { ChairProp } from "./ChairProp";
import { ToggleableProp } from "./ToggleableProp";
import { InteractPrompt } from "./InteractPrompt";
import { ClickMarker } from "./ClickMarker";
import { DioramaRoom } from "../scene/DioramaRoom";
import { ROOM_THEMES, type RoomTheme } from "../scene/roomThemes";
import { useLocalPlayerMovement, type MoveTarget, type NearbyInteractable } from "../systems/useLocalPlayerMovement";
import type { ChairSyncState, MapId, PlayerState, ToggleableSyncState } from "@shared/types";

interface WorldSceneProps {
  room: Room | null;
  players: Record<string, PlayerState>;
  chairs: Record<string, ChairSyncState>;
  toggleables: Record<string, ToggleableSyncState>;
  localSessionId: string | null;
  mapId: MapId;
}

export function WorldScene({ room, players, chairs, toggleables, localSessionId, mapId }: WorldSceneProps) {
  const [nearby, setNearby] = useState<NearbyInteractable | null>(null);
  const localPlayer = localSessionId ? players[localSessionId] : null;
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
            onNearbyChange={setNearby}
            targetPosRef={moveTargetRef}
          />
        ) : (
          <RemotePlayerAvatar key={sessionId} player={player} />
        )
      )}

      {nearby && localPlayer && <InteractPrompt nearby={nearby} sitting={localPlayer.sitting} />}
    </>
  );
}

function RoomLighting({ theme }: { theme: RoomTheme }) {
  return (
    <>
      <ambientLight intensity={theme.ambientIntensity} color={theme.ambient} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={theme.directionalIntensity}
        color={theme.directional}
        castShadow
        shadow-mapSize={[1024, 1024]}
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
