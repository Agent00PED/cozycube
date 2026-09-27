import { useEffect, useRef, useState } from "react";
import { BLACKJACK_MAX_HANDS, TABLE_LIMITS, canSplit, limitPlacard, type BlackjackAction, type BlackjackHandView, type BlackjackSeatView, type BlackjackTableView, type BlackjackTier, type Card } from "@shared/casino";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";
import { CardBack, CardFace } from "./PlayingCard";
import { playSfx } from "../../audio/sfx";

// A blackjack table: every stool's hands at once, the way the dealer sees them. The server runs the
// round (shared/casino.ts): the first bet opens a short betting window, then everyone seated is dealt
// in together and plays their own hands at once (hit, stand, double down on two cards, split a pair),
// the dealer draws to 17 and the table settles. You play from a stool; standing, you look on.

interface Props {
  view: BlackjackTableView | null;
  table: { id: string; label: string; tier: BlackjackTier; dealer: "cedric" | "gideon"; stools: string[] };
  /** Who sits on each stool (a username, or "" for an open stool). */
  stoolNames: Record<string, string>;
  localSessionId: string;
  /** You are on one of this table's stools. */
  seated: boolean;
  chips: number;
  coins: number;
  onAction: (action: BlackjackAction, bet?: number) => void;
  /** Walk to the nearest open stool and sit (standing, looking on). */
  onTakeSeat: () => void;
  onClose: () => void;
}

const DEALERS = { cedric: "Cedric", gideon: "Gideon" };
const OUTCOME: Record<string, { text: string; tone: string }> = {
  blackjack: { text: "Blackjack!", tone: "bg-amber-300 text-amber-950" },
  win: { text: "Win", tone: "bg-emerald-300 text-emerald-950" },
  push: { text: "Push", tone: "bg-stone-300 text-stone-900" },
  lose: { text: "Lose", tone: "bg-rose-400/80 text-rose-950" },
  bust: { text: "Bust", tone: "bg-rose-500/80 text-white" },
};

/** Seconds left on the table's clock, counted down between the server's words. */
function useCountdown(view: BlackjackTableView | null): number {
  const [now, setNow] = useState(() => performance.now());
  const at = useRef({ key: "", t: performance.now() });
  const key = view ? `${view.round}:${view.phase}:${view.timeLeft}` : "";
  if (key !== at.current.key) at.current = { key, t: performance.now() };
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  if (!view || view.timeLeft <= 0) return 0;
  return Math.max(0, Math.ceil(view.timeLeft - (now - at.current.t) / 1000));
}

export function BlackjackModal({ view, table, stoolNames, localSessionId, seated, chips, coins, onAction, onTakeSeat, onClose }: Props) {
  const limit = TABLE_LIMITS[table.tier];
  const [stake, setStake] = useState<number>(limit.presets[0]);
  const bet = clampStake(stake, limit, chips);
  const left = useCountdown(view);
  const phase = view?.phase ?? "betting";
  const mine = view?.seats.find((s) => s.sessionId === localSessionId);
  // the hand you are playing: your first one still in play
  const active = mine?.hands.findIndex((h) => h.status === "playing") ?? -1;
  const hand = active >= 0 ? mine!.hands[active] : undefined;

  // a card's snap as the cards come out, a chime when your hands pay
  const cards = (view?.dealer.length ?? 0) + (view?.seats.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0) ?? 0);
  const seen = useRef(cards);
  useEffect(() => {
    if (cards > seen.current) playSfx("card", 0.7);
    seen.current = cards;
  }, [cards]);
  const paid = phase === "settled" ? (mine?.hands.reduce((n, h) => n + h.payout, 0) ?? 0) : 0;
  const staked = mine?.hands.reduce((n, h) => n + h.bet, 0) ?? 0;
  const settledKey = phase === "settled" ? `${view?.round}` : "";
  const chimed = useRef("");
  useEffect(() => {
    if (!settledKey || chimed.current === settledKey) return;
    chimed.current = settledKey;
    if (paid > staked) playSfx("coins");
  }, [settledKey, paid, staked]);

  const status =
    phase === "betting"
      ? view?.seats.some((s) => s.bet > 0)
        ? `Bets closing in ${left}s`
        : "Place a bet to open the round"
      : phase === "playing"
        ? `Playing · ${left}s on the clock`
        : "Round settled";

  return (
    <Modal title={`Blackjack · ${table.label}`} icon="🃏" onClose={onClose} width={680} tone="felt" placard={limitPlacard(limit)}>
      <div className="casino-body flex flex-col gap-3 pb-2">
        {/* the dealer's side of the felt */}
        <div className="flex items-start justify-between gap-3 rounded-3xl bg-black/25 p-3">
          <div className="min-w-0">
            <div className="casino-heading mb-2 text-xs uppercase tracking-[0.2em] text-amber-200/90">
              {DEALERS[table.dealer]} · Dealer{view && view.dealer.length > 0 ? ` · ${view.holeHidden ? `${view.dealerTotal} + ?` : view.dealerTotal}` : ""}
            </div>
            <div className="flex min-h-[80px] flex-wrap items-center gap-1.5">
              {view?.dealer.map((c, i) => (
                <div key={`${view.round}-${i}`} className="card-deal">
                  <CardFace card={c} />
                </div>
              ))}
              {view?.holeHidden && (
                <div className="card-deal">
                  <CardBack />
                </div>
              )}
              {!view?.dealer.length && <span className="text-xs opacity-50">The shoe is ready</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <span className="rounded-full border border-amber-300/40 bg-black/40 px-3 py-1 text-xs font-bold text-amber-100">{status}</span>
            <span className="text-[11px] opacity-60">Dealer stands on 17 · Blackjack pays 3:2</span>
          </div>
        </div>

        {/* the stools, left to right as the dealer sees them */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {table.stools.map((stool, k) => {
            const seat = view?.seats.find((s) => s.stool === stool);
            return <Stool key={stool} n={k + 1} seat={seat} name={seat?.username ?? stoolNames[stool] ?? ""} mine={!!seat && seat.sessionId === localSessionId} active={seat?.sessionId === localSessionId ? active : -1} phase={phase} />;
          })}
        </div>

        {/* your moves */}
        {!seated ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/25 p-3 text-center text-sm">
            <span className="opacity-80">You're watching from the rail. Blackjack is played from a stool.</span>
            {table.stools.some((s) => !stoolNames[s]) ? (
              <button type="button" onClick={onTakeSeat} className="clay-btn clay-btn-amber px-6">
                🪑 Take a Seat
              </button>
            ) : (
              <span className="text-xs text-amber-200">Table is full — please wait or spectate</span>
            )}
          </div>
        ) : phase === "betting" && !(mine && mine.bet > 0) ? (
          <div className="flex flex-col items-center gap-2">
            <BetPicker limit={limit} chips={chips} value={bet} onChange={setStake} />
            <button type="button" disabled={chips < bet || chips < limit.min} onClick={() => onAction("bet", bet)} className="clay-btn clay-btn-amber min-h-12 px-8 text-base">
              Bet · <ChipAmount n={bet} />
            </button>
            <ShortOfChips limit={limit} chips={chips} coins={coins} />
          </div>
        ) : phase === "betting" ? (
          <div className="text-center text-sm text-amber-100">
            Your <ChipAmount n={mine!.bet} /> is down. The cards come out in {left}s (or once everyone seated has bet).
          </div>
        ) : phase === "playing" && hand ? (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs opacity-75">
              {mine!.hands.length > 1 ? `Hand ${active + 1} of ${mine!.hands.length} · ` : ""}
              {hand.total} · stake <ChipAmount n={hand.bet} />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => onAction("hit")} className="clay-btn clay-btn-mint px-6">
                Hit
              </button>
              <button type="button" onClick={() => onAction("stand")} className="clay-btn clay-btn-rose px-6">
                Stand
              </button>
              <button type="button" disabled={hand.cards.length !== 2 || chips < hand.bet} onClick={() => onAction("double")} className="clay-btn clay-btn-amber px-4" title="Double your stake, take exactly one more card, and stand">
                Double
              </button>
              <button type="button" disabled={!canSplit(hand.cards) || mine!.hands.length >= BLACKJACK_MAX_HANDS || chips < hand.bet} onClick={() => onAction("split")} className="clay-btn clay-btn-amber px-4" title="Split the pair into two hands, a second stake on the new one">
                Split
              </button>
            </div>
          </div>
        ) : phase === "playing" ? (
          <div className="text-center text-sm opacity-80">{mine ? "Your hands are done: the others are playing theirs." : "You sat down mid-round: you're in on the next deal."}</div>
        ) : (
          <div className="text-center text-sm">
            {mine ? (
              paid > 0 ? (
                <span className="rounded-full bg-amber-300 px-3 py-1 font-extrabold text-amber-950">
                  +<ChipAmount n={paid} /> back
                </span>
              ) : (
                <span className="opacity-80">The house takes this one. The next round opens in a moment.</span>
              )
            ) : (
              <span className="opacity-80">The next round opens in a moment.</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stool({ n, seat, name, mine, active, phase }: { n: number; seat?: BlackjackSeatView; name: string; mine: boolean; active: number; phase: string }) {
  return (
    <div className={`flex min-h-[132px] flex-col gap-1.5 rounded-2xl border p-2 ${mine ? "border-amber-300/80 bg-amber-200/10 shadow-[0_0_14px_rgba(255,200,90,0.25)]" : "border-white/10 bg-black/20"}`}>
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <span className="truncate font-bold">{name ? name : <span className="opacity-40">Open stool</span>}</span>
        <span className="shrink-0 opacity-50">#{n}</span>
      </div>
      {seat && phase === "betting" && seat.bet > 0 && (
        <div className="text-xs text-amber-100">
          Bet <ChipAmount n={seat.bet} />
        </div>
      )}
      {seat?.hands.map((h, i) => <SeatHand key={i} hand={h} active={i === active} />)}
      {name && !seat?.hands.length && !(seat && seat.bet > 0) && <span className="text-[11px] opacity-50">{phase === "betting" ? "Thinking it over" : "Sitting this one out"}</span>}
    </div>
  );
}

function SeatHand({ hand, active }: { hand: BlackjackHandView; active: boolean }) {
  const o = OUTCOME[hand.outcome];
  return (
    <div className={`rounded-xl p-1 ${active ? "bg-amber-200/15 ring-1 ring-amber-300/70" : ""}`}>
      <div className="flex flex-wrap gap-0.5">
        {hand.cards.map((c, i) => (
          <MiniCard key={i} card={c} />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
        <span className="font-bold">
          {hand.total}
          {hand.doubled ? " · ×2" : ""}
        </span>
        {o ? <span className={`rounded-full px-1.5 font-black ${o.tone}`}>{o.text}</span> : <ChipAmount n={hand.bet} />}
      </div>
    </div>
  );
}

function MiniCard({ card }: { card: Card }) {
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`card-deal flex h-11 w-8 flex-col justify-between rounded-md border border-stone-300 bg-stone-50 p-0.5 font-serif text-[11px] font-black leading-none shadow ${red ? "text-red-600" : "text-stone-900"}`}>
      <span>{card.rank}</span>
      <span className="self-end text-sm">{card.suit}</span>
    </div>
  );
}
