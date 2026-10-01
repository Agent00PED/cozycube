import type { CampfirePacket } from "@shared/types";
import { FAMILY, GEAR, GEAR_SLOTS, SET_BONUS, SLOT_LABEL, familyOfDiscipline, gearOfDiscipline, gearOfFamily, ownedRank, setCount, wearGear, type GearDiscipline, type GearFamily, type GearId } from "@shared/gear";
import { gearWords } from "./GearWorks";
import type { FishingProfile } from "@shared/fishing";
import { CRAFTS, TOOL_CRAFT, type ToolId } from "@shared/crafting";
import { CAVE_TACKLES, CAVE_TACKLE_IDS } from "@shared/caverns_fishing";

// The gear you wear, slot by slot (the drawers' gear tabs: the wood drawer's Axe & Gear, the fish
// drawer's Rod & Gear, the ore satchel's Pickaxe & Gear): hands, waist, a charm and the back, one
// piece each, of any family. Each drawer leads with its own family's set (how many are worn, its two
// bonuses, and a button that puts the whole set on: the way to change craft in one tap), then the
// four slots as worn, then its own family's and the Wayfarer's pieces you have off, each a tap to
// wear. Buying and raising happen at the counters (GearWorks). GEAR packets, answered with a notice.

export function GearSlots({ profile, send, disc }: { profile: FishingProfile; send: (packet: CampfirePacket) => void; /** The drawer's discipline: its family's pieces (and the Wayfarer's) show. */ disc: GearDiscipline }) {
  const family = familyOfDiscipline(disc);
  const mine = gearOfDiscipline(disc);
  const spare = mine.filter((id) => profile.gear.includes(id) && !profile.worn.includes(id));
  const sets: GearFamily[] = [family, "wayfarer"];
  return (
    <div className="flex flex-col gap-1.5">
      {sets.map((f) => {
        const owned = gearOfFamily(f).filter((id) => profile.gear.includes(id));
        const worn = setCount(profile, f);
        if (!owned.length) return null;
        return (
          <div key={f} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/80">
                {FAMILY[f].emoji} The {FAMILY[f].name}'s · {worn}/4 worn
              </b>
              <span className={`text-[10.5px] ${worn >= 2 ? "text-emerald-200" : "opacity-60"}`}>2 pieces: {SET_BONUS[f].two}</span>
              <span className={`text-[10.5px] ${worn >= 4 ? "text-emerald-200" : "opacity-60"}`}>All 4: {SET_BONUS[f].four}</span>
            </div>
            {worn < owned.length && (
              <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 px-3 text-xs" onClick={() => send({ type: "GEAR", op: "set", family: f })}>
                Wear the set
              </button>
            )}
          </div>
        );
      })}
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Worn</b>
      <div className="grid grid-cols-2 gap-1.5">
        {GEAR_SLOTS.map((slot) => {
          const id: GearId | undefined = profile.worn.find((w) => GEAR[w].slot === slot);
          const g = id ? GEAR[id] : null;
          const rank = id ? ownedRank(profile, id) : 0;
          return (
            <div key={slot} className={`flex min-h-[52px] items-center gap-1.5 rounded-2xl px-2 py-1.5 ${g ? "bg-emerald-400/15 ring-1 ring-emerald-300/40" : "border border-dashed border-white/20 bg-white/[0.03]"}`} title={id ? gearWords(id, rank) : undefined}>
              <span className="text-xl">{g ? g.emoji : "·"}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                  {SLOT_LABEL[slot]}
                  {g ? ` · ${FAMILY[g.family].name} · rank ${rank}` : ""}
                </span>
                <span className={`truncate text-[11px] ${g ? "font-semibold text-[#F7EBE1]" : "opacity-50"}`}>{g ? g.name : "Empty"}</span>
                {id && <span className="truncate text-[10px] opacity-75">{gearWords(id, rank)}</span>}
              </div>
              {id && (
                <button type="button" className="clay-btn min-h-8 px-2 text-[10px]" onClick={() => send({ type: "GEAR", op: "unequip", gear: id })} aria-label={`Take off the ${g?.name}`}>
                  Off
                </button>
              )}
            </div>
          );
        })}
      </div>
      {spare.length > 0 && (
        <>
          <b className="mt-1 text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">In your pack</b>
          {spare.map((id) => {
            const g = GEAR[id];
            const rank = ownedRank(profile, id);
            const swap = wearGear(profile.worn, id).removed;
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                <span className="text-xl">{g.emoji}</span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate text-xs text-[#F7EBE1]">
                    {g.name} <span className="font-normal opacity-60">· {SLOT_LABEL[g.slot]} · rank {rank}</span>
                  </b>
                  <span className="text-[10.5px] opacity-75">{gearWords(id, rank)}</span>
                </div>
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "GEAR", op: "equip", gear: id })} title={swap.length ? `In place of the ${swap.map((r) => GEAR[r].name).join(" and ")}` : undefined}>
                  {swap.length ? "Swap" : "Wear"}
                </button>
              </div>
            );
          })}
        </>
      )}
      {!mine.some((id) => profile.gear.includes(id)) && (
        <p className="m-0 text-center text-[11px] opacity-60">
          {disc === "wood" ? "No Forester's gear yet: Buster sells each piece's first rank, at the campfire." : disc === "fish" ? "No Angler's gear yet: Barnaby sells each piece's first rank, at the campfire." : "No Prospector's gear yet: Gus sells each piece's first rank, at his post."}
        </p>
      )}
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
                    <span className="text-[10px] opacity-80">{owned ? t.blurb : "Not yet: barter with Finnegan by the Great Lake"}</span>
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
