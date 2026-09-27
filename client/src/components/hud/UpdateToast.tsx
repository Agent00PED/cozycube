import { useEffect, useRef, useState } from "react";
import { ASSET_VERSION } from "../../assetVersion";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { reloadCleanly, shutdown } from "../../systems/lifecycle";

// The live version handshake. The server says which client build it serves as you join ("welcome":
// server/src/build.ts), and when it is about to go down for a deploy ("server_restarting"). Either
// way, a page on an older build than the one being served counts down from COUNTDOWN_S in a pill at
// the top ("A fresh build is here: reloading in 3...") and reloads itself onto the new one, so a
// webview holding on to an old page never plays against a newer server. The page lets go of the
// room, the render loop and the audio as the countdown starts, and reloads only once the server
// answers, keeping Discord's query parameters (systems/lifecycle.ts): the Activity comes back by
// itself.

const COUNTDOWN_S = 3;

export function UpdateToast({ subscribeMessages }: { subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const started = useRef(false);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (started.current) return;
        if (type === "server_restarting") {
          started.current = true;
          setWhy("The lounge is updating");
          setLeft(COUNTDOWN_S);
          shutdown();
        } else if (type === "welcome") {
          const build = (payload as { build?: unknown })?.build;
          // only a real build against a real build: a dev server says "dev"
          if (!import.meta.env.PROD || typeof build !== "string" || build === "dev" || build === ASSET_VERSION) return;
          started.current = true;
          setWhy("A fresh build is here");
          setLeft(COUNTDOWN_S);
          shutdown();
        }
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      // once the server answers, onto the build it serves (the page itself is never cached)
      void reloadCleanly(ASSET_VERSION);
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  if (left === null) return null;
  return (
    <div className="font-cozy pointer-events-none fixed left-1/2 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-[70] -translate-x-1/2" role="status" aria-live="assertive">
      <div className="clay-pop flex items-center gap-2 rounded-full border border-amber-300/50 bg-stone-900/90 px-4 py-2 text-sm font-semibold text-amber-50 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <span className="cozy-bob">✨</span>
        {left > 0 ? (
          <>
            {why}: reloading in <b className="tabular-nums text-amber-200">{left}</b>…
          </>
        ) : (
          <>{why}: reloading…</>
        )}
      </div>
    </div>
  );
}
