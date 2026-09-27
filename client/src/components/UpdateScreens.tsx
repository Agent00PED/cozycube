import { closeActivity, inDiscordFrame } from "../hooks/useDiscordAuth";
import { CURTAIN_CSS } from "./WorldTransitionScreen";

// The two faces of an update (systems/lifecycle.ts), both behind the travel curtain's burgundy
// velvet: the soft restart's "Updating CozyCube... Reconnecting" while the game remounts in memory,
// and, when new code is needed, the ask to start the Activity afresh (never a reload of Discord's
// frame, which would hang on the SDK's handshake).

function Velvet({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-[80] overflow-hidden" role="alert" aria-live="assertive" aria-label={label}>
      <style>{CURTAIN_CSS}</style>
      <div className="cozy-curtain-close cozy-velvet absolute left-0 top-0 h-full w-1/2" style={{ transformOrigin: "left" }} data-side="l" />
      <div className="cozy-curtain-close cozy-velvet absolute right-0 top-0 h-full w-1/2" style={{ transformOrigin: "right" }} data-side="r" />
      <div className="cozy-curtain-card-in absolute inset-0 flex items-center justify-center p-6">
        <div className="font-cozy flex max-w-[min(440px,90vw)] flex-col items-center gap-2 rounded-3xl border border-amber-300/50 bg-[#2a0a14]/90 px-6 py-5 text-center text-amber-50 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,215,140,0.15)]">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The soft restart: the room let go, the scene unmounted, the game about to come back. */
export function ReconnectCurtain() {
  return (
    <Velvet label="Updating CozyCube">
      <span className="cozy-bob text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" aria-hidden>
        ✨
      </span>
      <b className="text-lg tracking-[0.06em] text-amber-200">Updating CozyCube to latest patch...</b>
      <span className="text-sm text-amber-100/90">Reconnecting</span>
      <span className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      <span className="text-[13px] leading-snug text-amber-100/80">Your lounge and your coins are waiting: you'll be back in a moment.</span>
    </Velvet>
  );
}

/** New JS and CSS are live: only a fresh start of the Activity loads them inside Discord. */
export function UpdateRequiredScreen() {
  const embedded = inDiscordFrame();
  return (
    <Velvet label="A new CozyCube update is live">
      <span className="text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" aria-hidden>
        🎉
      </span>
      <b className="text-lg leading-snug text-amber-200">A new CozyCube update is live!</b>
      <span className="text-[14px] leading-snug text-amber-50/90">Please close this Activity and restart it from Discord to get the latest features.</span>
      <span className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      {embedded ? (
        <>
          <ol className="m-0 list-decimal space-y-0.5 pl-5 text-left text-[13px] leading-snug text-amber-100/85">
            <li>Tap Close Activity below.</li>
            <li>Start CozyCube again from your voice channel's 🚀 Activities.</li>
          </ol>
          <button
            type="button"
            onClick={() => closeActivity("A new CozyCube update is live: start the Activity again to get it.")}
            className="clay-btn clay-btn-amber mt-2 min-h-12 w-full max-w-[260px] text-base font-extrabold"
          >
            Close Activity
          </button>
        </>
      ) : (
        // a plain browser tab (testing outside Discord): no Discord handshake to lose, so a refresh
        // is safe here; inside Discord's frame this branch never renders
        <button type="button" onClick={() => window.location.reload()} className="clay-btn clay-btn-amber mt-2 min-h-12 w-full max-w-[260px] text-base font-extrabold">
          Refresh this tab
        </button>
      )}
    </Velvet>
  );
}
