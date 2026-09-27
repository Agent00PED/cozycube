import { useEffect, useRef, useState } from "react";
import { chipText, type CasinoPacket, type VipPassResult } from "@shared/casino";
import { VIP_PASS } from "@shared/items";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { VelvetChipIcon } from "./VelvetChipIcon";

// The Black Velvet VIP Pass: bought for chips from Mr. Vance at the cage or from Bruno at the
// penthouse's doors, kept in your account, and pawned back to Mr. Vance for half. With it, Bruno
// takes you up to the Velvet Penthouse (its high-limit poker, baccarat and the Golden Vault). The
// server has the last word (VIP_PASS_BUY / VIP_PASS_PAWN, answered with vipPassResult).

interface CardProps {
  hasPass: boolean;
  chips: number;
  /** Where you are: the cage buys and pawns, Bruno only sells. */
  where: "cage" | "bruno";
  send: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

const LINES: Record<string, string> = {
  buy: "The Black Velvet Pass is yours. The penthouse awaits.",
  pawn: `Pawned: ${chipText(VIP_PASS.pawn)} chips, counted twice. The pass stays with me until you want it again.`,
  chips: `The pass is ${chipText(VIP_PASS.price)} Velvet Chips. Mr. Vance changes coins for chips at the cage.`,
  far: "Step up to the window, if you please.",
  have: "You already carry a pass: one is all anybody needs.",
  none: "You have no pass to pawn, my friend.",
};

/** The pass itself, and what you can do with it here. */
export function VipPassCard({ hasPass, chips, where, send, subscribeMessages }: CardProps) {
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
        if (r.ok) playSfx(r.kind === "buy" ? "jackpot" : "coins");
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
            <div className="casino-heading gold-foil text-lg tracking-[0.3em]">BLACK VELVET</div>
            <div className="casino-heading gold-foil text-[11px] tracking-[0.5em] opacity-90">VIP · PENTHOUSE PASS</div>
          </div>
          <span className="text-3xl" aria-hidden>
            {VIP_PASS.emoji}
          </span>
        </div>
        <div className="mt-6 flex items-end justify-between text-[11px] text-amber-100/80">
          <span>{hasPass ? "✦ Held in your account" : VIP_PASS.blurb}</span>
          <span className="shrink-0 pl-2 font-bold text-amber-200">
            {chipText(VIP_PASS.price)} <VelvetChipIcon />
          </span>
        </div>
      </div>
      {say && (
        <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/40" : "bg-rose-900/60"}`} key={say.text} role="status">
          {say.text}
        </div>
      )}
      {!hasPass ? (
        <button type="button" disabled={pending || chips < VIP_PASS.price} onClick={() => act({ type: "VIP_PASS_BUY" })} className="clay-btn clay-btn-amber min-h-12 text-base">
          {chips < VIP_PASS.price ? (
            <>
              Needs {chipText(VIP_PASS.price)} <VelvetChipIcon /> (you hold {chipText(chips)})
            </>
          ) : (
            <>
              Buy the Pass · {chipText(VIP_PASS.price)} <VelvetChipIcon />
            </>
          )}
        </button>
      ) : where === "cage" ? (
        <button type="button" disabled={pending} onClick={() => act({ type: "VIP_PASS_PAWN" })} className="clay-btn clay-btn-ghost min-h-11 text-sm">
          Pawn it back to Mr. Vance · +{chipText(VIP_PASS.pawn)} <VelvetChipIcon />
        </button>
      ) : null}
      <div className="text-center text-[11px] opacity-60">
        Pawned back at the cage for {chipText(VIP_PASS.pawn)} chips (half). Chips only: nothing here is bought with real money.
      </div>
    </div>
  );
}

interface Props extends Omit<CardProps, "where"> {
  /** Bruno opens the doors for a pass holder. */
  onGoUp: () => void;
  onClose: () => void;
}

/** Bruno at the penthouse's gilded doors: a pass to sell, or the doors to open. */
export function VipPassModal({ hasPass, chips, send, subscribeMessages, onGoUp, onClose }: Props) {
  return (
    <Modal title="The Penthouse Doors" icon="🕶️" onClose={onClose} width={440} tone="velvet">
      <div className="casino-body flex flex-col gap-3 pb-2">
        <div className="flex items-start gap-3 rounded-2xl bg-black/35 p-3 text-sm">
          <span className="text-4xl" aria-hidden>
            🐻
          </span>
          <div>
            <div className="casino-heading mb-0.5 text-[10px] uppercase tracking-[0.25em] text-amber-200/80">Bruno</div>
            {hasPass ? "Evening. The pass checks out: the elevator's waiting for you." : "Members only, upstairs. A Black Velvet Pass gets you in, and I can sell you one right here."}
          </div>
        </div>
        <VipPassCard hasPass={hasPass} chips={chips} where="bruno" send={send} subscribeMessages={subscribeMessages} />
        {hasPass && (
          <button type="button" onClick={onGoUp} className="clay-btn clay-btn-amber min-h-12 text-base">
            🛗 Take me up to the Penthouse
          </button>
        )}
      </div>
    </Modal>
  );
}
