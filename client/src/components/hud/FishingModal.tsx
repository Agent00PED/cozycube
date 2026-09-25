import { useEffect, useRef, useState } from "react";
import { REEL_SECONDS, type SwimPattern } from "@shared/types";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Stardew-style reel: a fish darts up and down a tall column; hold (the button, a click or
// touch anywhere on the column, or Space) to lift the green catch bar, let go and it falls. While
// the fish is inside the bar the catch meter fills; outside, it drains. Full meter: landed, with
// a burst of confetti. Empty meter, or REEL_SECONDS gone: it got away. The server only learns the
// outcome (and how clean the catch was); it pays.
//
// Each fish swims its own way (`pattern`): a minnow on a slow sine wave, a trout in rhythmic
// plunges to the bottom, a salmon in erratic jerks and sudden turns, the Star-Koi fast and darting
// (and its green bar is smaller). While the fish is out of the bar the line's tension builds: red
// sparks and a warning twang, and at full tension the line snaps. Sometimes a Sunken Treasure
// Chest drifts into the column: hold the bar over it until it opens for a bonus.

const BAR_H = 280;
const ZONE_H = 74;
const FISH_H = 24;
/** The bar's physics, in px/s²: lifted while held, pulled down by gravity otherwise. */
const GRAVITY = 820;
const LIFT = 1500;

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
  /** A difficulty word under the fish (Easy, Medium, ...). */
  tier?: string;
  /** The rod's grip on the line: tension builds this much slower (0.35: 35%). */
  tensionResist?: number;
  /** A line under the name once it is landed (its length and stars). */
  detail?: string;
}

interface Props {
  fish: FishProfile;
  onResult: (result: "caught" | "lost", quality: number, openedChest: boolean) => void;
  onClose: () => void;
  /** Close by itself this long after the result (the campfire's line goes straight back in). */
  autoCloseMs?: number;
}

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  x: Math.cos((i / 22) * Math.PI * 2) * (60 + (i % 3) * 22),
  y: Math.sin((i / 22) * Math.PI * 2) * (40 + (i % 4) * 14) - 30,
  color: ["#ffd166", "#8fd3b6", "#ec7fa3", "#9ecbff", "#f4a15c"][i % 5],
  delay: (i % 5) * 0.04,
  spin: (i % 2 ? 1 : -1) * (180 + i * 20),
}));

export function FishingModal({ fish, onResult, onClose, autoCloseMs }: Props) {
  const zoneH = Math.round(ZONE_H * (fish.barScale ?? 1));
  const [view, setView] = useState({ zoneY: BAR_H - zoneH, fishY: BAR_H / 2, meter: 0.3, inZone: false, timeLeft: REEL_SECONDS, tension: 0, chestY: -1, chest: 0, chestOpen: false });
  const [done, setDone] = useState<"caught" | "lost" | null>(null);
  const [snapped, setSnapped] = useState(false);
  const holding = useRef(false);
  const sim = useRef({ zoneY: BAR_H - zoneH, zoneV: 0, fishY: BAR_H / 2, fishV: 0, fishTarget: BAR_H / 2, meter: 0.3, inTime: 0, total: 0, t: 0, nextDart: 0.6, plunge: -1, tension: 0, warnAt: 0, chestAt: 2.5 + Math.random() * 2, chestY: -1, chest: 0, chestOpen: false, chestGone: 0 });
  const doneRef = useRef(false);
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
      s.zoneV += (holding.current ? -LIFT : GRAVITY) * dt;
      s.zoneV *= 0.955;
      s.zoneY += s.zoneV * dt;
      if (s.zoneY < 0) (s.zoneY = 0), (s.zoneV = Math.abs(s.zoneV) * 0.35);
      if (s.zoneY > BAR_H - zoneH) (s.zoneY = BAR_H - zoneH), (s.zoneV = -Math.abs(s.zoneV) * 0.35);
      // the fish, its own way
      const span = BAR_H - FISH_H;
      const pattern = fish.pattern ?? "erratic";
      let wobble = 0;
      if (pattern === "sine") {
        // a lazy wave, its middle wandering slowly
        if (s.t >= s.nextDart) {
          s.fishTarget = span * (0.25 + Math.random() * 0.5);
          s.nextDart = s.t + 2.2 + Math.random() * 1.5;
        }
        wobble = Math.sin(s.t * 1.7) * span * 0.22;
      } else if (pattern === "plunge") {
        // rhythmic: drifting near the top, then a plunge to the bottom and back up, on a beat
        if (s.t >= s.nextDart) {
          s.plunge = s.plunge < 0 ? s.t : -1;
          s.fishTarget = s.plunge >= 0 ? span : span * (0.1 + Math.random() * 0.3);
          s.nextDart = s.t + (s.plunge >= 0 ? 0.7 : 1.1 + Math.random() * 0.4);
        }
        wobble = Math.sin(s.t * 5) * 5;
      } else if (pattern === "erratic") {
        // jerks: frequent sudden turns, a kick of speed with each
        if (s.t >= s.nextDart) {
          s.fishTarget = Math.random() * span;
          s.fishV += (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 220);
          s.nextDart = s.t + 0.3 + Math.random() * 0.6;
        }
        wobble = Math.sin(s.t * 9.3) * 4;
      } else {
        // the Star-Koi: fast darts across the whole column, with a quick shimmer
        if (s.t >= s.nextDart) {
          s.fishTarget = Math.random() * span;
          s.nextDart = s.t + 0.35 + Math.random() * 0.45;
        }
        wobble = Math.sin(s.t * 11) * 7;
      }
      const pull = 10 + fish.speed * 16;
      s.fishV += ((s.fishTarget - s.fishY) * pull - s.fishV * (4 + fish.speed * 2)) * dt;
      s.fishY = Math.max(0, Math.min(span, s.fishY + s.fishV * dt));
      const shownFish = Math.max(0, Math.min(span, s.fishY + wobble));
      const centre = shownFish + FISH_H / 2;
      const inside = centre > s.zoneY && centre < s.zoneY + zoneH;
      s.meter = Math.max(0, Math.min(1, s.meter + (inside ? 0.26 : -0.06 - fish.size * 0.04) * dt));
      // the line's tension: builds while the fish runs free (faster for a heavy one), eases while
      // it is held; left running, it snaps before the meter could run dry
      s.tension = Math.max(0, Math.min(1, s.tension + (inside ? -0.5 : (0.35 + fish.size * 0.2) * (1 - (fish.tensionResist ?? 0))) * dt));
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
          resultRef.current("caught", Math.min(1, s.inTime / Math.max(1, s.total)), s.chestOpen);
          return;
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

  // the campfire goes straight back to watching the float
  useEffect(() => {
    if (!done || !autoCloseMs) return;
    const t = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(t);
  }, [done, autoCloseMs, onClose]);

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
  return (
    <Modal title="Something's on the line!" icon="🎣" onClose={close} width={420}>
      <div className="flex flex-col gap-3 pb-2">
        {done ? (
          <div className="clay-pop relative flex flex-col items-center gap-2 py-6 text-center">
            {done === "caught" && (
              <div className="cozy-confetti" aria-hidden>
                {CONFETTI.map((c, i) => (
                  <span key={i} style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px`, "--spin": `${c.spin}deg`, background: c.color, animationDelay: `${c.delay}s` } as React.CSSProperties} />
                ))}
              </div>
            )}
            <span className="text-6xl">{done === "caught" ? fish.emoji : "💨"}</span>
            <b className="text-lg">{done === "caught" ? `You reeled in a ${fish.name}!` : snapped ? "Snap! The line broke" : "It got away…"}</b>
            {done === "caught" && fish.detail ? <span className="text-base font-bold text-sky-200">{fish.detail}</span> : null}
            {done === "caught" && fish.reward ? <span className="text-base font-bold text-amber-200">+{fish.reward} 🪙</span> : null}
            {done === "caught" && chestOpen ? <span className="text-base font-bold text-amber-200">🎁 Sunken treasure! +{fish.treasureReward ?? 0} 🪙</span> : null}
            <span className="text-sm opacity-70">{done === "caught" ? "Back in the water it goes, your line with it." : snapped ? "Too much tension: keep the fish in the green. A new line's out." : "The line went slack. The float's back out."}</span>
            {!autoCloseMs && (
              <button type="button" className="clay-btn clay-btn-amber mt-2" onClick={onClose}>
                Back to the water
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="m-0 text-sm opacity-80">Hold to lift the green bar, let go to let it fall. Keep the fish inside it to reel it in.</p>
            <div className="flex items-stretch justify-center gap-5">
              <div
                className="relative w-16 shrink-0 cursor-pointer touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-sky-900/80 to-sky-950/90"
                style={{ height: BAR_H }}
                aria-label="Reel column: hold to lift the catch bar"
                onPointerDown={hold(true)}
                onPointerUp={hold(false)}
                onPointerLeave={hold(false)}
                onPointerCancel={hold(false)}
              >
                <div className={`absolute left-1 right-1 rounded-xl transition-colors ${inZone ? "bg-emerald-400/85 shadow-[0_0_14px_rgba(52,211,153,0.6)]" : "bg-emerald-300/40"}`} style={{ top: zoneY, height: zoneH }} />
                {chestY >= 0 && (
                  <div className="absolute left-0 right-0 text-center text-xl leading-none" style={{ top: chestY, height: FISH_H, filter: `drop-shadow(0 0 ${4 + chest * 8}px rgba(255, 209, 102, ${0.4 + chest * 0.6}))` }} aria-label="Sunken treasure chest">
                    🧰
                    <div className="mx-auto mt-0.5 h-1 w-8 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full bg-amber-300" style={{ width: `${chest * 100}%` }} />
                    </div>
                  </div>
                )}
                <div className="absolute left-0 right-0 text-center text-2xl leading-none" style={{ top: fishY, height: FISH_H, transform: inZone ? "scale(1.18)" : "none" }}>
                  🐟
                </div>
                {straining && (
                  <div className="cozy-tension" style={{ top: fishY }} aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
              <div className="flex w-6 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-white/10" style={{ height: BAR_H }} aria-label="Catch meter">
                <div className="w-full rounded-full transition-[height] duration-100" style={{ height: `${meter * 100}%`, background: meter > 0.66 ? "#8fd3b6" : meter > 0.33 ? "#ffd166" : "#ec7fa3" }} />
              </div>
              <div className="flex flex-1 flex-col justify-between py-1 text-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Hooked</div>
                  <div className="text-lg font-extrabold">???</div>
                  <div className="opacity-70">{fish.hint}</div>
                  {fish.tier && <div className="mt-1 text-xs font-bold text-amber-200/90">{fish.tier}</div>}
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Catch</div>
                  <div className="text-2xl font-extrabold tabular-nums">{Math.round(meter * 100)}%</div>
                  <div className="text-xs opacity-60">line holds {Math.ceil(timeLeft)}s</div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-label="Line tension">
                    <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${tension * 100}%`, background: straining ? "#ff5a4f" : "#ffd166" }} />
                  </div>
                  <div className={`text-[10px] ${straining ? "font-bold text-rose-300" : "opacity-50"}`}>{straining ? "Tension! Keep it in the green" : "tension"}</div>
                </div>
              </div>
            </div>
            <button type="button" className="clay-btn clay-btn-amber min-h-14 touch-none select-none text-lg" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)}>
              🎣 Hold to reel
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
