import { useEffect, useRef, useState } from "react";
import { FORGED_TOOLS, FORGED_TOOL_IDS, forgedBlocked, forgedOwned, makingsList, type ForgedToolId } from "@shared/expedition";
import {
  BELLOWS_HOLD_S,
  BELLOWS_LIMIT_S,
  CAVERNS_CHANNELS,
  FORGE_BATCHES,
  FORGE_QUEUE_MAX,
  FORGE_RECIPES,
  FORGE_RELICS,
  FORGE_SMELT_S,
  HAMMER_BEAT_S,
  HAMMER_STRIKES,
  HAMMER_WINDOW_S,
  HOLD_PUMPS_PER_S,
  INGOT_IDS,
  MASTERWORK_OF,
  MINING_RELIC_IDS,
  ORE_ITEMS,
  ORE_ITEM_IDS,
  QUICK_SMELT_ORDER,
  bandAt,
  forgeHeatAt,
  hammerBeats,
  smeltable,
  type CavernsResult,
  type ForgeBatch,
  type ForgeGame,
  type ForgeResult,
  type IngotId,
  type MiningRelicId,
  type OreItemId,
} from "@shared/caverns_mining";
import { satchelCountFor, satchelCounts } from "@shared/satchel";
import { materialCount, type FishingProfile } from "@shared/fishing";
import { GEAR } from "@shared/gear";
import { marketMultiplier, oreGood, parseMarket } from "@shared/market";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playCaveSfx } from "../../audio/cavernAmbience";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { TrendBadge } from "./ShopShell";
import { activity, nowS } from "../../systems/activityStore";
import { GradeStars, WorkSheet } from "./WorkSheet";
import { FORGE_SPOT, frameWork } from "../../scene/workSpots";
import { tipDue, tipMastered, tipSeen } from "./firstTips";
import { flyToBag } from "./flyToBag";

// The Thermal Bellows Forge in its basalt cleft at the Expedition Basecamp, in three tabs:
//
//   🔥 Bellows      a batch of 1, 3 or 5 ingots worked by hand (its ore and coal out of the satchel as
//                   it starts, all back if it is given up), played at the forge itself: the camera
//                   frames it and you (workSpots.ts), the game in a sheet at the foot (WorkSheet).
//                   Pump the bellows (hold the round button for a steady draw, tap for a puff) to keep
//                   the heat's needle in the gold band on the arc as it drifts (a bigger batch swings
//                   it wider and quicker) for four seconds running; then the glowing ingot, a ring
//                   closing on it for each of two hammer strikes. Graded: Masterwork (both clean,
//                   +25% at Gus's), Fine (the heat held: the batch's coal back), Plain. The heat is
//                   simulated here live by the very function the server replays the log with
//   ⚡ Quick Smelt  plain ingots on the forge's own clock (an ingot every FORGE_SMELT_S seconds, into
//                   the satchel, or its tray when the satchel is full), Quick Smelt All
//   🧿 Relics       the four mining relics, forged once each from ingots, gems and Fine Stone Dust

interface Props {
  profile: FishingProfile;
  coins: number;
  market: string;
  send: (channel: string, packet?: unknown) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

type Tab = "bellows" | "smelt" | "relics" | "expedition";

export function ForgeModal({ profile, coins, market, send, subscribeMessages, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("bellows");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [game, setGame] = useState<ForgeGame | null>(null);
  const [result, setResult] = useState<ForgeResult | null>(null);
  // (the room's senders are made afresh on every render: read the latest through the ref)
  const live = useRef({ game, send });
  live.current = { game, send };
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "cavernsResult") {
          const r = payload as CavernsResult;
          setNotice({ text: r.message, ok: r.ok });
          if (r.ok) playCaveSfx("smelt", 0.8);
        } else if (type === "forgeGame") {
          setGame(payload as ForgeGame);
          setResult(null);
          setNotice(null);
          setTab("bellows");
        } else if (type === "forgeResult") {
          const r = payload as ForgeResult;
          setResult(r);
          setGame(null);
          playSfx(r.masterwork ? "masterwork" : "coins");
        }
      }),
    [subscribeMessages]
  );
  // stepping away mid-game (the panel closed): the ore and coal back in the satchel
  useEffect(
    () => () => {
      if (live.current.game) live.current.send(CAVERNS_CHANNELS.forge, { op: "cancel" });
    },
    []
  );
  // the camera on the forge while the game is on
  useEffect(() => {
    frameWork(game ? FORGE_SPOT : null);
  }, [game]);
  useEffect(() => () => frameWork(null), []);
  const tabs: [Tab, string][] = [
    ["bellows", "🔥 Bellows"],
    ["smelt", "⚡ Quick Smelt"],
    ["relics", "🧿 Relics"],
    ["expedition", "🧭 Expedition Tools"],
  ];
  if (game)
    return (
      <WorkSheet title="The Thermal Bellows Forge" icon="🔥" onClose={onClose}>
        <BellowsGame key={game.seed} game={game} send={send} />
      </WorkSheet>
    );
  return (
    <Modal title="The Thermal Bellows Forge" icon="🔥" onClose={onClose} width={500}>
      <div className="flex flex-col gap-2 pb-1">
        <div className="grid grid-cols-2 gap-1">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" className={`clay-btn min-h-11 text-[12.5px] font-bold ${tab === id ? "clay-btn-amber" : "clay-btn-ghost"}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "bellows" && <BellowsPick profile={profile} market={market} result={result} onStart={(ingot, batch) => send(CAVERNS_CHANNELS.forge, { op: "start", ingot, batch })} />}
        {tab === "smelt" && <QuickSmelt profile={profile} market={market} send={send} />}
        {tab === "relics" && <Relics profile={profile} send={send} />}
        {tab === "expedition" && <Expedition profile={profile} coins={coins} send={send} />}
        {notice && <p className={`m-0 text-center text-[12px] font-semibold ${notice.ok ? "text-amber-100" : "text-rose-200"}`}>{notice.text}</p>}
      </div>
    </Modal>
  );
}

// --- the bellows: pick a batch, then the game ----------------------------------------------------------

function RecipePills({ counts, id, times = 1 }: { counts: Partial<Record<OreItemId, number>>; id: IngotId; times?: number }) {
  return (
    <span className="flex flex-wrap gap-1 text-[10.5px]">
      {(Object.entries(FORGE_RECIPES[id]) as [OreItemId, number][]).map(([k, need]) => (
        <span key={k} className={`rounded-full px-1.5 ${(counts[k] ?? 0) >= need * times ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
          {need * times} {ORE_ITEMS[k].name} <span className="opacity-70">({counts[k] ?? 0})</span>
        </span>
      ))}
    </span>
  );
}

function BellowsPick({ profile, market, result, onStart }: { profile: FishingProfile; market: string; result: ForgeResult | null; onStart: (ingot: IngotId, batch: ForgeBatch) => void }) {
  const [ingot, setIngot] = useState<IngotId>("copper_ingot");
  const [batch, setBatch] = useState<ForgeBatch>(1);
  const hour = parseMarket(market);
  const counts = satchelCounts(profile);
  const can = smeltable(counts, ingot);
  const mw = MASTERWORK_OF[ingot];
  const mult = marketMultiplier(oreGood(mw), hour);
  return (
    <div className="flex flex-col gap-2">
      {result && <ForgeResultCard result={result} />}
      <p className="m-0 text-center text-[12px] opacity-80">Keep the furnace in the band with the bellows for {BELLOWS_HOLD_S} s, then strike twice on the sparks: Masterwork ingots, +25% at Gus's.</p>
      <div className="grid grid-cols-3 gap-1">
        {INGOT_IDS.map((id) => (
          <button key={id} type="button" className={`clay-btn flex min-h-14 flex-col items-center justify-center px-1 leading-tight ${ingot === id ? "clay-btn-amber" : "clay-btn-ghost"}`} onClick={() => setIngot(id)}>
            <span className="text-xl" style={{ filter: `drop-shadow(0 0 5px ${ORE_ITEMS[id].color}aa)` }}>
              {ORE_ITEMS[id].emoji}
            </span>
            <span className="text-[11px]">
              {ORE_ITEMS[id].name.replace(" Ingot", "")} <span className="opacity-70">×{smeltable(counts, id)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b className="flex items-center gap-1.5 text-[13px] text-[#F7EBE1]">
            {ORE_ITEMS[mw].name}
            <TrendBadge price={Math.round(ORE_ITEMS[mw].price * mult)} mult={mult} />
          </b>
          <RecipePills counts={counts} id={ingot} times={batch} />
        </div>
        <div className="flex shrink-0 gap-1">
          {FORGE_BATCHES.map((b) => (
            <button key={b} type="button" className={`clay-btn min-h-11 min-w-11 px-2 text-[12px] font-bold ${batch === b ? "clay-btn-amber" : "clay-btn-ghost"}`} disabled={can < b} onClick={() => setBatch(b)} title={b === 1 ? "A steady band" : b === 3 ? "The band swings wider" : "The band swings widest and quickest"}>
              ×{b}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-sm font-extrabold" disabled={can < batch} onClick={() => onStart(ingot, batch)}>
        🔥 Fire up the bellows ({batch} {ORE_ITEMS[ingot].name}
        {batch > 1 ? "s" : ""})
      </button>
    </div>
  );
}

/** The game on the page's own clock from the moment the server's go arrived: the pumps and the
 *  strikes logged in seconds from then, sent up (in ms) once, at the end. */
function BellowsGame({ game, send }: { game: ForgeGame; send: Props["send"] }) {
  const t0 = useRef(performance.now());
  const pumps = useRef<number[]>([]);
  const strikes = useRef<number[]>([]);
  const held = useRef(false);
  const nextPump = useRef(0);
  const sent = useRef(false);
  const doneAt = useRef<number | null>(null);
  const [, frame] = useState(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  // (to the millisecond, as the log goes up: the server replays exactly what was simulated here)
  const now = () => Math.round(performance.now() - t0.current) / 1000;
  const finish = () => {
    if (sent.current) return;
    sent.current = true;
    const ms = (a: number[]) => a.map((v) => Math.round(v * 1000));
    sendRef.current(CAVERNS_CHANNELS.forge, { op: "finish", pumps: ms(pumps.current), strikes: ms(strikes.current) });
  };
  const pump = (t: number) => {
    pumps.current.push(Math.round(t * 1000) / 1000);
    activity.pumpAt = nowS();
    if (pumps.current.length % 2 === 1) playSfx("flame", 0.35);
  };
  const press = () => {
    if (doneAt.current !== null || sent.current) return;
    held.current = true;
    activity.pumping = true;
    const t = now();
    pump(t);
    nextPump.current = t + 1 / HOLD_PUMPS_PER_S;
  };
  const lift = () => {
    held.current = false;
    activity.pumping = false;
  };
  const strike = () => {
    if (doneAt.current === null || sent.current) return;
    const t = now();
    if (t <= doneAt.current) return;
    strikes.current.push(t);
    activity.hammerAt = nowS();
    playCaveSfx("anvil", 1);
    if (strikes.current.length >= HAMMER_STRIKES) window.setTimeout(finish, 250);
  };
  const live = useRef({ press, lift, strike });
  live.current = { press, lift, strike };
  // the loop: the held bellows' pumps, the heat, the hammer's beats, the time running out
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = now();
      if (held.current && doneAt.current === null) {
        while (nextPump.current <= t) {
          pump(nextPump.current);
          nextPump.current += 1 / HOLD_PUMPS_PER_S;
        }
      }
      if (doneAt.current === null) {
        const h = forgeHeatAt(game.batch, game.seed, pumps.current, t);
        if (h.doneAt !== null) {
          doneAt.current = h.doneAt;
          held.current = false;
          activity.forge = "hammer";
          activity.pumping = false;
          playSfx("sparkle", 0.8);
        } else if (t >= BELLOWS_LIMIT_S) finish();
      } else {
        const beats = hammerBeats(doneAt.current);
        if (t > beats[beats.length - 1] + HAMMER_WINDOW_S + 0.3) finish();
      }
      frame((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // (your avatar at the forge: the bellows, then the hammer: entities/activityAnimations.ts)
    activity.forge = "bellows";
    return () => {
      cancelAnimationFrame(raf);
      activity.forge = null;
      activity.pumping = false;
    };
    // (one loop per game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Space: the bellows (held), then the hammer
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (e.repeat) return;
      if (doneAt.current === null) live.current.press();
      else live.current.strike();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      live.current.lift();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // the tip, the first few games: until a Masterwork
  const [tip] = useState(() => {
    const due = tipDue("forge");
    if (due) tipSeen("forge");
    return due;
  });
  const t = now();
  const h = forgeHeatAt(game.batch, game.seed, pumps.current, Math.min(t, doneAt.current ?? t));
  const band = bandAt(game.batch, game.seed, Math.min(t, doneAt.current ?? t));
  const inBand = Math.abs(h.heat - band.mid) <= band.half;
  const hammer = doneAt.current !== null;
  const beats = hammer ? hammerBeats(doneAt.current!) : [];
  const mine = hammer ? strikes.current.filter((s) => s > doneAt.current!) : [];
  const nextBeat = beats.find((b, i) => mine.length <= i && t < b + HAMMER_WINDOW_S);
  const left = Math.max(0, BELLOWS_LIMIT_S - t);
  const heldS = Math.min(BELLOWS_HOLD_S, hammer ? BELLOWS_HOLD_S : h.held);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-center text-[12px] opacity-85">
        {game.batch} × {ORE_ITEMS[game.ingot].name} ·{" "}
        {!hammer ? (
          <>
            <span className="kbd-hint">hold Space or</span> hold the bellows: keep the needle in the <b className="text-amber-200">gold band</b>
          </>
        ) : (
          <>
            <span className="kbd-hint">Space or</span> strike as each ring <b className="text-amber-200">closes on the ingot</b>
          </>
        )}
      </p>
      {!hammer ? (
        <div className="flex items-center justify-center gap-4">
          <HeatArc heat={h.heat} mid={band.mid} half={band.half} inBand={inBand} held={heldS / BELLOWS_HOLD_S} />
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label="Pump the bellows"
              className={`grid size-24 select-none place-items-center rounded-full border-4 text-3xl font-black transition-transform ${held.current ? "scale-95 border-amber-200 bg-gradient-to-b from-amber-300 to-orange-600 shadow-[0_0_30px_rgba(255,170,60,0.8)]" : "border-amber-300/70 bg-gradient-to-b from-amber-400 to-orange-700 shadow-[0_6px_18px_rgba(0,0,0,0.5)]"}`}
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // (a pointer the browser no longer tracks)
                }
                press();
              }}
              onPointerUp={lift}
              onPointerCancel={lift}
            >
              <span style={{ fontSize: 40, lineHeight: 1 }}>💨</span>
            </button>
            <span className="text-[11px] tabular-nums opacity-70">{left.toFixed(0)} s of fuel</span>
          </div>
        </div>
      ) : (
        <Anvil t={t} beats={beats} strikes={mine} next={nextBeat ?? null} onStrike={strike} />
      )}
      {tip && <p className="m-0 rounded-xl bg-black/25 px-3 py-1.5 text-center text-[12px] text-amber-100">Tip: short taps nudge the heat up; let go and it cools. Tap a little before the heat reaches the band's middle (each puff overshoots, most of all in the narrow band of a big batch). Hold it in the band for {BELLOWS_HOLD_S} s, then strike twice on the beat for a Masterwork.</p>}
    </div>
  );
}

/** The furnace's heat on an arc (cold on the left, hot on the right): the drifting gold band, the
 *  needle, and the time held in it filling round the arc's foot. */
function HeatArc({ heat, mid, half, inBand, held }: { heat: number; mid: number; half: number; inBand: boolean; held: number }) {
  const cx = 90;
  const cy = 92;
  const R = 74;
  const at = (v: number) => {
    const a = Math.PI - Math.max(0, Math.min(1, v)) * Math.PI;
    return { x: cx + R * Math.cos(a), y: cy - R * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const a = at(from);
    const b = at(to);
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R} ${R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const needle = at(heat);
  return (
    <svg viewBox="0 0 180 112" className="w-44 shrink-0" aria-label={`Heat ${Math.round(heat * 100)}%${inBand ? ", in the band" : ""}`}>
      <defs>
        <linearGradient id="forge-heat" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3b6fb6" />
          <stop offset="0.45" stopColor="#c9772e" />
          <stop offset="1" stopColor="#ff3b1f" />
        </linearGradient>
      </defs>
      <path d={arc(0, 1)} fill="none" stroke="url(#forge-heat)" strokeWidth="12" strokeLinecap="round" opacity="0.55" />
      <path d={arc(mid - half, mid + half)} fill="none" stroke={inBand ? "#ffe28a" : "#e0b54a"} strokeWidth="16" strokeLinecap="round" style={{ filter: inBand ? "drop-shadow(0 0 6px #ffd27a)" : undefined }} />
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#fff8e6" strokeWidth="4" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #ffb347)" }} />
      <circle cx={cx} cy={cy} r="8" fill="#2a1a12" stroke="#ffcf7a" strokeWidth="2" />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fontWeight="800" fill={inBand ? "#ffe28a" : "#c9bdb5"}>
        {(held * BELLOWS_HOLD_S).toFixed(1)} / {BELLOWS_HOLD_S} s
      </text>
      <rect x={cx - 40} y={cy - 32} width={80 * held} height="4" rx="2" fill="#ffd27a" opacity={held > 0 ? 0.9 : 0} />
    </svg>
  );
}

/** The glowing ingot: a ring closing on it for each strike, bursting on the beat; strike as it closes. */
function Anvil({ t, beats, strikes, next, onStrike }: { t: number; beats: number[]; strikes: number[]; next: number | null; onStrike: () => void }) {
  const k = next === null ? 1 : Math.max(0, Math.min(1, 1 - (next - t) / HAMMER_BEAT_S));
  const burst = beats.some((b) => Math.abs(t - b) <= HAMMER_WINDOW_S);
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="relative grid h-32 w-44 place-items-center">
        <div className="absolute rounded-full border-4" style={{ width: `${52 + (1 - k) * 100}px`, height: `${52 + (1 - k) * 100}px`, opacity: next === null ? 0 : 0.3 + 0.7 * k, borderColor: burst ? "#ffffff" : "#ffd27a" }} />
        <div className={`h-7 w-24 rounded-md bg-gradient-to-b from-[#fff2b0] via-[#ffb347] to-[#e25a1c] ${burst ? "shadow-[0_0_34px_#ffd27a]" : "shadow-[0_0_14px_#ff8a3a]"}`} />
        {burst && <span className="absolute -top-1 text-3xl">✨</span>}
        <div className="absolute -bottom-1 flex gap-2">
          {beats.map((b, i) => (
            <span key={i} className="text-lg" style={{ filter: strikes[i] === undefined ? "grayscale(1) opacity(0.35)" : Math.abs(strikes[i] - b) <= HAMMER_WINDOW_S ? "drop-shadow(0 0 6px #ffd27a)" : "grayscale(1) opacity(0.6)" }}>
              {strikes[i] !== undefined && Math.abs(strikes[i] - b) > HAMMER_WINDOW_S ? "✖️" : "⭐"}
            </span>
          ))}
        </div>
      </div>
      <button type="button" aria-label="Strike" className="grid size-24 select-none place-items-center rounded-full border-4 border-amber-300/70 bg-gradient-to-b from-stone-300 to-stone-600 text-4xl shadow-[0_6px_18px_rgba(0,0,0,0.5)] active:scale-95 disabled:opacity-50" style={{ touchAction: "none" }} onPointerDown={onStrike} disabled={strikes.length >= HAMMER_STRIKES}>
        <span style={{ fontSize: 42, lineHeight: 1 }}>🔨</span>
      </button>
    </div>
  );
}

/** A batch's result, graded: Masterwork (three stars), Fine (two: its coal back), Plain (one). */
function ForgeResultCard({ result }: { result: ForgeResult }) {
  const grade = result.grade ?? (result.masterwork ? "masterwork" : result.held ? "fine" : "plain");
  const stars = grade === "masterwork" ? 3 : grade === "fine" ? 2 : 1;
  const item = result.masterwork ? MASTERWORK_OF[result.ingot] : result.ingot;
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (grade === "masterwork") tipMastered("forge");
  }, [grade]);
  // the ingots flown into the satchel (those that fit: the rest wait on the forge's tray)
  useEffect(() => {
    const n = result.n - result.tray;
    if (n > 0) flyToBag(ORE_ITEMS[item].emoji, card.current, n, 350);
  }, [result, item]);
  return (
    <div ref={card} className={`clay-pop flex flex-col items-center gap-1 rounded-2xl border px-3 py-2.5 text-center ${grade === "masterwork" ? "border-yellow-300/60 bg-yellow-300/15" : "border-white/15 bg-white/5"}`}>
      <GradeStars n={stars} />
      <b className={`text-[15px] ${grade === "masterwork" ? "text-yellow-100" : "text-[#F7EBE1]"}`}>{grade === "masterwork" ? "✨ Masterwork!" : grade === "fine" ? "Fine work" : "Plain ingots"}</b>
      <span className="text-[12.5px]">
        {ORE_ITEMS[item].emoji} {result.n} {ORE_ITEMS[item].name}
        {result.n > 1 ? "s" : ""}
        {grade === "masterwork" && " (+25% at Gus's)"}
        {(result.coal ?? 0) > 0 && ` · ${result.coal} Coal back`}
      </span>
      <span className="text-[11px] opacity-75">
        {result.held ? `The heat held · strikes ${result.beats.map((b) => (b ? "✔" : "✘")).join(" ")}` : "The heat never held four seconds"}
        {result.tray > 0 && ` · ${result.tray} on the forge's tray (your satchel was full)`}
      </span>
    </div>
  );
}

// --- Quick Smelt -------------------------------------------------------------------------------------------

function QuickSmelt({ profile, market, send }: { profile: FishingProfile; market: string; send: Props["send"] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);
  const hour = parseMarket(market);
  const counts = satchelCounts(profile);
  const queued = profile.forgeQueue.reduce((a, j) => a + j.n, 0);
  const left = profile.forgeAt ? Math.max(0, profile.forgeAt - Date.now()) / 1000 : 0;
  const tray = ORE_ITEM_IDS.filter((id) => (profile.forgeTray[id] ?? 0) > 0);
  const all = QUICK_SMELT_ORDER.reduce((a, id) => a + smeltable(counts, id), 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-center text-[12px] opacity-80">Plain ingots on the forge's own clock: one every {FORGE_SMELT_S} s, into your satchel. It keeps at it while you're away.</p>
      {INGOT_IDS.map((id) => {
        const n = smeltable(counts, id);
        const mult = marketMultiplier(oreGood(id), hour);
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
            <span className="text-3xl" style={{ filter: `drop-shadow(0 0 6px ${ORE_ITEMS[id].color}99)` }}>
              {ORE_ITEMS[id].emoji}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <b className="flex items-center gap-1.5 text-sm text-[#F7EBE1]">
                {ORE_ITEMS[id].name}
                <TrendBadge price={Math.round(ORE_ITEMS[id].price * mult)} mult={mult} />
              </b>
              <RecipePills counts={counts} id={id} />
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" className="clay-btn clay-btn-ghost min-h-11 px-3 text-xs" disabled={n < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "smelt", ingot: id, n: 1 })}>
                Smelt 1
              </button>
              <button type="button" className="clay-btn clay-btn-amber min-h-11 px-3 text-xs" disabled={n < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "smelt", ingot: id, n })}>
                All ({n})
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-sm font-extrabold" disabled={all < 1 || queued >= FORGE_QUEUE_MAX} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "all" })}>
        ⚡ Quick Smelt All ({all})
      </button>
      <div className="rounded-2xl bg-black/20 px-3 py-2 text-[12px]">
        {queued > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <b>In the forge</b>
              <span className="tabular-nums opacity-80">next in {left.toFixed(1)} s</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${Math.min(100, (1 - left / FORGE_SMELT_S) * 100)}%` }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {profile.forgeQueue.map((j, k) => (
                <span key={k} className="rounded-full bg-white/10 px-2 py-0.5">
                  {ORE_ITEMS[j.i].emoji} {ORE_ITEMS[j.i].name} ×{j.n}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <span className="opacity-70">The forge is idle: its coals glow, waiting.</span>
        )}
      </div>
      {tray.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-[12px]">
          <span className="flex-1">On the tray (your satchel was full): {tray.map((id) => `${profile.forgeTray[id]} ${ORE_ITEMS[id].name}`).join(", ")}</span>
          <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send(CAVERNS_CHANNELS.forge, { op: "collect" })}>
            Collect
          </button>
        </div>
      )}
    </div>
  );
}

// --- the Expedition tools (T5: forged, never sold) ---------------------------------------------------------

function Expedition({ profile, coins, send }: { profile: FishingProfile; coins: number; send: Props["send"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-center text-[12px] opacity-80">The finest tool of each craft and the largest stores are forged here, not sold: coins, ingots and your craft's own makings. A Masterwork ingot stands in for a plain one.</p>
      {FORGED_TOOL_IDS.map((id: ForgedToolId) => {
        const t = FORGED_TOOLS[id];
        const owned = forgedOwned(profile, id);
        const first = forgedBlocked(profile, id);
        const makings = makingsList(profile, t.needs);
        const ready = !first && coins >= t.coins && makings.every((m) => m.have >= m.need);
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
            <span className="text-2xl">{t.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <b className="text-[13px] text-[#F7EBE1]">{t.name}</b>
              <span className="text-[11px] opacity-80">{t.blurb}</span>
              {!owned && (
                <span className="flex flex-wrap gap-1 text-[10.5px]">
                  <span className={`rounded-full px-1.5 ${coins >= t.coins ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>{t.coins.toLocaleString("en-US")} 🪙</span>
                  {makings.map((m) => (
                    <span key={m.name} className={`rounded-full px-1.5 ${m.have >= m.need ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                      {m.need} {m.name} <span className="opacity-70">({m.have})</span>
                    </span>
                  ))}
                  {first && <span className="rounded-full bg-rose-400/15 px-1.5 text-rose-200">Needs {first}</span>}
                </span>
              )}
            </div>
            <button type="button" className={`clay-btn min-h-11 shrink-0 px-3 text-xs ${owned ? "clay-btn-ghost" : "clay-btn-amber"}`} disabled={owned || !ready} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "tool", tool: id })}>
              {owned ? "Forged ✓" : "Forge"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- the mining relics ---------------------------------------------------------------------------------

function Relics({ profile, send }: { profile: FishingProfile; send: Props["send"] }) {
  const dust = materialCount(profile, "stoneDust");
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-center text-[12px] opacity-80">Forged once each, and worn from the satchel drawer's gear tab. A Masterwork ingot stands in for a plain one.</p>
      {MINING_RELIC_IDS.map((id: MiningRelicId) => {
        const g = GEAR[id];
        const need = FORGE_RELICS[id];
        const owned = profile.gear.includes(id);
        const ready = (Object.entries(need.ore) as [OreItemId, number][]).every(([k, n]) => satchelCountFor(profile, k) >= n) && dust >= need.dust;
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
            <span className="text-2xl">{g.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <b className="text-[13px] text-[#F7EBE1]">{g.name}</b>
              <span className="text-[11px] opacity-80">{g.blurb}</span>
              {!owned && (
                <span className="flex flex-wrap gap-1 text-[10.5px]">
                  {(Object.entries(need.ore) as [OreItemId, number][]).map(([k, n]) => (
                    <span key={k} className={`rounded-full px-1.5 ${satchelCountFor(profile, k) >= n ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                      {n} {ORE_ITEMS[k].name} <span className="opacity-70">({satchelCountFor(profile, k)})</span>
                    </span>
                  ))}
                  {need.dust > 0 && (
                    <span className={`rounded-full px-1.5 ${dust >= need.dust ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                      {need.dust} Fine Stone Dust <span className="opacity-70">({dust})</span>
                    </span>
                  )}
                </span>
              )}
            </div>
            <button type="button" className={`clay-btn min-h-11 shrink-0 px-3 text-xs ${owned ? "clay-btn-ghost" : "clay-btn-amber"}`} disabled={owned || !ready} onClick={() => send(CAVERNS_CHANNELS.forge, { op: "relic", relic: id })}>
              {owned ? "Forged ✓" : "Forge"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
