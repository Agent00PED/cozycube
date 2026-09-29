import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CORNER_COLOR, CORNER_NAME, DASH, GUARD_MAX, HEALTH_MAX, JIMMY_NAME, METHOD_LABEL, MOVES, ROUNDS, SPAR_TIERS, STAMINA_MAX, oddsText, parseBet, type BoutResult, type BoxEvent, type BoxingPacket, type Corner, type FighterView, type RoundWinner } from "@shared/boxing";
import type { PlayerState } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { boutLive, cornerOfSession, useBout, useBoutClock } from "../../systems/boutStore";
import { combatInput, makeMoves, useCombatInput, type Moves } from "../../systems/combatInput";
import { onRingFx, type RingFx } from "../../systems/fightAnim";
import { useTouchUi } from "../../systems/inputMode";
import { actionCam } from "../../scene/actionCamera";
import { glass, hudText, pillButton } from "./glass";

// The Velvet Ring's HUD, an arcade fighter's, for everyone on its map:
//
//   a fighter's     (a live bout: the countdown, the rounds, a count, the rest) the top of the screen
//   banners         is theirs alone (the game's own header fades away, App.tsx): Red on the left and
//                   Blue mirrored on the right, each a portrait, the name (this round's knockdowns
//                   as 💫), a thick Health bar, the gold Stamina and the cyan Guard; in the middle
//                   the clock, the round (1/3 to 3/3), the three round pips lit in the colour of
//                   whoever took each round, and Throw in the Towel (tapped, or T, then confirmed
//                   within 3 s: a T.K.O. conceded, the bout to the other corner, and out of the ring;
//                   a thumb-sized button on a touch screen, down on the canvas too)
//   a spectator's   a compact banner under the header: both fighters' health, the round pips and
//   banner          the clock, the odds while the bets are open, a spar's setting, who is next
//   the centre      ROUND 2... FIGHT! at each bell, each round's winner at its end, the comic badges
//                   (⚡ PERFECT DODGE, 💥 COUNTER! (x1.4), 🛡️ GUARD BREAK, 😮‍💨 EXHAUSTED, 💥 RING-OUT!),
//                   the count (🔔 KNOCKDOWN: 1... 2... 3...), the result
//   a fighter's own on a keyboard and mouse, a compact capsule of the controls in the bottom-left
//                   corner (faded away 4 s after the opening bell); on a touch screen the combat
//                   cluster (bottom right, sized to the screen: the M1 clamp(84px, 11vmin, 120px),
//                   the M2 over it, Dash to its left, Block under it, each clamp(56px, 7.5vmin,
//                   80px): each squeezes when pressed and dims when out of stamina, no cooldowns);
//                   down on the canvas, the call to mash; between bouts, Step Down (and, alone in
//                   the ring, a spar with Jimmy)
//   the line        a spectator waiting for the ring: their place, and a way out of it
//   the flashes     red for a hit taken, white (and the world gone grey a moment) for a Perfect Dodge
//
// The controls themselves are systems/combatInput.ts (one set of moves for the HUD's life: a guard
// held stays up however often the HUD redraws); the camera, scene/actionCamera.ts (on while the
// local fighter's bout is live: this HUD tells it).

interface Props {
  me: PlayerState;
  localSessionId: string;
  players: Record<string, PlayerState>;
  send: (packet: BoxingPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
}

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

export function BoxingHud({ me, localSessionId, players, send, subscribeMessages }: Props) {
  const bout = useBout();
  const clock = useBoutClock();
  const touch = useTouchUi();
  const corner = cornerOfSession(bout, localSessionId);
  const mine = corner ? bout[corner] : null;
  const foe = corner ? bout[corner === "red" ? "blue" : "red"] : null;
  const inRing = !!corner && me.corner !== "";
  const phase = bout.phase;
  const live = boutLive(phase);
  const ringActive = inRing && live;
  const downed = inRing && phase === "count" && mine?.state === "down";
  // one set of moves for as long as the HUD is up: the room's `send` changes identity with every
  // redraw of the app, and a new set would drop a guard still held (the keys' listeners renewed)
  const sendRef = useRef(send);
  sendRef.current = send;
  const moves = useMemo(() => makeMoves((p) => sendRef.current(p), localSessionId), [localSessionId]);
  useCombatInput(inRing && (phase === "fight" || phase === "warmup" || phase === "count"), moves);
  useEffect(() => {
    combatInput.downed = downed;
    return () => {
      combatInput.downed = false;
    };
  }, [downed]);
  // the action camera: on for the local fighter's live bout, framing them and the one they face
  const foeId = foe?.sessionId ?? "";
  useEffect(() => {
    actionCam.want = ringActive;
    actionCam.foe = ringActive ? foeId : "";
  }, [ringActive, foeId]);
  useEffect(
    () => () => {
      actionCam.want = false;
      actionCam.foe = "";
    },
    []
  );

  // the towel: pressed (or T), then confirmed within 3 s (pressed again, or T again)
  const towelLive = inRing && (phase === "fight" || phase === "count" || phase === "rest");
  const [towelAsk, setTowelAsk] = useState(false);
  useEffect(() => {
    if (!towelAsk) return;
    const t = window.setTimeout(() => setTowelAsk(false), 3000);
    return () => window.clearTimeout(t);
  }, [towelAsk]);
  useEffect(() => {
    if (!towelLive) setTowelAsk(false);
  }, [towelLive]);
  const towelRef = useRef(() => {});
  towelRef.current = () => {
    if (!towelLive) return;
    if (towelAsk) {
      setTowelAsk(false);
      send({ type: "TOWEL" });
    } else setTowelAsk(true);
  };
  useEffect(() => {
    if (!towelLive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyT" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      towelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [towelLive]);

  // the controls' capsule: shown through the countdown, faded away 4 s after the opening bell
  const [hintsGone, setHintsGone] = useState(false);
  useEffect(() => {
    if (phase === "warmup" || phase === "open") setHintsGone(false);
    if (phase === "fight" && bout.round === 1) {
      const t = window.setTimeout(() => setHintsGone(true), 4000);
      return () => window.clearTimeout(t);
    }
  }, [phase, bout.round]);

  // the flashes, the comic badges (BoxingWorld raises them) and the rounds' banners
  const [flash, setFlash] = useState<{ tone: "white" | "red" | "gold"; id: number } | null>(null);
  const [badges, setBadges] = useState<{ id: number; text: string; tone: string }[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string; sub?: string; colour?: string } | null>(null);
  const fxId = useRef(0);
  const boutRef = useRef(bout);
  boutRef.current = bout;
  useEffect(() => {
    const timers = new Set<number>();
    const later = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const off = onRingFx((fx: RingFx) => {
      if (fx.kind === "flash") setFlash({ tone: fx.tone, id: ++fxId.current });
      else if (fx.kind === "mono") {
        document.documentElement.classList.add("cozy-ring-mono");
        later(200, () => document.documentElement.classList.remove("cozy-ring-mono"));
      } else {
        const id = ++fxId.current;
        setBadges((b) => [...b.slice(-2), { id, text: fx.text, tone: fx.tone }]);
        later(1300, () => setBadges((b) => b.filter((x) => x.id !== id)));
      }
    });
    // ROUND 2... FIGHT! at each bell, and who took the round at its end
    const offRounds = subscribeMessages((type, payload) => {
      if (type !== "boxEvent") return;
      const ev = payload as BoxEvent;
      let next: { text: string; sub?: string; colour?: string } | null = null;
      if (ev.kind === "bell" && ev.ring === "start") next = { text: `ROUND ${ev.round}... FIGHT!`, sub: ev.round === ROUNDS ? "The final round" : undefined };
      else if (ev.kind === "round") {
        const b = boutRef.current;
        next = ev.winner ? { text: `ROUND ${ev.round}: ${(b[ev.winner].name || CORNER_NAME[ev.winner]).toUpperCase()}`, sub: METHOD_LABEL[ev.method], colour: CORNER_COLOR[ev.winner] } : { text: `ROUND ${ev.round}: DRAWN`, sub: "The judges couldn't split them" };
      }
      if (!next) return;
      const id = ++fxId.current;
      setBanner({ id, ...next });
      later(ev.kind === "round" ? 2400 : 1700, () => setBanner((b) => (b?.id === id ? null : b)));
    });
    return () => {
      off();
      offRounds();
      timers.forEach((t) => window.clearTimeout(t));
      document.documentElement.classList.remove("cozy-ring-mono");
    };
  }, [subscribeMessages]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 380);
    return () => window.clearTimeout(t);
  }, [flash]);

  let result: BoutResult | null = null;
  try {
    result = phase === "result" && bout.result ? (JSON.parse(bout.result) as BoutResult) : null;
  } catch {
    result = null;
  }
  const anyone = !!bout.red.sessionId || !!bout.blue.sessionId;
  const myBet = parseBet(bout.bets[localSessionId]);
  const place = bout.queue.indexOf(localSessionId);
  const avatar = (id: string) => players[id]?.avatarUrl ?? "";
  const downedName = phase === "count" ? (bout.red.state === "down" ? bout.red.name : bout.blue.state === "down" ? bout.blue.name : "") : "";
  const aloneInRing = inRing && phase === "open" && !foe?.sessionId && bout.queue.length === 0;

  return (
    <>
      {flash && <div key={flash.id} style={flash.tone === "white" ? whiteFlash : flash.tone === "gold" ? goldFlash : hitFlash} aria-hidden />}

      {ringActive ? (
        <div className="cozy-hud-block" style={fightBanner} aria-label="The bout">
          <FighterPanel corner="red" f={bout.red} avatar={avatar(bout.red.sessionId)} you={corner === "red"} />
          <div style={bannerMiddle}>
            <div style={bigClock}>{phase === "count" ? `${bout.count}` : mmss(clock)}</div>
            <div style={phaseLabel}>{phase === "warmup" ? (bout.spar ? "SPAR IN" : "THE BELL IN") : phase === "rest" ? `ROUND ${bout.round + 1}/${ROUNDS} IN` : phase === "count" ? "THE COUNT" : `ROUND ${bout.round}/${ROUNDS}`}</div>
            <RoundPips rounds={bout.rounds} />
            {phase === "warmup" ? (
              <button type="button" style={{ ...towelBtn, minHeight: touch ? 48 : 28 }} onClick={() => send({ type: "LEAVE_RING" })} title="Back down the steps">
                👋 Step Down
              </button>
            ) : (
              <button
                type="button"
                style={{ ...towelBtn, ...(towelAsk ? towelAskBtn : null), minHeight: touch ? 48 : 28, fontSize: touch ? 13 : 11, padding: touch ? "6px 14px" : "3px 10px" }}
                onClick={() => towelRef.current()}
                title="Concede the bout: a T.K.O. to the other corner"
                aria-label={towelAsk ? "Confirm: throw in the towel" : "Throw in the towel"}
              >
                {towelAsk ? (touch ? "🏳️ Tap again to concede" : "🏳️ Again to concede") : "🏳️ Throw in the Towel"}
                {!touch && <span style={keyCap}>T</span>}
              </button>
            )}
          </div>
          <FighterPanel corner="blue" f={bout.blue} avatar={avatar(bout.blue.sessionId)} you={corner === "blue"} flip />
        </div>
      ) : (
        (phase !== "open" || anyone) && (
          <div className="cozy-hud-block" style={spectatorBanner} aria-label="The bout">
            <div style={specRow}>
              <SpecSide corner="red" f={bout.red} />
              <div style={specMiddle}>
                <div style={specClock}>{phase === "count" ? `${bout.count}` : phase === "open" ? "🥊" : mmss(clock)}</div>
                <div style={tiny}>{phase === "fight" ? `R${bout.round}/${ROUNDS}` : phase === "warmup" ? "BELL IN" : phase === "rest" ? "REST" : phase === "count" ? "COUNT" : phase === "result" ? "RESULT" : "OPEN"}</div>
                <RoundPips rounds={bout.rounds} small />
              </div>
              <SpecSide corner="blue" f={bout.blue} flip />
            </div>
            {bout.spar && <div style={specLine}>🥊 A spar with {JIMMY_NAME} ({SPAR_TIERS[bout.spar].name}): no bets, no record</div>}
            {phase === "warmup" && !bout.spar && <div style={specLine}>🎟️ Bets open at the chalkboard · {oddsText(bout.pools, "red")} / {oddsText(bout.pools, "blue")}</div>}
            {phase === "open" && anyone && !inRing && <div style={specLine}>👑 {bout.red.name || bout.blue.name} holds the ring: step up to a corner to challenge</div>}
            {bout.queue.length > 0 && (
              <div style={specLine}>
                ⏭️ Next up: {bout.queue.slice(0, 3).map((id) => players[id]?.username ?? "someone").join(", ")}
                {bout.queue.length > 3 ? ` (+${bout.queue.length - 3})` : ""}
              </div>
            )}
            {myBet && phase !== "result" && (
              <div style={specLine}>
                🎟️ Your ticket: {myBet.amount} 🪙 on the <span style={{ color: CORNER_COLOR[myBet.side] }}>{CORNER_NAME[myBet.side]}</span> ({oddsText(bout.pools, myBet.side)})
              </div>
            )}
          </div>
        )
      )}

      {/* the centre of the screen: the round's banner, the comic badges, the count, the result */}
      <div style={centreStack} aria-live="polite">
        {banner && (
          <div key={banner.id} className="cozy-ring-round" style={roundBanner}>
            <div style={{ color: banner.colour ?? "#fff4d6" }}>{banner.text}</div>
            {banner.sub && <div style={roundSub}>{banner.sub}</div>}
          </div>
        )}
        {phase === "count" && (
          <div key="count" style={{ ...badge, ...BADGE_TONE.gold, animation: "none" }}>
            🔔 KNOCKDOWN{downedName ? ` (${downedName})` : ""}: {Array.from({ length: bout.count }, (_, i) => i + 1).slice(-4).join("... ")}
            {bout.count > 0 ? "..." : ""}
          </div>
        )}
        {badges.map((b) => (
          <div key={b.id} className="cozy-ring-badge" style={{ ...badge, ...(BADGE_TONE[b.tone] ?? BADGE_TONE.white) }}>
            {b.text}
          </div>
        ))}
        {result && (
          <div style={resultCard}>
            {result.winner && result.method !== "nocontest" ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 900 }}>
                  🏆 <span style={{ color: CORNER_COLOR[result.winner] }}>{result.winnerName}</span> wins by {METHOD_LABEL[result.method]}
                  {result.towel ? " (the towel)" : ""}
                </div>
                <div style={dim}>
                  {result.rounds.length > 0 && `Rounds ${result.rounds.map((r) => (r === "draw" ? "=" : r === "red" ? "R" : "B")).join(" ")}`}
                  {result.spar ? ` · a spar (${SPAR_TIERS[result.spar].name}): no purse, no record` : ""}
                  {!result.spar && result.purse > 0 && ` · +${result.purse} 🪙 purse`}
                  {result.belt ? " · 👑 NEW VELVET CHAMPION" : ""}
                  {result.stays ? (result.reign > 1 ? ` · holds the ring: ${result.reign} in a row` : " · holds the ring for the next challenger") : ""}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                {result.method === "nocontest" ? `🤚 No Contest: every bet goes back${result.stays ? ` · ${result.winnerName} holds the ring` : ""}` : "🤝 A draw on the judges' cards: every bet goes back"}
              </div>
            )}
          </div>
        )}
      </div>

      {inRing && downed && mine && (
        <div className="cozy-hud-block" style={fighterBar}>
          <MashPrompt taps={mine.taps} need={mine.need} knockdowns={mine.knockdowns} touch={touch} onTap={() => moves.m1()} />
        </div>
      )}
      {inRing && !live && (
        <div className="cozy-hud-block" style={fighterBar}>
          {phase === "open" && <div style={pill}>👑 You hold the ring{mine && mine.reign > 0 ? ` (${mine.reign} in a row)` : ""}: waiting for a challenger…</div>}
          {phase === "result" && result && (result.spar || (result.stays && result.winner === corner) ? <div style={pill}>🏆 The ring is still yours</div> : <div style={pill}>🚶 Off to the bleachers…</div>)}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {aloneInRing && (
              <button type="button" style={sparBtn} onClick={() => window.dispatchEvent(new CustomEvent("cozy-open-panel", { detail: { kind: "spar", propId: "spar" } }))}>
                🥊 Spar with Jimmy
              </button>
            )}
            <button type="button" style={ghostBtn} onClick={() => send({ type: "LEAVE_RING" })}>
              👋 Step Down
            </button>
          </div>
        </div>
      )}
      {inRing && live && !touch && (
        <div className="kbd-hint cozy-hud-block" style={{ ...hintCapsule, opacity: hintsGone ? 0 : 1 }} aria-hidden={hintsGone || undefined}>
          <b>LMB</b> M1 · <b>RMB</b> M2 · <b>F / Shift</b> hold Guard · <b>Space + WASD</b> Dash · <b>M2 → F</b> Feint · <b>T</b> Towel
        </div>
      )}

      {!inRing && place >= 0 && (
        <div className="cozy-hud-block" style={queueBar}>
          <div style={pill}>🎟️ You're #{place + 1} in line for the ring</div>
          <button type="button" style={ghostBtn} onClick={() => send({ type: "LEAVE_QUEUE" })}>
            Leave the Line
          </button>
        </div>
      )}

      {inRing && touch && live && !downed && mine && <CombatCluster moves={moves} f={mine} />}
    </>
  );
}

// --- the fighters' banners -----------------------------------------------------------------------

function Portrait({ corner, name, url, size }: { corner: Corner; name: string; url: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const style: CSSProperties = { width: size, height: size, borderRadius: "50%", flexShrink: 0, border: `2px solid ${CORNER_COLOR[corner]}`, background: CORNER_COLOR[corner], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: size * 0.45, color: "#fff", overflow: "hidden", boxShadow: `0 0 12px ${CORNER_COLOR[corner]}88` };
  if (url && !broken) return <img src={url} alt="" style={{ ...style, objectFit: "cover" }} onError={() => setBroken(true)} draggable={false} />;
  return <div style={style}>{(name || "?").slice(0, 1).toUpperCase()}</div>;
}

function FighterPanel({ corner, f, avatar, you, flip = false }: { corner: Corner; f: FighterView; avatar: string; you: boolean; flip?: boolean }) {
  return (
    <div style={{ ...panel, flexDirection: flip ? "row-reverse" : "row", background: `linear-gradient(${flip ? 270 : 90}deg, ${CORNER_COLOR[corner]}55, rgba(20, 14, 12, 0.2))`, borderColor: you ? "#ffd76a" : "rgba(255,255,255,0.12)" }}>
      <Portrait corner={corner} name={f.name} url={avatar} size={44} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, alignItems: flip ? "flex-end" : "flex-start" }}>
        <div style={{ ...panelName, flexDirection: flip ? "row-reverse" : "row" }}>
          <span style={nameText}>{f.name || "—"}</span>
          {f.bot && <span style={botTag}>{SPAR_TIERS[f.bot].emoji} {SPAR_TIERS[f.bot].name}</span>}
          {f.reign > 0 && <span title="Bouts won in a row on this hill">👑{f.reign > 1 ? f.reign : ""}</span>}
          {f.knockdowns > 0 && <span title="Knockdowns this round (three is a T.K.O.)">{"💫".repeat(f.knockdowns)}</span>}
          {f.away && <span title="Connection dropped: the bout waits a moment">📡</span>}
          {f.counter && <span style={counterTag}>⚡ COUNTER</span>}
        </div>
        <Gauge value={f.health} max={HEALTH_MAX} colour={f.health > 50 ? "#57d97a" : f.health > 25 ? "#f2b84e" : "#f0524a"} height={12} flip={flip} title="Health: 0 and you're down" />
        <Gauge value={f.stamina} max={STAMINA_MAX} colour={f.exhausted ? "#f0524a" : "#f2c14e"} height={6} flip={flip} title={f.exhausted ? "Exhausted: no dash, no guard, slow punches until it's back to 25" : "Stamina: every punch, dash and second of guard spends it"} blink={f.exhausted} />
        <Gauge value={f.guard} max={GUARD_MAX} colour="#5fd4ff" height={6} flip={flip} title="Guard: at 0 it breaks" />
      </div>
    </div>
  );
}

function Gauge({ value, max, colour, height, flip, title, blink = false }: { value: number; max: number; colour: string; height: number; flip: boolean; title: string; blink?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ ...track, height }} title={title}>
      <div className={blink ? "cozy-ring-blink" : undefined} style={{ ...fill, width: `${pct}%`, background: colour, marginLeft: flip ? "auto" : 0 }} />
    </div>
  );
}

/** The bout's three rounds as pips: each lit in the colour of whoever took it (grey, drawn), open
 *  ones hollow. */
function RoundPips({ rounds, small = false }: { rounds: RoundWinner[]; small?: boolean }) {
  const d = small ? 8 : 11;
  return (
    <span style={{ display: "inline-flex", gap: small ? 3 : 5 }} title={`Rounds: ${rounds.join(", ") || "none yet"} (two takes the bout)`}>
      {Array.from({ length: ROUNDS }, (_, i) => {
        const r = rounds[i];
        return <span key={i} style={{ width: d, height: d, borderRadius: "50%", background: r ? (r === "draw" ? "#8a8580" : CORNER_COLOR[r]) : "rgba(255,255,255,0.1)", border: `2px solid ${r ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)"}`, boxShadow: r && r !== "draw" ? `0 0 8px ${CORNER_COLOR[r]}` : "none" }} />;
      })}
    </span>
  );
}

function SpecSide({ corner, f, flip = false }: { corner: Corner; f: FighterView; flip?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, alignItems: flip ? "flex-end" : "flex-start" }}>
      <div style={{ ...specName, color: CORNER_COLOR[corner], flexDirection: flip ? "row-reverse" : "row" }}>
        <span>{corner === "red" ? "🔴" : "🔵"}</span>
        <span style={nameText}>{f.name || "—"}</span>
        {f.reign > 0 && <span>👑</span>}
        {f.knockdowns > 0 && <span>{"💫".repeat(f.knockdowns)}</span>}
      </div>
      {f.sessionId && <Gauge value={f.health} max={HEALTH_MAX} colour={f.health > 50 ? "#57d97a" : f.health > 25 ? "#f2b84e" : "#f0524a"} height={8} flip={flip} title="Health" />}
    </div>
  );
}

function MashPrompt({ taps, need, knockdowns, touch, onTap }: { taps: number; need: number; knockdowns: number; touch: boolean; onTap: () => void }) {
  const pct = need > 0 ? Math.min(100, (taps / need) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button type="button" style={mashBtn} onPointerDown={(e) => (e.preventDefault(), onTap())}>
        💫 {touch ? "TAP TAP TAP to get up!" : "Mash Space, F or click to get up!"}
      </button>
      <div style={{ ...track, width: 220, height: 10 }}>
        <div style={{ ...fill, width: `${pct}%`, background: "#7ee08a" }} />
      </div>
      <div style={tiny}>{knockdowns >= 2 ? "The second one's harder: dig deep!" : "Push up off the canvas before ten"}</div>
    </div>
  );
}

// --- the touch combat cluster: M1 in the middle, M2 over it, Dash left, Block under -------------------

function CombatCluster({ moves, f }: { moves: Moves; f: FighterView }) {
  const tired = f.exhausted;
  return (
    <div className="cozy-hud-block touch-hint" style={cluster} aria-label="Combat controls">
      <RoundButton big at={{ right: "0px", bottom: "calc(var(--sat) + var(--gap))" }} emoji="👊" label="M1" dim={tired} onDown={() => moves.m1()} />
      <RoundButton at={{ right: "calc((var(--m1) - var(--sat)) / 2)", bottom: "calc(var(--sat) + var(--m1) + 2 * var(--gap))" }} emoji="🥊" label="M2" dim={tired || f.stamina < MOVES.smash.stamina} onDown={() => moves.m2()} />
      <RoundButton at={{ right: "calc(var(--m1) + var(--gap))", bottom: "calc(var(--sat) + var(--gap) + (var(--m1) - var(--sat)) / 2)" }} emoji="💨" label="Dash" dim={tired || f.stamina < DASH.stamina} onDown={() => moves.dash()} />
      <RoundButton at={{ right: "calc((var(--m1) - var(--sat)) / 2)", bottom: "0px" }} emoji="🛡️" label="Block" dim={tired} onDown={() => moves.guard(true)} onUp={() => moves.guard(false)} />
    </div>
  );
}

/** A round button: it squeezes to 90% while pressed and dims to 35% when the stamina won't carry
 *  it; a held one (Block) holds for as long as its own thumb stays down, wherever it slides. */
function RoundButton({ big = false, at, emoji, label, dim, onDown, onUp }: { big?: boolean; at: { right: string; bottom: string }; emoji: string; label: string; dim: boolean; onDown: () => void; onUp?: () => void }) {
  const [pressed, setPressed] = useState(false);
  const holding = useRef<number | null>(null);
  const onUpRef = useRef(onUp);
  onUpRef.current = onUp;
  // gone from the screen with a thumb still on it (the bout over): let go of what it held
  useEffect(
    () => () => {
      if (holding.current !== null) onUpRef.current?.();
    },
    []
  );
  const release = (id: number) => {
    if (holding.current !== id) return;
    holding.current = null;
    setPressed(false);
    onUp?.();
  };
  const size = big ? "var(--m1)" : "var(--sat)";
  return (
    <button
      type="button"
      aria-label={label}
      style={{ ...roundBtn, width: size, height: size, right: at.right, bottom: at.bottom, fontSize: `calc(${size} * 0.38)`, opacity: dim ? 0.35 : 1, transform: pressed ? "scale(0.9)" : "scale(1)" }}
      onPointerDown={(e) => {
        e.preventDefault();
        holding.current = e.pointerId;
        setPressed(true);
        onDown();
        // (held: the release comes back here even if the thumb slides off)
        try {
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        } catch {
          // a pointer the browser no longer tracks: the press still counts
        }
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden>{emoji}</span>
      <span style={{ ...roundLabel, fontSize: big ? 12 : 10 }}>{label}</span>
    </button>
  );
}

// --- styles ------------------------------------------------------------------------------------------

const BADGE_TONE: Record<string, CSSProperties> = {
  gold: { color: "#ffe28a", textShadow: "0 0 18px rgba(255, 196, 60, 0.9), 0 3px 0 #6b3d05" },
  cyan: { color: "#bff0ff", textShadow: "0 0 18px rgba(80, 200, 255, 0.9), 0 3px 0 #0b3a55" },
  red: { color: "#ffd0c4", textShadow: "0 0 18px rgba(255, 70, 40, 0.9), 0 3px 0 #5a0d06" },
  white: { color: "#ffffff", textShadow: "0 0 14px rgba(255, 255, 255, 0.6), 0 3px 0 #333" },
};

const fightBanner: CSSProperties = {
  ...hudText,
  position: "fixed",
  top: "max(6px, env(safe-area-inset-top))",
  left: "max(8px, env(safe-area-inset-left))",
  right: "max(8px, env(safe-area-inset-right))",
  zIndex: 31,
  display: "flex",
  alignItems: "stretch",
  gap: 8,
  pointerEvents: "none",
};
const panel: CSSProperties = { ...glass, flex: 1, minWidth: 0, maxWidth: 420, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)" };
const panelName: CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontWeight: 900, fontSize: 14, minWidth: 0, maxWidth: "100%" };
const counterTag: CSSProperties = { fontSize: 10, fontWeight: 900, color: "#3b2410", background: "#ffd76a", borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap", boxShadow: "0 0 10px rgba(255, 200, 80, 0.8)" };
const botTag: CSSProperties = { fontSize: 10, fontWeight: 800, color: "#f7ead2", background: "rgba(0,0,0,0.35)", borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap" };
const bannerMiddle: CSSProperties = { ...glass, flexShrink: 0, minWidth: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "4px 10px 6px", borderRadius: 16, marginLeft: "auto", marginRight: "auto" };
const bigClock: CSSProperties = { fontSize: 24, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "#fff8ec" };
const phaseLabel: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: "#d6cfc7", whiteSpace: "nowrap" };
const towelBtn: CSSProperties = { ...pillButton, pointerEvents: "auto", minHeight: 26, padding: "3px 10px", fontSize: 11, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
/** Asked to confirm: the towel's button in warning red. */
const towelAskBtn: CSSProperties = { background: "rgba(200,50,43,0.85)", border: "1px solid rgba(255,200,190,0.6)", color: "#fff" };
const keyCap: CSSProperties = { display: "inline-block", minWidth: 16, padding: "0 4px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.35)", fontSize: 10, lineHeight: "14px", textAlign: "center", opacity: 0.8 };
const nameText: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const track: CSSProperties = { width: "100%", borderRadius: 999, background: "rgba(255,255,255,0.13)", overflow: "hidden", display: "flex" };
const fill: CSSProperties = { height: "100%", borderRadius: 999, transition: "width 110ms linear" };

const spectatorBanner: CSSProperties = {
  ...glass,
  ...hudText,
  position: "absolute",
  top: "max(64px, calc(env(safe-area-inset-top) + 58px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 11,
  borderRadius: 16,
  padding: "6px 10px",
  width: "min(460px, calc(100vw - 24px))",
  pointerEvents: "none",
};
const specRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const specName: CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: 13, minWidth: 0, maxWidth: "100%" };
const specMiddle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 58 };
const specClock: CSSProperties = { fontSize: 17, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "#fff8ec", lineHeight: 1.1 };
const specLine: CSSProperties = { marginTop: 4, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#e8dccf" };
const tiny: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#d6cfc7", letterSpacing: 0.4 };
const dim: CSSProperties = { color: "#d8cfc4", fontWeight: 700, fontSize: 13, marginTop: 2 };

const centreStack: CSSProperties = { position: "fixed", left: "50%", top: "28%", transform: "translateX(-50%)", zIndex: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none", width: "min(620px, calc(100vw - 24px))" };
const badge: CSSProperties = { fontFamily: "var(--font-cozy)", fontSize: "clamp(22px, 5vw, 40px)", fontWeight: 900, letterSpacing: 1, textAlign: "center", WebkitTextStroke: "1px rgba(0,0,0,0.35)", animation: "cozy-ring-badge 1.3s ease-out forwards" };
const roundBanner: CSSProperties = { fontFamily: "var(--font-cozy)", fontSize: "clamp(28px, 7vw, 58px)", fontWeight: 900, letterSpacing: 2, textAlign: "center", lineHeight: 1.05, WebkitTextStroke: "1.5px rgba(0,0,0,0.45)", textShadow: "0 0 22px rgba(255, 200, 90, 0.7), 0 4px 0 #3a1a08" };
const roundSub: CSSProperties = { fontSize: "clamp(13px, 2.6vw, 20px)", fontWeight: 800, letterSpacing: 1, color: "#fff4d6", WebkitTextStroke: "0", textShadow: "0 2px 6px rgba(0,0,0,0.7)", marginTop: 4 };
const resultCard: CSSProperties = { ...glass, ...hudText, borderRadius: 18, padding: "10px 18px", textAlign: "center" };

const fighterBar: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "max(92px, calc(env(safe-area-inset-bottom) + 86px))",
  transform: "translateX(-50%)",
  zIndex: 12,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  pointerEvents: "auto",
  maxWidth: "calc(100vw - 24px)",
};
const queueBar: CSSProperties = { ...fighterBar, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" };
/** The keyboard's controls, docked small in the bottom-left corner (faded after the opening bell). */
const hintCapsule: CSSProperties = {
  ...hudText,
  position: "fixed",
  left: "max(14px, env(safe-area-inset-left))",
  bottom: "max(14px, env(safe-area-inset-bottom))",
  zIndex: 12,
  background: "rgba(20, 16, 14, 0.48)",
  border: "1px solid rgba(255,255,255,0.12)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 11,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  transition: "opacity 500ms ease",
};
const pill: CSSProperties = { ...glass, ...hudText, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, textAlign: "center" };
const ghostBtn: CSSProperties = { ...pillButton, background: "rgba(28, 25, 23, 0.72)", border: "1px solid rgba(255,255,255,0.14)", minHeight: 40 };
const sparBtn: CSSProperties = { ...pillButton, minHeight: 40, background: "linear-gradient(180deg, #ffd166, #f4a83a)", color: "#3b2410" };
const mashBtn: CSSProperties = { ...pillButton, fontSize: 18, fontWeight: 900, padding: "16px 26px", minHeight: 64, background: "linear-gradient(180deg, #ffd166, #f4a83a)", color: "#3b2410", boxShadow: "0 6px 22px rgba(255, 190, 60, 0.6)", touchAction: "manipulation" };
/** The cluster, sized to the screen: the M1 and the satellites round it (their sizes as CSS
 *  variables, every position worked out from them), clear of the glass's bottom edge. */
const cluster = {
  "--m1": "clamp(84px, 11vmin, 120px)",
  "--sat": "clamp(56px, 7.5vmin, 80px)",
  "--gap": "10px",
  position: "absolute",
  right: "max(clamp(24px, 4vw, 50px), env(safe-area-inset-right))",
  bottom: "max(clamp(32px, 5vh, 60px), env(safe-area-inset-bottom))",
  width: "calc(var(--m1) + var(--sat) + var(--gap))",
  height: "calc(var(--m1) + 2 * var(--sat) + 2 * var(--gap))",
  zIndex: 13,
  pointerEvents: "none",
} as CSSProperties;
const roundBtn: CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  border: "2px solid rgba(255, 236, 200, 0.55)",
  background: "radial-gradient(circle at 35% 30%, rgba(255, 214, 150, 0.95), rgba(196, 96, 40, 0.92))",
  boxShadow: "0 6px 18px rgba(0,0,0,0.45), inset 0 -3px 0 rgba(90, 30, 10, 0.35)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  pointerEvents: "auto",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  padding: 0,
  cursor: "pointer",
  transition: "transform 70ms ease-out, opacity 160ms ease",
};
const roundLabel: CSSProperties = { lineHeight: 1, fontWeight: 900, color: "#3b2410", fontFamily: "var(--font-cozy)", marginTop: 1 };
const whiteFlash: CSSProperties = { position: "fixed", inset: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.2) 70%)", animation: "cozy-ring-flash 380ms ease-out forwards" };
const goldFlash: CSSProperties = { position: "fixed", inset: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, rgba(255, 215, 110, 0.0) 30%, rgba(255, 200, 80, 0.55) 100%)", animation: "cozy-ring-flash 380ms ease-out forwards" };
const hitFlash: CSSProperties = { position: "fixed", inset: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, rgba(200, 30, 30, 0) 45%, rgba(200, 30, 30, 0.42) 100%)", animation: "cozy-ring-flash 380ms ease-out forwards" };
