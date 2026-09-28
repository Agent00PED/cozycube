import type { CampfirePacket } from "@shared/types";
import { GEAR, GEAR_SLOTS, SLOT_CAP, SLOT_LABEL, wearGear, type GearId } from "@shared/gear";
import type { FishingProfile } from "@shared/fishing";

// The gear you wear, slot by slot (the drawers' Axe & Gear and Rod & Gear tabs): hands, waist, two
// fingers and a charm, each piece with a Take off; below, what you own but have off, each a tap to
// wear (a Swap when it would take another's place). GEAR packets, answered with a notice.

export function GearSlots({ profile, send, craft }: { profile: FishingProfile; send: (packet: CampfirePacket) => void; /** Whose kit leads the spare list. */ craft: "wood" | "fish" }) {
  const spare = profile.gear.filter((id) => !profile.worn.includes(id)).sort((a, b) => Number(GEAR[b].craft === craft) - Number(GEAR[a].craft === craft) || GEAR[a].tier - GEAR[b].tier);
  return (
    <div className="flex flex-col gap-1.5">
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Worn</b>
      <div className="grid grid-cols-2 gap-1.5">
        {GEAR_SLOTS.flatMap((slot) => {
          const on = profile.worn.filter((id) => GEAR[id].slot === slot);
          return Array.from({ length: SLOT_CAP[slot] }, (_, k) => {
            const id: GearId | undefined = on[k];
            const g = id ? GEAR[id] : null;
            return (
              <div key={`${slot}${k}`} className={`flex min-h-[52px] items-center gap-1.5 rounded-2xl px-2 py-1.5 ${g ? "bg-emerald-400/15 ring-1 ring-emerald-300/40" : "border border-dashed border-white/20 bg-white/[0.03]"}`} title={g?.blurb}>
                <span className="text-xl">{g ? g.emoji : "·"}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                    {SLOT_LABEL[slot]}
                    {SLOT_CAP[slot] > 1 ? ` ${k + 1}` : ""}
                  </span>
                  <span className={`truncate text-[11px] ${g ? "font-semibold text-[#F7EBE1]" : "opacity-50"}`}>{g ? g.name : "Empty"}</span>
                </div>
                {id && (
                  <button type="button" className="clay-btn min-h-8 px-2 text-[10px]" onClick={() => send({ type: "GEAR", op: "unequip", gear: id })} aria-label={`Take off the ${g?.name}`}>
                    Off
                  </button>
                )}
              </div>
            );
          });
        })}
      </div>
      {spare.length > 0 && (
        <>
          <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">In your pack</b>
          {spare.map((id) => {
            const g = GEAR[id];
            const swap = wearGear(profile.worn, id).removed;
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-xl">{g.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate text-xs text-[#F7EBE1]">
                    {g.name} <span className="font-normal opacity-60">· {SLOT_LABEL[g.slot]}</span>
                  </b>
                  <span className="text-[10.5px] opacity-75">{g.blurb}</span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "GEAR", op: "equip", gear: id })} title={swap.length ? `In place of the ${swap.map((r) => GEAR[r].name).join(" and ")}` : undefined}>
                  {swap.length ? "Swap" : "Wear"}
                </button>
              </div>
            );
          })}
        </>
      )}
      {!profile.gear.length && <p className="m-0 text-center text-[11px] opacity-60">No gear yet: Buster and Bramble sell the woodcutter's, Barnaby and Finley the angler's.</p>}
    </div>
  );
}
