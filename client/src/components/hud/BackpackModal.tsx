import { useEffect, useState } from "react";
import { AXES, AXES_BY_TIER, TREES, WOOD, WOOD_KINDS, carrierCapacity, type TreeKind } from "@shared/chop";
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
//   Logbook   the Nature Logbook: every fish of the river and the rapids (a dark silhouette until
//             you catch one, by day or by night, its tier), and every tree you have felled

type Tab = "wood" | "fish" | "tools" | "logbook";
const TABS: [Tab, string][] = [
  ["wood", "🪵 Wood"],
  ["fish", "🐟 Fish"],
  ["tools", "🧰 Tools"],
  ["logbook", "📖 Logbook"],
];

const FRESHWATER = (Object.keys(FISH) as FishId[]).filter((id) => FISH[id].water === "freshwater");

function minutesLeft(until: number) {
  const m = Math.ceil((until - Date.now()) / 60000);
  return m > 0 ? `${m} min` : "";
}

export function BackpackModal({ profile, onClose }: { profile: FishingProfile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("wood");
  const [time, setTime] = useState<"all" | "day" | "night">("all");
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
                    <span className="text-xs">×{profile.wood[k] ?? 0}</span>
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
              <p className="m-0 rounded-2xl bg-white/5 px-3 py-3 text-center text-sm opacity-80">Your livewell is empty. Cast from the campfire's dock, the canoe, or the rapids in the woods.</p>
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
            <div className="flex items-center gap-1.5 text-xs">
              <b className="text-[#F7EBE1]">
                Fish: {caughtKinds}/{FRESHWATER.length}
              </b>
              <span className="ml-auto flex gap-1">
                {(["all", "day", "night"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTime(t)} className={`rounded-full px-2.5 py-1 font-bold ${time === t ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10"}`}>
                    {t === "all" ? "All" : t === "day" ? "☀️ Day" : "🌙 Night"}
                  </button>
                ))}
              </span>
            </div>
            <div className="grid max-h-[38vh] grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5">
              {FRESHWATER.filter((id) => time === "all" || FISH[id].time === time).map((id) => {
                const sp = FISH[id];
                const n = profile.caught[id] ?? 0;
                return (
                  <div key={id} className="flex flex-col items-center gap-0.5 rounded-2xl bg-white/5 px-1.5 py-2 text-center" title={n ? sp.name : "Not caught yet"}>
                    <span className="text-3xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }}>
                      {sp.emoji}
                    </span>
                    <b className="w-full truncate text-[10px] text-[#F7EBE1]">{n ? sp.name : "???"}</b>
                    <span className="text-[9px] font-bold" style={{ color: TIER_COLOR[sp.tier] }}>
                      {TIER_LABEL[sp.tier]}
                      {"rapids" in sp && sp.rapids ? " · rapids" : ""}
                    </span>
                    {n > 0 && (
                      <span className="text-[9px] opacity-75">
                        ×{n} · {profile.records[id] ?? 0} cm
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(TREES) as TreeKind[]).map((k) => {
                const n = profile.felled[k] ?? 0;
                return (
                  <div key={k} className="flex flex-col items-center rounded-2xl bg-white/5 px-1 py-1.5 text-center">
                    <span className="text-2xl" style={n ? undefined : { filter: "brightness(0) opacity(0.45)" }}>
                      {k === "maple" ? "🍁" : k === "birch" ? "🌳" : k === "elderwood" ? "🌌" : "🌲"}
                    </span>
                    <b className="w-full truncate text-[10px] text-[#F7EBE1]">{n ? TREES[k].name : "???"}</b>
                    <span className="text-[9px] opacity-75">{n ? `felled ×${n}` : `T${TREES[k].tier}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max;
  return (
    <div className="flex items-center gap-2 text-xs">
      <b className="w-24 text-[#F7EBE1]">{label}</b>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: full ? "#ec7fa3" : "#F5A623" }} />
      </div>
      <span className="tabular-nums">
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
