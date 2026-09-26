import { useEffect, useState } from "react";
import type { CampfirePacket, WorkbenchResult } from "@shared/types";
import { WOOD, WOOD_KINDS, carrierCapacity, type WoodKind } from "@shared/chop";
import { CRAFTS, CRAFT_IDS, canCraft, craftOdds, craftPrice, type CraftMode } from "@shared/crafting";
import { salvageRate } from "@shared/gear";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

// The carpenter's workbench between the tipi and Buster's stall: carve split wood from your carrier
// into artisan pieces, then sell them at Buster's. Each carve is one of two modes (shared/crafting.ts):
// a Safe Carve (low risk, a modest Masterwork chance) or a Masterwork Push (a much better chance of a
// Masterwork ✨, +70% value, and a real chance the piece breaks). A break salvages half the wood
// (75% with the Artisan Leather Apron) and a pile of Sawdust for the bonfire. Every carve is the
// server's call (WORKBENCH packets); its answer comes back as workbenchResult.

const HELLO = "Pick a mode and a piece to carve. The wood comes straight out of your carrier.";
const MODES: [CraftMode, string, string][] = [
  ["safe", "🛡️ Safe Carve", "Low risk, a modest Masterwork chance"],
  ["push", "🔥 Masterwork Push", "A far better Masterwork chance, but it may break"],
];
const TIER_TONE: Record<string, string> = { common: "text-white/70", uncommon: "text-emerald-200", rare: "text-sky-200", epic: "text-violet-200", legendary: "text-amber-200" };

const needsText = (needs: Partial<Record<WoodKind, number>>) =>
  (Object.entries(needs) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ");
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function WoodCraftModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [mode, setMode] = useState<CraftMode>("safe");
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
  const load = carrierLoad(profile);
  const capacity = carrierCapacity(profile.carrierTier);
  const carved = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  const apron = profile.gear.includes("leather_apron");
  const outcome = last?.result.outcome;
  return (
    <Modal title="Workbench" icon="🪚" onClose={onClose} width={480}>
      <div className="flex flex-col gap-3 pb-2">
        {/* the last carve: a Masterwork flashes gold, a break shows what was salvaged */}
        {last && outcome === "broken" ? (
          <div key={last.key} className="clay-pop rounded-2xl border border-rose-300/40 bg-rose-400/15 px-3 py-2 text-center" role="status">
            <div className="text-base font-bold">💥 Craft Broken!</div>
            <div className="text-xs opacity-85">
              Salvaged {(Object.entries(last.result.salvaged ?? {}) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ")} + {last.result.sawdust ?? 1} Sawdust 🪚 (throw it on the bonfire: +15%)
            </div>
          </div>
        ) : last && outcome === "masterwork" ? (
          <div key={last.key} className="cozy-masterwork clay-pop rounded-2xl border-2 border-amber-300 bg-amber-300/15 px-3 py-2 text-center text-sm font-bold text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.55)]" role="status">
            {say.text}
          </div>
        ) : (
          <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        )}
        {/* the wood at hand, the pouch, and how full the carrier is */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {WOOD_KINDS.map((k) => (
            <span key={k} className="rounded-full bg-white/10 px-2.5 py-0.5 font-bold tabular-nums" title={WOOD[k].name}>
              {WOOD[k].emoji} ×{profile.wood[k]}
            </span>
          ))}
          {profile.sawdust > 0 && <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-bold tabular-nums" title="Sawdust">🪚 ×{profile.sawdust}</span>}
          <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 font-bold tabular-nums">
            🪵 {load}/{capacity}
          </span>
        </div>
        {/* the mode: safe, or pushing for a Masterwork */}
        <div className="flex gap-1.5" role="radiogroup" aria-label="Carving mode">
          {MODES.map(([id, label, blurb]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} title={blurb} onClick={() => setMode(id)} className={`min-h-10 flex-1 rounded-2xl px-2 text-xs font-bold transition-transform active:scale-95 ${mode === id ? (id === "push" ? "bg-rose-300 text-rose-950" : "bg-amber-300 text-amber-950") : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {CRAFT_IDS.map((id) => {
            const craft = CRAFTS[id];
            const ok = canCraft(profile.wood, id);
            const odds = craftOdds(id, mode, profile.gear);
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">{craft.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {craft.name} <span className={`text-[10px] font-semibold uppercase tracking-wide ${TIER_TONE[craft.tier]}`}>{craft.tier}</span>
                  </b>
                  <span className="text-[11px] opacity-75">
                    {needsText(craft.needs)} → {craft.price} 🪙 · ✨ {craft.master} 🪙
                  </span>
                  <span className="text-[10.5px] tabular-nums">
                    <span className="text-amber-200">✨ {pct(odds.masterwork)}</span>
                    <span className="opacity-50"> · </span>
                    <span className={odds.breakChance > 0 ? "text-rose-200" : "opacity-60"}>💥 {pct(odds.breakChance)}</span>
                  </span>
                </div>
                <button type="button" className={`clay-btn ${mode === "push" ? "" : "clay-btn-amber"} min-h-9 px-3 text-xs`} disabled={!ok} onClick={() => send({ type: "WORKBENCH", recipe: id, mode })}>
                  {mode === "push" ? "Push" : "Carve"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="m-0 text-center text-xs opacity-75">
          A broken carving gives back {pct(salvageRate(profile.gear))} of its wood and a pile of Sawdust{apron ? " (your apron: 10% less breakage)" : ""}.
          {profile.crafts.length > 0 && (
            <>
              {" "}
              {profile.crafts.length} carved {profile.crafts.length === 1 ? "piece" : "pieces"} worth <b className="text-amber-200">{carved} 🪙</b> at Buster's stall.
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
