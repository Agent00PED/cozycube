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
// only lets audio start from a tap). Dressed in Dark Cozy (a warm oak card, vanilla cream and
// oatmeal text, amber ember accents; Fredoka) over the Starlight Campfire at night, softly blurred
// (/images/lobby-campfire.jpg: the game's own renderer, captured). From Settings' "Switch lounge" it
// opens over the game (`current`): the lounge you are in counts you and is marked Current, and you
// only leave it once you pick another (or stay).

const BACKDROP = `/images/lobby-campfire.jpg?v=${ASSET_VERSION}`;

const REFRESH_MS = 5000;

interface Props {
  auth: DiscordAuthInfo;
  guildKey: string;
  onPick: (lounge: number) => void;
  /** The lounge you are in (switching from Settings): marked Current, not pickable. */
  current?: number | null;
  /** Switching from Settings: stay where you are. */
  onCancel?: () => void;
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

export function LobbyModal({ auth, guildKey, onPick, current = null, onCancel }: Props) {
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

  // (you are still in your lounge while you choose: it counts you, and Quick Join looks elsewhere)
  const shown = lounges.map((l) => (l.lounge === current ? { ...l, players: Math.max(1, l.players) } : l));
  const others = shown.filter((l) => l.lounge !== current);
  const quick = quickJoinLounge(others.length ? others : shown);
  const pingTone = ping === null ? "bg-stone-500" : ping < 120 ? "bg-emerald-400" : ping < 260 ? "bg-amber-400" : "bg-rose-400";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[#1C1614]" style={SAFE_AREA} role="presentation">
      {/* the Starlight Campfire at night, behind everything, softly out of focus */}
      <div className="absolute inset-[-12px] bg-cover bg-center" style={{ backgroundImage: `url(${BACKDROP})`, filter: "blur(3px)" }} aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(28,22,20,0.15),rgba(28,22,20,0.6))]" aria-hidden />

      <div role="dialog" aria-label="Choose a lounge" className="font-cozy clay-pop cozy-oak-sheet relative flex w-full max-w-[500px] flex-col gap-3 rounded-[20px] border border-[#4A3A30] p-5 text-[#C9BDB5]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F5A623]/20 text-2xl" aria-hidden>
            🛋️
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-bold leading-tight text-[#F7EBE1]">{current ? "Switch lounge" : "Choose your lounge"}</h2>
            <p className="m-0 text-[13px] text-[#C9BDB5]">Each lounge is its own cozy evening: its own fire, tables and friends.</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[#3A2C25] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#F7EBE1]" title="Round trip to the server">
            <span className={`h-2.5 w-2.5 rounded-full ${pingTone}`} />
            {ping === null ? "…" : `${ping} ms`}
          </span>
        </div>

        <button type="button" disabled={picked !== null || quick === current} onClick={() => pick(quick)} className="clay-btn clay-btn-amber min-h-12 w-full text-base">
          ⚡ Quick Join · {loungeName(quick)}
        </button>

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((l) => {
            const full = l.players >= l.capacity;
            const mine = picked === l.lounge;
            const here = l.lounge === current;
            return (
              <li key={l.lounge}>
                <button
                  type="button"
                  disabled={here || full || picked !== null}
                  onClick={() => pick(l.lounge)}
                  className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${here ? "border-[#F5A623]/60 bg-[#F5A623]/10" : mine ? "border-[#F5A623] bg-[#3A2C25]" : "border-[#3F3129] bg-[#231B18] hover:bg-[#2F241E]"} disabled:cursor-default ${here ? "" : "disabled:opacity-60"}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3A2C25] text-sm font-bold text-[#F8C977]" aria-hidden>
                    {String(l.lounge).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold text-[#F7EBE1]">{l.name}</b>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-2 w-28 overflow-hidden rounded-full bg-[#3A2C25]">
                        <span className="block h-full rounded-full bg-gradient-to-r from-[#7FD1A8] to-[#F5A623]" style={{ width: `${Math.min(100, (l.players / l.capacity) * 100)}%` }} />
                      </span>
                      <span className="text-xs tabular-nums text-[#C9BDB5]">
                        {l.players}/{l.capacity}
                      </span>
                      {full && !here && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">Full</span>}
                    </span>
                  </span>
                  {l.friends > 0 && (
                    <span className="shrink-0 rounded-full border border-[#F5A623]/40 bg-[#F5A623]/15 px-2.5 py-1 text-[11px] font-bold text-[#F8C977]">
                      👥 {l.friends} Friend{l.friends > 1 ? "s" : ""} Here
                    </span>
                  )}
                  {here ? (
                    <span className="shrink-0 rounded-full border border-[#F5C26B] bg-gradient-to-b from-[#F8D48A] to-[#E69A28] px-2.5 py-1 text-[12px] font-bold text-[#3A2206] shadow-[0_0_12px_rgba(245,166,35,0.35)]">[ 🟢 Current ]</span>
                  ) : (
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-bold ${mine ? "bg-[#F5A623] text-[#2B201B]" : "bg-[#3A2C25] text-[#F8C977]"}`}>{mine ? "Joining…" : "Join ›"}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {!heard && <p className="m-0 text-center text-xs text-[#9C8B80]">Asking the lounges how full they are…</p>}
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={picked !== null} className="min-h-12 rounded-full border border-[#4A3A30] bg-[#231B18] text-sm font-semibold text-[#F7EBE1] hover:bg-[#2F241E]">
            Stay in {current ? loungeName(current) : "this lounge"}
          </button>
        )}
      </div>
    </div>
  );
}
