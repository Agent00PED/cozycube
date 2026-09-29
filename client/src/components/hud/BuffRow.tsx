import { useEffect, useState } from "react";
import { BUFFS } from "@shared/crafting";
import { BUFF_KEYS, WELL_FED_S, type FishingProfile } from "@shared/fishing";
import { DEEP_WARMTH_MS } from "@shared/caverns_mining";
import { EAGLE_EYE_MS } from "@shared/economy";

// Your own buffs, as a row of countdown pills in the top-left corner under the header, on every map:
// each consumable's (a S'more, Grip Wax, Sap Ointment, a Scent Pouch, Glow-Spore Chum, Feller's Pine
// Pitch, Phosphor Glow Bait, Miner's Stout), the Deep Warmth off a soak in the caverns' warm pools, the
// Campfire Stew's Well-Fed and the slingshot's Eagle Eye. Each pill wears a thin bar draining with its
// clock; using the same thing again refreshes its clock (never stacks it). The room's shared wonders
// (a surge, a Colossal, the incense) keep their own badge under the header's middle (WonderBadge).

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

interface Pill {
  key: string;
  emoji: string;
  name: string;
  blurb: string;
  until: number;
  /** Its whole length (ms), for the bar. */
  ms: number;
  tone: string;
}

export function BuffRow({ profile }: { profile: FishingProfile }) {
  const [, tick] = useState(0);
  const now = Date.now();
  const pills: Pill[] = [
    ...BUFF_KEYS.filter((k) => (profile.buffs[k] ?? 0) > now).map((k) => ({ key: k, emoji: BUFFS[k].emoji, name: BUFFS[k].name, blurb: BUFFS[k].blurb, until: profile.buffs[k] ?? 0, ms: BUFFS[k].ms, tone: "#f5c46b" })),
    ...(profile.deepWarmthUntil > now ? [{ key: "warmth", emoji: "♨️", name: "Deep Warmth", blurb: "+15% walking pace everywhere, +20% fracture radius, stamina back 25% sooner in the ring", until: profile.deepWarmthUntil, ms: DEEP_WARMTH_MS, tone: "#fdba74" }] : []),
    ...(profile.fedUntil > now ? [{ key: "fed", emoji: "🍲", name: "Well-Fed", blurb: "From the Campfire Stew", until: profile.fedUntil, ms: WELL_FED_S * 1000, tone: "#F5A623" }] : []),
    ...(profile.eagleUntil > now ? [{ key: "eagle", emoji: "🦅", name: "Eagle Eye", blurb: "The slingshot gallery's prize", until: profile.eagleUntil, ms: EAGLE_EYE_MS, tone: "#8fd3b6" }] : []),
  ];
  const on = pills.length > 0;
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed z-[34] flex max-w-[min(360px,calc(100vw-24px))] flex-wrap gap-1" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 58px)", left: "max(10px, env(safe-area-inset-left))" }} role="status" aria-label="Your buffs">
      {pills.map((p) => {
        const s = Math.max(0, Math.ceil((p.until - now) / 1000));
        const left = Math.max(0, Math.min(1, (p.until - now) / p.ms));
        return (
          <div key={p.key} className="clay-pop pointer-events-auto relative flex items-center gap-1 overflow-hidden whitespace-nowrap rounded-full border bg-[#231B18]/88 py-0.5 pl-1.5 pr-2 text-[11px] font-bold text-[#F7EBE1] shadow" style={{ borderColor: `${p.tone}88` }} title={`${p.name}: ${p.blurb}`}>
            <span aria-hidden>{p.emoji}</span>
            <span className="tabular-nums" style={{ color: p.tone }}>
              {mmss(s)}
            </span>
            <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left" style={{ background: p.tone, transform: `scaleX(${left.toFixed(3)})` }} />
          </div>
        );
      })}
    </div>
  );
}
