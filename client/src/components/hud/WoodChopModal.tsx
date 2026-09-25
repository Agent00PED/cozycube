import { useEffect, useRef, useState } from "react";
import { CHOP_CLEAN_COINS, CHOP_STUN_S, type CampfirePacket, type ChopResult } from "@shared/types";
import { CHOP_GRACE, WOOD, CHOP_LOGS, CHOP_STROKE_NAMES, chopKnot, chopMarker, chopZone, type ChopStroke } from "@shared/chop";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string;
  onClose: () => void;
}

// The chopping block's 3-hit combo. Raise the hatchet (CHOP_START) and swing (the button, Space or
// Enter) when the needle is in the green, three times running. The needle ping-pongs across the
// meter on every stroke (it never runs out at the edge; take your time):
//
//   1  Notch Cut      the wide sweet spot swings back and forth
//   2  Wedge Split    the sweet spot holds still
//   3  Clean Cleave   a narrow golden sweet spot, the needle slower still
//
// The red wood knot on each meter stuns the axe if the swing lands in it. The log is Soft Pine (a
// wider sweet spot), Hard Oak (its knots creep) or, one in ten, a Golden Log. All three land: the
// log splits (a burst of chips), +CHOP_CLEAN_COINS and its Firewood (or Golden Charcoal) go in
// your bag, to put on the bonfire.
// The server keeps each stroke's clock and judges each swing (shared/chop.ts: the meter drawn here
// is computed exactly as it judges); chopStroke hands over the next meter, chopResult ends it.

type Phase = "ready" | "raising" | "stroke" | "judging" | "result";

const CHIPS = Array.from({ length: 14 }, (_, i) => ({
  x: Math.cos((i / 14) * Math.PI * 2) * (50 + (i % 3) * 18),
  y: Math.sin((i / 14) * Math.PI * 2) * (26 + (i % 4) * 8) - 22,
  spin: (i % 2 ? 1 : -1) * (120 + i * 25),
  delay: (i % 4) * 0.03,
}));

export function WoodChopModal({ send, subscribeMessages, localSessionId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [stroke, setStroke] = useState<(ChopStroke & { at: number }) | null>(null);
  const [t, setT] = useState(0);
  const [result, setResult] = useState<ChopResult | null>(null);
  const [splits, setSplits] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "chopStroke") {
          const s = payload as ChopStroke;
          if (s.stroke > 1) playSfx("chop"); // the last swing landed: a notch, a split
          setStroke({ ...s, at: performance.now() });
          setT(0);
          setPhase("stroke");
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

  // the needle and the sweet spot, from when the stroke's meter arrived
  useEffect(() => {
    if (phase !== "stroke" || !stroke) return;
    let frame = 0;
    const tick = () => {
      setT((performance.now() - stroke.at) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, stroke]);

  const raise = () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "result") return;
    setResult(null);
    setStroke(null);
    setPhase("raising");
    sendRef.current({ type: "CHOP_START" });
  };
  const strokeRef = useRef(stroke);
  strokeRef.current = stroke;
  const strike = () => {
    if (phaseRef.current !== "stroke" || !strokeRef.current) return;
    // the needle's place at this very click, on the same clock the meter is drawn from: that is
    // what the server judges (and where the needle stays while it does)
    const at = (performance.now() - strokeRef.current.at) / 1000;
    setT(at);
    setPhase("judging");
    sendRef.current({ type: "CHOP_STOP", t: at });
  };

  // one key does it all: Space or Enter raises the hatchet, and brings it down
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (phaseRef.current === "stroke") strike();
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

  // no answer to CHOP_START (out of reach, the axe still stunned): back to ready
  useEffect(() => {
    if (phase !== "raising") return;
    const timer = window.setTimeout(() => setPhase("ready"), 2000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const live = phase === "stroke" || phase === "judging";
  const needle = stroke && live ? chopMarker(stroke, t) : 0;
  const [z0, z1] = stroke && live ? chopZone(stroke, t) : [0.4, 0.6];
  const [k0, k1] = stroke && live ? chopKnot(stroke, t) : [0, 0];
  const log = stroke ? CHOP_LOGS[stroke.log] : result ? CHOP_LOGS[result.log] : null;
  const current = stroke?.stroke ?? 1;
  const done = (n: number) => (phase === "result" ? (result?.clean ? true : n < (result?.stroke ?? 1)) : n < current);
  return (
    <Modal title="Chop Firewood" icon="🪓" onClose={onClose} width={440}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <p className="m-0 text-center text-sm opacity-80">Three swings, each in the green: notch it, split it, cleave it. Mind the red knot.</p>
        {log && (
          <div className={`rounded-full px-3 py-1 text-xs font-bold ${stroke?.log === "golden" || result?.log === "golden" ? "bg-amber-300/30 text-amber-100 shadow-[0_0_12px_rgba(255,209,102,0.5)]" : "bg-white/10"}`}>
            {log.emoji} {log.name} · <span className="font-normal opacity-80">{log.blurb}</span>
          </div>
        )}
        {/* the combo: three strokes */}
        <div className="flex w-full items-center justify-center gap-2" aria-label="Combo">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className={`flex flex-1 flex-col items-center rounded-2xl px-2 py-1.5 text-center text-[11px] font-bold ${done(n) ? "bg-emerald-400/25 text-emerald-200" : n === current && live ? "bg-amber-300/25 text-amber-100" : "bg-white/5 opacity-60"}`}>
              <span className="text-base">{done(n) ? "✅" : n === current && live ? "🪓" : "🪵"}</span>
              {CHOP_STROKE_NAMES[n]}
            </div>
          ))}
        </div>
        {/* the meter */}
        <div className="relative h-11 w-full overflow-hidden rounded-full bg-gradient-to-r from-[#6b4a33] to-[#8a6246]" role="img" aria-label="Chopping meter">
          {stroke && live && <div className="absolute inset-y-1 rounded-full bg-[#ff5a4f]/85 shadow-[0_0_10px_rgba(255,90,79,0.7)]" style={{ left: `${k0 * 100}%`, width: `${(k1 - k0) * 100}%` }} title="Wood knot" />}
          {/* the grace either side of the green: a swing in the halo still lands */}
          {live && <div className="absolute inset-y-2 rounded-full bg-white/15" style={{ left: `${Math.max(0, z0 - CHOP_GRACE) * 100}%`, width: `${(Math.min(1, z1 + CHOP_GRACE) - Math.max(0, z0 - CHOP_GRACE)) * 100}%` }} aria-hidden />}
          <div className={`absolute inset-y-1 rounded-full ${current === 3 ? "bg-[#ffd166] shadow-[0_0_14px_rgba(255,209,102,0.9)]" : "bg-[#6fcf7a] shadow-[0_0_12px_rgba(111,207,122,0.7)]"}`} style={{ left: `${z0 * 100}%`, width: `${(z1 - z0) * 100}%`, opacity: live ? 1 : 0.35 }} />
          {live && <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-[#fff4e0] shadow-[0_0_10px_rgba(255,244,224,0.9)]" style={{ left: `${needle * 100}%` }} />}
        </div>

        {phase === "result" && result && (
          <div className="relative flex flex-col items-center gap-1 py-1 text-center">
            {result.clean && (
              <div className="cozy-chips" aria-hidden>
                {CHIPS.map((c, i) => (
                  <span key={i} style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px`, "--spin": `${c.spin}deg`, animationDelay: `${c.delay}s` } as React.CSSProperties} />
                ))}
              </div>
            )}
            <div className="text-lg font-semibold">{result.clean ? (result.wood === "charcoal" ? "✨ Golden Charcoal! The log splits in two" : "🪵 Clean cleave! The log splits in two") : result.stunned ? "💫 The axe bit a knot!" : `😅 Missed the ${CHOP_STROKE_NAMES[(result.stroke as 1 | 2 | 3) ?? 1].toLowerCase()}`}</div>
            <div className={`text-sm ${result.clean ? "text-amber-200" : "opacity-70"}`}>
              {result.clean
                ? `+${result.pieces} ${WOOD[result.wood].name} ${WOOD[result.wood].emoji}${result.pieces > 1 ? " (double!)" : ""}${result.coins > 0 ? ` · +${result.coins} 🪙` : " (today's chopping coins are all earned)"} · burn it or sell it to Buster`
                : result.stunned
                  ? `Shake it off: the axe is ready again in ${CHOP_STUN_S}s`
                  : "Try again: swing when the needle is in the green"}
            </div>
          </div>
        )}

        {live ? (
          <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase !== "stroke"} onClick={strike}>
            {phase === "judging" ? "…" : `🪓 ${CHOP_STROKE_NAMES[current]}!`}
          </button>
        ) : (
          <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase === "raising"} onClick={raise}>
            {phase === "raising" ? "Raising the hatchet…" : phase === "result" ? "🪓 Chop another" : "🪓 Raise the hatchet"}
          </button>
        )}
        <p className="m-0 text-[11px] opacity-60">
          Space or Enter works too · logs split: {splits} · each +{CHOP_CLEAN_COINS} 🪙
        </p>
      </div>
    </Modal>
  );
}
