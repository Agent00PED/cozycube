import type { FishingProfile } from "@shared/fishing";
import { RODS } from "@shared/fishing";
import { SEA_CAST_ROD } from "@shared/sea_fishing";
import type { MapId } from "@shared/types";
import { SEA_CHANNEL, TICKET_PRICE } from "@shared/voyage";
import { Modal } from "./Modal";

// Captain Brine the walrus: at Sunset Beach's pier he sells the ticket to the Open Sea; at the wheel
// of his boat he takes you back to the pier (shared/voyage.ts). One trip a ticket, as long as you
// like; a trip cut short by a dropped connection is still yours.

export function CaptainModal({ mapId, profile, coins, send, onClose }: { mapId: MapId; profile: FishingProfile; coins: number; send: (channel: string, packet?: unknown) => void; onClose: () => void }) {
  const go = (op: "sail" | "home") => {
    send(SEA_CHANNEL, { op });
    onClose();
  };
  const rod = RODS[profile.rod];
  const canCast = rod.tier >= SEA_CAST_ROD;
  const atPier = mapId === "sunset_beach";
  return (
    <Modal title="Captain Brine" icon="⛵" onClose={onClose} width={420}>
      {atPier ? (
        <>
          <p className="m-0 text-sm">"Fancy the open sea? The big fish don't come near the pier. One ticket, one trip: stay out as long as you like, and I'll bring you back when you say."</p>
          <div className="rounded-2xl bg-black/20 px-3 py-2 text-xs leading-relaxed">
            <div>
              🎣 Casting from the boat takes an <b className="text-[#F7EBE1]">Expedition rod (T5)</b> or better.{" "}
              {canCast ? <span className="text-emerald-200">Your {rod.name} will do.</span> : <span className="text-rose-200">Your {rod.name} won't reach: you can still ride along.</span>}
            </div>
            <div>🖐️ By hand only out there: no AFK line.</div>
            <div>🪣 When your livewell is full, ask me for the pier and sell to Dune.</div>
          </div>
          <button type="button" disabled={!profile.seaTrip && coins < TICKET_PRICE} onClick={() => go("sail")} className="min-h-12 rounded-2xl bg-[#F5A623] text-base font-bold text-[#2B201B] transition active:scale-95 disabled:opacity-40">
            {profile.seaTrip ? "⛵ Back aboard (your ticket's still good)" : `⛵ Sail to the Open Sea · ${TICKET_PRICE} 🪙`}
          </button>
        </>
      ) : (
        <>
          <p className="m-0 text-sm">"Had enough? Or is that livewell full? Say the word and we turn for the pier."</p>
          <p className="m-0 text-xs opacity-75">Going back ends this trip: the next one is another ticket.</p>
          <button type="button" onClick={() => go("home")} className="min-h-12 rounded-2xl bg-[#F5A623] text-base font-bold text-[#2B201B] transition active:scale-95">
            ⚓ Back to the pier
          </button>
        </>
      )}
    </Modal>
  );
}
