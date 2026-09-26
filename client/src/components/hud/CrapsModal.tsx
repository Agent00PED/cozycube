import { useEffect, useRef, useState } from "react";
import { CRAPS_BETS, CRAPS_INFO, TABLE_LIMITS, limitPlacard, type CrapsBet, type CrapsStakes, type CrapsView } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount, VelvetChipIcon } from "./VelvetChipIcon";

// The craps table: your own dice. Pick a chip, tap the Pass Line, the Field or Any 7 to put it
// down (tap again to take it back), and roll. The server throws the dice (the "CRAPS_ROLL" packet,
// answered with crapsState, and the hall watches them tumble across the 3D felt); this tumbles them
// here too, shows the point's puck, and settles each bet as it lands. A pass line bet rides from the
// come-out until its point comes again (a win) or a seven (a loss).

interface Props {
  view: CrapsView | null;
  chips: number;
  coins: number;
  onRoll: (stakes: CrapsStakes) => void;
  onClose: () => void;
}

const LIMIT = TABLE_LIMITS.craps;
const NONE: CrapsStakes = { pass: 0, field: 0, any7: 0 };
/** Where each face's pips sit on a 3x3 grid. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const TUMBLE_MS = 950;

export function CrapsModal({ view, chips, coins, onRoll, onClose }: Props) {
  const [chip, setChip] = useState<number>(LIMIT.presets[0]);
  const [stakes, setStakes] = useState<CrapsStakes>(NONE);
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<CrapsView | null>(view);
  const point = shown?.point ?? 0;
  const riding = shown?.pass ?? 0;
  const newTotal = stakes.pass + stakes.field + stakes.any7;
  const left = chips - newTotal;
  const stake = clampStake(chip, LIMIT, Math.max(0, left) + 0);

  // a new roll: tumble the dice, then show where they landed and what they settled
  const lastRoll = useRef(view?.rollId ?? 0);
  useEffect(() => {
    if (!view) return;
    if (view.rollId === lastRoll.current) {
      setShown(view);
      return;
    }
    lastRoll.current = view.rollId;
    setRolling(true);
    playSfx("dice");
    const t = window.setTimeout(() => {
      setRolling(false);
      setShown(view);
      if (view.payout > 0) playSfx("coins");
    }, TUMBLE_MS);
    return () => window.clearTimeout(t);
  }, [view]);

  const tap = (bet: CrapsBet) => {
    if (rolling) return;
    if (bet === "pass" && point > 0) return;
    setStakes((s) => {
      if (s[bet] > 0) return { ...s, [bet]: 0 };
      const others = newTotal - s[bet];
      const n = Math.min(stake, chips - others);
      return n >= LIMIT.min ? { ...s, [bet]: n } : s;
    });
  };
  const roll = () => {
    if (rolling || (newTotal === 0 && riding === 0) || newTotal > chips) return;
    onRoll(stakes);
    setStakes(NONE);
  };

  const total = shown?.dice ? shown.dice[0] + shown.dice[1] : 0;
  const result = (bet: CrapsBet) => shown?.results.find((r) => r.bet === bet);

  return (
    <Modal title="Craps" icon="🎲" onClose={onClose} width={560} tone="felt" placard={`PER BET · ${limitPlacard(LIMIT)}`}>
      <div className="flex flex-col gap-3 pb-2">
        {/* the dice and the point's puck */}
        <div className="flex items-center justify-between gap-3 rounded-3xl bg-black/25 px-4 py-3">
          <div className="flex items-center gap-3">
            {(rolling ? [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] : shown?.dice ?? [5, 2]).map((n, i) => (
              <Die key={`${shown?.rollId ?? 0}-${rolling}-${i}`} n={n} tumbling={rolling} dim={!shown?.dice && !rolling} />
            ))}
            {!rolling && shown?.dice && <span className="text-2xl font-black text-amber-100">= {total}</span>}
          </div>
          <div className={`flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 font-black shadow-lg ${point ? "border-stone-900 bg-white text-stone-900" : "border-white/70 bg-stone-900 text-white/80"}`} title={point ? `The point is ${point}` : "No point: a come-out roll"}>
            <span className="text-[10px] leading-none">{point ? "ON" : "OFF"}</span>
            {point > 0 && <span className="text-lg leading-none">{point}</span>}
          </div>
        </div>

        {/* the three bets */}
        <div className="grid gap-2">
          {CRAPS_BETS.map((bet) => {
            const r = !rolling ? result(bet) : undefined;
            const locked = bet === "pass" && point > 0;
            const onIt = stakes[bet] + (bet === "pass" ? riding : 0);
            return (
              <button key={bet} type="button" disabled={rolling || (locked && riding === 0)} onClick={() => tap(bet)} className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2.5 text-left transition-transform active:scale-[0.98] disabled:opacity-60 ${stakes[bet] ? "border-amber-300 bg-emerald-700/60" : "border-emerald-300/30 bg-emerald-900/50 hover:bg-emerald-800/60"}`}>
                <span>
                  <span className="block font-cozy text-base font-extrabold tracking-wide text-amber-100">{CRAPS_INFO[bet].name}</span>
                  <span className="block text-[11px] opacity-70">{bet === "pass" ? (point ? `Riding on ${point}: it wins if ${point} comes before a 7` : "Come-out: 7 or 11 wins, 2, 3 or 12 loses, else a point") : CRAPS_INFO[bet].pays}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 text-sm font-extrabold">
                  {onIt > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-amber-100">
                      <VelvetChipIcon /> {onIt.toLocaleString("en-US")}
                      {bet === "pass" && riding > 0 && <span className="text-[10px] opacity-70">riding</span>}
                    </span>
                  )}
                  {r && (
                    <span className={r.returned === null ? "text-sky-200" : r.returned > 0 ? "text-emerald-300" : "text-rose-300"}>
                      {r.returned === null ? "rides on" : r.returned > 0 ? `won +${(r.returned - r.amount).toLocaleString("en-US")}` : "lost"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <BetPicker limit={LIMIT} chips={Math.max(0, left)} value={stake} onChange={setChip} disabled={rolling} label="Chip in hand" />
        <button type="button" disabled={rolling || (newTotal === 0 && riding === 0) || newTotal > chips} onClick={roll} className="clay-btn clay-btn-amber min-h-12 text-base">
          {rolling ? "Rolling…" : newTotal > 0 ? (
            <>
              Roll the dice · <ChipAmount n={newTotal} /> down
            </>
          ) : riding > 0 ? (
            "Roll for the point"
          ) : (
            "Tap a bet to put your chip down"
          )}
        </button>
        {shown && shown.payout > 0 && !rolling && (
          <div className="text-center text-sm font-extrabold text-emerald-200">
            That roll paid <ChipAmount n={shown.payout} />
          </div>
        )}
        <ShortOfChips limit={LIMIT} chips={chips} coins={coins} />
      </div>
    </Modal>
  );
}

function Die({ n, tumbling, dim }: { n: number; tumbling: boolean; dim: boolean }) {
  return (
    <div className={`grid h-12 w-12 grid-cols-3 grid-rows-3 gap-0.5 rounded-xl border border-rose-200/70 bg-gradient-to-br from-rose-50 to-rose-200 p-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.45)] ${tumbling ? "dice-tumble" : ""} ${dim ? "opacity-40" : ""}`}>
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} className={`m-auto h-2 w-2 rounded-full ${PIPS[n]?.includes(k) ? "bg-rose-900" : ""}`} />
      ))}
    </div>
  );
}
