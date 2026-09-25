import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

// The cozy loading screen: one warm cream card that carries the player from opening the Activity
// to standing in the lounge, through three stages:
//
//   discord  the Discord SDK handshake            "Knocking on the door..."
//   room     joining the Colyseus room            "Fluffing the cushions..."
//   assets   the lounge's models loading          "Setting up the cozy lounge..."
//
// App renders it at the same place in the tree for every stage, so it stays one element the
// whole way (the mug keeps bobbing, the bar keeps filling) instead of flashing between screens.
// Once the models are in (drei's useProgress, the loading manager every useGLTF goes through),
// it fades out over the canvas and unmounts. An error stage says what went wrong and offers a retry.

export type LoadStage = "discord" | "room" | "assets" | "error";

const COPY: Record<Exclude<LoadStage, "error">, { title: string; detail: string }> = {
  discord: { title: "Knocking on the door...", detail: "Connecting to Discord" },
  room: { title: "Fluffing the cushions...", detail: "Joining room" },
  assets: { title: "Setting up the cozy lounge...", detail: "Unpacking the furniture" },
};
/** Where the bar sits at each stage; the models' own progress fills the last stretch. */
const BAR_AT = { discord: 0.12, room: 0.4, assets: 0.55 };
/** The models count as loaded once nothing has been loading for this long. */
const SETTLE_MS = 450;
/** Never hold the lounge hostage: a model that stalls still shows its stand-in (ModelBoundary). */
const ASSET_TIMEOUT_MS = 15000;
const FADE_MS = 500;

export function LoadingScreen({ stage, error }: { stage: LoadStage; error?: string }) {
  const { active, progress } = useProgress();
  const [assetsDone, setAssetsDone] = useState(false);
  const [gone, setGone] = useState(false);
  // the models: done once the loading manager has been idle for SETTLE_MS (it can go idle between
  // two models, and is idle before the first one starts)...
  useEffect(() => {
    if (stage !== "assets" || assetsDone || active) return;
    const settle = window.setTimeout(() => setAssetsDone(true), SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [stage, active, assetsDone]);
  // ...or after ASSET_TIMEOUT_MS in this stage, whatever is still loading
  useEffect(() => {
    if (stage !== "assets" || assetsDone) return;
    const cap = window.setTimeout(() => setAssetsDone(true), ASSET_TIMEOUT_MS);
    return () => window.clearTimeout(cap);
  }, [stage, assetsDone]);

  // back to an earlier stage (the room dropped): show again, and wait for the models afresh
  useEffect(() => {
    if (stage === "assets") return;
    setAssetsDone(false);
    setGone(false);
  }, [stage]);

  // fade out, then leave the tree
  const leaving = stage === "assets" && assetsDone;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setGone(true), FADE_MS + 50);
    return () => window.clearTimeout(t);
  }, [leaving]);
  if (gone && leaving) return null;

  const isError = stage === "error";
  const copy = isError ? { title: "Oh no, the door is stuck", detail: error ?? "Something went wrong" } : COPY[stage];
  const bar = stage === "assets" ? BAR_AT.assets + (1 - BAR_AT.assets) * (assetsDone ? 1 : Math.min(1, progress / 100)) : isError ? 0 : BAR_AT[stage];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#FAF6EE] to-[#EFE7D8] px-4 text-[#4A3728] transition-opacity ease-out ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
      style={{ fontFamily: "var(--font-cozy)", transitionDuration: `${FADE_MS}ms` }}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      aria-busy={!isError && !leaving}
    >
      <div className="flex w-full max-w-[340px] flex-col items-center gap-5 text-center">
        <CozyMug sad={isError} />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[clamp(20px,5.5vw,26px)] font-semibold leading-tight tracking-[0.01em]">{copy.title}</h1>
          <p className={`m-0 text-[15px] leading-snug ${isError ? "break-words text-[#9A4B3A]" : "text-[#4A3728]/70"}`}>
            {copy.detail}
            {!isError && <Dots />}
          </p>
        </div>
        {isError ? (
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full bg-[#F4A15C] px-6 text-[15px] font-semibold text-[#3B2A1E] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-3px_0_rgba(0,0,0,0.14),0_6px_16px_rgba(166,108,58,0.28)] transition-transform duration-150 hover:brightness-105 active:scale-95">
            Try again
          </button>
        ) : (
          <div className="h-3.5 w-full rounded-full bg-[#E3D8C4] p-[3px] shadow-[inset_0_2px_3px_rgba(74,55,40,0.14)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar * 100)} aria-label="Loading">
            <div className="h-full rounded-full bg-gradient-to-r from-[#F7C98B] to-[#F4A15C] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[width] duration-500 ease-out" style={{ width: `${Math.max(6, bar * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Three soft dots after the status line, bouncing one after another. */
function Dots() {
  return (
    <span className="ml-1 inline-flex gap-[3px] align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="cozy-load-dot inline-block h-[5px] w-[5px] rounded-full bg-[#C98F5A]" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

/** A clay mug of something warm, bobbing gently, with steam curling off it (a sad little tilt on an error). */
function CozyMug({ sad }: { sad: boolean }) {
  return (
    <div className={`relative h-[112px] w-[112px] ${sad ? "" : "cozy-load-bob"}`} aria-hidden>
      <svg viewBox="0 0 112 112" className="h-full w-full overflow-visible" style={sad ? { transform: "rotate(-8deg)" } : undefined}>
        {/* steam: three wisps rising and fading, one after another */}
        {!sad &&
          [34, 50, 66].map((x, i) => (
            <path key={x} className="cozy-load-steam" style={{ animationDelay: `${i * 0.55}s` }} d={`M${x} 40 q -6 -8 0 -16 q 6 -8 0 -16`} fill="none" stroke="#C9B79E" strokeWidth="4.5" strokeLinecap="round" />
          ))}
        {/* soft shadow on the table */}
        <ellipse cx="54" cy="100" rx="34" ry="5" fill="#4A3728" opacity="0.12" />
        {/* handle */}
        <path d="M80 56 q 18 0 18 14 q 0 14 -18 14" fill="none" stroke="#E7B98F" strokeWidth="8" strokeLinecap="round" />
        {/* body, a clay highlight down its left side, and a darker base */}
        <path d="M22 46 h64 v34 a20 20 0 0 1 -20 20 h-24 a20 20 0 0 1 -20 -20 z" fill="#F2C9A0" />
        <path d="M22 80 a20 20 0 0 0 20 20 h24 a20 20 0 0 0 20 -20 v-6 a20 20 0 0 1 -20 20 h-24 a20 20 0 0 1 -20 -20 z" fill="#E1AE82" />
        <rect x="28" y="52" width="7" height="30" rx="3.5" fill="#FFF4E0" opacity="0.7" />
        {/* the drink, with a blob of foam */}
        <ellipse cx="54" cy="46" rx="32" ry="7" fill="#8A5A3B" />
        <ellipse cx="50" cy="45" rx="12" ry="3.2" fill="#F7E6CF" opacity="0.9" />
        {/* a little face */}
        {sad ? (
          <>
            <path d="M42 66 q 4 -4 8 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 66 q 4 -4 8 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
            <path d="M49 80 q 6 -5 12 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M41 68 q 5 -6 10 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
            <path d="M59 68 q 5 -6 10 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
            <path d="M49 75 q 6 6 12 0" fill="none" stroke="#4A3728" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="37" cy="75" rx="5" ry="3" fill="#F29BA8" opacity="0.7" />
            <ellipse cx="73" cy="75" rx="5" ry="3" fill="#F29BA8" opacity="0.7" />
          </>
        )}
      </svg>
    </div>
  );
}
