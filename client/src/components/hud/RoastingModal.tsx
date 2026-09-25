import { useEffect, useRef, useState } from "react";
import { ROAST_FOODS, ROAST_FOOD_INFO, ROAST_GOLDEN_COINS, type CampfirePacket, type RoastFood, type RoastResult, type RoastStart } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { Modal } from "./Modal";

interface Props {
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string;
  onClose: () => void;
}

// Roast & Grill at the campfire. Pick a sweet marshmallow or a hearty BBQ skewer and hold it over
// the fire (ROAST_START): a dial's needle sweeps round once, and stopping it in the green zone
// (the button, Space or Enter) takes it off golden: +ROAST_GOLDEN_COINS. Too soon it is pale, too
// late (or never) it is charcoal. The server keeps the clock and makes the call (roastStart gives
// the dial; roastResult says how it came off), so the dial here only shows what it is timing.

type Phase = "choose" | "heating" | "roasting" | "judging" | "result";

export function RoastingModal({ send, subscribeMessages, localSessionId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [food, setFood] = useState<RoastFood>("mallow");
  const [dial, setDial] = useState<(RoastStart & { at: number }) | null>(null);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // the server's side of it: the dial once the skewer is over the fire, then how it came off
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "roastStart") {
          setDial({ ...(payload as RoastStart), at: performance.now() });
          setProgress(0);
          setPhase("roasting");
        } else if (type === "roastResult" && (payload as RoastResult).sessionId === localSessionId) {
          setResult(payload as RoastResult);
          setPhase("result");
        }
      }),
    [subscribeMessages, localSessionId]
  );

  // the needle, from when the dial arrived
  useEffect(() => {
    if (phase !== "roasting" || !dial) return;
    let frame = 0;
    const tick = () => {
      setProgress(Math.min(1, (performance.now() - dial.at) / (dial.duration * 1000)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, dial]);

  const start = (f: RoastFood) => {
    setFood(f);
    setResult(null);
    setPhase("heating");
    send({ type: "ROAST_START", food: f });
  };
  const stop = () => {
    if (phaseRef.current !== "roasting") return;
    setPhase("judging");
    send({ type: "ROAST_STOP" });
  };

  // Space or Enter pulls it out; caught before the game hears it (Space also stands you up)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== "roasting" || (e.code !== "Space" && e.code !== "Enter")) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // stop reads the phase through its ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // no answer to ROAST_START (out of reach, too soon after the last): back to choosing
  useEffect(() => {
    if (phase !== "heating") return;
    const t = window.setTimeout(() => setPhase("choose"), 2500);
    return () => window.clearTimeout(t);
  }, [phase]);

  const info = ROAST_FOOD_INFO[food];
  return (
    <Modal title="Roast & Grill" icon="🔥" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-3 pb-2">
        {phase === "choose" && (
          <>
            <p className="m-0 text-center text-sm opacity-80">Hold it over the fire and pull it out when the needle is in the green.</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {ROAST_FOODS.map((f) => (
                <button key={f} type="button" onClick={() => start(f)} className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-3xl bg-white/5 p-3 text-center transition-transform duration-150 hover:bg-white/10 active:scale-95">
                  <span className="text-4xl leading-none">{ROAST_FOOD_INFO[f].emoji}</span>
                  <span className="text-sm font-semibold leading-tight">{ROAST_FOOD_INFO[f].name}</span>
                  <span className="text-[11px] leading-tight opacity-60">{ROAST_FOOD_INFO[f].note}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {(phase === "heating" || phase === "roasting" || phase === "judging") && (
          <>
            <Dial progress={phase === "heating" ? 0 : progress} zoneFrom={dial?.zoneFrom ?? 0.6} zoneTo={dial?.zoneTo ?? 0.74} emoji={info.emoji} live={phase === "roasting"} />
            <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase !== "roasting"} onClick={stop}>
              {phase === "heating" ? "Over the fire…" : phase === "judging" ? "Taking a look…" : "🔥 Pull it out!"}
            </button>
            <p className="m-0 text-[11px] opacity-60">Space or Enter works too</p>
          </>
        )}

        {phase === "result" && result && <Outcome result={result} />}
        {phase === "result" && (
          <div className="flex w-full gap-2">
            <button type="button" className="clay-btn clay-btn-ghost min-h-11 flex-1" onClick={() => setPhase("choose")}>
              Roast another
            </button>
            <button type="button" className="clay-btn clay-btn-amber min-h-11 flex-1" onClick={onClose}>
              Enjoy it
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The dial: a ring from pale to golden to charcoal, the green zone on it, the needle sweeping. */
function Dial({ progress, zoneFrom, zoneTo, emoji, live }: { progress: number; zoneFrom: number; zoneTo: number; emoji: string; live: boolean }) {
  const R = 70;
  const at = (f: number) => {
    const a = f * 2 * Math.PI - Math.PI / 2;
    return [90 + R * Math.cos(a), 90 + R * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = at(from);
    const [x1, y1] = at(to);
    return `M ${x0} ${y0} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const [nx, ny] = at(progress);
  return (
    <div className="relative h-[180px] w-[180px]" role="img" aria-label="Roasting dial">
      <svg viewBox="0 0 180 180" className="h-full w-full">
        <path d={arc(0, zoneFrom)} fill="none" stroke="#f3e2c3" strokeWidth="16" strokeLinecap="round" />
        <path d={arc(zoneTo, 0.999)} fill="none" stroke="#5b3a2a" strokeWidth="16" strokeLinecap="round" />
        <path d={arc(zoneFrom, zoneTo)} fill="none" stroke="#6fcf7a" strokeWidth="18" />
        <line x1="90" y1="90" x2={nx} y2={ny} stroke="#fff4e0" strokeWidth="5" strokeLinecap="round" />
        <circle cx="90" cy="90" r="8" fill="#fff4e0" />
        <circle cx={nx} cy={ny} r="7" fill="#ffb347" stroke="#fff4e0" strokeWidth="2" />
      </svg>
      <span className={`absolute left-1/2 top-[58%] -translate-x-1/2 text-4xl ${live ? "cozy-bob" : ""}`} aria-hidden>
        {emoji}
      </span>
    </div>
  );
}

/** How it came off the fire. */
function Outcome({ result }: { result: RoastResult }) {
  const info = ROAST_FOOD_INFO[result.food];
  const line =
    result.quality === "golden"
      ? { big: `${info.emoji} Perfectly roasted!`, small: result.coins > 0 ? `+${result.coins} 🪙 · steaming and golden` : result.capped ? "Golden! (today's campfire coins are all earned)" : `+${ROAST_GOLDEN_COINS} 🪙` }
      : result.quality === "raw"
        ? { big: `${info.emoji} A little pale…`, small: "Pulled out too soon, still tasty" }
        : { big: "💨 Oops, charcoal!", small: "Left in a little too long" };
  return (
    <div className="flex flex-col items-center gap-1 py-3 text-center">
      <div className={`text-5xl ${result.quality === "golden" ? "cozy-bob" : ""}`}>{result.quality === "charred" ? "🔥" : info.emoji}</div>
      <div className="text-lg font-semibold">{line.big}</div>
      <div className={`text-sm ${result.quality === "golden" ? "text-amber-200" : "opacity-70"}`}>{line.small}</div>
    </div>
  );
}
