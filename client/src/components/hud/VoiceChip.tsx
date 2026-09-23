import type { VoiceMode } from "../../hooks/useVoiceActivity";

interface VoiceChipProps {
  mode: VoiceMode;
  active: boolean;
  onPressChange: (pressed: boolean) => void;
}

// A companion pill in the header's right cluster. In Discord the speaking rings are driven by
// real voice activity, so it is a quiet "linked" badge with a gently pulsing green ring.
// Outside Discord (local testing) it becomes a push-to-talk preview button: hold it, or hold
// V, to light up your own ring for everyone in the room.
const PILL = "clay-pill-soft shrink-0 flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-stone-800/80 px-2 py-1 text-xs font-bold text-stone-100 sm:min-h-11 sm:gap-2 sm:px-3 sm:py-1.5";

export function VoiceChip({ mode, active, onPressChange }: VoiceChipProps) {
  if (mode === "discord") {
    return (
      <div className={PILL} title="Speaking indicators follow your Discord voice activity">
        <span className="clay-ring-dot" aria-hidden />
        <span className="hidden lg:inline">Voice linked</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${PILL} cursor-pointer select-none touch-none transition-transform duration-150 active:scale-95 ${active ? "bg-emerald-400/25 text-emerald-100" : "hover:bg-stone-700/80"}`}
      title="Not running inside Discord — hold this (or V) to preview the speaking indicator"
      aria-pressed={active}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPressChange(true);
      }}
      onPointerUp={() => onPressChange(false)}
      onPointerCancel={() => onPressChange(false)}
    >
      <span className={active ? "clay-ring-dot" : "clay-ring-dot clay-ring-dot-idle"} aria-hidden />
      <span className="hidden lg:inline">{active ? "Talking…" : "Hold V to talk"}</span>
      <span className="lg:hidden">🎙️</span>
    </button>
  );
}
