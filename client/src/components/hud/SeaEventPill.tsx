import { useEffect, useState } from "react";
import { SEA_EVENT_INFO, seaEventOn } from "@shared/voyage";
import { useSeaEvent } from "../../systems/seaEventStore";

// The Open Sea's living wonder as a pill under the header while it lasts (shared/voyage.ts SeaEvent:
// a whale alongside, dolphins round the boat, a shoal under the keel), with what it does and its clock.

export function SeaEventPill() {
  const ev = useSeaEvent();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ev) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [ev]);
  if (!seaEventOn(ev)) return null;
  const info = SEA_EVENT_INFO[ev.kind];
  const left = Math.max(0, Math.ceil((ev.until - Date.now()) / 1000));
  return (
    <div className="pointer-events-none fixed left-1/2 top-[68px] z-30 -translate-x-1/2 rounded-full bg-[#1d2a3a]/90 px-3.5 py-1.5 text-xs font-bold text-[#eaf6ff] shadow-lg ring-1 ring-[#9fe8ff]/40">
      {info.emoji} {info.name} <span className="font-normal opacity-80">· {info.pill}</span> <span className="tabular-nums opacity-90">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
    </div>
  );
}
