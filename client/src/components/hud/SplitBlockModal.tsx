import { useCallback, useEffect, useRef, useState } from "react";
import type { CampfirePacket, SplitResult, SplitStrike, SplitSwingPacket } from "@shared/types";
import { FIREWOOD_FUEL, WOOD, WOOD_KINDS, type WoodKind } from "@shared/chop";
import type { FishingProfile } from "@shared/fishing";
import { BULK_MIN_LOGS, SPLIT_GOLD_BATCH, SPLIT_HIT_BATCH, splitGauge, type SplitVerdict } from "@shared/splitting";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { WoodsPermits } from "./LumberjackModal";
import { splitYield } from "@shared/gear";

// The splitting block by the campfire's woodpile: "The Clean Split", a rhythm game. A log stands on
// the block, the axe is raised, and beside them a vertical gauge's marker glides up and down over a
// golden sweet spot (shared/splitting.ts, the server's gauge drawn with its own functions). Space, a
// click or a tap strikes: on the gold a thunderous clean split (a batch of 3-5 logs and a bonus
// bundle of Firewood, chips flying), in the sweet spot a plain split (two logs), anywhere else a
// glancing blow (strike again). Clean strikes in a row quicken the gauge. The pills on top put a
// kind of wood on the block. With more than BULK_MIN_LOGS logs, Bulk Process All splits the whole
// carrier at once, at the plain yield. SPLIT_START / SPLIT_STRIKE / SPLIT_STOP, answered with
// splitSwing and splitStrike; SPLIT_WOOD (the bulk) and any refusal with splitResult.

/** Each wood's look on the block: its bark, the bark's shadow, the split face and its rings. */
const LOG_LOOK: Record<WoodKind, { bark: string; dark: string; face: string; ring: string }> = {
  pine: { bark: "#6b4a2f", dark: "#4a321f", face: "#f1d9a4", ring: "#c99a5c" },
  oak: { bark: "#5a4030", dark: "#3b2a1f", face: "#e2b57a", ring: "#a8743d" },
  charcoal: { bark: "#2e2622", dark: "#1a1412", face: "#5a463a", ring: "#f5a623" },
  birch: { bark: "#ece6da", dark: "#2b2622", face: "#f5ead2", ring: "#d8bf8f" },
  cedar: { bark: "#5a3322", dark: "#3b2016", face: "#e8b58a", ring: "#b35a3a" },
  maple: { bark: "#5e4633", dark: "#3e2e21", face: "#f0d3a8", ring: "#c98f55" },
  elderwood: { bark: "#3d4a45", dark: "#242d2a", face: "#cfe6d8", ring: "#7fb9a4" },
};
const CALLOUT: Record<SplitVerdict, string> = { gold: "💥 CLEAN SPLIT!", hit: "🪓 Split!", miss: "Glancing blow…" };

type Phase = "starting" | "swing" | "judging" | "idle";
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

const heldLogs = (p: FishingProfile) => WOOD_KINDS.reduce((sum, k) => sum + (p.wood[k] ?? 0), 0);

export function SplitBlockModal({ profile, send, subscribeMessages, onClose }: { profile: FishingProfile; send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const kinds = WOOD_KINDS.filter((k) => (profile.wood[k] ?? 0) > 0);
  const total = heldLogs(profile);
  const [pick, setPick] = useState<WoodKind | null>(kinds[0] ?? null);
  const [wood, setWood] = useState<WoodKind>(kinds[0] ?? "pine");
  const [phase, setPhase] = useState<Phase>("starting");
  const [streak, setStreak] = useState(0);
  const [bulk, setBulk] = useState(false);
  const [callout, setCallout] = useState<{ key: number; text: string; verdict: SplitVerdict } | null>(null);
  const [haul, setHaul] = useState<{ key: number; text: string } | null>(null);
  const [note, setNote] = useState<SplitResult | null>(null);
  // (the Forester's Toolbelt: half as many bundles again, as the server splits them)
  const yieldMul = splitYield(profile);
  const bulkBundles = WOOD_KINDS.reduce((sum, k) => sum + Math.round((profile.wood[k] ?? 0) * WOOD[k].firewood * yieldMul), 0);
  const canBulk = total > BULK_MIN_LOGS;

  // what the frame loop and the keys read: always the latest
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const swingRef = useRef<(SplitSwingPacket & { at: number }) | null>(null);
  // the marker where the strike stopped it (held through the pause, against its own swing's band)
  const frozen = useRef<{ v: number; verdict: SplitVerdict | null; swing: SplitSwingPacket & { at: number } } | null>(null);
  const woodRef = useRef(wood);
  woodRef.current = wood;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const totalRef = useRef(total);
  totalRef.current = total;
  const bulkRef = useRef(bulk);
  bulkRef.current = bulk && canBulk;
  const swingAt = useRef(-99); // the axe's last swing (s, performance clock)
  const swingKind = useRef<SplitVerdict | null>(null);
  const splitAt = useRef<{ at: number; gold: boolean; wood: WoodKind } | null>(null);
  // a fresh log goes on the block after a split (never after a glance): when it lands (ms)
  const splitPending = useRef(false);
  const logLandsAt = useRef(0);
  const chips = useRef<Chip[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  // up to the block: the first swing comes straight back
  useEffect(() => {
    if (kinds.length) sendRef.current({ type: "SPLIT_START", wood: kinds[0] });
    else setPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = useCallback(() => {
    sendRef.current({ type: "SPLIT_STOP" });
    onClose();
  }, [onClose]);
  const choose = (k: WoodKind) => {
    setPick(k);
    if (phaseRef.current === "judging") return;
    setPhase("starting");
    sendRef.current({ type: "SPLIT_START", wood: k });
  };

  const burst = useCallback((gold: boolean, k: WoodKind) => {
    const now = performance.now() / 1000;
    const look = LOG_LOOK[k];
    for (let i = 0; i < (gold ? 30 : 14); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 0.35 + Math.random() * (gold ? 0.9 : 0.55);
      chips.current.push({ at: now, x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 20, size: 0.012 + Math.random() * 0.022, color: gold && i % 3 === 0 ? "#ffd35a" : Math.random() < 0.5 ? look.face : look.ring });
    }
  }, []);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "splitSwing") {
          const s = payload as SplitSwingPacket;
          const pause = Math.max(0, Number(s.pause) || 0);
          swingRef.current = { ...s, at: performance.now() + pause * 1000 };
          if (splitPending.current) {
            splitPending.current = false;
            logLandsAt.current = swingRef.current.at;
          }
          setWood(s.wood);
          setPhase("swing");
        } else if (type === "splitStrike") {
          const r = payload as SplitStrike;
          const now = performance.now() / 1000;
          setStreak(r.streak);
          setCallout({ key: performance.now(), text: CALLOUT[r.verdict], verdict: r.verdict });
          if (frozen.current) frozen.current.verdict = r.verdict;
          swingKind.current = r.verdict;
          if (r.verdict === "miss") playSfx("glance");
          else {
            splitAt.current = { at: now, gold: r.verdict === "gold", wood: r.wood };
            splitPending.current = r.left > 0;
            // (the carrier's last: nothing goes on the block while the halves fall away)
            if (r.left <= 0) logLandsAt.current = performance.now() + 1200;
            burst(r.verdict === "gold", r.wood);
            if (r.verdict === "gold") {
              playSfx("bigSplit");
              playSfx("crit", 0.7);
            } else playSfx("chop");
            setHaul({ key: performance.now(), text: `+${r.bundles} 🪵 from ${r.logs} log${r.logs > 1 ? "s" : ""}${r.bonus ? ` · +${r.bonus} bonus bundle` : ""}` });
          }
          if (r.left <= 0) {
            swingRef.current = null;
            setPhase("idle");
          }
        } else if (type === "splitResult") {
          const r = payload as SplitResult;
          setNote(r);
          swingRef.current = null;
          setPhase("idle");
          if (r.ok) {
            // Bulk Process All: the whole stack at once
            playSfx("bigSplit");
            setBulk(false);
          }
        }
      }),
    [subscribeMessages, burst]
  );
  useEffect(() => {
    if (phase !== "judging") return;
    const t = window.setTimeout(() => {
      swingRef.current = null;
      setPhase("idle");
    }, 2500);
    return () => window.clearTimeout(t);
  }, [phase]);
  // the strike's word and its haul, for a moment each
  useEffect(() => {
    if (!callout) return;
    const t = window.setTimeout(() => setCallout(null), 1400);
    return () => window.clearTimeout(t);
  }, [callout]);
  useEffect(() => {
    if (!haul) return;
    const t = window.setTimeout(() => setHaul(null), 2200);
    return () => window.clearTimeout(t);
  }, [haul]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 3200);
    return () => window.clearTimeout(t);
  }, [note]);

  /** A strike at `when` (the press's own timestamp, on the clock the gauge runs on). */
  const strike = useCallback((when: number = performance.now()) => {
    if (bulkRef.current) return;
    if (phaseRef.current === "idle") {
      // the block let go (or never started): pick the axe up again
      if (totalRef.current > 0) {
        setPhase("starting");
        sendRef.current({ type: "SPLIT_START", wood: pickRef.current ?? undefined });
      }
      return;
    }
    const s = swingRef.current;
    if (phaseRef.current !== "swing" || !s) return;
    const t = (when - s.at) / 1000;
    if (t < 0) return; // (the pause after a strike: a fresh log is going on)
    frozen.current = { v: splitGauge(s, t), verdict: null, swing: s };
    swingAt.current = when / 1000;
    swingKind.current = null;
    setPhase("judging");
    sendRef.current({ type: "SPLIT_STRIKE", t });
  }, []);

  // Space or Enter strikes (never while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) strike(e.timeStamp || performance.now());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [strike]);

  // the block, the log, the axe and the gauge, drawn every frame
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const cv = canvas.current;
      if (!cv) return;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const g = cv.getContext("2d");
      if (!g) return;
      const now = performance.now() / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const split = splitAt.current;
      const sinceSplit = split ? now - split.at : 99;
      // a clean split shakes the stage for a beat
      if (split?.gold && sinceSplit < 0.28) {
        const k = 1 - sinceSplit / 0.28;
        g.translate((Math.random() - 0.5) * 9 * k, (Math.random() - 0.5) * 7 * k);
      }

      // the stage: a warm glow on the ground
      const gaugeW = Math.max(22, W * 0.06);
      const gx = W - gaugeW - Math.max(16, W * 0.05);
      const cx = (gx - 12) * 0.5;
      const ground = H * 0.88;
      const glow = g.createRadialGradient(cx, ground - H * 0.1, 10, cx, ground - H * 0.1, W * 0.55);
      glow.addColorStop(0, "rgba(245,166,35,0.16)");
      glow.addColorStop(1, "rgba(245,166,35,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, gx, H);

      // the chopping block: a wide stump, its top ringed
      const unit = Math.min(cx * 0.9, H * 0.42);
      const brx = unit * 0.62;
      const bry = brx * 0.3;
      const btop = ground - H * 0.17;
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(cx, ground + 2, brx * 1.25, bry * 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#4a321f";
      g.beginPath();
      g.moveTo(cx - brx, btop);
      g.lineTo(cx - brx * 1.04, ground);
      g.ellipse(cx, ground, brx * 1.04, bry, 0, Math.PI, 0, true);
      g.lineTo(cx + brx, btop);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(cx + (i / 3.6) * brx, btop + bry * 0.8);
        g.lineTo(cx + (i / 3.5) * brx * 1.03, ground + bry * 0.6);
        g.stroke();
      }
      g.fillStyle = "#c89a5c";
      g.beginPath();
      g.ellipse(cx, btop, brx, bry, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(90,58,30,0.45)";
      g.lineWidth = 1.5;
      for (let r = 0.25; r < 1; r += 0.22) {
        g.beginPath();
        g.ellipse(cx, btop, brx * r, bry * r, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // (the axe's old scars on the block)
      g.strokeStyle = "rgba(60,36,18,0.6)";
      g.beginPath();
      g.moveTo(cx - brx * 0.5, btop - bry * 0.2);
      g.lineTo(cx - brx * 0.2, btop + bry * 0.3);
      g.moveTo(cx + brx * 0.3, btop - bry * 0.4);
      g.lineTo(cx + brx * 0.55, btop - bry * 0.05);
      g.stroke();

      // the log on the block: a fresh one drops on as the gauge sets off
      const lrx = brx * 0.5;
      const lry = lrx * 0.3;
      const lh = unit * 0.78;
      const s = swingRef.current;
      const hasLog = phaseRef.current !== "idle" || totalRef.current > 0;
      const drop = Math.min(1, Math.max(0, (performance.now() - (logLandsAt.current - 260)) / 260));
      // (the next log goes on as the next swing's pause ends; with none coming, once the halves are gone)
      const nextLog = !split || sinceSplit > 1.2 || (splitPending.current ? false : performance.now() >= logLandsAt.current - 260);
      const look = LOG_LOOK[woodRef.current];
      const drawHalf = (side: -1 | 1, dx: number, dy: number, rot: number, alpha: number, lk: typeof look) => {
        g.save();
        g.globalAlpha = alpha;
        g.translate(cx + dx, btop + dy);
        g.rotate(rot);
        const x0 = side < 0 ? -lrx : 0;
        const x1 = side < 0 ? 0 : lrx;
        // bark
        g.fillStyle = lk.bark;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0, -lh);
        g.lineTo(x1, -lh);
        g.lineTo(x1, 0);
        g.closePath();
        g.fill();
        g.fillStyle = lk.dark;
        g.globalAlpha = alpha * 0.55;
        for (let i = 0; i < 3; i++) g.fillRect(x0 + ((i + 0.3) / 3) * (x1 - x0), -lh * (0.85 - i * 0.2), 2.5, lh * 0.35);
        g.globalAlpha = alpha;
        // the split face: the pale heartwood, split down the middle
        g.fillStyle = lk.face;
        g.fillRect(side < 0 ? -3 : 0, -lh, 3, lh);
        // the end grain on top
        g.fillStyle = lk.face;
        g.beginPath();
        g.ellipse(0, -lh, lrx, lry, 0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
        g.fill();
        g.strokeStyle = lk.ring;
        g.lineWidth = 1.2;
        for (let r = 0.3; r < 1; r += 0.25) {
          g.beginPath();
          g.ellipse(0, -lh, lrx * r, lry * r, 0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
          g.stroke();
        }
        g.restore();
      };
      if (split && sinceSplit < 1.2) {
        // the halves fall away (a clean split flings them)
        const k = Math.min(1, sinceSplit / (split.gold ? 0.45 : 0.55));
        const ease = 1 - (1 - k) * (1 - k);
        const reach = split.gold ? lrx * 2.4 : lrx * 1.1;
        const tilt = split.gold ? 1.35 : 0.6;
        const fall = split.gold ? Math.max(0, sinceSplit - 0.25) * 60 : 0;
        const alpha = sinceSplit < 0.7 ? 1 : Math.max(0, 1 - (sinceSplit - 0.7) / 0.5);
        drawHalf(-1, -reach * ease, fall, -tilt * ease, alpha, LOG_LOOK[split.wood]);
        drawHalf(1, reach * ease, fall, tilt * ease, alpha, LOG_LOOK[split.wood]);
      }
      if (hasLog && nextLog) {
        // the whole log (a glancing blow sets it rocking)
        const dy = -(1 - drop) * H * 0.5;
        const sinceSwing = now - swingAt.current;
        const rock = swingKind.current === "miss" && sinceSwing < 0.5 ? Math.sin(sinceSwing * 40) * 0.06 * (1 - sinceSwing / 0.5) : 0;
        g.save();
        g.translate(cx, btop + dy);
        g.rotate(rock);
        g.translate(-cx, -btop);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.ellipse(cx, btop + 1, lrx * 1.1, lry * 1.1, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = look.bark;
        g.fillRect(cx - lrx, btop - lh, lrx * 2, lh);
        g.beginPath();
        g.ellipse(cx, btop, lrx, lry, 0, 0, Math.PI);
        g.fill();
        // the bark's grooves (and a birch's dark marks)
        g.fillStyle = look.dark;
        g.globalAlpha = 0.5;
        for (let i = 0; i < 6; i++) {
          const x = cx - lrx + ((i + 0.5) / 6) * lrx * 2;
          g.fillRect(x - 1.2, btop - lh * (0.92 - (i % 3) * 0.18), 2.4, lh * (0.3 + (i % 2) * 0.2));
        }
        g.globalAlpha = 1;
        // the shading round the trunk
        const shade = g.createLinearGradient(cx - lrx, 0, cx + lrx, 0);
        shade.addColorStop(0, "rgba(0,0,0,0.35)");
        shade.addColorStop(0.35, "rgba(255,255,255,0.06)");
        shade.addColorStop(1, "rgba(0,0,0,0.3)");
        g.fillStyle = shade;
        g.fillRect(cx - lrx, btop - lh, lrx * 2, lh);
        // the end grain on top
        g.fillStyle = look.face;
        g.beginPath();
        g.ellipse(cx, btop - lh, lrx, lry, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = look.ring;
        g.lineWidth = 1.2;
        for (let r = 0.25; r < 1; r += 0.22) {
          g.beginPath();
          g.ellipse(cx, btop - lh, lrx * r, lry * r, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }

      // the axe: raised over the log, swung down on a strike (a glancing blow bounces off the rim)
      const px = cx + lrx * 2.5;
      const py = btop - lh * 0.4;
      const headX = cx + lrx * 0.1;
      const headY = btop - lh - lry * 0.2;
      const len = Math.hypot(headX - px, headY - py);
      const aDown = Math.atan2(headY - py, headX - px);
      // (raised: straight up over the pivot, leaning back a touch toward the log, clear of the gauge)
      const aUp = -Math.PI / 2 - 0.12;
      const sw = now - swingAt.current;
      const miss = swingKind.current === "miss";
      let k: number;
      if (sw < 0.08) k = (sw / 0.08) ** 2;
      else if (sw < (miss ? 0.14 : 0.24)) k = miss ? 0.86 : 1;
      else if (sw < 0.6) k = (miss ? 0.86 : 1) * (1 - (sw - (miss ? 0.14 : 0.24)) / (miss ? 0.46 : 0.36)) ** 2;
      else k = 0;
      const bob = phaseRef.current === "swing" && sw > 0.6 ? Math.sin(now * 3) * 0.03 : 0;
      const a = aUp + (aDown - aUp) * Math.max(0, Math.min(1, k)) + bob;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      // the haft
      g.fillStyle = "#8a5a32";
      g.strokeStyle = "#4a2e18";
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(-len * 0.35, -4.5, len * 1.35, 9, 4);
      g.fill();
      g.stroke();
      g.fillStyle = "#6b4226";
      g.fillRect(-len * 0.3, -4.5, len * 0.25, 9);
      // the head, its edge facing the swing
      g.translate(len, 0);
      const hs = unit * 0.2;
      g.fillStyle = "#9aa3ad";
      g.strokeStyle = "#3a3f46";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-hs * 0.35, -hs * 0.2);
      g.lineTo(hs * 0.35, -hs * 0.2);
      g.lineTo(hs * 0.6, hs * 0.85);
      g.quadraticCurveTo(0, hs * 1.05, -hs * 0.6, hs * 0.85);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#e6ecf2";
      g.beginPath();
      g.moveTo(hs * 0.52, hs * 0.72);
      g.quadraticCurveTo(0, hs * 0.92, -hs * 0.52, hs * 0.72);
      g.lineTo(-hs * 0.6, hs * 0.85);
      g.quadraticCurveTo(0, hs * 1.05, hs * 0.6, hs * 0.85);
      g.closePath();
      g.fill();
      g.fillStyle = "#5b636c";
      g.fillRect(-hs * 0.38, -hs * 0.45, hs * 0.76, hs * 0.3);
      g.restore();
      // (a glancing blow's spark off the rim)
      if (miss && sw < 0.25) {
        g.strokeStyle = `rgba(255,230,160,${1 - sw / 0.25})`;
        g.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const an = -Math.PI * 0.2 - i * 0.35;
          g.beginPath();
          g.moveTo(headX + lrx * 0.6, headY);
          g.lineTo(headX + lrx * 0.6 + Math.cos(an) * (10 + sw * 80), headY + Math.sin(an) * (10 + sw * 80));
          g.stroke();
        }
      }

      // the chips of a split, flying off the block
      chips.current = chips.current.filter((c) => now - c.at < 1.1);
      for (const c of chips.current) {
        const t = now - c.at;
        const x = cx + (c.x + c.vx * t) * unit;
        const y = btop - lh * 0.6 + (c.y + c.vy * t + 1.1 * t * t) * unit;
        g.save();
        g.globalAlpha = Math.max(0, 1 - t / 1.1);
        g.translate(x, y);
        g.rotate(c.spin * t);
        g.fillStyle = c.color;
        g.fillRect(-c.size * unit, -c.size * unit * 0.4, c.size * unit * 2, c.size * unit * 0.8);
        g.restore();
      }
      if (split?.gold && sinceSplit < 0.35) {
        // a gold flash on the clean split
        g.fillStyle = `rgba(255,211,90,${0.35 * (1 - sinceSplit / 0.35)})`;
        g.fillRect(-10, -10, W + 20, H + 20);
      }

      // the gauge: a tall slot, the golden sweet spot, the gold at its heart, the gliding marker
      const top = H * 0.08;
      const bot = H * 0.92;
      const yOf = (v: number) => bot - v * (bot - top);
      g.fillStyle = "#1a1310";
      g.strokeStyle = "#4A3A30";
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(gx, top - 4, gaugeW, bot - top + 8, gaugeW / 2);
      g.fill();
      g.stroke();
      // (a new swing takes over from the stopped marker once its pause is over)
      if (frozen.current && frozen.current.swing !== s && (!s || performance.now() >= s.at)) frozen.current = null;
      const shown = frozen.current?.swing ?? s;
      if (shown) {
        const s = shown;
        const band = g.createLinearGradient(0, yOf(s.sweet + s.band), 0, yOf(s.sweet - s.band));
        band.addColorStop(0, "rgba(245,166,35,0.15)");
        band.addColorStop(0.5, "rgba(245,166,35,0.55)");
        band.addColorStop(1, "rgba(245,166,35,0.15)");
        g.fillStyle = band;
        g.fillRect(gx + 3, yOf(s.sweet + s.band), gaugeW - 6, yOf(s.sweet - s.band) - yOf(s.sweet + s.band));
        g.fillStyle = "#ffd35a";
        g.shadowColor = "#ffd35a";
        g.shadowBlur = 10;
        g.fillRect(gx + 3, yOf(s.sweet + s.gold), gaugeW - 6, yOf(s.sweet - s.gold) - yOf(s.sweet + s.gold));
        g.shadowBlur = 0;
        const f = frozen.current;
        const t = (performance.now() - s.at) / 1000;
        const v = f ? f.v : t < 0 ? 0 : splitGauge(s, t);
        const y = yOf(v);
        const tone = f?.verdict === "gold" ? "#ffd35a" : f?.verdict === "hit" ? "#F7EBE1" : f?.verdict === "miss" ? "#fb7185" : "#F7EBE1";
        g.fillStyle = tone;
        g.shadowColor = tone;
        g.shadowBlur = 8;
        g.fillRect(gx - 5, y - 2.5, gaugeW + 10, 5);
        g.beginPath();
        g.moveTo(gx - 6, y - 8);
        g.lineTo(gx - 6, y + 8);
        g.lineTo(gx + 3, y);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const noLogs = total === 0;
  return (
    <Modal title="Splitting Block" icon="🪓" onClose={close} width={500} pinned fixedHeight={600}>
      {/* the wood on the block (a swipeable row) and the Firewood beside the carrier */}
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <div className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto whitespace-nowrap" style={{ gap: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }} role="tablist" aria-label="Wood on the block">
          {kinds.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={wood === k} onClick={() => choose(k)} className={`min-h-9 shrink-0 rounded-full px-3 font-bold transition-transform active:scale-95 ${wood === k ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`} title={`${WOOD[k].name}: each log splits into ${Math.round(WOOD[k].firewood * yieldMul * 10) / 10} bundles${yieldMul > 1 ? " (your toolbelt)" : ""}`}>
              <span className="text-[12px]">
                {WOOD[k].emoji} ×{profile.wood[k]}
              </span>
            </button>
          ))}
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold text-[#F7EBE1]" title={`Firewood bundles: each feeds the bonfire +${FIREWOOD_FUEL}% (no carrier slots)`}>
          🪵 {profile.firewood}
        </span>
      </div>

      {/* the stage: strike anywhere on it (a click, a tap) or with Space */}
      <div
        className="relative min-h-0 flex-1 select-none overflow-hidden rounded-2xl border border-[#4A3A30] bg-gradient-to-b from-[#2a201b] to-[#1c1512] shadow-[inset_0_0_40px_rgba(0,0,0,0.55)]"
        style={{ touchAction: "manipulation", cursor: noLogs || bulk ? "default" : "pointer" }}
        onPointerDown={(e) => {
          if (e.button !== 0 || noLogs) return;
          e.preventDefault();
          strike(e.timeStamp || performance.now());
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
        {callout && (
          <div key={callout.key} className={`clay-pop pointer-events-none absolute left-[40%] top-[14%] -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 font-extrabold shadow ${callout.verdict === "gold" ? "bg-[#F5A623] text-lg text-[#2B201B] shadow-[0_0_18px_rgba(255,211,90,0.7)]" : callout.verdict === "hit" ? "bg-[#231B18]/90 text-base text-[#F7EBE1]" : "bg-rose-900/80 text-base text-rose-100"}`}>
            {callout.text}
          </div>
        )}
        {haul && (
          <div key={haul.key} className="clay-pop pointer-events-none absolute bottom-3 left-[40%] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#231B18]/90 px-2.5 py-0.5 text-xs font-bold text-[#F7EBE1] shadow">
            {haul.text}
          </div>
        )}
        {noLogs && (
          <p className="pointer-events-none absolute inset-x-4 bottom-4 m-0 rounded-2xl bg-[#1C1614]/80 px-3 py-2 text-center text-sm opacity-90">No logs in your carrier. Fell a Soft Pine round the clearing, or a tree in the Whispering Woods.</p>
        )}
        {!noLogs && phase === "idle" && !bulk && (
          <p className="pointer-events-none absolute inset-x-4 top-4 m-0 text-center text-sm font-semibold text-[#F7EBE1]/85">
            <span className="kbd-hint">Space or click</span>
            <span className="touch-hint">Tap</span> to pick up the axe
          </p>
        )}
        {bulk && canBulk && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1C1614]/75 p-4" onPointerDown={(e) => e.stopPropagation()}>
            <div className="clay-pop flex max-w-[320px] flex-col items-center gap-2 rounded-2xl border border-[#4A3A30] bg-[#2B201B] px-4 py-3 text-center shadow-lg">
              <b className="text-base text-[#F7EBE1]">📦 Bulk Process All</b>
              <span className="text-[12.5px] leading-snug opacity-85">
                Split all {total} logs at once into {bulkBundles} bundles of Firewood. The plain yield: no clean-split batches, no bonus bundles.
              </span>
              <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full" onClick={() => send({ type: "SPLIT_WOOD" })}>
                <span className="text-sm">🪓 Split all {total} logs</span>
              </button>
            </div>
          </div>
        )}
        {note && (
          <div key={note.message} className={`clay-pop pointer-events-none absolute left-1/2 top-3 z-10 max-w-[90%] -translate-x-1/2 rounded-2xl px-3 py-1.5 text-center text-[12.5px] font-semibold shadow-lg ${note.ok ? "bg-[#2B201B] text-[#F7EBE1] ring-1 ring-[#F5A623]/60" : "bg-rose-950/95 text-rose-100 ring-1 ring-rose-300/50"}`} role="status">
            {note.message}
          </div>
        )}
      </div>

      {/* the foot: the rhythm, the key, and (a big stack) Bulk Process All */}
      <div className="flex shrink-0 items-center justify-between gap-2 pt-2">
        <span className="min-w-0 text-[11px] leading-tight opacity-75">
          {streak > 1 ? <b className="text-amber-200">🔥 {streak} in a row · </b> : null}
          <span className="kbd-hint">Space</span>
          <span className="touch-hint">Tap</span> on the gold: {SPLIT_GOLD_BATCH[0]}-{SPLIT_GOLD_BATCH[1]} logs + a bonus bundle · sweet spot: {SPLIT_HIT_BATCH}
        </span>
        {canBulk && (
          <button type="button" aria-pressed={bulk} onClick={() => setBulk((b) => !b)} className={`min-h-9 shrink-0 rounded-full border px-3 font-bold transition-colors ${bulk ? "border-[#F5A623] bg-[#F5A623] text-[#2B201B]" : "border-white/15 bg-white/10 text-[#F7EBE1] hover:bg-white/15"}`}>
            <span className="whitespace-nowrap text-[12px]">📦 Bulk Process All</span>
          </button>
        )}
      </div>
    </Modal>
  );
}

/** The archway into the woods, without a permit: Buster's permits, sold right there. */
export function PermitsModal({ profile, coins, send, subscribeMessages, onEnter, onClose }: { profile: FishingProfile; coins: number; send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onEnter: () => void; onClose: () => void }) {
  const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as { ok: boolean; message: string; coins: number };
        setSay({ text: r.message, ok: r.ok });
        if (r.ok) playSfx("chime");
      }),
    [subscribeMessages]
  );
  const canGo = profile.ranger || profile.dayPermits > 0;
  return (
    <Modal title="The Whispering Woods" icon="🌲" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="m-0 text-center text-sm opacity-85">A hand-painted sign on the archway: “Beyond, the Whispering Woods. Permits by order of the Ranger.”</p>
        <WoodsPermits profile={profile} coins={coins} send={send} />
        {say && (
          <p key={say.text} className={`clay-pop m-0 text-center text-sm ${say.ok ? "text-[#F5A623]" : "text-rose-300"}`} role="status">
            {say.text}
          </p>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-base" disabled={!canGo} onClick={onEnter}>
          🌲 Walk into the woods
        </button>
      </div>
    </Modal>
  );
}
