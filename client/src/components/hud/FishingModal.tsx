import { useEffect, useRef, useState } from "react";
import { ITEMS, REEL_SECONDS, type FishOnLine } from "@shared/types";
import { Modal } from "./Modal";
import { playBiteDing, playReelClick, playSplash } from "../../audio/sfx";

// The Stardew-style reel: a fish darts up and down a tall bar; hold the button (or space) to
// lift the green catch zone, let go to drop it. Keeping the fish inside the zone fills the
// catch meter, losing it drains the meter. Full meter: caught. Empty meter, or REEL_SECONDS
// gone: it got away. The server only learns the outcome and how clean the catch was.
const BAR_H = 260;
const ZONE_H = 70;
const FISH_H = 22;
const GRAVITY = 900;
const LIFT = 1500;

interface Props {
  fish: FishOnLine;
  onResult: (result: "caught" | "lost", quality: number) => void;
  onClose: () => void;
}

export function FishingModal({ fish, onResult, onClose }: Props) {
  const [zoneY, setZoneY] = useState(BAR_H - ZONE_H);
  const [fishY, setFishY] = useState(BAR_H / 2);
  const [meter, setMeter] = useState(0.4);
  const [inZone, setInZone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(REEL_SECONDS);
  const [done, setDone] = useState<"caught" | "lost" | null>(null);
  const holding = useRef(false);
  const sim = useRef({ zoneY: BAR_H - ZONE_H, zoneV: 0, fishY: BAR_H / 2, fishTarget: BAR_H / 2, meter: 0.4, inTime: 0, total: 0, t: 0, lastClick: 0 });
  const doneRef = useRef(false);

  useEffect(() => {
    playBiteDing();
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        holding.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") holding.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const item = fish.item === "boot" ? null : ITEMS[fish.item];
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      s.t += dt;
      // the catch zone: lifted while held, falls otherwise, bounces at the ends
      s.zoneV += (holding.current ? -LIFT : GRAVITY) * dt;
      s.zoneV *= 0.94;
      s.zoneY += s.zoneV * dt;
      if (s.zoneY < 0) (s.zoneY = 0), (s.zoneV = Math.abs(s.zoneV) * 0.3);
      if (s.zoneY > BAR_H - ZONE_H) (s.zoneY = BAR_H - ZONE_H), (s.zoneV = -Math.abs(s.zoneV) * 0.3);
      // the fish: picks a new target now and then, faster fish pick more often and dart further
      if (Math.random() < dt * (0.8 + fish.speed * 1.2)) s.fishTarget = Math.random() * (BAR_H - FISH_H);
      s.fishY += (s.fishTarget - s.fishY) * Math.min(1, dt * (1.8 + fish.speed * 2.2));
      const zoneTop = s.zoneY;
      const zoneBottom = s.zoneY + ZONE_H;
      const inside = s.fishY + FISH_H / 2 > zoneTop && s.fishY + FISH_H / 2 < zoneBottom;
      s.meter += (inside ? 0.22 : -0.16 - fish.size * 0.06) * dt;
      s.meter = Math.max(0, Math.min(1, s.meter));
      s.total += dt;
      if (inside) {
        s.inTime += dt;
        if (now - s.lastClick > 140) {
          s.lastClick = now;
          playReelClick();
        }
      }
      setZoneY(s.zoneY);
      setFishY(s.fishY);
      setMeter(s.meter);
      setInZone(inside);
      setTimeLeft(Math.max(0, REEL_SECONDS - s.t));
      if (!doneRef.current) {
        if (s.meter >= 1) {
          doneRef.current = true;
          const quality = Math.min(1, s.inTime / Math.max(1, s.total));
          setDone("caught");
          playSplash();
          onResult("caught", quality);
          return;
        }
        if (s.meter <= 0 || s.t >= REEL_SECONDS) {
          doneRef.current = true;
          setDone("lost");
          onResult("lost", 0);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // the sim reads the fish through its ref-free closure once; it never changes mid-game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fish]);

  const item = fish.item === "boot" ? { emoji: "🥾", name: "Old boot" } : ITEMS[fish.item];
  return (
    <Modal title="Something's on the line!" icon="🎣" onClose={onClose} width={420}>
      <div className="flex flex-col gap-3 pb-2">
        {done ? (
          <div className="clay-pop flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-6xl">{done === "caught" ? item.emoji : "💨"}</span>
            <b className="text-lg">{done === "caught" ? `You caught a ${item.name.toLowerCase()}!` : "It got away…"}</b>
            <span className="text-sm opacity-70">{done === "caught" ? "It's in your bucket. Bob and Oak buy fish." : "The line went slack. Cast again when you're ready."}</span>
            <button type="button" className="clay-btn clay-btn-amber mt-2" onClick={onClose}>
              Back to the water
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm opacity-80">Hold to lift the green zone, let go to drop it. Keep the fish inside to reel it in.</p>
            <div className="flex items-stretch justify-center gap-5">
              <div className="relative w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-sky-950/70" style={{ height: BAR_H }} aria-label="Reel bar">
                <div className={`absolute left-1 right-1 rounded-xl transition-colors ${inZone ? "bg-emerald-400/80" : "bg-emerald-300/40"}`} style={{ top: zoneY, height: ZONE_H }} />
                <div className="absolute left-0 right-0 text-center text-2xl leading-none" style={{ top: fishY, height: FISH_H, transform: inZone ? "scale(1.15)" : "none" }}>
                  {fish.item === "boot" ? "🥾" : "🐟"}
                </div>
              </div>
              <div className="flex w-6 shrink-0 flex-col justify-end overflow-hidden rounded-full bg-white/10" style={{ height: BAR_H }} aria-label="Catch meter">
                <div className="w-full rounded-full transition-[height] duration-100" style={{ height: `${meter * 100}%`, background: meter > 0.66 ? "#8fd3b6" : meter > 0.33 ? "#ffd166" : "#ec7fa3" }} />
              </div>
              <div className="flex flex-1 flex-col justify-between py-1 text-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Hooked</div>
                  <div className="text-lg font-extrabold">???</div>
                  <div className="opacity-70">{fish.water === "ocean" ? "Something from the sea" : "Something from the river"}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60">Line holds for</div>
                  <div className="text-2xl font-extrabold tabular-nums">{Math.ceil(timeLeft)}s</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="clay-btn clay-btn-amber min-h-14 select-none text-lg"
              onPointerDown={(e) => {
                e.preventDefault();
                holding.current = true;
              }}
              onPointerUp={() => (holding.current = false)}
              onPointerLeave={() => (holding.current = false)}
              onPointerCancel={() => (holding.current = false)}
            >
              🎣 Hold to reel
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
