import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getAudioSettings, setAudioSettings, subscribeAudioSettings, type AudioSettings } from "../../audio/SoundManager";
import { playClick } from "../../audio/sfx";
import { requestRecenter } from "../../scene/cameraFocus";

/** Master / SFX / BGM sliders, the ambience switch, and the joystick preference. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AudioSettings>(getAudioSettings());
  useEffect(() => subscribeAudioSettings(setS), []);
  const slider = (key: "master" | "sfx" | "bgm", label: string, emoji: string) => (
    <label className="flex items-center gap-3">
      <span className="w-28 text-sm font-bold">
        {emoji} {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s[key]}
        onChange={(e) => setAudioSettings({ [key]: Number(e.target.value) })}
        onPointerUp={() => playClick()}
        className="h-2 flex-1 accent-amber-300"
        aria-label={label}
      />
      <span className="w-10 text-right text-xs tabular-nums opacity-70">{Math.round(s[key] * 100)}</span>
    </label>
  );
  return (
    <Modal title="Settings" icon="⚙️" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 pb-2">
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Sound</h3>
          {slider("master", "Master", "🔊")}
          {slider("sfx", "Effects", "✨")}
          {slider("bgm", "Ambience", "🎶")}
          <label className="flex min-h-11 items-center justify-between text-sm font-bold">
            <span>🌙 Room soundscape</span>
            <Switch on={s.ambience} onChange={(v) => setAudioSettings({ ambience: v })} />
          </label>
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">Controls</h3>
          <div className="text-sm">
            <b>Move:</b> tap or click the floor, or hold <kbd className="rounded bg-white/10 px-1">W A S D</kbd> / arrows. Phones get a joystick.
          </div>
          <label className="flex min-h-11 items-center justify-between text-sm font-bold">
            <span>🕹️ On-screen joystick</span>
            <select value={s.joystick} onChange={(e) => (playClick(), setAudioSettings({ joystick: e.target.value as AudioSettings["joystick"] }))} className="min-h-10 rounded-xl border border-white/10 bg-stone-800 px-3 text-sm">
              <option value="auto">Auto (touch only)</option>
              <option value="on">Always</option>
              <option value="off">Never</option>
            </select>
          </label>
          <button type="button" onClick={() => (playClick(), requestRecenter(), onClose())} className="clay-btn clay-btn-ghost">
            🎯 Recenter the camera on me
          </button>
        </section>
      </div>
    </Modal>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    // The thumb is an inline-block INSIDE an inline-flex track with 2px padding, so it starts on
    // the track's left edge (the old absolute thumb had no `left`, so its static position was the
    // button's centred text cursor, and translate-x pushed it clean out of the track).
    <button type="button" role="switch" aria-checked={on} onClick={() => (playClick(), onChange(!on))} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${on ? "bg-amber-300" : "bg-white/15"}`}>
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}
