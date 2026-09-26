import { VANCE_BROKE_LINE, allInBet, type TableLimit } from "@shared/casino";
import { ChipAmount, VelvetChipIcon } from "./VelvetChipIcon";

// Every casino table's stake picker: the table's preset stakes as clay chips, and [ ALL IN ]
// (everything you hold, up to the table's cap: min(chips, max)). A preset you can't cover, or over
// the cap, is greyed out; below the table minimum nothing can be staked, and the picker says where
// to get chips (Mr. Vance's cage, or the Campfire when the purse is empty too).

interface Props {
  limit: TableLimit;
  chips: number;
  value: number;
  onChange: (stake: number) => void;
  /** The share of the chips one stake may take (poker's ante keeps half back for the Play bet). */
  share?: number;
  disabled?: boolean;
  /** Shown before the chosen stake ("Ante", "Stake"). */
  label?: string;
}

/** A preset stake's chip colour, by size. */
export function chipTone(n: number): string {
  if (n >= 1000) return "from-[#2b2b33] to-[#0d0d12] text-amber-200 border-amber-300/80";
  if (n >= 500) return "from-[#8f55d6] to-[#5a2b95] text-white border-white/70";
  if (n >= 100) return "from-[#3a3a44] to-[#15151b] text-amber-100 border-white/70";
  if (n >= 50) return "from-[#4b8ef0] to-[#1f59b8] text-white border-white/70";
  if (n >= 25) return "from-[#34b67a] to-[#177248] text-white border-white/70";
  if (n >= 10) return "from-[#4e7fd0] to-[#27508f] text-white border-white/70";
  return "from-[#e25454] to-[#a72525] text-white border-white/70";
}

const short = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

export function BetPicker({ limit, chips, value, onChange, share = 1, disabled = false, label = "Stake" }: Props) {
  const allIn = allInBet(chips, limit, share);
  const afford = Math.floor(chips * share);
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {limit.presets.map((n) => {
          const off = disabled || n > afford || n > limit.max;
          return (
            <button key={n} type="button" disabled={off} onClick={() => onChange(n)} aria-pressed={value === n} className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed bg-gradient-to-b text-[11px] font-black shadow-[0_3px_0_rgba(0,0,0,0.45)] transition-transform active:translate-y-0.5 disabled:opacity-30 ${chipTone(n)} ${value === n ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-black/40 -translate-y-0.5" : ""}`}>
              {short(n)}
            </button>
          );
        })}
        <button type="button" disabled={disabled || allIn === 0} onClick={() => onChange(allIn)} aria-pressed={allIn > 0 && value === allIn} className={`clay-btn min-h-11 px-3 text-xs font-black tracking-[0.15em] ${allIn > 0 && value === allIn ? "clay-btn-rose" : "clay-btn-amber"}`} title={`Everything you hold, up to the table's cap of ${limit.max.toLocaleString("en-US")}`}>
          [ ALL IN ]
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-70">{label}:</span>
        <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-sm font-extrabold text-amber-100">
          <ChipAmount n={value} />
        </span>
        <span className="opacity-60">
          · yours: <ChipAmount n={chips} />
        </span>
      </div>
    </div>
  );
}

/** Below the table minimum: where to get chips. */
export function ShortOfChips({ limit, chips, coins, share = 1 }: { limit: TableLimit; chips: number; coins: number; share?: number }) {
  if (Math.floor(chips * share) >= limit.min) return null;
  return (
    <div className="rounded-2xl bg-rose-950/50 px-3 py-2 text-center text-xs text-rose-100">
      {chips + coins <= 0 ? (
        <>
          <b>Mr. Vance:</b> “{VANCE_BROKE_LINE}”
        </>
      ) : (
        <>
          This table's minimum is <VelvetChipIcon /> {limit.min.toLocaleString("en-US")}
          {share < 1 ? ` (and as much again to play)` : ""}. Mr. Vance changes coins for chips at the cage by the doors.
        </>
      )}
    </div>
  );
}

/** Keeps a chosen stake inside what the table and the purse allow (the purse changes under it). */
export function clampStake(value: number, limit: TableLimit, chips: number, share = 1): number {
  const afford = Math.min(limit.max, Math.floor(chips * share));
  if (afford < limit.min) return limit.min;
  return Math.max(limit.min, Math.min(value, afford));
}
