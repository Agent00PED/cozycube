import type { CSSProperties } from "react";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { WorldScene } from "./components/WorldScene";
import { ColorPickerUI } from "./components/ColorPickerUI";
import { MapSwitcherUI } from "./components/MapSwitcherUI";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import { useColyseusRoom } from "./hooks/useColyseusRoom";

export default function App() {
  const { auth, loading: authLoading, error: authError } = useDiscordAuth();
  const {
    room,
    players,
    chairs,
    toggleables,
    localSessionId,
    currentMap,
    mapTransitioning,
    connected,
    error: roomError,
    setColor,
    changeMap,
  } = useColyseusRoom(auth);

  if (authLoading) return <StatusScreen text="Connecting to Discord..." />;
  if (authError) return <StatusScreen text={`Auth error: ${authError}`} isError />;
  if (!connected) return <StatusScreen text="Joining room..." />;
  if (roomError) return <StatusScreen text={`Room error: ${roomError}`} isError />;

  const localPlayer = localSessionId ? players[localSessionId] : null;

  return (
    <div style={rootStyle}>
      <IsometricCanvas>
        <WorldScene
          room={room}
          players={players}
          chairs={chairs}
          toggleables={toggleables}
          localSessionId={localSessionId}
          mapId={currentMap}
        />
      </IsometricCanvas>

      <MapSwitcherUI currentMap={currentMap} disabled={mapTransitioning} onSelect={changeMap} />

      {mapTransitioning && <StatusScreen text="Changing scene..." overlay />}

      {localPlayer && <ColorPickerUI currentColor={localPlayer.color} onSelect={setColor} />}
    </div>
  );
}

function StatusScreen({ text, isError, overlay }: { text: string; isError?: boolean; overlay?: boolean }) {
  return (
    <div
      style={{
        position: overlay ? "absolute" : "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: overlay ? "rgba(10, 10, 16, 0.7)" : "#0e0e16",
        color: isError ? "#ff6b6b" : "#e8e8f0",
        fontFamily: "sans-serif",
        fontSize: 16,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        maxWidth: 480,
        textAlign: "center",
        padding: 24,
        zIndex: 20,
      }}
    >
      {text}
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100vh",
};
