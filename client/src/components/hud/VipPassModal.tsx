import { useEffect, useRef, useState } from "react";
import { chipText, type CasinoPacket, type VipPassResult } from "@shared/casino";
import { MAX_WRISTBANDS, VIP_PASS, VIP_WRISTBAND } from "@shared/items";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { VelvetChipIcon } from "./VelvetChipIcon";

// The Velvet Penthouse's two ways in, both for coins, from Mr. Vance at the cage or from Bruno at
// the penthouse's doors: the Velvet VIP Wristband (one ride up: Bruno snips it at the doors) and The
// Black Card (the penthouse for good, pawned back to Mr. Vance for half, in chips). The server has
// the last word (VIP_WRISTBAND_BUY / VIP_PASS_BUY / VIP_PASS_PAWN, answered with vipPassResult).

interface CardProps {
  hasPass: boolean;
  wristbands: number;
  coins: number;
  /** Where you are: the cage buys and pawns, Bruno only sells. */
  where: "cage" | "bruno";
  send: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

const coin = (n: number) => n.toLocaleString("en-US");
const LINES: Record<string, string> = {
  buy: "The Black Card is yours. The penthouse is open to you, every night.",
  wristband: "A Velvet VIP Wristband, snug on your wrist. Show it to Bruno at the doors.",
  pawn: `Pawned: ${chipText(VIP_PASS.pawn)} chips, counted twice. The card stays with me until you want it again.`,
  coins: "Not enough coins for that, I'm afraid.",
  far: "Step up to the window, if you please.",
  have: "You carry The Black Card: the penthouse is already yours.",
  none: "You have no card to pawn, my friend.",
  full: `${MAX_WRISTBANDS} wristbands is plenty for anybody.`,
};

/** The wristband and the card, and what you can do with them here. */
export function VipPassCard({ hasPass, wristbands, coins, where, send, subscribeMessages }: CardProps) {
  const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef(0);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "vipPassResult") return;
        const r = payload as VipPassResult;
        window.clearTimeout(timer.current);
        setPending(false);
        if (r.ok) playSfx(r.kind === "pawn" ? "coins" : "jackpot");
        setSay({ text: r.ok ? LINES[r.kind] : LINES[r.reason ?? "far"], ok: r.ok });
      }),
    [subscribeMessages]
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const act = (packet: CasinoPacket) => {
    if (pending) return;
    setPending(true);
    timer.current = window.setTimeout(() => setPending(false), 3000);
    send(packet);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="vip-pass-card relative overflow-hidden rounded-2xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="casino-heading gold-foil text-lg tracking-[0.3em]">THE BLACK CARD</div>
            <div className="casino-heading gold-foil text-[11px] tracking-[0.5em] opacity-90">VELVET PENTHOUSE · FOR GOOD</div>
          </div>
          <span className="text-3xl" aria-hidden>
            {VIP_PASS.emoji}
          </span>
        </div>
        <div className="mt-6 flex items-end justify-between text-[11px] text-amber-100/80">
          <span>{hasPass ? "✦ Held in your account" : VIP_PASS.blurb}</span>
          <span className="shrink-0 pl-2 font-bold text-amber-200">{coin(VIP_PASS.price)} 🪙</span>
        </div>
      </div>
      {say && (
        <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/40" : "bg-rose-900/60"}`} key={say.text} role="status">
          {say.text}
        </div>
      )}
      {!hasPass && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending || coins < VIP_WRISTBAND.price || wristbands >= MAX_WRISTBANDS} onClick={() => act({ type: "VIP_WRISTBAND_BUY" })} className="clay-btn clay-btn-ghost flex min-h-14 flex-col items-center justify-center text-sm leading-tight">
            <span>
              {VIP_WRISTBAND.emoji} Wristband · {coin(VIP_WRISTBAND.price)} 🪙
            </span>
            <span className="text-[11px] opacity-75">one night{wristbands > 0 ? ` · you hold ${wristbands}` : ""}</span>
          </button>
          <button type="button" disabled={pending || coins < VIP_PASS.price} onClick={() => act({ type: "VIP_PASS_BUY" })} className="clay-btn clay-btn-amber flex min-h-14 flex-col items-center justify-center text-sm leading-tight">
            <span>
              {VIP_PASS.emoji} Black Card · {coin(VIP_PASS.price)} 🪙
            </span>
            <span className="text-[11px] opacity-80">for good</span>
          </button>
        </div>
      )}
      {hasPass && where === "cage" && (
        <button type="button" disabled={pending} onClick={() => act({ type: "VIP_PASS_PAWN" })} className="clay-btn clay-btn-ghost min-h-12 text-sm">
          Pawn The Black Card to Mr. Vance · +{chipText(VIP_PASS.pawn)} <VelvetChipIcon />
        </button>
      )}
      <div className="text-center text-[11px] opacity-60">
        You hold {coin(coins)} 🪙. The Black Card pawns back at the cage for {chipText(VIP_PASS.pawn)} chips. Coins only: nothing here is bought with real money.
      </div>
    </div>
  );
}

interface Props extends Omit<CardProps, "where"> {
  /** Bruno opens the doors for a pass holder. */
  onGoUp: () => void;
  onClose: () => void;
}

/** Bruno at the penthouse's gilded doors: a wristband or a card to sell, or the doors to open. */
export function VipPassModal({ hasPass, wristbands, coins, send, subscribeMessages, onGoUp, onClose }: Props) {
  const canGo = hasPass || wristbands > 0;
  return (
    <Modal title="The Penthouse Doors" icon="🕶️" onClose={onClose} width={440} tone="velvet">
      <div className="casino-body flex flex-col gap-3 pb-2">
        <div className="flex items-start gap-3 rounded-2xl bg-black/35 p-3 text-sm">
          <span className="text-4xl" aria-hidden>
            🐻
          </span>
          <div>
            <div className="casino-heading mb-0.5 text-[10px] uppercase tracking-[0.25em] text-amber-200/80">Bruno</div>
            {hasPass ? "Evening. The Black Card checks out: the elevator's waiting for you." : wristbands > 0 ? "A wristband, good. I'll snip it at the doors: the elevator's waiting." : "Members only, upstairs. A wristband gets you in for the night, The Black Card for good. I sell both."}
          </div>
        </div>
        <VipPassCard hasPass={hasPass} wristbands={wristbands} coins={coins} where="bruno" send={send} subscribeMessages={subscribeMessages} />
        {canGo && (
          <button type="button" onClick={onGoUp} className="clay-btn clay-btn-amber min-h-12 text-base">
            🛗 Take me up to the Penthouse
          </button>
        )}
      </div>
    </Modal>
  );
}
