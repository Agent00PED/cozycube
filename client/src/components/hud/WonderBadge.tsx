import { useEffect, useMemo, useState } from "react";
import { isCampMap, parseWorldEvent, type MapId } from "@shared/types";
import { BUFFS } from "@shared/crafting";
import { BUFF_KEYS, type BuffKey } from "@shared/fishing";

// The living wonder under way (the room's worldEvent, the same for everyone, late joiners too): a
// small amber pill under the header on the camp's two maps, with where it is and how long it has
// left; and under it, while Forest Whisper Incense burns at the bonfire, its own pill and clock, and
// a slim pill for each of your own consumables' buffs (a S'more, Grip Wax, a Scent Pouch).

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function WonderBadge({ worldEvent, incenseUntil, currentMap, buffs = {} }: { worldEvent: string; incenseUntil: number; currentMap: MapId; buffs?: Partial<Record<BuffKey, number>> }) {
  const ev = useMemo(() => parseWorldEvent(worldEvent), [worldEvent]);
  // a tick a second while anything is on (the clocks themselves are read as it renders)
  const [, tick] = useState(0);
  const incenseOn = incenseUntil > Date.now();
  const buffing = BUFF_KEYS.some((k) => (buffs[k] ?? 0) > Date.now());
  useEffect(() => {
    if (!ev && !incenseOn && !buffing) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ev, incenseOn, buffing]);
  if (!isCampMap(currentMap)) return null;
  // (a Titan stands until it is felled: no clock)
  const left = !ev ? 0 : ev.until > 0 ? Math.max(0, Math.ceil((ev.until - Date.now()) / 1000)) : Infinity;
  const incense = Math.max(0, Math.ceil((incenseUntil - Date.now()) / 1000));
  const mine = BUFF_KEYS.map((k) => ({ k, s: Math.max(0, Math.ceil(((buffs[k] ?? 0) - Date.now()) / 1000)) })).filter((b) => b.s > 0);
  if (left <= 0 && incense <= 0 && !mine.length) return null;
  const clock = Number.isFinite(left) ? mmss(left) : "until felled";
  const text =
    ev?.kind === "surge"
      ? `✨ King-Size Surge ${ev.map === "campfire_night" ? "by the campfire's dock" : "on the woods' river"} · reel by hand`
      : "🌳 A Colossal Titan stands in the Whispering Woods";
  const pill = "clay-pop flex items-center gap-2 whitespace-nowrap rounded-full border border-[#F5A623]/60 bg-[#231B18]/90 px-3 py-1 text-xs font-bold text-[#F7EBE1] shadow-[0_0_18px_rgba(245,166,35,0.35)]";
  return (
    <div className="pointer-events-none fixed left-1/2 z-[35] flex -translate-x-1/2 flex-col items-center gap-1" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 58px)" }} role="status" aria-live="polite">
      {left > 0 && (
        <div className={pill}>
          <span>{text}</span>
          <span className="rounded-full bg-[#F5A623] px-1.5 tabular-nums text-[#2B201B]">{clock}</span>
        </div>
      )}
      {incense > 0 && (
        <div className={pill}>
          <span>🪔 Forest Whisper Incense · rare fish likelier for everyone</span>
          <span className="rounded-full bg-[#8fd3b6] px-1.5 tabular-nums text-[#2B201B]">{mmss(incense)}</span>
        </div>
      )}
      {mine.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {mine.map(({ k, s }) => (
            <div key={k} className="clay-pop flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#f5c46b]/50 bg-[#231B18]/85 px-2 py-0.5 text-[11px] font-bold text-[#F7EBE1]" title={BUFFS[k].blurb}>
              <span>
                {BUFFS[k].emoji} {BUFFS[k].blurb}
              </span>
              <span className="tabular-nums text-amber-200">{mmss(s)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
