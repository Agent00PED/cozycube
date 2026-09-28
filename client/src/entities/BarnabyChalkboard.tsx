import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BUSTER_BOARD, CAMPFIRE_LAYOUT as L } from "@shared/worlds/campfire";
import { FISH, FISH_IDS, type FishId } from "@shared/fishing";
import { BYPRODUCTS, BYPRODUCT_IDS, TREES, WOOD, type TreeKind, type WoodKind } from "@shared/chop";
import { FIREWOOD_PRICE } from "@shared/economy";
import { fishGood, forecast, marketDirection, marketMultiplier, msUntilNextHour, parseMarket, woodGood, type MarketGood, type MarketState } from "@shared/market";
import { noRaycast } from "../scene/kit";
import { useMarketRaw } from "../scene/marketStore";
import { ModelBoundary } from "./ModelBoundary";
import { BARNABY_URL } from "./Barnaby";

// The camp's two market chalkboards, the same A-frame easel (the `Chalkboard` root of barnaby.glb:
// its easel, and a slate UV-mapped 0..1), their slates painted here on a canvas, in chalk: this
// hour's price for each good, an arrow against the hour before (▲ green, ▼ red), when the prices
// change next, and a teaser for the hour to come (the trends are seeded by the hour, so the next
// one is known: worth holding, or locking, until then). Barnaby's, beside his stall, has every
// fish in the river; Buster's, by the woodpile, the timber and its by-products. Each is redrawn as
// the market moves (past 30 of a kind sold in an hour, each knocks 2% off the next) and on the hour.

const W = 512;
const H = 640;
const FONT = '"Fredoka Variable", "Fredoka", "Nunito", system-ui, sans-serif';
const CHALK = "#f2eee2";
const CREAM = "#e9d9a8";

/** One line of a board: an emoji, a name, a price, and the hour's arrow (none: a flat price). */
interface Row {
  emoji: string;
  name: string;
  price: number;
  dir?: "up" | "down" | "flat";
}

/** The slate: a dark green-black with the faint haze of wiped chalk, a title and the hour. */
function slate(ctx: CanvasRenderingContext2D, title: string, now: number) {
  const g = ctx.createRadialGradient(W * 0.45, H * 0.4, 40, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "#34423a");
  g.addColorStop(1, "#1f2823");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = CHALK;
  for (let k = 0; k < 14; k++) ctx.fillRect(30 + ((k * 97) % 420), 40 + ((k * 151) % 560), 60 + ((k * 37) % 90), 6);
  ctx.globalAlpha = 1;
  ctx.textBaseline = "middle";
  ctx.fillStyle = CHALK;
  ctx.textAlign = "center";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(title, W / 2, 50);
  ctx.font = `500 22px ${FONT}`;
  const next = new Date(now + msUntilNextHour(now));
  ctx.fillStyle = CREAM;
  ctx.fillText(`prices until ${next.getHours().toString().padStart(2, "0")}:00`, W / 2, 88);
  ctx.strokeStyle = "rgba(242,238,226,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 108);
  ctx.lineTo(W - 60, 110);
  ctx.stroke();
}

/** The rows, from `top` down to `bottom`, sized to fit however many there are. */
function rows(ctx: CanvasRenderingContext2D, list: Row[], top: number, bottom: number) {
  const row = (bottom - top) / list.length;
  const size = Math.max(16, Math.min(34, Math.floor(row * 0.8)));
  list.forEach((r, i) => {
    const y = top + row * i + row / 2;
    ctx.textAlign = "left";
    ctx.font = `${size}px ${FONT}`;
    ctx.fillText(r.emoji, 36, y);
    ctx.fillStyle = CHALK;
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillText(r.name, 36 + size * 1.6, y);
    // a dotted leader to the price
    ctx.fillStyle = "rgba(242,238,226,0.35)";
    const nameEnd = 36 + size * 1.6 + ctx.measureText(r.name).width + 10;
    for (let x = nameEnd; x < W - 150; x += 12) ctx.fillRect(x, y + size * 0.27, 4, 3);
    ctx.fillStyle = CHALK;
    ctx.textAlign = "right";
    ctx.font = `700 ${size + 2}px ${FONT}`;
    ctx.fillText(`${r.price}`, W - 78, y);
    if (r.dir) {
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.fillStyle = r.dir === "up" ? "#8fe3a1" : r.dir === "down" ? "#ff9a8f" : "rgba(242,238,226,0.6)";
      ctx.fillText(r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "–", W - 34, y);
    }
    ctx.fillStyle = CHALK;
  });
}

/** The foot: the next hour's best good, and the sale rule. */
function foot(ctx: CanvasRenderingContext2D, next: { name: string; pct: number } | null) {
  ctx.textAlign = "center";
  if (next) {
    ctx.fillStyle = "rgba(242,238,226,0.12)";
    ctx.fillRect(28, H - 96, W - 56, 44);
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = next.pct >= 0 ? "#8fe3a1" : "#ff9a8f";
    const word = next.pct >= 15 ? "in high demand" : next.pct >= 0 ? "holding firm" : "soft all round";
    ctx.fillText(`Next hour: ${next.name} ${word} ${next.pct >= 0 ? "+" : ""}${next.pct}% ${next.pct >= 0 ? "▲" : "▼"}`, W / 2, H - 74);
  }
  ctx.font = `500 19px ${FONT}`;
  ctx.fillStyle = CREAM;
  ctx.fillText("past 30 sold an hour: -2% each; unsold: +3% next hour", W / 2, H - 28);
}

const RIVER_FISH = FISH_IDS.filter((id) => FISH[id].water === "freshwater");

function paintFish(ctx: CanvasRenderingContext2D, market: MarketState, now: number) {
  slate(ctx, "TODAY'S CATCH", now);
  rows(
    ctx,
    RIVER_FISH.map((id) => ({ emoji: FISH[id].emoji, name: FISH[id].name, price: Math.max(1, Math.round(FISH[id].value * marketMultiplier(fishGood(id), market, now))), dir: marketDirection(fishGood(id), market, now) })),
    128,
    H - 108
  );
  const next = forecast(RIVER_FISH.map(fishGood), market, now);
  foot(ctx, next ? { name: FISH[next.good.slice(5) as FishId].name, pct: next.pct } : null);
}

/** The Whispering Woods' and the camp's timber, T1 to T5. */
const TIMBER: WoodKind[] = (Object.keys(TREES) as TreeKind[]).map((k) => TREES[k].wood);

function paintTimber(ctx: CanvasRenderingContext2D, market: MarketState, now: number) {
  slate(ctx, "TIMBER PRICES", now);
  const list: Row[] = [
    ...TIMBER.map((k): Row => ({ emoji: WOOD[k].emoji, name: WOOD[k].name, price: Math.max(1, Math.round(WOOD[k].sell * marketMultiplier(woodGood(k), market, now))), dir: marketDirection(woodGood(k), market, now) })),
    ...BYPRODUCT_IDS.map((k): Row => ({ emoji: BYPRODUCTS[k].emoji, name: BYPRODUCTS[k].name, price: BYPRODUCTS[k].price })),
    { emoji: "🔥", name: "Firewood bundle", price: FIREWOOD_PRICE },
  ];
  rows(ctx, list, 128, H - 108);
  const next = forecast(TIMBER.map(woodGood), market, now);
  foot(ctx, next ? { name: WOOD[next.good.slice(5) as WoodKind].name, pct: next.pct } : null);
}

export function BarnabyChalkboard() {
  // (the board's own place inside barnaby.glb, beside him: kept as it was modelled)
  return <MarketBoard at={{ x: L.barnaby.x, z: L.barnaby.z, yaw: L.barnaby.yaw }} keepModelled paint={paintFish} />;
}

export function BusterChalkboard() {
  return <MarketBoard at={BUSTER_BOARD} paint={paintTimber} />;
}

function MarketBoard({ at, keepModelled = false, paint }: { at: { x: number; z: number; yaw: number }; keepModelled?: boolean; paint: (ctx: CanvasRenderingContext2D, market: MarketState, now: number) => void }) {
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, at.yaw, 0]}>
      <ModelBoundary what="barnaby.glb" fallback={null}>
        <Suspense fallback={null}>
          <Board keepModelled={keepModelled} paint={paint} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

function Board({ keepModelled, paint }: { keepModelled: boolean; paint: (ctx: CanvasRenderingContext2D, market: MarketState, now: number) => void }) {
  const { scene } = useGLTF(BARNABY_URL);
  const raw = useMarketRaw();
  // the hour turns over even with nothing sold: a tick on the hour redraws it
  const [hourTick, setHourTick] = useState(0);
  useEffect(() => {
    let t = 0;
    const arm = () => {
      t = window.setTimeout(() => {
        setHourTick((n) => n + 1);
        arm();
      }, msUntilNextHour() + 500);
    };
    arm();
    return () => window.clearTimeout(t);
  }, []);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    // the slate's UVs come from glTF (v runs down the image)
    t.flipY = false;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const model = useMemo(() => {
    const root = scene.getObjectByName("Chalkboard");
    const copy = (root ?? new THREE.Group()).clone(true);
    // a board of its own (Buster's): at the group's own place, not where it stands beside Barnaby
    if (!keepModelled) {
      copy.position.set(0, root?.position.y ?? 0, 0);
      copy.rotation.set(0, 0, 0);
    }
    copy.traverse((o) => (o.raycast = noRaycast));
    const face = copy.getObjectByName("Chalkboard_Face") as THREE.Mesh | undefined;
    if (face?.isMesh) face.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    return copy;
  }, [scene, texture, keepModelled]);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      paint(ctx, parseMarket(raw), Date.now());
      texture.needsUpdate = true;
    };
    draw();
    // the web font may still be on its way the first time: once it is in, draw again
    void document.fonts?.ready.then(draw);
  }, [raw, hourTick, canvas, texture, paint]);
  return <primitive object={model} />;
}
