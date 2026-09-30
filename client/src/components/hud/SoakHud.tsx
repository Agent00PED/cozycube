import { useEffect, useRef, useState } from "react";
import { BREATH_BONUS_MS, BREATH_MAX, BREATH_S, BREATH_WINDOW_S, CAVERNS_CHANNELS, SOAK_S, breathFill, type SoakBreath } from "@shared/caverns_mining";
import type { PlayerState } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { tipDue, tipMastered, tipSeen } from "./firstTips";

// The springs' breathing (docs/caverns-roadmap.md phase 4; the rules in shared/caverns_mining.ts):
// while you soak in the terraces' warm pools, a slow ring swells and ebbs on the right of the screen
// (clear of the joystick and the dock). Tap it as it is fullest and that is a deep breath: a minute
// more of the Deep Warmth, up to BREATH_MAX a soak. Entirely optional: sitting still soaks as before.
//
// The ring's clock runs from the moment you are seen soaking (the server's own soak starts on the
// same tick); a tap goes up with the time this side measured on it.

export function SoakHud({ player, send, subscribeMessages }: { player: PlayerState; send: (channel: string, packet?: unknown) => void; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const soaking = player.map === "glimmering_caverns" && player.sitting && player.action === "soak";
  const since = useRef(0);
  const progress = useRef(player.actionProgress);
  progress.current = player.actionProgress;
  const ring = useRef<HTMLDivElement>(null);
  /** The breath last tapped in (one try a breath: the ring dims till the next one begins). */
  const tapped = useRef(-1);
  const word = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const [pop, setPop] = useState<{ at: number; deep: boolean } | null>(null);
  const [tip, setTip] = useState(false);

  // the soak's clock, from when it is first seen (a soak already under way: from its progress)
  useEffect(() => {
    if (!soaking) return;
    since.current = performance.now() - progress.current * SOAK_S * 1000;
    tapped.current = -1;
    setN(0);
    setPop(null);
    const due = tipDue("soak");
    setTip(due);
    if (due) tipSeen("soak");
  }, [soaking]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "soakBreath") return;
        const b = payload as SoakBreath;
        setN(b.n);
        setPop({ at: performance.now(), deep: b.deep });
        if (b.deep) {
          playSfx("bubble", 0.7);
          if (b.n >= 3) {
            tipMastered("soak");
            setTip(false);
          }
        }
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => setPop((p) => (p === pop ? null : p)), 1600);
    return () => window.clearTimeout(t);
  }, [pop]);
  // the ring breathing (outside React: a frame's)
  useEffect(() => {
    if (!soaking) return;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - since.current) / 1000;
      const f = breathFill(t);
      const top = Math.abs(t - (Math.floor(t / BREATH_S) + 0.5) * BREATH_S) <= BREATH_WINDOW_S;
      if (ring.current) {
        ring.current.style.opacity = Math.floor(t / BREATH_S) === tapped.current ? "0.45" : "1";
        ring.current.style.transform = `scale(${(0.5 + 0.5 * f).toFixed(3)})`;
        ring.current.style.boxShadow = top ? "0 0 0 3px #fff6d8, 0 0 28px rgba(255, 214, 140, 0.9)" : "0 0 0 2px rgba(255, 240, 220, 0.55), 0 0 14px rgba(160, 220, 255, 0.35)";
        ring.current.style.background = top ? "radial-gradient(circle, rgba(255, 226, 170, 0.55), rgba(255, 180, 120, 0.2))" : "radial-gradient(circle, rgba(190, 230, 255, 0.35), rgba(120, 180, 220, 0.12))";
      }
      if (word.current) {
        const rising = (((t % BREATH_S) + BREATH_S) % BREATH_S) < BREATH_S / 2;
        word.current.textContent = top ? "Now!" : rising ? "in…" : "…out";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [soaking]);

  if (!soaking) return null;
  const breathe = () => {
    const ms = performance.now() - since.current;
    const k = Math.floor(ms / 1000 / BREATH_S);
    if (k === tapped.current) return;
    tapped.current = k;
    send(CAVERNS_CHANNELS.onsen, { breath: Math.round(ms) });
  };
  const full = n >= BREATH_MAX;
  return (
    <div className="pointer-events-none fixed z-30 flex flex-col items-center gap-1.5" style={{ right: "max(14px, env(safe-area-inset-right))", bottom: "calc(max(12px, env(safe-area-inset-bottom)) + 150px)" }}>
      {tip && <div className="w-[min(60vw,220px)] rounded-2xl bg-stone-900/80 px-3 py-1.5 text-center text-[12px] font-semibold text-amber-100 outline outline-1 -outline-offset-1 outline-amber-200/25 backdrop-blur">Breathe with the ring: tap as it is fullest for a minute more of the Deep Warmth</div>}
      {pop && (
        <div key={pop.at} className="rounded-full bg-stone-900/80 px-3 py-1 text-[12px] font-extrabold" style={{ color: pop.deep ? "#ffe8b0" : "#c9d6e0", animation: "clay-pop 0.35s both" }}>
          {pop.deep ? `🫧 Deep breath · +${BREATH_BONUS_MS / 60_000} min` : "Not quite: tap as it's fullest"}
        </div>
      )}
      <button
        type="button"
        onPointerDown={breathe}
        disabled={full}
        aria-label={full ? "Fully relaxed" : "Breathe (tap as the ring is fullest)"}
        className="pointer-events-auto relative grid size-[clamp(84px,14vmin,112px)] place-items-center rounded-full bg-stone-900/45 outline outline-1 -outline-offset-1 outline-white/15 backdrop-blur-sm disabled:opacity-60"
        style={{ touchAction: "none" }}
      >
        <div ref={ring} className="absolute inset-1 rounded-full" style={{ transition: "box-shadow 120ms, background 120ms" }} />
        <span className="relative flex flex-col items-center leading-tight text-stone-50">
          <span className="text-[20px]">{full ? "😌" : "♨️"}</span>
          <span ref={word} className="text-[11px] font-bold" />
        </span>
      </button>
      <span className="rounded-full bg-stone-900/70 px-2 py-0.5 text-[11px] font-bold tabular-nums text-stone-100">
        {full ? "Fully relaxed" : "Deep breaths"} {n}/{BREATH_MAX}
      </span>
    </div>
  );
}
