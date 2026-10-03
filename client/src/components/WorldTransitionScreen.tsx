import { useEffect, useMemo, useRef, useState } from "react";
import type { MapId } from "@shared/types";
import { MAP_LABELS } from "./hud/Header";

// The screen between worlds, dressed as the world you are going to (a trip is only yours: nobody
// else sees it). It fades in over the old world (FADE_S; a walk next door, through the campfire's
// archway or down the woods' adit, WALK_S), holds while you arrive, and fades out once the new
// world's first frames have settled behind it. The destination's icon, name and tagline sit on a card
// in its own dress, with a cozy tip (or, on a walk next door, the walk itself: "Entering the
// Whispering Woods...").
//
//   campfire_night      a starlit night (#0B0E14), orange embers rising, a warm oak card
//   cozy_lounge         a midnight city skyline, its windows lit, warm glows, a brass Art-Deco card
//   velvet_casino       black lacquer under gold Art-Deco sunburst rays, a glint of gilt
//   casino_vip          the burgundy velvet curtain sweeping shut and parting again (CURTAIN_S): the
//                       only world behind it
//   boxing_ring         sepia canvas cloth, a spotlight's beam down onto the card, chalk dust in it
//   whispering_woods    a misty pine green, maple leaves drifting down, a mossy card
//   glimmering_caverns  wet slate (#070A0F), cyan and violet crystal motes, wet-stone highlights, a
//                       miner's lantern swinging on the way down the adit
//
// (the worlds not built yet, never travelled to, have a plain dusk)

const CURTAIN_S = 0.35;
const FADE_S = 0.35;
const WALK_S = 0.3;
const CAMP = new Set<MapId>(["campfire_night", "whispering_woods"]);
const ADIT = new Set<MapId>(["whispering_woods", "glimmering_caverns"]);

const TIPS = [
  "Barnaby's prices change on the hour: his chalkboard shows what's ▲ up and ▼ down.",
  "Sell more than 30 of one kind in an hour and its price starts to slide. What nobody sells climbs back up!",
  "A King Size catch earns a gold crown in your Field Guide 👑",
  "Chat reaches every world: say hi to friends at the campfire from the casino.",
  "Chloe's cheval mirror lets you try an outfit on before you buy it.",
  "Feed the bonfire above 70% for the Cozy Aura: rarer fish and warmer coins for everyone.",
  "Hardwood sells for more than softwood, and carved pieces for more still.",
  "Mr. Vance changes coins into Velvet Chips (and back) one for one.",
  "A bowl of stew keeps you Well-Fed: a bouncier step and quicker bites.",
  "Water the lounge's plants once a day each for a few coins.",
  "Swing when the felling ring meets the gold: a critical swing, now and then a coin or a Pine Resin.",
  "A bigger tree's logs are worth more: size squared. Watch for a Colossal rising in the woods, and fell it together!",
  "A King-Size Surge's golden ripples: reel by hand in them for a 4 in 10 King Size catch.",
  "A Pine Resin in the workbench's Adhesive Slot bonds a carving so it can't break, or gilds it for a Masterwork.",
  "Bigger creels and carriers cost more each tier, but carry far more.",
  "In the Velvet Ring, dash just before a punch lands for a Perfect Dodge: your next punch is a Counter (x1.4).",
  "Three wins in a row at the Velvet Ring and the Championship Belt shines over your name for a day 🏆",
  "Watch the ringside chalkboard: bets on the next bout open in its 15-second countdown.",
  "Every rock in the Glimmering Caverns has a weak spot: watch for the glow in its cracks, the glint, the dust.",
  "Sixty seconds in the caverns' travertine terraces: the Deep Warmth, a quicker step on every map for 20 minutes ♨️",
  "Many hands on one rock and everyone takes home more: +40% for each friend who strikes it too.",
  "Down in the caverns, cast from anywhere along the Great Lake's shore: face the water and throw your line.",
];

type Particle = "ember" | "leaf" | "mote" | "glint" | "dust" | "none";
interface Theme {
  /** The backdrop's class (THEME_CSS). */
  scene: string;
  /** The card's class. */
  card: string;
  /** The heading's colour and the rule under it. */
  heading: string;
  rule: string;
  particle: Particle;
  count: number;
}

const THEMES: Partial<Record<MapId, Theme>> = {
  campfire_night: { scene: "tw-camp", card: "tw-card-oak", heading: "text-[#FFD9A0]", rule: "via-[#F5A623]/70", particle: "ember", count: 26 },
  cozy_lounge: { scene: "tw-lounge", card: "tw-card-brass", heading: "text-[#F3D08A]", rule: "via-[#E8C27A]/70", particle: "none", count: 0 },
  velvet_casino: { scene: "tw-casino", card: "tw-card-brass", heading: "text-[#F3D08A]", rule: "via-[#E8C27A]/70", particle: "glint", count: 18 },
  boxing_ring: { scene: "tw-ring", card: "tw-card-poster", heading: "text-[#F4E4C4]", rule: "via-[#E9D2A4]/70", particle: "dust", count: 22 },
  whispering_woods: { scene: "tw-woods", card: "tw-card-moss", heading: "text-[#E4F2C9]", rule: "via-[#A9D18E]/70", particle: "leaf", count: 16 },
  sunset_beach: { scene: "tw-beach", card: "tw-card-oak", heading: "text-[#FFE3B0]", rule: "via-[#FFB86B]/70", particle: "glint", count: 16 },
  open_sea: { scene: "tw-beach", card: "tw-card-oak", heading: "text-[#FFE3B0]", rule: "via-[#FFB86B]/70", particle: "glint", count: 20 },
  glimmering_caverns: { scene: "tw-caverns", card: "tw-card-slate", heading: "text-[#C8F6FF]", rule: "via-[#5BE7FF]/70", particle: "mote", count: 30 },
};
const DUSK: Theme = { scene: "tw-dusk", card: "tw-card-oak", heading: "text-[#FFD9A0]", rule: "via-[#F5A623]/70", particle: "none", count: 0 };

/** One trip's particles: where each starts, how big, how long it takes, when it starts. */
function particles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    s: 0.6 + Math.random() * 0.9,
    d: 2.4 + Math.random() * 3.2,
    delay: -Math.random() * 5,
    alt: i % 2,
  }));
}

export function WorldTransitionScreen({ destination, from }: { destination: MapId | null; from?: MapId }) {
  // stays mounted while it fades out again after arrival
  const [shown, setShown] = useState<MapId | null>(destination);
  const [closing, setClosing] = useState(false);
  // a walk next door (the campfire and the woods through the archway, the woods and the caverns down
  // the adit): the walk's line instead of a tip, and a quicker fade; decided as the trip starts
  const [walk, setWalk] = useState<"camp" | "adit" | null>(null);
  const tipIndex = useRef(Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    if (destination) {
      tipIndex.current = Math.floor(Math.random() * TIPS.length);
      if (!shown) setWalk(!from ? null : CAMP.has(from) && CAMP.has(destination) ? "camp" : ADIT.has(from) && ADIT.has(destination) ? "adit" : null);
      setShown(destination);
      setClosing(false);
      return;
    }
    if (!shown) return;
    setClosing(true);
    const t = window.setTimeout(
      () => {
        setShown(null);
        setClosing(false);
      },
      (shown === "casino_vip" ? CURTAIN_S : walk ? WALK_S : FADE_S) * 1000 + 40
    );
    return () => window.clearTimeout(t);
  }, [destination]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = useMemo(() => (shown ? MAP_LABELS[shown] : null), [shown]);
  const theme = shown ? (THEMES[shown] ?? DUSK) : DUSK;
  const bits = useMemo(() => particles(theme.count), [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown || !label) return null;

  // the Velvet Penthouse: the velvet curtain, and only there
  if (shown === "casino_vip") {
    const drape = `absolute top-0 h-full w-1/2 ${closing ? "cozy-curtain-open" : "cozy-curtain-close"}`;
    return (
      <div className="fixed inset-0 z-[60] overflow-hidden" role="status" aria-live="polite" aria-label={`Travelling to ${label.name}`}>
        <style>{CURTAIN_CSS}</style>
        <div className={`${drape} left-0 cozy-velvet`} style={{ transformOrigin: "left" }} data-side="l" />
        <div className={`${drape} right-0 cozy-velvet`} style={{ transformOrigin: "right" }} data-side="r" />
        <div className={`absolute inset-0 flex items-center justify-center p-6 ${closing ? "cozy-curtain-card-out" : "cozy-curtain-card-in"}`}>
          <div className="font-cozy flex max-w-[min(420px,90vw)] flex-col items-center gap-2 rounded-3xl border border-amber-300/50 bg-[#2a0a14]/85 px-6 py-5 text-center text-amber-50 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,215,140,0.15)]">
            <span className="text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" aria-hidden>
              {label.icon}
            </span>
            <b className="text-lg tracking-[0.18em] text-amber-200">{label.name.toUpperCase()}</b>
            <span className="text-xs opacity-80">{label.tagline}</span>
            <span className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
            <span className="text-[13px] leading-snug text-amber-100/90">💡 {TIPS[tipIndex.current]}</span>
          </div>
        </div>
      </div>
    );
  }

  const down = shown === "glimmering_caverns";
  const walkLine =
    walk === "adit" ? (down ? "Descending into the Glimmering Caverns..." : "Climbing back up to the Whispering Woods...") : walk === "camp" ? (shown === "whispering_woods" ? "Entering the Whispering Woods..." : "Back to the Starlight Campfire...") : null;
  const icon = walk === "adit" && down ? "🏮" : label.icon;
  const fade = walk ? "tw-walk" : "tw-fade";
  return (
    <div className={`fixed inset-0 z-[60] overflow-hidden ${theme.scene} ${fade} ${closing ? "tw-out" : "tw-in"}`} role="status" aria-live="polite" aria-label={walkLine ?? `Travelling to ${label.name}`}>
      <style>{THEME_CSS}</style>
      <span className="tw-layer" aria-hidden />
      {theme.particle !== "none" && (
        <span className="tw-particles" aria-hidden>
          {bits.map((b) => (
            <i key={b.key} className={`tw-${theme.particle}${b.alt ? " tw-alt" : ""}`} style={{ left: `${b.x}%`, top: theme.particle === "glint" || theme.particle === "dust" ? `${b.y}%` : undefined, ["--s" as string]: b.s, ["--y" as string]: b.y, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }} />
          ))}
        </span>
      )}
      <div className={`absolute inset-0 flex items-center justify-center p-6 ${closing ? "tw-card-out" : "tw-card-in"}`}>
        <div className={`font-cozy relative flex max-w-[min(420px,90vw)] flex-col items-center gap-2 rounded-3xl px-6 py-5 text-center ${theme.card}`}>
          <span className={`text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${walk === "adit" && down ? "tw-lantern" : ""}`} aria-hidden>
            {icon}
          </span>
          <b className={`text-lg tracking-[0.18em] ${theme.heading}`}>{label.name.toUpperCase()}</b>
          <span className="text-xs opacity-80">{label.tagline}</span>
          <span className={`mt-1 h-px w-24 bg-gradient-to-r from-transparent to-transparent ${theme.rule}`} />
          {walkLine ? <span className="text-[13px] font-bold tracking-[0.12em] opacity-95">{walkLine}</span> : <span className="text-[13px] leading-snug opacity-90">💡 {TIPS[tipIndex.current]}</span>}
        </div>
      </div>
    </div>
  );
}

/** The velvet curtain (the penthouse's trip; the update screens' card takes its fade-in too). */
export const CURTAIN_CSS = `
.cozy-velvet {
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 6px, rgba(255,255,255,0.04) 14px, rgba(0,0,0,0.22) 26px),
    radial-gradient(120% 90% at 50% 10%, #8e1b35 0%, #5c0c20 55%, #33040f 100%);
  box-shadow: inset 0 -26px 0 -18px #d7ad57, inset 0 -30px 24px rgba(0,0,0,0.45);
}
.cozy-velvet[data-side="l"] { box-shadow: inset -18px 0 30px rgba(0,0,0,0.45), inset 0 -26px 0 -18px #d7ad57; }
.cozy-velvet[data-side="r"] { box-shadow: inset 18px 0 30px rgba(0,0,0,0.45), inset 0 -26px 0 -18px #d7ad57; }
.cozy-curtain-close { animation: cozy-curtain-close ${CURTAIN_S}s cubic-bezier(0.55, 0.05, 0.35, 1) forwards; }
.cozy-curtain-open { animation: cozy-curtain-open ${CURTAIN_S}s cubic-bezier(0.55, 0.05, 0.35, 1) forwards; }
@keyframes cozy-curtain-close { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes cozy-curtain-open { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.cozy-curtain-card-in { animation: cozy-curtain-card-in ${CURTAIN_S}s ease-out ${CURTAIN_S * 0.6}s both; }
.cozy-curtain-card-out { animation: cozy-curtain-card-out ${CURTAIN_S * 0.6}s ease-in forwards; }
@keyframes cozy-curtain-card-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes cozy-curtain-card-out { to { opacity: 0; transform: scale(0.97); } }
@media (prefers-reduced-motion: reduce) {
  .cozy-curtain-close, .cozy-curtain-open, .cozy-curtain-card-in, .cozy-curtain-card-out { animation-duration: 1ms; }
}
`;

/** Every other world's dress. */
const THEME_CSS = `
.tw-in.tw-fade { animation: tw-in ${FADE_S}s ease-out forwards; }
.tw-out.tw-fade { animation: tw-out ${FADE_S}s ease-in forwards; }
.tw-in.tw-walk { animation: tw-in ${WALK_S}s ease-out forwards; }
.tw-out.tw-walk { animation: tw-out ${WALK_S}s ease-in forwards; }
@keyframes tw-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes tw-out { from { opacity: 1; } to { opacity: 0; } }
.tw-card-in { animation: tw-card-in ${FADE_S}s ease-out ${FADE_S * 0.5}s both; }
.tw-card-out { animation: tw-card-out ${FADE_S * 0.6}s ease-in forwards; }
@keyframes tw-card-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes tw-card-out { to { opacity: 0; transform: scale(0.97); } }
.tw-layer, .tw-particles { position: absolute; inset: 0; pointer-events: none; }
.tw-particles i { position: absolute; display: block; }

/* the campfire: a starlit night, embers rising */
.tw-camp {
  background:
    radial-gradient(1.2px 1.2px at 12% 18%, #fff8 50%, transparent 51%),
    radial-gradient(1px 1px at 28% 9%, #fff9 50%, transparent 51%),
    radial-gradient(1.4px 1.4px at 46% 22%, #fffa 50%, transparent 51%),
    radial-gradient(1px 1px at 63% 12%, #fff8 50%, transparent 51%),
    radial-gradient(1.3px 1.3px at 81% 26%, #fff9 50%, transparent 51%),
    radial-gradient(1px 1px at 91% 8%, #fff7 50%, transparent 51%),
    radial-gradient(1px 1px at 7% 36%, #fff6 50%, transparent 51%),
    radial-gradient(1.2px 1.2px at 71% 38%, #fff7 50%, transparent 51%),
    radial-gradient(70% 45% at 50% 105%, rgba(255, 120, 40, 0.35), rgba(255, 120, 40, 0) 70%),
    linear-gradient(#0B0E14 0%, #0f1420 60%, #1a1410 100%);
}
.tw-ember {
  bottom: -12px; width: calc(5px * var(--s)); height: calc(5px * var(--s)); border-radius: 50%;
  background: radial-gradient(circle, #fff1c4 0%, #ffb347 40%, #ff6a1a 75%, rgba(255, 80, 20, 0) 100%);
  box-shadow: 0 0 8px 2px rgba(255, 140, 40, 0.65);
  animation-name: tw-rise; animation-timing-function: linear; animation-iteration-count: infinite;
}
@keyframes tw-rise {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translate(18px, -50vh) scale(0.85); }
  100% { transform: translate(-10px, -105vh) scale(0.4); opacity: 0; }
}
.tw-card-oak {
  color: #F7EBE1;
  background:
    repeating-linear-gradient(92deg, rgba(0,0,0,0.12) 0 2px, rgba(255,255,255,0.03) 3px 9px, rgba(0,0,0,0.08) 10px 14px),
    linear-gradient(160deg, #6b4428 0%, #4a2e1a 55%, #36200f 100%);
  border: 2px solid #C98B3E;
  box-shadow: 0 22px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255, 140, 40, 0.25), inset 0 0 0 1px rgba(255, 215, 150, 0.2);
}

/* the lounge: a midnight city skyline, its windows lit */
.tw-lounge {
  background:
    radial-gradient(40% 30% at 20% 30%, rgba(255, 176, 90, 0.22), rgba(255, 176, 90, 0) 70%),
    radial-gradient(35% 28% at 82% 22%, rgba(255, 200, 120, 0.16), rgba(255, 200, 120, 0) 70%),
    linear-gradient(#090d24 0%, #1b1840 45%, #3a2750 75%, #5a3450 100%);
}
.tw-lounge .tw-layer {
  top: auto; height: 42%;
  background:
    radial-gradient(2px 2.5px at 10% 30%, #ffd27a 60%, transparent 62%),
    radial-gradient(2px 2.5px at 13% 52%, #ffc766 60%, transparent 62%),
    radial-gradient(2px 2.5px at 27% 44%, #ffd27a 60%, transparent 62%),
    radial-gradient(2px 2.5px at 36% 22%, #ffdb8f 60%, transparent 62%),
    radial-gradient(2px 2.5px at 41% 60%, #ffc766 60%, transparent 62%),
    radial-gradient(2px 2.5px at 57% 38%, #ffd27a 60%, transparent 62%),
    radial-gradient(2px 2.5px at 66% 18%, #ffdb8f 60%, transparent 62%),
    radial-gradient(2px 2.5px at 74% 50%, #ffc766 60%, transparent 62%),
    radial-gradient(2px 2.5px at 88% 34%, #ffd27a 60%, transparent 62%),
    radial-gradient(2px 2.5px at 93% 62%, #ffdb8f 60%, transparent 62%),
    linear-gradient(#100e22, #0a0916);
  clip-path: polygon(0 40%, 6% 40%, 6% 62%, 8% 62%, 8% 18%, 17% 18%, 17% 55%, 19% 55%, 19% 34%, 25% 34%, 25% 8%, 33% 8%, 33% 48%, 34% 48%, 34% 26%, 45% 26%, 45% 58%, 47% 58%, 47% 12%, 60% 12%, 60% 42%, 64% 42%, 64% 60%, 66% 60%, 66% 4%, 78% 4%, 78% 50%, 80% 50%, 80% 28%, 90% 28%, 90% 20%, 100% 20%, 100% 100%, 0 100%);
}
.tw-card-brass {
  color: #F5EBDD;
  background: linear-gradient(160deg, #1a1414 0%, #0e0b0c 100%);
  border: 2px solid #C9A25A;
  box-shadow: 0 22px 60px rgba(0,0,0,0.65), 0 0 36px rgba(255, 190, 110, 0.18), inset 0 0 0 4px #0e0b0c, inset 0 0 0 5px rgba(201, 162, 90, 0.55);
}
.tw-card-brass::before, .tw-card-brass::after {
  content: ""; position: absolute; top: -14px; width: 48px; height: 22px;
  background: repeating-conic-gradient(from 270deg at 50% 100%, #C9A25A 0deg 6deg, transparent 6deg 18deg);
  -webkit-mask: radial-gradient(circle at 50% 100%, #000 0 22px, transparent 23px);
  mask: radial-gradient(circle at 50% 100%, #000 0 22px, transparent 23px);
}
.tw-card-brass::before { left: 18px; }
.tw-card-brass::after { right: 18px; }

/* the casino: black lacquer under gold sunburst rays */
.tw-casino {
  background:
    radial-gradient(60% 50% at 50% 100%, rgba(170, 30, 60, 0.35), rgba(170, 30, 60, 0) 70%),
    linear-gradient(#0c0a08 0%, #140d0e 70%, #1e0c12 100%);
}
.tw-casino .tw-layer {
  background: repeating-conic-gradient(from 180deg at 50% 115%, rgba(226, 184, 104, 0.22) 0deg 1.2deg, rgba(0,0,0,0) 1.2deg 7.5deg);
  -webkit-mask: radial-gradient(95% 90% at 50% 115%, #000 25%, transparent 80%);
  mask: radial-gradient(95% 90% at 50% 115%, #000 25%, transparent 80%);
}
.tw-glint {
  width: calc(10px * var(--s)); height: calc(10px * var(--s));
  background: radial-gradient(circle, #fff6d8 0%, rgba(255, 214, 120, 0.9) 18%, rgba(255, 214, 120, 0) 60%);
  clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%);
  animation-name: tw-twinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate;
}
@keyframes tw-twinkle { from { opacity: 0.1; transform: scale(0.6) rotate(0deg); } to { opacity: 1; transform: scale(1.1) rotate(25deg); } }

/* the Velvet Ring: sepia canvas cloth, a spotlight's beam onto the card */
.tw-ring {
  background:
    radial-gradient(90% 80% at 50% 45%, rgba(0,0,0,0) 40%, rgba(40, 24, 10, 0.75) 100%),
    repeating-linear-gradient(0deg, rgba(90, 60, 30, 0.07) 0 1px, rgba(0,0,0,0) 1px 4px),
    repeating-linear-gradient(90deg, rgba(90, 60, 30, 0.07) 0 1px, rgba(0,0,0,0) 1px 4px),
    linear-gradient(#cdb28a 0%, #b89868 55%, #8e7048 100%);
}
.tw-ring .tw-layer {
  background: linear-gradient(180deg, rgba(255, 246, 220, 0.55) 0%, rgba(255, 240, 205, 0.18) 70%, rgba(255, 240, 205, 0) 100%);
  clip-path: polygon(44% 0, 56% 0, 78% 100%, 22% 100%);
  filter: blur(6px);
}
.tw-dust {
  width: calc(3px * var(--s)); height: calc(3px * var(--s)); border-radius: 50%;
  background: rgba(255, 250, 235, 0.85);
  animation-name: tw-drift; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate;
}
.tw-ring .tw-particles { clip-path: polygon(40% 0, 60% 0, 80% 100%, 20% 100%); }
@keyframes tw-drift { from { transform: translate(-8px, -6px); opacity: 0.25; } to { transform: translate(10px, 12px); opacity: 0.9; } }
.tw-card-poster {
  color: #F4E4C4;
  background: linear-gradient(170deg, #3a2716 0%, #24170c 100%);
  border: 2px solid #E9D2A4;
  box-shadow: 0 22px 60px rgba(40, 20, 5, 0.65), 0 0 60px rgba(255, 240, 200, 0.35), inset 0 0 0 4px #24170c, inset 0 0 0 5px rgba(233, 210, 164, 0.5);
}

/* Sunset Beach: a long amber sunset over the sea, the sun's glitter on the water */
.tw-beach {
  background:
    radial-gradient(34% 26% at 50% 58%, rgba(255, 236, 170, 0.95), rgba(255, 190, 110, 0.5) 45%, rgba(255, 150, 90, 0) 75%),
    linear-gradient(#35305f 0%, #8a4a78 26%, #e8795a 46%, #ffb86b 58%, #2e8a9c 58.4%, #1c5f7c 78%, #123f5c 100%);
}
.tw-beach .tw-layer {
  inset: 0;
  background:
    linear-gradient(0deg, rgba(10, 30, 46, 0.75) 0%, rgba(10, 30, 46, 0) 30%),
    repeating-linear-gradient(0deg, rgba(255, 226, 170, 0.0) 0px, rgba(255, 226, 170, 0.0) 9px, rgba(255, 226, 170, 0.22) 10px, rgba(255, 226, 170, 0.0) 12px);
  -webkit-mask-image: radial-gradient(22% 40% at 50% 80%, #000 0%, transparent 100%);
  mask-image: radial-gradient(22% 40% at 50% 80%, #000 0%, transparent 100%);
  animation: tw-mist 3s ease-in-out infinite alternate;
}

/* the Whispering Woods: misty pine green, maple leaves drifting down */
.tw-woods {
  background:
    radial-gradient(60% 30% at 20% 75%, rgba(220, 235, 215, 0.2), rgba(220, 235, 215, 0) 70%),
    radial-gradient(55% 28% at 80% 40%, rgba(210, 228, 205, 0.16), rgba(210, 228, 205, 0) 70%),
    linear-gradient(#2d4a37 0%, #1d3526 50%, #0f2219 100%);
}
.tw-woods .tw-layer {
  inset: -10%;
  background:
    linear-gradient(0deg, rgba(8, 20, 12, 0.9) 0%, rgba(8, 20, 12, 0) 35%),
    conic-gradient(from 155deg at 7% 42%, #0e2416 0deg 50deg, transparent 50deg),
    conic-gradient(from 158deg at 19% 60%, #14301e 0deg 44deg, transparent 44deg),
    conic-gradient(from 158deg at 82% 56%, #14301e 0deg 44deg, transparent 44deg),
    conic-gradient(from 155deg at 95% 38%, #0e2416 0deg 50deg, transparent 50deg);
  filter: blur(1.5px);
  animation: tw-mist 4s ease-in-out infinite alternate;
}
@keyframes tw-mist { from { transform: translateX(-1.5%); } to { transform: translateX(1.5%); } }
.tw-leaf {
  top: -24px; width: calc(14px * var(--s)); height: calc(14px * var(--s));
  background: linear-gradient(135deg, #f3a53c 0%, #d9582a 60%, #a8341c 100%);
  border-radius: 0 70% 0 70%;
  box-shadow: inset 0 0 0 1px rgba(90, 30, 10, 0.3);
  animation-name: tw-fall; animation-timing-function: linear; animation-iteration-count: infinite;
}
.tw-leaf.tw-alt { background: linear-gradient(135deg, #f7cd5a 0%, #e08a2e 70%, #b85a1c 100%); }
@keyframes tw-fall {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  35% { transform: translate(28px, 36vh) rotate(140deg); }
  70% { transform: translate(-22px, 74vh) rotate(260deg); }
  100% { transform: translate(14px, 110vh) rotate(380deg); opacity: 0.85; }
}
.tw-card-moss {
  color: #EEF5E4;
  background: linear-gradient(165deg, #4b3726 0%, #33241a 100%);
  border: 3px solid #5f8a3e;
  box-shadow: 0 22px 60px rgba(0,0,0,0.6), inset 0 0 0 2px #3c5e27, inset 0 -8px 18px rgba(95, 138, 62, 0.35), 0 0 40px rgba(169, 209, 142, 0.18);
}

/* the Glimmering Caverns: wet slate, crystal motes */
.tw-caverns {
  background:
    radial-gradient(45% 35% at 22% 70%, rgba(0, 240, 255, 0.12), rgba(0, 240, 255, 0) 70%),
    radial-gradient(40% 32% at 78% 30%, rgba(157, 0, 255, 0.14), rgba(157, 0, 255, 0) 70%),
    radial-gradient(120% 90% at 50% 40%, #0c111a 0%, #070A0F 60%, #05070b 100%);
}
.tw-caverns .tw-layer {
  background:
    linear-gradient(160deg, rgba(0,0,0,0) 0 18%, rgba(190, 230, 255, 0.08) 18% 19%, rgba(0,0,0,0) 19% 100%),
    linear-gradient(200deg, rgba(0,0,0,0) 0 55%, rgba(190, 230, 255, 0.07) 55% 56%, rgba(0,0,0,0) 56% 100%),
    linear-gradient(140deg, rgba(0,0,0,0) 0 78%, rgba(190, 230, 255, 0.06) 78% 79%, rgba(0,0,0,0) 79% 100%);
  -webkit-mask: radial-gradient(70% 60% at 50% 50%, transparent 25%, #000 75%);
  mask: radial-gradient(70% 60% at 50% 50%, transparent 25%, #000 75%);
  filter: blur(3px);
  opacity: 0.55;
  animation: tw-sheen 2.6s ease-in-out infinite alternate;
}
@keyframes tw-sheen { from { opacity: 0.25; } to { opacity: 0.6; } }
.tw-mote {
  bottom: -10px; width: calc(4px * var(--s)); height: calc(4px * var(--s)); border-radius: 50%;
  background: #7ff3ff; box-shadow: 0 0 10px 3px rgba(0, 240, 255, 0.6);
  animation-name: tw-float; animation-timing-function: ease-in-out; animation-iteration-count: infinite;
}
.tw-mote.tw-alt { background: #cf8cff; box-shadow: 0 0 10px 3px rgba(157, 0, 255, 0.6); }
@keyframes tw-float {
  0% { transform: translate(0, 0); opacity: 0; }
  20% { opacity: 1; }
  50% { transform: translate(-14px, -50vh); opacity: 0.4; }
  75% { opacity: 1; }
  100% { transform: translate(10px, -102vh); opacity: 0; }
}
.tw-card-slate {
  color: #E3F4F8;
  background: linear-gradient(160deg, #1b2230 0%, #10151f 100%);
  border: 2px solid rgba(91, 231, 255, 0.65);
  box-shadow: 0 22px 60px rgba(0,0,0,0.7), 0 0 34px rgba(0, 240, 255, 0.22), 0 0 60px rgba(157, 0, 255, 0.12), inset 0 1px 0 rgba(200, 240, 255, 0.18);
}
.tw-lantern {
  transform-origin: 50% 0%;
  filter: drop-shadow(0 0 12px rgba(255, 179, 71, 0.85)) drop-shadow(0 0 28px rgba(255, 140, 60, 0.45));
  animation: tw-lantern 1.1s ease-in-out infinite alternate;
}
@keyframes tw-lantern { from { transform: rotate(-9deg); } to { transform: rotate(9deg); } }

/* a world not built yet: a plain dusk */
.tw-dusk { background: radial-gradient(90% 70% at 50% 45%, #3a2a22 0%, #231915 60%, #140e0b 100%); }

@media (prefers-reduced-motion: reduce) {
  .tw-in, .tw-out, .tw-card-in, .tw-card-out { animation-duration: 1ms !important; }
  .tw-particles i, .tw-layer, .tw-lantern { animation: none !important; }
  /* (held still, the particles scattered where they would be mid-flight) */
  .tw-ember, .tw-mote { transform: translateY(calc(var(--y) * -0.95vh)); opacity: 0.85; }
  .tw-leaf { transform: translateY(calc(var(--y) * 0.95vh + 24px)) rotate(calc(var(--y) * 3.6deg)); }
}
`;
