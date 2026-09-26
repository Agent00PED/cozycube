import { useEffect, useRef, useState } from "react";
import { TABLE_LIMITS, limitPlacard, type BlackjackAction, type BlackjackCard, type BlackjackView } from "@shared/casino";
import type { BlackjackTier } from "@shared/worlds/casino";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";

// The blackjack tables: the server deals, hits, stands and pays; this shows the hand it sends
// back and offers the moves that are legal right now. Stakes and payouts are Velvet Chips, within
// the table's limits (Table 1 casual, Table 2 high stakes), with an ALL IN up to the table's cap.
interface Props {
  view: BlackjackView | null;
  /** The table you are at: its limits. */
  tier: BlackjackTier;
  tableLabel: string;
  /** Velvet Chips: what you can stake (and coins, for the cage's advice when both run out). */
  chips: number;
  coins: number;
  onAction: (action: BlackjackAction, bet?: number) => void;
  onClose: () => void;
}

const OUTCOME_TEXT: Record<string, string> = {
  blackjack: "Blackjack! Pays 3 to 2 🎉",
  win: "You win!",
  push: "Push — stake returned",
  lose: "Dealer wins",
  bust: "Bust! Over 21",
};

export function BlackjackModal({ view, tier, tableLabel, chips, coins, onAction, onClose }: Props) {
  const idle = !view || view.phase === "idle" || view.phase === "done";
  const limit = TABLE_LIMITS[tier];
  const [stake, setStake] = useState<number>(limit.presets[0]);
  const bet = clampStake(stake, limit, chips);
  const cardsSeen = useRef(0);
  // card sounds as cards arrive; a fanfare when it pays
  useEffect(() => {
    const n = (view?.player.length ?? 0) + (view?.dealer.length ?? 0);
    cardsSeen.current = n;
  }, [view?.player.length, view?.dealer.length]);
  const settled = useRef("");
  useEffect(() => {
    if (!view || view.phase !== "done") return;
    const key = `${view.outcome}:${view.payout}:${view.player.length}`;
    if (settled.current === key) return;
    settled.current = key;
  }, [view]);

  return (
    <Modal title={`Blackjack · ${tableLabel}${tier === "blackjack_high" ? " (High Stakes)" : " (Casual)"}`} icon="🃏" onClose={onClose} width={540} tone="felt" placard={limitPlacard(limit)}>
      <div className="flex flex-col gap-4 pb-2">
        <Hand title="Dealer" cards={view?.dealer ?? []} total={view?.dealerTotal ?? 0} hidden={!!view?.holeHidden} />
        <div className="text-center text-sm font-extrabold text-amber-200">
          {view?.phase === "done" ? OUTCOME_TEXT[view.outcome] ?? "" : view?.phase === "player" ? "Your move" : "Place a bet to be dealt in"}
          {view?.phase === "done" && view.payout > 0 && (
            <span className="ml-2 rounded-full bg-amber-300 px-2 py-0.5 text-amber-950">
              +<ChipAmount n={view.payout} />
            </span>
          )}
        </div>
        <Hand title="You" cards={view?.player ?? []} total={view?.playerTotal ?? 0} />

        {idle ? (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs opacity-70">Cedric stands on 17 · Blackjack pays 3:2</div>
            <BetPicker limit={limit} chips={chips} value={bet} onChange={setStake} />
            <button type="button" disabled={chips < bet || chips < limit.min} onClick={() => onAction("deal", bet)} className="clay-btn clay-btn-amber min-h-12 px-8 text-base">
              Deal · <ChipAmount n={bet} />
            </button>
            <ShortOfChips limit={limit} chips={chips} coins={coins} />
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => (onAction("hit"))} className="clay-btn clay-btn-mint px-6">
              Hit
            </button>
            <button type="button" onClick={() => (onAction("stand"))} className="clay-btn clay-btn-rose px-6">
              Stand
            </button>
            <button type="button" disabled={!view?.canDouble || chips < (view?.bet ?? 0)} onClick={() => (onAction("double"))} className="clay-btn clay-btn-amber px-4" title="Double the stake in chips, take one card, stand">
              Double
            </button>
          </div>
        )}
        {view && view.phase !== "idle" && (
          <div className="text-center text-xs opacity-70">
            Stake on the table: <ChipAmount n={view.bet} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Hand({ title, cards, total, hidden = false }: { title: string; cards: BlackjackCard[]; total: number; hidden?: boolean }) {
  return (
    <div className="rounded-3xl bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-70">
        <span>{title}</span>
        <span>{cards.length ? (hidden ? `${total} + ?` : total) : ""}</span>
      </div>
      <div className="flex min-h-[84px] flex-wrap items-center gap-2">
        {cards.map((c, i) => (
          <Card key={`${i}-${c.rank}${c.suit}`} card={c} />
        ))}
        {hidden && <CardBack />}
        {cards.length === 0 && <span className="text-xs opacity-40">—</span>}
      </div>
    </div>
  );
}

function Card({ card }: { card: BlackjackCard }) {
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`card-deal flex h-20 w-14 flex-col justify-between rounded-xl border border-stone-300 bg-stone-50 p-1.5 font-serif text-lg font-black shadow-lg ${red ? "text-red-600" : "text-stone-900"}`}>
      <span className="leading-none">
        {card.rank}
        <span className="text-sm">{card.suit}</span>
      </span>
      <span className="self-end text-2xl leading-none">{card.suit}</span>
    </div>
  );
}

function CardBack() {
  return <div className="card-deal h-20 w-14 rounded-xl border border-amber-200/40 bg-[repeating-linear-gradient(45deg,#7a1f2e_0,#7a1f2e_6px,#5a1522_6px,#5a1522_12px)] shadow-lg" />;
}
