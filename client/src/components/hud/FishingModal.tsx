import { useEffect, useRef, useState } from "react";
import { REEL_SECONDS } from "@shared/types";
import { Modal } from "./Modal";

// The Stardew-style reel: a fish darts up and down a tall column; hold (the button, a click or
// touch anywhere on the column, or Space) to lift the green catch bar, let go and it falls. While
// the fish is inside the bar the catch meter fills; outside, it drains. Full meter: landed, with
// a burst of confetti. Empty meter, or REEL_SECONDS gone: it got away. The server only learns the
// outcome (and how clean the catch was); it pays.
//
// The fish swims like a Stardew fish: it drifts on a slow sine, and now and then darts to a new
// depth, more often and further the livelier it is (`speed`); a heavy one (`size`) drains the
// meter faster while it is out of the bar.

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
}

interface Props {
  fish: FishProfile;
  onResult: (result: "caught" | "lost", quality: number) => void;
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
  const [view, setView] = useState({ zoneY: BAR_H - ZONE_H, fishY: BAR_H / 2, meter: 0.3, inZone: false, timeLeft: REEL_SECONDS });
  const [done, setDone] = useState<"caught" | "lost" | null>(null);
  const holding = useRef(false);
  const sim = useRef({ zoneY: BAR_H - ZONE_H, zoneV: 0, fishY: BAR_H / 2, fishV: 0, fishTarget: BAR_H / 2, meter: 0.3, inTime: 0, total: 0, t: 0, nextDart: 0.6 });
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
      if (s.zoneY > BAR_H - ZONE_H) (s.zoneY = BAR_H - ZONE_H), (s.zoneV = -Math.abs(s.zoneV) * 0.35);
      // the fish: darts to a new depth now and then (livelier fish more often, and further), and
      // swims there on a spring, drifting on a slow sine on top
      if (s.t >= s.nextDart) {
        const reach = (0.35 + fish.speed * 0.45) * (BAR_H - FISH_H);
        s.fishTarget = Math.max(0, Math.min(BAR_H - FISH_H, s.fishY + (Math.random() * 2 - 1) * reach));
        s.nextDart = s.t + (1.6 - Math.min(1.1, fish.speed * 0.7)) * (0.5 + Math.random());
      }
      const pull = 10 + fish.speed * 16;
      s.fishV += ((s.fishTarget - s.fishY) * pull - s.fishV * (4 + fish.speed * 2)) * dt;
      const wobble = Math.sin(s.t * (1.8 + fish.speed * 2.2)) * (6 + fish.speed * 10);
      s.fishY = Math.max(0, Math.min(BAR_H - FISH_H, s.fishY + s.fishV * dt));
      const shownFish = Math.max(0, Math.min(BAR_H - FISH_H, s.fishY + wobble));
      const centre = shownFish + FISH_H / 2;
      const inside = centre > s.zoneY && centre < s.zoneY + ZONE_H;
      s.meter = Math.max(0, Math.min(1, s.meter + (inside ? 0.26 : -0.13 - fish.size * 0.08) * dt));
      s.total += dt;
      if (inside) s.inTime += dt;
      setView({ zoneY: s.zoneY, fishY: shownFish, meter: s.meter, inZone: inside, timeLeft: Math.max(0, REEL_SECONDS - s.t) });
      if (!doneRef.current) {
        if (s.meter >= 1) {
          doneRef.current = true;
          setDone("caught");
          resultRef.current("caught", Math.min(1, s.inTime / Math.max(1, s.total)));
          return;
        }
        if (s.meter <= 0 || s.t >= REEL_SECONDS) {
          doneRef.current = true;
          setDone("lost");
          resultRef.current("lost", 0);
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
      resultRef.current("lost", 0);
    }
    onClose();
  };

  const hold = (on: boolean) => (e: React.PointerEvent) => {
    if (on) e.preventDefault();
    holding.current = on;
  };
  const { zoneY, fishY, meter, inZone, timeLeft } = view;
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
            <b className="text-lg">{done === "caught" ? `You reeled in a ${fish.name}!` : "It got away…"}</b>
            {done === "caught" && fish.reward ? <span className="text-base font-bold text-amber-200">+{fish.reward} 🪙</span> : null}
            <span className="text-sm opacity-70">{done === "caught" ? "Back in the water it goes, your line with it." : "The line went slack. The float's back out."}</span>
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
                <div className={`absolute left-1 right-1 rounded-xl transition-colors ${inZone ? "bg-emerald-400/85 shadow-[0_0_14px_rgba(52,211,153,0.6)]" : "bg-emerald-300/40"}`} style={{ top: zoneY, height: ZONE_H }} />
                <div className="absolute left-0 right-0 text-center text-2xl leading-none" style={{ top: fishY, height: FISH_H, transform: inZone ? "scale(1.18)" : "none" }}>
                  🐟
                </div>
              </div>
              <div className="flex w-6 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-white/10" style={{ height: BAR_H }} aria-label="Catch meter">
                <div className="w-full rounded-full transition-[height] duration-100" style={{ height: `${meter * 100}%`, background: meter > 0.66 ? "#8fd3b6" : meter > 0.33 ? "#ffd166" : "#ec7fa3" }} />
              </div>
              <div className="flex flex-1 flex-col justify-between py-1 text-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Hooked</div>
                  <div className="text-lg font-extrabold">???</div>
                  <div className="opacity-70">{fish.hint}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Catch</div>
                  <div className="text-2xl font-extrabold tabular-nums">{Math.round(meter * 100)}%</div>
                  <div className="text-xs opacity-60">line holds {Math.ceil(timeLeft)}s</div>
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
