import { Modal } from "./Modal";
import { setSoundSettings, useSoundSettings } from "../../audio/soundSettings";

/** Settings: the sound (the worlds' ambience and the little effects) and the controls. The lounge
 *  radio keeps its own volume in its panel. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const sound = useSoundSettings();
  return (
    <Modal title="Settings" icon="⚙️" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 pb-2">
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Sound</h3>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0">🌙 Ambience</span>
            <input type="range" min={0} max={1} step={0.05} value={sound.ambience} onChange={(e) => setSoundSettings({ ambience: Number(e.target.value) })} className="flex-1 accent-amber-300" aria-label="Ambience volume" />
            <span className="w-9 text-right tabular-nums opacity-70">{Math.round(sound.ambience * 100)}</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0">🔔 Effects</span>
            <input type="checkbox" checked={sound.effects} onChange={(e) => setSoundSettings({ effects: e.target.checked })} className="h-5 w-5 accent-amber-300" aria-label="Sound effects" />
            <span className="opacity-70">{sound.effects ? "On" : "Off"}</span>
          </label>
          <p className="m-0 text-[11px] opacity-55">Ambience: the campfire's crackle, the river and the crickets. The lounge radio has its own volume in its panel.</p>
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
