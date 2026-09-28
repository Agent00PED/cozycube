import { useEffect, useState } from "react";
import { AXES, AXES_BY_TIER, TREES, WOOD, WOOD_KINDS, carrierCapacity, woodAverage, type TreeKind } from "@shared/chop";
import { CRAFTS } from "@shared/crafting";
import { GEAR, GEAR_IDS } from "@shared/gear";
import { FISH, RODS, RODS_BY_TIER, TIER_COLOR, TIER_LABEL, carrierLoad, fishKg, isKingSize, stars, type FishId, type FishingProfile } from "@shared/fishing";
import { Modal } from "./Modal";

// The backpack (B, or the header's 🎒): everything the camp gives you, in one place.
//
//   Wood      the carrier's logs by kind, the carved pieces, the Firewood bundles, the Pine Resin
//   Fish      the livewell, each fish with its length, weight and stars
//   Tools     the axes and rods (the one in hand marked), Buster's gear, the woods' permits, the
//             buffs running now (Well-Fed, the Eagle Eye)
//   Logbook   the Nature Logbook: the freshwater fish by day and by night (a dark silhouette until
//             you catch one; a gold crown on a King Size record), the Ocean's page locked until the
//             beach opens, and the Timber Collection: every tree kind's lore, the widest trunk you
//             have felled, how many, and the most one of its logs ever sold for

type Tab = "wood" | "fish" | "tools" | "logbook";
const TABS: [Tab, string][] = [
  ["wood", "🪵 Wood"],
  ["fish", "🐟 Fish"],
  ["tools", "🧰 Tools"],
  ["logbook", "📖 Logbook"],
];

const FRESHWATER = (Object.keys(FISH) as FishId[]).filter((id) => FISH[id].water === "freshwater");
type Page = "day" | "night" | "ocean" | "timber";
const PAGES: [Page, string][] = [
  ["day", "☀️ Day"],
  ["night", "🌙 Night"],
  ["ocean", "🌊 Ocean 🔒"],
  ["timber", "🌲 Timber"],
];
const TREE_ICON: Record<TreeKind, string> = { soft_pine: "🌲", birch: "🌳", cedar: "🌲", maple: "🍁", elderwood: "🌌" };

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

export function BackpackModal({ profile, onClose }: { profile: FishingProfile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("wood");
  const [page, setPage] = useState<Page>("day");
  // the buffs' minutes tick down while it is open
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);
  const load = carrierLoad(profile);
  const cap = carrierCapacity(profile.carrierTier);
  const caughtKinds = FRESHWATER.filter((id) => (profile.caught[id] ?? 0) > 0).length;
  return (
    <Modal title="Backpack" icon="🎒" onClose={onClose} width={560}>
      <div className="flex min-h-0 flex-col gap-3 pb-2">
        <div className="flex gap-1.5" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-9 flex-1 rounded-full px-1.5 text-xs font-bold transition-transform active:scale-95 ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10 hover:bg-white/15"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "wood" && (
          <div className="flex flex-col gap-2">
            <Bar label="Wood carrier" value={load} max={cap} />
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {WOOD_KINDS.map((k) => (
                <div key={k} className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 ${(profile.wood[k] ?? 0) > 0 ? "bg-white/10" : "bg-white/5 opacity-55"}`}>
                  <span className="text-2xl">{WOOD[k].emoji}</span>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <b className="truncate text-xs text-[#F7EBE1]">{WOOD[k].name}</b>
                    <span className="text-xs">
                      ×{profile.wood[k] ?? 0}
                      {(profile.wood[k] ?? 0) > 0 && woodAverage(profile, k) > 1.01 ? <span className="text-[#F5A623]"> · big ×{woodAverage(profile, k).toFixed(2)}</span> : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <span className="rounded-2xl bg-white/10 px-2.5 py-2">🪵 Firewood ×{profile.firewood}</span>
              <span className="rounded-2xl bg-white/10 px-2.5 py-2">🍯 Pine Resin ×{profile.resin}</span>
              <span className="rounded-2xl bg-white/10 px-2.5 py-2">🟫 Sawdust ×{profile.sawdust}</span>
            </div>
            {profile.crafts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.crafts.map((c, i) => (
                  <span key={i} className={`rounded-full px-2.5 py-1 text-xs ${c.m ? "border border-[#F5A623] bg-[#F5A623]/15 text-[#F5A623]" : "bg-white/10"}`}>
                    {CRAFTS[c.c].emoji} {CRAFTS[c.c].name}
                    {c.m ? " ✨" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "fish" && (
          <div className="flex min-h-0 flex-col gap-2">
            <Bar label="Livewell" value={profile.creel.length} max={profile.slots} />
            {profile.creel.length === 0 ? (
              <p className="m-0 rounded-2xl bg-white/5 px-3 py-3 text-center text-sm opacity-80">Your livewell is empty. Cast from the campfire's dock, the canoe, or the river bank in the woods.</p>
            ) : (
              <div className="grid max-h-[40vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {profile.creel.map((f, i) => {
                  const sp = FISH[f.s];
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-2xl bg-white/10 px-2.5 py-1.5">
                      <span className="text-2xl">{sp.emoji}</span>
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <b className="truncate text-xs text-[#F7EBE1]">
                          {sp.name}
                          {isKingSize(f) ? " 👑" : ""}
                        </b>
                        <span className="text-[11px] opacity-80">
                          {f.cm} cm · {fishKg(f)} kg · {stars(f.q)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: TIER_COLOR[sp.tier] }}>
                        {TIER_LABEL[sp.tier]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "tools" && (
          <div className="flex flex-col gap-2 text-xs">
            <Row title="Axes">
              {AXES_BY_TIER.filter((id) => profile.axes.includes(id)).map((id) => (
                <Chip key={id} on={profile.axe === id}>
                  {AXES[id].emoji} {AXES[id].name} · T{AXES[id].tier}
                </Chip>
              ))}
            </Row>
            <Row title="Rods">
              {RODS_BY_TIER.filter((id) => profile.rods.includes(id)).map((id) => (
                <Chip key={id} on={profile.rod === id}>
                  {RODS[id].emoji} {RODS[id].name} · T{RODS[id].tier}
                </Chip>
              ))}
            </Row>
            <Row title="Gear">
              {GEAR_IDS.filter((id) => profile.gear.includes(id)).map((id) => (
                <Chip key={id}>
                  {GEAR[id].emoji} {GEAR[id].name}
                </Chip>
              ))}
              {!profile.gear.length && <span className="opacity-60">None yet: Buster sells gloves, boots and an apron</span>}
            </Row>
            <Row title="The Whispering Woods">
              {profile.ranger ? <Chip on>🎖️ Ranger's Badge</Chip> : <Chip>🎫 Day Trip Permits ×{profile.dayPermits}</Chip>}
            </Row>
            <Row title="Right now">
              {profile.fedUntil > Date.now() && <Chip on>🍲 Well-Fed · {minutesLeft(profile.fedUntil)}</Chip>}
              {profile.eagleUntil > Date.now() && <Chip on>🦅 Eagle Eye · {minutesLeft(profile.eagleUntil)}</Chip>}
              {profile.fedUntil <= Date.now() && profile.eagleUntil <= Date.now() && <span className="opacity-60">No buffs: try the Campfire Stew, or the slingshot gallery's top prize</span>}
            </Row>
            {profile.slingBest > 0 && <span className="opacity-75">🎯 Slingshot best: {profile.slingBest.toLocaleString("en-US")}</span>}
          </div>
        )}

        {tab === "logbook" && (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {PAGES.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setPage(id)} className={`min-h-8 rounded-full px-2.5 py-1 font-bold ${page === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10"} ${id === "ocean" ? "opacity-70" : ""}`}>
                  {label}
                </button>
              ))}
              {(page === "day" || page === "night") && (
                <b className="ml-auto text-[#F7EBE1]">
                  Fish: {caughtKinds}/{FRESHWATER.length}
                </b>
              )}
            </div>
            {(page === "day" || page === "night") && (
              <div className="grid max-h-[42vh] grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5">
                {FRESHWATER.filter((id) => FISH[id].time === page).map((id) => {
                  const sp = FISH[id];
                  const n = profile.caught[id] ?? 0;
                  const longest = profile.records[id] ?? 0;
                  const king = longest > 0 && isKingSize({ s: id, cm: longest });
                  return (
                    <div key={id} className={`relative flex flex-col items-center gap-0.5 rounded-2xl px-1.5 py-2 text-center ${king ? "bg-[#F5A623]/15 ring-1 ring-[#F5A623]/70" : "bg-white/5"}`} title={n ? sp.name : "Not caught yet"}>
                      {king && (
                        <span className="absolute right-1 top-0.5 text-sm drop-shadow" title="King Size record">
                          👑
                        </span>
                      )}
                      <span className="text-3xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }}>
                        {sp.emoji}
                      </span>
                      <b className="w-full truncate text-[10px] text-[#F7EBE1]">{n ? sp.name : "???"}</b>
                      <span className="text-[9px] font-bold" style={{ color: TIER_COLOR[sp.tier] }}>
                        {TIER_LABEL[sp.tier]}
                        {"rapids" in sp && sp.rapids ? " · woods" : ""}
                      </span>
                      {n > 0 && (
                        <span className={`text-[9px] ${king ? "font-bold text-[#F5A623]" : "opacity-75"}`}>
                          ×{n} · {longest} cm
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {page === "ocean" && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/5 px-4 py-6 text-center">
                <span className="text-4xl" aria-hidden>
                  🔒🌊
                </span>
                <b className="text-sm text-[#F7EBE1]">The Ocean's page is locked</b>
                <span className="text-xs opacity-75">Saltwater fish come with the Sunset Beach Bar. Until then, the river and the woods have plenty to catch!</span>
              </div>
            )}
            {page === "timber" && (
              <div className="grid max-h-[46vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {(Object.keys(TREES) as TreeKind[]).map((k) => {
                  const t = TREES[k];
                  const n = profile.felled[k] ?? 0;
                  const cm = profile.trunkRecord[k] ?? 0;
                  const peak = profile.bestLog[t.wood] ?? 0;
                  return (
                    <div key={k} className={`flex gap-2 rounded-2xl px-2.5 py-2 ${n ? "bg-white/10" : "bg-white/5"}`}>
                      <span className="text-3xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }} aria-hidden>
                        {TREE_ICON[k]}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                        <div className="flex items-center gap-1.5">
                          <b className="truncate text-xs text-[#F7EBE1]">{n ? t.name : "???"}</b>
                          <span className="rounded-full bg-[#F5A623]/20 px-1.5 text-[9px] font-extrabold text-[#F5A623]">T{t.tier}</span>
                        </div>
                        <span className="text-[10px] italic opacity-75">{n ? t.lore : "Fell one to learn its story."}</span>
                        <span className="grid grid-cols-3 gap-1 text-[10px] tabular-nums">
                          <span title="The widest trunk you have felled">📏 {cm ? `${cm} cm` : "—"}</span>
                          <span title="How many you have felled">🪓 ×{n}</span>
                          <span title="The most one of its logs ever sold for">💰 {peak ? `${peak} 🪙` : "—"}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  // (the soft clamp: a load from before a downsizing may be over the tier's size; it is all kept,
  // and nothing more comes in until it is back under)
  const full = value >= max;
  return (
    <div className="flex items-center gap-2 text-xs">
      <b className="w-24 text-[#F7EBE1]">{label}</b>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: full ? "#ec7fa3" : "#F5A623" }} />
      </div>
      <span className={`tabular-nums ${value > max ? "font-bold text-rose-300" : ""}`} title={value > max ? "Over capacity: everything is kept, but nothing more comes in until you sell some" : undefined}>
        {value}/{max}
      </span>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <b className="text-[11px] uppercase tracking-widest text-[#C9BDB5]/70">{title}</b>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 ${on ? "border border-[#F5A623]/70 bg-[#F5A623]/15 text-[#F7EBE1]" : "bg-white/10"}`}>{children}</span>;
}
