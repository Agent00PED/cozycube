import { useEffect, useState } from "react";
import type { BarnabyResult, CampfirePacket } from "@shared/types";
import { AXES, WOOD, WOOD_KINDS, carrierCapacity, type WoodKind } from "@shared/chop";
import { CRAFTS, CRAFT_IDS, MASTERWORK_CHANCE, canCraft, craftPrice } from "@shared/crafting";
import { carrierLoad, type FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  profile: FishingProfile;
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

// The carpenter's workbench between the tipi and Buster's stall: carve split wood from your carrier
// into artisan pieces (a Masterwork ✨ now and then, likelier with a finer axe), then sell them at
// Buster's. Every carve is the server's call (WORKBENCH packets); its answer comes back as
// workbenchResult.

const HELLO = "Pick a piece to carve. The wood comes straight out of your carrier.";

const needsText = (needs: Partial<Record<WoodKind, number>>) =>
  (Object.entries(needs) as [WoodKind, number][]).map(([k, n]) => `${n} ${WOOD[k].emoji}`).join(" + ");

export function WoodCraftModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: HELLO, ok: true });
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "workbenchResult") return;
        const r = payload as BarnabyResult;
        setSay({ text: r.message, ok: r.ok });
        if (r.ok) playSfx("chop");
      }),
    [subscribeMessages]
  );
  const load = carrierLoad(profile);
  const capacity = carrierCapacity(profile.carrierTier);
  const carved = profile.crafts.reduce((sum, c) => sum + craftPrice(c), 0);
  return (
    <Modal title="Workbench" icon="🪚" onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 pb-2">
        <div className={`clay-pop rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-white/10" : "bg-rose-400/15"}`} key={say.text} role="status">
          {say.text}
        </div>
        {/* the wood at hand, and how full the carrier is */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {WOOD_KINDS.map((k) => (
            <span key={k} className="rounded-full bg-white/10 px-2.5 py-0.5 font-bold tabular-nums" title={WOOD[k].name}>
              {WOOD[k].emoji} ×{profile.wood[k]}
            </span>
          ))}
          <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 font-bold tabular-nums">
            🪵 {load}/{capacity}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {CRAFT_IDS.map((id) => {
            const craft = CRAFTS[id];
            const ok = canCraft(profile.wood, id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-2">
                <span className="text-2xl">{craft.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="text-sm">{craft.name}</b>
                  <span className="text-[11px] opacity-75">
                    {needsText(craft.needs)} → {craft.price} 🪙 · ✨ {craft.master} 🪙
                  </span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" disabled={!ok} onClick={() => send({ type: "WORKBENCH", recipe: id })}>
                  Carve
                </button>
              </div>
            );
          })}
        </div>
        <p className="m-0 text-center text-xs opacity-75">
          A Masterwork ✨ ({Math.round(MASTERWORK_CHANCE[profile.axe] * 100)}% with your {AXES[profile.axe].name}) fetches half again.
          {profile.crafts.length > 0 && (
            <>
              {" "}
              {profile.crafts.length} carved {profile.crafts.length === 1 ? "piece" : "pieces"} worth <b className="text-amber-200">{carved} 🪙</b> at Buster's stall.
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
