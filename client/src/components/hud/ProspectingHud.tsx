import { useEffect } from "react";
import { CAVERNS_CHANNELS, ORE_KINDS } from "@shared/caverns_mining";
import { ORE_NODE_AT } from "@shared/worlds/caverns";
import { useProspect } from "../../systems/prospectStore";

// Prospecting's only control on the screen (the rock itself is the interface: scene/ProspectingView):
// a small way to step back from the node, top right, big enough to tap (Escape does the same). No
// gauge, no dial, no prompt.

export function ProspectingHud({ send }: { send: (channel: string, packet?: unknown) => void }) {
  const pr = useProspect();
  useEffect(() => {
    if (!pr) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      send(CAVERNS_CHANNELS.prospect, { op: "stop" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pr, send]);
  if (!pr) return null;
  const node = ORE_NODE_AT.get(pr.node);
  return (
    <button
      type="button"
      onClick={() => send(CAVERNS_CHANNELS.prospect, { op: "stop" })}
      className="clay-pill-soft pointer-events-auto fixed z-30 flex min-h-12 items-center gap-2 rounded-full bg-stone-900/70 px-4 text-sm font-bold text-stone-100 outline outline-1 -outline-offset-1 outline-white/15 backdrop-blur transition-transform active:scale-95"
      style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 56px)", right: "max(12px, env(safe-area-inset-right))" }}
      title="Step back from the rock (Esc)"
      aria-label={`Step back from the ${node ? ORE_KINDS[node.kind].name : "rock"}`}
    >
      ✕ <span className="hidden sm:inline">Step back</span>
    </button>
  );
}
