import { useEffect, useRef, useState } from "react";
import { DRINK_BASES, DRINK_BASE_INFO, DRINK_TOPPINGS, DRINK_TOPPING_INFO, KITCHEN_BREW_SECONDS, type DrinkBase, type DrinkTopping, type KitchenPacket } from "@shared/types";
import { Modal } from "./Modal";

interface Props {
  send: (packet: KitchenPacket) => void;
  onClose: () => void;
}

// The kitchenette: brew a drink in two taps. Pick the base (coffee, matcha or milk tea), then the
// topping, then Brew: a short brewing animation with bubbling (and a little bubbling sound), and
// the drink is poured into your avatar's mug (KITCHEN_BREW). You carry it, sipping now and then,
// until you put it down or brew another.
export function KitchenModal({ send, onClose }: Props) {
  const [base, setBase] = useState<DrinkBase | null>(null);
  const [topping, setTopping] = useState<DrinkTopping | null>(null);
  const [phase, setPhase] = useState<"base" | "topping" | "brewing" | "done">("base");
  const [progress, setProgress] = useState(0);
  const sound = useRef<AudioContext | null>(null);

  // the brewing animation: fill the gauge over KITCHEN_BREW_SECONDS, then pour
  useEffect(() => {
    if (phase !== "brewing" || !base || !topping) return;
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / (KITCHEN_BREW_SECONDS * 1000));
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
      else {
        send({ type: "KITCHEN_BREW", base, topping });
        setPhase("done");
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, base, topping, send]);

  // the bubbling sound lives only as long as the modal
  useEffect(
    () => () => {
      void sound.current?.close();
      sound.current = null;
    },
    []
  );

  const brew = () => {
    setProgress(0);
    setPhase("brewing");
    sound.current = playBubbles(sound.current);
  };
  const again = () => {
    setBase(null);
    setTopping(null);
    setPhase("base");
  };

  const name = base && topping ? `${DRINK_TOPPING_INFO[topping].name} ${DRINK_BASE_INFO[base].name}` : "";
  return (
    <Modal title="Kitchenette" icon="☕" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        {/* the two steps */}
        <div className="flex items-center justify-center gap-2 text-xs font-semibold">
          <StepDot n={1} label="Base" on={phase === "base"} done={phase !== "base"} />
          <span className="h-px w-8 bg-white/20" />
          <StepDot n={2} label="Topping" on={phase === "topping"} done={phase === "brewing" || phase === "done"} />
        </div>

        {phase === "base" && (
          <div className="grid grid-cols-3 gap-2">
            {DRINK_BASES.map((b) => (
              <Choice key={b} emoji={DRINK_BASE_INFO[b].emoji} label={DRINK_BASE_INFO[b].name} note={DRINK_BASE_INFO[b].note} on={base === b} onClick={() => (setBase(b), setPhase("topping"))} />
            ))}
          </div>
        )}

        {phase === "topping" && base && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {DRINK_TOPPINGS.map((t) => (
                <Choice key={t} emoji={DRINK_TOPPING_INFO[t].emoji} label={DRINK_TOPPING_INFO[t].name} on={topping === t} onClick={() => setTopping(t)} />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="clay-btn clay-btn-ghost min-h-11 flex-1" onClick={() => setPhase("base")}>
                ← Back
              </button>
              <button type="button" className="clay-btn clay-btn-amber min-h-11 flex-[2]" disabled={!topping} onClick={brew}>
                ☕ Brew
              </button>
            </div>
          </>
        )}

        {(phase === "brewing" || phase === "done") && base && topping && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-5xl">
              <span className={phase === "brewing" ? "cozy-bob" : ""}>{DRINK_BASE_INFO[base].emoji}</span>
              {phase === "brewing" &&
                [0, 1, 2, 3].map((i) => (
                  <span key={i} className="cozy-bubble-rise absolute bottom-3 h-2.5 w-2.5 rounded-full bg-white/60" style={{ left: `${30 + i * 13}%`, animationDelay: `${i * 0.28}s` }} />
                ))}
            </div>
            <div className="h-3 w-full max-w-[260px] overflow-hidden rounded-full bg-black/30">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-amber-400 transition-[width] duration-75" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="text-sm font-semibold">{phase === "brewing" ? `Brewing your ${name}…` : `Enjoy your ${name}! ${DRINK_TOPPING_INFO[topping].emoji}`}</div>
            {phase === "done" && (
              <div className="flex gap-2">
                <button type="button" className="clay-btn clay-btn-ghost min-h-11" onClick={again}>
                  Brew another
                </button>
                <button type="button" className="clay-btn clay-btn-amber min-h-11" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StepDot({ n, label, on, done }: { n: number; label: string; on: boolean; done: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${on ? "text-amber-200" : done ? "text-emerald-200" : "opacity-50"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${on ? "bg-amber-300 text-amber-950" : done ? "bg-emerald-300/80 text-emerald-950" : "bg-white/10"}`}>{done ? "✓" : n}</span>
      {label}
    </span>
  );
}

function Choice({ emoji, label, note, on, onClick }: { emoji: string; label: string; note?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-3xl p-2 text-center transition-transform duration-150 active:scale-95 ${on ? "bg-amber-300/20 ring-2 ring-amber-300/70" : "bg-white/5 hover:bg-white/10"}`}>
      <span className="text-3xl leading-none">{emoji}</span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {note && <span className="text-[10px] leading-tight opacity-60">{note}</span>}
    </button>
  );
}

/** A soft bubbling while it brews: little sine blips, rising. The context is closed with the modal. */
function playBubbles(existing: AudioContext | null): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return existing;
  const ctx = existing ?? new Ctx();
  const now = ctx.currentTime;
  for (let i = 0; i < 14; i++) {
    const t = now + 0.08 + (i / 14) * KITCHEN_BREW_SECONDS + Math.random() * 0.05;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(420 + Math.random() * 420, t);
    o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 500, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
    o.onended = () => (o.disconnect(), g.disconnect());
  }
  return ctx;
}
