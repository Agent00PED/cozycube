import { Modal } from "./Modal";
import { setSoundSettings, useSoundSettings } from "../../audio/soundSettings";
import { setMasterVolume, useMasterVolume } from "../../audio/master";
import { setCameraMode, useCameraMode, type CameraMode } from "../../scene/cameraFocus";
import { setNameplateSettings, useNameplateSettings } from "../../entities/nameplateSettings";
import { LATEST_PATCH } from "../../data/patchNotesData";
import { markLobby } from "../../systems/lounge";
import { reloadCleanly } from "../../systems/lifecycle";

/** Settings: the sound (the worlds' ambience and the little effects), what floats over everyone's
 *  head, the camera, the controls, and the way into the Patch Notes (which closes Settings as it
 *  opens). The lounge radio keeps its own volume in its panel. */
export function SettingsPanel({ onClose, onOpenPatchNotes }: { onClose: () => void; onOpenPatchNotes: () => void }) {
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
          {/* the ambience mixer: a fader per channel */}
          {(
            [
              ["lounge", "🎸 Lounge Folk-Jazz"],
              ["fire", "🔥 Campfire Crackle"],
              ["river", "🌊 River Stream"],
              ["forest", "🍃 Forest & Crickets"],
              ["jazz", "🎷 Casino Jazz"],
              ["crowd", "🥂 Casino Crowd"],
              ["rain", "🌧️ Window Rain"],
            ] as const
          ).map(([k, label]) => (
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
          <p className="m-0 text-[11px] opacity-55">The lounge's folk-jazz trio (it rests while the radio plays) and the rain on its windows when it rains, the campfire's soundscape, channel by channel (the crackle fades out if the bonfire goes out), the casino's jazz combo and its crowd (the murmur, glasses and chips). The lounge radio has its own volume in its panel.</p>
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
        {/* back to the lounge selector: the page reloads to it */}
        <button type="button" onClick={() => (markLobby(), void reloadCleanly())} className="clay-btn clay-btn-ghost min-h-12 w-full">
          🛋️ Switch lounge
        </button>
      </div>
    </Modal>
  );
}
