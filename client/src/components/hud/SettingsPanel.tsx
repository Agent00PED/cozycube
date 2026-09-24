import { Modal } from "./Modal";

/** Clean-slate settings: the audio system was removed, so only the controls help remains. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Settings" icon="⚙️" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 pb-2">
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
