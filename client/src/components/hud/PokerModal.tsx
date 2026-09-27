import { useEffect, useMemo, useRef, useState } from "react";
import { TABLE_LIMITS, chipText, limitPlacard, type Card } from "@shared/casino";
import { HOLDEM_BLINDS, HOLDEM_HANDS, type HoldemMove, type HoldemTable, type HoldemView } from "@shared/holdem";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { CardBack, CardFace } from "./PlayingCard";
import { ChipAmount, VelvetChipIcon } from "./VelvetChipIcon";

// No-Limit Texas Hold'em at Boris's table on the High-Roller Stage (or the penthouse's high-limit
// one, with Baron von Fox): your own hand against the house. Buy in for the hand (the table's
// limits; every seat starts with as much), and two cards come to you face up and two to each of the
// others face down; the flop, the turn and the river come out on the felt between. Fold, check,
// call, raise any amount on the slider, or go all in. The server deals and plays the house's seats
// (shared/holdem.ts: "HOLDEM_DEAL" and "HOLDEM_MOVE", answered with "holdemState"); the table here
// replays what they did one move at a time before it is your turn again, and at the showdown turns
// their cards over.

interface Props {
  view: HoldemView | null;
  table: HoldemTable;
  chips: number;
  coins: number;
  onDeal: (buyIn: number) => void;
  onMove: (move: HoldemMove) => void;
  onClose: () => void;
}

/** Where each seat sits round the oval (percent of the table), by how many are at it: you at the
 *  bottom, the others clockwise from your left. */
const SEATS: Record<number, [number, number][]> = {
  3: [[50, 84], [15, 34], [85, 34]],
  4: [[50, 84], [11, 50], [50, 12], [89, 50]],
};
const REPLAY_MS = 620;

function SmallCard({ card, hidden }: { card?: Card; hidden?: boolean }) {
  return <div className="origin-top-left scale-[0.72]" style={{ width: 56 * 0.72, height: 80 * 0.72 }}>{hidden || !card ? <CardBack /> : <CardFace card={card} />}</div>;
}

export function PokerModal({ view: anyView, table, chips, coins, onDeal, onMove, onClose }: Props) {
  const view = anyView && anyView.table === table ? anyView : null;
  const LIMIT = TABLE_LIMITS[table];
  const { sb, bb } = HOLDEM_BLINDS[table];
  const vip = table === "poker_vip";
  const [stake, setStake] = useState<number>(LIMIT.presets[Math.min(2, LIMIT.presets.length - 1)]);
  const buyIn = clampStake(stake, LIMIT, chips);
  const playing = view?.phase === "playing";
  const done = view?.phase === "done";

  // the house's moves (and the cards they bring) come out one at a time
  const [shown, setShown] = useState(0);
  const handKey = view ? `${view.buyIn}:${view.seats.map((s) => s.name).join(",")}:${view.seats[0]?.cards.map((c) => c.rank + c.suit).join("")}` : "";
  const lastHand = useRef("");
  useEffect(() => {
    if (!view) return;
    if (handKey !== lastHand.current) {
      lastHand.current = handKey;
      setShown(0);
      [0, 110, 220, 330].forEach((ms) => window.setTimeout(() => playSfx("card", 0.7), ms));
    }
  }, [handKey, view]);
  const total = view?.log.length ?? 0;
  useEffect(() => {
    if (shown >= total) return;
    const next = view?.log[shown];
    const t = window.setTimeout(
      () => {
        setShown((n) => n + 1);
        if (!next) return;
        if (next.seat < 0) playSfx("card", 0.8);
        else if (/Wins/.test(next.text)) playSfx(view?.seats[next.seat]?.human ? "coins" : "clack", 0.8);
        else if (/Raises|Bets|All in|Calls|blind/.test(next.text)) playSfx("coinDrop", 0.5);
        else if (/Checks/.test(next.text)) playSfx("knock", 0.4);
      },
      shown === 0 ? 350 : REPLAY_MS
    );
    return () => window.clearTimeout(t);
  }, [shown, total, view]);
  const replaying = shown < total;
  // what the board shows so far: the streets whose "The flop" line has come out
  const visibleLog = view?.log.slice(0, shown) ?? [];
  const boardShown = useMemo(() => {
    if (!view) return 0;
    if (!replaying) return view.board.length;
    let n = 0;
    for (const e of visibleLog) if (e.seat < 0) n = e.street === "flop" ? 3 : e.street === "turn" ? 4 : e.street === "river" ? 5 : n;
    return Math.min(n, view.board.length);
  }, [view, replaying, visibleLog]);
  const lastBySeat = useMemo(() => {
    const m: Record<number, string> = {};
    for (const e of visibleLog) if (e.seat >= 0) m[e.seat] = e.text;
    return m;
  }, [visibleLog]);

  // the raise slider
  const o = view?.options;
  const [raiseTo, setRaiseTo] = useState(0);
  useEffect(() => {
    if (o?.canRaise) setRaiseTo(o.minRaiseTo);
  }, [o?.minRaiseTo, o?.canRaise]);
  const yourTurn = playing && !replaying && view!.toAct >= 0 && view!.seats[view!.toAct]?.human;
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [anyView]);
  const act = (m: HoldemMove) => {
    if (sent) return;
    setSent(true);
    window.setTimeout(() => setSent(false), 2500);
    onMove(m);
  };
  const deal = () => {
    if (sent) return;
    setSent(true);
    window.setTimeout(() => setSent(false), 2500);
    onDeal(buyIn);
  };
  // the end of a hand: a fanfare for a big one
  const chimed = useRef("");
  useEffect(() => {
    if (!done || replaying || chimed.current === handKey) return;
    chimed.current = handKey;
    if ((view?.net ?? 0) > 0) playSfx(view!.yourHand === "Royal Flush" || view!.yourHand === "Straight Flush" || view!.yourHand === "Four of a Kind" ? "jackpot" : "coins");
  }, [done, replaying, handKey, view]);

  const seats = view?.seats ?? [];
  const spots = SEATS[seats.length] ?? SEATS[4];
  const pot = view ? view.pot : 0;
  const you = seats.find((s) => s.human);
  const pctFor = (to: number) => (o && o.maxRaiseTo > o.minRaiseTo ? (to - o.minRaiseTo) / (o.maxRaiseTo - o.minRaiseTo) : 1);
  const snap = (v: number) => (o ? Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, Math.round(v / bb) * bb)) : v);

  return (
    <Modal landscape title={vip ? "High-Limit Hold'em · The Penthouse" : "Texas Hold'em · No Limit"} icon="🐻‍❄️" onClose={onClose} tone={vip ? "velvet" : "felt"} placard={`BUY-IN ${limitPlacard(LIMIT)} · BLINDS ${chipText(sb)}/${chipText(bb)}`}>
      <div className="casino-body flex min-h-0 flex-1 gap-3">
        {/* the table */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[48%/42%] border-[10px] border-[#4a2616] bg-[radial-gradient(ellipse_at_center,#237a4e_0%,#1a5e3c_55%,#113f28_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.55),0_8px_24px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-[7%] rounded-[48%/42%] border border-amber-200/25" />
          {/* the pot and the board */}
          <div className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <div className="casino-numeral rounded-full border border-amber-300/50 bg-black/45 px-3 py-0.5 text-sm text-amber-100">
              Pot <ChipAmount n={pot} />
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => {
                const c = view?.board[i];
                return i < boardShown && c ? (
                  <div key={`${handKey}-${i}`} className="card-deal">
                    <CardFace card={c} />
                  </div>
                ) : (
                  <div key={i} className="h-20 w-14 rounded-xl border border-dashed border-amber-100/20 bg-black/10" />
                );
              })}
            </div>
            {view && view.street !== "preflop" && boardShown >= 3 && <div className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">{boardShown === 3 ? "The Flop" : boardShown === 4 ? "The Turn" : "The River"}</div>}
          </div>
          {/* the seats */}
          {seats.map((s, i) => {
            const [x, y] = spots[i] ?? [50, 50];
            const showdown = done && !replaying && view!.street === "showdown";
            const acting = playing && !replaying && view!.toAct === i;
            const dealer = view!.button === i;
            const last = replaying ? lastBySeat[i] : s.last;
            return (
              <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: `${x}%`, top: `${y}%` }}>
                <div className={`flex items-center gap-2 rounded-2xl border px-2.5 py-1 shadow-lg ${acting ? "border-amber-300 bg-amber-300/20 shadow-[0_0_16px_rgba(255,210,110,0.45)]" : s.folded ? "border-white/5 bg-black/40 opacity-50" : "border-white/15 bg-black/45"}`}>
                  <span className="text-2xl leading-none">{s.emoji}</span>
                  <div className="flex flex-col leading-tight">
                    <span className="max-w-[9rem] truncate text-xs font-extrabold">
                      {s.human ? "You" : s.name}
                      {dealer && <span className="ml-1 rounded-full bg-stone-50 px-1 text-[9px] font-black text-stone-900">D</span>}
                    </span>
                    <span className="casino-numeral text-[11px] text-amber-100">
                      <ChipAmount n={s.stack} />
                      {s.allIn && <span className="ml-1 text-rose-300">ALL IN</span>}
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {(s.human || (showdown && s.cards.length) ? s.cards : [undefined, undefined]).map((c, k) => (
                    <SmallCard key={k} card={c} hidden={!s.human && !showdown} />
                  ))}
                </div>
                {last && <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-amber-50">{last}</span>}
                {s.bet > 0 && !replaying && (
                  <span className="casino-numeral flex items-center gap-1 rounded-full bg-black/40 px-1.5 text-[10px] text-amber-100">
                    <VelvetChipIcon size={12} /> {chipText(s.bet)}
                  </span>
                )}
                {showdown && s.hand && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${s.won ? "bg-amber-300 text-amber-950" : "bg-white/10"}`}>{s.hand}{s.won ? ` · +${chipText(s.won)}` : ""}</span>}
                {done && !replaying && !showdown && s.won > 0 && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-950">Takes the pot · +{chipText(s.won)}</span>}
              </div>
            );
          })}
          {!view || view.phase === "idle" ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-2xl bg-black/40 px-4 py-2 text-sm text-amber-50/80">{vip ? "Boris and the Baron await your buy-in." : "Boris shuffles. Buy in to be dealt a hand."}</span>
            </div>
          ) : null}
        </div>

        {/* the side panel: what happened, your hand, your move */}
        <div className="flex w-[19rem] min-w-0 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/30 p-2">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/80">The table</div>
            <div className="flex flex-col gap-0.5 text-[11px]">
              {visibleLog.slice(-11).map((e, k) => (
                <div key={k} className={e.seat < 0 ? "mt-0.5 font-bold uppercase tracking-widest text-amber-200/80" : ""}>
                  {e.seat >= 0 && <span className="opacity-60">{seats[e.seat]?.human ? "You" : seats[e.seat]?.name}: </span>}
                  {e.text}
                </div>
              ))}
              {!visibleLog.length && <div className="opacity-50">Blinds {chipText(sb)}/{chipText(bb)}. Every seat buys in for as much as you do.</div>}
            </div>
          </div>
          {view?.yourHand && playing && (
            <div className="rounded-2xl bg-black/30 px-3 py-1.5 text-center text-xs">
              Your hand: <b className="text-amber-100">{view.yourHand}</b>
            </div>
          )}
          {done && !replaying && view && (
            <div className={`rounded-2xl px-3 py-2 text-center text-sm font-extrabold ${view.net > 0 ? "bg-amber-300 text-amber-950" : "bg-black/35"}`}>
              {view.net > 0 ? (
                <>
                  You win <ChipAmount n={view.net} /> net{view.rake ? <span className="font-normal"> (rake {chipText(view.rake)})</span> : null}
                </>
              ) : view.net === 0 ? (
                "You break even."
              ) : you?.folded ? (
                <>You folded: {chipText(-view.net)} into the pot.</>
              ) : (
                <>The house takes this one: −{chipText(-view.net)}</>
              )}
            </div>
          )}
          {yourTurn && o ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-black/35 p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" disabled={sent} onClick={() => act({ action: "fold" })} className="clay-btn clay-btn-rose min-h-10 text-sm">
                  Fold
                </button>
                {o.canCheck ? (
                  <button type="button" disabled={sent} onClick={() => act({ action: "check" })} className="clay-btn clay-btn-mint min-h-10 text-sm">
                    Check
                  </button>
                ) : (
                  <button type="button" disabled={sent} onClick={() => act({ action: "call" })} className="clay-btn clay-btn-mint min-h-10 text-sm">
                    Call {chipText(o.toCall)}
                  </button>
                )}
              </div>
              {o.canRaise && o.maxRaiseTo > o.minRaiseTo && (
                <div className="flex flex-col gap-1">
                  <input type="range" min={0} max={1000} value={Math.round(pctFor(raiseTo) * 1000)} onChange={(e) => setRaiseTo(snap(o.minRaiseTo + ((o.maxRaiseTo - o.minRaiseTo) * Number(e.target.value)) / 1000))} className="w-full accent-amber-300" aria-label="Raise to" />
                  <div className="flex gap-1">
                    {[
                      ["Min", o.minRaiseTo],
                      ["½ Pot", pot / 2 + o.toCall + (view!.seats[view!.toAct]?.bet ?? 0)],
                      ["Pot", pot + o.toCall + (view!.seats[view!.toAct]?.bet ?? 0)],
                    ].map(([label, v]) => (
                      <button key={label as string} type="button" onClick={() => setRaiseTo(snap(v as number))} className="flex-1 rounded-full bg-white/10 px-1 py-0.5 text-[10px] font-bold hover:bg-white/20">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" disabled={sent || !o.canRaise || raiseTo >= o.maxRaiseTo} onClick={() => act({ action: "raise", to: raiseTo })} className="clay-btn clay-btn-amber min-h-10 text-sm">
                  {o.canCheck && view!.seats.every((q) => q.bet === 0) ? "Bet" : "Raise to"} {chipText(Math.min(raiseTo, o.maxRaiseTo))}
                </button>
                <button type="button" disabled={sent || o.maxRaiseTo <= 0} onClick={() => act({ action: "allin" })} className="clay-btn clay-btn-rose min-h-10 text-sm tracking-[0.12em]">
                  ALL IN {chipText(o.maxRaiseTo)}
                </button>
              </div>
            </div>
          ) : playing ? (
            <div className="rounded-2xl bg-black/30 px-3 py-3 text-center text-xs opacity-80">{replaying ? "The table plays on…" : "Waiting…"}</div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/35 p-2">
              <BetPicker limit={LIMIT} chips={chips} value={buyIn} onChange={setStake} label="Buy-in" />
              <button type="button" disabled={sent || replaying || chips < LIMIT.min} onClick={deal} className="clay-btn clay-btn-amber min-h-11 w-full text-base">
                {done ? "Deal Again" : "Deal Me In"} · <ChipAmount n={buyIn} />
              </button>
              <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
            </div>
          )}
          <details className="rounded-2xl bg-black/25 px-2 py-1 text-[10px]">
            <summary className="cursor-pointer font-bold uppercase tracking-[0.2em] text-amber-200/80">Hand rankings</summary>
            <div className="mt-1 grid grid-cols-2 gap-x-2">
              {[...HOLDEM_HANDS].reverse().map((h) => (
                <span key={h} className={view?.yourHand === h ? "font-black text-amber-200" : "opacity-75"}>
                  {h}
                </span>
              ))}
            </div>
          </details>
        </div>
      </div>
    </Modal>
  );
}
