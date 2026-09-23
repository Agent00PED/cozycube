import { useEffect, useState } from "react";
import { ACTIVITY_STATUSES, CHAT_MAX_CHARS, DAILY_REWARD, DAILY_TASKS, QUICK_CHATS, isActivityStatus, parseDaily, parseStats, type Gesture, type PlayerState } from "@shared/types";
import { lookAtTemporarily } from "../../scene/cameraFocus";
import { playClick, playPop } from "../../audio/sfx";

interface SideDrawerProps {
  players: Record<string, PlayerState>;
  localSessionId: string | null;
  speakingUserIds: ReadonlySet<string>;
  latency: number;
  onEmote: (emoji: string) => void;
  onGesture: (g: Gesture) => void;
  onSitNearest: () => void;
  onChat: (text: string) => void;
  onClose: () => void;
}

// The expressive wheel: six moods round a hub. Wave, cheer and dance are full-body gestures;
// sit walks you to the nearest free seat; sleep is the nap; heart floats a heart.
const WHEEL: { label: string; emoji: string; run: (p: SideDrawerProps) => void }[] = [
  { label: "Wave", emoji: "👋", run: (p) => p.onGesture("wave") },
  { label: "Cheer", emoji: "🥂", run: (p) => p.onGesture("cheers") },
  { label: "Dance", emoji: "💃", run: (p) => p.onGesture("dance") },
  { label: "Sit", emoji: "🪑", run: (p) => p.onSitNearest() },
  { label: "Sleep", emoji: "💤", run: (p) => p.onGesture("nap") },
  { label: "Heart", emoji: "❤️", run: (p) => p.onEmote("❤️") },
];

function statusIcon(p: PlayerState): string {
  if (isActivityStatus(p.status)) return ACTIVITY_STATUSES[p.status].emoji;
  if (p.action === "fish" || p.action === "afkfish") return "🎣";
  if (p.holding === "marshmallow") return "🍢";
  if (p.holding === "coffee") return "☕";
  if (p.sitting) return p.sitPose === "lie" ? "🌙" : "🪑";
  return "";
}

function pingTone(ms: number) {
  return ms <= 0 ? "opacity-40" : ms < 90 ? "text-emerald-300" : ms < 200 ? "text-amber-300" : "text-rose-300";
}

export function SideDrawer(props: SideDrawerProps) {
  const { players, localSessionId, speakingUserIds, latency, onChat, onClose } = props;
  const [text, setText] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = Object.values(players)
    .filter((p) => p.connected)
    .sort((a, b) => (a.sessionId === localSessionId ? -1 : b.sessionId === localSessionId ? 1 : a.username.localeCompare(b.username)));
  const me = localSessionId ? players[localSessionId] : null;
  const stats = parseStats(me?.stats);
  const daily = parseDaily(me?.daily);

  const send = (line: string) => {
    const t = line.trim().slice(0, CHAT_MAX_CHARS);
    if (!t) return;
    playPop();
    onChat(t);
    setText("");
  };

  return (
    <div className="fixed inset-0 z-50" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="clay-slide-right font-cozy absolute right-0 top-0 scrollbar-none flex h-full w-[min(340px,90vw)] flex-col gap-4 overflow-y-auto border-l border-white/10 bg-stone-900/85 p-4 pt-[max(16px,env(safe-area-inset-top))] text-stone-100 shadow-[-12px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-md" aria-label="Social">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-wide">💬 Social</h2>
          <button type="button" onClick={onClose} className="clay-icon-btn bg-white/10 hover:bg-white/20" aria-label="Close">
            ✕
          </button>
        </div>

        {/* the emote wheel */}
        <section className="shrink-0">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Express yourself</h3>
          <div className="relative mx-auto h-56 w-56">
            <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl">✨</div>
            {WHEEL.map((w, i) => {
              const a = (i / WHEEL.length) * Math.PI * 2 - Math.PI / 2;
              const r = 88;
              return (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => {
                    playClick();
                    w.run(props);
                    onClose();
                  }}
                  className="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-b from-pink-200/90 to-pink-300/80 text-pink-950 shadow-[0_6px_16px_rgba(236,127,163,0.4)] transition-transform hover:scale-110 active:scale-95"
                  style={{ left: `calc(50% + ${Math.cos(a) * r}px)`, top: `calc(50% + ${Math.sin(a) * r}px)` }}
                >
                  <span className="text-2xl leading-none">{w.emoji}</span>
                  <span className="text-[10px] font-extrabold">{w.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* quick chat */}
        <section className="shrink-0">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Say something</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={CHAT_MAX_CHARS}
              placeholder="Speech bubble…"
              className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm outline-none placeholder:text-stone-400 focus:border-amber-300/60"
            />
            <button type="submit" className="clay-btn clay-btn-amber px-4" aria-label="Send">
              ➤
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_CHATS.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} className="min-h-9 rounded-full bg-white/10 px-3 text-xs font-bold transition-transform hover:bg-white/15 active:scale-95">
                {q}
              </button>
            ))}
          </div>
        </section>

        {/* who's here */}
        <section className="shrink-0">
          <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-60">
            <span>Here now · {list.length}</span>
            <span className={pingTone(latency)}>{latency > 0 ? `${latency} ms` : ""}</span>
          </h3>
          <ul className="flex flex-col gap-1">
            {list.map((p) => {
              const speaking = p.speaking || speakingUserIds.has(p.userId);
              const isMe = p.sessionId === localSessionId;
              return (
                <li key={p.sessionId}>
                  <button type="button" onClick={() => (playClick(), lookAtTemporarily(p.x, p.z))} className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-white/5 px-3 text-left text-sm transition-transform hover:bg-white/10 active:scale-[0.98]" title={isMe ? "That's you" : `Look at ${p.username}`}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color, boxShadow: speaking ? "0 0 0 2px #fff, 0 0 0 4px #43d17a" : "0 0 0 2px rgba(255,255,255,0.35)" }} />
                    <span className="flex-1 truncate font-bold">
                      {p.username}
                      {isMe && <span className="font-normal opacity-60"> (you)</span>}
                    </span>
                    <span className="w-5 text-center">{speaking ? "🔊" : statusIcon(p)}</span>
                    <span className={`w-14 text-right text-xs tabular-nums ${pingTone(p.ping)}`}>{p.ping > 0 ? `${p.ping} ms` : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* today's cozy checklist */}
        {me && daily && (
          <section className="shrink-0 rounded-3xl border border-amber-200/20 bg-amber-300/10 p-3">
            <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-70">
              <span>Daily cozy checklist</span>
              <span>{daily.claimed ? "✅ claimed" : `${DAILY_REWARD} 🪙`}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {daily.tasks.map((t) => {
                const task = DAILY_TASKS[t.id];
                if (!task) return null;
                const done = t.progress >= task.goal;
                return (
                  <li key={t.id} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${done ? "bg-emerald-400/15" : "bg-white/5"}`}>
                    <span className="text-lg">{task.emoji}</span>
                    <span className={`flex-1 ${done ? "line-through opacity-70" : ""}`}>{task.label}</span>
                    <span className="text-xs font-extrabold tabular-nums opacity-80">{done ? "✓" : `${Math.min(t.progress, task.goal)}/${task.goal}`}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] opacity-60">Finish all three and the coins land by themselves. A fresh list every day.</p>
          </section>
        )}

        {/* your story so far */}
        {me && (
          <section className="shrink-0 rounded-3xl border border-white/10 bg-white/5 p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest opacity-60">Your story</h3>
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {[
                ["🐟", stats.fish_caught, "fish"],
                ["🍢", stats.marshmallows_roasted, "toasted"],
                ["🎰", stats.slots_spins, "spins"],
                ["🎡", stats.roulette_wins, "roulette"],
                ["🃏", stats.blackjack_wins, "blackjack"],
              ].map(([e, n, l]) => (
                <div key={String(l)} className="rounded-2xl bg-white/5 py-2">
                  <div className="text-lg">{e}</div>
                  <div className="font-extrabold">{n}</div>
                  <div className="opacity-60">{l}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
