import { useEffect, useRef, useState } from "react";
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

// The Thermal Bellows Forge in its basalt cleft at the Expedition Basecamp, in three tabs:
//
//   🔥 Bellows      a batch of 1, 3 or 5 ingots worked by hand (its ore and coal out of the satchel as
//                   it starts, all back if it is given up): pump the bellows (hold for a steady draw,
//                   tap for a puff) to keep the furnace's heat inside the "Optimal Temperature" band
//                   as its needle drifts (a bigger batch swings it wider and quicker) for four seconds
//                   running; then the glowing ingot on the anvil, and two hammer strikes each on its
//                   spark burst. Both clean: Masterwork ingots (+25% at Gus's). The heat is simulated
//                   here live by the very function the server replays the log with (forgeHeatAt)
//   ⚡ Quick Smelt  plain ingots on the forge's own clock (an ingot every FORGE_SMELT_S seconds, into
//                   the satchel, or its tray when the satchel is full), Quick Smelt All
//   🧿 Relics       the four mining relics, forged once each from ingots, gems and Fine Stone Dust

interface Props {
  profile: FishingProfile;
  market: string;
  send: (channel: string, packet?: unknown) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

type Tab = "bellows" | "smelt" | "relics";

export function ForgeModal({ profile, market, send, subscribeMessages, onClose }: Props) {
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
  const tabs: [Tab, string][] = [
    ["bellows", "🔥 Bellows"],
    ["smelt", "⚡ Quick Smelt"],
    ["relics", "🧿 Relics"],
  ];
  return (
    <Modal title="The Thermal Bellows Forge" icon="🔥" onClose={onClose} width={500}>
      <div className="flex flex-col gap-2 pb-1">
        {!game && (
          <div className="grid grid-cols-3 gap-1">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" className={`clay-btn min-h-11 text-[12.5px] font-bold ${tab === id ? "clay-btn-amber" : "clay-btn-ghost"}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === "bellows" &&
          (game ? (
            <BellowsGame key={game.seed} game={game} send={send} />
          ) : (
            <BellowsPick profile={profile} market={market} result={result} onStart={(ingot, batch) => send(CAVERNS_CHANNELS.forge, { op: "start", ingot, batch })} />
          ))}
        {tab === "smelt" && !game && <QuickSmelt profile={profile} market={market} send={send} />}
        {tab === "relics" && !game && <Relics profile={profile} send={send} />}
        {notice && !game && <p className={`m-0 text-center text-[12px] font-semibold ${notice.ok ? "text-amber-100" : "text-rose-200"}`}>{notice.text}</p>}
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
      {result && (
        <div className={`rounded-2xl border px-3 py-2 text-center text-[12.5px] ${result.masterwork ? "border-yellow-300/60 bg-yellow-300/15" : "border-white/15 bg-white/5"}`}>
          {result.masterwork ? (
            <b className="text-yellow-100">
              ✨ Masterwork! {result.n} {ORE_ITEMS[MASTERWORK_OF[result.ingot]].name}
              {result.n > 1 ? "s" : ""} (+25%)
            </b>
          ) : (
            <b className="text-[#F7EBE1]">
              {result.n} {ORE_ITEMS[result.ingot].name}
              {result.n > 1 ? "s" : ""}
            </b>
          )}
          <div className="text-[11px] opacity-80">
            {result.held ? "The heat held" : "The heat never held four seconds"}
            {result.held && ` · strikes ${result.beats.map((b) => (b ? "✔" : "✘")).join(" ")}`}
            {result.tray > 0 && ` · ${result.tray} on the forge's tray (your satchel was full)`}
          </div>
        </div>
      )}
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

  const t = now();
  const h = forgeHeatAt(game.batch, game.seed, pumps.current, Math.min(t, doneAt.current ?? t));
  const band = bandAt(game.batch, game.seed, Math.min(t, doneAt.current ?? t));
  const inBand = Math.abs(h.heat - band.mid) <= band.half;
  const hammer = doneAt.current !== null;
  const beats = hammer ? hammerBeats(doneAt.current!) : [];
  const nextBeat = beats.find((b, i) => strikes.current.filter((s) => s > doneAt.current!).length <= i && t < b + HAMMER_WINDOW_S);
  const left = Math.max(0, BELLOWS_LIMIT_S - t);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="m-0 text-center text-[12px] opacity-85">
        {game.batch} × {ORE_ITEMS[game.ingot].name}
        {!hammer ? (
          <>
            {" "}
            · <span className="kbd-hint">hold Space or the bellows</span>
            <span className="touch-hint">hold the bellows</span> to keep the heat in the band
          </>
        ) : (
          <> · the ingot glows on the anvil: strike as each spark bursts!</>
        )}
      </p>
      <div className="flex w-full items-stretch gap-3">
        {/* the thermometer: the band drifting, the heat's needle */}
        <div className="relative h-56 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-t from-[#1a0f0a] via-[#5a2410] to-[#ffb347]/60">
          <div className={`absolute inset-x-0 border-y-2 ${inBand ? "border-emerald-200 bg-emerald-300/35" : "border-emerald-300/70 bg-emerald-300/20"}`} style={{ bottom: pct(band.mid - band.half), height: pct(band.half * 2) }} />
          <div className="absolute inset-x-1 h-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_#ffd27a]" style={{ bottom: pct(h.heat) }} />
          <span className="absolute inset-x-0 top-1 text-center text-[9px] font-bold opacity-80">HOT</span>
          <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold opacity-80">COLD</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <div className="mb-0.5 flex justify-between text-[11px] opacity-85">
              <span>Optimal Temperature held</span>
              <b className="tabular-nums">
                {Math.min(BELLOWS_HOLD_S, hammer ? BELLOWS_HOLD_S : h.held).toFixed(1)} / {BELLOWS_HOLD_S} s
              </b>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-200" style={{ width: pct(Math.min(1, (hammer ? BELLOWS_HOLD_S : h.held) / BELLOWS_HOLD_S)) }} />
            </div>
          </div>
          {!hammer ? (
            <>
              <span className="text-[11px] tabular-nums opacity-70">The furnace gives out in {left.toFixed(0)} s</span>
              <button
                type="button"
                className={`clay-btn clay-btn-amber mt-auto min-h-20 w-full select-none text-base font-extrabold ${held.current ? "brightness-125" : ""}`}
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
                💨 Pump the bellows
              </button>
            </>
          ) : (
            <Anvil t={t} beats={beats} strikes={strikes.current.filter((s) => s > doneAt.current!)} next={nextBeat ?? null} onStrike={strike} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The glowing ingot on the anvil: a ring closing on each spark burst's beat; strike as it bursts. */
function Anvil({ t, beats, strikes, next, onStrike }: { t: number; beats: number[]; strikes: number[]; next: number | null; onStrike: () => void }) {
  // the ring: from wide to the ingot's size over one beat, bursting on the beat
  const k = next === null ? 1 : Math.max(0, Math.min(1, 1 - (next - t) / HAMMER_BEAT_S));
  const burst = beats.some((b) => Math.abs(t - b) <= HAMMER_WINDOW_S);
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative flex h-28 w-full items-center justify-center">
        <div className="absolute rounded-full border-2 border-yellow-200/80" style={{ width: `${40 + (1 - k) * 90}px`, height: `${40 + (1 - k) * 90}px`, opacity: next === null ? 0 : 0.35 + 0.65 * k }} />
        <div className={`h-6 w-20 rounded-md bg-gradient-to-b from-[#fff2b0] via-[#ffb347] to-[#e25a1c] ${burst ? "shadow-[0_0_28px_#ffd27a]" : "shadow-[0_0_12px_#ff8a3a]"}`} />
        {burst && <span className="absolute -top-1 text-2xl">✨</span>}
      </div>
      <div className="flex gap-2 text-[11px]">
        {beats.map((b, i) => (
          <span key={i} className={`rounded-full px-2 py-0.5 ${strikes[i] === undefined ? "bg-white/10" : Math.abs(strikes[i] - b) <= HAMMER_WINDOW_S ? "bg-emerald-400/30 text-emerald-100" : "bg-rose-400/30 text-rose-100"}`}>
            strike {i + 1} {strikes[i] === undefined ? "" : Math.abs(strikes[i] - b) <= HAMMER_WINDOW_S ? "✔" : "✘"}
          </span>
        ))}
      </div>
      <button type="button" className="clay-btn clay-btn-amber min-h-14 w-full select-none text-base font-extrabold" style={{ touchAction: "none" }} onPointerDown={onStrike} disabled={strikes.length >= HAMMER_STRIKES}>
        🔨 Strike!
      </button>
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
