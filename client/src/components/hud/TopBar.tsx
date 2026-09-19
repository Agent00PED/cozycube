import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_IDS, TIMES_OF_DAY, isActivityStatus, type MapId, type TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "../../scene/roomThemes";
import { glass } from "./glass";
import { playChime, playClick, playCoin } from "../../audio/sfx";

interface TopBarProps {
  currentMap: MapId;
  mapDisabled: boolean;
  onSelectMap: (mapId: MapId) => void;
  timeOfDay: TimeOfDay;
  onSelectTime: (time: TimeOfDay) => void;
  onOpenWardrobe: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  coins: number;
  autoCycle: boolean;
  onToggleAutoCycle: () => void;
  status: string;
  onSetStatus: (status: string) => void;
}

const MAP_LABELS: Record<MapId, { icon: string; name: string }> = {
  cozy_lounge: { icon: "🛋️", name: "Lounge" },
  campfire_night: { icon: "🔥", name: "Campfire" },
  sunset_beach: { icon: "🏖️", name: "Beach Bar" },
  velvet_casino: { icon: "🎰", name: "Casino" },
};
const MAP_IDS = Object.keys(MAP_LABELS) as MapId[];

function timeLabel(time: TimeOfDay) {
  const [icon, ...rest] = TIME_PRESETS[time].label.split(" ");
  return { icon, name: rest.join(" ") };
}

// Three small frosted capsules instead of one twelve-button bar: where you are, what the sky is
// doing, and you (coins, status, wardrobe, sound). The first two open as dropdowns. Labels drop
// to icons under 768px (.cozy-hud-label in App.tsx).
export function TopBar(props: TopBarProps) {
  const { currentMap, mapDisabled, onSelectMap, timeOfDay, onSelectTime, onOpenWardrobe, soundOn, onToggleSound, coins, autoCycle, onToggleAutoCycle, status, onSetStatus } = props;
  const [open, setOpen] = useState<"map" | "time" | "status" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Any click outside the bar folds an open menu back up.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const toggle = (menu: "map" | "time" | "status") => {
    playClick();
    setOpen((o) => (o === menu ? null : menu));
  };
  const time = timeLabel(timeOfDay);
  const st = isActivityStatus(status) ? ACTIVITY_STATUSES[status] : null;

  return (
    <div ref={rootRef} className="cozy-topbar" style={styles.row}>
      {/* where */}
      <div style={styles.anchor}>
        <button type="button" style={{ ...styles.capsule, ...styles.mapPill }} onClick={() => toggle("map")} disabled={mapDisabled} aria-expanded={open === "map"}>
          <span style={styles.icon}>{MAP_LABELS[currentMap].icon}</span>
          <span className="cozy-hud-label">{MAP_LABELS[currentMap].name}</span>
          <span style={styles.caret}>▾</span>
        </button>
        {open === "map" && (
          <Menu>
            {MAP_IDS.map((id) => (
              <MenuItem
                key={id}
                active={id === currentMap}
                onClick={() => {
                  setOpen(null);
                  if (id !== currentMap) {
                    playChime();
                    onSelectMap(id);
                  }
                }}
              >
                {MAP_LABELS[id].icon} {MAP_LABELS[id].name}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      {/* sky */}
      <div style={styles.anchor}>
        <button type="button" style={styles.capsule} onClick={() => toggle("time")} aria-expanded={open === "time"}>
          <span style={styles.icon}>{time.icon}</span>
          <span className="cozy-hud-label">{autoCycle ? `${time.name} · Auto` : time.name}</span>
          <span style={styles.caret}>▾</span>
        </button>
        {open === "time" && (
          <Menu>
            {TIMES_OF_DAY.map((t) => {
              const l = timeLabel(t);
              return (
                <MenuItem
                  key={t}
                  active={t === timeOfDay && !autoCycle}
                  onClick={() => {
                    playClick();
                    onSelectTime(t);
                    setOpen(null);
                  }}
                >
                  {l.icon} {l.name}
                </MenuItem>
              );
            })}
            <div style={styles.sep} />
            <button
              type="button"
              style={styles.switchRow}
              onClick={() => {
                playClick();
                onToggleAutoCycle();
              }}
              aria-pressed={autoCycle}
            >
              <span>⏱️ Auto Cycle</span>
              <span style={{ ...styles.switchTrack, background: autoCycle ? "#f4a15c" : "rgba(90,74,58,0.25)" }}>
                <span style={{ ...styles.switchKnob, transform: autoCycle ? "translateX(14px)" : "none" }} />
              </span>
            </button>
          </Menu>
        )}
      </div>

      {/* you */}
      <div style={{ ...styles.capsule, ...styles.mine }}>
        <CoinCounter coins={coins} />
        <div style={styles.anchor}>
          <button type="button" style={styles.inner} onClick={() => toggle("status")} title="Set your status" aria-expanded={open === "status"}>
            <span style={styles.icon}>{st ? st.emoji : "🟢"}</span>
            <span className="cozy-hud-label">{st ? st.label : "Status"}</span>
            <span style={styles.caret}>▾</span>
          </button>
          {open === "status" && (
            <Menu alignRight>
              <MenuItem
                active={!st}
                onClick={() => {
                  playClick();
                  onSetStatus("");
                  setOpen(null);
                }}
              >
                🟢 Just hanging out
              </MenuItem>
              {ACTIVITY_STATUS_IDS.map((id) => (
                <MenuItem
                  key={id}
                  active={status === id}
                  onClick={() => {
                    playClick();
                    onSetStatus(id);
                    setOpen(null);
                  }}
                >
                  {ACTIVITY_STATUSES[id].emoji} {ACTIVITY_STATUSES[id].label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
        <button
          type="button"
          style={{ ...styles.inner, color: "#9c3f62" }}
          onClick={() => {
            playChime();
            onOpenWardrobe();
          }}
          title="Wardrobe"
        >
          <span style={styles.icon}>👗</span>
          <span className="cozy-hud-label">Wardrobe</span>
        </button>
        <button
          type="button"
          style={styles.inner}
          onClick={() => {
            onToggleSound();
            playClick();
          }}
          aria-pressed={soundOn}
          title={soundOn ? "Mute the room" : "Play this room's ambience"}
        >
          <span style={styles.icon}>{soundOn ? "🔊" : "🔇"}</span>
        </button>
      </div>
    </div>
  );
}

function Menu({ children, alignRight = false }: { children: ReactNode; alignRight?: boolean }) {
  return (
    <div className="cozy-menu" style={{ ...styles.menu, ...(alignRight ? { right: 0 } : { left: 0 }) }} role="menu">
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" style={{ ...styles.item, ...(active ? styles.itemActive : null) }} onClick={onClick}>
      {children}
    </button>
  );
}

/** The wallet: pops and chimes whenever it goes up. */
function CoinCounter({ coins }: { coins: number }) {
  const prev = useRef(coins);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (coins > prev.current) {
      setBump((b) => b + 1);
      playCoin();
    }
    prev.current = coins;
  }, [coins]);
  return (
    <span key={bump} className={bump ? "cozy-coin-bump" : undefined} style={styles.coins} title="Your coins">
      <span style={styles.icon}>🪙</span>
      {coins}
    </span>
  );
}

const text: CSSProperties = { color: "#5a4a3a", fontFamily: "system-ui, sans-serif", fontSize: 12.5, fontWeight: 650, lineHeight: 1, whiteSpace: "nowrap" };

const styles: Record<string, CSSProperties> = {
  row: {
    position: "absolute",
    top: "max(12px, env(safe-area-inset-top))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 15,
    maxWidth: "calc(100vw - 20px)",
  },
  anchor: { position: "relative" },
  capsule: {
    ...glass,
    ...text,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "8px 13px",
    cursor: "pointer",
  },
  mapPill: { background: "rgba(255, 226, 196, 0.72)", color: "#6b3a14", fontWeight: 750 },
  mine: { padding: 4, gap: 2, cursor: "default" },
  inner: { ...text, display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", borderRadius: 999, padding: "6px 9px", cursor: "pointer" },
  icon: { fontSize: 14 },
  caret: { fontSize: 10, opacity: 0.6 },
  menu: {
    ...glass,
    background: "rgba(255, 250, 240, 0.9)",
    position: "absolute",
    top: "calc(100% + 8px)",
    minWidth: 170,
    padding: 6,
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    zIndex: 30,
  },
  item: { ...text, textAlign: "left", border: "none", background: "transparent", borderRadius: 10, padding: "9px 11px", cursor: "pointer", fontSize: 13 },
  itemActive: { background: "#f4a15c", color: "#3a2415", fontWeight: 750 },
  sep: { height: 1, margin: "4px 6px", background: "rgba(90,74,58,0.18)" },
  switchRow: { ...text, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "none", background: "transparent", padding: "9px 11px", cursor: "pointer", fontSize: 13 },
  switchTrack: { width: 30, height: 16, borderRadius: 999, position: "relative", transition: "background 150ms" },
  switchKnob: { position: "absolute", top: 2, left: 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "transform 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" },
  coins: {
    ...text,
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 11px",
    borderRadius: 999,
    background: "rgba(255, 214, 102, 0.4)",
    color: "#6b4a10",
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
};
