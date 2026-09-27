import { useEffect, useMemo, useRef, useState } from "react";
import { CRICKET_TARGETS, DARTS_GAME_NAME, DARTS_ORDER, DARTS_PER_TURN, DARTS_RINGS, cricketMark, dartAt, dartsThrow, startDarts, type DartHit, type DartsGame, type DartsMatch } from "@shared/darts";
import type { CasinoPacket } from "@shared/casino";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Velvet Lounge's English pub darts board, on the wall behind the pool table: 501 (down to
// exactly nothing, out on a double) or Cricket (close the 15s to the 20s and the bull), solo on your
// own or a match against whoever steps up to the oche next (the room keeps the match: "DARTS_JOIN",
// "DARTS_THROW", answered with "dartsState"). Throwing is timing: the reticle sways round where you
// aim, its circle breathing wide and tight; loose the dart as it tightens and it flies true, while
// it's wide it wanders (shared/darts.ts scores where it lands).

interface Props {
  match: DartsMatch | null;
  localSessionId: string;
  send: (packet: CasinoPacket) => void;
  onClose: () => void;
}

const R = DARTS_RINGS;
/** The reticle's breath: how wide its circle is at time t (seconds), 0.05 to 0.3 of the board. */
const wobble = (t: number) => 0.05 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 1.8), 1.6);
/** Where the sway puts the dart, round the aim, at time t. */
const sway = (t: number, r: number) => ({ x: r * Math.cos(t * 3.1), y: r * Math.sin(t * 4.3 + 0.7) });
const gauss = () => {
  const u = Math.random() || 1e-6;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

function Board({ darts, fading, aim, reticle, onAim, onThrow }: { darts: DartHit[]; fading: DartHit[]; aim: { x: number; y: number } | null; reticle: { x: number; y: number; r: number } | null; onAim: (p: { x: number; y: number } | null) => void; onThrow: (p: { x: number; y: number }) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const toBoard = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const s = Math.min(box.width, box.height);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    return { x: ((e.clientX - cx) / s) * 2.7, y: (-(e.clientY - cy) / s) * 2.7 };
  };
  const wedge = (r0: number, r1: number, i: number) => {
    const c = ((90 - i * 18) * Math.PI) / 180;
    const a0 = c - (9 * Math.PI) / 180;
    const a1 = c + (9 * Math.PI) / 180;
    const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(4)} ${(-r * Math.sin(a)).toFixed(4)}`;
    return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 1 ${p(r0, a0)} Z`;
  };
  return (
    <svg
      ref={ref}
      viewBox="-1.35 -1.35 2.7 2.7"
      className="h-full max-h-full w-auto cursor-crosshair touch-none select-none"
      onPointerMove={(e) => onAim(toBoard(e))}
      onPointerLeave={() => onAim(null)}
      onPointerDown={(e) => {
        const p = toBoard(e);
        if (p) {
          onAim(p);
          onThrow(p);
        }
      }}
    >
      <circle r={1.34} fill="#3a2016" />
      <circle r={1.28} fill="#141214" />
      {DARTS_ORDER.map((n, i) => {
        const dark = i % 2 === 0;
        const c = ((90 - i * 18) * Math.PI) / 180;
        return (
          <g key={n}>
            <path d={wedge(R.outerBull, R.trebleIn, i)} fill={dark ? "#151214" : "#e8dcbc"} />
            <path d={wedge(R.trebleIn, R.trebleOut, i)} fill={dark ? "#b5262f" : "#1d7a46"} />
            <path d={wedge(R.trebleOut, R.doubleIn, i)} fill={dark ? "#151214" : "#e8dcbc"} />
            <path d={wedge(R.doubleIn, R.doubleOut, i)} fill={dark ? "#b5262f" : "#1d7a46"} />
            <text x={1.15 * Math.cos(c)} y={-1.15 * Math.sin(c)} textAnchor="middle" dominantBaseline="central" fontSize={0.13} fontWeight={800} fill="#f2e8d5" style={{ fontFamily: "Outfit, sans-serif", letterSpacing: 0 }}>
              {n}
            </text>
          </g>
        );
      })}
      <circle r={R.outerBull} fill="#1d7a46" />
      <circle r={R.bull} fill="#b5262f" />
      <circle r={1} fill="none" stroke="#c9c4ba" strokeWidth={0.008} />
      {fading.map((d, i) => (
        <g key={`f${i}`} transform={`translate(${d.x} ${-d.y})`} opacity={0.35}>
          <circle r={0.022} fill="#d4a548" />
        </g>
      ))}
      {darts.map((d, i) => (
        <g key={`d${i}`} transform={`translate(${d.x} ${-d.y})`} className="dart-land">
          <line x1={0} y1={0} x2={0.09} y2={-0.13} stroke="#d4a548" strokeWidth={0.02} strokeLinecap="round" />
          <path d="M 0.08 -0.12 L 0.16 -0.2 L 0.12 -0.1 Z" fill="#b3202e" />
          <circle r={0.02} fill="#f6dc8f" />
        </g>
      ))}
      {aim && reticle && (
        <g pointerEvents="none">
          <circle cx={aim.x} cy={-aim.y} r={reticle.r} fill="rgba(255,240,200,0.06)" stroke="rgba(255,236,190,0.55)" strokeWidth={0.008} strokeDasharray="0.03 0.02" />
          <g transform={`translate(${reticle.x} ${-reticle.y})`}>
            <circle r={0.045} fill="none" stroke={reticle.r < 0.1 ? "#7dff9a" : "#ffd98a"} strokeWidth={0.012} />
            <line x1={-0.07} x2={-0.025} stroke="#ffd98a" strokeWidth={0.01} />
            <line x1={0.025} x2={0.07} stroke="#ffd98a" strokeWidth={0.01} />
            <line y1={-0.07} y2={-0.025} stroke="#ffd98a" strokeWidth={0.01} />
            <line y1={0.025} y2={0.07} stroke="#ffd98a" strokeWidth={0.01} />
          </g>
        </g>
      )}
    </svg>
  );
}

export function DartsModal({ match, localSessionId, send, onClose }: Props) {
  // solo practice is this panel's own; a match is the room's
  const [solo, setSolo] = useState<DartsMatch | null>(null);
  const inMatch = !!match && match.players.some((p) => p.sessionId === localSessionId) && match.phase !== "waiting";
  const waiting = !!match && match.phase === "waiting" && match.players.some((p) => p.sessionId === localSessionId);
  const game: DartsMatch | null = solo ?? (inMatch ? match : null);
  const myTurn = !!game && game.phase === "playing" && (solo ? true : game.players[game.turn]?.sessionId === localSessionId);

  // the reticle, breathing
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      setT((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = wobble(t);
  const off = sway(t, r * 0.8);
  const reticle = aim ? { x: aim.x + off.x, y: aim.y + off.y, r } : null;

  // a throw: where it lands (the sway, and a scatter as wide as the breath), then the board scores it
  const [flash, setFlash] = useState<{ id: number; hit: DartHit } | null>(null);
  const cooldown = useRef(0);
  const throwAt = (p: { x: number; y: number }) => {
    if (!game || !myTurn || performance.now() < cooldown.current) return;
    cooldown.current = performance.now() + 450;
    const now = wobble(t);
    const o = sway(t, now * 0.8);
    const spread = 0.012 + now * 0.18;
    const x = p.x + o.x + gauss() * spread;
    const y = p.y + o.y + gauss() * spread;
    const hit = dartAt(x, y);
    window.setTimeout(() => playSfx("dart", 0.9), 120);
    setFlash({ id: Date.now(), hit });
    if (solo) setSolo(dartsThrow(solo, hit));
    else send({ type: "DARTS_THROW", x, y });
  };
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 1100);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // the room's throws land for everyone (the other player's too)
  const lastThrow = useRef(-1);
  useEffect(() => {
    if (!match || solo) return;
    if (lastThrow.current >= 0 && match.throwId > lastThrow.current) {
      const theirs = match.thrown.length ? match.thrown[match.thrown.length - 1] : match.lastTurn?.hits[match.lastTurn.hits.length - 1];
      const byMe = match.lastTurn && match.thrown.length === 0 ? match.players[match.lastTurn.player]?.sessionId === localSessionId : match.players[match.turn]?.sessionId === localSessionId;
      if (theirs && !byMe) {
        playSfx("dart", 0.7);
        setFlash({ id: Date.now(), hit: theirs });
      }
    }
    lastThrow.current = match.throwId;
  }, [match, solo, localSessionId]);
  const won = game?.phase === "over";
  useEffect(() => {
    if (won) playSfx(game?.winner === localSessionId || solo ? "jackpot" : "clack");
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBoard = game ? (game.thrown.length ? game.thrown : game.lastTurn?.hits ?? []) : [];
  const fading = game && game.thrown.length && game.lastTurn ? game.lastTurn.hits : [];
  const startSolo = (g: DartsGame) => {
    if (inMatch || waiting) send({ type: "DARTS_LEAVE" });
    setSolo(startDarts(g, [{ sessionId: localSessionId, username: "You" }]));
  };
  const joinMatch = (g: DartsGame) => {
    setSolo(null);
    send({ type: "DARTS_JOIN", game: g });
  };
  const leave = () => {
    if (solo) setSolo(null);
    else send({ type: "DARTS_LEAVE" });
  };
  const open = match && match.phase === "waiting" && match.players.length === 1 && match.players[0].sessionId !== localSessionId ? match : null;
  const busy = match && match.phase === "playing" && !inMatch ? match : null;
  const turnDarts = game ? game.thrown.length : 0;

  const scoreboard = useMemo(() => {
    if (!game) return null;
    if (game.game === "501")
      return (
        <div className={`grid gap-2 ${game.players.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {game.players.map((p, i) => (
            <div key={p.sessionId} className={`flex flex-col items-center rounded-2xl border p-2 ${game.turn === i && game.phase === "playing" ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-black/25"}`}>
              <span className="max-w-full truncate text-xs font-bold">{p.sessionId === localSessionId ? "You" : p.username}</span>
              <span className="casino-numeral text-4xl text-amber-100">{p.remaining}</span>
              <span className="text-[10px] opacity-60">{p.darts} darts</span>
            </div>
          ))}
        </div>
      );
    return (
      <table className="w-full text-center text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-amber-200/80">
            {game.players.map((p) => (
              <th key={p.sessionId} className="truncate px-1">{p.sessionId === localSessionId ? "You" : p.username}</th>
            ))}
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {CRICKET_TARGETS.map((n, k) => (
            <tr key={n} className="border-t border-white/5">
              {game.players.map((p) => (
                <td key={p.sessionId} className={`font-serif text-base font-black ${p.marks[k] >= 3 ? "text-emerald-300" : "text-amber-50"}`}>
                  {cricketMark(p.marks[k])}
                </td>
              ))}
              <td className="casino-numeral text-amber-200">{n === 25 ? "Bull" : n}</td>
            </tr>
          ))}
          <tr className="border-t border-amber-200/30">
            {game.players.map((p) => (
              <td key={p.sessionId} className="casino-numeral text-amber-100">{p.points}</td>
            ))}
            <td className="text-[10px] opacity-60">pts</td>
          </tr>
        </tbody>
      </table>
    );
  }, [game, localSessionId]);

  return (
    <Modal landscape title="The Lounge Darts Board" icon="🎯" onClose={onClose} tone="felt">
      <div className="casino-body flex min-h-0 flex-1 gap-4">
        <div className="relative flex min-h-0 flex-[1.15] items-center justify-center overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_45%,#3b2a1c,#1a100a)] p-3">
          <Board darts={onBoard} fading={fading} aim={myTurn ? aim : null} reticle={myTurn ? reticle : null} onAim={setAim} onThrow={throwAt} />
          {flash && (
            <div key={flash.id} className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1 text-lg font-black text-amber-100 shadow-lg">
              {flash.hit.label} {flash.hit.score ? `· ${flash.hit.score}` : ""}
            </div>
          )}
          {myTurn && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-amber-50/90">
              Aim, and throw as the circle tightens · dart {turnDarts + 1} of {DARTS_PER_TURN}
            </div>
          )}
        </div>
        <div className="flex min-h-0 w-[24rem] min-w-0 flex-col gap-2">
          {game ? (
            <>
              <div className="rounded-2xl bg-black/30 px-3 py-2 text-center text-sm font-bold text-amber-50">
                {solo ? `Solo ${DARTS_GAME_NAME[game.game]}` : `${DARTS_GAME_NAME[game.game]} match`} · {game.say}
              </div>
              <div className="rounded-2xl bg-black/25 p-2">{scoreboard}</div>
              <div className="flex gap-1.5">
                {Array.from({ length: DARTS_PER_TURN }, (_, i) => {
                  const d = game.thrown[i];
                  return (
                    <div key={i} className={`flex-1 rounded-xl border px-2 py-1 text-center text-sm font-black ${d ? "border-amber-300/50 bg-amber-300/15 text-amber-100" : "border-white/10 bg-black/20 text-white/30"}`}>
                      {d ? `${d.label}${d.score ? ` · ${d.score}` : ""}` : "—"}
                    </div>
                  );
                })}
              </div>
              {game.lastTurn?.bust && <div className="rounded-xl bg-rose-900/50 px-2 py-1 text-center text-xs text-rose-100">Bust! That turn doesn't count.</div>}
              <div className="mt-auto flex gap-2">
                {won && (
                  <button type="button" onClick={() => (solo ? startSolo(game.game) : joinMatch(game.game))} className="clay-btn clay-btn-amber min-h-11 flex-1">
                    Play again
                  </button>
                )}
                <button type="button" onClick={leave} className="clay-btn clay-btn-ghost min-h-11 flex-1">
                  {solo ? "Stop practising" : "Leave the match"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-black/30 p-3 text-sm">
                <b className="text-amber-100">501</b>: from 501 down to exactly nothing, finishing on a double (the bull counts). Go under, or to 1, and the turn's a bust.
                <br />
                <b className="text-amber-100">Cricket</b>: three marks close each of 15 to 20 and the bull; marks on a number you've closed score it while your opponent hasn't.
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/80">🎯 Solo practice</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => startSolo("501")} className="clay-btn clay-btn-amber min-h-11">
                  501
                </button>
                <button type="button" onClick={() => startSolo("cricket")} className="clay-btn clay-btn-amber min-h-11">
                  Cricket
                </button>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/80">👥 A match, turn by turn</div>
              {waiting ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/30 p-3 text-center text-sm">
                  <span>Waiting for a challenger at the oche ({DARTS_GAME_NAME[match!.game]})…</span>
                  <button type="button" onClick={leave} className="clay-btn clay-btn-ghost min-h-10 px-5">
                    Stop waiting
                  </button>
                </div>
              ) : open ? (
                <button type="button" onClick={() => joinMatch(open.game)} className="clay-btn clay-btn-mint min-h-11">
                  Take on {open.players[0].username} at {DARTS_GAME_NAME[open.game]}
                </button>
              ) : busy ? (
                <div className="rounded-2xl bg-black/30 p-3 text-center text-sm opacity-85">
                  {busy.players.map((p) => p.username).join(" and ")} are mid-match. {busy.say}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => joinMatch("501")} className="clay-btn clay-btn-mint min-h-11">
                    501 match
                  </button>
                  <button type="button" onClick={() => joinMatch("cricket")} className="clay-btn clay-btn-mint min-h-11">
                    Cricket match
                  </button>
                </div>
              )}
              <p className="mt-auto text-center text-[11px] opacity-60">Free to play: darts is for bragging rights, not chips.</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

