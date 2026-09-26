import { useEffect, useRef, useState } from "react";
import { DERBY_RACERS, DERBY_RACE_MS, TABLE_LIMITS, derbyPaces, derbyProgress, limitPlacard, type DerbyState } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";

// The Mechanical Turf Club: four clockwork horses and one race for the whole hall. Pick a horse and
// a stake and buy a ticket (one per race); the first ticket opens a short window for everyone
// else's, then they're off. The server runs the race (the "DERBY_BET" packet; derbyState to all)
// and the track here runs the very same one as the table's 3D horses (shared derbyPaces): the
// winner's tickets are paid at the post.

interface Props {
  state: DerbyState | null;
  chips: number;
  coins: number;
  localSessionId: string;
  onBet: (horse: number, amount: number) => void;
  onClose: () => void;
}

const LIMIT = TABLE_LIMITS.derby;

export function DerbyModal({ state, chips, coins, localSessionId, onBet, onClose }: Props) {
  const [horse, setHorse] = useState(0);
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const bet = clampStake(stake, LIMIT, chips);
  const phase = state?.phase ?? "idle";
  const mine = state?.tickets.find((t) => t.sessionId === localSessionId);

  // the window's countdown, run here from the last word
  const [left, setLeft] = useState(state?.timeLeft ?? 0);
  useEffect(() => {
    setLeft(state?.timeLeft ?? 0);
    if (!state || state.phase === "idle") return;
    const started = performance.now();
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil(state.timeLeft - (performance.now() - started) / 1000))), 250);
    return () => window.clearInterval(t);
  }, [state]);

  // the race itself: the same paces as the 3D table's horses
  const [progress, setProgress] = useState<number[]>([0, 0, 0, 0]);
  const raceSeen = useRef(-1);
  useEffect(() => {
    if (!state || state.phase !== "racing" || raceSeen.current === state.raceId) return;
    raceSeen.current = state.raceId;
    const pace = derbyPaces(state.seed, state.winner);
    const start = performance.now() - (DERBY_RACE_MS / 1000 - state.timeLeft) * 1000;
    playSfx("bugle");
    let raf = 0;
    let lastGallop = 0;
    const frame = () => {
      const ms = performance.now() - start;
      setProgress(DERBY_RACERS.map((_, k) => derbyProgress(pace, k, ms)));
      if (ms - lastGallop > 520) {
        lastGallop = ms;
        playSfx("gallop", 0.5);
      }
      if (ms < DERBY_RACE_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state]);
  // back to the gate once the next window opens
  useEffect(() => {
    if (phase === "betting") setProgress([0, 0, 0, 0]);
  }, [phase]);
  // the payout, when it's yours
  const paidSeen = useRef(-1);
  const myPay = state?.phase === "idle" ? state.paid.find((p) => p.sessionId === localSessionId) : undefined;
  useEffect(() => {
    if (myPay && state && paidSeen.current !== state.raceId) {
      paidSeen.current = state.raceId;
      playSfx("jackpot");
    }
  }, [myPay, state]);

  const canBuy = phase !== "racing" && !mine && chips >= bet && chips >= LIMIT.min;

  return (
    <Modal title="The Mechanical Turf Club" icon="🏇" onClose={onClose} width={560} tone="felt" placard={limitPlacard(LIMIT)}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="text-center text-sm font-extrabold text-amber-200" role="status">
          {phase === "racing"
            ? "And they're off!"
            : phase === "betting"
              ? `Betting closes in ${left}s`
              : state && state.winner >= 0
                ? `Last race: ${DERBY_RACERS[state.winner].name} won`
                : "Buy the first ticket to start the next race"}
        </div>

        {/* the track: four lanes, the post on the right */}
        <div className="relative flex flex-col gap-1.5 rounded-2xl border-2 border-amber-300/50 bg-[repeating-linear-gradient(90deg,#1f6b3f_0,#1f6b3f_28px,#226f43_28px,#226f43_56px)] p-2 pr-8">
          <div className="pointer-events-none absolute bottom-1 right-6 top-1 w-1 bg-[repeating-linear-gradient(0deg,#fff_0,#fff_6px,#111_6px,#111_12px)]" aria-hidden />
          {DERBY_RACERS.map((r, k) => {
            const won = phase !== "racing" && state?.winner === k && state.phase === "idle";
            return (
              <div key={r.name} className="relative h-9 rounded-lg bg-black/20">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  #{k + 1} {r.name}
                </span>
                <span className="absolute top-1/2 -translate-y-1/2 text-2xl transition-[left] duration-100 ease-linear" style={{ left: `calc(${(progress[k] ?? 0) * 100}% - ${(progress[k] ?? 0) * 28}px)` }}>
                  <span className="inline-block -scale-x-100" style={{ filter: `drop-shadow(0 0 4px ${r.color})` }}>
                    🏇
                  </span>
                </span>
                {won && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-lg">🏆</span>}
              </div>
            );
          })}
        </div>

        {/* the tickets on this race */}
        {state && state.tickets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 text-[11px]">
            {state.tickets.map((t) => (
              <span key={t.sessionId} className={`rounded-full px-2 py-0.5 ${t.sessionId === localSessionId ? "bg-amber-300 text-amber-950" : "bg-white/10"}`}>
                {t.username}: #{t.horse + 1} · <ChipAmount n={t.amount} />
              </span>
            ))}
          </div>
        )}
        {myPay && (
          <div className="text-center text-sm font-extrabold text-emerald-200">
            Your ticket came in: +<ChipAmount n={myPay.amount} />
          </div>
        )}

        {/* the odds board: pick a horse */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DERBY_RACERS.map((r, k) => (
            <button key={r.name} type="button" disabled={phase === "racing" || !!mine} onClick={() => setHorse(k)} aria-pressed={horse === k} className={`flex flex-col items-center rounded-2xl border-2 px-2 py-2 transition-transform active:scale-95 disabled:opacity-60 ${horse === k ? "border-amber-300 bg-black/40" : "border-white/10 bg-black/20"}`}>
              <span className="h-2 w-8 rounded-full" style={{ background: r.color }} />
              <span className="mt-1 text-center text-xs font-extrabold leading-tight">
                #{k + 1} {r.name}
              </span>
              <span className="text-sm font-black text-amber-200">{r.pays} for 1</span>
            </button>
          ))}
        </div>

        {mine ? (
          <div className="text-center text-xs opacity-80">
            Your ticket: #{mine.horse + 1} {DERBY_RACERS[mine.horse].name} · <ChipAmount n={mine.amount} /> (pays <ChipAmount n={mine.amount * DERBY_RACERS[mine.horse].pays} />)
          </div>
        ) : (
          <>
            <BetPicker limit={LIMIT} chips={chips} value={bet} onChange={setStake} disabled={phase === "racing"} />
            <button type="button" disabled={!canBuy} onClick={() => onBet(horse, bet)} className="clay-btn clay-btn-amber min-h-12 text-base">
              {phase === "racing" ? (
                "Wait for the next race"
              ) : (
                <>
                  Ticket on #{horse + 1} {DERBY_RACERS[horse].name} · <ChipAmount n={bet} />
                </>
              )}
            </button>
          </>
        )}
        <div className="text-center text-[11px] opacity-60">A winning ticket returns its stake times the odds (&ldquo;2 for 1&rdquo; doubles it). One ticket per race.</div>
        <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
      </div>
    </Modal>
  );
}
