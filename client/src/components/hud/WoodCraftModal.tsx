import { useEffect, useState } from "react";
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
// chance). Every carve is the server's call (WORKBENCH packets); its answer comes back as
// workbenchResult.

const HELLO = "Pick a material, a mode and a piece. What it takes comes straight out of your carrier.";
const MODES: [CraftMode, string, string][] = [
  ["safe", "🛡️ Safe Carve", "Low risk, a modest Masterwork chance"],
  ["push", "🔥 Masterwork Push", "A far better Masterwork chance, but it may break"],
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
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: HELLO, ok: true });
  /** The last carve's outcome, shown big (its key replays the flash). */
  const [last, setLast] = useState<{ key: number; result: WorkbenchResult } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "workbenchResult") return;
        const r = payload as WorkbenchResult;
        setSay({ text: r.message, ok: r.ok && r.outcome !== "broken" });
        if (r.outcome) setLast({ key: performance.now(), result: r });
        if (r.outcome === "broken") playSfx("woodSnap");
        else if (r.outcome === "masterwork") playSfx("masterwork");
        else if (r.ok) playSfx("chop");
      }),
    [subscribeMessages]
  );
  const carved = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  const outcome = last?.result.outcome;
  const stock = { wood: profile.wood, firewood: profile.firewood, resin: profile.resin, byproducts: profile.byproducts };
  const made = (id: CraftId) => (CRAFTS[id].use === "roastingStick" ? profile.roastingStick : CRAFTS[id].use === "packFrame" ? profile.packFrame : CRAFTS[id].use === "tackleBox" ? profile.tackleBox : false);
  const shown = BENCH_IDS.filter((id) => filter === "all" || CRAFTS[id].material === filter);
  return (
    <Modal title="Workbench" icon="🪚" onClose={onClose} width={520} pinned fixedHeight={660}>
      <div className="flex shrink-0 flex-col gap-2 pb-2">
        {/* the last carve: a Masterwork flashes gold, a break shows what was salvaged */}
        {last && outcome === "broken" ? (
          <div key={last.key} className="clay-pop rounded-2xl border border-rose-300/40 bg-rose-400/15 px-3 py-1.5 text-center" role="status">
            <div className="text-sm font-bold">💥 Craft Broken!</div>
            <div className="text-xs opacity-85">
              Salvaged {(Object.entries(last.result.salvaged ?? {}) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ")} + {last.result.sawdust ?? 1} Sawdust 🪚
            </div>
          </div>
        ) : last && outcome === "masterwork" ? (
          <div key={last.key} className="cozy-masterwork clay-pop rounded-2xl border-2 border-amber-300 bg-amber-300/15 px-3 py-1.5 text-center text-sm font-bold text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.55)]" role="status">
            {say.text}
          </div>
        ) : (
          <div className={`clay-pop line-clamp-2 rounded-2xl px-3 py-1.5 text-[13px] ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        )}
        {/* the Adhesive Slot: a Pine Resin for the next carve, bonded or gilded */}
        <div className="flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-2.5 py-1">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 text-lg ${glue ? "border-amber-300 bg-amber-300/20 shadow-[0_0_10px_rgba(252,211,77,0.45)]" : "border-dashed border-white/25"}`} title="Adhesive Slot">
            {glue ? "🍯" : ""}
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <b className="text-xs">
              Adhesive Slot <span className="font-normal opacity-70">· 🍯 Pine Resin ×{profile.resin}</span>
            </b>
            <span className="truncate text-[10.5px] opacity-75">{glue ? `${ADHESIVES[glue].emoji} ${ADHESIVES[glue].name}: ${ADHESIVES[glue].blurb}` : profile.resin > 0 ? "Brush on a resin: bond it, or gild it" : "Land a gold chop for Pine Resin"}</span>
          </div>
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Adhesive">
            {(["", "bond", "gild"] as Adhesive[]).map((a) => (
              <button key={a || "none"} type="button" role="radio" aria-checked={glue === a} disabled={a !== "" && profile.resin < 1} title={a ? `${ADHESIVES[a].name}: ${ADHESIVES[a].blurb}` : "No adhesive"} onClick={() => setAdhesive(a)} className={`min-h-9 rounded-xl px-2 font-bold transition-transform active:scale-95 disabled:opacity-35 ${glue === a ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
                <span className="text-[11px]">{a ? `${ADHESIVES[a].emoji} ${a === "bond" ? "Bond" : "Gild"}` : "None"}</span>
              </button>
            ))}
          </div>
        </div>
        {/* the mode: safe, or pushing for a Masterwork */}
        <div className="flex gap-1.5" role="radiogroup" aria-label="Carving mode">
          {MODES.map(([id, label, blurb]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} title={blurb} onClick={() => setMode(id)} className={`min-h-9 flex-1 rounded-2xl px-2 font-bold transition-transform active:scale-95 ${mode === id ? (id === "push" ? "bg-rose-300 text-rose-950" : "bg-amber-300 text-amber-950") : "bg-white/10 hover:bg-white/15"}`}>
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
        {/* the material filter: one main material's recipes */}
        <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Material">
          {CRAFT_FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-8 shrink-0 whitespace-nowrap rounded-full px-2.5 font-bold transition-transform active:scale-95 ${filter === f.id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              <span className="text-[11px]">
                {f.emoji} {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

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
                  {craft.name} <span className={`text-[10px] font-semibold uppercase tracking-wide ${TIER_TONE[craft.tier]}`}>{once ? "for good" : craft.tier}</span>
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
              <button type="button" className={`clay-btn ${once || mode !== "push" ? "clay-btn-amber" : ""} min-h-9 shrink-0 justify-center px-0 text-xs`} style={{ width: 88, minWidth: 88 }} disabled={!ok} onClick={() => send({ type: "WORKBENCH", recipe: id, mode, adhesive: once ? "" : glue })} title={done ? "Made once, yours for good" : crateFull ? `The crate holds ${MAX_CRAFT_STACK} of a kind` : undefined}>
                {done ? "Max Crafted" : crateFull ? "Crate full" : once ? "Make" : mode === "push" ? "Push" : "Carve"}
              </button>
            </div>
          );
        })}
      </div>
      <p className="m-0 shrink-0 border-t border-white/10 pt-2 text-center text-[11px] opacity-75">
        A broken carving gives back {pct(SALVAGE_RATE)} of its logs and a pile of Sawdust. Things made for good never break.
        {profile.crafts.length > 0 && (
          <>
            {" "}
            {profile.crafts.length} carved {profile.crafts.length === 1 ? "piece" : "pieces"} worth <b className="text-amber-200">{carved} 🪙</b>.
          </>
        )}
      </p>
    </Modal>
  );
}
