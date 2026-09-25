// The GLB rig contract: what `client/public/models/avatar.glb` and `cat.glb` must contain.
//
// A model file is a RIG, not one fixed pose: the runtime finds parts by NAME, moves the ones it
// animates, shows or hides the wardrobe variants, and recolours the materials it owns. Both models
// are authored in Blender by scripts/blender/build_avatar.py and build_cat.py, which build to
// these names; any other model works as long as it follows them.
//
// The runtime (Avatar.tsx, Mochi.tsx) imports this file, so the names are written down once on
// this side; the Blender scripts spell the same names out.

import type { OutfitId } from "@shared/types";

export const AVATAR_URL = "/models/avatar.glb";
export const MOCHI_URL = "/models/cat.glb";

/** Avatar nodes the runtime animates. Every one must exist; pivots sit at the joint. */
export const AVATAR_NODES = {
  /** The model's root, an empty at the soles (y = 0). */
  root: "Root",
  /** Root of everything that bobs and rolls while walking. */
  body: "Body",
  /** The skin trunk, pivot at its base: scaled every frame for breathing (the tops are its children, so they breathe with it). */
  torso: "Torso",
  /** Pivot at the neck base: tilts, nods, bobs. Hair, hats and the face are its children. */
  head: "Head",
  /** The eyes as one group, pivot on the eye line: scaled in y to blink. */
  eyes: "Eyes",
  /** Joyful closed eyes (^ ^) on the same line, hidden: swapped in for Eyes during a happy moment (a sip). */
  eyesHappy: "EyesHappy",
  /** Pivots at the shoulders and the hips, hanging straight down: rotated about x to swing. */
  armL: "ArmL",
  armR: "ArmR",
  legL: "LegL",
  legR: "LegR",
  /** A mug in the right hand, shown while holding coffee. */
  mug: "Mug",
  /** The drink filling the mug (tinted by Mat_Drink); its toppings are its siblings, MugTop_<id>. */
  mugDrink: "MugDrink",
  /** A watering can in the right hand, pivot at the hand, hidden: shown while watering a plant (kept upright, tipped to pour). */
  wateringCan: "WateringCan",
  /** A camp hatchet in the right hand, pivot at the hand, blade on the underside: shown while chopping firewood. */
  hatchet: "Hatchet",
  /** A little firefly net in the right hand, pivot at the hand: shown for the swipe at the fireflies. */
  net: "Net",
  /** A glowing jar of fireflies in the LEFT hand, pivot at the hand: shown while holding one. */
  fireflyJar: "FireflyJar",
  /** A roasting stick in the right hand, pivot at the hand, pointing forward; its food pieces are
   *  SkewerMallow_1..2 / SkewerBBQ_1..4 (tip first), tinted by Mat_Roast / Mat_RoastVeg. */
  skewer: "Skewer",
  /** A bamboo fishing pole in the right hand, pivot at the hand, raised forward. */
  fishingRod: "FishingRod",
  /** An empty at the pole's tip: the line runs from here to the Bobber. */
  rodTip: "RodTip",
  /** An acoustic guitar across the lap, a child of Body, hidden until played on a log bench. */
  guitar: "Guitar",
  /** The red and white float, a child of Root, pivot at its centre: the runtime floats it on the water. */
  bobber: "Bobber",
  /** The ears, children of Head: hidden under a hair style that covers them (HAIR_STYLE_META). */
  earL: "EarL",
  earR: "EarR",
} as const;

/**
 * Wardrobe variants, chosen by the player's look; one of each kind is shown, the rest hidden.
 * Hair and hats are direct children of Head. A garment is several nodes, each a direct child of
 * the part it moves with, so it swings and folds with the limbs: a top is Top_<id> on Torso plus
 * Top_<id>_SleeveL / _SleeveR on ArmL / ArmR; a bottom is Bottom_<id> on Body plus
 * Bottom_<id>_LegL / _LegR on LegL / LegR.
 */
export const AVATAR_VARIANT_PREFIX = {
  hair: "Hair_", // Hair_short, _bob, _curtain, _ponytail, _wavylong (free); Hair_hero, _drill, _topknot, _spacebuns, _afro (bought)
  hat: "Hat_", // Hat_beret, Hat_beanie, Hat_flower, Hat_headphones, Hat_straw, Hat_bunny, Hat_tophat, Hat_crown, Hat_mochiears
  top: "Top_", // Top_hoodie, Top_tee, Top_flannel, Top_hawaiian, Top_tuxedo, Top_robe, Top_yukata, Top_jumpsuit
  bottom: "Bottom_", // Bottom_sweats, Bottom_overalls, Bottom_trousers, Bottom_shorts, Bottom_wide
} as const;

/** Each wardrobe outfit as the top and the bottom it is made of (their ids after the prefix). */
export const OUTFIT_PARTS: Record<OutfitId, { top: string; bottom: string }> = {
  outfit_starter_hoodie: { top: "hoodie", bottom: "sweats" },
  outfit_starter_overalls: { top: "tee", bottom: "overalls" },
  outfit_flannel_vest: { top: "flannel", bottom: "trousers" },
  outfit_hawaiian: { top: "hawaiian", bottom: "shorts" },
  outfit_tuxedo: { top: "tuxedo", bottom: "trousers" },
  outfit_boxing: { top: "robe", bottom: "shorts" },
  outfit_yukata: { top: "yukata", bottom: "wide" },
  outfit_cyber: { top: "jumpsuit", bottom: "trousers" },
};

/** Hats that sit on the crown of the head. */
export const CROWN_HATS: ReadonlySet<string> = new Set(["beret", "beanie", "straw", "tophat", "crown"]);
/**
 * A style's raised part (the ponytail's tail and scrunchie, the space buns, the topknot) is its own
 * child node, Hair_<style>_Prop. Under a hat that covers the crown it is hidden and the rest of the
 * style stays, its shell fitted to sit under the hat like the crop's.
 */
export const HAIR_PROP_SUFFIX = "_Prop";
/**
 * Hair styles whose whole volume is too big for a hat, and which hats tuck them away: under one,
 * the style is worn as the short crop instead (the hats are fitted to it), so nothing pokes
 * through. "crown": the hats that sit on the crown; "any": every hat, for volume no hat or
 * headband could sit on.
 */
export const HAIR_TUCK: Readonly<Record<string, "crown" | "any">> = { hero: "any", afro: "any" };
/**
 * What the runtime needs to know about a hair style beyond its mesh. coversEars: the style falls
 * over the ears (a bob, long layers), so EarL / EarR are hidden while it is worn, instead of
 * poking through it. build_avatar.py reads this table too: it only checks the ears are clear of
 * the styles that leave them showing.
 */
export const HAIR_STYLE_META: Readonly<Record<string, { coversEars?: boolean }>> = {
  bob: { coversEars: true },
  wavylong: { coversEars: true },
};
export function coversEars(style: string): boolean {
  return HAIR_STYLE_META[style]?.coversEars === true;
}
/** The style everyone falls back to, and the one tall styles tuck into under a hat. */
export const DEFAULT_HAIR = "short";

/** The hair style actually shown for `style` under `hat` (see HAIR_TUCK). */
export function hairUnderHat(style: string, hat: string): string {
  const tuck = HAIR_TUCK[style];
  const hatted = hat !== "none" && hat !== "";
  return tuck && hatted && (tuck === "any" || CROWN_HATS.has(hat)) ? DEFAULT_HAIR : style;
}

/** Materials the runtime recolours per player (matched by material name). Everything else keeps its own colour. */
export const AVATAR_MATERIALS = {
  skin: "Mat_Skin",
  hair: "Mat_Hair",
  /** The top's fabric (the look's shirt colour). */
  clothes: "Mat_Shirt",
  /** The bottom's fabric (the look's trousers colour). */
  trousers: "Mat_Pants",
  /** The outfit's accent colour: a vest, lapels and a bow tie, an obi, piping, a waistband. */
  accent: "Mat_Accent",
  /** The drink in the mug: coffee, matcha or milk tea (shared/types DRINK_BASE_INFO). */
  drink: "Mat_Drink",
  /** On the skewer: the marshmallows or the meat, tinted raw, golden or charred. */
  roast: "Mat_Roast",
  /** The skewer's peppers, tinted too. */
  roastVeg: "Mat_RoastVeg",
} as const;

/** The skewer's food, children of Skewer, one node a piece (tip first): bites hide them in turn. */
export const SKEWER_PIECE_PREFIX = { mallow: "SkewerMallow_", bbq: "SkewerBBQ_" } as const;

/** The mug's toppings, children of Mug named MugTop_<DrinkTopping>: the one in the drink is shown. */
export const MUG_TOPPING_PREFIX = "MugTop_";

/** Materials whose name starts with this are flat facial decals: the runtime gives them a polygon offset so they never z-fight the skin. */
export const DECAL_PREFIX = "Decal";

/** Mochi nodes the runtime animates. */
export const MOCHI_NODES = {
  /** Root pivot: bobs, rocks and springs. */
  body: "Body",
  /** The dumpling: squashed and stretched about its base (its scale and position are read as the rest pose). */
  loaf: "Loaf",
  head: "Head",
  earL: "EarL",
  earR: "EarR",
  pawL: "PawL",
  pawR: "PawR",
  /** Pivot at the tail's root. */
  tail: "Tail",
  /** Hidden until a yawn or a chew / a lick. */
  yawn: "Yawn",
  tongue: "Tongue",
} as const;
