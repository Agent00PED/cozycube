import { useEffect, useRef, useState } from "react";
import { CHOP_CLEAN_COINS, CHOP_STUN_S, type CampfirePacket, type ChopResult, type ChopSwing } from "@shared/types";
import { CHOP_CRIT_COINS, CHOP_GRACE, CHOP_GREENS_TO_SPLIT, WOOD, CHOP_LOGS, CHOP_STROKE_NAMES, chopGold, chopKnot, chopMarker, chopZone, isGreen, type ChopStroke, type ChopVerdict } from "@shared/chop";
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
// Enter) when the needle is in the green: land at least two of the three strokes in it and the log
// splits. The green's gold centre is a critical chop (a crisp crack, a burst of chips, now and then
// +3 coins or a Pine Resin; Buster's gloves widen it); a glancing blow or a miss just carries the
// chopping on. The needle ping-pongs across the meter on every stroke (take your time):
//
//   1  Notch Cut      the wide sweet spot swings back and forth
//   2  Wedge Split    the sweet spot holds still
//   3  Clean Cleave   a narrow golden sweet spot, the needle slower still
//
// The red wood knot on each meter stuns the axe if the swing lands in it. The log is Soft Pine (a
// wider sweet spot), Hard Oak (its knots creep) or, one in ten, a Golden Log. All three land: the
// log splits (a burst of chips), +CHOP_CLEAN_COINS and its Firewood (or Golden Charcoal) go in
// your carrier, to put on the bonfire.
// The server keeps each stroke's clock and judges each swing (shared/chop.ts: the meter drawn here
// is computed exactly as it judges); chopSwing tells how each landed, chopStroke hands over the next
// meter, chopResult ends it.

const SWING_LABEL: Record<ChopVerdict, string> = { gold: "✨ Critical!", hit: "🟩 In the green", edge: "Glancing blow", miss: "Missed", knot: "💫 A knot!" };
const PIP: Record<ChopVerdict, string> = { gold: "✨", hit: "✅", edge: "➖", miss: "➖", knot: "💫" };

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
  const [result, setResult] = useState<ChopResult | null>(null);
  const [splits, setSplits] = useState(0);
  /** How each stroke of this combo landed, and the last swing's call-out (its key replays the burst). */
  const [swings, setSwings] = useState<ChopVerdict[]>([]);
  const [callout, setCallout] = useState<{ key: number; swing: ChopSwing } | null>(null);
  // what the frame loop and the key handler read: always the latest, never a stale closure
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const strokeRef = useRef(stroke);
  strokeRef.current = stroke;
  const sendRef = useRef(send);
  sendRef.current = send;
  // the meter's moving parts, written straight to the DOM each frame (no React state per frame, no
  // CSS transitions): the needle, the sweet spot and its grace halo, and the knot
  const needleEl = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);
  const goldEl = useRef<HTMLDivElement>(null);
  const graceEl = useRef<HTMLDivElement>(null);
  const knotEl = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  /** The stroke time the meter is frozen at while a swing is judged (null: running). */
  const frozenAt = useRef<number | null>(null);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "chopSwing" && (payload as ChopSwing).sessionId === localSessionId) {
          const w = payload as ChopSwing;
          // how the swing landed: a crisp crack in the gold, a knock in the green, a dull thud otherwise
          playSfx(w.verdict === "gold" ? "crit" : w.verdict === "hit" ? "chop" : "thunk");
          if (w.bonus === "coins") playSfx("coins");
          setSwings((v) => [...v, w.verdict]);
          setCallout({ key: performance.now(), swing: w });
        } else if (type === "chopStroke") {
          const s = payload as ChopStroke;
          frozenAt.current = null;
          setStroke({ ...s, at: performance.now() });
          setPhase("stroke");
        } else if (type === "chopResult" && (payload as ChopResult).sessionId === localSessionId) {
          const r = payload as ChopResult;
          if (r.clean) playSfx("chop");
          if (r.clean) setSplits((n) => n + 1);
          setResult(r);
          setPhase("result");
        }
      }),
    [subscribeMessages, localSessionId]
  );

  // the one animation loop: every moving part of the meter is placed from the same stroke time, in
  // the same frame, by the same functions the server judges with (shared/chop.ts)
  useEffect(() => {
    const place = (el: HTMLDivElement | null, from: number, to: number, show = true) => {
      if (!el) return;
      el.style.display = show && to > from ? "block" : "none";
      el.style.left = `${from * 100}%`;
      el.style.width = `${(to - from) * 100}%`;
    };
    const updateLoop = (timestamp: number) => {
      const s = strokeRef.current;
      const live = phaseRef.current === "stroke" || phaseRef.current === "judging";
      if (s && live) {
        const t = frozenAt.current ?? (timestamp - s.at) / 1000;
        const needle = chopMarker(s, t);
        const [z0, z1] = chopZone(s, t);
        const [g0, g1] = chopGold(s, t);
        const [k0, k1] = chopKnot(s, t);
        if (needleEl.current) {
          needleEl.current.style.display = "block";
          needleEl.current.style.left = `${needle * 100}%`;
        }
        place(zoneEl.current, z0, z1);
        place(goldEl.current, g0, g1);
        place(graceEl.current, Math.max(0, z0 - CHOP_GRACE), Math.min(1, z1 + CHOP_GRACE));
        place(knotEl.current, k0, k1, s.knotWidth > 0);
      } else {
        if (needleEl.current) needleEl.current.style.display = "none";
        place(graceEl.current, 0, 0, false);
        place(knotEl.current, 0, 0, false);
        place(zoneEl.current, 0.35, 0.65);
        place(goldEl.current, 0.45, 0.55);
      }
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };
    animFrameRef.current = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const raise = () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "result") return;
    setResult(null);
    setStroke(null);
    setSwings([]);
    setCallout(null);
    setPhase("raising");
    sendRef.current({ type: "CHOP_START" });
  };
  /** A swing, at `when` (the click's or key's own timestamp, on the performance clock the meter runs
   *  on): the needle's place at that very moment is what the server judges, and where it stays. */
  const strike = (when: number = performance.now()) => {
    const s = strokeRef.current;
    if (phaseRef.current !== "stroke" || !s) return;
    const at = Math.max(0, (when - s.at) / 1000);
    frozenAt.current = at;
    setPhase("judging");
    sendRef.current({ type: "CHOP_STOP", t: at });
  };

  // one key does it all: Space or Enter raises the hatchet, and brings it down
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (e.repeat) return;
      if (phaseRef.current === "stroke") strike(e.timeStamp || performance.now());
      else if (phaseRef.current === "ready" || phaseRef.current === "result") raise();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // raise and strike read everything through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // no answer to CHOP_START (no log on this block, the carrier full, the axe still stunned): back to ready
  useEffect(() => {
    if (phase !== "raising") return;
    const timer = window.setTimeout(() => setPhase("ready"), 2000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const live = phase === "stroke" || phase === "judging";
  const log = stroke ? CHOP_LOGS[stroke.log] : result ? CHOP_LOGS[result.log] : null;
  const current = stroke?.stroke ?? 1;
  const greens = swings.filter(isGreen).length;
  return (
    <Modal title="Chop Firewood" icon="🪓" onClose={onClose} width={440}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <p className="m-0 text-center text-sm opacity-80">Three swings: land {CHOP_GREENS_TO_SPLIT} in the green to split the log. The gold centre is a critical chop. Mind the red knot.</p>
        {log && (
          <div className={`rounded-full px-3 py-1 text-xs font-bold ${stroke?.log === "golden" || result?.log === "golden" ? "bg-amber-300/30 text-amber-100 shadow-[0_0_12px_rgba(255,209,102,0.5)]" : "bg-white/10"}`}>
            {log.emoji} {log.name} · <span className="font-normal opacity-80">{log.blurb}</span>
          </div>
        )}
        {/* the combo: three strokes */}
        <div className="flex w-full items-center justify-center gap-2" aria-label="Combo">
          {([1, 2, 3] as const).map((n) => {
            const v = swings[n - 1];
            const tone = v === "gold" ? "bg-amber-300/30 text-amber-100 shadow-[0_0_10px_rgba(255,209,102,0.45)]" : v === "hit" ? "bg-emerald-400/25 text-emerald-200" : v ? "bg-white/5 opacity-70" : n === current && live ? "bg-amber-300/15 text-amber-100" : "bg-white/5 opacity-60";
            return (
              <div key={n} className={`flex flex-1 flex-col items-center rounded-2xl px-2 py-1.5 text-center text-[11px] font-bold ${tone}`}>
                <span className="text-base">{v ? PIP[v] : n === current && live ? "🪓" : "🪵"}</span>
                {CHOP_STROKE_NAMES[n]}
              </div>
            );
          })}
        </div>
        {/* the meter: its parts placed by the frame loop above */}
        <div
          className="relative h-11 w-full cursor-pointer overflow-hidden rounded-full bg-gradient-to-r from-[#6b4a33] to-[#8a6246]"
          role="img"
          aria-label="Chopping meter"
          onPointerDown={(e) => {
            if (phaseRef.current !== "stroke") return;
            e.preventDefault();
            strike(e.timeStamp || performance.now());
          }}
        >
          <div ref={knotEl} className="absolute inset-y-1 rounded-full bg-[#ff5a4f]/85 shadow-[0_0_10px_rgba(255,90,79,0.7)]" style={{ display: "none" }} title="Wood knot" />
          {/* the grace either side of the green: a swing in the halo still lands */}
          <div ref={graceEl} className="absolute inset-y-2 rounded-full bg-white/15" style={{ display: "none" }} aria-hidden />
          <div ref={zoneEl} className="absolute inset-y-1 rounded-full bg-[#6fcf7a] shadow-[0_0_12px_rgba(111,207,122,0.7)]" style={{ left: "35%", width: "30%", opacity: live ? 1 : 0.35 }} />
          {/* the green's gold centre: a critical chop */}
          <div ref={goldEl} className="absolute inset-y-2 rounded-full bg-[#ffd166] shadow-[0_0_12px_rgba(255,209,102,0.95)]" style={{ left: "45%", width: "10%", opacity: live ? 1 : 0.35 }} title="Gold: a critical chop" />
          <div ref={needleEl} className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-[#fff4e0] shadow-[0_0_10px_rgba(255,244,224,0.9)]" style={{ display: "none" }} />
        </div>

        {/* the last swing: how it landed (a burst of chips for a critical) */}
        {callout && phase !== "result" && (
          <div key={callout.key} className="clay-pop relative text-center text-sm font-bold">
            {callout.swing.verdict === "gold" && (
              <div className="cozy-chips" aria-hidden>
                {CHIPS.map((c, i) => (
                  <span key={i} style={{ "--cx": `${c.x * 0.7}px`, "--cy": `${c.y * 0.7}px`, "--spin": `${c.spin}deg`, animationDelay: `${c.delay}s` } as React.CSSProperties} />
                ))}
              </div>
            )}
            <span className={callout.swing.verdict === "gold" ? "text-amber-200" : callout.swing.verdict === "hit" ? "text-emerald-200" : "opacity-70"}>{SWING_LABEL[callout.swing.verdict]}</span>
            {callout.swing.bonus === "coins" && <span className="ml-1.5 text-amber-200">+{callout.swing.coins || CHOP_CRIT_COINS} 🪙</span>}
            {callout.swing.bonus === "resin" && <span className="ml-1.5 text-amber-200">+1 Pine Resin 🍯</span>}
          </div>
        )}

        {phase === "result" && result && (
          <div className="relative flex flex-col items-center gap-1 py-1 text-center">
            {result.clean && (
              <div className="cozy-chips" aria-hidden>
                {CHIPS.map((c, i) => (
                  <span key={i} style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px`, "--spin": `${c.spin}deg`, animationDelay: `${c.delay}s` } as React.CSSProperties} />
                ))}
              </div>
            )}
            <div className="text-lg font-semibold">{result.clean ? (result.wood === "charcoal" ? `✨ Golden Charcoal! ${result.greens} of 3 in the green` : `🪵 The log splits! ${result.greens} of 3 in the green`) : result.stunned ? "💫 The axe bit a knot!" : `😅 Only ${result.greens} of 3 in the green`}</div>
            <div className={`text-sm ${result.clean ? "text-amber-200" : "opacity-70"}`}>
              {result.clean
                ? `+${result.pieces} ${WOOD[result.wood].name} ${WOOD[result.wood].emoji}${result.pieces > 1 ? " (bonus!)" : ""}${result.coins > 0 ? ` · +${result.coins} 🪙` : " (today's chopping coins are all earned)"} · burn it or sell it to Buster`
                : result.stunned
                  ? `Shake it off: the axe is ready again in ${CHOP_STUN_S}s`
                  : `The log holds: land ${CHOP_GREENS_TO_SPLIT} of the 3 in the green to split it`}
            </div>
          </div>
        )}

        {live ? (
          <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full max-w-[260px] text-[16px]" disabled={phase !== "stroke"} onPointerDown={(e) => strike(e.timeStamp || performance.now())}>
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
