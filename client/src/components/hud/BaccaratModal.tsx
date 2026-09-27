import { useEffect, useRef, useState } from "react";
import { BACCARAT_BETS, BACCARAT_INFO, TABLE_LIMITS, baccaratTotal, limitPlacard, type BaccaratBet, type BaccaratState, type BaccaratTable, type Card } from "@shared/casino";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";
import { CardFace } from "./PlayingCard";
import { playSfx } from "../../audio/sfx";

// Punto Banco at either table: Scarlett's kidney-shaped one in the hall, or the Velvet Penthouse's.
// Back Player, Banker or the Tie from one of the table's stools. The first bet opens the betting
// window, the shoe deals both hands and the tableau decides any third card; the server settles
// (shared/casino.ts baccaratCoup), and upstairs Duchess Penelope has a wager of her own on every
// coup. Standing, you watch the coup from the rail.

interface Props {
  table: BaccaratTable;
  state: BaccaratState | null;
  localSessionId: string;
  seated: boolean;
  chips: number;
  coins: number;
  onBet: (bet: BaccaratBet, amount: number) => void;
  onTakeSeat: () => void;
  /** Some stool is open. */
  seatFree: boolean;
  onClose: () => void;
}

const TONE: Record<BaccaratBet, string> = {
  player: "from-[#2c5aa8] to-[#173766] border-sky-200/60",
  banker: "from-[#a8323f] to-[#661722] border-rose-200/60",
  tie: "from-[#2f8a5a] to-[#175236] border-emerald-200/60",
};
const BEAD: Record<BaccaratBet, string> = { player: "bg-sky-500", banker: "bg-rose-600", tie: "bg-emerald-500" };

/** How many of a hand's cards are shown yet: the coup comes out one card at a time. */
function useDealt(state: BaccaratState | null): { player: number; banker: number } {
  const [shown, setShown] = useState({ player: 0, banker: 0 });
  const round = state?.round ?? 0;
  const dealing = state && state.phase !== "betting" ? `${round}:${state.player.length}:${state.banker.length}` : "";
  useEffect(() => {
    if (!state || state.phase === "betting") {
      setShown({ player: 0, banker: 0 });
      return;
    }
    if (state.phase === "settled") {
      setShown({ player: state.player.length, banker: state.banker.length });
      return;
    }
    // Player, Banker, Player, Banker, then the thirds
    const order: ("player" | "banker")[] = ["player", "banker", "player", "banker"];
    if (state.player.length > 2) order.push("player");
    if (state.banker.length > 2) order.push("banker");
    const timers = order.map((side, i) =>
      window.setTimeout(() => {
        setShown((s) => ({ ...s, [side]: s[side] + 1 }));
        playSfx("card", 0.7);
      }, 350 + i * 650)
    );
    setShown({ player: 0, banker: 0 });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealing]);
  return shown;
}

export function BaccaratModal({ table, state: anyState, localSessionId, seated, chips, coins, onBet, onTakeSeat, seatFree, onClose }: Props) {
  // the other table's coup is not this one's
  const state = anyState && anyState.table === table ? anyState : null;
  const LIMIT = TABLE_LIMITS[table];
  const hall = table === "baccarat_hall";
  const [pick, setPick] = useState<BaccaratBet>("banker");
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const amount = clampStake(stake, LIMIT, chips);
  const shown = useDealt(state);
  const phase = state?.phase ?? "betting";
  const settled = phase === "settled";

  // the countdown between the server's words
  const [now, setNow] = useState(() => performance.now());
  const at = useRef({ key: "", t: performance.now() });
  const key = state ? `${state.round}:${state.phase}:${state.timeLeft}` : "";
  if (key !== at.current.key) at.current = { key, t: performance.now() };
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const left = state && state.timeLeft > 0 ? Math.max(0, Math.ceil(state.timeLeft - (now - at.current.t) / 1000)) : 0;

  const mine = state?.stakes.filter((s) => s.sessionId === localSessionId) ?? [];
  const won = settled ? (state?.paid.find((p) => p.sessionId === localSessionId)?.amount ?? 0) : 0;
  const chimed = useRef(-1);
  useEffect(() => {
    if (!settled || !state || chimed.current === state.round) return;
    chimed.current = state.round;
    if (won > 0) playSfx("coins");
  }, [settled, state, won]);

  const hand = (side: "player" | "banker") => {
    const cards: Card[] = (state?.[side] ?? []).slice(0, phase === "betting" ? 0 : shown[side]);
    const total = cards.length ? baccaratTotal(cards) : null;
    const wins = settled && state?.winner === side;
    return (
      <div className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border p-3 ${wins ? "border-amber-300 bg-amber-200/10 shadow-[0_0_18px_rgba(255,210,110,0.35)]" : "border-white/10 bg-black/25"}`}>
        <div className="casino-heading text-sm uppercase tracking-[0.25em]" style={{ color: side === "player" ? "#9cc8ff" : "#ffb0b8" }}>
          {side === "player" ? "Player" : "Banker"}
          {total !== null && <span className="ml-2 text-amber-100">{total}</span>}
        </div>
        <div className="flex min-h-[84px] flex-wrap items-center justify-center gap-1.5">
          {cards.map((c, i) => (
            <div key={`${state?.round}-${i}`} className={`card-deal ${i === 2 ? "rotate-90" : ""}`}>
              <CardFace card={c} />
            </div>
          ))}
          {!cards.length && <span className="text-xs opacity-40">—</span>}
        </div>
      </div>
    );
  };

  return (
    <Modal landscape title={hall ? "Baccarat · Scarlett's Table" : "Baccarat · The Penthouse"} icon="🂡" onClose={onClose} tone={hall ? "felt" : "velvet"} placard={limitPlacard(LIMIT)}>
      <div className="casino-body flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 flex-[1.2] flex-col gap-3">
          {/* the scoreboard: the last coups, newest on the right */}
          <div className="flex items-center gap-2 rounded-2xl bg-black/30 px-3 py-2">
            <span className="casino-heading text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Bead road</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {[...(state?.history ?? [])]
                .reverse()
                .slice(-24)
                .map((w, i) => (
                  <span key={i} className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-white ${BEAD[w]}`}>
                    {w === "player" ? "P" : w === "banker" ? "B" : "T"}
                  </span>
                ))}
            </div>
            <span className="rounded-full border border-amber-300/40 bg-black/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-100">
              {phase === "betting" ? (left ? `No more bets in ${left}s` : "Place your bets") : phase === "dealing" ? "Dealing…" : state?.winner === "tie" ? "Tie!" : `${state?.winner === "player" ? "Player" : "Banker"} wins`}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 gap-3 rounded-[2.5rem] border-[6px] border-[#4a2616] bg-[radial-gradient(ellipse_at_center,#237a4e,#123f29)] p-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
            {hand("player")}
            {hand("banker")}
          </div>
          {/* the table's wagers this coup */}
          <div className="flex min-h-[1.5rem] flex-wrap justify-center gap-1.5 text-[11px]">
            {(state?.stakes ?? []).map((s, i) => (
              <span key={i} className={`rounded-full px-2 py-0.5 ${s.sessionId === localSessionId ? "bg-amber-300/25 text-amber-100" : "bg-white/10"}`}>
                {s.username.startsWith("Duchess") ? "💎 " : ""}
                {s.username} · {BACCARAT_INFO[s.bet].name} <ChipAmount n={s.amount} />
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 w-[24rem] min-w-0 flex-col justify-center gap-3">
        {!seated ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/25 p-3 text-center text-sm">
            <span className="opacity-80">You're watching from the rail. Baccarat is played from a stool.</span>
            {seatFree ? (
              <button type="button" onClick={onTakeSeat} className="clay-btn clay-btn-amber px-6">
                🪑 Take a Seat
              </button>
            ) : (
              <span className="text-xs text-amber-200">Table is full — please wait or spectate</span>
            )}
          </div>
        ) : phase === "betting" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="grid w-full grid-cols-3 gap-2">
              {BACCARAT_BETS.map((b) => (
                <button key={b} type="button" onClick={() => setPick(b)} aria-pressed={pick === b} className={`flex flex-col items-center rounded-2xl border-2 bg-gradient-to-b px-2 py-3 text-white shadow-[0_3px_0_rgba(0,0,0,0.45)] transition-transform active:translate-y-0.5 ${TONE[b]} ${pick === b ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-black/40" : "opacity-80"}`}>
                  <span className="casino-heading text-sm tracking-[0.15em]">{BACCARAT_INFO[b].name}</span>
                  <span className="text-[11px] opacity-85">pays {BACCARAT_INFO[b].pays}</span>
                  {mine.find((s) => s.bet === b) && (
                    <span className="mt-0.5 rounded-full bg-black/40 px-1.5 text-[10px]">
                      <ChipAmount n={mine.find((s) => s.bet === b)!.amount} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <BetPicker limit={LIMIT} chips={chips} value={amount} onChange={setStake} />
            <button type="button" disabled={chips < amount || chips < LIMIT.min} onClick={() => onBet(pick, amount)} className="clay-btn clay-btn-amber min-h-12 w-full text-base">
              Bet {BACCARAT_INFO[pick].name} · <ChipAmount n={amount} />
            </button>
            <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
          </div>
        ) : (
          <div className="flex min-h-[6rem] items-center justify-center rounded-2xl bg-black/25 text-center text-sm">
            {settled && mine.length ? (
              won > 0 ? (
                <span className="rounded-full bg-amber-300 px-3 py-1 font-extrabold text-amber-950">
                  +<ChipAmount n={won} /> back
                </span>
              ) : (
                <span className="opacity-80">Not this coup. The shoe waits for the next bet.</span>
              )
            ) : (
              <span className="opacity-80">{mine.length ? "Your wager is on the felt." : "No bet on this coup."}</span>
            )}
          </div>
        )}
        <p className="text-center text-[11px] opacity-60">Player pays 1:1 · Banker 0.95:1 (5% to the house) · Tie 8:1, and a tie returns Player and Banker bets{hall ? " · Scarlett deals" : ""}</p>
        </div>
      </div>
    </Modal>
  );
}
