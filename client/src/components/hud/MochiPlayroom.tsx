import { useEffect, useRef, useState } from "react";
import { MOCHI_ACTION_COOLDOWN_S, MOCHI_SCRITCH_COINS, type MochiAction } from "@shared/types";
import { Modal } from "./Modal";
import { playClick, playCoin, playMeow, playPurr } from "../../audio/sfx";

interface Props {
  result: { action: MochiAction; coins: number; cooldown: boolean } | null;
  onPlay: (action: MochiAction) => void;
  onClose: () => void;
}

const TOYS: { id: MochiAction; label: string; emoji: string; blurb: string }[] = [
  { id: "feather", label: "Feather wand", emoji: "🪶", blurb: "She pounces. Every time." },
  { id: "treat", label: "Treat", emoji: "🐟", blurb: "A tiny fish, gone in one bite." },
  { id: "scritch", label: "Chin scritches", emoji: "🤚", blurb: "Fill the purr meter for a thank-you." },
];

// Mochi's playroom: three ways to fuss over her, each on a short cooldown. The scritch meter
// fills as you rub; when it's full she drops a few coins she found somewhere, once a day.
export function MochiPlayroom({ result, onPlay, onClose }: Props) {
  const [meter, setMeter] = useState(0);
  const [mood, setMood] = useState("😺");
  const [cooldowns, setCooldowns] = useState<Partial<Record<MochiAction, number>>>({});
  const [now, setNow] = useState(Date.now());
  const rubbing = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!result) return;
    if (result.cooldown) {
      setMood("😾");
      return;
    }
    if (result.action === "feather") (setMood("😼"), playMeow());
    if (result.action === "treat") (setMood("😻"), playMeow());
    if (result.action === "scritch") {
      setMood("😽");
      playPurr();
      if (result.coins > 0) playCoin();
    }
    setCooldowns((c) => ({ ...c, [result.action]: Date.now() + MOCHI_ACTION_COOLDOWN_S * 1000 }));
    const t = window.setTimeout(() => setMood("😺"), 2500);
    return () => window.clearTimeout(t);
  }, [result]);

  // the purr meter: fills while the scritch button is held, then fires the action once
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMeter((m) => {
        const next = rubbing.current ? Math.min(1, m + 0.012) : Math.max(0, m - 0.004);
        if (next >= 1 && m < 1) {
          rubbing.current = false;
          onPlay("scritch");
          return 0;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPlay]);

  const left = (id: MochiAction) => Math.max(0, Math.ceil(((cooldowns[id] ?? 0) - now) / 1000));

  return (
    <Modal title="Mochi's Playroom" icon="🐱" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <span className={`text-7xl ${result && !result.cooldown && Date.now() - now < 3000 ? "cozy-coin-bump" : ""}`}>{mood}</span>
        {result?.cooldown && <span className="text-xs opacity-70">She needs a minute. Try something else.</span>}
        {result && !result.cooldown && result.action === "scritch" && (
          <span className="clay-pop text-sm font-bold text-amber-200">{result.coins > 0 ? `Purrrr… she drops ${result.coins} coins from somewhere. 🪙` : "Purrrr. That's the daily coin already claimed, but she loves you anyway."}</span>
        )}
        <div className="grid w-full grid-cols-2 gap-2">
          {TOYS.filter((t) => t.id !== "scritch").map((t) => (
            <button key={t.id} type="button" disabled={left(t.id) > 0} onClick={() => (playClick(), onPlay(t.id))} className="clay-btn clay-btn-rose min-h-16 flex-col gap-0 text-sm">
              <span className="text-2xl">{t.emoji}</span>
              {left(t.id) > 0 ? `${left(t.id)}s` : t.label}
            </button>
          ))}
        </div>
        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
            <span>Purr meter</span>
            <span>
              {MOCHI_SCRITCH_COINS[0]}–{MOCHI_SCRITCH_COINS[1]} 🪙 once a day
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-pink-300 to-amber-200" style={{ width: `${meter * 100}%` }} />
          </div>
          <button
            type="button"
            disabled={left("scritch") > 0}
            className="clay-btn clay-btn-amber mt-2 min-h-14 w-full select-none text-lg"
            onPointerDown={() => (rubbing.current = true)}
            onPointerUp={() => (rubbing.current = false)}
            onPointerLeave={() => (rubbing.current = false)}
            onPointerCancel={() => (rubbing.current = false)}
          >
            {left("scritch") > 0 ? `🤚 ${left("scritch")}s` : "🤚 Hold to scritch"}
          </button>
        </div>
        <p className="text-xs opacity-60">{TOYS[2].blurb}</p>
      </div>
    </Modal>
  );
}
