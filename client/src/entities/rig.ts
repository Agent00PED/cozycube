// The GLB rig contract: what `client/public/models/avatar.glb` and `mochi.glb` must contain.
//
// A model file is a RIG, not one fixed pose: the runtime finds parts by NAME, moves the ones it
// animates, shows or hides the wardrobe variants, and recolours the materials it owns. Both models
// are authored in Blender by scripts/blender/build_avatar.py and build_mochi.py, which build to
// these names; any other model works as long as it follows them.
//
// The runtime (Avatar.tsx, Mochi.tsx) imports this file, so the names are written down once on
// this side; the Blender scripts spell the same names out.

import type { OutfitId } from "@shared/types";

export const AVATAR_URL = "/models/avatar.glb";
export const MOCHI_URL = "/models/mochi.glb";

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
  /** Pivots at the shoulders and the hips, hanging straight down: rotated about x to swing. */
  armL: "ArmL",
  armR: "ArmR",
  legL: "LegL",
  legR: "LegR",
  /** A mug in the right hand, shown while holding coffee. */
  mug: "Mug",
} as const;

/**
 * Wardrobe variants, chosen by the player's look; one of each kind is shown, the rest hidden.
 * Hair and hats are direct children of Head. A garment is several nodes, each a direct child of
 * the part it moves with, so it swings and folds with the limbs: a top is Top_<id> on Torso plus
 * Top_<id>_SleeveL / _SleeveR on ArmL / ArmR; a bottom is Bottom_<id> on Body plus
 * Bottom_<id>_LegL / _LegR on LegL / LegR.
 */
export const AVATAR_VARIANT_PREFIX = {
  hair: "Hair_", // Hair_short, _bob, _wavy, _messy (free); Hair_hero, _drill, _topknot, _spacebuns, _afro (bought)
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
 * Hair styles too tall for a hat, and which hats tuck them away: under one, the style is worn as
 * the short crop instead (the hats are fitted to it), so nothing pokes through. "crown": the hats
 * that sit on the crown; "any": every hat, for volume no hat or headband could sit on.
 */
export const HAIR_TUCK: Readonly<Record<string, "crown" | "any">> = { messy: "crown", topknot: "crown", spacebuns: "crown", hero: "any", afro: "any" };
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
} as const;

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
