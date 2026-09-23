import type { MapId, TimeOfDay } from "@shared/types";

// Visual-only palette per theme — purely client-side, unrelated to shared/ game data.
export interface RoomTheme {
  floor: string;
  wall: string;
  /** Side wall of the floating diorama slab (the "cut" you see under the floor). */
  edge: string;
  /** Thin band along the very top of the slab edge — soil line / wood grain highlight. */
  edgeTop: string;
  ambient: string;
  directional: string;
  ambientIntensity: number;
  directionalIntensity: number;
  /** Lit by warm ambient and local point lights only: the sun casts no shadow map here. */
  shadowless?: boolean;
}

export const ROOM_THEMES: Record<MapId, RoomTheme> = {
  cozy_lounge: {
    floor: "#d9a86c", // honey oak
    wall: "#f2e8d8", // warm off-white
    edge: "#4a2f1d", // rich dark walnut
    edgeTop: "#6b452b",
    ambient: "#fff5e6",
    directional: "#fff8ec", // gentle daylight through the windows
    ambientIntensity: 0.5, // x1.6 x the hour's preset: ~0.8 at midday
    directionalIntensity: 0.55,
    shadowless: true,
  },
  campfire_night: {
    floor: "#41684f", // grass — light enough to still read as ground under a night grade
    wall: "#0c1420", // unused outdoors (the clearing has a tree/rock ring instead of walls)
    edge: "#3b2a1c", // cross-section of dark earth
    edgeTop: "#2f4a38", // topsoil line, tinted by the grass above it
    // Light COLOR multiplies light INTENSITY, so a dark navy hex here cannot be rescued by
    // turning intensity up; the hue has to stay midnight-navy while the value stays high.
    ambient: "#9db4e8",
    directional: "#b9cbf0", // moonlight; the warm key light still comes from the campfire itself
    ambientIntensity: 1.25,
    directionalIntensity: 1,
  },
  velvet_casino: {
    floor: "#7a4a2c", // polished dark oak between the carpets
    wall: "#5a3324", // mahogany panelling
    edge: "#3a2016",
    edgeTop: "#c9a24a", // a gilded lip round the slab
    ambient: "#ffd9a8", // warm gold; indoors this replaces the hour's sky-tinted ambient
    directional: "#ffe6c4",
    ambientIntensity: 1.9,
    directionalIntensity: 1.1,
  },
  sunset_beach: {
    floor: "#f2ddb6", // warm white sand
    wall: "#f6e2c4", // unused outdoors
    edge: "#c2a173", // packed sand cross-section
    edgeTop: "#d8bd8e",
    ambient: "#ffe0c8",
    directional: "#fff0d8",
    ambientIntensity: 0.85,
    directionalIntensity: 1.15,
  },
  boxing_ring: {
    floor: "#6b625a", // worn concrete gym floor
    wall: "#2f3542", // slate blue-grey panelling
    edge: "#2a2622",
    edgeTop: "#8b1e2a", // the club's red stripe round the slab
    ambient: "#ffe6c8", // warm halide spotlights
    directional: "#fff1d8",
    ambientIntensity: 1.5,
    directionalIntensity: 1.2,
  },
  japanese_onsen: {
    floor: "#7c8a5e", // mossy ground
    wall: "#f6f0e2", // unused outdoors
    edge: "#5a4a3a", // dark mountain soil
    edgeTop: "#8a9a6a",
    ambient: "#e6f0e8",
    directional: "#fff4e0",
    ambientIntensity: 0.9,
    directionalIntensity: 1.1,
  },
  retro_arcade: {
    floor: "#26244a", // checkered carpet base
    wall: "#1b1a33", // near-black violet
    edge: "#14132a",
    edgeTop: "#ff5fc8", // a neon lip round the slab
    ambient: "#8c7cff", // violet neon wash
    directional: "#cfd8ff",
    ambientIntensity: 1.7,
    directionalIntensity: 0.55,
  },
};

// --- time of day -------------------------------------------------------------------------
//
// One shared preset drives the sun's colour, angle and strength, the sky behind the diorama,
// and the haze. The sun must stay OFF the camera's azimuth (the iso camera looks along 1,1,1):
// a light on the same bearing throws every shadow directly behind its own caster, which looks
// exactly like having no shadows at all. Every preset below keeps that separation.
export interface TimePreset {
  label: string;
  /** Sun/moon position. Low and slanted at the edges of the day, high and short at noon. */
  sun: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  /** Background behind the floating diorama. */
  sky: string;
  /** Linear haze as [near, far] in view distance, or null for none. The camera sits ~60 units
   *  back (orthographic), so these are distances FROM THE CAMERA, not from the room. */
  fog: [number, number] | null;
  /** Multiplies every lamp, bulb and fire — lights read as decorative by day, as the only
   *  source of light after dark. */
  lampBoost: number;
  /** Shadow-free fill from the camera side, which keeps material colours honest. */
  fillColor: string;
  /** Cold edge light from behind, so silhouettes stay readable after dark. */
  rimColor: string;
  rimIntensity: number;
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  sunrise: {
    label: "🌅 Sunrise",
    sun: [34, 14, 16], // low and raking, so everything throws a long shadow
    sunColor: "#ffc9a3",
    sunIntensity: 1.35,
    ambientColor: "#ffd9d2", // soft rose fill in the shadows
    ambientIntensity: 0.72,
    sky: "#f3c3ab",
    fog: [52, 118], // thin morning haze on the far side of the room
    lampBoost: 0.8,
    fillColor: "#ffe9dd",
    rimColor: "#8fa6e8",
    rimIntensity: 0.18,
  },
  day: {
    label: "☀️ Day",
    sun: [30, 36, 8],
    sunColor: "#fff6e2",
    sunIntensity: 1.5,
    ambientColor: "#eef2ff",
    ambientIntensity: 0.62,
    sky: "#bfe0f2",
    fog: null,
    lampBoost: 0.55,
    fillColor: "#ffffff",
    rimColor: "#cfe3ff",
    rimIntensity: 0.12,
  },
  sunset: {
    label: "🌇 Sunset",
    sun: [30, 12, 20],
    sunColor: "#ffab73", // golden hour, amber but no longer neon
    sunIntensity: 1.2,
    // A cool violet fill rather than more orange: the old warm-on-warm grade turned sand,
    // wood and skin into one flat peach, and the island vanished into its own backdrop.
    ambientColor: "#b9b2e8",
    ambientIntensity: 0.62,
    // Twilight sky BEHIND the island, deliberately far from the sand's hue so the diorama
    // reads as a solid object floating in front of it.
    sky: "#4a3d78",
    fog: [58, 130],
    lampBoost: 1.1,
    fillColor: "#ffe4cf",
    rimColor: "#7f7de0",
    rimIntensity: 0.3,
  },
  night: {
    label: "🌙 Night",
    sun: [26, 30, 14],
    sunColor: "#8fa8d8", // moonlight
    sunIntensity: 0.42,
    ambientColor: "#6d81b8",
    ambientIntensity: 0.42,
    sky: "#141d33",
    fog: [50, 120],
    lampBoost: 1.6, // lamps, festoon bulbs and the campfire carry the scene
    fillColor: "#b9c8ee",
    rimColor: "#7fa6ff",
    rimIntensity: 0.55,
  },
};
