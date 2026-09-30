import { useEffect, useMemo, useRef, useState } from "react";
import { CAVE_EVENT_INFO, CODEX_BY_ID, CODEX_SECTIONS, FAUNA_ZONE, parseCaveEvent } from "@shared/caverns_codex";
import { CAPYBARA, HOUNDS_HAND, PHOTO_SPOT, cavernsFloorY, cavernsZoneAt } from "@shared/worlds/caverns";
import { CAVERNS_CHANNELS } from "@shared/caverns_mining";
import type { PlayerState } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { cameraFocus } from "../../scene/cameraFocus";
import { exodusClock } from "../../scene/caveFauna";
import { frameWork } from "../../scene/workSpots";
import { playSfx } from "../../audio/sfx";
import { pushToast } from "./toastStore";

// The Cave Codex's eyes and voice down in the caverns (shared/caverns_codex.ts):
//
//   the watch     a zone stamped the first time you walk into it; a creature met after a few seconds
//                 in its home (the capybara near its pool); the Bat Exodus seen at the camp's dusk
//                 (each told to the server, which checks where you stand)
//   the wonder    the living wonder under way as a pill under the header, its clock counting down
//   the news      each new entry a toast (a section completed, its bonus), the Bat Exodus announced as
//                 it begins
//   the photo     the Hound's Hand photo: the camera framed on you and the Hand behind you, a flash
//                 and a shutter (the dock's action raises it: the "cozy-cave-photo" event)

const FAUNA_DWELL_S = 4;

function codexOf(fishing: string): string[] {
  try {
    const v = (JSON.parse(fishing || "{}") as { codex?: unknown }).codex;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function CaveCodexHud({ player, caveEvent, send, subscribeMessages }: { player: PlayerState; caveEvent: string; send: (channel: string, packet?: unknown) => void; subscribeMessages: (listener: RoomMessageListener) => () => void }) {
  const found = useMemo(() => codexOf(player.fishing), [player.fishing]);
  const live = useRef({ found, send, map: player.map });
  live.current = { found, send, map: player.map };
  const sent = useRef(new Map<string, number>());
  const dwell = useRef<{ zone: string; since: number }>({ zone: "", since: 0 });
  const exodusSeen = useRef(-1);

  // the watch: twice a second
  useEffect(() => {
    const t = window.setInterval(() => {
      const { found: f, send: s, map } = live.current;
      if (map !== "glimmering_caverns") return;
      const now = performance.now();
      const once = (key: string, packet: unknown) => {
        if (now - (sent.current.get(key) ?? -1e9) < 5000) return;
        sent.current.set(key, now);
        s(CAVERNS_CHANNELS.codex, packet);
      };
      const zone = cavernsZoneAt(cameraFocus.x, cameraFocus.z)?.id ?? "";
      if (zone && !f.includes(`zone_${zone}`)) once(`zone_${zone}`, { op: "zone", id: `zone_${zone}` });
      if (zone !== dwell.current.zone) dwell.current = { zone, since: now };
      if (now - dwell.current.since >= FAUNA_DWELL_S * 1000) {
        for (const [id, home] of Object.entries(FAUNA_ZONE)) {
          if (home !== zone || f.includes(id)) continue;
          if (id === "fauna_capybara" && Math.hypot(cameraFocus.x - CAPYBARA.x, cameraFocus.z - CAPYBARA.z) > 6) continue;
          once(id, { op: "fauna", id });
        }
      }
      // the Bat Exodus: announced as it begins (if you are down here), and in the codex
      const ex = exodusClock();
      const day = Math.floor(Date.now() / (24 * 60_000));
      if (ex >= 0 && ex < 40 && exodusSeen.current !== day) {
        exodusSeen.current = day;
        pushToast("The Bat Exodus! The mudflats' bats are pouring out through the jungle's collapse", { emoji: "🦇" });
      }
      if (ex >= 0 && !f.includes("wonder_exodus")) once("wonder_exodus", { op: "exodus" });
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  // the news: a new entry, a section completed
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "caveCodex") return;
        const p = payload as { id: string; coins: number; complete?: string; found: number; all: number };
        const e = CODEX_BY_ID.get(p.id);
        if (!e) return;
        pushToast(`Cave Codex: ${e.name} · +${p.coins} 🪙 (${p.found}/${p.all})`, { emoji: e.emoji, tone: "coin" });
        playSfx("chime", 0.6);
        if (p.complete) {
          const sec = CODEX_SECTIONS.find((s) => s.id === p.complete);
          if (sec) pushToast(`${sec.name} complete! A bonus of ${sec.bonus} 🪙`, { emoji: "✨", tone: "win" });
        }
      }),
    [subscribeMessages]
  );

  // the photo: framed on you with the Hound's Hand behind, a flash, a shutter
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const onPhoto = () => {
      const x = PHOTO_SPOT.x + (HOUNDS_HAND.x - PHOTO_SPOT.x) * 0.25;
      const z = PHOTO_SPOT.z + (HOUNDS_HAND.z - PHOTO_SPOT.z) * 0.25;
      const dx = PHOTO_SPOT.x - HOUNDS_HAND.x;
      const dz = PHOTO_SPOT.z - HOUNDS_HAND.z;
      const l = Math.hypot(dx, dz) || 1;
      frameWork({ x, y: cavernsFloorY(PHOTO_SPOT.x, PHOTO_SPOT.z) + 1.5, z, r: 2.4, tall: 4.6, face: { x: dx / l, z: dz / l } });
      window.setTimeout(() => {
        playSfx("focus", 0.9);
        setFlash(Date.now());
        live.current.send(CAVERNS_CHANNELS.codex, { op: "photo" });
      }, 1200);
      window.setTimeout(() => frameWork(null), 3400);
    };
    window.addEventListener("cozy-cave-photo", onPhoto);
    return () => {
      window.removeEventListener("cozy-cave-photo", onPhoto);
      frameWork(null);
    };
  }, []);

  // the wonder's pill (a tick a second while one is on)
  const ev = useMemo(() => parseCaveEvent(caveEvent), [caveEvent]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ev) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ev]);
  const left = ev ? Math.max(0, Math.ceil((ev.until - Date.now()) / 1000)) : 0;
  const info = ev ? CAVE_EVENT_INFO[ev.kind] : null;
  const what = ev?.kind === "cloud" ? "rare fish biting at the cenote" : ev?.kind === "bloom" ? "the rift's glimmer yields more" : ev?.kind === "rockfall" ? "a crew node in the Coal Breakdown" : "";
  return (
    <>
      {info && left > 0 && player.map === "glimmering_caverns" && (
        <div className="pointer-events-none fixed left-1/2 z-[35] -translate-x-1/2" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 96px)" }} role="status" aria-live="polite">
          <div className="clay-pop flex items-center gap-2 whitespace-nowrap rounded-full border border-cyan-200/50 bg-[#141c24]/90 px-3 py-1 text-xs font-bold text-[#E8F4FF] shadow-[0_0_18px_rgba(120,220,255,0.3)]">
            <span>
              {info.emoji} {info.name} · {what}
            </span>
            <span className="tabular-nums text-cyan-200">{mmss(left)}</span>
          </div>
        </div>
      )}
      {flash > 0 && Date.now() - flash < 900 && <div key={flash} className="pointer-events-none fixed inset-0 z-[70] bg-white" style={{ animation: "cozy-ring-flash 0.7s ease-out forwards" }} aria-hidden />}
    </>
  );
}
