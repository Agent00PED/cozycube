import { useEffect, useState } from "react";
import type { CampfirePacket, SplitResult } from "@shared/types";
import { FIREWOOD_FUEL, WOOD, WOOD_KINDS } from "@shared/chop";
import type { FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { WoodsPermits } from "./LumberjackModal";
import { splitYield } from "@shared/gear";

// The splitting block (by the campfire's woodpile, and at the woods' border): every log in the
// carrier split into bundles of Firewood at once (Quick Split All), or one kind at a time. Firewood
// rides beside the carrier (no slots) and feeds the bonfire FIREWOOD_FUEL a bundle; the finer the
// timber, the more bundles a log makes. SPLIT_WOOD, answered with splitResult.

export function SplitBlockModal({ profile, send, subscribeMessages, onClose }: { profile: FishingProfile; send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const [say, setSay] = useState<SplitResult | null>(null);
  const [whack, setWhack] = useState(0);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "splitResult") return;
        const r = payload as SplitResult;
        setSay(r);
        if (r.ok) {
          playSfx("chop");
          setWhack((n) => n + 1);
        }
      }),
    [subscribeMessages]
  );
  const kinds = WOOD_KINDS.filter((k) => (profile.wood[k] ?? 0) > 0);
  // (the Forester's Toolbelt: half as many bundles again, as the server splits them)
  const yieldMul = splitYield(profile.worn);
  const bundlesOf = (k: (typeof WOOD_KINDS)[number]) => Math.round((profile.wood[k] ?? 0) * WOOD[k].firewood * yieldMul);
  const bundles = kinds.reduce((sum, k) => sum + bundlesOf(k), 0);
  return (
    <Modal title="Splitting Block" icon="🪓" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2">
          <span key={whack} className={`text-4xl ${whack ? "clay-pop" : ""}`} aria-hidden>
            🪵
          </span>
          <div className="flex flex-1 flex-col leading-tight">
            <b className="text-sm text-[#F7EBE1]">Firewood bundles: {profile.firewood}</b>
            <span className="text-[11px] opacity-75">Each bundle feeds the bonfire +{FIREWOOD_FUEL}% · no carrier slots</span>
          </div>
        </div>
        {kinds.length === 0 ? (
          <p className="m-0 rounded-2xl bg-white/5 px-3 py-3 text-center text-sm opacity-80">No logs in your carrier. Fell a Soft Pine round the clearing, or a tree in the Whispering Woods.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {kinds.map((k) => (
              <div key={k} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">{WOOD[k].emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">
                    {WOOD[k].name} <span className="font-normal opacity-70">×{profile.wood[k]}</span>
                  </b>
                  <span className="text-[11px] opacity-75">each log splits into {Math.round(WOOD[k].firewood * yieldMul * 10) / 10} bundles{yieldMul > 1 ? " (your toolbelt)" : ""}</span>
                </div>
                <button type="button" className="clay-btn min-h-9 px-3 text-xs" onClick={() => send({ type: "SPLIT_WOOD", wood: k })}>
                  Split · {bundlesOf(k)} 🪵
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-base" disabled={kinds.length === 0} onClick={() => send({ type: "SPLIT_WOOD" })}>
          🪓 Quick Split All · {bundles} bundles
        </button>
        {say && (
          <p key={say.message} className={`clay-pop m-0 text-center text-sm ${say.ok ? "text-[#F5A623]" : "text-rose-300"}`} role="status">
            {say.message}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** The archway into the woods, without a permit: Buster's permits, sold right there. */
export function PermitsModal({ profile, coins, send, subscribeMessages, onEnter, onClose }: { profile: FishingProfile; coins: number; send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onEnter: () => void; onClose: () => void }) {
  const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "busterResult") return;
        const r = payload as { ok: boolean; message: string; coins: number };
        setSay({ text: r.message, ok: r.ok });
        if (r.ok) playSfx("chime");
      }),
    [subscribeMessages]
  );
  const canGo = profile.ranger || profile.dayPermits > 0;
  return (
    <Modal title="The Whispering Woods" icon="🌲" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="m-0 text-center text-sm opacity-85">A hand-painted sign on the archway: “Beyond, the Whispering Woods. Permits by order of the Ranger.”</p>
        <WoodsPermits profile={profile} coins={coins} send={send} />
        {say && (
          <p key={say.text} className={`clay-pop m-0 text-center text-sm ${say.ok ? "text-[#F5A623]" : "text-rose-300"}`} role="status">
            {say.text}
          </p>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-base" disabled={!canGo} onClick={onEnter}>
          🌲 Walk into the woods
        </button>
      </div>
    </Modal>
  );
}
