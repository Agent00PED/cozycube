import { useEffect, useState } from "react";
import { BOT_TIERS, JIMMY_ID, JIMMY_NAME, ROUNDS, ROUND_S, SPAR_TIERS, SPAR_WARMUP_S, type BotTier, type BoxingPacket } from "@shared/boxing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { cornerOfSession, useBout } from "../../systems/boutStore";
import { Modal } from "./Modal";

// Jimmy the Slugger's sparring card, by the Blue Corner's steps (or from inside the ring, for the
// fighter waiting in it alone): three levels, Rookie, Contender and Champion, each a whole bout (best
// of three) fought by the server's own hands, with no purse, no record and no bets. The server takes
// the pick (SPAR) and says no when the ring is not free (boxNotice); the card closes the moment
// Jimmy climbs in.

interface Props {
  localSessionId: string;
  send: (packet: BoxingPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function SparModal({ localSessionId, send, subscribeMessages, onClose }: Props) {
  const bout = useBout();
  const [say, setSay] = useState<string | null>(null);
  const jimmyIn = bout.red.sessionId === JIMMY_ID || bout.blue.sessionId === JIMMY_ID;
  useEffect(() => {
    if (jimmyIn) onClose();
  }, [jimmyIn, onClose]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        const n = payload as { message?: string; ok?: boolean };
        if (type === "boxNotice" && !n.ok) setSay(String(n.message ?? ""));
      }),
    [subscribeMessages]
  );
  const mine = cornerOfSession(bout, localSessionId);
  const free = bout.phase === "open" && bout.queue.length === 0 && (mine ? !bout[mine === "red" ? "blue" : "red"].sessionId : !bout.red.sessionId && !bout.blue.sessionId);
  return (
    <Modal title={`Spar with ${JIMMY_NAME}`} icon="🥊" onClose={onClose} width={520}>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-black/30 px-3 py-2 text-sm italic">"Fancy a few rounds? Pick how hard I go. No purse, no record, no hard feelings." 🥊</div>
        {say && (
          <div className="clay-pop rounded-2xl bg-rose-900/60 px-3 py-2 text-sm" key={say} role="status">
            {say}
          </div>
        )}
        {!free && !say && <div className="rounded-2xl bg-black/25 px-3 py-2 text-center text-sm opacity-85">The ring's busy: Jimmy spars when it's free (or when you're alone in it).</div>}
        <div className="flex flex-col gap-2">
          {BOT_TIERS.map((tier: BotTier) => {
            const t = SPAR_TIERS[tier];
            return (
              <div key={tier} className="flex items-center gap-3 rounded-2xl bg-black/25 p-3">
                <span className="text-3xl" aria-hidden>
                  {t.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#F7EBE1]">{t.name}</div>
                  <div className="text-xs opacity-75">{t.blurb}</div>
                </div>
                <button type="button" disabled={!free} onClick={() => (setSay(null), send({ type: "SPAR", tier }))} className="clay-btn clay-btn-amber min-h-12 w-[92px] text-sm">
                  Spar
                </button>
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] opacity-60">
          A {SPAR_WARMUP_S} s countdown, then best of {ROUNDS} rounds of {ROUND_S} s. Nothing is paid or bet, and your record stays as it is.
        </div>
      </div>
    </Modal>
  );
}
