import type { CampfirePacket } from "@shared/types";
import { BUFFS, CRAFTS, drawerCrafts, needsList, type CraftId } from "@shared/crafting";
import { BYPRODUCTS, BYPRODUCT_CRAFT, BYPRODUCT_IDS, type ByproductId } from "@shared/chop";
import { MATERIAL_CAP } from "@shared/economy";
import { ORE_ITEMS, type OreItemId } from "@shared/caverns_mining";
import { satchelCountFor } from "@shared/satchel";
import { buffOn, materialCount, type FishingProfile, type MaterialKey } from "@shared/fishing";

// What every drawer shares:
//
//   Materials      the by-products, the resin jar and the sawdust, in a store of their own beside the
//                  carrier, the livewell and the satchel (no slots): up to MATERIAL_CAP of each kind;
//                  each drawer shows its own discipline's (the wood's, the river's, the cavern's). A
//                  store over the cap from before keeps it all; only new ones wait for room
//   DrawerCrafts   the consumables brewed right in the drawer from its own materials (Feller's Pine
//                  Pitch, Phosphor Glow Bait, Miner's Stout): into the craft stash, then Use, a second
//                  one refreshing the clock (never stacking it)

type Disc = "wood" | "fish" | "ore";

const MATERIAL_EXTRA: Record<Disc, { key: MaterialKey; name: string; emoji: string; blurb: string }[]> = {
  wood: [
    { key: "resin", name: "Pine Resin", emoji: "🍯", blurb: "From gold swings; glues a carving" },
    { key: "sawdust", name: "Sawdust", emoji: "🪚", blurb: "From a broken carving; for the bonfire" },
  ],
  fish: [],
  ore: [],
};

/** The discipline's materials, each with its count against the store's 99. */
export function Materials({ profile, disc }: { profile: FishingProfile; disc: Disc }) {
  const rows: { key: MaterialKey; name: string; emoji: string; blurb: string; price?: number }[] = [
    ...BYPRODUCT_IDS.filter((k: ByproductId) => BYPRODUCT_CRAFT[k] === disc).map((k) => ({ key: k as MaterialKey, name: BYPRODUCTS[k].name, emoji: BYPRODUCTS[k].emoji, blurb: BYPRODUCTS[k].blurb.split(":")[0], price: BYPRODUCTS[k].price })),
    ...MATERIAL_EXTRA[disc],
  ];
  return (
    <div className="flex flex-col gap-1">
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Materials · up to {MATERIAL_CAP} of each</b>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((r) => {
          const n = materialCount(profile, r.key);
          const full = n >= MATERIAL_CAP;
          return (
            <div key={r.key} className={`flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5 ${n ? "" : "opacity-50"}`}>
              <span className="text-2xl">{r.emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <b className="flex min-w-0 items-baseline gap-1 text-xs text-[#F7EBE1]">
                  <span className="truncate">{r.name}</span>
                  <span className={`shrink-0 font-normal tabular-nums ${full ? "text-rose-300" : "opacity-70"}`} title={n > MATERIAL_CAP ? "Over the store's room: all kept, but no more come in until you sell or use some" : undefined}>
                    {n}/{MATERIAL_CAP}
                  </span>
                </b>
                <span className="truncate text-[11px] opacity-75">{r.blurb}</span>
                {r.price !== undefined && (
                  <span className="text-[10px] tabular-nums opacity-75">
                    {r.price} 🪙 each{n ? <b className="text-amber-200"> · {n * r.price} 🪙</b> : null}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** What a recipe's makings are called, and how many of each you have. */
function haveOf(profile: FishingProfile, key: string): { name: string; have: number } {
  const [kind, what] = key.split(":");
  if (kind === "by") return { name: BYPRODUCTS[what as ByproductId].name, have: materialCount(profile, what as ByproductId) };
  if (kind === "ore") return { name: ORE_ITEMS[what as OreItemId].name, have: satchelCountFor(profile, what as OreItemId) };
  if (kind === "resin") return { name: "Pine Resin", have: profile.resin };
  if (kind === "sawdust") return { name: "Sawdust", have: profile.sawdust };
  if (kind === "firewood") return { name: "Firewood", have: profile.firewood };
  return { name: what ?? kind, have: 0 };
}

/** The drawer's own brews: the makings, Make (into the stash) and Use (the buff on, or refreshed). */
export function DrawerCrafts({ profile, drawer, send }: { profile: FishingProfile; drawer: Disc; send: (packet: CampfirePacket) => void }) {
  const ids = drawerCrafts(drawer);
  if (!ids.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">Brewed right here</b>
      {ids.map((id: CraftId) => {
        const c = CRAFTS[id];
        const needs = needsList(id).map(({ key, n }) => ({ key, n, ...haveOf(profile, key) }));
        const ready = needs.every((x) => x.have >= x.n);
        const held = profile.crafts.filter((x) => x.c === id).length;
        const buff = c.buff ? BUFFS[c.buff] : null;
        const on = c.buff ? buffOn(profile, c.buff) : false;
        return (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-[#f5c46b]/10 px-2.5 py-2 ring-1 ring-[#f5c46b]/35" title={c.description}>
            <span className="text-2xl">{c.emoji}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <b className="text-xs text-[#F7EBE1]">
                {c.name}
                {held ? <span className="font-normal opacity-70"> · ×{held} in the stash</span> : null}
              </b>
              <span className="text-[10.5px] opacity-80">
                {buff ? `${buff.blurb}, ${buff.ms / 60_000} min` : c.description}
                {on ? " · on now" : ""}
              </span>
              <span className="flex flex-wrap gap-1 text-[10px]">
                {needs.map((x) => (
                  <span key={x.key} className={`rounded-full px-1.5 ${x.have >= x.n ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 opacity-80"}`}>
                    {x.n} {x.name} <span className="opacity-70">({x.have})</span>
                  </span>
                ))}
              </span>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-[11px]" disabled={!ready} onClick={() => send({ type: "DRAWER_CRAFT", craft: id })}>
                Make
              </button>
              {held > 0 && (
                <button type="button" className="clay-btn clay-btn-ghost min-h-9 px-3 text-[11px]" onClick={() => send({ type: "USE_CONSUMABLE", craft: id })}>
                  {on ? "Refresh" : "Use"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
