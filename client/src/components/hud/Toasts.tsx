import { useToasts } from "./toastStore";
import { EmoteGlyph } from "./VelvetChipIcon";

const TONE: Record<string, string> = {
  info: "bg-stone-900/85 text-stone-100 border-white/10",
  coin: "bg-amber-300/90 text-amber-950 border-amber-100/60",
  win: "bg-pink-300/90 text-pink-950 border-pink-100/60",
  arrive: "bg-sky-300/85 text-sky-950 border-sky-100/60",
};

/** Gentle floating banners, stacked under the header. */
export function Toasts() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2" style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 64px)" }}>
      {toasts.map((t) => (
        <div key={t.id} className={`clay-toast font-cozy flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md ${TONE[t.tone]}`}>
          {t.emoji && (
            <span className="text-base">
              <EmoteGlyph emoji={t.emoji} />
            </span>
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
