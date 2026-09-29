import { useEffect, useState } from "react";
import { CAVERNS_CHANNELS, FORGE_QUEUE_MAX, FORGE_RECIPES, FORGE_SMELT_S, INGOT_IDS, ORE_ITEMS, QUICK_SMELT_ORDER, smeltable, type CavernsResult, type IngotId, type OreItemId } from "@shared/caverns_mining";
import { satchelCounts } from "@shared/satchel";
import type { FishingProfile } from "@shared/fishing";
import { marketMultiplier, oreGood, parseMarket } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playCaveSfx } from "../../audio/cavernAmbience";
import { Modal } from "./Modal";
import { TrendBadge } from "./ShopShell";

// The Ancient Forge on the caverns' Upper Terrace: raw ore and coal into ingots (Copper: 3 Raw Copper
// and 1 Coal; Iron: 3 Raw Iron and 2 Coal; Silver: 2 Raw Silver and 2 Coal), a little more than they
// were worth apart. What you queue leaves your satchel at once; the forge takes an ingot every
// FORGE_SMELT_S seconds, in order, into your satchel (or onto its tray, when the satchel is full,
// to collect here); it keeps working while you are away. Quick Smelt All queues every recipe the
// satchel makes, silver first.

interface Props {
  profile: FishingProfile;
  market: string;
  send: (channel: string, packet?: unknown) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function ForgeModal({ profile, market, send, subscribeMessages, onClose }: Props) {
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "cavernsResult") {
          const r = payload as CavernsResult;
          setNotice({ text: r.message, ok: r.ok });
          if (r.ok) playCaveSfx("smelt", 0.8);
        }
      }),
    [subscribeMessages]
  );
  const hour = parseMarket(market);
  const counts = satchelCounts(profile);
  const queued = profile.forgeQueue.reduce((a, j) => a + j.n, 0);
  const left = profile.forgeAt ? Math.max(0, profile.forgeAt - Date.now()) / 1000 : 0;
  const tray = INGOT_IDS.filter((id) => (profile.forgeTray[id] ?? 0) > 0);
  const all = QUICK_SMELT_ORDER.reduce((a, id) => a + smeltable(counts, id), 0);
  return (
    <Modal title="The Ancient Forge" icon="🔥" onClose={onClose} width={480}>
      <div className="flex flex-col gap-2 pb-1">
        <p className="m-0 text-center text-[12px] opacity-80">Ore and coal in; an ingot every {FORGE_SMELT_S} s, into your satchel. The forge keeps at it while you're away.</p>
        {INGOT_IDS.map((id) => {
          const n = smeltable(counts, id);
          const mult = marketMultiplier(oreGood(id), hour);
          return (
            <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
              <span className="text-3xl" style={{ filter: `drop-shadow(0 0 6px ${ORE_ITEMS[id].color}99)` }}>
                {ORE_ITEMS[id].emoji}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                <b className="flex items-center gap-1.5 text-sm text-[#F7EBE1]">
                  {ORE_ITEMS[id].name}
                  <TrendBadge price={Math.round(ORE_ITEMS[id].price * mult)} mult={mult} />
                </b>
                <span className="flex flex-wrap gap-1 text-[10.5px]">
                  {(Object.entries(FORGE_RECIPES[id]) as [OreItemId, number][]).map(([k, need]) => (
                    <span key={k} className={`rounded-full px-1.5 ${(counts[k] ?? 0) >= need ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                      {need} {ORE_ITEMS[k].name} <span className="opacity-70">({counts[k] ?? 0})</span>
                    </span>
                  ))}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="clay-btn clay-btn-ghost min-h-11 px-3 text-xs" disabled={n < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "smelt", ingot: id as IngotId, n: 1 })}>
                  Smelt 1
                </button>
                <button type="button" className="clay-btn clay-btn-amber min-h-11 px-3 text-xs" disabled={n < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "smelt", ingot: id as IngotId, n })}>
                  All ({n})
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-sm font-extrabold" disabled={all < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "all" })}>
          🔥 Quick Smelt All ({all})
        </button>
        <div className="rounded-2xl bg-black/20 px-3 py-2 text-[12px]">
          {queued > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <b>In the forge</b>
                <span className="tabular-nums opacity-80">next in {left.toFixed(1)} s</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${Math.min(100, (1 - left / FORGE_SMELT_S) * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.forgeQueue.map((j, k) => (
                  <span key={k} className="rounded-full bg-white/10 px-2 py-0.5">
                    {ORE_ITEMS[j.i].emoji} {ORE_ITEMS[j.i].name} ×{j.n}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="opacity-70">The forge is idle: its coals glow, waiting.</span>
          )}
        </div>
        {tray.length > 0 && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-[12px]">
            <span className="flex-1">
              On the tray (your satchel was full): {tray.map((id) => `${profile.forgeTray[id]} ${ORE_ITEMS[id].name}`).join(", ")}
            </span>
            <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send(CAVERNS_CHANNELS.forge, { op: "collect" })}>
              Collect
            </button>
          </div>
        )}
        {notice && <p className={`m-0 text-center text-[12px] font-semibold ${notice.ok ? "text-amber-100" : "text-rose-200"}`}>{notice.text}</p>}
      </div>
    </Modal>
  );
}
