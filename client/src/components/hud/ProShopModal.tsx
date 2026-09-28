import { useEffect, useMemo, useState } from "react";
import { BELT_STREAK, BOUT_PURSE, GLOVES, GLOVE_IDS, GUARD, KNOCKDOWNS_TKO, MOVES, NO_CONTEST_S, PURSES_PER_HOUR, RINGOUT_COMPOSURE, SWAY, parseBoxingProfile, wearsBelt, type BoxingPacket, type GloveId } from "@shared/boxing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Coach Bruno's pro shop in the Velvet Ring: your fighter's record (wins and losses, knockouts, the
// streak and the Velvet Championship Belt), the gloves (the Classic Reds are everyone's; the Tiger
// Stripe Mitts are 850 coins and make a jab cheaper) to buy and to lace on for the next bout, and
// the coach's word on how a bout goes. The server sells and laces (BUY_GLOVES, WEAR_GLOVES) and says
// so (boxNotice).

interface Props {
  boxing: string;
  coins: number;
  inRing: boolean;
  send: (packet: BoxingPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

function beltLeft(until: number): string {
  const mins = Math.max(0, Math.floor((until - Date.now()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export function ProShopModal({ boxing, coins, inRing, send, subscribeMessages, onClose }: Props) {
  const profile = useMemo(() => parseBoxingProfile(boxing), [boxing]);
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
  const belt = wearsBelt(profile);
  return (
    <Modal title="Coach Bruno's Pro Shop" icon="🥊" onClose={onClose} width={500}>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-black/30 px-3 py-2 text-sm italic">"Gloves on the wall, glory in the ring. Keep your guard up and your chin down, kid." 🐶</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Wins" value={profile.wins} />
          <Stat label="Losses" value={profile.losses} />
          <Stat label="K.O.s" value={profile.kos} />
          <Stat label="Streak" value={profile.streak} hint={`best ${profile.best}`} />
        </div>
        <div className={`rounded-2xl px-3 py-2 text-center text-sm ${belt ? "bg-amber-700/40 text-amber-100" : "bg-black/25"}`}>
          {belt ? (
            <>
              🏆 <b>Velvet Champion</b>: the belt is yours for another {beltLeft(profile.beltUntil)}
            </>
          ) : (
            <>
              🏆 Win {BELT_STREAK} in a row for the Velvet Championship Belt ({profile.streak % BELT_STREAK}/{BELT_STREAK}): worn over your name for 24 hours
            </>
          )}
        </div>
        {say && (
          <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/40" : "bg-rose-900/60"}`} key={say.text} role="status">
            {say.text}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {GLOVE_IDS.map((id: GloveId) => {
            const g = GLOVES[id];
            const owned = profile.gloves.includes(id);
            const worn = profile.worn === id;
            return (
              <div key={id} className="flex items-center gap-3 rounded-2xl bg-black/25 p-3">
                <span className="text-3xl" aria-hidden>
                  {g.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#F7EBE1]">{g.name}</div>
                  <div className="text-xs opacity-75">{g.note}</div>
                </div>
                {owned ? (
                  <button type="button" disabled={worn || inRing} onClick={() => send({ type: "WEAR_GLOVES", id })} className={`clay-btn min-h-11 w-[92px] text-sm ${worn ? "clay-btn-ghost" : "clay-btn-amber"}`}>
                    {worn ? "Laced ✓" : "Lace up"}
                  </button>
                ) : (
                  <button type="button" disabled={coins < g.price} onClick={() => send({ type: "BUY_GLOVES", id })} className="clay-btn clay-btn-amber min-h-11 w-[92px] text-sm">
                    {g.price} 🪙
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <details className="rounded-2xl bg-black/20 px-3 py-2 text-xs leading-relaxed">
          <summary className="cursor-pointer text-sm font-bold text-[#F7EBE1]">🐶 The coach's rules of the ring</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 opacity-85">
            <li>Step up the Red or Blue corner's steps. Two fighters in: a 20 s warm-up (bets at the chalkboard), then the bell. Three rounds of 45 s.</li>
            <li>⚡ Stamina (100) pays for every swing and the guard, and comes back fast. Swing with too little and you're slow and soft.</li>
            <li>🧠 Composure (100) is what a clean punch takes away, and it doesn't come back in a round. At 0 you're down: mash to beat the ten-count. A third knockdown is a T.K.O.</li>
            <li>👊 Jab: quick ({MOVES.jab.windup}s), cheap, and it knocks a hook out of its wind-up. 🥊 Heavy Hook: {MOVES.hook.windup}s wind-up, hits hard, drives them toward the ropes ({MOVES.hook.cooldown}s cooldown).</li>
            <li>🛡️ Guard: 75% less damage, {GUARD.maxHold}s at most. Raise it within {GUARD.parry}s of a punch landing: a Perfect Parry, and your next jab is a free Counter Uppercut. Hold it until your stamina is gone and it breaks.</li>
            <li>💨 Sway: a slip with {SWAY.iframes}s of nothing touching you ({SWAY.cooldown}s cooldown).</li>
            <li>Backed on the ropes with {RINGOUT_COMPOSURE} composure or less? One hook sends you through them: Ring-Out.</li>
            <li>A win pays {BOUT_PURSE} 🪙 ({PURSES_PER_HOUR} purses an hour). A bout over in under {NO_CONTEST_S}s, or a loser who never threw a thing, is a No Contest: nothing paid. {KNOCKDOWNS_TKO} knockdowns is a T.K.O.</li>
          </ul>
        </details>
        {inRing && <div className="text-center text-[11px] opacity-60">Gloves are laced before you step in: change them after the bout.</div>}
        <div className="text-center text-[11px] opacity-60">You hold {coins.toLocaleString("en-US")} 🪙. Coins only: nothing here is bought with real money.</div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-black/25 px-2 py-2">
      <div className="text-lg font-bold text-[#F7EBE1]">{value}</div>
      <div className="text-[11px] opacity-70">{label}</div>
      {hint && <div className="text-[10px] opacity-50">{hint}</div>}
    </div>
  );
}
