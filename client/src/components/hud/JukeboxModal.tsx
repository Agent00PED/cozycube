import { Modal } from "./Modal";
import { playClick } from "../../audio/sfx";

/** The lounge's records, in the order the ambience engine plays them (useAmbience RECORDS). */
export const RECORD_NAMES = [
  { name: "Rainy Window", mood: "slow, Fmaj7 and a soft brush", emoji: "🌧️" },
  { name: "Late Night Study", mood: "steady, warm keys", emoji: "📚" },
  { name: "Sunday Coffee", mood: "bright, a little swing", emoji: "☕" },
];

interface Props {
  playing: number | null;
  onPick: (track: number) => void;
  onClose: () => void;
}

/** The jukebox: pick a record for the whole room, or lift the needle. */
export function JukeboxModal({ playing, onPick, onClose }: Props) {
  return (
    <Modal title="Jukebox" icon="🎵" onClose={onClose} width={400}>
      <div className="flex flex-col gap-2 pb-2">
        <p className="text-sm opacity-80">Whatever you put on plays for everyone in the lounge.</p>
        {RECORD_NAMES.map((r, i) => (
          <button key={r.name} type="button" onClick={() => (playClick(), onPick(i))} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left transition-transform active:scale-[0.98] ${playing === i ? "bg-amber-300/25 ring-2 ring-amber-300/60" : "bg-white/5 hover:bg-white/10"}`}>
            <span className={`text-2xl ${playing === i ? "cozy-bob" : ""}`}>{r.emoji}</span>
            <span className="flex-1">
              <b>{r.name}</b>
              <br />
              <span className="text-xs opacity-70">{r.mood}</span>
            </span>
            {playing === i && <span className="text-xs font-extrabold text-amber-200">Playing</span>}
          </button>
        ))}
        <button type="button" className="clay-btn clay-btn-ghost" onClick={() => (playClick(), onPick(-1))}>
          ⏏ Lift the needle
        </button>
      </div>
    </Modal>
  );
}
