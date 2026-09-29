import type { CampfirePacket } from "@shared/types";
import { GEAR, GEAR_SLOTS, SLOT_CAP, SLOT_LABEL, wearGear, type GearDiscipline, type GearId } from "@shared/gear";
import type { FishingProfile } from "@shared/fishing";
import { CRAFTS, TOOL_CRAFT, type ToolId } from "@shared/crafting";
import { CAVE_TACKLES, CAVE_TACKLE_IDS } from "@shared/caverns_fishing";

// The gear you wear, slot by slot (the drawers' gear tabs: the wood drawer's Axe & Gear, the fish
// drawer's Rod & Gear, the ore satchel's Pickaxe & Gear): hands, waist, two fingers and a charm. Each
// drawer shows only its own discipline's pieces: its own worn ones with a Take off, a slot another
// discipline's piece fills dimmed (it is in that drawer), and below, its own pieces you have off, each
// a tap to wear (a Swap when it would take another's place). GEAR packets, answered with a notice.

const DISC_NAME: Record<GearDiscipline, string> = { wood: "the Forester's", fish: "the Angler's", ore: "the Miner's" };

export function GearSlots({ profile, send, disc }: { profile: FishingProfile; send: (packet: CampfirePacket) => void; /** The drawer's discipline: only its own pieces show. */ disc: GearDiscipline }) {
  const spare = profile.gear.filter((id) => !profile.worn.includes(id) && GEAR[id].disc === disc).sort((a, b) => GEAR[a].tier - GEAR[b].tier);
  return (
    <div className="flex flex-col gap-1.5">
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Worn</b>
      <div className="grid grid-cols-2 gap-1.5">
        {GEAR_SLOTS.flatMap((slot) => {
          const on = profile.worn.filter((id) => GEAR[id].slot === slot);
          return Array.from({ length: SLOT_CAP[slot] }, (_, k) => {
            const id: GearId | undefined = on[k];
            const g = id ? GEAR[id] : null;
            if (g && g.disc !== disc)
              return (
                <div key={`${slot}${k}`} className="flex min-h-[52px] items-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-2 py-1.5 opacity-60" title={`${g.name}: worn from ${DISC_NAME[g.disc]} drawer`}>
                  <span className="text-xl grayscale">{g.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                      {SLOT_LABEL[slot]}
                      {SLOT_CAP[slot] > 1 ? ` ${k + 1}` : ""}
                    </span>
                    <span className="truncate text-[11px]">In use: {DISC_NAME[g.disc]} kit</span>
                  </div>
                </div>
              );
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
      {!profile.gear.some((id) => GEAR[id].disc === disc) && <p className="m-0 text-center text-[11px] opacity-60">{disc === "wood" ? "No woodcutter's gear yet: Buster and Bramble sell it, and the workbench carves its relics." : disc === "fish" ? "No angler's gear yet: Barnaby, Finley and Finnegan sell it, and the workbench carves its relics." : "No mining relics yet: forge them at the Thermal Bellows Forge."}</p>}
    </div>
  );
}

/** Each craft's tackles from the workbench (made once, at work whenever you fish or fell). */
const CRAFT_TOOLS: Record<"wood" | "fish", ToolId[]> = { fish: ["otter_float", "resin_sinker", "silk_line"], wood: ["wedge_mallet", "titan_lever"] };

/** The tackles you have made for this craft: always at work, nothing to wear; the rest, where to
 *  make them (the angler's: Finnegan's advanced tackle too, bartered in the caverns). */
export function TacklesOwned({ profile, craft }: { profile: FishingProfile; craft: "wood" | "fish" }) {
  const tools = CRAFT_TOOLS[craft].map((t) => ({ id: TOOL_CRAFT[t], ...CRAFTS[TOOL_CRAFT[t]] }));
  return (
    <div className="flex flex-col gap-1">
      {craft === "fish" && (
        <>
          <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">🦎 Finnegan's advanced tackle</b>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {CAVE_TACKLE_IDS.map((id) => {
              const t = CAVE_TACKLES[id];
              const owned = profile.caveTackles.includes(id);
              return (
                <div key={id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${owned ? "bg-[#8fd3b6]/15 ring-1 ring-[#8fd3b6]/50" : "bg-white/5 opacity-60"}`} title={t.blurb}>
                  <span className="text-xl">{t.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <b className="truncate text-xs text-[#F7EBE1]">{t.name}</b>
                    <span className="text-[10px] opacity-80">{owned ? t.blurb : "Not yet: barter with Finnegan by the cenote"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">🎣 Tackles from the workbench</b>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {tools.map((c) => {
          const owned = profile.tools.includes(c.id);
          return (
            <div key={c.id} className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 ${owned ? "bg-[#8fd3b6]/15 ring-1 ring-[#8fd3b6]/50" : "bg-white/5 opacity-60"}`} title={c.description}>
              <span className="text-xl">{c.emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="truncate text-xs text-[#F7EBE1]">{c.name}</b>
                <span className="text-[10px] opacity-80">{owned ? c.description : "Not made yet: 🪚 the workbench"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
