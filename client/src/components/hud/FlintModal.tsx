import { useEffect, useMemo } from "react";
import { CAVERNS_CHANNELS, PICKAXES } from "@shared/caverns_mining";
import { WOOD } from "@shared/chop";
import type { FishingProfile } from "@shared/fishing";
import { LICENCE, licenceProgress } from "@shared/keepers";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Old Flint the Badger, by the old mine adit behind the Whispering Woods' Autumn Maples. Until you
// hold the Expedition Licence he makes his offer (`offer`): coins and a supply list from the other
// two crafts (shared/keepers.ts LICENCE). When it is paid he tells you what lies below and presses
// his old Rusted Pickaxe into your hands (`first`): from then on the adit is open to you for good.
// After that, a word from him (a tip, a story).

const OFFER = [
  "\"Easy there, young'un. Not many find this old adit behind the maples.\"",
  "\"There's a whole country under these roots: copper, iron, silver, a lake that glows. Gus the Mole keeps an expedition camp down there, and an expedition wants supplying.\"",
  "\"Bring me its fee and its stores, cedar for the pit props and a few good fish for the pot, and the way down is yours for good. My old pickaxe too.\"",
];

const LORE = [
  "\"Easy there, young'un. Not many find this old adit behind the maples.\"",
  "\"Below these roots the cave opens out like nothing you've seen: Gus the Mole's basecamp on the high shelf, the bellows forge in its basalt cleft, a jungle growing where the roof fell in, and step after step down to a great lake glowing with things that never saw the sun.\"",
  "\"Copper in the jungle under the fallen roof, coal in the breakdown's blocks. Iron down in the mudflats, silver on the pearl terraces, glimmerstone in the rift. And now and then the Titan Monolith wakes on the lake's islet, under the skylight. Takes a whole crew to crack that one.\"",
  "\"Don't go swinging blind: every rock has a weak spot. Watch for the glow in its cracks, the glint, the dust sifting down. Strike there.\"",
];
const TIPS = [
  "\"A rock one tier above your pick bites back at sixty percent. Two above, and you'll skid right off.\"",
  "\"Soak a minute in the warm pools on the pearl terraces: the Deep Warmth stays with you wherever you walk.\"",
  "\"Turn a geode till its seam faces you, then one good blow. Not too soft, not too hard: the finer gems don't like a clumsy mallet.\"",
  "\"When the drip falls over the lake, cast right into its ripple. Nothing common bites there, and old Finnegan will tell you the same.\"",
  "\"Many hands on one rock and everyone takes home more. That's how it's always been down there.\"",
  "\"Smelt your silver before you sell it. The forge pays you back for the coal twice over.\"",
];

export function FlintModal({ first, offer, profile, coins, send, onClose }: { first: boolean; offer: boolean; profile: FishingProfile; coins: number; send: (channel: string, packet?: unknown) => void; onClose: () => void }) {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  useEffect(() => {
    if (first) playSfx("chime");
  }, [first]);
  const pick = PICKAXES.rusted;
  if (offer) {
    const at = licenceProgress(profile, coins);
    const lines: [string, number, number][] = [
      ["🪙 Coins", at.coins, LICENCE.coins],
      [`${WOOD[LICENCE.wood].emoji} ${WOOD[LICENCE.wood].name}s`, at.logs, LICENCE.logs],
      [`🐟 ${LICENCE.fishTier[0].toUpperCase()}${LICENCE.fishTier.slice(1)} fish (unlocked)`, at.fish, LICENCE.fish],
    ];
    return (
      <Modal title="Old Flint the Badger" icon="🦡" onClose={onClose} width={460}>
        <div className="flex flex-col gap-2 pb-1 text-[13px] leading-relaxed">
          {OFFER.map((l) => (
            <p key={l} className="m-0">
              {l}
            </p>
          ))}
          <div className="flex flex-col gap-1 rounded-2xl border border-amber-300/50 bg-amber-300/10 px-3 py-2">
            <b className="text-[#F7EBE1]">🧭 The Expedition Licence</b>
            {lines.map(([label, have, need]) => (
              <span key={label} className={`flex items-center justify-between rounded-full px-2 text-[12px] ${have >= need ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10"}`}>
                <span>
                  {have >= need ? "✓" : "✗"} {label}
                </span>
                <span className="tabular-nums">
                  {Math.min(have, need).toLocaleString("en-US")} / {need.toLocaleString("en-US")}
                </span>
              </span>
            ))}
            <span className="text-[11px] opacity-75">Once, for good. It comes with his {pick.name}. He takes your smallest fish that count, never a locked one.</span>
          </div>
          <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full text-sm font-extrabold" disabled={!at.ready} onClick={() => send(CAVERNS_CHANNELS.flint)}>
            {at.ready ? "🧭 Hand over the supplies" : "Not everything yet"}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Old Flint the Badger" icon="🦡" onClose={onClose} width={460}>
      <div className="flex flex-col gap-2 pb-1 text-[13px] leading-relaxed">
        {first ? (
          <>
            {LORE.map((l) => (
              <p key={l} className="m-0">
                {l}
              </p>
            ))}
            <div className="flex items-center gap-3 rounded-2xl border border-amber-300/50 bg-amber-300/10 px-3 py-2">
              <span className="text-3xl">{pick.emoji}</span>
              <div className="flex flex-col leading-tight">
                <b className="text-[#F7EBE1]">He presses his old {pick.name} into your hands</b>
                <span className="text-[12px] opacity-80">{pick.blurb} The adit is open to you for good.</span>
              </div>
            </div>
            <p className="m-0 opacity-80">"Down you go, then. Mind your head, and say hello to Gus for me."</p>
          </>
        ) : (
          <p className="m-0">{tip}</p>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-11 w-full text-sm font-extrabold" onClick={onClose}>
          {first ? "⛏️ Thanks, Flint!" : "👋 See you, Flint"}
        </button>
      </div>
    </Modal>
  );
}
