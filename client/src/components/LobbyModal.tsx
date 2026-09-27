import { useCallback, useEffect, useRef, useState } from "react";
import { LOUNGE_CAPACITY, LOUNGE_COUNT, loungeName, type LoungeInfo, type LoungesRequest } from "@shared/types";
import type { DiscordAuthInfo } from "../hooks/useDiscordAuth";
import { unlockAudio } from "../audio/master";
import { sharedAudio } from "../audio/sfx";
import { SAFE_AREA } from "./hud/Modal";
import { ASSET_VERSION } from "../assetVersion";

// The lounge selector, between the splash and the world: the guild's three lounges (each its own
// persistent instance of the whole game: shared/types LOUNGE_COUNT), how full each is out of
// LOUNGE_CAPACITY, the round trip to the server, and a gold "👥 X Friends Here" on the lounges
// where people from this voice channel already are (Discord's instance participants, matched by id
// on the server: nobody's ids come back). Quick Join picks the friends' lounge, else the busiest
// one with room, else the first. The tap that picks a lounge also wakes the page's sound (a phone
// only lets audio start from a tap). Dressed in CozyCube's own warm paper (cream, Fredoka, pastel
// pills) over the Starlight Campfire at night, softly blurred (/images/lobby-campfire.jpg: the
// game's own renderer, captured).

const BACKDROP = `/images/lobby-campfire.jpg?v=${ASSET_VERSION}`;

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
  const pingTone = ping === null ? "bg-stone-300" : ping < 120 ? "bg-emerald-400" : ping < 260 ? "bg-amber-400" : "bg-rose-400";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[#140b10]" style={SAFE_AREA} role="presentation">
      {/* the Starlight Campfire at night, behind everything, softly out of focus */}
      <div className="absolute inset-[-12px] bg-cover bg-center" style={{ backgroundImage: `url(${BACKDROP})`, filter: "blur(3px)" }} aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,11,16,0.05),rgba(20,11,16,0.45))]" aria-hidden />

      <div role="dialog" aria-label="Choose a lounge" className="font-cozy clay-pop relative flex w-full max-w-[500px] flex-col gap-3 rounded-[20px] border border-[#EDE3D2] bg-[#FDFBF7] p-5 text-[#4A3728] shadow-[0_24px_60px_rgba(20,11,16,0.55),inset_0_1px_0_#fff]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FFE7CF] text-2xl shadow-[inset_0_-2px_0_rgba(138,75,28,0.12)]" aria-hidden>
            🛋️
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-bold leading-tight text-[#4A3728]">Choose your lounge</h2>
            <p className="m-0 text-[13px] text-[#4A3728]/65">Each lounge is its own cozy evening: its own fire, tables and friends.</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[#F3EBDD] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#6B4F3A]" title="Round trip to the server">
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
            const mine = picked === l.lounge;
            return (
              <li key={l.lounge}>
                <button
                  type="button"
                  disabled={full || picked !== null}
                  onClick={() => pick(l.lounge)}
                  className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${mine ? "border-[#F4A15C] bg-[#FFF1E2]" : "border-[#EFE4D2] bg-white hover:bg-[#FFF8EE]"} disabled:opacity-60`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-sm font-bold text-[#3E6E9E]" aria-hidden>
                    {String(l.lounge).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold text-[#4A3728]">{l.name}</b>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-2 w-28 overflow-hidden rounded-full bg-[#EFE6D6]">
                        <span className="block h-full rounded-full bg-gradient-to-r from-[#9BE3C3] to-[#FFC9A0]" style={{ width: `${Math.min(100, (l.players / l.capacity) * 100)}%` }} />
                      </span>
                      <span className="text-xs tabular-nums text-[#4A3728]/70">
                        {l.players}/{l.capacity}
                      </span>
                      {full && <span className="rounded-full bg-[#FFE1E1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B4454A]">Full</span>}
                    </span>
                  </span>
                  {l.friends > 0 && (
                    <span className="shrink-0 rounded-full border border-[#F5D98E] bg-[#FFF3C9] px-2.5 py-1 text-[11px] font-bold text-[#8A6412]">
                      👥 {l.friends} Friend{l.friends > 1 ? "s" : ""} Here
                    </span>
                  )}
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-bold ${mine ? "bg-[#F4A15C] text-white" : "bg-[#FFE7CF] text-[#8A4B1C]"}`}>{mine ? "Joining…" : "Join ›"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!heard && <p className="m-0 text-center text-xs text-[#4A3728]/55">Asking the lounges how full they are…</p>}
      </div>
    </div>
  );
}
