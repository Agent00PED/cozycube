import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CASHIER_AMOUNTS, CHIP_CAP, VANCE_BROKE_LINE, type CashierResult } from "@shared/casino";
import { COIN_CAP } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { VelvetChipIcon } from "./VelvetChipIcon";

// Mr. Vance's cage, the Velvet Casino's Golden Cashier: coins into Velvet Chips and chips back into
// coins, one for one, no fee. Pick a way, build an amount (quick adds, "All", or the slider), see
// both purses as they will be, and exchange. The server has the last word (buyChips / cashOut, at
// the window, within both caps) and answers with cashierResult; Mr. Vance says how it went.

type Mode = "buy" | "cashout";

interface Props {
  coins: number;
  chips: number;
  onBuy: (amount: number | "all") => void;
  onCashOut: (amount: number | "all") => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

const HELLO = "Good evening. Coins for chips, chips for coins, one for one: the house takes nothing at this window.";
/** A reply that never comes (a dropped message) doesn't leave the button waiting forever. */
const PENDING_MS = 3000;

const fmt = (n: number) => n.toLocaleString("en-US");

export function CashierModal({ coins, chips, onBuy, onCashOut, subscribeMessages, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState(0);
  /** "All" follows the balance, so it stays all of it even as the purse changes. */
  const [all, setAll] = useState(false);
  const [pending, setPending] = useState(false);
  // an empty purse on both sides: Mr. Vance points the way to the Campfire
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: coins + chips <= 0 ? VANCE_BROKE_LINE : HELLO, ok: coins + chips > 0 });
  const pendingTimer = useRef(0);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "cashierResult") return;
        const r = payload as CashierResult;
        window.clearTimeout(pendingTimer.current);
        setPending(false);
        if (r.ok) {
          playSfx("coins");
          setAmount(0);
          setAll(false);
          setSay({ text: r.kind === "buy" ? `${fmt(r.amount)} Velvet Chips, as requested. Good fortune on the floor.` : `${fmt(r.amount)} coins, counted twice. Do come again.`, ok: true });
        } else {
          setSay({
            text:
              r.reason === "far"
                ? "Step up to the window, if you please: I can't reach you from there."
                : r.reason === "funds"
                  ? r.kind === "buy"
                    ? "I'm afraid there's nothing to exchange: no coins, or your chip purse is full."
                    : "I'm afraid there's nothing to cash in: no chips, or your coin purse is full."
                  : "I'm afraid I can't count that. A whole number, please.",
            ok: false,
          });
        }
      }),
    [subscribeMessages]
  );
  useEffect(() => () => window.clearTimeout(pendingTimer.current), []);

  // what can move this way: what the purse drawn on holds, and no more than the other has room for
  const buying = mode === "buy";
  const have = buying ? coins : chips;
  const room = buying ? CHIP_CAP - chips : COIN_CAP - coins;
  const max = Math.max(0, Math.min(have, room));
  const capped = room < have;
  const value = all ? max : Math.min(amount, max);
  const after = { coins: buying ? coins - value : coins + value, chips: buying ? chips + value : chips - value };

  const pickMode = (m: Mode) => {
    setMode(m);
    setAmount(0);
    setAll(false);
  };
  const add = (n: number) => {
    setAll(false);
    setAmount(Math.min(max, value + n));
  };
  const setExact = (n: number) => {
    setAll(false);
    setAmount(Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0))));
  };
  const exchange = () => {
    if (value <= 0 || pending) return;
    setPending(true);
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => setPending(false), PENDING_MS);
    const request = all ? "all" : value;
    if (buying) onBuy(request);
    else onCashOut(request);
  };

  return (
    <Modal title="The Golden Cage" icon="🏦" onClose={onClose} width={460} tone="velvet">
      <div className="flex flex-col gap-3 pb-2">
        {/* the cage window: Mr. Vance behind brass bars, a sunburst fan above him */}
        <div className="relative overflow-hidden rounded-t-[140px] rounded-b-2xl border-2 border-amber-300/70 p-1" style={deco.frame}>
          <div className="relative flex items-end gap-3 overflow-hidden rounded-t-[132px] rounded-b-xl px-4 pb-3 pt-10" style={deco.window}>
            <div className="pointer-events-none absolute inset-0" style={deco.bars} aria-hidden />
            <span className="relative text-5xl leading-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" aria-hidden>
              🦊
            </span>
            <div className={`clay-pop relative flex-1 rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/45" : "bg-rose-900/60"}`} key={say.text} role="status">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/80">Mr. Vance</div>
              {say.text}
            </div>
          </div>
        </div>

        {/* which way */}
        <div className="grid grid-cols-2 gap-1.5 rounded-full border border-amber-300/40 bg-black/30 p-1" role="tablist" aria-label="Exchange">
          {(
            [
              ["buy", <>Buy Chips <VelvetChipIcon /></>],
              ["cashout", "Cash Out 🪙"],
            ] as [Mode, ReactNode][]
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => pickMode(id)} className={`min-h-10 rounded-full text-sm font-extrabold tracking-wide transition-transform active:scale-95 ${mode === id ? "bg-gradient-to-b from-amber-200 to-amber-400 text-[#3b1a0e] shadow-[0_2px_10px_rgba(242,207,115,0.45)]" : "text-amber-100/80 hover:bg-white/10"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* the amount */}
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-300/30 bg-black/25 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/80">{buying ? "Coins to exchange" : "Chips to cash in"}</span>
            <span className="text-xs opacity-60">up to {fmt(max)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              {buying ? "🪙" : <VelvetChipIcon />}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={value}
              onChange={(e) => setExact(Number(e.target.value))}
              className="h-11 w-full min-w-0 rounded-xl border border-amber-300/40 bg-black/40 px-3 text-xl font-extrabold tabular-nums text-amber-100 outline-none focus:border-amber-300"
              aria-label={buying ? "Coins to exchange" : "Chips to cash in"}
            />
          </div>
          <input type="range" min={0} max={Math.max(1, max)} step={1} value={value} disabled={max === 0} onChange={(e) => setExact(Number(e.target.value))} className="w-full accent-amber-300 disabled:opacity-40" aria-label="Amount" />
          <div className="grid grid-cols-5 gap-1.5">
            {CASHIER_AMOUNTS.map((n) => (
              <button key={n} type="button" onClick={() => add(n)} disabled={value >= max} className="clay-btn clay-btn-ghost min-h-9 px-1 text-xs">
                +{n}
              </button>
            ))}
            <button type="button" onClick={() => setAll(true)} disabled={max === 0} aria-pressed={all} className={`clay-btn min-h-9 px-1 text-xs ${all ? "clay-btn-amber" : "clay-btn-ghost"}`}>
              All
            </button>
            <button type="button" onClick={() => setExact(0)} disabled={value === 0} className="clay-btn clay-btn-ghost min-h-9 px-1 text-xs">
              Clear
            </button>
          </div>
          {capped && <div className="text-xs text-amber-200/90">{buying ? `A chip purse holds at most ${fmt(CHIP_CAP)}.` : `A coin purse holds at most ${fmt(COIN_CAP)}.`} That's as much as fits.</div>}
        </div>

        {/* both purses, now and after */}
        <div className="grid grid-cols-2 gap-2">
          <Purse icon="🪙" label="Coins" now={coins} after={after.coins} />
          <Purse icon={<VelvetChipIcon />} label="Velvet Chips" now={chips} after={after.chips} />
        </div>

        <button type="button" onClick={exchange} disabled={value <= 0 || pending} className="clay-btn clay-btn-amber min-h-12 text-base">
          {pending ? (
            "Counting…"
          ) : value <= 0 ? (
            max === 0 ? (buying ? "No coins to exchange" : "No chips to cash in") : "Choose an amount"
          ) : buying ? (
            <>
              Buy {fmt(value)} <VelvetChipIcon />
            </>
          ) : (
            `Cash out ${fmt(value)} 🪙`
          )}
        </button>
        <div className="text-center text-[11px] tracking-wide opacity-60">
          1 🪙 = 1 <VelvetChipIcon /> · no fee either way · your chips are kept until you cash them in
        </div>
      </div>
    </Modal>
  );
}

function Purse({ icon, label, now, after }: { icon: ReactNode; label: string; now: number; after: number }) {
  const delta = after - now;
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-black/25 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
        {icon} {label}
      </div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm opacity-70">{fmt(now)}</span>
        <span className="text-xs opacity-50" aria-hidden>
          →
        </span>
        <span className={`text-lg font-extrabold ${delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-amber-100"}`}>{fmt(after)}</span>
      </div>
    </div>
  );
}

// The Art-Deco dressing: a gold-rimmed arch, a warm lamp-lit window with a sunburst fan, brass bars.
const deco: Record<"frame" | "window" | "bars", CSSProperties> = {
  frame: { background: "linear-gradient(180deg, #5a3a12, #2a1407)", boxShadow: "inset 0 0 0 1px rgba(242,207,115,0.35), 0 8px 24px rgba(0,0,0,0.45)" },
  window: {
    background:
      "repeating-conic-gradient(from 270deg at 50% 100%, rgba(242,207,115,0.16) 0deg 7.5deg, transparent 7.5deg 15deg), radial-gradient(ellipse at 50% 110%, #7a2a1c 0%, #3b1210 55%, #1c0808 100%)",
    boxShadow: "inset 0 0 0 1px rgba(242,207,115,0.5)",
  },
  bars: { background: "repeating-linear-gradient(90deg, transparent 0 26px, rgba(212,169,60,0.55) 26px 29px, transparent 29px 30px)", maskImage: "linear-gradient(180deg, #000 0%, #000 42%, transparent 62%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 42%, transparent 62%)" },
};
