import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { BAITS, BAIT_IDS, CREEL_MAX_SLOTS, FISH, RODS, ROD_IDS, TIER_LABEL, creelUpgradeCost, fishValue, stars, type FishingProfile } from "@shared/fishing";
import { COZY_AURA_LUCK, hasCozyAura } from "@shared/bonfire";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  coins: number;
  fuel: number;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

// Barnaby the Angler's stall by the dock: he buys the creel (each fish by its kind, length and
// stars, 15% more while the bonfire's Cozy Aura is up), sells rods and bait, and stitches more
// slots onto the creel. Every sale is the server's call (BARNABY packets); his answer comes back as
// barnabyResult and shows in his speech bubble.

type Tab = "sell" | "rods" | "bait" | "creel";
const TABS: { id: Tab; label: string }[] = [
  { id: "sell", label: "🐟 Sell" },
  { id: "rods", label: "🎣 Rods" },
  { id: "bait", label: "🪱 Bait" },
  { id: "creel", label: "🪣 Creel" },
];
const HELLO = "Evenin', friend! Name's Barnaby. Got a creel full of fish for me? 🦦";

export function BarnabyModal({ profile, coins, fuel, send, subscribeMessages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("sell");
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: HELLO, ok: true });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "barnabyResult") return;
        const r = payload as BarnabyResult;
        setSay({ text: r.message, ok: r.ok });
        if (r.ok && r.coins > 0) playSfx("coins");
        else if (r.ok) playSfx("pluck");
      }),
    [subscribeMessages]
  );
  const shop = (packet: Extract<CampfirePacket, { type: "BARNABY" }>) => send(packet);
  const aura = hasCozyAura(fuel);
  const price = (v: number) => Math.round(v * (aura ? 1 + COZY_AURA_LUCK : 1));
  const worth = profile.creel.reduce((sum, f) => sum + price(fishValue(f)), 0);
  const upgrade = creelUpgradeCost(profile.slots);

  return (
    <Modal title="Barnaby's Bait & Tackle" icon="🦦" onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 pb-2">
        {/* Barnaby says */}
        <div className="flex items-start gap-2">
          <span className="text-4xl leading-none" aria-hidden>
            🦦
          </span>
          <div className={`clay-pop relative flex-1 rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
            {say.text}
          </div>
        </div>

        <div className="flex gap-1.5" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-9 flex-1 rounded-full px-2 text-xs font-bold transition-transform active:scale-95 ${tab === t.id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "sell" && (
          <div className="flex flex-col gap-2">
            {aura && <div className="rounded-xl bg-amber-300/15 px-2.5 py-1.5 text-xs text-amber-100">✨ Cozy Aura: the roaring fire has Barnaby paying 15% more</div>}
            {profile.creel.length === 0 ? (
              <p className="m-0 py-4 text-center text-sm opacity-70">Your creel is empty. Cast a line from the dock or the canoe!</p>
            ) : (
              <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-1">
                {profile.creel.map((f, i) => {
                  const sp = FISH[f.s];
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                      <span className="text-2xl">{sp.emoji}</span>
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <b className="truncate text-sm">{sp.name}</b>
                        <span className="text-[11px] opacity-75">
                          {f.cm} cm · <span className="text-amber-200">{stars(f.q)}</span> · {TIER_LABEL[sp.tier]}
                        </span>
                      </div>
                      <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => shop({ type: "BARNABY", op: "sell", slot: i })}>
                        {price(fishValue(f))} 🪙
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full" disabled={profile.creel.length === 0} onClick={() => shop({ type: "BARNABY", op: "sell", slot: "all" })}>
              Sell the whole creel · {worth} 🪙
            </button>
          </div>
        )}

        {tab === "rods" && (
          <div className="flex flex-col gap-1.5">
            {ROD_IDS.map((id) => {
              const rod = RODS[id];
              const owned = profile.rods.includes(id);
              const using = profile.rod === id;
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${using ? "bg-emerald-400/20" : "bg-white/10"}`}>
                  <span className="text-2xl">{rod.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">{rod.name}</b>
                    <span className="text-[11px] opacity-75">{rod.blurb}</span>
                  </div>
                  {using ? (
                    <span className="px-2 text-xs font-bold text-emerald-200">In hand</span>
                  ) : owned ? (
                    <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => shop({ type: "BARNABY", op: "equipRod", rod: id })}>
                      Use
                    </button>
                  ) : (
                    <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={coins < rod.price} onClick={() => shop({ type: "BARNABY", op: "buyRod", rod: id })}>
                      {rod.price} 🪙
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "bait" && (
          <div className="flex flex-col gap-1.5">
            {BAIT_IDS.map((id) => {
              const bait = BAITS[id];
              const have = profile.baits[id] ?? 0;
              const on = profile.bait === id;
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${on ? "bg-emerald-400/20" : "bg-white/10"}`}>
                  <span className="text-2xl">{bait.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="text-sm">
                      {bait.name} <span className="font-normal opacity-70">×{have}</span>
                    </b>
                    <span className="text-[11px] opacity-75">
                      {bait.blurb} Pack of {bait.pack}, one per cast.
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button type="button" className="clay-btn clay-btn-amber min-h-8 px-3 text-xs" disabled={coins < bait.price} onClick={() => shop({ type: "BARNABY", op: "buyBait", bait: id })}>
                      {bait.price} 🪙
                    </button>
                    {have > 0 && (
                      <button type="button" className="clay-btn min-h-8 px-3 text-xs" onClick={() => shop({ type: "BARNABY", op: "equipBait", bait: on ? "" : id })}>
                        {on ? "Unhook" : "Hook it"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "creel" && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="text-5xl">🪣</span>
            <b>
              Your creel holds {profile.slots} fish{profile.slots >= CREEL_MAX_SLOTS ? " (as big as they come)" : ""}
            </b>
            <p className="m-0 text-xs opacity-75">When it is full, a fresh catch goes back in the river for a few coins. Barnaby can stitch on two more slots at a time, up to {CREEL_MAX_SLOTS}.</p>
            {upgrade !== null && (
              <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full max-w-[260px]" disabled={coins < upgrade} onClick={() => shop({ type: "BARNABY", op: "upgradeCreel" })}>
                +2 slots · {upgrade} 🪙
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
