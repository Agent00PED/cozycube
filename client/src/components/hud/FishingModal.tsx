import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { REEL_SECONDS, type SwimPattern } from "@shared/types";
import { BOSS_TELEGRAPH_S } from "@shared/fishing";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Fishing 2.0: the Stardew-style reel in two panes. On the left, the water: the fish is only a
// shadow pulling against the line (how big it looks is all you know), drawn toward the surface as
// the catch fills and running free when it slips the bar. On the right, the column: hold (the
// button, a press on the column, or Space) to lift the green catch bar, let go and it falls; while
// the fish is inside it the catch fills, outside it drains and the line's tension climbs. Full:
// landed, a fanfare, and only then is it revealed (a campfire fish turning on a stand, its name,
// tier, length and weight). Empty, snapped or out of time: it got away, still a mystery.
//
// Each fish swims its own way (`pattern`): a lazy sine wave, rhythmic plunges, erratic jerks, or
// a koi's quick darts (a smaller bar). Sometimes a Sunken Treasure Chest drifts into the column:
// hold the bar over it until it opens for a bonus. The server only learns the outcome; it pays.
//
// A boss fish (a legendary or a mythic) fights on a smaller green with fake runs and thrashing, but
// every fake run is telegraphed: 0.3 s before it lunges a ❗ flashes over the fish and the column's
// border pulses red. The finest rods soften it (RodPerk): the Starlight Dampener's darts 25% slower,
// the Abyssal Tether's 35% slower with 40% fewer fake runs and one Snap Shield (the line holds once at
// breaking point: its tension knocked back, a shield bursting over the column).

// the column is sized so the whole reel fits the screen (the modal never scrolls)
const BAR_H = 250;
const BAR_MIN = 150;
const REEL_CHROME = 170;
const ZONE_H = 58;
const FISH_H = 22;
/** The bar's physics, in px/s²: lifted while held, pulled down by gravity otherwise. */
const GRAVITY = 645;
const LIFT = 1180;
/** How lively the fish swim, and how hard an erratic one kicks. */
const SWIM = 0.7;
/** Extra seconds a line holds, from slack to snapping, while the fish runs free (after the rod's
 *  tension window: the time it may run out of the green before the tension starts to climb). */
const TENSION_GRACE_S = 1.0;

const FishViewer = lazy(() => import("./FishViewer"));

/** What is on the line, as the reel shows it. */
export interface FishProfile {
  emoji: string;
  name: string;
  /** How lively: how often and how far it darts, how fast it swims there. */
  speed: number;
  /** How heavy: how fast the meter drains while it is out of the bar. */
  size: number;
  /** A line under "Hooked" while it is still a mystery. */
  hint: string;
  /** Coins it pays when landed (shown on the result). */
  reward?: number;
  /** How it swims (a steady darting fish when unset). */
  pattern?: SwimPattern;
  /** The green bar's height, 1 = full. */
  barScale?: number;
  /** A Sunken Treasure Chest turns up in this reel. */
  treasure?: boolean;
  /** Coins the chest pays, if opened (shown on the result). */
  treasureReward?: number;
  /** A difficulty word under the fish (shown only once it is landed when `shadow` is set). */
  tier?: string;
  /** The rod's grip on the line: tension builds this much slower (0.35: 35%). */
  tensionResist?: number;
  /** How long the fish may run out of the green before the tension starts to climb (s). */
  tensionWindow?: number;
  /** A boss fish (a legendary or a mythic): fake runs (a feint to one end, snapping back, each
   *  telegraphed BOSS_TELEGRAPH_S ahead) and thrashing; its green is small (barScale). */
  boss?: boolean;
  /** The rod's passive against it: its darts this much slower, its fake runs this much rarer, this
   *  many snaps forgiven; and its name, for the corner. */
  dart?: number;
  feints?: number;
  shields?: number;
  perk?: string;
  /** A line under the name once it is landed (its length and stars). */
  detail?: string;
  /** The anti-spoiler: the fish is only a shadow this big (0.1-1) until it is landed, and its
   *  name, look and tier wait for `reveal`. */
  shadow?: number;
}

/** A landed campfire fish, as the server told it (the reveal). */
export interface FishReveal {
  species: string;
  name: string;
  emoji: string;
  tier: string;
  tierColor: string;
  cm: number;
  kg: number;
  stars: string;
  record: boolean;
  king: boolean;
  released: boolean;
  /** A legendary or a mythic: locked the moment it lands (no Sell All takes it). */
  locked?: boolean;
}

interface Props {
  fish: FishProfile;
  onResult: (result: "caught" | "lost", quality: number, openedChest: boolean) => void;
  onClose: () => void;
  /** Close by itself this long after the result (after the reveal, when there is one). */
  autoCloseMs?: number;
  /** The landed fish (anti-spoiler reels): null until the server says what it was. */
  reveal?: FishReveal | null;
  /** The server did not take the catch (it slipped the hook at the last moment). */
  escaped?: boolean;
}

const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  x: Math.cos((i / 26) * Math.PI * 2) * (70 + (i % 3) * 26),
  y: Math.sin((i / 26) * Math.PI * 2) * (46 + (i % 4) * 16) - 30,
  color: ["#F5A623", "#8fd3b6", "#ec7fa3", "#9ecbff", "#F7EBE1"][i % 5],
  delay: (i % 5) * 0.04,
  spin: (i % 2 ? 1 : -1) * (180 + i * 20),
}));

interface ReelView {
  zoneY: number;
  fishY: number;
  meter: number;
  inZone: boolean;
  timeLeft: number;
  tension: number;
  chestY: number;
  chest: number;
  chestOpen: boolean;
}

export function FishingModal({ fish, onResult, onClose, autoCloseMs, reveal, escaped = false }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const barH = useMemo(() => Math.round(Math.max(BAR_MIN, Math.min(BAR_H, window.innerHeight * 0.85 - REEL_CHROME))), []);
  const scale = barH / BAR_H;
  const zoneH = Math.round(ZONE_H * scale * (fish.barScale ?? 1));
  const mystery = fish.shadow !== undefined;
  const [view, setView] = useState<ReelView>({ zoneY: barH - zoneH, fishY: barH / 2, meter: 0.3, inZone: false, timeLeft: REEL_SECONDS, tension: 0, chestY: -1, chest: 0, chestOpen: false });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [done, setDone] = useState<"caught" | "lost" | null>(null);
  const [snapped, setSnapped] = useState(false);
  const holding = useRef(false);
  const sim = useRef({ zoneY: barH - zoneH, zoneV: 0, fishY: barH / 2, fishV: 0, fishTarget: barH / 2, meter: 0.3, inTime: 0, total: 0, t: 0, nextDart: 0.6, plunge: -1, tension: 0, warnAt: 0, chestAt: 2.5 + Math.random() * 2, chestY: -1, chest: 0, chestOpen: false, chestGone: 0, outFor: 0, nextFeint: 1.2 + Math.random(), feintUntil: 0, feintBack: 0, shields: fish.shields ?? 0 });
  /** The fake run coming (its ❗ and the column's red pulse), and a Snap Shield bursting. */
  const [telegraph, setTelegraph] = useState(false);
  const [shieldBurst, setShieldBurst] = useState(0);
  /** The boss's darts and fake runs, as the rod's passive softens them. */
  const dartMul = 1 - Math.max(0, Math.min(0.9, fish.dart ?? 0));
  const feintGap = 1 / (1 - Math.max(0, Math.min(0.9, fish.feints ?? 0)));
  const doneRef = useRef(false);
  const telegraphRef = useRef(false);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  // Space holds too (and never reaches the game underneath: it would stand you up)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      e.stopPropagation();
      holding.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") holding.current = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      s.t += dt;
      // the catch bar: lifted while held, falls otherwise, bounces a little at the ends
      s.zoneV += (holding.current ? -LIFT : GRAVITY) * scale * dt;
      s.zoneV *= 0.955;
      s.zoneY += s.zoneV * dt;
      if (s.zoneY < 0) (s.zoneY = 0), (s.zoneV = Math.abs(s.zoneV) * 0.35);
      if (s.zoneY > barH - zoneH) (s.zoneY = barH - zoneH), (s.zoneV = -Math.abs(s.zoneV) * 0.35);
      // the fish, its own way
      const span = barH - FISH_H;
      const pattern = fish.pattern ?? "erratic";
      let wobble = 0;
      if (pattern === "sine") {
        if (s.t >= s.nextDart) {
          s.fishTarget = span * (0.25 + Math.random() * 0.5);
          s.nextDart = s.t + 2.2 + Math.random() * 1.5;
        }
        wobble = Math.sin(s.t * 1.7) * span * 0.22;
      } else if (pattern === "plunge") {
        if (s.t >= s.nextDart) {
          s.plunge = s.plunge < 0 ? s.t : -1;
          s.fishTarget = s.plunge >= 0 ? span : span * (0.1 + Math.random() * 0.3);
          s.nextDart = s.t + (s.plunge >= 0 ? 0.7 : 1.1 + Math.random() * 0.4);
        }
        wobble = Math.sin(s.t * 5) * 5;
      } else if (pattern === "erratic") {
        if (s.t >= s.nextDart) {
          s.fishTarget = Math.random() * span;
          s.fishV += (Math.random() < 0.5 ? -1 : 1) * (125 + Math.random() * 175) * SWIM * scale * (fish.boss ? dartMul : 1);
          s.nextDart = s.t + 0.3 + Math.random() * 0.6;
        }
        wobble = Math.sin(s.t * 9.3) * 4;
      } else {
        if (s.t >= s.nextDart) {
          s.fishTarget = Math.random() * span;
          s.nextDart = s.t + 0.35 + Math.random() * 0.45;
        }
        wobble = Math.sin(s.t * 11) * 7;
      }
      // a boss: now and then a fake run to one end of the column (a feint), then it snaps back; and
      // it thrashes all the while
      if (fish.boss) {
        // (0.3 s before a fake run: the warning)
        const warn = s.feintUntil === 0 && s.t >= s.nextFeint - BOSS_TELEGRAPH_S;
        if (warn !== telegraphRef.current) {
          telegraphRef.current = warn;
          setTelegraph(warn);
          if (warn) playSfx("tension");
        }
        if (s.feintUntil === 0 && s.t >= s.nextFeint) {
          s.feintBack = s.fishTarget;
          s.feintUntil = s.t + 0.25 + Math.random() * 0.15;
          s.nextFeint = s.t + (1.1 + Math.random() * 0.8) * feintGap;
          s.fishV += (s.fishY < span / 2 ? 1 : -1) * 230 * scale * dartMul;
        }
        if (s.feintUntil > 0) {
          if (s.t < s.feintUntil) s.fishTarget = s.fishY < span / 2 && s.fishV > 0 ? span : s.fishV < 0 ? 0 : s.fishTarget;
          else {
            s.fishTarget = s.feintBack;
            s.fishV *= -0.6;
            s.feintUntil = 0;
          }
        }
        wobble += Math.sin(s.t * 23) * 6 * scale + (Math.random() - 0.5) * 7 * scale;
      }
      const pull = (10 + fish.speed * 16) * SWIM;
      s.fishV += ((s.fishTarget - s.fishY) * pull - s.fishV * (4 + fish.speed * 2)) * dt;
      s.fishY = Math.max(0, Math.min(span, s.fishY + s.fishV * dt));
      const shownFish = Math.max(0, Math.min(span, s.fishY + wobble));
      const centre = shownFish + FISH_H / 2;
      const inside = centre > s.zoneY && centre < s.zoneY + zoneH;
      s.meter = Math.max(0, Math.min(1, s.meter + (inside ? 0.26 : -0.06 - fish.size * 0.04) * dt));
      const pullRate = (0.35 + fish.size * 0.2) * (1 - (fish.tensionResist ?? 0));
      // (the rod's tension window: out of the green this long before the tension starts to climb)
      s.outFor = inside ? 0 : s.outFor + dt;
      const climbing = !inside && s.outFor > (fish.tensionWindow ?? 0.8);
      s.tension = Math.max(0, Math.min(1, s.tension + (inside ? -0.5 : climbing ? 1 / (1 / pullRate + TENSION_GRACE_S) : 0) * dt));
      if (s.tension > 0.65 && s.t - s.warnAt > 0.45) {
        s.warnAt = s.t;
        playSfx("tension");
      }
      // a sunken chest: turns up after a moment, opens while the bar holds it, sinks away if ignored
      if (fish.treasure && !s.chestOpen) {
        if (s.chestY < 0 && s.t >= s.chestAt && s.chestGone === 0) {
          s.chestY = span * (0.15 + Math.random() * 0.7);
          s.chestGone = s.t + 6;
        }
        if (s.chestY >= 0) {
          const c = s.chestY + FISH_H / 2;
          if (c > s.zoneY && c < s.zoneY + zoneH) s.chest = Math.min(1, s.chest + dt / 1.4);
          else s.chest = Math.max(0, s.chest - dt * 0.25);
          if (s.chest >= 1) {
            s.chestOpen = true;
            playSfx("golden");
          } else if (s.t > s.chestGone) {
            s.chestY = -1;
          }
        }
      }
      s.total += dt;
      if (inside) s.inTime += dt;
      setView({ zoneY: s.zoneY, fishY: shownFish, meter: s.meter, inZone: inside, timeLeft: Math.max(0, REEL_SECONDS - s.t), tension: s.tension, chestY: s.chestOpen ? -1 : s.chestY, chest: s.chest, chestOpen: s.chestOpen });
      if (!doneRef.current) {
        if (s.meter >= 1) {
          doneRef.current = true;
          setDone("caught");
          playSfx("trophy");
          resultRef.current("caught", Math.min(1, s.inTime / Math.max(1, s.total)), s.chestOpen);
          return;
        }
        // a Snap Shield (the Abyssal Tether): the line holds once at breaking point
        if (s.tension >= 1 && s.shields > 0) {
          s.shields -= 1;
          s.tension = 0.35;
          setShieldBurst(performance.now());
          playSfx("parry");
        }
        if (s.tension >= 1 || s.meter <= 0 || s.t >= REEL_SECONDS) {
          doneRef.current = true;
          if (s.tension >= 1) {
            setSnapped(true);
            playSfx("snap");
          }
          setDone("lost");
          resultRef.current("lost", 0, false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // one fish per reel: the sim reads it once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fish]);

  // closes by itself: a lost fish at once; a mystery fish once it has been revealed (or, the
  // server slow to say, a while later)
  const waiting = done === "caught" && mystery && !reveal && !escaped;
  useEffect(() => {
    if (!done || !autoCloseMs) return;
    const ms = done === "lost" || escaped ? autoCloseMs : waiting ? 6000 : mystery ? autoCloseMs + 1800 : autoCloseMs;
    const t = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(t);
  }, [done, autoCloseMs, onClose, waiting, mystery, escaped]);
  useEffect(() => {
    if (reveal?.record) playSfx("chime");
  }, [reveal]);

  // closing mid-fight lets it go
  const close = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      resultRef.current("lost", 0, false);
    }
    onClose();
  };

  const hold = (on: boolean) => (e: React.PointerEvent) => {
    if (on) e.preventDefault();
    holding.current = on;
  };
  const { zoneY, fishY, meter, inZone, timeLeft, tension, chestY, chest, chestOpen } = view;
  const straining = tension > 0.65;
  // the catch as a percentage: the number beside the bar and the bar's fill are this one value
  const catchProgress = Math.round(meter * 100);
  const pct = catchProgress;
  return (
    <Modal title={done === "caught" ? "Landed!" : done === "lost" ? "Gone…" : "Something's on the line!"} icon="🎣" onClose={close} width={780} fit>
      <div className="flex min-h-0 flex-col gap-3 sm:flex-row">
        {/* the water: only a shadow on the line until it is landed */}
        <div className="relative min-h-[150px] flex-1 overflow-hidden rounded-2xl border border-[#4A3A30] bg-[#0b1d22]" style={{ height: done ? Math.max(270, barH) : barH }}>
          <Underwater viewRef={viewRef} barH={barH} shadow={fish.shadow ?? Math.min(1, 0.35 + fish.size * 0.3)} done={done} />
          {done ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#1C1614]/70 px-3 py-4 text-center backdrop-blur-[2px]">
              {done === "caught" && (
                <div className="cozy-confetti" aria-hidden>
                  {CONFETTI.map((c, i) => (
                    <span key={i} style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px`, "--spin": `${c.spin}deg`, background: c.color, animationDelay: `${c.delay}s` } as React.CSSProperties} />
                  ))}
                </div>
              )}
              {done === "caught" && mystery ? (
                reveal ? (
                  <>
                    <div className="h-32 w-full max-w-[280px]">
                      <Suspense fallback={<div className="flex h-full items-center justify-center text-6xl">{reveal.emoji}</div>}>
                        <FishViewer species={reveal.species} fallback={reveal.emoji} />
                      </Suspense>
                    </div>
                    <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: reveal.tierColor, borderColor: reveal.tierColor }}>
                      {reveal.tier}
                    </span>
                    <b className="text-xl text-[#F7EBE1]">
                      {reveal.name}
                      {reveal.king ? " 👑" : ""}
                    </b>
                    <span className="text-base font-bold text-[#F5A623]">
                      {reveal.cm} cm · {reveal.kg.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg · {reveal.stars}
                    </span>
                    {reveal.record && <span className="text-sm font-bold text-[#F5A623]">🏆 New personal best!</span>}
                    {reveal.locked && !reveal.released && (
                      <span className="cozy-autolock rounded-full border border-[#F5A623] bg-gradient-to-b from-[#ffe08a] to-[#F5A623] px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-[#2B201B]" title="Protected from Sell All: unlock it in the livewell to sell">
                        🔒 Auto-Locked
                      </span>
                    )}
                    {chestOpen && <span className="text-sm font-bold text-[#F5A623]">🧰 Sunken treasure! +{fish.treasureReward ?? 0} 🪙</span>}
                    <span className="text-xs opacity-70">{reveal.released ? "Your livewell's full: back into the water it goes." : "Into the livewell it goes."}</span>
                  </>
                ) : escaped ? (
                  <>
                    <span className="text-5xl">💨</span>
                    <b className="text-lg text-[#F7EBE1]">It slipped the hook at the last moment!</b>
                    <span className="text-sm opacity-70">Whatever it was, it's still out there.</span>
                  </>
                ) : (
                  <>
                    <span className="cozy-bob text-6xl" style={{ filter: "brightness(0) opacity(0.7)" }}>
                      🐟
                    </span>
                    <b className="text-lg text-[#F7EBE1]">Landing it…</b>
                  </>
                )
              ) : (
                <>
                  <span className="text-5xl">{done === "caught" ? fish.emoji : "💨"}</span>
                  <b className="text-lg text-[#F7EBE1]">{done === "caught" ? `You reeled in a ${fish.name}!` : snapped ? "Snap! The line broke" : "It got away…"}</b>
                  {done === "caught" && fish.detail ? <span className="text-base font-bold text-sky-200">{fish.detail}</span> : null}
                  {done === "caught" && fish.reward ? <span className="text-base font-bold text-[#F5A623]">+{fish.reward} 🪙</span> : null}
                  {done === "caught" && chestOpen ? <span className="text-base font-bold text-[#F5A623]">🧰 Sunken treasure! +{fish.treasureReward ?? 0} 🪙</span> : null}
                  <span className="text-sm opacity-70">{done === "caught" ? "Back in the water it goes, your line with it." : snapped ? "Too much tension: keep the fish in the green." : mystery ? "Whatever it was, it's still out there." : "The line went slack."}</span>
                </>
              )}
              {!autoCloseMs && (
                <button type="button" className="clay-btn clay-btn-amber mt-2" onClick={onClose}>
                  Back to the water
                </button>
              )}
            </div>
          ) : (
            <div className={`pointer-events-none absolute left-3 top-2 text-[11px] font-bold uppercase tracking-widest ${fish.boss && mystery ? "text-amber-300" : "text-[#C9BDB5]/70"}`}>{mystery ? (fish.boss ? "💀 A colossal shadow thrashes on the line!" : "A shadow on the line…") : fish.hint}</div>
          )}
        </div>

        {/* the column: the catch bar, the fish, the tension and the catch */}
        {!done && (
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex items-stretch justify-center gap-2.5">
              <div
                className={`relative w-16 shrink-0 cursor-pointer touch-none select-none overflow-hidden rounded-2xl border bg-gradient-to-b from-[#12343c] to-[#0a1a1e] ${telegraph ? "cozy-reel-warn border-rose-400" : "border-[#4A3A30]"}`}
                style={{ height: barH }}
                aria-label="Reel column: hold to lift the catch bar"
                onPointerDown={hold(true)}
                onPointerUp={hold(false)}
                onPointerLeave={hold(false)}
                onPointerCancel={hold(false)}
              >
                <div className={`absolute left-1 right-1 rounded-xl transition-colors ${inZone ? "bg-emerald-400/85 shadow-[0_0_14px_rgba(52,211,153,0.6)]" : "bg-emerald-300/40"}`} style={{ top: zoneY, height: zoneH }} />
                {chestY >= 0 && (
                  <div className="absolute left-0 right-0 text-center text-xl leading-none" style={{ top: chestY, height: FISH_H, filter: `drop-shadow(0 0 ${4 + chest * 8}px rgba(245, 166, 35, ${0.4 + chest * 0.6}))` }} aria-label="Sunken treasure chest">
                    🧰
                    <div className="mx-auto mt-0.5 h-1 w-8 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full bg-[#F5A623]" style={{ width: `${chest * 100}%` }} />
                    </div>
                  </div>
                )}
                <div className="absolute left-0 right-0 text-center text-2xl leading-none" style={{ top: fishY, height: FISH_H, transform: inZone ? "scale(1.18)" : "none", filter: mystery ? "brightness(0) opacity(0.8)" : undefined }}>
                  🐟
                </div>
                {telegraph && (
                  <div className="cozy-reel-bang pointer-events-none absolute left-0 right-0 text-center text-xl font-black leading-none text-rose-300" style={{ top: Math.max(0, fishY - 22) }} aria-hidden>
                    ❗
                  </div>
                )}
                {shieldBurst > 0 && (
                  <div key={shieldBurst} className="cozy-shield-burst pointer-events-none absolute inset-0 flex items-center justify-center text-3xl" aria-hidden>
                    🛡️
                  </div>
                )}
                {straining && (
                  <div className="cozy-tension" style={{ top: fishY }} aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
              {/* the line's tension, climbing red while the fish runs free */}
              <div className="flex w-4 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-white/10" style={{ height: barH }} aria-label="Line tension">
                <div className="w-full rounded-full transition-[height] duration-100" style={{ height: `${tension * 100}%`, background: straining ? "#ff5a4f" : "#E69A28" }} />
              </div>
              {/* the catch */}
              {/* the catch: an amber fill bound to the very number shown beside it (catchProgress, 0-100) */}
              <div className="relative w-6 shrink-0 overflow-hidden rounded-full bg-white/10" style={{ height: barH }} role="progressbar" aria-label="Catch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={catchProgress}>
                <div className="absolute bottom-0 left-0 right-0 rounded-full bg-[#F5A623] shadow-[0_0_8px_rgba(245,166,35,0.6)]" style={{ height: `${Math.min(100, Math.max(0, catchProgress))}%`, transition: "height 0.15s ease-out" }} />
              </div>
              <div className="flex w-[104px] flex-col justify-between py-0.5 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Hooked</div>
                  <div className="text-base font-extrabold text-[#F7EBE1]">???</div>
                  {!mystery && fish.tier && <div className="mt-0.5 text-xs font-bold text-[#F5A623]">{fish.tier}</div>}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Catch</div>
                  <div className="text-2xl font-extrabold tabular-nums text-[#F7EBE1]">{pct}%</div>
                  <div className={`text-xs tabular-nums ${timeLeft < 5 ? "font-bold text-rose-300" : "opacity-70"}`}>escapes in {Math.ceil(timeLeft)}s</div>
                  <div className={`mt-1 text-[10px] ${straining ? "font-bold text-rose-300" : "opacity-50"}`}>{straining ? "Tension! Keep it in the green" : "line tension"}</div>
                  {fish.boss && fish.perk && <div className="mt-1 text-[10px] font-bold text-sky-200">🌠 {fish.perk}{(fish.shields ?? 0) > 0 ? ` · 🛡️ ${sim.current.shields}` : ""}</div>}
                </div>
              </div>
            </div>
            <button type="button" className="clay-btn clay-btn-amber min-h-12 touch-none select-none text-base" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)}>
              🎣 Hold to reel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The water pane: light from above, weed and stones below, bubbles, and the fish's shadow pulling
 *  against a line from the rod tip: drawn toward the surface as the catch fills, thrashing when
 *  it runs free, the line reddening with the tension. */
function Underwater({ viewRef, barH, shadow, done }: { viewRef: React.MutableRefObject<ReelView>; barH: number; shadow: number; done: "caught" | "lost" | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bubbles = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.5, v: 0.05 + Math.random() * 0.08 }));
    const weeds = Array.from({ length: 9 }, (_, i) => ({ x: (i + Math.random() * 0.6) / 9, h: 0.18 + Math.random() * 0.2, p: Math.random() * 6 }));
    let raf = 0;
    let fx = 0.7;
    let fy = 0.5;
    let heading = -1;
    const t0 = performance.now();
    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (now - t0) / 1000;
      const v = viewRef.current;
      // the water, darker with depth
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1f5561");
      g.addColorStop(0.45, "#12343c");
      g.addColorStop(1, "#071215");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // shafts of light swaying from the surface
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const x = w * (0.15 + i * 0.24) + Math.sin(t * 0.4 + i) * 18;
        const lg = ctx.createLinearGradient(0, 0, 0, h * 0.8);
        lg.addColorStop(0, "rgba(180, 230, 220, 0.10)");
        lg.addColorStop(1, "rgba(180, 230, 220, 0)");
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(x - 14, 0);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x + 60, h * 0.8);
        ctx.lineTo(x - 10, h * 0.8);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // the surface's ripple line
      ctx.strokeStyle = "rgba(200, 240, 235, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, 4 + Math.sin(x * 0.05 + t * 2) * 1.5);
      ctx.stroke();
      // stones and weed along the bottom
      ctx.fillStyle = "#050c0e";
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.ellipse(w * ((i + 0.3) / 7), h - 4, 16 + (i % 3) * 8, 9 + (i % 2) * 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#0d2a22";
      ctx.lineWidth = 3;
      for (const wd of weeds) {
        ctx.beginPath();
        ctx.moveTo(wd.x * w, h);
        ctx.quadraticCurveTo(wd.x * w + Math.sin(t * 1.2 + wd.p) * 10, h - wd.h * h * 0.6, wd.x * w + Math.sin(t * 0.9 + wd.p) * 16, h - wd.h * h);
        ctx.stroke();
      }
      // the fish: its depth follows the column; it is drawn in toward the rod as the catch fills,
      // and thrashes away when it slips the bar
      const targetY = 0.18 + (v.fishY / Math.max(1, barH)) * 0.66;
      const targetX = doneRef.current === "caught" ? 0.12 : doneRef.current === "lost" ? 1.3 : 0.86 - v.meter * 0.62 + (v.inZone ? 0 : Math.sin(t * 7) * 0.03);
      const nx = fx + (targetX - fx) * 0.06;
      heading = nx < fx - 0.0005 ? -1 : nx > fx + 0.0005 ? 1 : heading;
      fx = nx;
      fy += (targetY - fy) * 0.1;
      const len = 36 + shadow * 120;
      const px = fx * w;
      const py = fy * h;
      const tail = Math.sin(t * (v.inZone ? 8 : 16)) * 0.35;
      // the line, from the rod tip at the top left: taut and reddening with the tension
      if (doneRef.current !== "lost") {
        const mouthX = px + (heading < 0 ? -len * 0.5 : len * 0.5);
        const red = Math.round(220 + v.tension * 35);
        ctx.strokeStyle = `rgba(${red}, ${Math.round(235 - v.tension * 170)}, ${Math.round(225 - v.tension * 170)}, 0.8)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.04, 0);
        const sag = (1 - v.tension) * 30;
        ctx.quadraticCurveTo((w * 0.04 + mouthX) / 2, (py + sag) / 2 + sag, mouthX, py);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(heading, 1);
      ctx.fillStyle = "rgba(2, 6, 8, 0.82)";
      ctx.filter = "blur(1.2px)";
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.5, len * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(len * 0.42, 0);
      ctx.lineTo(len * 0.72, -len * 0.18 + tail * len * 0.12);
      ctx.lineTo(len * 0.66, tail * len * 0.08);
      ctx.lineTo(len * 0.72, len * 0.18 + tail * len * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-len * 0.08, -len * 0.14);
      ctx.quadraticCurveTo(len * 0.05, -len * 0.3, len * 0.2, -len * 0.13);
      ctx.fill();
      ctx.restore();
      ctx.filter = "none";
      // bubbles
      ctx.fillStyle = "rgba(220, 245, 240, 0.35)";
      for (const b of bubbles) {
        b.y -= b.v / 60;
        if (b.y < 0) (b.y = 1), (b.x = Math.random());
        ctx.beginPath();
        ctx.arc(b.x * w + Math.sin(t * 2 + b.x * 10) * 3, b.y * h, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [viewRef, barH, shadow]);
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}
