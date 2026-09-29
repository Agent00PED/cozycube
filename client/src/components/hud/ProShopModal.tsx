import { useEffect, useMemo, useState } from "react";
import { BELT_STREAK, BOUT_PURSE, COUNTER_BONUS, DASH, GLOVES, GLOVE_IDS, GUARD, JIMMY_NAME, KNOCKDOWNS_TKO, MOVES, NO_CONTEST_S, PURSES_PER_HOUR, REST_S, RINGOUT_HEALTH, ROUNDS, ROUNDS_TO_WIN, ROUND_S, STAMINA, WARMUP_S, parseBoxingProfile, wearsBelt, type BoxingPacket, type GloveId } from "@shared/boxing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Coach Bruno's pro shop in the Velvet Ring: your fighter's record (wins and losses, knockouts, the
// streak and the Velvet Championship Belt), the gloves (the Classic pair is everyone's, laced in
// their corner's colour; the Tiger Stripe Mitts are 850 coins and make every M1 cheaper) to buy and
// to lace on for the next bout, and
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
            <li>👑 King of the Hill: step up to either corner's steps to get in line. Two in the ring: a {WARMUP_S} s countdown (bets at the chalkboard), then best of {ROUNDS} rounds of {ROUND_S} s: the first to {ROUNDS_TO_WIN} rounds takes the bout. The winner stays on; the next in line steps in.</li>
            <li>🔔 A round is won by a K.O. (the ten-count), a T.K.O. ({KNOCKDOWNS_TKO} knockdowns in it), a Ring-Out, or on the judges' card at its bell. Then {REST_S} s back in the corners, patched up to full health and stamina.</li>
            <li>❤️ Health (100) is what a clean punch takes, and it doesn't come back in a round. At 0 you're down: mash to beat the ten-count (the second one's harder), or the round is theirs.</li>
            <li>⚡ Stamina (100) pays for every punch, dash and second of guard; {STAMINA.idle} s after your last it's back at {STAMINA.regen} a second. Run it dry and you're Exhausted until it's back to {STAMINA.recover}: no dash, no guard, slow hands. No cooldowns: only stamina.</li>
            <li>👊 M1: the string. {MOVES.jab.name}, {MOVES.straight.name}, {MOVES.leadhook.name}: thrown on the beat each one lands before they recover from the last.</li>
            <li>🥊 M2: the {MOVES.smash.name}. A big wind-up ({MOVES.smash.windup} s), a big hit, heavy knockback, {MOVES.smash.guard} off a guard. Guard within its first 0.15 s and it's a Feint.</li>
            <li>🛡️ Guard (hold): {Math.round(GUARD.mitigate * 100)}% off every punch, {GUARD.drain} stamina a second. Each punch chips the guard's meter (an M1 {MOVES.jab.guard}, the M2 {MOVES.smash.guard}); at 0 it breaks and you're dazed {GUARD.breakStun} s.</li>
            <li>💨 Dash ({DASH.stamina} stamina): a slip left or right, a sway back, a step in. Dash within {DASH.perfect} s of a punch landing: a Perfect Dodge. They whiff and stagger, and your next punch is a Counter (x{COUNTER_BONUS}).</li>
            <li>Backed on the ropes at {RINGOUT_HEALTH} health or less? One M2 sends you through them: Ring-Out.</li>
            <li>🛡️ The guard stays up as long as you hold it: until you let go, your stamina runs dry or it breaks.</li>
            <li>🦶 Squared up, always: move any way you like and you stay facing them. Step in, back-pedal, circle.</li>
            <li>🏳️ Had enough? Throw in the towel (the button, or T, then again to confirm): a T.K.O. to the other corner, and you're out of the ring.</li>
            <li>A win pays {BOUT_PURSE} 🪙 ({PURSES_PER_HOUR} purses an hour). A bout over in under {NO_CONTEST_S} s, or a loser who never threw a punch, is a No Contest: nothing paid.</li>
            <li>🥊 {JIMMY_NAME}, by the Blue Corner's steps, spars anyone in a free ring: Rookie, Contender or Champion. No purse, no record, no bets.</li>
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
