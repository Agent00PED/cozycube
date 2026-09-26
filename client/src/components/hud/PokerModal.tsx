import { useEffect, useRef, useState } from "react";
import { POKER_ANTE_BONUS, POKER_RANKS, TABLE_LIMITS, limitPlacard, type PokerMove, type PokerRank, type PokerView } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { FlipCard } from "./PlayingCard";
import { ChipAmount } from "./VelvetChipIcon";

// Three-Card Poker at Boris's table on the High-Roller Stage. Put down an ante (keeping as much
// again for the Play bet), and three cards come to you face up, three to Boris face down. Play (the
// Play bet matches the ante) or fold; Boris turns his hand over, qualifying with a queen high or
// better. The server deals and settles (the "POKER" packet, answered with pokerState); this turns
// the cards over and says how it went.

interface Props {
  view: PokerView | null;
  chips: number;
  coins: number;
  onMove: (move: PokerMove) => void;
  onClose: () => void;
}

const LIMIT = TABLE_LIMITS.poker;

const OUTCOME: Record<string, string> = {
  fold: "You fold. Boris takes the ante.",
  noqualify: "Boris doesn't qualify (no queen high): your ante pays 1:1, the Play bet comes back.",
  win: "You beat Boris! Ante and Play pay 1:1.",
  lose: "Boris's hand wins.",
  push: "A tie: both bets come back.",
};

export function PokerModal({ view, chips, coins, onMove, onClose }: Props) {
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const deciding = view?.phase === "decide";
  const done = view?.phase === "done";
  const ante = clampStake(stake, LIMIT, chips, 0.5);
  const [sent, setSent] = useState(false);

  // the cards' sounds: dealt, then Boris's turned over; a fanfare for a big hand
  const seen = useRef("");
  useEffect(() => {
    setSent(false);
    if (!view) return;
    const key = `${view.phase}:${view.player.map((c) => c.rank + c.suit).join("")}`;
    if (seen.current === key) return;
    seen.current = key;
    if (view.phase === "decide") [0, 120, 240].forEach((ms) => window.setTimeout(() => playSfx("card", 0.8), ms));
    if (view.phase === "done" && view.outcome !== "fold") {
      [0, 140, 280].forEach((ms) => window.setTimeout(() => playSfx("card", 0.8), ms + 150));
      if (view.payout > view.ante * 2) window.setTimeout(() => playSfx(view.bonus > 0 ? "jackpot" : "coins"), 700);
    }
  }, [view]);

  // a refusal (short of chips, off the limits) sends no new hand: the buttons come back anyway
  const sentTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(sentTimer.current), []);
  const move = (m: PokerMove) => {
    if (sent) return;
    setSent(true);
    window.clearTimeout(sentTimer.current);
    sentTimer.current = window.setTimeout(() => setSent(false), 2500);
    onMove(m);
  };

  const dealer = view?.dealer ?? [];
  const player = view?.player ?? [];

  return (
    <Modal title="Three-Card Poker with Boris" icon="🐻‍❄️" onClose={onClose} width={560} tone="felt" placard={`ANTE ${limitPlacard(LIMIT)} · TOTAL RISK ${(LIMIT.max * 2).toLocaleString("en-US")}`}>
      <div className="flex flex-col gap-3 pb-2">
        {/* Boris's hand: face down until you play or fold */}
        <div className="rounded-3xl bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-70">
            <span>Boris</span>
            <span>{done && view?.outcome !== "fold" ? `${view?.dealerHand}${view?.qualifies ? "" : " · doesn't qualify"}` : "plays with Q-high or better"}</span>
          </div>
          <div className="flex min-h-[84px] items-center justify-center gap-2">
            {view && view.phase !== "idle"
              ? [0, 1, 2].map((i) => <FlipCard key={`d${i}-${view.ante}-${player.map((c) => c.rank + c.suit).join("")}`} card={dealer[i] ?? null} faceUp={done && dealer.length === 3} delay={i * 140} />)
              : <span className="text-xs opacity-40">—</span>}
          </div>
        </div>

        <div className="min-h-[2.5rem] text-center text-sm font-extrabold text-amber-200" role="status">
          {done && view ? (
            <>
              {OUTCOME[view.outcome] ?? ""}
              {view.bonus > 0 && (
                <div className="text-xs text-emerald-200">
                  Ante bonus for your {view.playerHand}: +<ChipAmount n={view.bonus} />
                </div>
              )}
              {view.payout > 0 && (
                <span className="ml-2 rounded-full bg-amber-300 px-2 py-0.5 text-amber-950">
                  +<ChipAmount n={view.payout} />
                </span>
              )}
            </>
          ) : deciding ? (
            "Play (match your ante) or fold?"
          ) : (
            "Put down an ante to be dealt in"
          )}
        </div>

        {/* your hand: face up */}
        <div className="rounded-3xl bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-70">
            <span>You</span>
            <span className="text-amber-200">{view?.playerHand ?? ""}</span>
          </div>
          <div className="flex min-h-[84px] items-center justify-center gap-2">
            {player.length ? player.map((c, i) => <FlipCard key={`p${i}-${c.rank}${c.suit}`} card={c} faceUp delay={i * 120} />) : <span className="text-xs opacity-40">—</span>}
          </div>
        </div>

        {deciding && view ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex justify-center gap-2">
              <button type="button" disabled={sent || chips < view.ante} onClick={() => move({ action: "play" })} className="clay-btn clay-btn-mint min-h-12 px-6">
                Play · <ChipAmount n={view.ante} />
              </button>
              <button type="button" disabled={sent} onClick={() => move({ action: "fold" })} className="clay-btn clay-btn-rose min-h-12 px-6">
                Fold
              </button>
            </div>
            <div className="text-xs opacity-70">
              Ante on the table: <ChipAmount n={view.ante} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <BetPicker limit={LIMIT} chips={chips} value={ante} onChange={setStake} share={0.5} label="Ante" />
            <button type="button" disabled={sent || chips < ante * 2 || Math.floor(chips / 2) < LIMIT.min} onClick={() => move({ action: "deal", ante })} className="clay-btn clay-btn-amber min-h-12 px-8 text-base">
              Deal · ante <ChipAmount n={ante} />
            </button>
            <div className="text-[11px] opacity-60">You keep as much again for the Play bet: ALL IN stakes half your chips (up to {LIMIT.max.toLocaleString("en-US")}).</div>
            <ShortOfChips limit={LIMIT} chips={chips} coins={coins} share={0.5} />
          </div>
        )}

        <details className="w-full rounded-2xl bg-white/5 px-4 py-2 text-xs">
          <summary className="cursor-pointer font-bold">How hands rank, and the ante bonus</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {[...POKER_RANKS].reverse().map((name, i) => {
              const rank = (POKER_RANKS.length - 1 - i) as PokerRank;
              const bonus = POKER_ANTE_BONUS[rank];
              return (
                <div key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="font-bold text-amber-200">{bonus ? `bonus ${bonus}:1` : ""}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 opacity-70">With three cards a straight beats a flush. The ante bonus is paid on any played hand, whatever Boris holds.</p>
        </details>
      </div>
    </Modal>
  );
}
