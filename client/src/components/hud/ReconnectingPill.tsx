import { useEffect, useState } from "react";

// The quiet reconnect: when the connection drops mid-session the lounge stays on screen (frozen
// on its last state, any open panel still open) and this small pill floats at the top while the
// handshake runs in the background. It waits a moment before showing, so a blip that heals at once
// never flashes it, and after a while offers to try again right away instead of waiting out the
// backoff. It floats above everything, open panels included: the connection is news to all of them.

const SHOW_AFTER_MS = 600;
const OFFER_RETRY_AFTER_MS = 12000;

export function ReconnectingPill({ active, place, onRetry }: { active: boolean; place: string; onRetry: () => void }) {
  const [shown, setShown] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setShown(false);
    setSlow(false);
    if (!active) return;
    const show = window.setTimeout(() => setShown(true), SHOW_AFTER_MS);
    const offer = window.setTimeout(() => setSlow(true), OFFER_RETRY_AFTER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(offer);
    };
  }, [active]);

  if (!active || !shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(12px,env(safe-area-inset-top))+48px)] z-[70] flex justify-center px-4" role="status" aria-live="polite">
      <div className="clay-pop pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-amber-200/40 bg-[#3B2A1E]/90 py-1.5 pl-3 pr-1.5 text-[13px] font-semibold text-amber-50 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" style={{ fontFamily: "var(--font-cozy)" }}>
        <span className="cozy-load-bob inline-block" aria-hidden>
          ⚠️
        </span>
        <span className="truncate">Reconnecting to {place}...</span>
        {slow ? (
          <button type="button" onClick={onRetry} className="shrink-0 rounded-full bg-amber-300 px-3 py-1 text-[12px] font-bold text-amber-950 transition-transform duration-150 hover:brightness-105 active:scale-95">
            🔄 Retry now
          </button>
        ) : (
          <span className="mr-1.5 inline-flex gap-[3px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="cozy-load-dot inline-block h-[5px] w-[5px] rounded-full bg-amber-200" style={{ animationDelay: `${i * 0.16}s` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
