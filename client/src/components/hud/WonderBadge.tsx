import { useEffect, useMemo, useState } from "react";
import { isCampMap, parseWorldEvent, type MapId } from "@shared/types";

// The living wonder under way (the room's worldEvent, the same for everyone, late joiners too): a
// small amber pill under the header on the camp's two maps, with where it is and how long it has left.

export function WonderBadge({ worldEvent, currentMap }: { worldEvent: string; currentMap: MapId }) {
  const ev = useMemo(() => parseWorldEvent(worldEvent), [worldEvent]);
  // a tick a second while a wonder is on (the clock itself is read as it renders)
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ev) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ev]);
  if (!ev || !isCampMap(currentMap)) return null;
  const left = Math.max(0, Math.ceil((ev.until - Date.now()) / 1000));
  if (left <= 0) return null;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const text =
    ev.kind === "surge"
      ? `✨ King-Size Surge ${ev.map === "campfire_night" ? "by the campfire's dock" : "on the woods' river"} · reel by hand`
      : "🌳 A Colossal Titan stands in the Whispering Woods";
  return (
    <div className="pointer-events-none fixed left-1/2 z-[35] -translate-x-1/2" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 58px)" }} role="status" aria-live="polite">
      <div className="clay-pop flex items-center gap-2 whitespace-nowrap rounded-full border border-[#F5A623]/60 bg-[#231B18]/90 px-3 py-1 text-xs font-bold text-[#F7EBE1] shadow-[0_0_18px_rgba(245,166,35,0.35)]">
        <span>{text}</span>
        <span className="rounded-full bg-[#F5A623] px-1.5 tabular-nums text-[#2B201B]">{clock}</span>
      </div>
    </div>
  );
}
