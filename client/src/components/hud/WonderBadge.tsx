import { useEffect, useMemo, useState } from "react";
import { isCampMap, parseWorldEvent, type MapId } from "@shared/types";
import { BUFFS } from "@shared/crafting";
import { COLOSSAL, isColossalKind } from "@shared/chop";
import { BUFF_KEYS, type BuffKey } from "@shared/fishing";
import { hasCompass, type GearId } from "@shared/gear";
import { FELL_TREE_AT } from "@shared/worlds/trees";
import { cameraFocus } from "../../scene/cameraFocus";
import { worldToScreen } from "../../systems/input";

// The living wonder under way (the room's worldEvent, the same for everyone, late joiners too): a
// small amber pill under the header on the camp's two maps, with where it is and how long it has
// left; and under it, while Forest Whisper Incense burns at the bonfire, its own pill and clock, and
// a slim pill for each of your own consumables' buffs (a S'more, Grip Wax, a Scent Pouch). With the
// Heartwood Compass worn, a Colossal standing shows its way too: in the woods an arrow turned toward
// it on screen and how far, elsewhere where it stands (the room chimes as one rises: compassPulse).

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function WonderBadge({ worldEvent, incenseUntil, currentMap, buffs = {}, worn = [] }: { worldEvent: string; incenseUntil: number; currentMap: MapId; buffs?: Partial<Record<BuffKey, number>>; worn?: GearId[] }) {
  const ev = useMemo(() => parseWorldEvent(worldEvent), [worldEvent]);
  // a tick a second while anything is on (the clocks themselves are read as it renders)
  const [, tick] = useState(0);
  const incenseOn = incenseUntil > Date.now();
  const buffing = BUFF_KEYS.some((k) => (buffs[k] ?? 0) > Date.now());
  // (the compass's arrow follows you: four times a second while it points)
  const compassTree = ev?.kind === "titan" && hasCompass(worn) ? FELL_TREE_AT.get(ev.id) : undefined;
  const pointing = !!compassTree && currentMap === compassTree.map;
  useEffect(() => {
    if (!ev && !incenseOn && !buffing) return;
    const t = window.setInterval(() => tick((n) => n + 1), pointing ? 250 : 1000);
    return () => window.clearInterval(t);
  }, [ev, incenseOn, buffing, pointing]);
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
      : ev?.kind === "titan"
        ? `${COLOSSAL[isColossalKind(ev.tree) ? ev.tree : "maple"].emoji} A ${COLOSSAL[isColossalKind(ev.tree) ? ev.tree : "maple"].name} stands in the Whispering Woods`
        : "";
  const pill = "clay-pop flex items-center gap-2 whitespace-nowrap rounded-full border border-[#F5A623]/60 bg-[#231B18]/90 px-3 py-1 text-xs font-bold text-[#F7EBE1] shadow-[0_0_18px_rgba(245,166,35,0.35)]";
  return (
    <div className="pointer-events-none fixed left-1/2 z-[35] flex -translate-x-1/2 flex-col items-center gap-1" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 58px)" }} role="status" aria-live="polite">
      {left > 0 && (
        <div className={pill}>
          <span>{text}</span>
          <span className="rounded-full bg-[#F5A623] px-1.5 tabular-nums text-[#2B201B]">{clock}</span>
        </div>
      )}
      {compassTree && <CompassPill x={compassTree.x} z={compassTree.z} here={pointing} />}
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

/** The Heartwood Compass: on the Colossal's map an arrow turned toward it on screen (the camera's
 *  own axes) and how far; elsewhere, where it stands. */
function CompassPill({ x, z, here }: { x: number; z: number; here: boolean }) {
  const dx = x - cameraFocus.x;
  const dz = z - cameraFocus.z;
  const d = Math.hypot(dx, dz);
  const sc = worldToScreen(dx, dz);
  // (screen-up is -y on the page: the arrow's angle from pointing up, clockwise)
  const deg = (Math.atan2(sc.x, sc.y) * 180) / Math.PI;
  return (
    <div className="clay-pop flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-300/60 bg-[#1B2230]/90 px-2.5 py-0.5 text-[11px] font-bold text-sky-100 shadow-[0_0_14px_rgba(120,180,255,0.35)]">
      <span>🧭 Heartwood Compass</span>
      {here ? (
        d < 2.5 ? (
          <span className="text-amber-200">it is here</span>
        ) : (
          <>
            <span className="inline-block text-sm leading-none text-sky-200" style={{ transform: `rotate(${deg.toFixed(0)}deg)` }} aria-hidden>
              ⬆
            </span>
            <span className="tabular-nums">{Math.round(d)} m</span>
          </>
        )
      ) : (
        <span className="opacity-80">through the archway, into the woods</span>
      )}
    </div>
  );
}
