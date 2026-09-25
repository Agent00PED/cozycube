import { useEffect, useRef, useState } from "react";
import { BONFIRE_FUEL_SECONDS, CHOP_CLEAN_COINS, type CampfirePacket, type ChopResult, type ChopStart } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string;
  onClose: () => void;
}

// The chopping block by the woodpile. Raise the hatchet (CHOP_START): a marker runs the meter once,
// and one tap (the button, Space or Enter) brings it down (CHOP_STOP). In the sweet spot the log
// splits clean: +CHOP_CLEAN_COINS, and the split wood goes on the bonfire, which roars up for a
// minute. The server keeps the clock and makes the call (chopStart gives the meter; chopResult
// says how it went), so the meter here only shows what it is timing.

type Phase = "ready" | "raising" | "swinging" | "judging" | "result";

export function WoodChopModal({ send, subscribeMessages, localSessionId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [meter, setMeter] = useState<(ChopStart & { at: number }) | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChopResult | null>(null);
  const [splits, setSplits] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "chopStart") {
          setMeter({ ...(payload as ChopStart), at: performance.now() });
          setProgress(0);
          setPhase("swinging");
        } else if (type === "chopResult" && (payload as ChopResult).sessionId === localSessionId) {
          const r = payload as ChopResult;
          playSfx(r.clean ? "chop" : "thunk");
          if (r.clean) setSplits((n) => n + 1);
          setResult(r);
          setPhase("result");
        }
      }),
    [subscribeMessages, localSessionId]
  );

  // the marker, from when the meter arrived
  useEffect(() => {
    if (phase !== "swinging" || !meter) return;
    let frame = 0;
    const tick = () => {
      setProgress(Math.min(1, (performance.now() - meter.at) / (meter.duration * 1000)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, meter]);

  const raise = () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "result") return;
    setResult(null);
    setPhase("raising");
    sendRef.current({ type: "CHOP_START" });
  };
  const strike = () => {
    if (phaseRef.current !== "swinging") return;
    setPhase("judging");
    sendRef.current({ type: "CHOP_STOP" });
  };

  // one key does it all: Space or Enter raises the hatchet, and brings it down
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (phaseRef.current === "swinging") strike();
      else if (phaseRef.current === "ready" || phaseRef.current === "result") raise();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // raise and strike read the phase through its ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // no answer to CHOP_START (out of reach, too soon after the last): back to ready
  useEffect(() => {
    if (phase !== "raising") return;
    const t = window.setTimeout(() => setPhase("ready"), 2000);
    return () => window.clearTimeout(t);
  }, [phase]);

  const zoneFrom = meter?.zoneFrom ?? 0.45;
  const zoneTo = meter?.zoneTo ?? 0.58;
  const shown = phase === "swinging" || phase === "judging" ? progress : phase === "result" ? progress : 0;
  return (
    <Modal title="Chop Firewood" icon="🪓" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <p className="m-0 text-center text-sm opacity-80">Bring the hatchet down when the marker is in the sweet spot. A clean split feeds the fire.</p>
        <div className="relative h-10 w-full overflow-hidden rounded-full bg-[#3a2a1f]" role="img" aria-label="Chopping meter">
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6b4a33] to-[#8a6246]" style={{ width: "100%" }} />
          <div className="absolute inset-y-1 rounded-full bg-[#6fcf7a] shadow-[0_0_12px_rgba(111,207,122,0.7)]" style={{ left: `${zoneFrom * 100}%`, width: `${(zoneTo - zoneFrom) * 100}%` }} />
          <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-[#fff4e0] shadow-[0_0_10px_rgba(255,244,224,0.9)]" style={{ left: `${shown * 100}%` }} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-lg" aria-hidden>
            🪵
          </span>
        </div>

        {phase === "result" && result && (
          <div className="flex flex-col items-center gap-1 py-1 text-center">
            <div className="text-lg font-semibold">{result.clean ? "🪵 Clean split!" : "😅 Thunk! It glanced off"}</div>
            <div className={`text-sm ${result.clean ? "text-amber-200" : "opacity-70"}`}>
              {result.clean ? (result.coins > 0 ? `+${result.coins} 🪙 · the fire roars up for ${BONFIRE_FUEL_SECONDS}s` : `The fire roars up (today's chopping coins are all earned)`) : "Try again: wait for the green"}
            </div>
          </div>
        )}

        {phase === "swinging" || phase === "judging" ? (
          <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase !== "swinging"} onClick={strike}>
            {phase === "judging" ? "…" : "🪓 Chop!"}
          </button>
        ) : (
          <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase === "raising"} onClick={raise}>
            {phase === "raising" ? "Raising the hatchet…" : phase === "result" ? "🪓 Chop another" : "🪓 Raise the hatchet"}
          </button>
        )}
        <p className="m-0 text-[11px] opacity-60">
          Space or Enter works too · clean splits: {splits} · each +{CHOP_CLEAN_COINS} 🪙
        </p>
      </div>
    </Modal>
  );
}
