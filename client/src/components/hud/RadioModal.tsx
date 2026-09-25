import { RADIO_STATIONS, type RadioPacket } from "@shared/types";
import type { RadioState } from "../../hooks/useRadio";
import { Modal } from "./Modal";

interface Props {
  radio: RadioState;
  send: (packet: RadioPacket) => void;
  onClose: () => void;
}

// The retro radio on the green rug. The station and play / pause are the room's: whatever you pick
// plays for everyone in the lounge (RADIO_UPDATE). The volume and mute are only yours.
export function RadioModal({ radio, send, onClose }: Props) {
  const current = RADIO_STATIONS[radio.station] ?? RADIO_STATIONS[0];
  const tune = (station: number, playing: boolean) => send({ type: "RADIO_UPDATE", station: RADIO_STATIONS[station].id, playing });

  return (
    <Modal title="Radio" icon="📻" onClose={onClose} width={420}>
      <div className="flex flex-col gap-3 pb-2">
        {/* now playing, and the room's play / pause */}
        <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-b from-[#d98e6e]/35 to-[#8a5a3b]/35 p-3 outline outline-1 -outline-offset-1 outline-white/10">
          <span className="text-3xl leading-none">{current.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-widest opacity-60">{radio.playing ? "On air for the room" : "Off"}</span>
            <span className="block truncate font-semibold">{current.name}</span>
          </span>
          {radio.playing && <Equalizer />}
          <button type="button" className={`clay-btn min-h-12 min-w-12 rounded-full px-4 ${radio.playing ? "clay-btn-ghost" : "clay-btn-amber"}`} onClick={() => tune(radio.station, !radio.playing)} aria-label={radio.playing ? "Pause the radio" : "Play the radio"}>
            {radio.playing ? "⏸" : "▶"}
          </button>
        </div>
        {radio.playing && radio.waiting && <p className="rounded-2xl bg-amber-300/15 px-3 py-2 text-center text-xs font-semibold text-amber-100">Tap anywhere to let the music in 🎶</p>}

        {/* the stations */}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Stations">
          {RADIO_STATIONS.map((s, i) => {
            const on = radio.playing && radio.station === i;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => tune(i, true)} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left transition-transform duration-150 active:scale-[0.98] ${on ? "bg-amber-300/20 ring-2 ring-amber-300/60" : "bg-white/5 hover:bg-white/10"}`}>
                <span className="text-2xl leading-none">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <b className="block font-semibold">{s.name}</b>
                  <span className="text-xs opacity-70">{s.mood}</span>
                </span>
                {on && <span className="text-xs font-bold text-amber-200">Playing</span>}
              </button>
            );
          })}
        </div>

        {/* your own volume */}
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20" onClick={() => radio.setMuted(!radio.muted)} aria-label={radio.muted ? "Unmute" : "Mute"} aria-pressed={radio.muted}>
            {radio.muted ? "🔇" : radio.volume > 0.5 ? "🔊" : "🔉"}
          </button>
          <input type="range" min={0} max={1} step={0.01} value={radio.volume} onChange={(e) => radio.setVolume(Number(e.target.value))} className="h-2 flex-1 cursor-pointer accent-amber-300" aria-label="Volume (just for you)" />
          <span className="w-10 text-right text-xs tabular-nums opacity-70">{Math.round(radio.volume * 100)}%</span>
        </div>
        <p className="text-center text-[11px] opacity-50">The station plays for everyone in the lounge; the volume is just yours.</p>
      </div>
    </Modal>
  );
}

/** Three little bars bouncing while it plays. */
function Equalizer() {
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 rounded-full bg-amber-200" style={{ height: "100%", animation: `cozy-eq 0.9s ease-in-out ${i * 0.18}s infinite alternate` }} />
      ))}
    </span>
  );
}
