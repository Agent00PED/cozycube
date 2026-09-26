import { useEffect, useRef, useState } from "react";
import { PIANO_HIGH, PIANO_LOW, type CasinoPacket, type PianoPieceId, type PianoRecital } from "@shared/casino";
import { PIANO_PIECES, PIANO_PIECE_IDS } from "@shared/pianoPieces";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playPianoNote } from "../../audio/piano";
import { Modal } from "./Modal";

// The baby grand on the Velvet Lounge's dais. Sit at the bench and it asks: [ 🎵 Auto-Recital ] (a
// piece from the recital book plays for the whole hall, quieter the further away you are) or
// [ 🎹 Play Yourself ] (two octaves of keys, on screen or on the keyboard: the Z row from middle C,
// the Q row an octave up; everyone in the hall hears what you play). Recitals are public-domain
// pieces and the house's own tune (shared/pianoPieces.ts).

interface Props {
  localSessionId: string;
  send: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

/** The QWERTY keys, in order from middle C: Z row for C4 to C5, Q row for C5 to C6. */
const LOWER = ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m", ","];
const UPPER = ["q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u", "i"];
const KEY_MIDI = new Map<string, number>([...LOWER.map((k, i) => [k, PIANO_LOW + i] as [string, number]), ...UPPER.map((k, i) => [k, PIANO_LOW + 12 + i] as [string, number])]);
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MIDIS = Array.from({ length: PIANO_HIGH - PIANO_LOW + 1 }, (_, i) => PIANO_LOW + i);
const WHITES = MIDIS.filter((m) => !BLACK.has(m % 12));

export function PianoModal({ localSessionId, send, subscribeMessages, onClose }: Props) {
  const [mode, setMode] = useState<"ask" | "recital" | "play">("ask");
  const [playing, setPlaying] = useState<{ piece: PianoPieceId; mine: boolean } | null>(null);
  const [down, setDown] = useState<Set<number>>(new Set());

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "pianoRecital") return;
        const r = payload as PianoRecital;
        setPlaying(r.piece ? { piece: r.piece, mine: r.sessionId === localSessionId } : null);
      }),
    [subscribeMessages, localSessionId]
  );
  // a recital ends by itself: the panel forgets it when its time is up
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setPlaying(null), PIANO_PIECES[playing.piece].seconds * 1000 + 500);
    return () => window.clearTimeout(t);
  }, [playing]);

  const press = (midi: number) => {
    playPianoNote(midi, 1);
    send({ type: "PIANO_NOTE", midi });
    setDown((d) => new Set(d).add(midi));
    window.setTimeout(
      () =>
        setDown((d) => {
          const n = new Set(d);
          n.delete(midi);
          return n;
        }),
      160
    );
  };
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (mode !== "play") return;
    // caught on the way down and kept there: W, A, S, D and E are keys here, not steps off the bench
    const held = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const midi = KEY_MIDI.get(k);
      if (midi === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      if (held.has(k) || e.repeat) return;
      held.add(k);
      pressRef.current(midi);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!KEY_MIDI.has(k)) return;
      e.stopPropagation();
      held.delete(k);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onUp, { capture: true });
    };
  }, [mode]);

  const busy = playing && !playing.mine;

  return (
    <Modal title="The Baby Grand" icon="🎹" onClose={onClose} width={620} tone="velvet">
      <div className="flex flex-col gap-3 pb-2">
        {mode === "ask" && (
          <>
            <div className="text-center text-sm opacity-80">You settle onto the bench and lift the fallboard. What shall it be?</div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMode("recital")} className="clay-btn clay-btn-amber flex min-h-20 flex-col gap-1 text-base">
                <span className="text-2xl">🎵</span>[ Auto-Recital ]
              </button>
              <button type="button" onClick={() => setMode("play")} className="clay-btn clay-btn-rose flex min-h-20 flex-col gap-1 text-base">
                <span className="text-2xl">🎹</span>[ Play Yourself ]
              </button>
            </div>
          </>
        )}

        {mode === "recital" && (
          <>
            <div className="text-center text-xs opacity-70">The whole hall hears it, softer the further they stand from the piano.</div>
            {playing && (
              <div className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-2 text-sm">
                <span>
                  Now playing: <b className="text-amber-200">{PIANO_PIECES[playing.piece].title}</b>
                  {!playing.mine && <span className="opacity-60"> (someone else's recital)</span>}
                </span>
                {playing.mine && (
                  <button type="button" onClick={() => send({ type: "PIANO_STOP" })} className="clay-btn clay-btn-ghost min-h-9 px-3 text-xs">
                    Stop
                  </button>
                )}
              </div>
            )}
            <div className="grid gap-2">
              {PIANO_PIECE_IDS.map((id) => {
                const p = PIANO_PIECES[id];
                return (
                  <button key={id} type="button" disabled={!!busy} onClick={() => send({ type: "PIANO_RECITAL", piece: id })} className={`flex items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50 ${playing?.piece === id ? "border-amber-300 bg-black/40" : "border-white/10 bg-black/20 hover:bg-black/30"}`}>
                    <span>
                      <span className="block font-cozy text-base font-extrabold text-amber-100">{p.title}</span>
                      <span className="block text-xs opacity-70">{p.by}</span>
                    </span>
                    <span className="text-xs opacity-70">{Math.round(p.seconds)} s</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setMode("play")} className="clay-btn clay-btn-ghost min-h-9 text-xs">
              🎹 Play it yourself instead
            </button>
          </>
        )}

        {mode === "play" && (
          <>
            <div className="text-center text-xs opacity-70">Tap the keys, or play on your keyboard: Z S X D C V… from middle C, Q 2 W 3 E R… an octave up. Everyone in the hall hears you.</div>
            {/* the keyboard: white keys in a row, black ones over the gaps */}
            <div className="relative mx-auto h-40 w-full select-none touch-none" style={{ maxWidth: 580 }}>
              <div className="flex h-full w-full gap-[2px] rounded-b-xl bg-black/60 p-[2px]">
                {WHITES.map((m) => (
                  <button key={m} type="button" onPointerDown={(e) => (e.preventDefault(), press(m))} className={`relative flex flex-1 items-end justify-center rounded-b-lg pb-1 text-[9px] font-bold text-stone-500 shadow-[inset_0_-6px_0_rgba(0,0,0,0.12)] ${down.has(m) ? "bg-amber-100" : "bg-stone-50"}`} aria-label={`${NAMES[m % 12]}${Math.floor(m / 12) - 1}`}>
                    {m % 12 === 0 ? `C${Math.floor(m / 12) - 1}` : ""}
                  </button>
                ))}
              </div>
              {MIDIS.filter((m) => BLACK.has(m % 12)).map((m) => {
                const whiteIndex = WHITES.filter((w) => w < m).length;
                const left = (whiteIndex / WHITES.length) * 100;
                return <button key={m} type="button" onPointerDown={(e) => (e.preventDefault(), press(m))} className={`absolute top-0 h-[60%] -translate-x-1/2 rounded-b-md shadow-lg ${down.has(m) ? "bg-amber-700" : "bg-stone-900"}`} style={{ left: `${left}%`, width: `${(100 / WHITES.length) * 0.62}%` }} aria-label={`${NAMES[m % 12]}${Math.floor(m / 12) - 1}`} />;
              })}
            </div>
            <button type="button" onClick={() => setMode("recital")} className="clay-btn clay-btn-ghost min-h-9 text-xs">
              🎵 Let the piano play a recital instead
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
