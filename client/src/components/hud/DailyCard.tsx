import { useEffect, useState } from "react";
import { DAILY_BONUS, DAILY_COINS, DAILY_TASKS, msUntilNextDay, parseDaily } from "@shared/types";

// The day's three orders (shared/types.ts DAILY_TASKS), in the top-left column under the Newcomer's
// Guide: a chip with how many are met, opened by a tap into the list (each order's progress and what
// it pays, the three together a bonus, the time until the next day's draw). Folded until asked for.

function untilTomorrow() {
  const minutes = Math.floor(msUntilNextDay() / 60000);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${Math.max(1, minutes)}m`;
}

export function DailyCard({ daily }: { daily: string }) {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [open]);
  const list = parseDaily(daily);
  if (!list) return null;
  const met = list.tasks.filter((t) => t.progress >= DAILY_TASKS[t.id].goal).length;
  const all = met === list.tasks.length;
  if (!open) {
    return (
      <button type="button" className={`clay-pop pointer-events-auto flex items-center gap-1.5 self-start rounded-full border bg-[#231B18]/88 py-1 pl-2 pr-2.5 text-[11px] font-bold text-[#F7EBE1] shadow ${all ? "border-emerald-300/50" : "border-[#8fd3b6]/50"}`} onClick={() => setOpen(true)} aria-label={`Daily orders: ${met} of ${list.tasks.length} met. Open`}>
        <span aria-hidden>📋</span>
        <span className="tabular-nums text-[#8fd3b6]">
          {met}/{list.tasks.length}
        </span>
        <span>{all ? "Orders done" : "Daily orders"}</span>
      </button>
    );
  }
  return (
    <section className="clay-pop pointer-events-auto rounded-2xl border border-[#8fd3b6]/50 bg-[#231B18]/92 p-2.5 text-[#F7EBE1] shadow-lg" aria-label="Daily orders">
      <header className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#8fd3b6]">
          📋 Daily orders · {met}/{list.tasks.length}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-[#F7EBE1]/60">new in {untilTomorrow()}</span>
        <button type="button" className="-my-2 -mr-1.5 grid h-8 w-8 place-items-center rounded-full text-sm text-[#F7EBE1]/70 hover:text-[#F7EBE1]" onClick={() => setOpen(false)} aria-label="Fold the daily orders">
          ▾
        </button>
      </header>
      <ul className="mt-1.5 flex flex-col gap-1">
        {list.tasks.map((t) => {
          const task = DAILY_TASKS[t.id];
          const done = t.progress >= task.goal;
          return (
            <li key={t.id} className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11.5px] leading-snug ${done ? "bg-emerald-400/15" : "bg-white/5"}`}>
              <span aria-hidden>{task.emoji}</span>
              <span className={`min-w-0 flex-1 ${done ? "line-through opacity-60" : ""}`}>{task.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-[#F7EBE1]/80">{done ? "✓" : task.goal > 1 ? `${t.progress}/${task.goal}` : ""}</span>
              <span className={`shrink-0 font-bold tabular-nums ${done ? "opacity-50" : "text-[#f5c46b]"}`}>+{DAILY_COINS[task.slot]}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10.5px] text-[#F7EBE1]/65">{all ? "All three met today. Fresh orders tomorrow." : `Each pays as it is met. All three: +${DAILY_BONUS} 🪙 more.`}</p>
    </section>
  );
}
