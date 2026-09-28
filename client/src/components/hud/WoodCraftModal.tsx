import { useEffect, useRef, useState } from "react";
import type { CampfirePacket, WorkbenchResult } from "@shared/types";
import { BYPRODUCTS, WOOD, type ByproductId, type WoodKind } from "@shared/chop";
import { ADHESIVES, BENCH_IDS, CRAFTS, CRAFT_FILTERS, SALVAGE_RATE, canCraft, craftOdds, craftPrice, needsList, type Adhesive, type CraftId, type CraftMaterial, type CraftMode } from "@shared/crafting";
import { MAX_CRAFT_STACK, type FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

// The workbench (Buster's between the tipi and his stall, Bramble's advanced one in the woods): carve
// logs, Firewood, Pine Resin and the felling's by-products (shared/crafting.ts) into pieces to sell,
// or into things made once, for good (the Marshmallow Roasting Stick, the Lumberjack Pack Frame, the
// Reinforced Tackle Box: [ Max Crafted ] once made). A filter bar narrows the recipes to one main
// material. Each piece to sell is one of two modes: a Safe Carve (low risk, a modest Masterwork
// chance) or a Masterwork Push (a much better chance of a Masterwork ✨, +70% value, and a real chance
// the piece breaks; a break salvages half the logs and a pile of Sawdust). The Adhesive Slot takes a
// Pine Resin for the next carve: a Resin Bond (it can't break) or a Resin Gilding (+25% Masterwork
// chance). Laid out for the list: only the title on top, the material filter a swipeable carousel
// (a mouse wheel scrolls it sideways), the recipes, and a compact foot with the mode and the resin
// as pill dropdowns. Every carve is the server's call (WORKBENCH packets); its answer shows for a
// moment over the list (workbenchResult: a Masterwork in gold, a break in rose).

const MODES: [CraftMode, string, string][] = [
  ["safe", "🛡️ Safe", "Safe Carve: low risk, a modest Masterwork chance"],
  ["push", "🔥 Push", "Masterwork Push: a far better Masterwork chance, but it may break"],
];
const TIER_TONE: Record<string, string> = { common: "text-white/70", uncommon: "text-emerald-200", rare: "text-sky-200", epic: "text-violet-200", legendary: "text-amber-200" };
const SHORT: Partial<Record<WoodKind, string>> = { pine: "Pine", birch: "Birch", cedar: "Cedar", maple: "Maple", elderwood: "Elder", oak: "Oak", charcoal: "Charcoal" };
const BY_SHORT: Record<ByproductId, string> = { bark: "Bark", amber: "Amber", leafAmber: "Leaf Amber", shavings: "Shavings" };
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** A recipe's needs as chips, each red while you are short of it. */
function Needs({ id, profile }: { id: CraftId; profile: FishingProfile }) {
  return (
    <span className="flex flex-wrap gap-1">
      {needsList(id).map(({ key, n }) => {
        const [kind, what] = key.split(":");
        const have = kind === "wood" ? (profile.wood[what as WoodKind] ?? 0) : kind === "by" ? (profile.byproducts[what as ByproductId] ?? 0) : kind === "firewood" ? profile.firewood : profile.resin;
        const label = kind === "wood" ? `${WOOD[what as WoodKind].emoji} ${SHORT[what as WoodKind]}` : kind === "by" ? `${BYPRODUCTS[what as ByproductId].emoji} ${BY_SHORT[what as ByproductId]}` : kind === "firewood" ? "🔥 Firewood" : "🍯 Pine Resin";
        return (
          <span key={key} className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${have >= n ? "bg-white/10 text-[#F7EBE1]" : "bg-rose-500/20 text-rose-200"}`} title={`You have ${have}`}>
            {n} {label}
          </span>
        );
      })}
    </span>
  );
}

export function WoodCraftModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [mode, setMode] = useState<CraftMode>("safe");
  const [filter, setFilter] = useState<CraftMaterial | "all">("all");
  const [adhesive, setAdhesive] = useState<Adhesive>("");
  // out of resin: the slot empties itself
  const glue: Adhesive = profile.resin > 0 ? adhesive : "";
  /** The last carve's answer, for a moment over the list (its key replays the pop). */
  const [last, setLast] = useState<{ key: number; result: WorkbenchResult } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "workbenchResult") return;
        const r = payload as WorkbenchResult;
        setLast({ key: performance.now(), result: r });
        if (r.outcome === "broken") playSfx("woodSnap");
        else if (r.outcome === "masterwork") playSfx("masterwork");
        else if (r.ok) playSfx("chop");
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (!last) return;
    const t = window.setTimeout(() => setLast(null), 3000);
    return () => window.clearTimeout(t);
  }, [last]);
  // the filter carousel: a mouse wheel scrolls it sideways
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const stock = { wood: profile.wood, firewood: profile.firewood, resin: profile.resin, byproducts: profile.byproducts };
  const made = (id: CraftId) => (CRAFTS[id].use === "roastingStick" ? profile.roastingStick : CRAFTS[id].use === "packFrame" ? profile.packFrame : CRAFTS[id].use === "tackleBox" ? profile.tackleBox : false);
  const shown = BENCH_IDS.filter((id) => filter === "all" || CRAFTS[id].material === filter);
  const outcome = last?.result.outcome;
  const pill = "appearance-none rounded-full border border-white/15 bg-white/10 py-1.5 pl-2.5 pr-6 text-[12px] font-bold text-[#F7EBE1] outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-[#F5A623]/70";
  return (
    <Modal title="Workbench" icon="🪚" onClose={onClose} width={520} pinned fixedHeight={660}>
      {/* the material carousel: swipe it, or scroll it with the wheel */}
      <div ref={rail} className="scrollbar-none flex shrink-0 overflow-x-auto whitespace-nowrap" style={{ gap: 8, paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }} role="tablist" aria-label="Material">
        {CRAFT_FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-9 shrink-0 rounded-full px-3 font-bold transition-transform active:scale-95 ${filter === f.id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
            <span className="text-[12px]">
              {f.emoji} {f.label}
            </span>
          </button>
        ))}
      </div>

      {/* the recipes: the only thing that scrolls; the bench's answer floats over its foot */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto border-t border-white/10 py-2 pr-1">
          {shown.map((id) => {
            const craft = CRAFTS[id];
            const once = craft.use !== "sell";
            const done = made(id);
            const crateFull = !once && profile.crafts.filter((c) => c.c === id).length >= MAX_CRAFT_STACK;
            const ok = canCraft(stock, id) && !done && !crateFull;
            const odds = craftOdds(id, mode, glue);
            return (
              <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${once ? "border border-[#8fd3b6]/40 bg-[#8fd3b6]/10" : "bg-white/10"}`}>
                <span className="text-2xl">{craft.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <b className="text-sm">
                    {craft.name} <span className={`text-[10px] font-semibold uppercase tracking-wide ${once ? "text-[#8fd3b6]" : TIER_TONE[craft.tier]}`}>{once ? "heirloom" : craft.tier}</span>
                  </b>
                  <Needs id={id} profile={profile} />
                  <span className="text-[10.5px] opacity-80">
                    {once ? (
                      craft.description
                    ) : (
                      <>
                        → <b className="text-amber-200">{craft.price} 🪙</b> · ✨ {craft.master} 🪙 · <span className="text-amber-200">✨ {pct(odds.masterwork)}</span> · <span className={odds.breakChance > 0 ? "text-rose-200" : "opacity-60"}>💥 {pct(odds.breakChance)}</span>
                        {craft.special ? <span className="opacity-80"> · {craft.special === "torch" ? "🌙 night stride" : "🪔 burn at the bonfire"}</span> : null}
                      </>
                    )}
                  </span>
                </div>
                <button type="button" className={`clay-btn ${once || mode !== "push" ? "clay-btn-amber" : ""} min-h-9 shrink-0 justify-center px-0`} style={{ width: 88, minWidth: 88 }} disabled={!ok} onClick={() => send({ type: "WORKBENCH", recipe: id, mode, adhesive: once ? "" : glue })} title={done ? "Made once, yours for good" : crateFull ? `The crate holds ${MAX_CRAFT_STACK} of a kind` : undefined}>
                  <span className="whitespace-nowrap text-[12px]">{done ? "Max Crafted" : crateFull ? "Crate full" : once ? "Make" : mode === "push" ? "Push" : "Carve"}</span>
                </button>
              </div>
            );
          })}
        </div>
        {last && (
          <div
            key={last.key}
            className={`clay-pop pointer-events-none absolute bottom-2 left-1/2 z-10 max-w-[92%] -translate-x-1/2 rounded-2xl px-3 py-1.5 text-center text-[12.5px] font-semibold leading-snug shadow-lg ${outcome === "masterwork" ? "cozy-masterwork border-2 border-amber-300 bg-[#3a2a12] text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.55)]" : outcome === "broken" || !last.result.ok ? "bg-rose-950/95 text-rose-100 ring-1 ring-rose-300/50" : "bg-[#2B201B] text-[#F7EBE1] ring-1 ring-[#F5A623]/60"}`}
            role="status"
          >
            {outcome === "broken" ? `💥 Craft Broken! Salvaged ${(Object.entries(last.result.salvaged ?? {}) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ")} + ${last.result.sawdust ?? 1} Sawdust 🪚` : last.result.message}
          </div>
        )}
      </div>

      {/* the foot: what a break gives back, and the mode and the resin as pill dropdowns */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-2">
        <span className="min-w-0 text-[11px] leading-tight opacity-75">Broken: {pct(SALVAGE_RATE)} refund · Heirloom: unbreakable</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="relative flex items-center gap-1 text-[11px] opacity-90">
            <span className="hidden sm:inline">Mode:</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as CraftMode)} className={pill} title={MODES.find((m) => m[0] === mode)?.[2]} aria-label="Carving mode">
              {MODES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-[10px]">▾</span>
          </label>
          <label className="relative flex items-center gap-1 text-[11px] opacity-90">
            <span className="hidden sm:inline">Resin:</span>
            <select value={glue} onChange={(e) => setAdhesive(e.target.value as Adhesive)} className={pill} title={glue ? `${ADHESIVES[glue].name}: ${ADHESIVES[glue].blurb} (1 Pine Resin a carve; you hold ${profile.resin})` : `Pine Resin ×${profile.resin}: bond a carving (it can't break) or gild it (+25% Masterwork)`} aria-label="Adhesive">
              <option value="">🍯 None</option>
              <option value="bond" disabled={profile.resin < 1}>
                {ADHESIVES.bond.emoji} Bond
              </option>
              <option value="gild" disabled={profile.resin < 1}>
                {ADHESIVES.gild.emoji} Gild
              </option>
            </select>
            <span className="pointer-events-none absolute right-2 text-[10px]">▾</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
