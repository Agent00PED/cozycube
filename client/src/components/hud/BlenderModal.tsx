import { useEffect, useState } from "react";
import { DRINK_INGREDIENTS, DRINK_RECIPES, DRINK_REWARD } from "@shared/types";
import { Modal } from "./Modal";
import { playChime, playClick, playPop } from "../../audio/sfx";

const INGREDIENT_EMOJI: Record<(typeof DRINK_INGREDIENTS)[number], string> = { mango: "🥭", lime: "🍋", ice: "🧊", coconut: "🥥", mint: "🌿", berry: "🫐" };

interface Props {
  result: { right: boolean; coins: number } | null;
  onBlend: (recipe: string, ingredients: string[]) => void;
  onClose: () => void;
}

// The tiki blender: pick a drink off the card, throw three things in, hit blend. The right
// three earn coins and the drink's glow for a while (blend_drink -> blendResult).
export function BlenderModal({ result, onBlend, onClose }: Props) {
  const [recipe, setRecipe] = useState(DRINK_RECIPES[0].id);
  const [picked, setPicked] = useState<string[]>([]);
  const [blending, setBlending] = useState(false);
  useEffect(() => {
    if (!result) return;
    setBlending(false);
    if (result.right) playChime();
    else playPop();
  }, [result]);

  const toggle = (id: string) => {
    playClick();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));
  };
  const blend = () => {
    if (picked.length !== 3) return;
    setBlending(true);
    onBlend(recipe, picked);
  };
  const chosen = DRINK_RECIPES.find((r) => r.id === recipe)!;

  return (
    <Modal title="Tiki Blender" icon="🍹" onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="text-xs font-bold uppercase tracking-widest opacity-60">The card</div>
        <div className="flex gap-2 overflow-x-auto">
          {DRINK_RECIPES.map((r) => (
            <button key={r.id} type="button" onClick={() => (playClick(), setRecipe(r.id), setPicked([]))} className={`min-h-12 shrink-0 rounded-full px-4 text-sm font-bold transition-transform active:scale-95 ${recipe === r.id ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              {r.emoji} {r.name}
            </button>
          ))}
        </div>
        <p className="text-sm opacity-80">Three things go in a {chosen.name}. Which three? Guess from the name, or the colour on the glass.</p>
        <div className="grid grid-cols-3 gap-2">
          {DRINK_INGREDIENTS.map((id) => (
            <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={picked.includes(id)} className={`clay-btn min-h-14 flex-col gap-0 text-xs ${picked.includes(id) ? "clay-btn-mint" : "clay-btn-ghost"}`}>
              <span className="text-2xl">{INGREDIENT_EMOJI[id]}</span>
              {id}
            </button>
          ))}
        </div>
        {result && (
          <div className={`clay-pop rounded-2xl px-4 py-3 text-center text-sm font-bold ${result.right ? "bg-emerald-300/20" : "bg-rose-300/15"}`}>
            {result.right ? `${chosen.emoji} Perfect! +${result.coins} coins, and you're glowing.` : "Hmm, not quite. Try another mix (the blender needs a moment to cool)."}
          </div>
        )}
        <button type="button" className="clay-btn clay-btn-amber min-h-14 text-lg" disabled={picked.length !== 3 || blending} onClick={blend}>
          {blending ? "Whirring…" : `🌀 Blend · ${DRINK_REWARD} 🪙 if it's right`}
        </button>
      </div>
    </Modal>
  );
}
