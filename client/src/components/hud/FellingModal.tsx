import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CampfirePacket, FellResult } from "@shared/types";
import { COLOSSAL, KNOT_RECOVER_S, TREES, fellRing, isColossalKind, type FellMotion, type FellSwing, type FellVerdict, type TreeKind } from "@shared/chop";
import { fellTreeOf } from "@shared/worlds/trees";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { isTouchUi } from "../../systems/inputMode";
import { SAFE_AREA } from "./Modal";

// The Precision Radial Felling panel: a round dial over the tree's trunk, cut across (its bark, its
// growth rings, its heart). A timing ring contracts from the bark toward the heart, over and over;
// press when it meets the golden sweet-spot ring (Space or a click on the dial; on a touch screen, a
// tap anywhere). Its bright centre is a critical swing (now and then a coin or two, or a Pine
// Resin). Each swing that lands is a round: the notch, a radial sector cut in through the bark,
// deepens toward 70% of the trunk's radius on the last (0.7 x (round / rounds)^0.85: a two-round tree
// 40% then 70%, a five-round one 18, 32, 45, 58, 70%), chips fly, the round's drop
// comes (a log worth the tree's size squared, or the tier's by-product), and after a 0.4 s pause the
// next round's ring starts, the panel open all the while, until the last round brings it down. A miss
// only costs the time. Leave and the notch stays in the tree for whoever comes next.
// The finer trees are trickier (shared/chop.ts NOTCH_DEG): a narrower notch, a ring on a pendulum
// (T3), accelerating (T4) or pulsing (T5), and in a T4 or T5 trunk Wood Knots, red bands a swing
// glances off (a 0.4 s recovery; a T5 axe or the Wedge & Mallet Kit bites straight through, and
// the knots show faint). A Colossal is felled together: its crew's rounds all deepen the one notch,
// and when it falls each one's share of the haul shows here.
// The server rolls each ring and judges each swing (shared/chop.ts fellRing / judgeFell: the ring
// drawn here is placed by the same function); fellSwing hands over a ring, fellResult says how the
// swing landed.

interface Props {
  /** The tree's prop (`tree_<node id>`). */
  tree: string;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string;
  onClose: () => void;
}

type Phase = "starting" | "swing" | "judging" | "felled" | "refused";

/** Each kind's cross-section: bark, sapwood, heartwood, the growth rings' ink. */
const WOOD_LOOK: Record<TreeKind, { bark: string; barkDark: string; sap: string; heart: string; ring: string }> = {
  soft_pine: { bark: "#6b4a2f", barkDark: "#4a321f", sap: "#f1d9a4", heart: "#d9aa62", ring: "rgba(120,78,38,0.35)" },
  birch: { bark: "#ece6da", barkDark: "#2b2622", sap: "#f5ead2", heart: "#e2c79a", ring: "rgba(140,110,70,0.3)" },
  cedar: { bark: "#5a3322", barkDark: "#3b2016", sap: "#e8b58a", heart: "#b35a3a", ring: "rgba(110,45,25,0.4)" },
  maple: { bark: "#5e4633", barkDark: "#3e2e21", sap: "#f0d3a8", heart: "#c98f55", ring: "rgba(120,72,36,0.35)" },
  elderwood: { bark: "#3d4a45", barkDark: "#242d2a", sap: "#cfe6d8", heart: "#7fb9a4", ring: "rgba(40,90,80,0.4)" },
};
const CALLOUT: Record<FellVerdict, string> = { gold: "✨ Critical!", hit: "🪓 Thunk!", knot: "💥 Knot! Deflected", miss: "Missed…" };
/** How the ring moves, under the round's count. */
const MOTION_HINT: Record<FellMotion, string> = { loop: "", pendulum: "↔ pendulum ring", accel: "⏩ accelerating ring", pulse: "💓 pulsing ring" };

interface Chip {
  at: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  size: number;
  color: string;
}

export function FellingModal({ tree, send, subscribeMessages, localSessionId, onClose }: Props) {
  const node = fellTreeOf(tree);
  // (a Colossal clearing's tree is whichever Colossal rose there: its first ring says which)
  const [colossal, setColossal] = useState<TreeKind | null>(null);
  const kindNow: TreeKind = node?.titan ? (colossal ?? node.kind) : (node?.kind ?? "soft_pine");
  const info = node ? TREES[kindNow] : null;
  const name = node?.titan ? (colossal && isColossalKind(colossal) ? COLOSSAL[colossal].name : "Colossal") : (info?.name ?? "Tree");
  const [phase, setPhase] = useState<Phase>("starting");
  const [swing, setSwing] = useState<FellSwing | null>(null);
  const [dmg, setDmg] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [callout, setCallout] = useState<{ key: number; text: string; verdict: FellVerdict } | null>(null);
  const [haul, setHaul] = useState<{ key: number; lines: string[]; long?: boolean } | null>(null);
  const touch = isTouchUi();

  // what the frame loop and the key handler read: always the latest, never a stale closure
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const swingRef = useRef<(FellSwing & { at: number }) | null>(null);
  const dmgRef = useRef({ dmg: 0, rounds: 1 });
  const frozenAt = useRef<number | null>(null);
  const chips = useRef<Chip[]>([]);
  const missFlash = useRef(-99);
  const goldFlash = useRef(-99);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  // up to the tree: the first ring comes straight back (or a notice says why not)
  useEffect(() => {
    if (node) sendRef.current({ type: "CHOP_START", tree: node.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // no answer (a stump, the carrier full, the wrong axe: the notice says): the panel goes
  useEffect(() => {
    if (phase !== "starting" && phase !== "refused") return;
    const t = window.setTimeout(() => (phaseRef.current === "starting" ? setPhase("refused") : onClose()), phase === "starting" ? 2200 : 1400);
    return () => window.clearTimeout(t);
  }, [phase, onClose]);

  const burstChips = useCallback((gold: boolean) => {
    const now = performance.now() / 1000;
    const look = WOOD_LOOK[kindNow];
    for (let i = 0; i < (gold ? 22 : 14); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = 0.5 + Math.random() * 0.9;
      chips.current.push({ at: now, x: 0.92, y: 0, vx: Math.cos(a) * v + 0.4, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 18, size: 0.018 + Math.random() * 0.03, color: gold && i % 3 === 0 ? "#ffd35a" : Math.random() < 0.5 ? look.sap : look.heart });
    }
  }, [kindNow]);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "fellSwing" && payload?.tree === node?.id) {
          const s = payload as FellSwing & { pause?: number };
          const pause = Math.max(0, Number(s.pause) || 0);
          swingRef.current = { ...s, at: performance.now() + pause * 1000 };
          frozenAt.current = null;
          if (node?.titan) setColossal(s.kind);
          dmgRef.current = { dmg: s.round - 1, rounds: s.rounds };
          setSwing(s);
          setDmg(s.round - 1);
          setRounds(s.rounds);
          setPhase("swing");
        } else if (type === "fellStop" && payload?.tree === node?.id) {
          // the server let the tree go (idle too long, walked off): its notch stays; the panel goes
          swingRef.current = null;
          onClose();
        } else if (type === "fellResult" && (payload as FellResult).sessionId === localSessionId) {
          const r = payload as FellResult;
          dmgRef.current = { dmg: r.dmg, rounds: r.rounds };
          setDmg(r.dmg);
          setRounds(r.rounds);
          setCallout({ key: performance.now(), text: CALLOUT[r.verdict], verdict: r.verdict });
          if (r.verdict === "miss" || r.verdict === "knot") {
            missFlash.current = performance.now() / 1000 + (r.verdict === "knot" ? KNOT_RECOVER_S - 0.45 : 0);
            playSfx(r.verdict === "knot" ? "blocked" : "thunk");
          } else {
            playSfx(r.verdict === "gold" ? "crit" : "chop");
            if (r.verdict === "gold") goldFlash.current = performance.now() / 1000;
            burstChips(r.verdict === "gold");
          }
          const lines: string[] = [];
          if (r.drop.kind === "log") lines.push(`+${r.drop.count} ${r.drop.emoji} ${r.drop.name} log${r.drop.count > 1 ? "s" : ""}${r.drop.mult && r.drop.mult !== 1 ? ` ×${r.drop.mult.toFixed(2)}` : ""}`);
          else if (r.drop.kind === "byproduct") lines.push(`+${r.drop.count} ${r.drop.emoji} ${r.drop.name}`);
          if (r.drop.also) lines.push(`+1 ${r.drop.also.emoji} ${r.drop.also.name} (your resin band)`);
          if (r.grip) lines.push("🦾 Your gauntlets bit in: the notch still deepens");
          if (r.bonus === "resin") lines.push("+1 🍯 Pine Resin");
          if (r.share) {
            lines.push(`🌳 Your share of the ${r.share.name}${r.share.crew > 1 ? ` (a crew of ${r.share.crew})` : ""}:`);
            for (const x of r.share.extra) lines.push(`+${x.n} ${x.emoji} ${x.name}`);
            if (r.share.lost > 0) lines.push(`(${r.share.lost} more logs: no room in your carrier)`);
          }
          if (r.coins > 0) lines.push(`+${r.coins} 🪙`);
          if (r.felled && r.capped) lines.push("(today's felling coins all earned)");
          if (lines.length) setHaul({ key: performance.now(), lines, long: !!r.share });
          if (r.coins > 0) playSfx("coins");
          if (r.felled) {
            swingRef.current = null;
            setPhase("felled");
          }
        }
      }),
    [subscribeMessages, localSessionId, node, burstChips, onClose]
  );
  // down it came: the panel goes by itself
  useEffect(() => {
    if (phase !== "felled") return;
    const t = window.setTimeout(onClose, 1900);
    return () => window.clearTimeout(t);
  }, [phase, onClose]);

  /** A swing at `when` (the press's own timestamp, on the performance clock the ring runs on). */
  const strike = useCallback((when: number = performance.now()) => {
    const s = swingRef.current;
    if (phaseRef.current !== "swing" || !s) return;
    const t = (when - s.at) / 1000;
    if (t < 0) return; // (the round's pause: the ring hasn't started)
    frozenAt.current = t;
    setPhase("judging");
    sendRef.current({ type: "CHOP_STOP", t });
  }, []);
  const close = useCallback(() => {
    if (phaseRef.current === "swing" || phaseRef.current === "judging") sendRef.current({ type: "CHOP_CANCEL" });
    onClose();
  }, [onClose]);

  // Space or Enter swings; Escape leaves (the notch stays in the tree)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) strike(e.timeStamp || performance.now());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [strike, close]);

  // the dial, drawn every frame from the same ring function the server judges with
  useEffect(() => {
    let frame = 0;
    const kind = kindNow;
    const look = WOOD_LOOK[kind];
    const glowFx = node?.titan && isColossalKind(kind) ? COLOSSAL[kind].fx : null;
    // the growth rings: fixed per tree, a little wobbly
    let seed = 0;
    for (const c of node?.id ?? "x") seed = (seed * 31 + c.charCodeAt(0)) % 9973;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const growth = Array.from({ length: node?.titan ? 22 : 13 }, (_, i) => ({ r: 0.12 + (i / (node?.titan ? 22 : 13)) * 0.74 + rnd() * 0.02, wob: rnd() * 0.02, ph: rnd() * 6.28 }));
    const cracks = Array.from({ length: 5 }, () => ({ a: rnd() * Math.PI * 2, len: 0.25 + rnd() * 0.3 }));
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const cv = canvas.current;
      if (!cv) return;
      const css = cv.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(css * dpr)) {
        cv.width = Math.round(css * dpr);
        cv.height = Math.round(css * dpr);
      }
      const g = cv.getContext("2d");
      if (!g) return;
      const now = performance.now() / 1000;
      const W = cv.width;
      const R = W * 0.4;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, W);
      g.translate(W / 2, W / 2);
      // the bark: a jagged dark rim
      g.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const rr = R * (1.07 + 0.025 * Math.sin(a * 11 + 1.3) + 0.015 * Math.sin(a * 23));
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.fillStyle = look.barkDark;
      g.fill();
      g.beginPath();
      g.arc(0, 0, R * 1.03, 0, Math.PI * 2);
      g.fillStyle = look.bark;
      g.fill();
      if (glowFx) {
        // a Colossal's aura round its bark (silver, moss, gold or azure), breathing
        g.save();
        g.shadowColor = glowFx;
        g.shadowBlur = W * (0.04 + 0.02 * Math.sin(now * 2.2));
        g.strokeStyle = glowFx;
        g.globalAlpha = 0.55;
        g.lineWidth = Math.max(2, W * 0.012);
        g.beginPath();
        g.arc(0, 0, R * 1.1, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
      if (kind === "birch") {
        // a birch's black lenticels on its white bark
        g.fillStyle = look.barkDark;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + 0.2;
          g.save();
          g.rotate(a);
          g.fillRect(R * 0.99, -R * 0.03, R * 0.07, R * 0.06);
          g.restore();
        }
      }
      // the wood: sapwood to heartwood
      const grad = g.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
      grad.addColorStop(0, look.heart);
      grad.addColorStop(0.45, look.heart);
      grad.addColorStop(0.62, look.sap);
      grad.addColorStop(1, look.sap);
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      // the growth rings and the cracks
      g.strokeStyle = look.ring;
      g.lineWidth = Math.max(1, W * 0.004);
      for (const ring of growth) {
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          const rr = R * (ring.r + ring.wob * Math.sin(a * 3 + ring.ph));
          if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
      g.strokeStyle = "rgba(40,24,12,0.35)";
      for (const c of cracks) {
        g.beginPath();
        g.moveTo(Math.cos(c.a) * R * 0.08, Math.sin(c.a) * R * 0.08);
        g.lineTo(Math.cos(c.a + 0.05) * R * c.len, Math.sin(c.a + 0.05) * R * c.len);
        g.stroke();
      }
      // the notch: a radial sector cut in from the right, clean through the bark (its outer edge an
      // arc beyond the rim) to an apex inside the trunk; the tree comes down when it reaches 70% of
      // the radius, on the last round: 0.7 x (round / rounds)^0.85
      const { dmg: d, rounds: n } = dmgRef.current;
      const depth = n > 0 && d > 0 ? 0.7 * Math.pow(Math.min(1, d / n), 0.85) : 0;
      if (depth > 0) {
        const apex = R * (1 - depth);
        const outer = R * 1.1 + 4 * dpr;
        const half = 0.2 + depth * 0.45;
        g.beginPath();
        g.moveTo(apex, 0);
        g.lineTo(Math.cos(-half) * outer, Math.sin(-half) * outer);
        g.arc(0, 0, outer, -half, half);
        g.closePath();
        g.fillStyle = "#1c1410";
        g.fill();
        // the two cut faces, fresh sapwood, meeting at the apex
        g.beginPath();
        g.moveTo(Math.cos(-half) * R * 1.02, Math.sin(-half) * R * 1.02);
        g.lineTo(apex, 0);
        g.lineTo(Math.cos(half) * R * 1.02, Math.sin(half) * R * 1.02);
        g.strokeStyle = look.sap;
        g.lineWidth = Math.max(1.5, W * 0.006);
        g.lineJoin = "round";
        g.stroke();
      }
      const s = swingRef.current;
      if (s) {
        // the Wood Knots: dark red bands a swing glances off (faint when this axe bites through)
        for (const k of s.knots ?? []) {
          g.lineWidth = Math.max(3, 2 * k.w * R);
          g.strokeStyle = s.knotProof ? "rgba(120, 90, 80, 0.35)" : "rgba(170, 38, 34, 0.78)";
          g.beginPath();
          g.arc(0, 0, k.r * R, 0, Math.PI * 2);
          g.stroke();
          if (!s.knotProof) {
            // the knot's grain: a few dark whorls along the band
            g.fillStyle = "rgba(70, 14, 12, 0.85)";
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2 + k.r * 7;
              g.beginPath();
              g.ellipse(Math.cos(a) * k.r * R, Math.sin(a) * k.r * R, k.w * R * 0.9, k.w * R * 0.5, a, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
        // the sweet spot: a golden band, its bright gold centre
        g.lineWidth = Math.max(2, 2 * s.band * R);
        g.strokeStyle = "rgba(255, 196, 64, 0.38)";
        g.beginPath();
        g.arc(0, 0, s.sweet * R, 0, Math.PI * 2);
        g.stroke();
        const glow = Math.max(0, 1 - (now - goldFlash.current) / 0.5);
        g.lineWidth = Math.max(2, 2 * s.gold * R);
        g.strokeStyle = `rgba(255, ${214 + 30 * glow}, ${90 + 120 * glow}, 0.95)`;
        g.shadowColor = "#ffcf4a";
        g.shadowBlur = W * (0.02 + 0.04 * glow);
        g.beginPath();
        g.arc(0, 0, s.sweet * R, 0, Math.PI * 2);
        g.stroke();
        g.shadowBlur = 0;
        // the timing ring, closing in (held where it was struck while the swing is judged; at the
        // bark through a round's pause)
        const t = frozenAt.current ?? (performance.now() - s.at) / 1000;
        const rr = t < 0 ? 1 : fellRing(s, t);
        const miss = Math.max(0, 1 - (now - missFlash.current) / 0.45);
        g.lineWidth = Math.max(3, W * 0.014);
        g.strokeStyle = miss > 0 ? `rgba(255, ${120 - 60 * miss}, ${110 - 60 * miss}, 1)` : t < 0 ? "rgba(255,248,235,0.45)" : "#fff8eb";
        g.shadowColor = "rgba(255,248,235,0.8)";
        g.shadowBlur = W * 0.02;
        g.beginPath();
        g.arc(0, 0, Math.max(1, rr * R), 0, Math.PI * 2);
        g.stroke();
        g.shadowBlur = 0;
      }
      // the chips, flying off the notch
      const alive: Chip[] = [];
      for (const c of chips.current) {
        const age = now - c.at;
        if (age > 0.9) continue;
        alive.push(c);
        const x = (c.x + c.vx * age) * R;
        const y = (c.y + c.vy * age + 1.4 * age * age) * R;
        g.save();
        g.translate(x, y);
        g.rotate(c.spin * age);
        g.globalAlpha = Math.min(1, (0.9 - age) / 0.3);
        g.fillStyle = c.color;
        g.fillRect(-c.size * R, -c.size * R * 0.45, c.size * R * 2, c.size * R * 0.9);
        g.restore();
      }
      chips.current = alive;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [node, kindNow]);

  // the callout and the haul fade on their own
  useEffect(() => {
    if (!callout) return;
    const t = window.setTimeout(() => setCallout(null), 700);
    return () => window.clearTimeout(t);
  }, [callout]);
  useEffect(() => {
    if (!haul) return;
    const t = window.setTimeout(() => setHaul(null), haul.long ? 3200 : 1500);
    return () => window.clearTimeout(t);
  }, [haul]);

  if (!node || !info) return null;
  const tier = node.titan ? "Colossal" : `T${info.tier}`;
  const motion = swing && !node.titan ? MOTION_HINT[swing.motion] : "";
  const knots = swing && !node.titan && (swing.knots?.length ?? 0) > 0 ? (swing.knotProof ? "🪵 knots: your axe bites through" : `🪵 ${swing.knots.length} knot${swing.knots.length > 1 ? "s" : ""}: avoid the red`) : "";
  const status =
    phase === "starting"
      ? "Sizing up the trunk…"
      : phase === "refused"
        ? "Not this time (see the notice)"
        : phase === "felled"
          ? "Timber! 🌲"
          : `Round ${Math.min(rounds, dmg + 1)} of ${rounds}`;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1C1614]/60"
      style={{ ...SAFE_AREA, touchAction: "manipulation" }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // on a touch screen a tap anywhere is a swing (the ✕ closes); with a mouse, a click off
        // the dial leaves
        if (touch) {
          e.preventDefault();
          strike(e.timeStamp || performance.now());
        } else close();
      }}
      role="presentation"
    >
      <div role="dialog" aria-label={`Felling a ${name}`} className="clay-pop relative flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-[#4A3A30] bg-[#231B18]/90 py-1 pl-3 pr-1 shadow-lg">
          <span className="text-lg" aria-hidden>
            {node.titan ? "🌳" : "🪓"}
          </span>
          <b className="font-cozy text-sm text-[#F7EBE1]">
            {name} <span className="font-normal text-[#C9BDB5]">· {tier}</span>
          </b>
          <button type="button" onClick={close} className="clay-close clay-close-cozy" aria-label="Close">
            ✕
          </button>
        </div>
        <div
          className="relative aspect-square rounded-full border-4 border-[#4A3A30] bg-[#1f1814] shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_0_40px_rgba(0,0,0,0.6)]"
          style={{ width: "min(78vw, 58vh, 360px)", touchAction: "manipulation" }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            strike(e.timeStamp || performance.now());
          }}
        >
          <canvas ref={canvas} className="h-full w-full rounded-full" aria-hidden />
          {/* the rounds, as pips round the top */}
          <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: rounds }, (_, i) => (
              <span key={i} className={`h-3 w-3 rounded-full border border-[#2B201B] ${i < dmg ? "bg-[#F5A623] shadow-[0_0_6px_#F5A623]" : "bg-[#F7EBE1]/25"}`} />
            ))}
          </div>
          {callout && (
            <div key={callout.key} className={`clay-pop pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-base font-extrabold shadow ${callout.verdict === "gold" ? "bg-[#F5A623] text-[#2B201B]" : callout.verdict === "hit" ? "bg-[#231B18]/90 text-[#F7EBE1]" : "bg-rose-900/80 text-rose-100"}`}>
              {callout.text}
            </div>
          )}
          {haul && (
            <div key={haul.key} className="clay-pop pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5">
              {haul.lines.map((l) => (
                <span key={l} className="whitespace-nowrap rounded-full bg-[#231B18]/90 px-2.5 py-0.5 text-xs font-bold text-[#F7EBE1] shadow">
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#4A3A30] bg-[#231B18]/90 px-3 py-1.5 text-center text-xs text-[#C9BDB5] shadow">
          <b className="text-[#F7EBE1]">{status}</b>
          {(motion || knots) && (phase === "swing" || phase === "judging") ? <span className="text-[#F5C46B]"> · {[motion, knots].filter(Boolean).join(" · ")}</span> : null}
          {phase === "swing" || phase === "judging" ? (
            <>
              <span className="kbd-hint"> · Space or click when the ring meets the gold</span>
              <span className="touch-hint"> · Tap anywhere when the ring meets the gold</span>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
