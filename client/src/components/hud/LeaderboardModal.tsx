import type { LeaderboardEntry, PlayerState } from "@shared/types";
import { netWorth } from "@shared/casino";
import { Modal } from "./Modal";

/** The High Rollers board: persisted top fortunes (PostgreSQL), and who is in the room now. A
 *  fortune is net worth: coins and Velvet Chips together. */
export function LeaderboardModal({ leaderboard, players, localName, onClose }: { leaderboard: LeaderboardEntry[]; players: Record<string, PlayerState>; localName: string; onClose: () => void }) {
  const here = Object.values(players)
    .filter((p) => p.connected)
    .sort((a, b) => netWorth(b.coins, b.chips) - netWorth(a.coins, a.chips));
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);
  return (
    <Modal title="High Rollers" icon="🏆" onClose={onClose} width={440} tone="velvet">
      <div className="flex flex-col gap-4 pb-2">
        <div className="rounded-3xl border-4 border-amber-300/60 bg-[#3a2016] p-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.3em] text-amber-200">All time</div>
          {leaderboard.length === 0 && <div className="py-4 text-center text-sm opacity-60">No fortunes yet. Go win some coins!</div>}
          <ol className="flex flex-col gap-1">
            {leaderboard.map((e, i) => (
              <li key={`${e.username}-${i}`} className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm ${e.username === localName ? "bg-amber-300/20" : "bg-white/5"}`}>
                <span className="w-7 text-center font-black">{medal(i)}</span>
                <span className="flex-1 truncate font-bold">{e.username}</span>
                <span className="font-extrabold tabular-nums text-amber-200" title={`${e.coins} coins + ${e.chips} chips`}>🪙 {e.worth}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-widest opacity-60">In the room now</div>
          <ul className="flex flex-col gap-1">
            {here.map((p, i) => (
              <li key={p.sessionId} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm">
                <span className="w-7 text-center">{medal(i)}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 truncate font-bold">{p.username}</span>
                <span className="tabular-nums" title={`${p.coins} coins + ${p.chips} chips`}>🪙 {netWorth(p.coins, p.chips)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
