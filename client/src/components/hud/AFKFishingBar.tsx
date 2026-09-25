import { useEffect, useState } from "react";
import type { FishCaught, PlayerState } from "@shared/types";
import { fishValue } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";

// AFK fishing, as a small frosted pill over the action dock: a bobbing rod with a sleepy blue Zzz,
// "Starlight fishing…" over a slim bar filling toward the next catch (the server's progress), what
// this session has brought in (fish, and what they are worth at Barnaby's plus any coins from
// letting fish go), and one warm button to get up.

export function AFKFishingBar({ player, localSessionId, subscribeMessages, onStandUp }: { player: PlayerState; localSessionId: string; subscribeMessages: (listener: RoomMessageListener) => () => void; onStandUp: () => void }) {
  const [session, setSession] = useState({ fish: 0, coins: 0, last: 0 });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "fishCaught") return;
        const c = payload as FishCaught;
        if (c.sessionId !== localSessionId || !c.afk) return;
        setSession((s) => ({ fish: s.fish + 1, coins: s.coins + (c.released ? c.coins : fishValue(c.fish) + c.coins), last: Date.now() }));
      }),
    [subscribeMessages, localSessionId]
  );
  const progress = Math.max(0, Math.min(1, player.actionProgress));
  return (
    <div className="cozy-afk-pill pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-black/40 px-5 py-2.5 text-white shadow-xl backdrop-blur-md" role="status" aria-label="AFK fishing">
      <span className="relative text-xl leading-none" aria-hidden>
        <span className="cozy-afk-rod inline-block">🎣</span>
        <span className="cozy-afk-zzz">z</span>
      </span>
      <div className="flex min-w-[120px] flex-col gap-1">
        <span className="text-[12px] font-semibold leading-none text-white/90">Starlight fishing…</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-sky-300/90 shadow-[0_0_8px_rgba(125,211,252,0.7)]" style={{ width: `${progress * 100}%`, transition: progress === 0 ? "none" : "width 1s linear" }} />
        </span>
      </div>
      <span key={session.last} className={`whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold tabular-nums ${session.last ? "cozy-coin-bump" : ""}`} title="This session: fish caught, and what they are worth at Barnaby's">
        {session.fish} 🐟 · +{session.coins} 🪙
      </span>
      <button type="button" className="clay-btn clay-btn-amber min-h-9 whitespace-nowrap px-3.5 text-[12px]" onClick={onStandUp}>
        ✕ Stand Up
      </button>
    </div>
  );
}
