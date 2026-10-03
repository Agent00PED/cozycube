import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BAR_CHANNEL,
  BAR_INGREDIENTS,
  DRINKS,
  GRADE_STARS,
  INGREDIENT_INFO,
  POUR_BAND,
  POUR_LINE,
  RECIPE_SHOWN_S,
  SHAKE_BEATS,
  SHAKE_WINDOW_S,
  judgeBuild,
  judgePour,
  pourFill,
  shakeBeats,
  type BarResult,
  type BarTicket,
  type Drink,
} from "@shared/barshift";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { GradeStars, WorkSheet } from "./WorkSheet";

// A Shift at the Bar (shared/barshift.ts): the bartender's sheet, at the foot of the screen while you
// stand behind the counter. A ticket comes from the server; the drink is made here in three stages
// (build, pour, shake); the log goes back, and the server's verdict is shown before the next ticket.
//
//   build   the recipe shows a moment, then hides: tap its ingredients in order
//   pour    hold the button (or Space) to pour; let go at the line
//   shake   a ring closes onto the shaker four times: tap (or Space) as it lands
//
// Closing the sheet ends the shift.

type Stage = "wait" | "build" | "pour" | "shake" | "sent" | "result";

const GRADE_WORD = { perfect: "Perfect!", good: "Good", sloppy: "Sloppy" } as const;

export function BarShiftSheet({ station, send, subscribeMessages, onClose }: { station: string; send: (channel: string, packet?: unknown) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const [ticket, setTicket] = useState<BarTicket | null>(null);
  const [stage, setStage] = useState<Stage>("wait");
  const [shown, setShown] = useState(true);
  const [picks, setPicks] = useState<string[]>([]);
  const [fill, setFill] = useState(0);
  const [beat, setBeat] = useState(0);
  const [landed, setLanded] = useState<boolean[]>([]);
  const [result, setResult] = useState<BarResult | null>(null);
  const [waiting, setWaiting] = useState("");
  const pourAt = useRef(0);
  const pourMs = useRef(0);
  const shakeAt = useRef(0);
  const taps = useRef<number[]>([]);
  const raf = useRef(0);
  const live = useRef({ stage, ticket, picks });
  live.current = { stage, ticket, picks };
  const drink = ticket ? (DRINKS[ticket.drink] as Drink) : null;

  // step behind the counter; leaving the sheet ends the shift
  useEffect(() => {
    send(BAR_CHANNEL, { op: "shift", station });
    return () => send(BAR_CHANNEL, { op: "leave" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station]);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "barTicket") {
          setTicket(payload as BarTicket);
          setPicks([]);
          setFill(0);
          setLanded([]);
          setBeat(0);
          setResult(null);
          setShown(true);
          setWaiting("");
          setStage("build");
          taps.current = [];
          pourMs.current = 0;
          playSfx("chime");
        } else if (type === "barResult") {
          const r = payload as BarResult;
          setResult(r);
          setStage("result");
          playSfx(r.verdict.grade === "perfect" ? "fanfare" : r.verdict.grade === "good" ? "chime" : "pluck");
        } else if (type === "barShiftOver") {
          onClose();
        } else if (type === "barOrderIn") {
          setWaiting(`${(payload as { name: string }).name} is waiting for a drink`);
        }
      }),
    [subscribeMessages, onClose]
  );

  // the recipe hides after a moment
  useEffect(() => {
    if (stage !== "build" || !shown) return;
    const t = window.setTimeout(() => setShown(false), RECIPE_SHOWN_S * 1000);
    return () => window.clearTimeout(t);
  }, [stage, shown, ticket]);

  const pick = (id: string) => {
    if (stage !== "build" || !drink || shown) return;
    const next = [...picks, id];
    setPicks(next);
    playSfx("pluck");
    if (next.length >= drink.recipe.length) window.setTimeout(() => setStage("pour"), 260);
  };

  // --- the pour: held ---
  const startPour = useCallback(() => {
    if (live.current.stage !== "pour" || pourAt.current) return;
    pourAt.current = performance.now();
    const tick = () => {
      if (!pourAt.current) return;
      const f = pourFill(performance.now() - pourAt.current);
      setFill(Math.min(1.08, f));
      if (f >= 1.08) {
        endPour();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const endPour = useCallback(() => {
    if (!pourAt.current) return;
    pourMs.current = performance.now() - pourAt.current;
    pourAt.current = 0;
    cancelAnimationFrame(raf.current);
    setFill(Math.min(1.08, pourFill(pourMs.current)));
    playSfx("pluck");
    window.setTimeout(() => {
      shakeAt.current = performance.now();
      setStage("shake");
    }, 420);
  }, []);

  // --- the shake: four beats ---
  const band = drink?.band ?? 1;
  const beats = useMemo(() => shakeBeats(band), [band]);
  const tap = useCallback(() => {
    if (live.current.stage !== "shake") return;
    const t = performance.now() - shakeAt.current;
    taps.current.push(Math.round(t));
    const k = beats.findIndex((b, i) => Math.abs(t - b) <= SHAKE_WINDOW_S * 1000 && !landedRef.current[i]);
    if (k >= 0) {
      landedRef.current[k] = true;
      setLanded([...landedRef.current]);
      playSfx("chime");
    } else {
      playSfx("pluck");
    }
  }, [beats]);
  const landedRef = useRef<boolean[]>([]);
  useEffect(() => {
    if (stage !== "shake") return;
    landedRef.current = Array(SHAKE_BEATS).fill(false);
    setLanded([...landedRef.current]);
    let on = true;
    const tick = () => {
      if (!on) return;
      const t = performance.now() - shakeAt.current;
      setBeat(t);
      if (t > beats[beats.length - 1] + 450) {
        setStage("sent");
        send(BAR_CHANNEL, { op: "finish", log: { picks: live.current.picks, pourMs: Math.round(pourMs.current), taps: taps.current } });
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      on = false;
      cancelAnimationFrame(raf.current);
    };
  }, [stage, beats, send]);

  // Space: pour while held, tap the shaker
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      if (live.current.stage === "pour") startPour();
      else if (live.current.stage === "shake") tap();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && live.current.stage === "pour") endPour();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startPour, endPour, tap]);

  const next = () => {
    setStage("wait");
    send(BAR_CHANNEL, { op: "shift", station });
  };

  const buildScore = drink && picks.length === drink.recipe.length ? judgeBuild(drink.recipe, picks) : null;
  const nextBeat = beats.findIndex((b) => beat < b + SHAKE_WINDOW_S * 1000);
  const ring = nextBeat >= 0 ? Math.max(0, Math.min(1, (beats[nextBeat] - beat) / (beats[0] || 1))) : 0;

  return (
    <WorkSheet title={drink && ticket ? `${drink.emoji} ${drink.name} for ${ticket.forName}` : "Behind the bar"} icon="🍹" onClose={onClose}>
      {stage === "wait" && <p className="m-0 py-3 text-center text-sm opacity-80">Waiting for an order...</p>}

      {drink && ticket && stage !== "wait" && stage !== "result" && (
        <>
          {/* the ticket: the recipe, shown a moment and then hidden; what has been tapped under it */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-black/25 px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-xl">
              {drink.recipe.map((id, i) => (
                <span key={i} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10" title={shown || stage !== "build" ? INGREDIENT_INFO[id].name : "?"}>
                  {stage === "build" && !shown ? (picks[i] ? INGREDIENT_INFO[picks[i] as keyof typeof INGREDIENT_INFO]?.emoji : "❔") : INGREDIENT_INFO[id].emoji}
                </span>
              ))}
            </div>
            <div className="text-right text-[11px] leading-tight opacity-80">
              <div>{ticket.player ? "A player's order" : ticket.tipsLeft > 0 ? `Tips left this hour: ${ticket.tipsLeft}` : "No tips left this hour: for the fun of it"}</div>
              <div>{"★".repeat(drink.band)} drink</div>
            </div>
          </div>

          {stage === "build" && (
            <>
              <p className="m-0 text-center text-xs opacity-80">{shown ? "Remember the recipe..." : "Tap the ingredients, in order"}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {BAR_INGREDIENTS.map((id) => (
                  <button key={id} type="button" disabled={shown} onClick={() => pick(id)} className="flex min-h-12 flex-col items-center justify-center rounded-2xl bg-white/10 text-xl transition active:scale-95 disabled:opacity-40">
                    <span>{INGREDIENT_INFO[id].emoji}</span>
                    <span className="text-[10px] opacity-80">{INGREDIENT_INFO[id].name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {stage === "pour" && (
            <div className="flex items-center gap-3">
              {/* the glass: the line to stop at, its band, the drink rising */}
              <div className="relative h-28 w-14 shrink-0 overflow-hidden rounded-b-2xl rounded-t-md border-2 border-white/40 bg-white/5">
                <div className="absolute inset-x-0 bottom-0 transition-none" style={{ height: `${Math.min(100, fill * 100)}%`, background: fill > 1 ? "#d9534f" : drink.aura, opacity: 0.85 }} />
                <div className="absolute inset-x-0 border-y border-dashed border-[#ffd27a] bg-[#ffd27a]/25" style={{ bottom: `${(POUR_LINE - POUR_BAND[drink.band]) * 100}%`, height: `${POUR_BAND[drink.band] * 200}%` }} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <p className="m-0 text-xs opacity-80">Hold to pour. Let go at the golden line{fill > 1 ? ": spilt!" : ""}</p>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startPour();
                  }}
                  onPointerUp={endPour}
                  onPointerLeave={endPour}
                  onContextMenu={(e) => e.preventDefault()}
                  className="min-h-14 select-none rounded-2xl bg-[#F5A623] text-base font-bold text-[#2B201B] transition active:scale-95"
                  style={{ touchAction: "none" }}
                >
                  🫗 Pour <span className="kbd-hint opacity-70">(hold Space)</span>
                </button>
                {buildScore !== null && <p className="m-0 text-[11px] opacity-70">{buildScore === 1 ? "Recipe right ✓" : buildScore > 0 ? "Right things, wrong order" : "Not the recipe..."}</p>}
              </div>
            </div>
          )}

          {(stage === "shake" || stage === "sent") && (
            <div className="flex items-center gap-3">
              <button type="button" onPointerDown={tap} disabled={stage === "sent"} className="relative grid h-28 w-28 shrink-0 select-none place-items-center rounded-full bg-white/10 text-4xl transition active:scale-90" style={{ touchAction: "none" }}>
                <span style={{ transform: `rotate(${Math.sin(beat / 60) * (stage === "shake" ? 12 : 0)}deg)` }}>🧉</span>
                {stage === "shake" && nextBeat >= 0 && <span className="pointer-events-none absolute rounded-full border-4 border-[#ffd27a]" style={{ inset: `${-ring * 26}px`, opacity: 0.35 + 0.65 * (1 - ring) }} />}
              </button>
              <div className="flex flex-1 flex-col gap-1.5">
                <p className="m-0 text-xs opacity-80">{stage === "sent" ? "Serving..." : "Tap as the ring lands on the shaker"} <span className="kbd-hint opacity-70">(Space)</span></p>
                <div className="flex gap-1.5">
                  {Array.from({ length: SHAKE_BEATS }, (_, i) => (
                    <span key={i} className="h-3 flex-1 rounded-full" style={{ background: landed[i] ? "#7dd87d" : beat > beats[i] + SHAKE_WINDOW_S * 1000 ? "#d9534f" : "rgba(255,255,255,0.18)" }} />
                  ))}
                </div>
                <p className="m-0 text-[11px] opacity-70">{judgePour(drink.band, pourMs.current) === 1 ? "Poured to the line ✓" : judgePour(drink.band, pourMs.current) > 0 ? "A little off the line" : pourFill(pourMs.current) > 1 ? "Spilt" : "Short measure"}</p>
              </div>
            </div>
          )}
        </>
      )}

      {stage === "result" && result && (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <GradeStars n={GRADE_STARS[result.verdict.grade]} />
          <p className="m-0 font-cozy text-lg font-bold text-[#F7EBE1]">
            {GRADE_WORD[result.verdict.grade]} {(DRINKS[result.drink] as Drink).emoji}
          </p>
          <p className="m-0 text-center text-xs opacity-80">
            Served to {result.forName}
            {result.coins > 0 ? ` · +${result.coins} 🪙` : ""}
            {result.streak > 1 ? ` · ${result.streak} Perfects in a row` : ""}
          </p>
          <p className="m-0 text-[11px] opacity-70">
            Recipe {result.verdict.build === 1 ? "✓" : result.verdict.build > 0 ? "~" : "✗"} · Pour {result.verdict.pour === 1 ? "✓" : result.verdict.pour > 0 ? "~" : "✗"} · Shake {result.verdict.beats}/{SHAKE_BEATS}
          </p>
          {result.title && <p className="m-0 text-xs font-bold text-[#ffd27a]">🏅 A new title: {result.title}</p>}
          {waiting && <p className="m-0 text-xs text-[#ffd27a]">{waiting}</p>}
          <div className="mt-1 flex w-full gap-2">
            <button type="button" onClick={next} className="min-h-12 flex-1 rounded-2xl bg-[#F5A623] font-bold text-[#2B201B] transition active:scale-95">
              🍹 Next order
            </button>
            <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-white/10 px-4 font-bold transition active:scale-95">
              End shift
            </button>
          </div>
        </div>
      )}
    </WorkSheet>
  );
}
