import { TIDE_FINDS } from "@shared/voyage";
import { useState } from "react";
import { BYPRODUCTS, TREES, WOOD, type TreeKind } from "@shared/chop";
import { FISH, TIER_COLOR, TIER_LABEL, gradeOf, isKingSize, type FishId, type FishingProfile } from "@shared/fishing";
import { Modal } from "./Modal";

// The Logbook, opened from the resource drawers: the Fish Collection (from the livewell: the
// freshwater fish by day and by night, the Glimmering Caverns' cenote on a page of its own, a
// dark silhouette until you catch one, a gold crown on a King Size record, and the Ocean's page:
// Sunset Beach's pier and the Open Sea) or the Timber Collection (from the
// wood carrier: every tree kind's lore, the widest trunk you have felled, how many, the most one of
// its logs ever sold for, and what else it gives).

// (every fish in the book: the rivers', the cenote's, and the salt water's)
const FRESHWATER = Object.keys(FISH) as FishId[];
/** The Ocean page: the pier's fish and the Open Sea's. The Hidden Cove's own show only once one of them
 *  has been landed (nothing names the cove before it is found). */
const oceanFish = (profile: FishingProfile) => FRESHWATER.filter((id) => FISH[id].water === "saltwater" && ((FISH[id] as { zone?: string }).zone !== "cove" || (profile.caught[id] ?? 0) > 0));
const TREE_ICON: Record<TreeKind, string> = { soft_pine: "🌲", birch: "🌳", cedar: "🌲", maple: "🍁", elderwood: "🌌", palm: "🌴", ironwood: "🖤", sea_pine: "🌲" };
type Page = "day" | "night" | "cave" | "ocean";
/** The fish on a page: the river's by day or by night (whatever bites any time is the caverns'). */
const onPage = (id: FishId, page: Page) => (page === "ocean" ? FISH[id].water === "saltwater" : page === "cave" ? FISH[id].water === "cavewater" : FISH[id].water === "freshwater" && FISH[id].time === page);

export function LogbookModal({ mode, profile, onClose }: { mode: "fish" | "timber"; profile: FishingProfile; onClose: () => void }) {
  const [page, setPage] = useState<Page>("day");
  if (mode === "timber") return <TimberCollection profile={profile} onClose={onClose} />;
  // (the count leaves the cove's own out until they are found)
  const known = FRESHWATER.filter((id) => (FISH[id] as { zone?: string }).zone !== "cove" || (profile.caught[id] ?? 0) > 0);
  const caughtKinds = FRESHWATER.filter((id) => (profile.caught[id] ?? 0) > 0).length;
  const crowns = FRESHWATER.filter((id) => (profile.records[id] ?? 0) > 0 && isKingSize({ s: id, cm: profile.records[id]! })).length;
  return (
    <Modal title="Fish Collection" icon="📖" onClose={onClose} width={560}>
      <div className="flex min-h-0 flex-col gap-2 pb-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              ["day", "☀️ Day"],
              ["night", "🌙 Night"],
              ["cave", "💎 Caverns"],
              ["ocean", "🌊 Ocean"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPage(id)} className={`min-h-8 rounded-full px-2.5 py-1 font-bold ${page === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10"}`}>
              {label}
            </button>
          ))}
          <b className="ml-auto text-[#F7EBE1]">
            {caughtKinds}/{known.length} found · 👑 {crowns}
          </b>
        </div>
          <div className="grid max-h-[52vh] grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5">
            {(page === "ocean" ? oceanFish(profile) : FRESHWATER.filter((id) => onPage(id, page))).map((id) => {
              const sp = FISH[id];
              const n = profile.caught[id] ?? 0;
              const longest = profile.records[id] ?? 0;
              const king = longest > 0 && isKingSize({ s: id, cm: longest });
              return (
                <div key={id} className={`relative flex flex-col items-center gap-0.5 rounded-2xl px-1.5 py-2 text-center ${king ? "bg-[#F5A623]/15 ring-1 ring-[#F5A623]/70" : "bg-white/5"}`} title={n ? sp.name : "Not caught yet"}>
                  {king && (
                    <span className="absolute right-1 top-0.5 text-sm drop-shadow" title="King Size record">
                      👑
                    </span>
                  )}
                  <span className="text-3xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }}>
                    {sp.emoji}
                  </span>
                  <b className="w-full truncate text-[10px] text-[#F7EBE1]">{n ? sp.name : "???"}</b>
                  <span className="text-[9px] font-bold" style={{ color: TIER_COLOR[gradeOf(id)] }}>
                    {TIER_LABEL[gradeOf(id)]}
                    {"rapids" in sp && sp.rapids ? " · woods" : ""}
                  </span>
                  {n > 0 && (
                    <span className={`text-[9px] ${king ? "font-bold text-[#F5A623]" : "opacity-75"}`}>
                      ×{n} · {longest} cm{profile.best[id] ? ` · 💰${profile.best[id]}` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {page === "ocean" && (
            <div className="mt-2 rounded-2xl bg-white/5 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <b className="text-[#F7EBE1]">🔍 Tide Pool Journal</b>
                <span className="opacity-80">
                  {profile.tide.length}/{TIDE_FINDS.length} seen{profile.tide.length >= TIDE_FINDS.length ? " · complete ✨" : " · look into the pools on Sunset Beach's rocky point"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {TIDE_FINDS.map((f) => {
                  const seen = profile.tide.includes(f.id);
                  return (
                    <div key={f.id} className="flex flex-col items-center gap-0.5 rounded-xl bg-black/15 px-1 py-1.5 text-center" title={seen ? f.line : "Not seen yet"}>
                      <span className="text-2xl" style={seen ? undefined : { filter: "brightness(0) opacity(0.45)" }}>
                        {f.emoji}
                      </span>
                      <b className="w-full truncate text-[9px] text-[#F7EBE1]">{seen ? f.name : "???"}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
}

function TimberCollection({ profile, onClose }: { profile: FishingProfile; onClose: () => void }) {
  return (
    <Modal title="Timber Collection" icon="📖" onClose={onClose} width={560}>
      <div className="grid max-h-[62vh] grid-cols-1 gap-1.5 overflow-y-auto pb-2 pr-1 sm:grid-cols-2">
        {(Object.keys(TREES) as TreeKind[]).map((k) => {
          const t = TREES[k];
          const n = profile.felled[k] ?? 0;
          const cm = profile.trunkRecord[k] ?? 0;
          const peak = profile.bestLog[t.wood] ?? 0;
          return (
            <div key={k} className={`flex gap-2 rounded-2xl px-2.5 py-2 ${n ? "bg-white/10" : "bg-white/5"}`}>
              <span className="text-3xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }} aria-hidden>
                {TREE_ICON[k]}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                <div className="flex items-center gap-1.5">
                  <b className="truncate text-xs text-[#F7EBE1]">{n ? t.name : "???"}</b>
                  <span className="rounded-full bg-[#F5A623]/20 px-1.5 text-[9px] font-extrabold text-[#F5A623]">T{t.tier}</span>
                </div>
                <span className="text-[10px] italic opacity-75">{n ? t.lore : "Fell one to learn its story."}</span>
                <span className="grid grid-cols-3 gap-1 text-[10px] tabular-nums">
                  <span title="The widest trunk you have felled">📏 {cm ? `${cm} cm` : "—"}</span>
                  <span title="How many you have felled">🪓 ×{n}</span>
                  <span title={`The most one of its ${WOOD[t.wood].name} logs ever sold for`}>💰 {peak ? `${peak} 🪙` : "—"}</span>
                </span>
                {t.byproduct && n > 0 && (
                  <span className="text-[10px] opacity-70">
                    Also gives {BYPRODUCTS[t.byproduct].emoji} {BYPRODUCTS[t.byproduct].name}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
