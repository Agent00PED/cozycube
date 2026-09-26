import { Modal } from "./Modal";
import { setSoundSettings, useSoundSettings } from "../../audio/soundSettings";
import { setCameraMode, useCameraMode, type CameraMode } from "../../scene/cameraFocus";

/** Settings: the sound (the worlds' ambience and the little effects), the camera and the controls.
 *  The lounge radio keeps its own volume in its panel. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const sound = useSoundSettings();
  const camera = useCameraMode();
  return (
    <Modal title="Settings" icon="⚙️" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 pb-2">
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Sound</h3>
          {/* the ambience mixer: a fader per channel */}
          {(
            [
              ["fire", "🔥 Campfire Crackle"],
              ["river", "🌊 River Stream"],
              ["forest", "🍃 Forest & Crickets"],
              ["jazz", "🎷 Casino Jazz"],
              ["crowd", "🥂 Casino Crowd"],
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
          <p className="m-0 text-[11px] opacity-55">The campfire's soundscape, channel by channel (the crackle fades out if the bonfire goes out), the casino's jazz combo and its crowd (the murmur, glasses and chips). The lounge radio has its own volume in its panel.</p>
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
            <b>Move:</b> tap or click the floor, or hold <kbd className="rounded bg-white/10 px-1">W A S D</kbd> / arrows. Phones get a joystick.
          </div>
        </section>
      </div>
    </Modal>
  );
}
