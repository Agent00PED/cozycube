import { useEffect, useMemo } from "react";
import { PICKAXES } from "@shared/caverns_mining";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// Old Flint the Badger, by the old mine adit behind the Whispering Woods' Autumn Maples. The first
// time you meet him he tells you what lies below and presses his old Rusted Pickaxe into your hands:
// from then on the adit is open to you for good. After that, a word from him (a tip, a story).

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

export function FlintModal({ first, onClose }: { first: boolean; onClose: () => void }) {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  useEffect(() => {
    if (first) playSfx("chime");
  }, [first]);
  const pick = PICKAXES.rusted;
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
