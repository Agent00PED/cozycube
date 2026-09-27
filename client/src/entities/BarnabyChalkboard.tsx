import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CAMPFIRE_LAYOUT as L } from "@shared/worlds/campfire";
import { FISH, FISH_IDS } from "@shared/fishing";
import { fishGood, marketDirection, marketMultiplier, msUntilNextHour, parseMarket, type MarketState } from "@shared/market";
import { noRaycast } from "../scene/kit";
import { useMarketRaw } from "../scene/marketStore";
import { ModelBoundary } from "./ModelBoundary";
import { BARNABY_URL } from "./Barnaby";

// Barnaby's outdoor chalkboard, beside his stall (the `Chalkboard` root of barnaby.glb: its easel,
// and a slate UV-mapped 0..1). The slate is painted here, on a canvas, in chalk: this hour's price
// for every fish in the river, an arrow against the hour before (▲ green, ▼ red), and when the
// prices change next. It is redrawn as the market moves (every sale knocks 2% off the next of its
// kind) and on the hour.

const W = 512;
const H = 640;
const FONT = '"Fredoka Variable", "Fredoka", "Nunito", system-ui, sans-serif';

function paint(ctx: CanvasRenderingContext2D, market: MarketState, now: number) {
  // the slate: a dark green-black with the faint haze of wiped chalk
  const g = ctx.createRadialGradient(W * 0.45, H * 0.4, 40, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "#34423a");
  g.addColorStop(1, "#1f2823");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#f2eee2";
  for (let k = 0; k < 14; k++) ctx.fillRect(30 + ((k * 97) % 420), 40 + ((k * 151) % 560), 60 + ((k * 37) % 90), 6);
  ctx.globalAlpha = 1;
  const chalk = "#f2eee2";
  ctx.textBaseline = "middle";
  ctx.fillStyle = chalk;
  ctx.textAlign = "center";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText("TODAY'S CATCH", W / 2, 52);
  ctx.font = `500 22px ${FONT}`;
  const next = new Date(now + msUntilNextHour(now));
  ctx.fillStyle = "#e9d9a8";
  ctx.fillText(`prices until ${next.getHours().toString().padStart(2, "0")}:00`, W / 2, 92);
  ctx.strokeStyle = "rgba(242,238,226,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 114);
  ctx.lineTo(W - 60, 116);
  ctx.stroke();
  const fish = FISH_IDS.filter((id) => FISH[id].water === "freshwater");
  const top = 150;
  const row = (H - top - 64) / fish.length;
  fish.forEach((id, i) => {
    const y = top + row * i + row / 2;
    const sp = FISH[id];
    const mult = marketMultiplier(fishGood(id), market, now);
    const dir = marketDirection(fishGood(id), market, now);
    const price = Math.max(1, Math.round(sp.value * mult));
    ctx.textAlign = "left";
    ctx.font = `30px ${FONT}`;
    ctx.fillText(sp.emoji, 36, y);
    ctx.fillStyle = chalk;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(sp.name, 84, y);
    // a dotted leader to the price
    ctx.fillStyle = "rgba(242,238,226,0.35)";
    const nameEnd = 84 + ctx.measureText(sp.name).width + 10;
    for (let x = nameEnd; x < W - 150; x += 12) ctx.fillRect(x, y + 8, 4, 3);
    ctx.fillStyle = chalk;
    ctx.textAlign = "right";
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(`${price}`, W - 78, y);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = dir === "up" ? "#8fe3a1" : dir === "down" ? "#ff9a8f" : "rgba(242,238,226,0.6)";
    ctx.fillText(dir === "up" ? "▲" : dir === "down" ? "▼" : "–", W - 34, y);
    ctx.fillStyle = chalk;
  });
  ctx.textAlign = "center";
  ctx.font = `500 21px ${FONT}`;
  ctx.fillStyle = "#e9d9a8";
  ctx.fillText("each fish sold: -2% on the next of its kind", W / 2, H - 34);
}

export function BarnabyChalkboard() {
  return (
    <group position={[L.barnaby.x, 0, L.barnaby.z]} rotation={[0, L.barnaby.yaw, 0]}>
      <ModelBoundary what="barnaby.glb" fallback={null}>
        <Suspense fallback={null}>
          <Board />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

function Board() {
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
    copy.traverse((o) => (o.raycast = noRaycast));
    const face = copy.getObjectByName("Chalkboard_Face") as THREE.Mesh | undefined;
    if (face?.isMesh) face.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    return copy;
  }, [scene, texture]);
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
  }, [raw, hourTick, canvas, texture]);
  return <primitive object={model} />;
}
