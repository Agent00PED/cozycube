import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { B, noRaycast, Cone, Cyl, FloorPatch, GEO, HALF, Instanced, Sph, seeded, type InstanceSpec, type Materials } from "./kit";
import { CUSHIONS } from "@shared/seats";

// The Cozy Velvet Casino: a 20x20 retro casino in warm gold and burgundy. Same shell as the
// lounge — solid walls along x = -HALF and z = -HALF, open toward the camera — so the camera,
// lighting and occlusion rules all carry over. Coordinates match shared/collision.ts.
//
// Only the static set lives here. The live pieces — the roulette wheel and its chips, the slot
// machines, the leaderboard — are rendered by components/Casino.tsx from synced state.
const WALL_HEIGHT = 3.4;
const WALL_THICK = 0.2;
const INNER = HALF - WALL_THICK;

function useCasinoMaterials() {
  const m = useMemo(() => {
    const make = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
    return {
      panel: make("#4b2a1f", { roughness: 0.6 }),
      panelDark: make("#321b13", { roughness: 0.6 }),
      velvet: make("#7a1f2e", { roughness: 1 }),
      velvetDeep: make("#5a1522", { roughness: 1 }),
      felt: make("#1f6b47", { roughness: 1 }),
      gold: make("#d4a94a", { roughness: 0.3, metalness: 0.8 }),
      leather: make("#6b2f22", { roughness: 0.55 }),
      leatherDark: make("#4a1f17", { roughness: 0.55 }),
      cream: make("#f3e6c8", { roughness: 0.9 }),
      sconce: make("#fff1c9", { emissive: "#ffbf66", emissiveIntensity: 1.8 }),
      bottle: make("#ffffff", { roughness: 0.25 }),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}
type CasinoMats = ReturnType<typeof useCasinoMaterials>;

export function CasinoWorld({ mats, wallColor }: { mats: Materials; wallColor: string }) {
  const c = useCasinoMaterials();
  return (
    <>
      <Shell mats={mats} c={c} wallColor={wallColor} />
      <RouletteTableBase mats={mats} c={c} />
      <Bar mats={mats} c={c} />
      <CashierCage mats={mats} c={c} />
      <BlackjackTable mats={mats} c={c} />
      <VipLounge mats={mats} c={c} />
      <Plants mats={mats} />
      <Pendant x={0.6} z={0.4} c={c} />
      <Pendant x={-5.5} z={-5.1} c={c} scale={0.72} />
      {/* high-tops clustered round the roulette perimeter, so the floor between the wheel and
          the bar is a busy little crowd instead of an empty run of carpet */}
      <CocktailTable x={4.3} z={2.4} mats={mats} c={c} />
      <CocktailTable x={-2.2} z={3.2} mats={mats} c={c} />
      <CocktailTable x={4.1} z={-2.4} mats={mats} c={c} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Shell: wood-panelled walls with a brass rail and sconces, burgundy velvet carpet
// ---------------------------------------------------------------------------------------

function Shell({ mats, c, wallColor }: { mats: Materials; c: CasinoMats; wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.7 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);

  // sconces every few units along both walls
  const sconces = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (const x of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) out.push({ p: [x, 2.35, -INNER + 0.1], s: [0.16, 0.26, 0.12] });
    for (const z of [-4.5, -1.5, 1.5, 7.8]) out.push({ p: [-INNER + 0.1, 2.35, z], s: [0.12, 0.26, 0.16] });
    return out;
  }, []);

  return (
    <>
      <B p={[0, WALL_HEIGHT / 2, -HALF + WALL_THICK / 2]} s={[HALF * 2, WALL_HEIGHT, WALL_THICK]} m={wallMat} cast recv />
      <B p={[-HALF + WALL_THICK / 2, WALL_HEIGHT / 2, 0]} s={[WALL_THICK, WALL_HEIGHT, HALF * 2]} m={wallMat} cast recv />
      {/* dark wainscot below a brass rail */}
      <B p={[0, 0.55, -INNER + 0.02]} s={[HALF * 2, 1.1, 0.04]} m={c.panelDark} />
      <B p={[-INNER + 0.02, 0.55, 0]} s={[0.04, 1.1, HALF * 2]} m={c.panelDark} />
      <B p={[0, 1.12, -INNER + 0.05]} s={[HALF * 2, 0.05, 0.06]} m={c.gold} />
      <B p={[-INNER + 0.05, 1.12, 0]} s={[0.06, 0.05, HALF * 2]} m={c.gold} />
      {/* crown moulding */}
      <B p={[0, WALL_HEIGHT - 0.08, -INNER + 0.05]} s={[HALF * 2, 0.12, 0.1]} m={c.gold} />
      <B p={[-INNER + 0.05, WALL_HEIGHT - 0.08, 0]} s={[0.1, 0.12, HALF * 2]} m={c.gold} />
      <Instanced geo={GEO.box} m={c.sconce} items={sconces} />

      {/* gold-framed paintings on the side wall */}
      {[
        [-5.8, c.velvet],
        [-0.2, mats.navy],
      ].map(([z, art], i) => (
        <group key={i}>
          <B p={[-INNER + 0.04, 1.95, z as number]} s={[0.04, 0.95, 1.3]} m={c.gold} />
          <B p={[-INNER + 0.07, 1.95, z as number]} s={[0.02, 0.8, 1.15]} m={art as THREE.Material} />
        </group>
      ))}

      {/* burgundy velvet carpet across the gaming floor, trimmed in gold */}
      <FloorPatch x0={-3.8} x1={7.2} z0={-7.2} z1={6.4} y={0.008} m={c.velvet} />
      <FloorPatch x0={-3.8} x1={7.2} z0={-7.25} z1={-7.2} y={0.012} m={c.gold} />
      <FloorPatch x0={-3.8} x1={7.2} z0={6.4} z1={6.45} y={0.012} m={c.gold} />
      <FloorPatch x0={-3.85} x1={-3.8} z0={-7.25} z1={6.45} y={0.012} m={c.gold} />
      <FloorPatch x0={7.2} x1={7.25} z0={-7.25} z1={6.45} y={0.012} m={c.gold} />

      {/* entrance doormat and brass stanchions where people arrive */}
      <B p={[6.4, 0.012, 7.8]} s={[2.5, 0.01, 1.5]} m={c.gold} recv />
      <B p={[6.4, 0.016, 7.8]} s={[2.3, 0.01, 1.3]} m={c.velvet} recv />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Roulette table: the static body and betting layout (the wheel itself spins in Casino.tsx)
// ---------------------------------------------------------------------------------------

/** Where the felt's number grid starts (x) and its centre line (z); shared with Casino.tsx. */
export const LAYOUT = { x0: 0.25, cell: 0.17, zMid: 0.4, row: 0.2, outsideZ: 0.4 + 0.52, feltY: 0.84 };

function RouletteTableBase({ mats, c }: { mats: Materials; c: CasinoMats }) {
  const cells = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    for (let n = 1; n <= 36; n++) {
      const col = Math.floor((n - 1) / 3);
      const row = (n - 1) % 3;
      out.push({
        p: [LAYOUT.x0 + col * LAYOUT.cell + LAYOUT.cell / 2, LAYOUT.feltY + 0.004, LAYOUT.zMid + (1 - row) * LAYOUT.row],
        s: [LAYOUT.cell - 0.02, 0.006, LAYOUT.row - 0.02],
        color: red.has(n) ? "#b3202e" : "#1c1c22",
      });
    }
    // the zero
    out.push({ p: [LAYOUT.x0 - 0.1, LAYOUT.feltY + 0.004, LAYOUT.zMid], s: [0.16, 0.006, LAYOUT.row * 3 - 0.02], color: "#1f8a4c" });
    // outside bets: RED, BLACK, ODD, EVEN
    ["#b3202e", "#1c1c22", "#e8dcc0", "#e8dcc0"].forEach((color, i) => {
      out.push({ p: [LAYOUT.x0 + 0.26 + i * 0.52, LAYOUT.feltY + 0.004, LAYOUT.outsideZ], s: [0.48, 0.006, 0.26], color });
    });
    return out;
  }, []);

  return (
    <group>
      {/* pedestal base and body */}
      <B p={[0.6, 0.35, 0.4]} s={[3.0, 0.7, 1.6]} m={mats.walnut} cast recv />
      <Cyl p={[-0.9, 0.35, 0.4]} s={[1.6, 0.7, 1.6]} m={mats.walnut} cast />
      <Cyl p={[2.1, 0.35, 0.4]} s={[1.6, 0.7, 1.6]} m={mats.walnut} cast />
      {/* the felt top, rounded at both ends */}
      <B p={[0.6, 0.8, 0.4]} s={[3.0, 0.06, 2.0]} m={c.felt} recv />
      <Cyl p={[-0.9, 0.8, 0.4]} s={[2.0, 0.06, 2.0]} m={c.felt} recv />
      <Cyl p={[2.1, 0.8, 0.4]} s={[2.0, 0.06, 2.0]} m={c.felt} recv />
      {/* padded leather rail */}
      <B p={[0.6, 0.86, 1.44]} s={[3.0, 0.1, 0.14]} m={c.leather} />
      <B p={[0.6, 0.86, -0.64]} s={[3.0, 0.1, 0.14]} m={c.leather} />
      <Cyl p={[2.1, 0.86, 0.4]} s={[2.16, 0.1, 2.16]} m={c.leather} />
      <Cyl p={[2.1, 0.87, 0.4]} s={[1.96, 0.1, 1.96]} m={c.felt} />
      {/* the wheel's wooden bowl (the spinning head sits inside it) */}
      <Cyl p={[-0.75, 0.86, 0.4]} s={[1.32, 0.1, 1.32]} m={mats.darkWood} cast />
      <Cyl p={[-0.75, 0.88, 0.4]} s={[1.2, 0.08, 1.2]} m={c.gold} />
      <Instanced geo={GEO.box} m={mats.tintable} items={cells} />
      {/* gold edge lines of the layout */}
      <B p={[LAYOUT.x0 + LAYOUT.cell * 6, LAYOUT.feltY + 0.006, LAYOUT.zMid + LAYOUT.row * 1.5]} s={[LAYOUT.cell * 12, 0.004, 0.01]} m={c.gold} />
      <B p={[LAYOUT.x0 + LAYOUT.cell * 6, LAYOUT.feltY + 0.006, LAYOUT.zMid - LAYOUT.row * 1.5]} s={[LAYOUT.cell * 12, 0.004, 0.01]} m={c.gold} />
      {/* the croupier's chip rack at the far side */}
      <B p={[1.3, 0.9, -0.48]} s={[0.9, 0.06, 0.18]} m={mats.walnut} />
      {["#e0453a", "#2f5fd0", "#f2f2f2", "#2d9a5a", "#e8b53c"].map((col, i) => (
        <Cyl key={col} p={[0.98 + i * 0.16, 0.95, -0.48]} s={[0.12, 0.08, 0.12]} m={chipMat(col)} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// A brass pendant over the roulette table, pouring a soft amber cone onto the felt. The cone is
// a painted-on glow (additive, unlit), not a light: no extra lights, no shadows.
// ---------------------------------------------------------------------------------------

const CONE_GLOW = new THREE.MeshBasicMaterial({ color: "#ffc46b", transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
const POOL_GLOW = new THREE.MeshBasicMaterial({ color: "#ffb34d", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const BULB_GLOW = new THREE.MeshBasicMaterial({ color: "#fff0c8", toneMapped: false });

/** A brass pendant with its amber cone and the pool of light it leaves on the table below. */
function Pendant({ x, z, c, scale = 1 }: { x: number; z: number; c: CasinoMats; scale?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, 3.9, 0]} s={[0.03, 1.4, 0.03]} m={c.gold} />
      <Cone p={[0, 3.05, 0]} s={[0.62 * scale, 0.3, 0.62 * scale]} m={c.gold} cast />
      <Cyl p={[0, 2.9, 0]} s={[0.64 * scale, 0.03, 0.64 * scale]} m={c.gold} />
      <mesh geometry={GEO.sphereLow} material={BULB_GLOW} position={[0, 2.84, 0]} scale={0.16 * scale} raycast={noRaycast} />
      {/* the light cone and the warm pool it leaves on the felt */}
      <mesh geometry={GEO.cone} material={CONE_GLOW} position={[0, 1.86, 0]} scale={[2.6 * scale, 1.95, 2.6 * scale]} raycast={noRaycast} />
      <mesh geometry={GEO.cyl} material={POOL_GLOW} position={[0, 0.9, 0]} scale={[2.7 * scale, 0.01, 2.2 * scale]} raycast={noRaycast} />
    </group>
  );
}

/** A round cocktail high-top with two drinks on it. */
function CocktailTable({ x, z, mats, c }: { x: number; z: number; mats: Materials; c: CasinoMats }) {
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, 0.03, 0]} s={[0.55, 0.06, 0.55]} m={c.gold} />
      <Cyl p={[0, 0.55, 0]} s={[0.07, 1.05, 0.07]} m={c.gold} cast />
      <Cyl p={[0, 1.08, 0]} s={[0.8, 0.05, 0.8]} m={mats.darkWood} cast recv />
      <Cyl p={[0, 1.1, 0]} s={[0.72, 0.02, 0.72]} m={c.felt} />
      {/* a martini and a tumbler */}
      <Cyl p={[0.16, 1.19, 0.06]} s={[0.018, 0.16, 0.018]} m={mats.glass} />
      <Cone p={[0.16, 1.3, 0.06]} s={[0.14, 0.1, 0.14]} r={[Math.PI, 0, 0]} m={mats.glass} />
      <Sph p={[0.16, 1.3, 0.06]} s={0.025} m={mats.olive} />
      <Cyl p={[-0.14, 1.17, -0.08]} s={[0.1, 0.12, 0.1]} m={mats.glass} />
      <Cyl p={[-0.14, 1.15, -0.08]} s={[0.085, 0.07, 0.085]} m={mats.mustard} />
    </group>
  );
}

const chipCache = new Map<string, THREE.MeshStandardMaterial>();
export function chipMat(color: string) {
  let m = chipCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    chipCache.set(color, m);
  }
  return m;
}

// ---------------------------------------------------------------------------------------
// Bar along the back wall
// ---------------------------------------------------------------------------------------

function Bar({ mats, c }: { mats: Materials; c: CasinoMats }) {
  const bottles = useMemo<InstanceSpec[]>(() => {
    const rand = seeded(777);
    const colors = ["#7a3b2a", "#c9a24a", "#3f6d4a", "#8fb8d0", "#b04a5a", "#e8d8a8"];
    const out: InstanceSpec[] = [];
    for (let shelf = 0; shelf < 2; shelf++) {
      for (let i = 0; i < 14; i++) {
        const h = 0.3 + rand() * 0.14;
        out.push({ p: [-9.3 + i * 0.44, 1.62 + shelf * 0.5 + h / 2, -9.62], s: [0.12, h, 0.12], color: colors[Math.floor(rand() * colors.length)] });
      }
    }
    return out;
  }, []);

  return (
    <>
      <B p={[-6.4, 0.55, -9.3]} s={[6.8, 1.1, 0.9]} m={c.panel} cast recv />
      <B p={[-6.4, 1.13, -9.2]} s={[7.0, 0.07, 1.1]} m={mats.marble} cast recv />
      <B p={[-6.4, 0.12, -8.78]} s={[6.8, 0.04, 0.04]} m={c.gold} />
      {/* raised panel fronts */}
      {Array.from({ length: 7 }, (_, i) => -9.3 + i * 0.97).map((x) => (
        <B key={x} p={[x, 0.58, -8.84]} s={[0.8, 0.72, 0.02]} m={c.panelDark} />
      ))}
      {/* back-bar shelves of bottles and a mirror */}
      <B p={[-6.4, 2.05, -9.78]} s={[6.4, 1.2, 0.02]} m={mats.mirror} />
      {[1.6, 2.1].map((y) => (
        <B key={y} p={[-6.4, y, -9.62]} s={[6.4, 0.04, 0.3]} m={mats.darkWood} />
      ))}
      <Instanced geo={GEO.cylLow} m={c.bottle} items={bottles} />
      {/* taps, a cocktail shaker, and two martinis waiting on the counter */}
      {[-7.4, -7.1, -6.8].map((x) => (
        <Cyl key={x} p={[x, 1.3, -9.45]} s={[0.05, 0.28, 0.05]} m={c.gold} />
      ))}
      <Cyl p={[-5.3, 1.3, -9.2]} s={[0.12, 0.3, 0.12]} m={mats.metal} />
      {[-4.4, -4.1].map((x) => (
        <group key={x}>
          <Cyl p={[x, 1.22, -8.95]} s={[0.02, 0.12, 0.02]} m={mats.glass} />
          <Cone p={[x, 1.33, -8.95]} s={[0.14, 0.1, 0.14]} r={[Math.PI, 0, 0]} m={mats.glass} />
          <Sph p={[x, 1.33, -8.95]} s={0.03} m={mats.olive} />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Cashier cage: counter, brass bars and a sign
// ---------------------------------------------------------------------------------------

function CashierCage({ mats, c }: { mats: Materials; c: CasinoMats }) {
  const bars = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let x = 6.6; x <= 9.7; x += 0.16) out.push({ p: [x, 1.8, -7.72], s: [0.025, 1.3, 0.025] });
    for (let z = -9.6; z <= -7.8; z += 0.16) out.push({ p: [6.5, 1.8, z], s: [0.025, 1.3, 0.025] });
    return out;
  }, []);
  return (
    <>
      <B p={[8.1, 0.55, -7.8]} s={[3.4, 1.1, 0.4]} m={c.panel} cast recv />
      <B p={[6.6, 0.55, -8.7]} s={[0.4, 1.1, 1.9]} m={c.panel} cast recv />
      <B p={[8.1, 1.13, -7.75]} s={[3.5, 0.06, 0.5]} m={mats.marble} />
      <Instanced geo={GEO.cylLow} m={c.gold} items={bars} />
      <B p={[8.1, 2.48, -7.72]} s={[3.4, 0.08, 0.08]} m={c.gold} />
      <B p={[8.1, 2.72, -7.74]} s={[1.8, 0.4, 0.06]} m={c.panelDark} />
      <B p={[8.1, 2.72, -7.7]} s={[1.6, 0.28, 0.02]} m={c.gold} />
      {/* a teller's window gap and a bell */}
      <Cyl p={[7.6, 1.2, -7.65]} s={[0.12, 0.08, 0.12]} m={c.gold} />
      {/* stacks of chips behind the glass */}
      {[7.2, 7.5, 8.6, 8.9].map((x, i) => (
        <Cyl key={x} p={[x, 1.2 + (i % 2) * 0.02, -8.2]} s={[0.14, 0.14 + (i % 2) * 0.04, 0.14]} m={chipMat(["#e0453a", "#2f5fd0", "#e8b53c", "#2d9a5a"][i])} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Blackjack: a half-moon table with cards and chips laid out
// ---------------------------------------------------------------------------------------

const halfMoon = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, -Math.PI / 2, Math.PI);

function BlackjackTable({ mats, c }: { mats: Materials; c: CasinoMats }) {
  return (
    <group position={[-5.5, 0, -4.6]}>
      <mesh geometry={halfMoon} material={mats.walnut} position={[0, 0.38, -0.5]} scale={[1.35, 0.76, 1.35]} castShadow receiveShadow />
      <mesh geometry={halfMoon} material={c.felt} position={[0, 0.79, -0.5]} scale={[1.25, 0.05, 1.25]} receiveShadow />
      <mesh geometry={halfMoon} material={c.leather} position={[0, 0.8, -0.5]} scale={[1.4, 0.06, 1.4]} />
      <mesh geometry={halfMoon} material={c.felt} position={[0, 0.815, -0.5]} scale={[1.26, 0.04, 1.26]} />
      {/* dealer's shoe and a fanned hand in front of each seat */}
      <B p={[-0.5, 0.9, -0.3]} s={[0.22, 0.14, 0.3]} m={mats.black} />
      {[-0.7, 0, 0.7].map((a) => (
        <group key={a} position={[Math.sin(a) * 0.85, 0.845, -0.5 + Math.cos(a) * 0.85]} rotation={[0, a, 0]}>
          <B p={[-0.05, 0, 0]} s={[0.12, 0.006, 0.17]} r={[0, 0.15, 0]} m={c.cream} />
          <B p={[0.06, 0.004, 0]} s={[0.12, 0.006, 0.17]} r={[0, -0.12, 0]} m={c.cream} />
          <Cyl p={[0.24, 0.02, 0.05]} s={[0.1, 0.05, 0.1]} m={chipMat("#e0453a")} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// VIP lounge: tufted chesterfield, club chairs, a velvet rope
// ---------------------------------------------------------------------------------------

function VipLounge({ mats, c }: { mats: Materials; c: CasinoMats }) {
  const tufts = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let z = 3.2; z <= 6.8; z += 0.4) for (const y of [0.78, 1.0]) out.push({ p: [-9.52, y, z], s: [0.04, 0.04, 0.04] });
    return out;
  }, []);
  const rope = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    const posts = [2.0, 4.1, 6.1, 8.1];
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      const n = 8;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const y0 = 0.82 - Math.sin(t0 * Math.PI) * 0.18;
        const y1 = 0.82 - Math.sin(t1 * Math.PI) * 0.18;
        const z0 = a + (b - a) * t0;
        const z1 = a + (b - a) * t1;
        const len = Math.hypot(z1 - z0, y1 - y0);
        out.push({ p: [-4.4, (y0 + y1) / 2, (z0 + z1) / 2], s: [0.05, 0.05, len], r: [-Math.atan2(y1 - y0, z1 - z0), 0, 0] });
      }
    }
    return out;
  }, []);

  return (
    <>
      {/* a gold-and-burgundy rug */}
      <B p={[-7.1, 0.01, 5.0]} s={[4.6, 0.01, 4.8]} m={c.gold} recv />
      <B p={[-7.1, 0.016, 5.0]} s={[4.4, 0.01, 4.6]} m={c.velvetDeep} recv />

      {/* chesterfield: base, rolled arms, deep-buttoned back */}
      <B p={[-9.2, 0.22, 5.0]} s={[1.1, 0.44, 4.0]} m={c.leather} cast recv />
      <B p={[-9.6, 0.72, 5.0]} s={[0.36, 0.7, 4.0]} m={c.leatherDark} cast />
      <Instanced geo={GEO.sphereLow} m={c.leatherDark} items={tufts} />
      {[2.95, 7.05].map((z) => (
        <Cyl key={z} p={[-9.2, 0.5, z]} s={[1.0, 0.36, 0.36]} r={[0, 0, Math.PI / 2]} m={c.leather} cast />
      ))}
      {/* the two seat cushions: CUSHIONS.vipSofa, which the sofa seats' anchor is derived from */}
      {[4.35, 5.65].map((z) => (
        <B key={z} p={[-9.1, CUSHIONS.vipSofa.y, z]} s={[0.9, CUSHIONS.vipSofa.h, 1.24]} m={c.leather} />
      ))}
      <B p={[-9.1, 0.62, 3.6]} s={[0.36, 0.3, 0.12]} r={[0, 0, -0.2]} m={c.gold} />

      {/* low coffee table with a decanter and two glasses */}
      <B p={[-7.5, 0.42, 5.0]} s={[1.3, 0.06, 1.3]} m={mats.marble} cast recv />
      <B p={[-7.5, 0.2, 5.0]} s={[1.1, 0.38, 1.1]} m={mats.walnut} cast />
      <Sph p={[-7.6, 0.58, 4.9]} s={[0.2, 0.24, 0.2]} m={mats.glass} />
      <Sph p={[-7.6, 0.54, 4.9]} s={[0.16, 0.14, 0.16]} m={c.leather} />
      <Cyl p={[-7.6, 0.74, 4.9]} s={[0.04, 0.1, 0.04]} m={mats.glass} />
      {[
        [-7.2, 5.2],
        [-7.3, 4.7],
      ].map(([x, z]) => (
        <Cyl key={z} p={[x, 0.5, z]} s={[0.1, 0.1, 0.1]} m={mats.glass} />
      ))}
      <B p={[-7.8, 0.47, 5.3]} s={[0.3, 0.05, 0.2]} m={c.gold} />

      {/* two club armchairs */}
      {[3.3, 6.7].map((z) => (
        <group key={z} position={[-5.5, 0, z]} rotation={[0, z < 5 ? -0.9 : -2.25, 0]}>
          <B p={[0, 0.22, 0]} s={[0.8, 0.44, 0.8]} m={c.leather} cast recv />
          <B p={[0, 0.6, -0.34]} s={[0.8, 0.5, 0.16]} m={c.leatherDark} cast />
          {[-0.36, 0.36].map((x) => (
            <B key={x} p={[x, 0.52, 0]} s={[0.14, 0.26, 0.76]} m={c.leatherDark} />
          ))}
          <B p={[0, 0.47, 0.04]} s={[0.6, 0.08, 0.64]} m={c.leather} />
        </group>
      ))}

      {/* velvet rope on brass stanchions */}
      {[2.0, 4.1, 6.1, 8.1].map((z) => (
        <group key={z}>
          <Cyl p={[-4.4, 0.03, z]} s={[0.26, 0.06, 0.26]} m={c.gold} />
          <Cyl p={[-4.4, 0.45, z]} s={[0.05, 0.9, 0.05]} m={c.gold} />
          <Sph p={[-4.4, 0.92, z]} s={0.09} m={c.gold} />
        </group>
      ))}
      <Instanced geo={GEO.cylLow} m={c.velvet} items={rope} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Potted palms in brass planters
// ---------------------------------------------------------------------------------------

function Plants({ mats }: { mats: Materials }) {
  return (
    <>
      {[
        [9.2, -2.2],
        [-9.2, -2.0],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <Cyl p={[0, 0.3, 0]} s={[0.6, 0.6, 0.6]} m={mats.brass} cast />
          <Cyl p={[0, 0.6, 0]} s={[0.52, 0.02, 0.52]} m={mats.soil} />
          <Cyl p={[0, 1.1, 0]} s={[0.07, 1.0, 0.07]} m={mats.bark} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return <Sph key={i} p={[Math.cos(a) * 0.38, 1.62, Math.sin(a) * 0.38]} s={[0.62, 0.1, 0.24]} r={[0, -a, -0.35]} m={mats.palmLeaf} cast />;
          })}
        </group>
      ))}
    </>
  );
}
