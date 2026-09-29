import { useMemo } from "react";
import { FISH, FISH_IDS, TIER_LABEL, isKingSize, type FishId, type FishingProfile } from "@shared/fishing";
import { fishGood, marketDirection, marketMultiplier, parseMarket } from "@shared/market";
import { Modal } from "./Modal";

// The Field Guide: the angler's trophy ledger for the Starlight river, one page per species. A kind
// you have never landed is a dark silhouette; one you have shows how many you have caught, your
// longest (a gold crown 👑 once it is King Size: longer than the kind's usual span), the most Barnaby
// ever paid you for one, and what he is paying this hour (the camp's market: shared/market.ts, with
// its arrow against the hour before).

const TIER_TONE: Record<string, string> = {
  common: "bg-stone-200/15 text-stone-100",
  uncommon: "bg-emerald-300/20 text-emerald-100",
  rare: "bg-sky-300/20 text-sky-100",
  epic: "bg-violet-300/20 text-violet-100",
  legendary: "bg-gradient-to-r from-amber-300/40 to-rose-300/30 text-amber-50",
};

export function FieldGuideModal({ profile, market, onClose }: { profile: FishingProfile; market: string; onClose: () => void }) {
  // (the river's and the woods', and the Glimmering Caverns' Grotto Pool)
  const species = useMemo(() => FISH_IDS.filter((id) => FISH[id].water === "freshwater" || FISH[id].water === "cavewater"), []);
  const hour = parseMarket(market);
  const found = species.filter((id) => (profile.caught[id] ?? 0) > 0 || (profile.records[id] ?? 0) > 0);
  const crowns = species.filter((id) => (profile.records[id] ?? 0) > 0 && isKingSize({ s: id, cm: profile.records[id]! }));
  const total = species.reduce((n, id) => n + (profile.caught[id] ?? 0), 0);
  return (
    <Modal title="Field Guide" icon="📖" onClose={onClose} width={560}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Species found" value={`${found.length} / ${species.length}`} />
          <Stat label="Fish landed" value={total.toLocaleString()} />
          <Stat label="King Size crowns" value={`👑 ${crowns.length}`} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {species.map((id) => (
            <Page key={id} id={id} profile={profile} mult={marketMultiplier(fishGood(id), hour)} dir={marketDirection(fishGood(id), hour)} />
          ))}
        </div>
        <p className="m-0 text-[11px] opacity-60">A King Size fish is longer than its kind's usual span and worth 2.5x (about one in fifty reeled by hand, four in ten inside a King-Size Surge's golden ripples, never on an AFK line). Barnaby's prices move every hour; each fish sold knocks 2% off the next of its kind.</p>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-2 py-2">
      <div className="text-base font-extrabold tabular-nums">{value}</div>
      <div className="opacity-60">{label}</div>
    </div>
  );
}

function Page({ id, profile, mult, dir }: { id: FishId; profile: FishingProfile; mult: number; dir: "up" | "down" | "flat" }) {
  const sp = FISH[id];
  const caught = profile.caught[id] ?? 0;
  const longest = profile.records[id] ?? 0;
  const known = caught > 0 || longest > 0;
  const king = longest > 0 && isKingSize({ s: id, cm: longest });
  const best = profile.best[id] ?? 0;
  const today = Math.max(1, Math.round(sp.value * mult));
  return (
    <div className={`flex gap-3 rounded-2xl p-3 ${known ? "bg-white/[0.07]" : "bg-black/25"} ${king ? "ring-1 ring-amber-300/60" : ""}`}>
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-950/60 text-3xl">
        <span style={known ? undefined : { filter: "brightness(0) opacity(0.55)" }}>{sp.emoji}</span>
        {king && (
          <span className="absolute -right-1.5 -top-2 text-lg drop-shadow" title="King Size">
            👑
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-center gap-1.5">
          <b className="truncate text-sm">{known ? sp.name : "???"}</b>
          <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${TIER_TONE[sp.tier]}`}>{TIER_LABEL[sp.tier].replace(" ✨", "")}</span>
        </div>
        <div className="mt-0.5 opacity-70">
          Usually {sp.cm[0]}–{sp.cm[1]} cm · base 🪙 {sp.value}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 whitespace-nowrap tabular-nums">
          <span title="How many you have landed">🎣 {caught}</span>
          <span title="Your longest">{longest ? `📏 ${longest} cm` : "📏 —"}</span>
          <span title="The most Barnaby has paid you for one">{best ? `💰 ${best}` : "💰 —"}</span>
        </div>
        <div className={`mt-1 font-semibold ${dir === "up" ? "text-emerald-200" : dir === "down" ? "text-rose-200" : "text-stone-200"}`}>
          Barnaby pays 🪙 {today} this hour {dir === "up" ? "▲" : dir === "down" ? "▼" : "▪"} ({Math.round(mult * 100)}%)
        </div>
      </div>
    </div>
  );
}
