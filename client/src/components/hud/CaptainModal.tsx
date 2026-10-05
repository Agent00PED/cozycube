import type { FishingProfile } from "@shared/fishing";
import { RODS } from "@shared/fishing";
import { SEA_CAST_ROD } from "@shared/sea_fishing";
import type { MapId } from "@shared/types";
import { CAPTAIN_RATE, CHART_PIECES, SEA_CHANNEL, TICKET_PRICE } from "@shared/voyage";
import { Modal } from "./Modal";

// Captain Brine the walrus: at Sunset Beach's pier he sells the ticket to the Open Sea; at the wheel
// of his boat he takes you back to the pier, and, once your torn sea chart is whole, on to the cove he
// has kept to himself (shared/voyage.ts). One trip a ticket, as long as you like; a trip cut short by
// a dropped connection is still yours.

export function CaptainModal({ mapId, profile, coins, send, onClose }: { mapId: MapId; profile: FishingProfile; coins: number; send: (channel: string, packet?: unknown) => void; onClose: () => void }) {
  const go = (op: "sail" | "home" | "cove" | "tosea") => {
    send(SEA_CHANNEL, { op });
    onClose();
  };
  const rod = RODS[profile.rod];
  const canCast = rod.tier >= SEA_CAST_ROD;
  const unlocked = profile.creel.filter((f) => !f.l).length;
  const whole = profile.coveAccess || profile.chart >= CHART_PIECES;
  const big = "min-h-12 w-full rounded-2xl px-4 bg-[#F5A623] text-base font-bold text-[#2B201B] transition active:scale-95 disabled:opacity-40";
  const plain = "min-h-12 w-full rounded-2xl px-4 bg-white/10 text-base font-bold transition active:scale-95";
  return (
    <Modal title="Captain Brine" icon="⛵" onClose={onClose} width={420}>
      {mapId === "sunset_beach" ? (
        <>
          <p className="m-0 text-sm">"Fancy the open sea? The big fish don't come near the pier. One ticket, one trip: stay out as long as you like, and I'll bring you back when you say."</p>
          <div className="rounded-2xl bg-black/20 px-3 py-2 text-xs leading-relaxed">
            <div>
              🎣 Casting from the boat takes an <b className="text-[#F7EBE1]">Expedition rod (T5)</b> or better.{" "}
              {canCast ? <span className="text-emerald-200">Your {rod.name} will do.</span> : <span className="text-rose-200">Your {rod.name} won't reach: you can still ride along.</span>}
            </div>
            <div>☕ An AFK line is welcome, from the rail or from a seat aboard.</div>
            <div>🪣 When your livewell is full I'll buy the catch at the wheel for {Math.round(CAPTAIN_RATE * 100)}% of Dune's price, or run you back to sell to him.</div>
          </div>
          <button type="button" disabled={!profile.seaTrip && coins < TICKET_PRICE} onClick={() => go("sail")} className={big}>
            {profile.seaTrip ? "⛵ Back aboard (your ticket's still good)" : `⛵ Sail to the Open Sea · ${TICKET_PRICE} 🪙`}
          </button>
        </>
      ) : mapId === "hidden_cove" ? (
        <>
          <p className="m-0 text-sm">"Take your time. Nobody comes here but us. When you're done, I'll put back to sea, or run you straight to the pier."</p>
          <button type="button" onClick={() => go("tosea")} className={big}>
            ⛵ Back to the Open Sea
          </button>
          <button type="button" onClick={() => go("home")} className={plain}>
            ⚓ Straight to the pier (the trip ends)
          </button>
        </>
      ) : (
        <>
          {whole ? (
            <p className="m-0 text-sm">
              {profile.coveAccess ? '"The cove again? Aye. Hold on."' : '"Let me see that... Where did you... I know that cove. Thirty years I\'ve kept it to myself. Not a word ashore, and I\'ll take you."'}
            </p>
          ) : (
            <p className="m-0 text-sm">"Had enough? Or is that livewell full? Say the word and we turn for the pier."</p>
          )}
          {profile.chart > 0 && !profile.coveAccess && (
            <p className="m-0 rounded-2xl bg-black/20 px-3 py-2 text-xs">
              🍾 A torn sea chart: <b className="text-[#F7EBE1]">{profile.chart}</b> of {CHART_PIECES} pieces{whole ? ". It is whole." : ". The rest must be out here somewhere."}
            </p>
          )}
          {whole && (
            <button type="button" onClick={() => go("cove")} className={big}>
              🗺️ To the hidden cove
            </button>
          )}
          <button
            type="button"
            disabled={!unlocked}
            onClick={() => {
              send("campfire", { type: "BARNABY", op: "sell", slot: "all" });
              onClose();
            }}
            className={`${plain} disabled:opacity-40`}
          >
            🐟 Sell my catch to the captain ({unlocked} fish · {Math.round(CAPTAIN_RATE * 100)}% of Dune's price)
          </button>
          <button type="button" onClick={() => go("home")} className={whole ? plain : big}>
            ⚓ Back to the pier
          </button>
          <p className="m-0 text-xs opacity-75">Going back to the pier ends this trip: the next one is another ticket.</p>
        </>
      )}
    </Modal>
  );
}
