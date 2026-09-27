import { useCallback, useEffect, useRef, useState } from "react";
import { LOUNGE_CAPACITY, LOUNGE_COUNT, loungeName, type LoungeInfo, type LoungesRequest } from "@shared/types";
import type { DiscordAuthInfo } from "../hooks/useDiscordAuth";
import { unlockAudio } from "../audio/master";
import { sharedAudio } from "../audio/sfx";
import { SAFE_AREA } from "./hud/Modal";

// The lounge selector, between the splash and the world: the guild's three lounges (each its own
// persistent instance of the whole game: shared/types LOUNGE_COUNT), how full each is out of
// LOUNGE_CAPACITY, the round trip to the server, and a gold "👥 X Friends Here" on the lounges
// where people from this voice channel already are (Discord's instance participants, matched by id
// on the server: nobody's ids come back). Quick Join picks the friends' lounge, else the busiest
// one with room, else the first. The tap that picks a lounge also wakes the page's sound (a phone
// only lets audio start from a tap).

const REFRESH_MS = 5000;

interface Props {
  auth: DiscordAuthInfo;
  guildKey: string;
  onPick: (lounge: number) => void;
}

/** The Discord ids of the others in this Activity's voice channel (none outside Discord). */
async function voiceFriends(auth: DiscordAuthInfo): Promise<string[]> {
  if (!auth.embedded) return [];
  try {
    const { participants } = await auth.sdk.commands.getInstanceConnectedParticipants();
    return participants.map((p) => p.id).filter((id) => id !== auth.userId);
  } catch {
    return [];
  }
}

const EMPTY: LoungeInfo[] = Array.from({ length: LOUNGE_COUNT }, (_, i) => ({ lounge: i + 1, name: loungeName(i + 1), players: 0, capacity: LOUNGE_CAPACITY, friends: 0 }));

/** The lounge Quick Join takes you to. */
export function quickJoinLounge(lounges: LoungeInfo[]): number {
  const open = lounges.filter((l) => l.players < l.capacity);
  if (!open.length) return 1;
  const friends = [...open].sort((a, b) => b.friends - a.friends || b.players - a.players)[0];
  if (friends.friends > 0) return friends.lounge;
  return [...open].sort((a, b) => b.players - a.players || a.lounge - b.lounge)[0].lounge;
}

export function LobbyModal({ auth, guildKey, onPick }: Props) {
  const [lounges, setLounges] = useState<LoungeInfo[]>(EMPTY);
  const [ping, setPing] = useState<number | null>(null);
  const [heard, setHeard] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const friends = useRef<string[]>([]);

  const refresh = useCallback(async () => {
    const t0 = performance.now();
    try {
      const body: LoungesRequest = { guildKey, friends: friends.current };
      const res = await fetch("/api/lounges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { lounges: LoungeInfo[] };
      setPing(Math.round(performance.now() - t0));
      setLounges(data.lounges);
      setHeard(true);
    } catch {
      setPing(null);
    }
  }, [guildKey]);

  useEffect(() => {
    let alive = true;
    void voiceFriends(auth).then((ids) => {
      if (!alive) return;
      friends.current = ids;
      void refresh();
    });
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [auth, refresh]);

  const pick = (lounge: number) => {
    if (picked !== null) return;
    // this tap is the one a phone needs before it lets the game make any sound
    unlockAudio(sharedAudio());
    setPicked(lounge);
    onPick(lounge);
  };

  const quick = quickJoinLounge(lounges);
  const pingTone = ping === null ? "bg-stone-400" : ping < 120 ? "bg-emerald-400" : ping < 260 ? "bg-amber-300" : "bg-rose-400";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1a0a10]/55 backdrop-blur-[2px]" style={SAFE_AREA} role="presentation">
      <div role="dialog" aria-label="Choose a lounge" className="casino-body clay-pop flex w-full max-w-[520px] flex-col gap-3 rounded-3xl border border-amber-200/25 bg-[#2a1017]/95 p-5 text-stone-100 shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🛋️
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="casino-title m-0">
              <span className="gold-foil">Choose your lounge</span>
            </h2>
            <p className="m-0 text-xs opacity-70">Each lounge is its own evening: its own fire, tables and company.</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold tabular-nums" title="Round trip to the server">
            <span className={`h-2.5 w-2.5 rounded-full ${pingTone}`} />
            {ping === null ? "…" : `${ping} ms`}
          </span>
        </div>

        <button type="button" disabled={picked !== null} onClick={() => pick(quick)} className="clay-btn clay-btn-amber min-h-12 w-full text-base">
          ⚡ Quick Join · {loungeName(quick)}
        </button>

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lounges.map((l) => {
            const full = l.players >= l.capacity;
            return (
              <li key={l.lounge}>
                <button
                  type="button"
                  disabled={full || picked !== null}
                  onClick={() => pick(l.lounge)}
                  className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors ${picked === l.lounge ? "bg-amber-300/25 ring-1 ring-amber-300/60" : "bg-white/5 hover:bg-white/10"} disabled:opacity-60`}
                >
                  <span className="min-w-0 flex-1">
                    <b className="casino-heading block text-[15px] tracking-[0.08em]">{l.name}</b>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-black/40">
                        <span className="block h-full rounded-full bg-gradient-to-r from-emerald-300 to-amber-300" style={{ width: `${Math.min(100, (l.players / l.capacity) * 100)}%` }} />
                      </span>
                      <span className="text-xs tabular-nums opacity-80">
                        {l.players}/{l.capacity}
                      </span>
                      {full && <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Full</span>}
                    </span>
                  </span>
                  {l.friends > 0 && (
                    <span className="shrink-0 rounded-full border border-amber-300/60 bg-gradient-to-b from-amber-300/40 to-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-100 shadow-[0_0_12px_rgba(252,211,77,0.35)]">
                      👥 {l.friends} Friend{l.friends > 1 ? "s" : ""} Here
                    </span>
                  )}
                  <span className="shrink-0 text-sm font-bold text-amber-200">{picked === l.lounge ? "Joining…" : "Join ›"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!heard && <p className="m-0 text-center text-xs opacity-60">Asking the lounges how full they are…</p>}
      </div>
    </div>
  );
}
