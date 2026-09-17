import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cameraFocus } from "../scene/cameraFocus";

export type RetroProgram = "invaders" | "pong";

const W = 96;
const H = 64;
// Nobody reads a 96x64 screen from across a 28x28 room, so past this the loop simply stops.
const PAUSE_DISTANCE = 6;
const FPS = 20; // chunky retro motion, and only 20 small texture uploads a second per screen

// A tiny procedurally-drawn canvas texture for arcade cabinets and the TV. Pixel-art sized on
// purpose (96x64, nearest-neighbour filtering): it's cheap to upload, and it looks right.
export function useRetroScreen(program: RetroProgram, accent: string, on: boolean, x: number, z: number): THREE.CanvasTexture {
  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return { ctx: canvas.getContext("2d")!, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const clockRef = useRef(0);
  const accRef = useRef(0);
  // Off-screen screens stop too: panning the camera away from the arcade should cost nothing.
  const camera = useThree((s) => s.camera);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreen = useMemo(() => new THREE.Matrix4(), []);
  const point = useMemo(() => new THREE.Vector3(), []);

  // Blank the screen once when it's switched off, rather than redrawing black every frame.
  useEffect(() => {
    if (on) return;
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, W, H);
    texture.needsUpdate = true;
  }, [on, ctx, texture]);

  useFrame((_, delta) => {
    if (!on) return;
    // Nobody close enough to watch: freeze the last frame instead of redrawing + re-uploading.
    if (Math.hypot(cameraFocus.x - x, cameraFocus.z - z) > PAUSE_DISTANCE) return;
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    if (!frustum.containsPoint(point.set(x, 1, z))) return;
    clockRef.current += delta;
    accRef.current += delta;
    if (accRef.current < 1 / FPS) return;
    accRef.current = 0;
    if (program === "invaders") drawInvaders(ctx, clockRef.current, accent);
    else drawPong(ctx, clockRef.current, accent);
    texture.needsUpdate = true;
  });

  return texture;
}

const INVADER = ["0010000100", "0001111000", "0011011100", "0111111110", "0101111010", "0100000010"];

function drawInvaders(ctx: CanvasRenderingContext2D, t: number, accent: string) {
  ctx.fillStyle = "#07060d";
  ctx.fillRect(0, 0, W, H);

  // marching fleet
  const march = Math.round(Math.sin(t * 1.3) * 8);
  const dropY = Math.floor(t / 6) % 3;
  const frame = Math.floor(t * 3) % 2;
  ctx.fillStyle = accent;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const ox = 12 + col * 15 + march;
      const oy = 8 + row * 9 + dropY * 2;
      INVADER.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          // alternate the legs between frames for the classic two-step walk
          const bit = y === 5 && frame === 1 ? line[line.length - 1 - x] : line[x];
          if (bit === "1") ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      });
    }
  }

  // player ship tracking back and forth, firing
  const shipX = 48 + Math.round(Math.sin(t * 0.9) * 30);
  ctx.fillStyle = "#7dffb0";
  ctx.fillRect(shipX - 4, 56, 9, 3);
  ctx.fillRect(shipX - 1, 54, 3, 2);
  const shotY = 52 - ((t * 60) % 44);
  ctx.fillRect(shipX, Math.round(shotY), 1, 3);

  // scanlines + score
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = "#ffffff";
  ctx.font = "7px monospace";
  ctx.fillText(`1UP ${String(Math.floor(t * 37) % 10000).padStart(4, "0")}`, 3, 7);
}

function drawPong(ctx: CanvasRenderingContext2D, t: number, accent: string) {
  // warm retro TV backdrop
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b2a4a");
  g.addColorStop(1, "#3a2a4a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // bouncing ball via triangle waves, so it never needs simulation state
  const tri = (v: number) => 1 - Math.abs((v % 2) - 1);
  const bx = 6 + tri(t * 0.9) * (W - 13);
  const by = 6 + tri(t * 1.37) * (H - 13);

  // both paddles chase the ball, slightly lagged so rallies look human
  const leftY = Math.max(4, Math.min(H - 18, by - 7 + Math.sin(t * 2.1) * 4));
  const rightY = Math.max(4, Math.min(H - 18, by - 7 + Math.cos(t * 1.7) * 4));

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (let y = 2; y < H; y += 6) ctx.fillRect(W / 2, y, 1, 3);

  ctx.fillStyle = accent;
  ctx.fillRect(3, Math.round(leftY), 3, 14);
  ctx.fillRect(W - 6, Math.round(rightY), 3, 14);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(bx), Math.round(by), 3, 3);

  ctx.font = "8px monospace";
  ctx.fillText(String(Math.floor(t / 7) % 10), W / 2 - 12, 10);
  ctx.fillText(String(Math.floor(t / 11) % 10), W / 2 + 7, 10);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
}
