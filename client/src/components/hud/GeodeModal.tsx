import { useEffect, useMemo, useRef, useState } from "react";
import { CAVERNS_CHANNELS, GEODE_ODDS, GEODE_STRIKES, GEM_IDS, ORE_ITEMS, geodeOdds, type CavernsResult, type GemId, type GeodeId, type GeodeSeam, type GeodeStart, type GeodeStrike } from "@shared/caverns_mining";
import { satchelCount } from "@shared/satchel";
import type { FishingProfile } from "@shared/fishing";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playCaveSfx } from "../../audio/cavernAmbience";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Geode Anvil beside the Ancient Forge: set a geode on it and crack it in three strikes. Its seam
// shows across its face as a faint glinting line (the server drew it: GeodeStart); a strike on the
// seam cracks it cleanly, one off it roughly (the server judges each: GeodeStrike), and each rough one
// shaves the finer gems' odds a little toward the humblest. The third strike opens it: an Amethyst
// Shard, a Topaz Pebble, an Iridescent Opal or, one time in twenty, a Star Shard (a Pristine Geode,
// the Titan Monolith's, likelier to hold the finer ones).

interface Props {
  profile: FishingProfile;
  send: (channel: string, packet?: unknown) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

const R = 110;
const C = 130;

export function GeodeModal({ profile, send, subscribeMessages, onClose }: Props) {
  const [geode, setGeode] = useState<GeodeId | null>(null);
  const [seam, setSeam] = useState<GeodeSeam | null>(null);
  const [hits, setHits] = useState<GeodeStrike[]>([]);
  const [gem, setGem] = useState<GemId | null>(null);
  const [notice, setNotice] = useState("");
  // (the room's senders are made afresh on every render: read the latest through the ref)
  const live = useRef({ geode, gem, send });
  live.current = { geode, gem, send };
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "geodeStart") {
          const g = payload as GeodeStart;
          setGeode(g.geode);
          setSeam(g.seam);
          setHits([]);
          setGem(null);
          setNotice("");
        } else if (type === "geodeStrike") {
          const s = payload as GeodeStrike;
          setHits((h) => [...h, s]);
          playCaveSfx("anvil", 0.9);
          if (s.gem) {
            setGem(s.gem);
            window.setTimeout(() => playSfx(s.gem === "star_shard" || s.gem === "opal" ? "jackpot" : "chime"), 350);
          }
        } else if (type === "cavernsResult") {
          const r = payload as CavernsResult;
          if (!r.ok) setNotice(r.message);
        }
      }),
    [subscribeMessages]
  );
  // stepping away mid-crack (the panel closed): the geode stays uncracked in the satchel
  useEffect(
    () => () => {
      if (live.current.geode && !live.current.gem) live.current.send(CAVERNS_CHANNELS.geode, { op: "cancel" });
    },
    []
  );
  const start = (id: GeodeId) => send(CAVERNS_CHANNELS.geode, { op: "start", geode: id });
  const strike = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!seam || gem || hits.length >= GEODE_STRIKES) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * (C * 2);
    const sy = ((e.clientY - rect.top) / rect.height) * (C * 2);
    const x = (sx - C) / R;
    const y = -(sy - C) / R;
    if (Math.hypot(x, y) > 1.05) return;
    send(CAVERNS_CHANNELS.geode, { op: "strike", x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  // the seam's line across the face (a chord of the unit disc), in the SVG's pixels
  const seamLine = useMemo(() => {
    if (!seam) return null;
    const dx = Math.cos(seam.a);
    const dy = Math.sin(seam.a);
    const px = -Math.sin(seam.a) * seam.o;
    const py = Math.cos(seam.a) * seam.o;
    const half = Math.sqrt(Math.max(0, 1 - seam.o * seam.o)) * 0.92;
    const toSvg = (x: number, y: number) => [C + x * R, C - y * R];
    const [x1, y1] = toSvg(px - dx * half, py - dy * half);
    const [x2, y2] = toSvg(px + dx * half, py + dy * half);
    return { x1, y1, x2, y2 };
  }, [seam]);
  const rough = hits.filter((h) => !h.clean).length;
  const odds = geode ? geodeOdds(geode, rough) : null;
  const mystery = satchelCount(profile, "mystery_geode");
  const pristine = satchelCount(profile, "pristine_geode");
  const outline = useMemo(() => Array.from({ length: 28 }, (_, k) => {
    const a = (k / 28) * Math.PI * 2;
    const r = R * (1 + 0.05 * Math.sin(a * 5 + 1) + 0.03 * Math.sin(a * 9));
    return `${(C + Math.cos(a) * r).toFixed(1)},${(C + Math.sin(a) * r).toFixed(1)}`;
  }).join(" "), []);
  const opened = !!gem;
  return (
    <Modal title="The Geode Anvil" icon="🔨" onClose={onClose} width={440}>
      <div className="flex flex-col items-center gap-2 pb-1">
        {!geode && (
          <>
            <p className="m-0 text-center text-[12px] opacity-80">Set a geode on the anvil, then strike along its seam: three clean strikes keep the finer gems' chances whole.</p>
            <div className="grid w-full grid-cols-2 gap-1.5">
              {(["mystery_geode", "pristine_geode"] as GeodeId[]).map((id) => {
                const n = id === "mystery_geode" ? mystery : pristine;
                return (
                  <button key={id} type="button" className="clay-btn clay-btn-amber flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 leading-tight" disabled={n < 1} onClick={() => start(id)}>
                    <span className="text-2xl">{ORE_ITEMS[id].emoji}</span>
                    <span className="text-[12px]">
                      {ORE_ITEMS[id].name} ×{n}
                    </span>
                  </button>
                );
              })}
            </div>
            <OddsTable odds={GEODE_ODDS.mystery_geode} label="A Mystery Geode, cracked clean" />
            <OddsTable odds={GEODE_ODDS.pristine_geode} label="A Pristine Geode, cracked clean" />
          </>
        )}
        {geode && seam && (
          <>
            <p className="m-0 text-center text-[12px] opacity-80">{opened ? "It falls open!" : `Strike ${hits.length + 1} of ${GEODE_STRIKES}: along the glinting seam`}</p>
            <svg viewBox={`0 0 ${C * 2} ${C * 2}`} className="aspect-square w-full max-w-[260px] cursor-crosshair touch-none select-none" onPointerDown={strike} role="img" aria-label="The geode on the anvil">
              <defs>
                <radialGradient id="geodeRock" cx="40%" cy="35%" r="70%">
                  <stop offset="0%" stopColor={geode === "pristine_geode" ? "#d9d0ff" : "#a8988a"} />
                  <stop offset="100%" stopColor={geode === "pristine_geode" ? "#6a5a9a" : "#5a4a40"} />
                </radialGradient>
                <radialGradient id="geodeHeart" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor={gem ? ORE_ITEMS[gem].color : "#ffffff"} stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#2a1d3a" stopOpacity="0.95" />
                </radialGradient>
              </defs>
              <rect x="30" y={C * 2 - 34} width={C * 2 - 60} height="26" rx="6" fill="#34302d" />
              {!opened ? (
                <g>
                  <polygon points={outline} fill="url(#geodeRock)" stroke="#2a211c" strokeWidth="3" />
                  {[...Array(9)].map((_, k) => (
                    <circle key={k} cx={C + Math.cos(k * 2.1) * R * 0.55} cy={C + Math.sin(k * 1.7) * R * 0.5} r={6 + (k % 3) * 3} fill="#00000022" />
                  ))}
                  {seamLine && <line {...seamLine} stroke="#fff3c4" strokeOpacity="0.55" strokeWidth="2.2" strokeDasharray="7 5" />}
                  {hits.map((h, k) => (
                    <g key={k}>
                      <path d={crackPath(C + h.x * R, C - h.y * R, k)} stroke={h.clean ? "#ffd76a" : "#1e1a18"} strokeWidth={h.clean ? 3 : 2.5} fill="none" strokeLinecap="round" />
                      <circle cx={C + h.x * R} cy={C - h.y * R} r="6" fill={h.clean ? "#fff3c4" : "#6b5a4a"} opacity="0.9" />
                    </g>
                  ))}
                </g>
              ) : (
                <g>
                  <g transform={`translate(-26 6) rotate(-10 ${C} ${C})`}>
                    <path d={`M ${C - R} ${C} A ${R} ${R} 0 0 1 ${C} ${C - R} L ${C} ${C + R} A ${R} ${R} 0 0 1 ${C - R} ${C}`} fill="url(#geodeRock)" stroke="#2a211c" strokeWidth="3" />
                    <circle cx={C - 8} cy={C} r={R * 0.62} fill="url(#geodeHeart)" />
                  </g>
                  <g transform={`translate(26 6) rotate(10 ${C} ${C})`}>
                    <path d={`M ${C + R} ${C} A ${R} ${R} 0 0 0 ${C} ${C - R} L ${C} ${C + R} A ${R} ${R} 0 0 0 ${C + R} ${C}`} fill="url(#geodeRock)" stroke="#2a211c" strokeWidth="3" />
                    <circle cx={C + 8} cy={C} r={R * 0.62} fill="url(#geodeHeart)" />
                  </g>
                  <text x={C} y={C + 18} textAnchor="middle" fontSize="64" style={{ filter: `drop-shadow(0 0 12px ${gem ? ORE_ITEMS[gem].color : "#fff"})` }}>
                    {gem ? ORE_ITEMS[gem].emoji : ""}
                  </text>
                </g>
              )}
            </svg>
            {gem ? (
              <div className="flex flex-col items-center gap-1">
                <b className="text-lg text-[#F7EBE1]">{ORE_ITEMS[gem].name}!</b>
                <span className="text-[12px] opacity-80">Worth about {ORE_ITEMS[gem].price.toLocaleString("en-US")} 🪙 to Gus · {hits.filter((h) => h.clean).length} of 3 strikes clean</span>
                <button type="button" className="clay-btn clay-btn-amber mt-1 min-h-11 px-4 text-sm" onClick={() => setGeode(null)}>
                  🔨 Crack another
                </button>
              </div>
            ) : (
              odds && <OddsTable odds={odds} label={rough ? `${rough} rough strike${rough > 1 ? "s" : ""}: the finer gems a little less likely` : "Every strike clean so far"} />
            )}
          </>
        )}
        {notice && <p className="m-0 text-center text-[12px] font-semibold text-rose-200">{notice}</p>}
      </div>
    </Modal>
  );
}

function OddsTable({ odds, label }: { odds: Record<GemId, number>; label: string }) {
  return (
    <div className="w-full rounded-2xl bg-black/20 px-3 py-2 text-[11.5px]">
      <div className="mb-1 opacity-70">{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {GEM_IDS.map((g) => (
          <span key={g} className="flex items-center justify-between gap-2">
            <span>
              {ORE_ITEMS[g].emoji} {ORE_ITEMS[g].name}
            </span>
            <b className="tabular-nums">{(odds[g] * 100).toFixed(odds[g] < 0.1 ? 1 : 0)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A crack spreading from a strike: a few jagged strokes. */
function crackPath(x: number, y: number, seed: number): string {
  let s = seed * 97 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    let a = (k / 4) * Math.PI * 2 + r();
    let px = x;
    let py = y;
    parts.push(`M ${px.toFixed(1)} ${py.toFixed(1)}`);
    for (let j = 0; j < 3; j++) {
      a += (r() - 0.5) * 0.9;
      px += Math.cos(a) * (14 - j * 3);
      py += Math.sin(a) * (14 - j * 3);
      parts.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
    }
  }
  return parts.join(" ");
}
