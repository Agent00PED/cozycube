import { useEffect, useRef, useState } from "react";
import { BLACKJACK_MAX_HANDS, TABLE_LIMITS, canSplit, limitPlacard, type BlackjackAction, type BlackjackHandView, type BlackjackSeatView, type BlackjackTableView, type BlackjackTier, type Card } from "@shared/casino";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";
import { CardBack, CardFace } from "./PlayingCard";
import { playSfx } from "../../audio/sfx";

// A blackjack table, drawn as the felt itself: a green half-moon with the dealer behind its flat
// side and the four stools round its curve, every hand where it lies. The server runs the round
// (shared/casino.ts): the first bet opens a short betting window, then everyone seated is dealt in
// together and plays their own hands at once (hit, stand, double down on two cards, split a pair),
// the dealer draws to 17 and the table settles. A pair split becomes two hands side by side, the
// second stake taken to match, each with its own Hit and Stand. You play from a stool; standing,
// you look on.

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
  onAction: (action: BlackjackAction, bet?: number, hand?: number) => void;
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
/** Where each stool sits round the curve (percent of the felt), as the dealer sees them. */
const STOOLS: [number, number][] = [
  [13, 50],
  [35, 78],
  [65, 78],
  [87, 50],
];

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
  const felt = table.tier === "blackjack_high" ? "from-[#27528c] via-[#1c3f6e] to-[#122a4c]" : "from-[#24854f] via-[#1c6b3f] to-[#114a2a]";

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
  const playing = phase === "playing" && !!mine?.hands.some((h) => h.status === "playing");

  return (
    <Modal landscape title={`Blackjack · ${table.label}`} icon="🃏" onClose={onClose} tone="felt" placard={limitPlacard(limit)}>
      <div className="casino-body flex min-h-0 flex-1 gap-3">
        {/* the felt: a half-moon, the dealer behind its flat side, the stools round its curve */}
        <div className={`relative min-h-0 flex-1 overflow-hidden rounded-b-[50%_60%] rounded-t-2xl border-[8px] border-t-[14px] border-[#4a2616] bg-gradient-to-b ${felt} shadow-[inset_0_0_40px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.45)]`}>
          <div className="pointer-events-none absolute inset-x-[8%] bottom-[6%] top-[36%] rounded-b-[50%_70%] border-2 border-t-0 border-amber-200/30" />
          <div className="pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 text-center">
            <div className="casino-heading text-sm tracking-[0.35em] text-amber-200/70">BLACKJACK PAYS 3 TO 2</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-50/45">Dealer must stand on 17 · Insurance not offered</div>
          </div>
          {/* the dealer */}
          <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center gap-1">
            <span className="rounded-full bg-black/40 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100">
              {DEALERS[table.dealer]}
              {view && view.dealer.length > 0 ? ` · ${view.holeHidden ? `${view.dealerTotal} + ?` : view.dealerTotal}` : ""}
            </span>
            <div className="flex min-h-[80px] items-center gap-1.5">
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
              {!view?.dealer.length && <span className="text-xs text-amber-50/50">The shoe is ready</span>}
            </div>
          </div>
          {/* the stools */}
          {table.stools.map((stool, k) => {
            const seat = view?.seats.find((s) => s.stool === stool);
            const [x, y] = STOOLS[k] ?? [50, 70];
            return (
              <div key={stool} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                <Stool n={k + 1} seat={seat} name={seat?.username ?? stoolNames[stool] ?? ""} mine={!!seat && seat.sessionId === localSessionId} phase={phase} />
              </div>
            );
          })}
        </div>

        {/* your side: the bet, or your hands' moves */}
        <div className="flex min-h-0 w-[21rem] min-w-0 flex-col gap-2">
          <span className="self-start rounded-full border border-amber-300/40 bg-black/40 px-3 py-1 text-xs font-bold text-amber-100">{status}</span>
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
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/25 p-3">
              <BetPicker limit={limit} chips={chips} value={bet} onChange={setStake} />
              <button type="button" disabled={chips < bet || chips < limit.min} onClick={() => onAction("bet", bet)} className="clay-btn clay-btn-amber min-h-12 w-full text-base">
                Bet · <ChipAmount n={bet} />
              </button>
              <ShortOfChips limit={limit} chips={chips} coins={coins} />
            </div>
          ) : phase === "betting" ? (
            <div className="rounded-2xl bg-black/25 p-3 text-center text-sm text-amber-100">
              Your <ChipAmount n={mine!.bet} /> is down. The cards come out in {left}s (or once everyone seated has bet).
            </div>
          ) : phase === "playing" && mine?.hands.length ? (
            <div className={`grid min-h-0 gap-2 ${mine.hands.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {mine.hands.map((h, i) => {
                const live = h.status === "playing";
                return (
                  <div key={i} className={`flex flex-col gap-1.5 rounded-2xl border p-2 ${live ? "border-amber-300/70 bg-amber-200/10" : "border-white/10 bg-black/25 opacity-80"}`}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold">{mine.hands.length > 1 ? `Hand ${i + 1}` : "Your hand"}</span>
                      <span>
                        <b className="text-amber-100">{h.total}</b> · <ChipAmount n={h.bet} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {h.cards.map((c, j) => (
                        <MiniCard key={j} card={c} />
                      ))}
                    </div>
                    {live ? (
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" onClick={() => onAction("hit", undefined, i)} className="clay-btn clay-btn-mint min-h-9 text-sm">
                          Hit
                        </button>
                        <button type="button" onClick={() => onAction("stand", undefined, i)} className="clay-btn clay-btn-rose min-h-9 text-sm">
                          Stand
                        </button>
                        <button type="button" disabled={h.cards.length !== 2 || chips < h.bet} onClick={() => onAction("double", undefined, i)} className="clay-btn clay-btn-amber min-h-9 text-xs" title="Double your stake, take exactly one more card, and stand">
                          Double
                        </button>
                        <button type="button" disabled={!canSplit(h.cards) || mine.hands.length >= BLACKJACK_MAX_HANDS || chips < h.bet} onClick={() => onAction("split", undefined, i)} className="clay-btn clay-btn-amber min-h-9 text-xs" title="Split the pair into two hands: a matching stake goes on the new one">
                          Split
                        </button>
                      </div>
                    ) : (
                      <span className="text-center text-[11px] opacity-70">{h.status === "bust" ? "Bust" : h.status === "blackjack" ? "Blackjack!" : "Standing"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : phase === "playing" ? (
            <div className="rounded-2xl bg-black/25 p-3 text-center text-sm opacity-80">{mine ? "Your hands are done: the others are playing theirs." : "You sat down mid-round: you're in on the next deal."}</div>
          ) : (
            <div className="rounded-2xl bg-black/25 p-3 text-center text-sm">
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
          {playing && mine && mine.hands.length > 1 && <p className="text-center text-[11px] opacity-65">Split: each hand plays on its own, a stake apiece.</p>}
          <p className="mt-auto text-center text-[11px] opacity-60">Dealer stands on 17 · Blackjack pays 3:2 · Split any pair (split aces take one card each)</p>
        </div>
      </div>
    </Modal>
  );
}

function Stool({ n, seat, name, mine, phase }: { n: number; seat?: BlackjackSeatView; name: string; mine: boolean; phase: string }) {
  return (
    <div className={`flex min-w-[7.5rem] flex-col items-center gap-1 rounded-2xl border px-2 py-1.5 ${mine ? "border-amber-300/80 bg-black/35 shadow-[0_0_14px_rgba(255,200,90,0.35)]" : "border-white/10 bg-black/25"}`}>
      <div className="flex w-full items-center justify-between gap-1 text-[11px]">
        <span className="max-w-[6rem] truncate font-bold">{name ? name : <span className="opacity-40">Open stool</span>}</span>
        <span className="shrink-0 opacity-50">#{n}</span>
      </div>
      {seat && phase === "betting" && seat.bet > 0 && (
        <div className="text-xs text-amber-100">
          Bet <ChipAmount n={seat.bet} />
        </div>
      )}
      <div className="flex gap-1.5">
        {seat?.hands.map((h, i) => (
          <SeatHand key={i} hand={h} />
        ))}
      </div>
      {name && !seat?.hands.length && !(seat && seat.bet > 0) && <span className="text-[10px] opacity-50">{phase === "betting" ? "Thinking it over" : "Sitting this one out"}</span>}
    </div>
  );
}

function SeatHand({ hand }: { hand: BlackjackHandView }) {
  const o = OUTCOME[hand.outcome];
  const live = hand.status === "playing";
  return (
    <div className={`rounded-xl p-1 ${live ? "bg-amber-200/15 ring-1 ring-amber-300/70" : ""}`}>
      <div className="flex gap-0.5">
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
