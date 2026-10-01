import type { CampfirePacket } from "@shared/types";
import type { FishingProfile } from "@shared/fishing";
import { makingsList } from "@shared/expedition";
import { FAMILY, GEAR, GEAR_PRICE, MAX_RANK, PLACE_LABEL, SET_BONUS, SLOT_LABEL, TRAIT_RANK, TRIALS, gearOfFamily, ownedRank, placeDoes, rankLacks, rankStep, setCount, type GearFamily, type GearId, type GearPlace } from "@shared/gear";

// The gear's work at a counter (shared/gear.ts): a keeper's Gear tab, the woods' workbench, the forge
// and Gus's post each list the families they work on. A piece is bought once (rank 1) and raised, never
// replaced: each rank shows what it takes (the attunement earned by wearing it at its craft, from rank
// 3 a trial, the makings, a small fee) and where that work is done; the button is live only where it
// is. GEAR packets, answered with a notice.

const PIP = "inline-block h-1.5 w-3 rounded-full";
/** A piece's traits at a rank, in words. */
export const gearWords = (id: GearId, rank: number) => `${GEAR[id].main(Math.max(1, rank))}${rank >= TRAIT_RANK ? ` · ${GEAR[id].trait}` : ""}`;

export function GearWorks({ profile, coins, send, families, places }: { profile: FishingProfile; coins: number; send: (packet: CampfirePacket) => void; /** The families this counter works on. */ families: GearFamily[]; /** What this counter is (a woods keeper also does a campfire stall's work). */ places: GearPlace[] }) {
  const here = (wanted: GearPlace) => places.some((p) => placeDoes(p, wanted));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-center text-[11px] opacity-75">A piece is raised, never replaced. A rank is earned: wear the piece while you work at its craft, pass its trial, bring its makings.</p>
      {families.map((family) => {
        const f = FAMILY[family];
        const worn = setCount(profile, family);
        return (
          <div key={family} className="flex flex-col gap-1.5">
            <div className="flex flex-col rounded-xl bg-white/5 px-2.5 py-1.5 leading-tight">
              <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/80">
                {f.emoji} The {f.name}'s · {worn}/4 worn
              </b>
              <span className={`text-[10.5px] ${worn >= 2 ? "text-emerald-200" : "opacity-60"}`}>2 pieces: {SET_BONUS[family].two}</span>
              <span className={`text-[10.5px] ${worn >= 4 ? "text-emerald-200" : "opacity-60"}`}>All 4: {SET_BONUS[family].four}</span>
            </div>
            {gearOfFamily(family).map((id) => {
              const g = GEAR[id];
              const rank = ownedRank(profile, id);
              const buy = rankStep(id, 1);
              const { step, lacks } = rankLacks(profile, id, coins);
              const makings = step ? makingsList(profile, step.needs) : [];
              const ready = !!step && lacks.length === 0 && makings.every((m) => m.have >= m.need);
              const minutes = step ? Math.min(step.attune, profile.attune[id] ?? 0) / 60 : 0;
              const trial = step?.trial ? TRIALS[family][step.rank as 3 | 4 | 5] : null;
              const passed = !!step?.trial && profile.trials.includes(step.trial);
              return (
                <div key={id} className={`flex items-start gap-2 rounded-2xl px-2.5 py-2 ${profile.worn.includes(id) ? "bg-emerald-400/15" : "bg-white/10"}`}>
                  <span className="pt-0.5 text-2xl">{g.emoji}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                    <b className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#F7EBE1]">
                      {g.name} <span className="font-normal opacity-60">· {SLOT_LABEL[g.slot]}</span>
                      <span className="flex items-center gap-0.5" aria-label={`Rank ${rank} of ${MAX_RANK}`}>
                        {Array.from({ length: MAX_RANK }, (_, k) => (
                          <span key={k} className={`${PIP} ${k < rank ? "bg-amber-300" : "bg-white/15"}`} />
                        ))}
                      </span>
                    </b>
                    <span className="text-[11px] opacity-85">{rank > 0 ? gearWords(id, rank) : `${g.main(1)} (from rank ${TRAIT_RANK}: ${g.trait[0].toLowerCase()}${g.trait.slice(1)})`}</span>
                    {rank > 0 && step && (
                      <>
                        <span className="text-[10.5px] text-amber-100/90">
                          Rank {step.rank}: {g.main(step.rank)}
                          {step.rank === TRAIT_RANK ? `, and ${g.trait[0].toLowerCase()}${g.trait.slice(1)}` : ""}
                        </span>
                        <span className="flex flex-wrap gap-1 text-[10px]">
                          <span className={`rounded-full px-1.5 ${minutes * 60 >= step.attune ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-85"}`}>
                            Attuned {Math.floor(minutes)}/{step.attune / 60} min
                          </span>
                          {trial && <span className={`rounded-full px-1.5 ${passed ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>{passed ? "✓ Trial passed" : "✗ Trial"}</span>}
                          {makings.map((m) => (
                            <span key={m.name} className={`rounded-full px-1.5 ${m.have >= m.need ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-85"}`}>
                              {m.need} {m.name} <span className="opacity-70">({m.have})</span>
                            </span>
                          ))}
                          <span className={`rounded-full px-1.5 ${coins >= step.fee ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-85"}`}>{step.fee.toLocaleString("en-US")} 🪙</span>
                        </span>
                        {trial && !passed && (
                          <span className="text-[10px] opacity-75">
                            Trial, with a piece of the {f.name}'s on: {trial[0]}
                            {trial[1] !== trial[0] ? `, or ${trial[1][0].toLowerCase()}${trial[1].slice(1)}` : ""}.
                          </span>
                        )}
                      </>
                    )}
                    {rank >= MAX_RANK && <span className="text-[10.5px] text-amber-200">At its finest (ranks 6 and 7 come with the beach)</span>}
                  </div>
                  {rank === 0 ? (
                    here(buy.place) ? (
                      <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 px-3 text-xs" disabled={coins < GEAR_PRICE} onClick={() => send({ type: "GEAR", op: "buy", gear: id })}>
                        {GEAR_PRICE} 🪙
                      </button>
                    ) : (
                      <span className="max-w-[92px] shrink-0 px-1 text-right text-[10px] leading-tight opacity-70">Sold at {PLACE_LABEL[buy.place]}</span>
                    )
                  ) : step ? (
                    here(step.place) ? (
                      <button type="button" className="clay-btn clay-btn-amber min-h-9 shrink-0 px-3 text-xs" disabled={!ready} onClick={() => send({ type: "GEAR", op: "raise", gear: id })}>
                        Raise
                      </button>
                    ) : (
                      <span className="max-w-[92px] shrink-0 px-1 text-right text-[10px] leading-tight opacity-70">Rank {step.rank}: at {PLACE_LABEL[step.place]}</span>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
