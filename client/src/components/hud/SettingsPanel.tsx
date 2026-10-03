import { Modal } from "./Modal";
import type { MapId } from "@shared/types";
import { setSoundSettings, useSoundSettings, type SoundSettings } from "../../audio/soundSettings";
import { setMasterVolume, useMasterVolume } from "../../audio/master";
import { setCameraMode, useCameraMode, type CameraMode } from "../../scene/cameraFocus";
import { setNameplateSettings, useNameplateSettings } from "../../entities/nameplateSettings";
import { LATEST_PATCH } from "../../data/patchNotesData";

type Fader = Exclude<keyof SoundSettings, "effects">;
/** The faders each world plays (what you hear there, and nothing else): Master Volume and Effects are
 *  always there; the lounge's Window Rain only while it rains. */
function fadersFor(map: MapId, raining: boolean): [Fader, string][] {
  switch (map) {
    case "cozy_lounge":
      return [["lounge", "🎸 Lounge Folk-Jazz"], ...(raining ? ([["rain", "🌧️ Window Rain"]] as [Fader, string][]) : [])];
    case "campfire_night":
      return [["fire", "🔥 Campfire Crackle"], ["river", "🌊 River Stream"], ["forest", "🍃 Forest & Crickets"], ["guitar", "🎸 Night Guitar"]];
    case "whispering_woods":
      return [["forest", "🍃 Forest & Crickets"], ["river", "🌊 River Stream"], ["wind", "🌬️ Wind in Trees"]];
    case "velvet_casino":
    case "casino_vip":
      return [["jazz", "🎷 Casino Jazz"], ["crowd", "🥂 Casino Crowd"]];
    case "boxing_ring":
      return [["crowd", "📣 Ringside Crowd"]];
    case "sunset_beach":
      return [["river", "🌊 Sea & Waves"], ["forest", "🕊️ Gulls"], ["guitar", "🎶 Bar Ukulele"]];
    case "open_sea":
      return [["river", "🌊 Sea & Waves"], ["forest", "🕊️ Gulls"]];
    case "hidden_cove":
      return [["river", "🌊 Sea & Lagoon"], ["forest", "💧 Drips"]];
    case "glimmering_caverns":
      return [["cavern", "🪨 Cavern Air & Footsteps"], ["water", "🌊 Water"], ["crystal", "💎 Crystal Resonance"], ["steam", "♨️ Thermal Steam"], ["music", "🎵 Cave Music"]];
    default:
      return [];
  }
}
/** What each world's faders are, in a line under them. */
const FADER_NOTE: Partial<Record<MapId, string>> = {
  sunset_beach: "The surf running up the sand and drawing back, gulls by day, and from dusk a ukulele at the bar. These faders are the campfire's River, Forest and Night Guitar.",
  open_sea: "The swell against the hull, the boat's timbers, a gull now and then by day.",
  hidden_cove: "The sea heard through the rock, the lagoon lapping, drips off the roof.",
  cozy_lounge: "The lounge's folk-jazz trio (it rests while the radio plays), and the rain on its windows when it rains. The radio has its own volume in its panel.",
  campfire_night: "The campfire's soundscape, channel by channel (the crackle fades out if the bonfire goes out). After dusk a guitar picks out a quiet phrase now and then.",
  whispering_woods: "The woods: birdsong by day and crickets by night, the meandering river, the wind in the canopy.",
  velvet_casino: "The casino's jazz combo, and its crowd: the murmur, glasses and chips.",
  casino_vip: "The casino's jazz combo, and its crowd: the murmur, glasses and chips.",
  boxing_ring: "The crowd at ringside, roaring at every big punch.",
  glimmering_caverns: "Every zone answers in its own voice (the rift deepest); your steps change with the ground; the water falls, runs and laps; the crystals ring; the terraces steam; now and then a little music.",
};

/** Settings: the sound (Master Volume and the Effects everywhere, and only the faders the world you
 *  are in plays), what floats over everyone's head, the camera, the controls, and the way into the
 *  Patch Notes (which closes Settings as it opens). The lounge radio keeps its own volume in its panel. */
export function SettingsPanel({ mapId, raining, onClose, onOpenPatchNotes, onSwitchLounge }: { mapId: MapId; raining: boolean; onClose: () => void; onOpenPatchNotes: () => void; onSwitchLounge: () => void }) {
  const sound = useSoundSettings();
  const master = useMasterVolume();
  const camera = useCameraMode();
  const plates = useNameplateSettings();
  return (
    <Modal title="Settings" icon="⚙️" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 pb-2">
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Sound</h3>
          {/* everything at once: the music, the worlds' ambience and the effects */}
          <label className="flex items-center gap-3 rounded-2xl bg-amber-300/10 px-2 py-1.5 text-sm font-bold">
            <span className="w-36 shrink-0">🔊 Master Volume</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(master * 100)} onChange={(e) => setMasterVolume(Number(e.target.value) / 100)} className="flex-1 accent-amber-400" aria-label="Master Volume" />
            <span className="w-9 text-right tabular-nums opacity-80">{Math.round(master * 100)}%</span>
          </label>
          {/* the ambience mixer: a fader per channel this world plays (the rest hidden) */}
          {fadersFor(mapId, raining).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0">{label}</span>
              <input type="range" min={0} max={100} step={1} value={Math.round(sound[k] * 100)} onChange={(e) => setSoundSettings({ [k]: Number(e.target.value) / 100 })} className="flex-1 accent-amber-400" aria-label={`${label} volume`} />
              <span className="w-9 text-right tabular-nums opacity-70">{Math.round(sound[k] * 100)}</span>
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm">
            <span className="w-36 shrink-0">🔔 Effects</span>
            <input type="checkbox" checked={sound.effects} onChange={(e) => setSoundSettings({ effects: e.target.checked })} className="h-5 w-5 accent-amber-300" aria-label="Sound effects" />
            <span className="opacity-70">{sound.effects ? "On" : "Off"}</span>
          </label>
          <p className="m-0 text-[11px] opacity-55">{FADER_NOTE[mapId] ?? "Nothing plays here yet: this world is still being built."}</p>
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Display</h3>
          {(
            [
              ["showTitles", "🏷️", "Show Player Titles"],
              ["showNames", "🪪", "Show Player Names"],
            ] as const
          ).map(([k, icon, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0">
                {icon} {label}
              </span>
              <input type="checkbox" checked={plates[k]} onChange={(e) => setNameplateSettings({ [k]: e.target.checked })} className="h-5 w-5 accent-amber-300" aria-label={label} />
              <span className="opacity-70">{plates[k] ? "On" : "Off"}</span>
            </label>
          ))}
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Camera</h3>
          <div className="grid grid-cols-2 gap-1.5 rounded-full bg-black/25 p-1" role="radiogroup" aria-label="Camera mode">
            {(
              [
                ["follow", "🎯 Follow me"],
                ["free_pan", "🖐️ Free pan"],
              ] as [CameraMode, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={camera === id} onClick={() => setCameraMode(id)} className={`min-h-10 rounded-full text-sm font-extrabold transition-transform active:scale-95 ${camera === id ? "bg-amber-300 text-amber-950" : "hover:bg-white/10"}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="m-0 text-[11px] opacity-55">{camera === "follow" ? "The camera stays on you wherever you go, to every edge of the room; the wheel or a pinch zooms round you." : "The camera leans toward you; right- or middle-drag (or two fingers) to look round the room. It comes back to you when you move."}</p>
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Controls</h3>
          <div className="text-sm">
            <span className="touch-hint">Tap the floor to move.</span>
            <span className="kbd-hint">
              <kbd className="rounded bg-white/10 px-1">W A S D</kbd> or click the floor to move.
            </span>
          </div>
          <p className="m-0 text-[11px] opacity-55">Tap or click a seat, a prop or a person to walk up to it and use it.</p>
        </section>
        {/* the history: closes Settings as the Patch Notes open */}
        <button type="button" onClick={onOpenPatchNotes} className="clay-btn clay-btn-amber flex min-h-12 w-full items-center justify-center gap-2 text-sm font-extrabold">
          📜 Patch Notes
          <span className="rounded-full bg-amber-950/80 px-2 py-0.5 text-[11px] font-black tracking-wide text-amber-200">v{LATEST_PATCH.version}</span>
        </button>
        {/* back to the lounge selector, in memory: this lounge's room is left, the selector shows */}
        <button type="button" onClick={onSwitchLounge} className="clay-btn clay-btn-ghost min-h-12 w-full">
          🛋️ Switch lounge
        </button>
      </div>
    </Modal>
  );
}
