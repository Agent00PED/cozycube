import { useEffect, useState } from "react";
import { BET_MAX, BET_MIN, CORNER_COLOR, CORNER_NAME, HOUSE_RAKE, METHOD_LABEL, NO_CONTEST_S, odds, oddsText, parseBet, type BoutResult, type BoxingPacket, type Corner } from "@shared/boxing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { useBout, useBoutClock } from "../../systems/boutStore";
import { Modal } from "./Modal";

// The ringside chalkboard in the Velvet Ring's lounge: the contenders, the bout, the pools and the
// live odds, and your ticket. During the warm-up (the 20 s between both corners filling and the
// bell) a spectator backs Red or Blue, BET_MIN to BET_MAX coins, one ticket a bout; pari-mutuel: the
// winners share the losers' pool (the house keeps HOUSE_RAKE of the winnings), and a No Contest or
// a draw hands every ticket back. The server takes the bet (BET) and says how it went (boxNotice).

const STAKES = [50, 100, 150, 200, 300];

interface Props {
  localSessionId: string;
  coins: number;
  send: (packet: BoxingPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function RingsideModal({ localSessionId, coins, send, subscribeMessages, onClose }: Props) {
  const bout = useBout();
  const clock = useBoutClock();
  const [stake, setStake] = useState(100);
  const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "boxNotice") return;
        const n = payload as { message: string; ok?: boolean };
        setSay({ text: n.message, ok: !!n.ok });
        if (n.ok) playSfx("coins");
      }),
    [subscribeMessages]
  );
  const fighter = bout.red.sessionId === localSessionId || bout.blue.sessionId === localSessionId;
  const mine = parseBet(bout.bets[localSessionId]);
  const open = bout.phase === "warmup";
  const bettors = Object.values(bout.bets).map(parseBet);
  const count = (side: Corner) => bettors.filter((b) => b?.side === side).length;
  // what this stake would return if it won, with it in the pool
  const wouldPay = (side: Corner) => {
    const pools = { ...bout.pools, [side]: bout.pools[side] + stake };
    const o = odds(pools, side);
    return o === null ? stake : Math.floor(stake + (stake / pools[side]) * pools[side === "red" ? "blue" : "red"] * (1 - HOUSE_RAKE));
  };
  let last: BoutResult | null = null;
  try {
    last = bout.result ? (JSON.parse(bout.result) as BoutResult) : null;
  } catch {
    last = null;
  }
  const status =
    bout.phase === "warmup"
      ? `Warm-up: bets close in ${clock}s`
      : bout.phase === "fight"
        ? `Round ${bout.round} under way: bets closed`
        : bout.phase === "count"
          ? "A knockdown! The count is on"
          : bout.phase === "rest"
            ? "Between rounds: bets closed"
            : bout.phase === "result"
              ? "The result is in"
              : bout.red.sessionId || bout.blue.sessionId
                ? "One corner filled: waiting for a challenger"
                : "No bout yet: two fighters step into the corners";

  return (
    <Modal title="Ringside Chalkboard" icon="🎟️" onClose={onClose} width={500}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-black/30 p-3">
          <Contender corner="red" name={bout.red.name} pool={bout.pools.red} bettors={count("red")} oddsText={oddsText(bout.pools, "red")} />
          <div className="text-center text-sm font-bold opacity-70">vs</div>
          <Contender corner="blue" name={bout.blue.name} pool={bout.pools.blue} bettors={count("blue")} oddsText={oddsText(bout.pools, "blue")} />
        </div>
        <div className="text-center text-sm font-bold text-[#F7EBE1]">{status}</div>
        {mine && (
          <div className="rounded-2xl bg-amber-900/40 px-3 py-2 text-center text-sm">
            🎟️ Your ticket: <b>{mine.amount} 🪙</b> on the <span style={{ color: CORNER_COLOR[mine.side] }}>{CORNER_NAME[mine.side]}</span> · pays {oddsText(bout.pools, mine.side)} if they win
          </div>
        )}
        {say && (
          <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/40" : "bg-rose-900/60"}`} key={say.text} role="status">
            {say.text}
          </div>
        )}
        {open && !fighter && !mine && (
          <>
            <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Stake">
              {STAKES.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stake === n} disabled={coins < n} onClick={() => setStake(n)} className={`clay-btn min-h-11 px-3 text-sm ${stake === n ? "clay-btn-amber" : "clay-btn-ghost"}`}>
                  {n} 🪙
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["red", "blue"] as const).map((side) => (
                <button key={side} type="button" disabled={coins < stake || !bout[side].sessionId} onClick={() => send({ type: "BET", side, amount: stake })} className="clay-btn min-h-14 text-sm font-bold text-white" style={{ background: side === "red" ? "linear-gradient(180deg,#e0574f,#a8282a)" : "linear-gradient(180deg,#5b8ae6,#2f55b0)" }}>
                  Back {bout[side].name || CORNER_NAME[side]}
                  <div className="text-[11px] font-semibold opacity-85">pays about {wouldPay(side)} 🪙</div>
                </button>
              ))}
            </div>
          </>
        )}
        {fighter && <div className="text-center text-xs opacity-70">You're fighting this one: fighters don't bet on their own bout.</div>}
        {last && (
          <div className="rounded-2xl bg-black/25 p-3 text-sm">
            <div className="font-bold text-[#F7EBE1]">Last bout: {last.winner ? `${last.winnerName} over ${last.loserName} by ${METHOD_LABEL[last.method]}` : METHOD_LABEL[last.method]}</div>
            <div className="text-xs opacity-70">
              Round {last.round}, {last.seconds}s{last.purse ? ` · purse ${last.purse} 🪙` : ""}
              {last.belt ? " · 👑 a new Velvet Champion" : ""}
            </div>
            {last.payouts.length > 0 && (
              <ul className="mt-1 max-h-24 overflow-y-auto text-xs">
                {last.payouts.map((p, i) => (
                  <li key={i}>
                    {p.name}: {p.stake} on {p.side === "red" ? "Red" : "Blue"} → {p.paid} 🪙
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="text-center text-[11px] leading-snug opacity-60">
          Bets {BET_MIN}-{BET_MAX} 🪙, one ticket a bout, placed in the warm-up. Winners share the losers' pool; the house keeps {Math.round(HOUSE_RAKE * 100)}% of the winnings. A bout decided in under {NO_CONTEST_S}s, or one whose loser never threw a punch, is a No Contest: every ticket back. You hold {coins.toLocaleString("en-US")} 🪙.
        </div>
      </div>
    </Modal>
  );
}

function Contender({ corner, name, pool, bettors, oddsText }: { corner: Corner; name: string; pool: number; bettors: number; oddsText: string }) {
  return (
    <div className={`flex flex-col ${corner === "red" ? "items-start" : "items-end"} gap-0.5`}>
      <div className="text-[11px] font-bold tracking-widest" style={{ color: CORNER_COLOR[corner] }}>
        {CORNER_NAME[corner].toUpperCase()}
      </div>
      <div className="max-w-full truncate text-base font-bold text-[#F7EBE1]">{name || "— open —"}</div>
      <div className="text-xs opacity-80">
        {pool} 🪙 · {bettors} {bettors === 1 ? "ticket" : "tickets"}
      </div>
      <div className="text-sm font-bold text-amber-200">{oddsText}</div>
    </div>
  );
}
