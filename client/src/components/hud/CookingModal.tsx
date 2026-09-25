import { useState } from "react";
import { parseBag, type CampfirePacket } from "@shared/types";
import { FISH, stars, WELL_FED_S, woodCount, type FishingProfile } from "@shared/fishing";
import { WOOD, WOOD_KINDS } from "@shared/chop";
import { COZY_AURA_FUEL, LOW_FUEL, STEW_INGREDIENT_INFO, STEW_SLOTS, hasCozyAura, stewName } from "@shared/bonfire";
import type { HearthState } from "../../hooks/useColyseusRoom";
import { Modal } from "./Modal";

interface Props {
  hearth: HearthState;
  profile: FishingProfile;
  bag: string;
  userId: string;
  fed: number;
  send: (packet: CampfirePacket) => void;
  onClose: () => void;
}

// The hearth: the bonfire's fuel (a split log +25%, Golden Charcoal +50%; above 70% everyone at the
// campfire has the Cozy Aura) and the communal Dutch oven on its tripod over it. Anyone adds an
// ingredient (a fish from their creel, mushrooms, berries); the third sets it simmering, and then
// everyone can scoop a bowl (one each per pot) and be Well-Fed for eight minutes.

export function CookingModal({ hearth, profile, bag, userId, fed, send, onClose }: Props) {
  const [pickFish, setPickFish] = useState(false);
  const items = parseBag(bag);
  const { fuel, stew } = hearth;
  const aura = hasCozyAura(fuel);
  const served = stew.served.includes(userId);
  const gathering = stew.phase === "gathering" && stew.items.length < STEW_SLOTS;
  const add = (ingredient: "mushroom" | "berry") => send({ type: "STEW_ADD", ingredient });
  const fedLeft = `${Math.floor(fed / 60)}:${String(fed % 60).padStart(2, "0")}`;
  return (
    <Modal title="The Hearth" icon="🍲" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 pb-2">
        {/* the fire */}
        <section className="flex flex-col gap-1.5 rounded-2xl bg-white/5 p-2.5">
          <div className="flex items-center justify-between text-sm">
            <b>🔥 Bonfire</b>
            <span className={`text-xs font-bold ${aura ? "text-amber-200" : fuel < LOW_FUEL ? "text-rose-200" : "opacity-80"}`}>{aura ? "✨ Cozy Aura: +15% rare fish & coins" : fuel < LOW_FUEL ? "Burning low: smoky" : `Roars above ${COZY_AURA_FUEL}%`}</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-black/30" role="meter" aria-valuenow={fuel} aria-valuemin={0} aria-valuemax={100} aria-label="Bonfire fuel">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${fuel}%`, background: aura ? "linear-gradient(90deg,#ff8c32,#ffd166)" : fuel < LOW_FUEL ? "#8a6a5a" : "#ff8c32" }} />
            <div className="absolute inset-y-0 w-0.5 bg-white/50" style={{ left: `${COZY_AURA_FUEL}%` }} aria-hidden />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {WOOD_KINDS.map((k) => (
              <button key={k} type="button" className={`clay-btn min-h-10 px-1 text-[11px] leading-tight ${k === "pine" ? "clay-btn-amber" : ""}`} disabled={!profile.wood[k] || fuel >= 100} onClick={() => send({ type: "ADD_FUEL", item: k })} title={WOOD[k].name}>
                {WOOD[k].emoji} ×{profile.wood[k]} · +{WOOD[k].fuel}%
              </button>
            ))}
          </div>
          {woodCount(profile) === 0 && <p className="m-0 text-[11px] opacity-60">Split logs at the chopping block by the woodpile for firewood.</p>}
        </section>

        {/* the Dutch oven */}
        <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-2.5">
          <div className="flex items-center justify-between text-sm">
            <b>🫕 Dutch Oven</b>
            <span className="text-xs opacity-80">{stew.phase === "gathering" ? `${stew.items.length}/${STEW_SLOTS} ingredients` : stew.phase === "cooking" ? "Simmering…" : `${stew.servings} bowls left`}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: STEW_SLOTS }, (_, k) => {
              const it = stew.items[k];
              return (
                <div key={k} className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl text-center leading-tight ${it ? "bg-white/10" : "border border-dashed border-white/15 opacity-50"}`}>
                  <span className="text-2xl">{it ? (it.fish ? FISH[it.fish].emoji : STEW_INGREDIENT_INFO[it.kind].emoji) : "·"}</span>
                  {it && <span className="max-w-full truncate px-1 text-[10px] opacity-75">{it.by}</span>}
                </div>
              );
            })}
          </div>
          {stew.phase !== "gathering" && <div className="text-center text-sm font-semibold text-amber-100">{stewName(stew.items)}</div>}
          {stew.phase === "cooking" && (
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30" aria-label="Cooking">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-300 transition-[width] duration-500" style={{ width: `${stew.progress * 100}%` }} />
            </div>
          )}
          {gathering && !pickFish && (
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" className="clay-btn min-h-10 px-1 text-xs" disabled={profile.creel.length === 0} onClick={() => setPickFish(true)}>
                🐟 Fish ×{profile.creel.length}
              </button>
              <button type="button" className="clay-btn min-h-10 px-1 text-xs" disabled={!items.mushroom} onClick={() => add("mushroom")}>
                🍄 ×{items.mushroom ?? 0}
              </button>
              <button type="button" className="clay-btn min-h-10 px-1 text-xs" disabled={!items.berry} onClick={() => add("berry")}>
                🫐 ×{items.berry ?? 0}
              </button>
            </div>
          )}
          {gathering && pickFish && (
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-75">Which fish goes in the pot?</span>
              <div className="flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto">
                {profile.creel.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    className="clay-btn min-h-9 px-2 text-xs"
                    onClick={() => {
                      send({ type: "STEW_ADD", ingredient: "fish", slot: i });
                      setPickFish(false);
                    }}
                  >
                    {FISH[f.s].emoji} {f.cm} cm {stars(f.q)}
                  </button>
                ))}
                <button type="button" className="min-h-9 rounded-full px-3 text-xs opacity-70 hover:opacity-100" onClick={() => setPickFish(false)}>
                  Back
                </button>
              </div>
            </div>
          )}
          {gathering && <p className="m-0 text-[11px] opacity-60">Anyone can add: fish from the creel, mushrooms and berries foraged under the pines.</p>}
          {stew.phase === "ready" && (
            <button type="button" className="clay-btn clay-btn-amber min-h-12 w-full text-[15px]" disabled={served || stew.servings <= 0} onClick={() => send({ type: "STEW_SCOOP" })}>
              {served ? "😋 You had a bowl of this pot" : "🥣 Scoop Stew"}
            </button>
          )}
        </section>

        <p className="m-0 text-center text-xs opacity-75">
          {fed > 0 ? `😋 Well-Fed for ${fedLeft}: a bouncier step, and fish bite 2s sooner` : `A bowl of stew, a roasted skewer or a marshmallow: Well-Fed for ${WELL_FED_S / 60} minutes`}
        </p>
      </div>
    </Modal>
  );
}
