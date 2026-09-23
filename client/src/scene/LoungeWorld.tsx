import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B, Cyl, FloorPatch, GEO, Instanced, Rug, Sph, noMerge, noRaycast, seeded, type InstanceSpec, type Materials } from "./kit";
import { Occluder } from "./Occluder";
import { CUSHIONS, surfaceY } from "@shared/seats";
import { BOOKCASE, CHAISE, CONSOLE, GAMES, HEARTH, KITCHEN, LOFT_HALF, LOFT_PIT, LOFT_WALL_HEIGHT, LOUNGE_CORNER, PIT_SOFA, PLANTS, READING, SUNNY_RUG, WINDOWS, WINDOW_Y } from "@shared/worlds/lounge";

// The Loft: the cozy lounge, drawn from the floor plan in shared/worlds/lounge.ts.
//
// An intimate 15x15 penthouse in one visual language: warm matte oak and walnut, soft woven
// fabric in forest olive, vanilla cream and terracotta, satin ceramic, muted brass. Every
// material here is matte (roughness 0.7..0.85, metalness at most 0.1); nothing casts or
// receives a shadow map, the room is lit by warm ambient light, the hearth's own glow and the
// lamps' and pendants' soft lights.
//
// Every piece of furniture is built here from the kit's unit shapes as ONE group, joined
// part into part (arms into seats, legs into aprons), so nothing can drift away from the
// thing it belongs to. The whole world is baked into a few merged draws by the StaticBatch
// round it (ProceduralRoom); only the fire opts out.
//
// Seats: every seat in this room is a "pad" seat, drawn here on the cushion named in the plan
// (shared/seats.ts). The avatar's anchor is derived from the same cushion, so a seat drawn
// here is a seat you sit on exactly.
//
// The interactive props (TV, lamps, pendants, espresso machine, turntable, board game, Mochi)
// are drawn by their own components from synced state; this file draws the furniture they
// stand on, the cords the pendants hang from, and leaves their spots clear.

const HALF = LOFT_HALF;
const WALL_HEIGHT = LOFT_WALL_HEIGHT;
const WALL_THICK = 0.2;
const INNER = HALF - WALL_THICK; // the walls' inner faces are at -INNER
const PIT_Y = -LOFT_PIT.depth;

/** The room's palette. One `make` so every surface shares the same matte finish. */
function useLoftMaterials() {
  const m = useMemo(() => {
    const make = (color: string, roughness = 0.8, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...opts });
    return {
      // woods
      oak: make("#c48a4f"),
      oakLight: make("#d9a86c"),
      walnut: make("#5a3a24"),
      // fabrics
      olive: make("#5e6b45", 0.85),
      oliveDeep: make("#4a5637", 0.85),
      cream: make("#f3e9d6", 0.85),
      creamDeep: make("#e3d5bb", 0.85),
      terracotta: make("#c4714a", 0.85),
      terracottaDeep: make("#a65a38", 0.85),
      mustard: make("#d9a441", 0.85),
      plum: make("#6b4a63", 0.85),
      linen: make("#d9c9a8", 0.85),
      rugWool: make("#cdb08a", 0.85),
      rugWoolDeep: make("#a98a62", 0.85),
      rugRose: make("#c98a80", 0.85),
      rugRoseDeep: make("#a86b62", 0.85),
      rugMoss: make("#6f7f5e", 0.85),
      rugMossDeep: make("#57664a", 0.85),
      // hard surfaces
      brass: make("#b08d57", 0.7, { metalness: 0.1 }),
      ceramic: make("#e9dfd0", 0.7),
      ceramicSage: make("#a9b8a0", 0.7),
      stone: make("#8f8a83", 0.8),
      brick: make("#b06a4e", 0.85),
      grout: make("#e6d8c6", 0.85),
      charcoal: make("#3a3a3e", 0.75),
      leather: make("#7a5236", 0.7),
      firebox: make("#1c1512", 0.85),
      soil: make("#2b1e16", 0.85),
      // plants
      leaf: make("#4f7a4a", 0.85),
      leafLight: make("#6d9a5e", 0.85),
      oliveLeaf: make("#7f9168", 0.85),
      bark: make("#4a3524", 0.85),
      // glass and glow
      pane: make("#bfe3f5", 0.7, { emissive: "#9fd0ea", emissiveIntensity: 0.5 }),
      frame: make("#f7f3ea", 0.75),
      railGlass: new THREE.MeshStandardMaterial({ color: "#cfe6ee", roughness: 0.7, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false }),
      ember: make("#ff6a2a", 0.85, { emissive: "#ff4a10", emissiveIntensity: 1.6 }),
      flame: new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false }),
      flameCore: new THREE.MeshBasicMaterial({ color: "#fff1b0", toneMapped: false }),
      wick: new THREE.MeshBasicMaterial({ color: "#ffd27a", toneMapped: false }),
      // small things
      mug: make("#f0e6d2", 0.7),
      coffee: make("#3a2418", 0.7),
      lemon: make("#f3d250", 0.75),
      orange: make("#f19a4a", 0.75),
      bread: make("#c79a4e", 0.85),
      record: make("#1a1a1e", 0.75),
      art: make("#3f6b52", 0.85),
      artB: make("#e3b3a3", 0.85),
      tintable: make("#ffffff", 0.85),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}
type Loft = ReturnType<typeof useLoftMaterials>;
interface P {
  c: Loft;
}

export function LoungeWorld({ mats: _mats, wallColor }: { mats: Materials; wallColor: string }) {
  const c = useLoftMaterials();
  return (
    <>
      <Shell c={c} wallColor={wallColor} />
      <Hearth c={c} />
      <Bookcase c={c} />
      <ConversationPit c={c} />
      <ReadingNook c={c} />
      <WindowWall c={c} />
      <Kitchen c={c} />
      <Bistro c={c} />
      <LoungeCorner c={c} />
      <GamesTable c={c} />
      <RecordConsole c={c} />
      <Plants c={c} />
      <Balustrade c={c} />
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The shell: two walls, open toward the camera behind a low balustrade
// ---------------------------------------------------------------------------------------

function Shell({ c, wallColor }: P & { wallColor: string }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85, metalness: 0 }), [wallColor]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);
  return (
    <>
      <B p={[0, WALL_HEIGHT / 2, -HALF + WALL_THICK / 2]} s={[HALF * 2, WALL_HEIGHT, WALL_THICK]} m={wallMat} />
      <B p={[-HALF + WALL_THICK / 2, WALL_HEIGHT / 2, 0]} s={[WALL_THICK, WALL_HEIGHT, HALF * 2]} m={wallMat} />
      {/* skirting and a picture rail in cream, a whisker proud of the plaster */}
      <B p={[0, 0.07, -INNER + 0.03]} s={[HALF * 2, 0.14, 0.06]} m={c.frame} />
      <B p={[-INNER + 0.03, 0.07, 0]} s={[0.06, 0.14, HALF * 2]} m={c.frame} />
      <B p={[0, WALL_HEIGHT - 0.06, -INNER + 0.03]} s={[HALF * 2, 0.12, 0.06]} m={c.frame} />
      <B p={[-INNER + 0.03, WALL_HEIGHT - 0.06, 0]} s={[0.06, 0.12, HALF * 2]} m={c.frame} />
      {/* two framed prints on the back wall, over the counter run */}
      {[
        { x: 3.2, art: c.art },
        { x: 4.6, art: c.artB },
      ].map(({ x, art }) => (
        <group key={x}>
          <B p={[x, 2.7, -INNER + 0.03]} s={[0.9, 0.64, 0.05]} m={c.walnut} />
          <B p={[x, 2.7, -INNER + 0.065]} s={[0.76, 0.5, 0.02]} m={art} />
        </group>
      ))}
    </>
  );
}

/** A low rail along the two open edges: glass panels between walnut posts, so nothing hides the room. */
function Balustrade({ c }: P) {
  const edge = HALF - 0.12;
  const posts = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let z = -HALF + 0.1; z <= edge; z += 1.5) out.push({ p: [edge, 0.45, z], s: [0.1, 0.9, 0.1] });
    for (let x = -HALF + 0.1; x < edge; x += 1.5) out.push({ p: [x, 0.45, edge], s: [0.1, 0.9, 0.1] });
    return out;
  }, [edge]);
  return (
    <group>
      <Instanced geo={GEO.box} m={c.walnut} items={posts} />
      <B p={[edge, 0.9, 0]} s={[0.12, 0.06, HALF * 2]} m={c.walnut} />
      <B p={[0, 0.9, edge]} s={[HALF * 2, 0.06, 0.12]} m={c.walnut} />
      <B p={[edge, 0.48, 0]} s={[0.02, 0.7, HALF * 2 - 0.2]} m={c.railGlass} />
      <B p={[0, 0.48, edge]} s={[HALF * 2 - 0.2, 0.7, 0.02]} m={c.railGlass} />
      <B p={[edge, 0.03, 0]} s={[0.24, 0.06, HALF * 2]} m={c.walnut} />
      <B p={[0, 0.03, edge]} s={[HALF * 2, 0.06, 0.24]} m={c.walnut} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The hearth: chimney breast, mantel, fire, Mochi's rug
// ---------------------------------------------------------------------------------------

function Hearth({ c }: P) {
  const h = HEARTH;
  const cx = (h.x0 + h.x1) / 2;
  const w = h.x1 - h.x0;
  const d = h.z1 - h.z0;
  const cz = (h.z0 + h.z1) / 2;
  // grout lines across the brick face, so it reads as brick rather than a rust slab
  const grout = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let y = 0.22; y < WALL_HEIGHT - 0.1; y += 0.24) {
      out.push({ p: [cx, y, h.z1 + 0.004], s: [w, 0.02, 0.01] });
      out.push({ p: [h.x0 - 0.004, y, cz], s: [0.01, 0.02, d] });
      out.push({ p: [h.x1 + 0.004, y, cz], s: [0.01, 0.02, d] });
    }
    return out;
  }, [cx, cz, w, d, h.x0, h.x1, h.z1]);
  return (
    <group>
      {/* the breast, floor to ceiling, and the stone hearth slab it stands on */}
      <B p={[cx, WALL_HEIGHT / 2, cz]} s={[w, WALL_HEIGHT, d]} m={c.brick} />
      <Instanced geo={GEO.box} m={c.grout} items={grout} />
      <B p={[cx, 0.03, h.z1 + 0.3]} s={[w + 0.3, 0.06, 0.6]} m={c.stone} />
      {/* the firebox, cut into the breast: a dark recess with a stone surround */}
      <B p={[cx, h.fireY, h.z1 - 0.3]} s={[1.3, 0.9, 0.62]} m={c.firebox} />
      <B p={[cx, h.fireY + 0.52, h.z1 + 0.03]} s={[1.7, 0.16, 0.08]} m={c.stone} />
      <B p={[cx - 0.75, h.fireY, h.z1 + 0.03]} s={[0.2, 0.9, 0.08]} m={c.stone} />
      <B p={[cx + 0.75, h.fireY, h.z1 + 0.03]} s={[0.2, 0.9, 0.08]} m={c.stone} />
      {/* logs and a fire */}
      <Cyl p={[cx - 0.18, 0.2, h.z1 - 0.28]} s={[0.18, 0.8, 0.18]} r={[0, 0, Math.PI / 2 + 0.1]} m={c.bark} />
      <Cyl p={[cx + 0.14, 0.34, h.z1 - 0.32]} s={[0.16, 0.7, 0.16]} r={[0.2, 0, Math.PI / 2 - 0.3]} m={c.bark} />
      <Cyl p={[cx, 0.12, h.z1 - 0.2]} s={[0.16, 0.6, 0.16]} r={[0, 0.3, Math.PI / 2]} m={c.bark} />
      <Fire x={cx} z={h.z1 - 0.28} c={c} />
      {/* the mantel shelf, with candles and a little clock */}
      <B p={[cx, h.mantelY, h.z1 + 0.14]} s={[w + 0.3, 0.08, 0.36]} m={c.walnut} />
      <B p={[cx, h.mantelY - 0.1, h.z1 + 0.06]} s={[w + 0.3, 0.12, 0.14]} m={c.walnut} />
      {[-0.9, -0.72, 0.85].map((dx, i) => (
        <group key={dx}>
          <Cyl p={[cx + dx, h.mantelY + 0.04 + [0.1, 0.07, 0.12][i], h.z1 + 0.14]} s={[0.08, [0.2, 0.14, 0.24][i], 0.08]} m={c.ceramic} />
          <Sph p={[cx + dx, h.mantelY + 0.04 + [0.22, 0.16, 0.26][i], h.z1 + 0.14]} s={0.035} m={c.wick} />
        </group>
      ))}
      <Cyl p={[cx + 0.35, h.mantelY + 0.18, h.z1 + 0.14]} s={[0.28, 0.05, 0.28]} r={[Math.PI / 2, 0, 0]} m={c.brass} />
      <Cyl p={[cx + 0.35, h.mantelY + 0.18, h.z1 + 0.17]} s={[0.22, 0.02, 0.22]} r={[Math.PI / 2, 0, 0]} m={c.frame} />
      {/* a log basket by the hearth */}
      <Cyl p={[h.x1 + 0.4, 0.18, h.z1 + 0.3]} s={[0.46, 0.36, 0.46]} m={c.bread} />
      <Cyl p={[h.x1 + 0.4, 0.36, h.z1 + 0.3]} s={[0.4, 0.06, 0.4]} m={c.walnut} />
      {[0, 1, 2].map((i) => (
        <Cyl key={i} p={[h.x1 + 0.32 + i * 0.09, 0.44, h.z1 + 0.24 + i * 0.06]} s={[0.11, 0.3, 0.11]} r={[0.2, 0, 0.3 - i * 0.2]} m={c.bark} />
      ))}
      {/* Mochi's hearthrug: a round wool rug in front of the fire (she sleeps on its left) */}
      <PatternedRug x={h.rug.x} z={h.rug.z} radius={h.rug.radius} y={0.05} outer={c.rugWoolDeep} inner={c.rugWool} />
    </group>
  );
}

/** A round rug with a woven border: two discs a hair apart, never the same colour as the floor. */
function PatternedRug({ x, z, radius, y, outer, inner, sx = 1 }: { x: number; z: number; radius: number; y: number; outer: THREE.Material; inner: THREE.Material; sx?: number }) {
  return (
    <group>
      <Rug x={x} z={z} radius={radius} y={y} sx={sx} m={outer} />
      <Rug x={x} z={z} radius={radius - 0.18} y={y + 0.006} sx={sx} m={inner} />
    </group>
  );
}

/** The fire: three flames that breathe, and a soft warm light nestled in the firebox. */
function Fire({ x, z, c }: { x: number; z: number; c: Loft }) {
  const ref = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = ref.current;
    if (g) {
      g.children.forEach((f, i) => {
        const k = 0.85 + Math.sin(t * (6 + i * 1.7) + i) * 0.12 + Math.sin(t * 13 + i * 2) * 0.05;
        f.scale.set(1, k, 1);
        f.rotation.z = Math.sin(t * 4 + i) * 0.08;
      });
    }
    if (light.current) light.current.intensity = 2.0 + Math.sin(t * 7) * 0.25 + Math.sin(t * 15.3) * 0.15;
  });
  return (
    <group position={[x, 0.16, z]} userData={noMerge}>
      <group ref={ref}>
        <mesh geometry={GEO.cone} material={c.flame} position={[-0.14, 0.2, 0]} scale={[0.24, 0.44, 0.2]} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={c.flame} position={[0.12, 0.24, 0.04]} scale={[0.28, 0.52, 0.22]} raycast={noRaycast} />
        <mesh geometry={GEO.cone} material={c.flameCore} position={[0, 0.16, 0.06]} scale={[0.18, 0.36, 0.16]} raycast={noRaycast} />
      </group>
      <mesh geometry={GEO.sphere} material={c.ember} position={[0, 0.02, 0.02]} scale={[0.46, 0.12, 0.3]} raycast={noRaycast} />
      <pointLight ref={light} color="#ffaa44" intensity={2.0} distance={6} decay={2} position={[0, 0.4, 0.5]} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The built-in bookcase beside the chimney
// ---------------------------------------------------------------------------------------

const BOOK_COLORS = ["#c4714a", "#3f6b52", "#2f3f5c", "#d9a441", "#6b4a63", "#a8553a", "#7d9471", "#f0e6d2", "#8f7fc4", "#5a3a24"];

function Bookcase({ c }: P) {
  const b = BOOKCASE;
  const cx = (b.x0 + b.x1) / 2;
  const w = b.x1 - b.x0;
  const cz = (b.z0 + b.z1) / 2;
  const d = b.z1 - b.z0;
  const shelves = [0.32, 0.82, 1.32, 1.82];
  const books = useMemo<InstanceSpec[]>(() => {
    const rnd = seeded(7);
    const out: InstanceSpec[] = [];
    for (const y of shelves) {
      let x = b.x0 + 0.12;
      const end = b.x1 - 0.12;
      // one shelf in two keeps a gap for a plant or a vase
      const gapAt = rnd() < 0.5 ? b.x0 + w * (0.3 + rnd() * 0.4) : Infinity;
      while (x < end) {
        if (Math.abs(x - gapAt) < 0.3) {
          x += 0.6;
          continue;
        }
        const t = 0.05 + rnd() * 0.07;
        const hgt = 0.22 + rnd() * 0.14;
        out.push({ p: [x + t / 2, y + 0.02 + hgt / 2, b.z0 + 0.22], s: [t, hgt, 0.26], r: [0, 0, rnd() < 0.08 ? 0.12 : 0], color: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] });
        x += t + 0.01;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.x0, b.x1, b.z0, w]);
  return (
    <group>
      {/* carcass: two uprights, a top, a plinth and a back panel */}
      <B p={[b.x0 + 0.04, b.height / 2, cz]} s={[0.08, b.height, d]} m={c.walnut} />
      <B p={[b.x1 - 0.04, b.height / 2, cz]} s={[0.08, b.height, d]} m={c.walnut} />
      <B p={[cx, b.height - 0.03, cz]} s={[w, 0.06, d]} m={c.walnut} />
      <B p={[cx, 0.14, cz]} s={[w, 0.28, d]} m={c.walnut} />
      <B p={[cx, b.height / 2, b.z0 + 0.02]} s={[w - 0.1, b.height, 0.03]} m={c.charcoal} />
      {shelves.map((y) => (
        <B key={y} p={[cx, y, cz]} s={[w - 0.1, 0.04, d]} m={c.walnut} />
      ))}
      {/* a trailing pothos on the top */}
      <Cyl p={[cx + w * 0.3, b.height + 0.1, cz]} s={[0.22, 0.2, 0.22]} m={c.ceramicSage} />
      <Sph p={[cx + w * 0.3, b.height + 0.26, cz]} s={[0.4, 0.22, 0.34]} m={c.leafLight} />
      <Sph p={[cx + w * 0.3 + 0.16, b.height + 0.1, cz + 0.08]} s={[0.16, 0.26, 0.12]} m={c.leaf} />
      <Instanced geo={GEO.box} m={c.tintable} items={books} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The conversation pit: a closed corner sofa round the fire, a round table, a rug
// ---------------------------------------------------------------------------------------

function ConversationPit({ c }: P) {
  const p = LOFT_PIT;
  const s = PIT_SOFA;
  const k = CUSHIONS.loftSofa;
  const seatTop = surfaceY(k);
  const south = s.south;
  const east = s.east;
  const southW = south.x1 - south.x0;
  const southD = south.z1 - south.z0;
  const eastW = east.x1 - east.x0;
  const eastD = east.z1 - east.z0;
  const backH = 0.72;
  return (
    <group>
      {/* a wood lip round the rim of the pit, on the main floor */}
      <B p={[(p.x0 + p.x1) / 2, 0.015, p.z0 - 0.05]} s={[p.x1 - p.x0 + 0.2, 0.03, 0.1]} m={c.oak} />
      <B p={[(p.x0 + p.x1) / 2, 0.015, p.z1 + 0.05]} s={[p.x1 - p.x0 + 0.2, 0.03, 0.1]} m={c.oak} />
      <B p={[p.x0 - 0.05, 0.015, (p.z0 + p.z1) / 2]} s={[0.1, 0.03, p.z1 - p.z0]} m={c.oak} />
      <B p={[p.x1 + 0.05, 0.015, (p.z0 + p.z1) / 2]} s={[0.1, 0.03, p.z1 - p.z0]} m={c.oak} />

      {/* everything below is on the pit floor */}
      <group position={[0, PIT_Y, 0]}>
        <PatternedRug x={s.table.x} z={s.table.z} radius={1.45} y={0.006} sx={1.2} outer={c.rugMossDeep} inner={c.rugMoss} />

        {/* --- one continuous base under both runs and the corner --- */}
        <B p={[(south.x0 + south.x1) / 2, 0.15, (south.z0 + south.z1) / 2]} s={[southW, 0.3, southD]} m={c.oliveDeep} />
        <B p={[(east.x0 + east.x1) / 2, 0.15, (east.z0 + east.z1) / 2]} s={[eastW, 0.3, eastD]} m={c.oliveDeep} />
        {/* seat cushions: three along the south run, two up the east run, one square in the corner */}
        {s.seatXs.map((x) => (
          <B key={x} p={[x, k.y, south.z0 + 0.44]} s={[1.14, k.h, 0.86]} m={c.olive} />
        ))}
        {s.eastSeatZs.map((z) => (
          <B key={z} p={[east.x0 + 0.44, k.y, z]} s={[0.86, k.h, 1.0]} m={c.olive} />
        ))}
        <B p={[s.corner.x, k.y, s.corner.z + 0.05]} s={[0.78, k.h, 0.86]} m={c.olive} />
        {/* the backs: one continuous run along both rims, meeting closed in the corner */}
        <B p={[(south.x0 + south.x1) / 2, backH / 2, south.z1 - 0.11]} s={[southW, backH, 0.22]} m={c.olive} />
        <B p={[east.x1 - 0.11, backH / 2, (east.z0 + south.z1) / 2]} s={[0.22, backH, south.z1 - east.z0]} m={c.olive} />
        {/* back cushions, one per seat, resting on the seats and leaning on the backs */}
        {s.seatXs.map((x) => (
          <B key={x} p={[x, seatTop + 0.15, south.z1 - 0.3]} s={[1.08, 0.3, 0.16]} r={[-0.12, 0, 0]} m={c.oliveDeep} />
        ))}
        {s.eastSeatZs.map((z) => (
          <B key={z} p={[east.x1 - 0.3, seatTop + 0.15, z]} s={[0.16, 0.3, 0.94]} r={[0, 0, 0.12]} m={c.oliveDeep} />
        ))}
        <B p={[s.corner.x - 0.02, seatTop + 0.15, south.z1 - 0.3]} s={[0.7, 0.3, 0.16]} r={[-0.12, 0, 0]} m={c.oliveDeep} />
        {/* the arms at the two open ends, rolled tops sunk into the bases */}
        <B p={[south.x0 + 0.12, 0.26, (south.z0 + south.z1) / 2]} s={[0.24, 0.52, southD]} m={c.olive} />
        <Cyl p={[south.x0 + 0.12, 0.52, (south.z0 + south.z1) / 2]} s={[0.24, southD, 0.24]} r={[Math.PI / 2, 0, 0]} m={c.olive} />
        <B p={[(east.x0 + east.x1) / 2, 0.26, east.z0 + 0.12]} s={[eastW, 0.52, 0.24]} m={c.olive} />
        <Cyl p={[(east.x0 + east.x1) / 2, 0.52, east.z0 + 0.12]} s={[0.24, eastW, 0.24]} r={[0, 0, Math.PI / 2]} m={c.olive} />
        {/* throw pillows and a folded throw */}
        <B p={[s.seatXs[0] - 0.25, seatTop + 0.17, south.z1 - 0.42]} s={[0.38, 0.34, 0.14]} r={[-0.2, 0, 0.1]} m={c.mustard} />
        <B p={[s.seatXs[2] + 0.2, seatTop + 0.17, south.z1 - 0.42]} s={[0.38, 0.34, 0.14]} r={[-0.2, 0, -0.12]} m={c.terracotta} />
        <B p={[east.x1 - 0.42, seatTop + 0.17, s.eastSeatZs[0] - 0.25]} s={[0.14, 0.34, 0.38]} r={[0, 0, 0.2]} m={c.cream} />
        <B p={[s.seatXs[1], seatTop + 0.03, south.z0 + 0.5]} s={[0.8, 0.06, 0.6]} r={[0, 0.15, 0]} m={c.linen} />

        {/* --- the round coffee table: a walnut top on a brass pedestal, tea on it --- */}
        <Cyl p={[s.table.x, 0.02, s.table.z]} s={[0.5, 0.04, 0.5]} m={c.brass} />
        <Cyl p={[s.table.x, s.table.height / 2, s.table.z]} s={[0.08, s.table.height, 0.08]} m={c.brass} />
        <Cyl p={[s.table.x, s.table.height - 0.03, s.table.z]} s={[s.table.radius * 2, 0.06, s.table.radius * 2]} m={c.walnut} />
        <Cyl p={[s.table.x - 0.08, s.table.height + 0.015, s.table.z + 0.04]} s={[0.4, 0.03, 0.4]} m={c.oakLight} />
        <Cyl p={[s.table.x - 0.02, s.table.height + 0.08, s.table.z + 0.1]} s={[0.11, 0.1, 0.11]} m={c.mug} />
        <Cyl p={[s.table.x - 0.18, s.table.height + 0.08, s.table.z - 0.04]} s={[0.11, 0.1, 0.11]} m={c.mug} />
        <B p={[s.table.x + 0.2, s.table.height + 0.02, s.table.z - 0.18]} s={[0.26, 0.04, 0.2]} r={[0, 0.4, 0]} m={c.mustard} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Seats: every seat in the room, drawn on the cushion the plan names
// ---------------------------------------------------------------------------------------

/** A wingback: deep seat, tall winged back, rolled arms joined to the seat. Faces local +Z. */
function WingChair({ x, z, rotY, fabric, c }: { x: number; z: number; rotY: number; fabric: THREE.Material } & P) {
  const k = CUSHIONS.loftWingback;
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <B p={[0, 0.16, 0.02]} s={[0.86, 0.26, 0.84]} m={fabric} />
      <B p={[0, k.y, 0.06]} s={[0.66, k.h, 0.7]} m={fabric} />
      <B p={[0, 0.6, -0.34]} s={[0.86, 0.8, 0.18]} m={fabric} />
      <B p={[-0.38, 0.66, -0.2]} s={[0.1, 0.56, 0.34]} m={fabric} />
      <B p={[0.38, 0.66, -0.2]} s={[0.1, 0.56, 0.34]} m={fabric} />
      {/* the arms: a padded side rising from the base with a rolled top */}
      <B p={[-0.39, 0.32, 0.08]} s={[0.12, 0.34, 0.7]} m={fabric} />
      <B p={[0.39, 0.32, 0.08]} s={[0.12, 0.34, 0.7]} m={fabric} />
      <Cyl p={[-0.39, 0.49, 0.08]} s={[0.14, 0.7, 0.14]} r={[Math.PI / 2, 0, 0]} m={fabric} />
      <Cyl p={[0.39, 0.49, 0.08]} s={[0.14, 0.7, 0.14]} r={[Math.PI / 2, 0, 0]} m={fabric} />
      <B p={[0, 0.56, -0.26]} s={[0.6, 0.26, 0.1]} m={c.cream} />
      {[-0.34, 0.34].map((dx) =>
        [-0.32, 0.36].map((dz) => <Cyl key={`${dx}${dz}`} p={[dx, 0.03, dz]} s={[0.07, 0.08, 0.07]} m={c.walnut} />)
      )}
    </group>
  );
}

/** A dining chair: plank seat on a joined apron, four legs, a slatted back. */
function DiningChair({ x, z, rotY, c }: { x: number; z: number; rotY: number } & P) {
  const k = CUSHIONS.loftDining;
  const top = surfaceY(k);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <B p={[0, k.y, 0]} s={[0.5, k.h, 0.5]} m={c.oak} />
      <B p={[0, k.y - 0.06, 0]} s={[0.44, 0.08, 0.44]} m={c.oakLight} />
      {[-0.2, 0.2].map((dx) =>
        [-0.2, 0.2].map((dz) => <B key={`${dx}${dz}`} p={[dx, (k.y - 0.02) / 2, dz]} s={[0.05, k.y - 0.02, 0.05]} m={c.oak} />)
      )}
      <B p={[-0.22, top + 0.22, -0.22]} s={[0.05, 0.46, 0.05]} m={c.oak} />
      <B p={[0.22, top + 0.22, -0.22]} s={[0.05, 0.46, 0.05]} m={c.oak} />
      <B p={[0, top + 0.42, -0.22]} s={[0.5, 0.08, 0.04]} m={c.oak} />
      <B p={[0, top + 0.24, -0.22]} s={[0.36, 0.06, 0.03]} m={c.oak} />
    </group>
  );
}

/** A counter stool: round leather pad on a brass frame with a foot ring. */
function Stool({ x, z, c }: { x: number; z: number } & P) {
  const k = CUSHIONS.loftStool;
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, k.y, 0]} s={[0.42, k.h, 0.42]} m={c.leather} />
      <Cyl p={[0, k.y - k.h / 2 - 0.02, 0]} s={[0.36, 0.04, 0.36]} m={c.brass} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return <Cyl key={i} p={[Math.cos(a) * 0.14, k.y / 2 - 0.03, Math.sin(a) * 0.14]} s={[0.03, k.y - 0.06, 0.03]} r={[Math.sin(a) * -0.08, 0, Math.cos(a) * 0.08]} m={c.brass} />;
      })}
      <mesh geometry={GEO.torus} material={c.brass} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.34, 0.34, 0.5]} raycast={noRaycast} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The left wall: the reading nook, the windows, the chaise
// ---------------------------------------------------------------------------------------

function ReadingNook({ c }: P) {
  const r = READING;
  return (
    <group>
      <PatternedRug x={r.chair.x + 0.5} z={r.chair.z} radius={0.95} y={0.045} outer={c.rugRoseDeep} inner={c.rugRose} />
      <WingChair x={r.chair.x} z={r.chair.z} rotY={Math.PI / 2} fabric={c.plum} c={c} />
      {/* a round side table with a mug and a stack of books; the floor lamp (a prop) stands behind the chair */}
      <Cyl p={[r.sideTable.x, 0.02, r.sideTable.z]} s={[0.4, 0.04, 0.4]} m={c.brass} />
      <Cyl p={[r.sideTable.x, 0.23, r.sideTable.z]} s={[0.06, 0.46, 0.06]} m={c.brass} />
      <Cyl p={[r.sideTable.x, 0.46, r.sideTable.z]} s={[0.56, 0.05, 0.56]} m={c.walnut} />
      <B p={[r.sideTable.x, 0.52, r.sideTable.z + 0.06]} s={[0.26, 0.07, 0.2]} r={[0, 0.3, 0]} m={c.mustard} />
      <B p={[r.sideTable.x, 0.58, r.sideTable.z + 0.06]} s={[0.24, 0.05, 0.18]} r={[0, -0.2, 0]} m={c.plum} />
      <Cyl p={[r.sideTable.x + 0.14, 0.54, r.sideTable.z - 0.14]} s={[0.11, 0.1, 0.11]} m={c.mug} />
    </group>
  );
}

/**
 * A recessed window in a wall. The frame is embedded 0.06 into the wall and stands 0.12 proud
 * of it; the pane sits 0.02 in front of the plaster, a full 0.1 behind the frame's front face,
 * so no two faces ever share a plane (that is where z-fighting comes from).
 * `axis` "x" hangs it on the left wall (spanning z), "z" on the back wall (spanning x).
 */
function RecessedWindow({ axis, a0, a1, y0, y1, c }: { axis: "x" | "z"; a0: number; a1: number; y0: number; y1: number } & P) {
  const face = -INNER;
  const frameDepth = 0.18;
  const frameCentre = face + 0.03;
  const mid = (a0 + a1) / 2;
  const width = a1 - a0;
  const cy = (y0 + y1) / 2;
  const hgt = y1 - y0;
  // a box sized (depth, height, width) placed along the wall's axis
  const along = (depth: number, at: number, y: number, h: number, span: number, spanMid: number, m: THREE.Material) =>
    axis === "x" ? <B p={[at, y, spanMid]} s={[depth, h, span]} m={m} /> : <B p={[spanMid, y, at]} s={[span, h, depth]} m={m} />;
  return (
    <group>
      {along(frameDepth, frameCentre, y0 + 0.04, 0.08, width + 0.16, mid, c.frame)}
      {along(frameDepth, frameCentre, y1 - 0.04, 0.08, width + 0.16, mid, c.frame)}
      {along(frameDepth, frameCentre, cy, hgt, 0.08, a0 - 0.04, c.frame)}
      {along(frameDepth, frameCentre, cy, hgt, 0.08, a1 + 0.04, c.frame)}
      {along(0.02, face + 0.02, cy, hgt - 0.08, width, mid, c.pane)}
      {along(0.04, face + 0.07, cy, hgt - 0.08, 0.06, mid, c.frame)}
      {along(0.04, face + 0.07, cy, 0.06, width, mid, c.frame)}
      {along(0.3, face + 0.14, y0 - 0.02, 0.06, width + 0.3, mid, c.frame)}
    </group>
  );
}

function WindowWall({ c }: P) {
  const face = -INNER;
  return (
    <group>
      {WINDOWS.map((w) => (
        <RecessedWindow key={w.z0} axis="x" a0={w.z0} a1={w.z1} y0={WINDOW_Y.y0} y1={WINDOW_Y.y1} c={c} />
      ))}
      {/* curtains gathered at the ends of the run, hung from a brass pole */}
      <Cyl p={[face + 0.2, WINDOW_Y.y1 + 0.16, (WINDOWS[0].z0 + WINDOWS[2].z1) / 2]} s={[0.04, WINDOWS[2].z1 - WINDOWS[0].z0 + 1.0, 0.04]} r={[Math.PI / 2, 0, 0]} m={c.brass} />
      <B p={[face + 0.2, (WINDOW_Y.y1 + 0.16) / 2 + 0.02, WINDOWS[0].z0 - 0.3]} s={[0.22, WINDOW_Y.y1 + 0.1, 0.36]} m={c.linen} />
      <B p={[face + 0.2, (WINDOW_Y.y1 + 0.16) / 2 + 0.02, WINDOWS[2].z1 + 0.3]} s={[0.22, WINDOW_Y.y1 + 0.1, 0.36]} m={c.linen} />
      {/* the chaise in the window light, and the sunny rug Mochi likes */}
      <Chaise c={c} />
      <PatternedRug x={SUNNY_RUG.x} z={SUNNY_RUG.z} radius={SUNNY_RUG.radius} y={0.07} outer={c.rugWoolDeep} inner={c.rugWool} />
    </group>
  );
}

/** The chaise: a long low seat with a raised head end toward the reading nook, a blanket over its foot. */
function Chaise({ c }: P) {
  const k = CUSHIONS.chaise;
  const { x, z, w, d } = CHAISE;
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.12, 0]} s={[w, 0.2, d]} m={c.mustard} />
      <B p={[0, k.y, 0.1]} s={[w - 0.08, k.h, d - 0.4]} m={c.mustard} />
      {/* the raised head end, at -Z, joined to the base */}
      <B p={[0, 0.38, -d / 2 + 0.2]} s={[w, 0.46, 0.36]} r={[-0.25, 0, 0]} m={c.mustard} />
      <B p={[-w / 2 + 0.06, 0.32, -0.1]} s={[0.12, 0.2, d - 0.6]} m={c.mustard} />
      <B p={[0, surfaceY(k) + 0.1, -d / 2 + 0.5]} s={[0.46, 0.2, 0.32]} r={[-0.3, 0, 0]} m={c.terracotta} />
      <B p={[0, surfaceY(k) + 0.03, d / 2 - 0.45]} s={[w - 0.1, 0.06, 0.7]} m={c.linen} />
      {[-w / 2 + 0.12, w / 2 - 0.12].map((dx) =>
        [-d / 2 + 0.16, d / 2 - 0.16].map((dz) => <Cyl key={`${dx}${dz}`} p={[dx, 0.02, dz]} s={[0.06, 0.05, 0.06]} m={c.walnut} />)
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The kitchen and the bistro table
// ---------------------------------------------------------------------------------------

/** A pendant's cord, dropping from the ceiling plane to the lantern prop (which draws its own short rope). */
function PendantCord({ x, z, propY, c }: { x: number; z: number; propY: number } & P) {
  const top = propY + 0.55;
  return (
    <group>
      <Cyl p={[x, (top + WALL_HEIGHT) / 2, z]} s={[0.02, WALL_HEIGHT - top, 0.02]} m={c.charcoal} />
      <Cyl p={[x, WALL_HEIGHT - 0.02, z]} s={[0.16, 0.04, 0.16]} m={c.brass} />
    </group>
  );
}

function Kitchen({ c }: P) {
  const k = KITCHEN;
  const ct = k.counter;
  const ctW = ct.x1 - ct.x0;
  const ctCx = (ct.x0 + ct.x1) / 2;
  const ctCz = (ct.z0 + ct.z1) / 2;
  const isl = k.island;
  const islW = isl.x1 - isl.x0;
  const islD = isl.z1 - isl.z0;
  const islCx = (isl.x0 + isl.x1) / 2;
  const islCz = (isl.z0 + isl.z1) / 2;
  const fr = k.fridge;
  const upperY0 = 1.5;
  const upperH = 0.6;
  const doors = useMemo<InstanceSpec[]>(() => {
    const out: InstanceSpec[] = [];
    for (let x = ct.x0 + 0.05; x < ct.x1 - 0.55; x += 0.8) out.push({ p: [x + 0.36, ct.height / 2 - 0.02, ct.z1 - 0.02], s: [0.7, ct.height - 0.2, 0.02] });
    // upper cabinets flank the window over the sink
    for (let x = k.window.x1 + 0.2; x < ct.x1 - 0.55; x += 0.8) out.push({ p: [x + 0.36, upperY0 + upperH / 2, ct.z0 + 0.42], s: [0.7, upperH - 0.08, 0.02] });
    for (let x = isl.x0 + 0.05; x < isl.x1 - 0.55; x += 0.85) out.push({ p: [x + 0.4, isl.height / 2 - 0.02, isl.z0 + 0.02], s: [0.76, isl.height - 0.2, 0.02] });
    return out;
  }, [ct.x0, ct.x1, ct.z0, ct.z1, ct.height, isl.x0, isl.x1, isl.z0, isl.height, k.window.x1]);
  const handles = useMemo<InstanceSpec[]>(() => doors.map((d) => ({ p: [d.p[0] + 0.24, d.p[1] + (d.p[1] > 1.2 ? -0.18 : 0.16), d.p[2] + (d.p[2] > -6.0 ? -0.03 : 0.03)], s: [0.03, 0.12, 0.03] })), [doors]);
  return (
    <group>
      {/* --- the counter run on the back wall: cabinets, a stone top, a tiled splashback, a window over the sink --- */}
      <B p={[ctCx, ct.height / 2 - 0.02, ctCz]} s={[ctW, ct.height - 0.04, ct.z1 - ct.z0]} m={c.olive} />
      <B p={[ctCx, 0.05, ctCz - 0.06]} s={[ctW, 0.1, ct.z1 - ct.z0 - 0.12]} m={c.oliveDeep} />
      <B p={[ctCx, ct.height + 0.02, ctCz + 0.02]} s={[ctW + 0.04, 0.05, ct.z1 - ct.z0 + 0.06]} m={c.ceramic} />
      <B p={[ctCx, (ct.height + upperY0) / 2 + 0.02, ct.z0 + 0.03]} s={[ctW, upperY0 - ct.height, 0.04]} m={c.ceramicSage} />
      <RecessedWindow axis="z" a0={k.window.x0} a1={k.window.x1} y0={k.window.y0} y1={k.window.y1} c={c} />
      {/* upper cabinets, right of the window */}
      <B p={[(k.window.x1 + 0.2 + ct.x1) / 2, upperY0 + upperH / 2, ct.z0 + 0.2]} s={[ct.x1 - k.window.x1 - 0.2, upperH, 0.4]} m={c.olive} />
      <B p={[(k.window.x1 + 0.2 + ct.x1) / 2, upperY0 + upperH + 0.03, ct.z0 + 0.22]} s={[ct.x1 - k.window.x1 - 0.18, 0.06, 0.44]} m={c.oliveDeep} />
      {/* open shelves left of the window, with jars and a plant */}
      {[1.5, 1.95].map((y) => (
        <B key={y} p={[(ct.x0 + k.window.x0 - 0.2) / 2, y, ct.z0 + 0.16]} s={[k.window.x0 - 0.2 - ct.x0, 0.04, 0.32]} m={c.walnut} />
      ))}
      <Cyl p={[ct.x0 + 0.2, 1.62, ct.z0 + 0.16]} s={[0.16, 0.2, 0.16]} m={c.ceramic} />
      <Cyl p={[ct.x0 + 0.45, 1.6, ct.z0 + 0.16]} s={[0.14, 0.16, 0.14]} m={c.ceramicSage} />
      <Cyl p={[ct.x0 + 0.3, 2.06, ct.z0 + 0.16]} s={[0.18, 0.18, 0.18]} m={c.terracotta} />
      <Sph p={[ct.x0 + 0.3, 2.22, ct.z0 + 0.16]} s={[0.3, 0.2, 0.3]} m={c.leafLight} />
      <Instanced geo={GEO.box} m={c.oliveDeep} items={doors} />
      <Instanced geo={GEO.box} m={c.brass} items={handles} />
      {/* the sink under the window, its tap; the hob with a kettle on; the espresso machine is a prop */}
      <B p={[k.sinkX, ct.height + 0.03, ctCz + 0.02]} s={[0.8, 0.08, 0.56]} m={c.ceramic} />
      <B p={[k.sinkX, ct.height + 0.06, ctCz + 0.02]} s={[0.7, 0.02, 0.46]} m={c.charcoal} />
      <Cyl p={[k.sinkX, ct.height + 0.18, ct.z0 + 0.22]} s={[0.04, 0.28, 0.04]} m={c.brass} />
      <Cyl p={[k.sinkX, ct.height + 0.3, ct.z0 + 0.34]} s={[0.03, 0.26, 0.03]} r={[Math.PI / 2, 0, 0]} m={c.brass} />
      <B p={[k.hobX, ct.height + 0.05, ctCz]} s={[0.9, 0.03, 0.66]} m={c.charcoal} />
      {[[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.17], [0.2, 0.17]].map(([dx, dz]) => (
        <Cyl key={`${dx}${dz}`} p={[k.hobX + dx, ct.height + 0.07, ctCz + dz]} s={[0.22, 0.01, 0.22]} m={c.stone} />
      ))}
      <Cyl p={[k.hobX - 0.2, ct.height + 0.18, ctCz - 0.15]} s={[0.24, 0.22, 0.24]} m={c.ceramicSage} />
      <Cyl p={[k.hobX, ct.height + 0.28, ctCz - 0.15]} s={[0.03, 0.14, 0.03]} r={[0, 0, -0.9]} m={c.walnut} />
      {/* a chopping board and a bowl of lemons along the top */}
      <B p={[2.5, ct.height + 0.06, ctCz - 0.1]} s={[0.5, 0.03, 0.34]} r={[0, 0.2, 0]} m={c.oak} />
      <Cyl p={[4.2, ct.height + 0.08, ctCz]} s={[0.36, 0.08, 0.36]} m={c.charcoal} />
      {[[-0.06, 0.04], [0.08, -0.02], [0.0, 0.1]].map(([dx, dz]) => (
        <Sph key={`${dx}${dz}`} p={[4.2 + dx, ct.height + 0.16, ctCz + dz]} s={[0.12, 0.1, 0.12]} m={c.lemon} />
      ))}
      {/* the fridge, between the chimney and the counter */}
      <B p={[(fr.x0 + fr.x1) / 2, fr.height / 2, (fr.z0 + fr.z1) / 2]} s={[fr.x1 - fr.x0, fr.height, fr.z1 - fr.z0]} m={c.cream} />
      <B p={[(fr.x0 + fr.x1) / 2, fr.height * 0.66, (fr.z0 + fr.z1) / 2]} s={[fr.x1 - fr.x0 + 0.01, 0.02, fr.z1 - fr.z0 + 0.01]} m={c.brass} />
      <B p={[fr.x0 + 0.12, fr.height * 0.82, fr.z1 + 0.03]} s={[0.04, 0.3, 0.04]} m={c.brass} />
      <B p={[fr.x0 + 0.12, fr.height * 0.42, fr.z1 + 0.03]} s={[0.04, 0.4, 0.04]} m={c.brass} />

      {/* --- the island: a walnut base under a stone top that overhangs the stool side --- */}
      <B p={[islCx, isl.height / 2 - 0.02, islCz - 0.15]} s={[islW, isl.height - 0.04, islD - 0.3]} m={c.walnut} />
      <B p={[islCx, 0.05, islCz - 0.15]} s={[islW - 0.1, 0.1, islD - 0.4]} m={c.charcoal} />
      <B p={[islCx, isl.height + 0.02, islCz]} s={[islW + 0.06, 0.05, islD + 0.06]} m={c.ceramic} />
      {/* a fruit bowl, a board with bread, and two coffees waiting on the island */}
      <Cyl p={[islCx - 0.7, isl.height + 0.08, islCz - 0.1]} s={[0.4, 0.08, 0.4]} m={c.charcoal} />
      {[[-0.08, 0.04], [0.1, -0.04], [0.0, 0.12], [0.02, -0.12]].map(([dx, dz], i) => (
        <Sph key={i} p={[islCx - 0.7 + dx, isl.height + 0.16, islCz - 0.1 + dz]} s={0.12} m={i % 2 ? c.orange : c.lemon} />
      ))}
      <B p={[islCx + 0.5, isl.height + 0.06, islCz - 0.15]} s={[0.56, 0.03, 0.34]} r={[0, -0.25, 0]} m={c.oak} />
      <Sph p={[islCx + 0.5, isl.height + 0.14, islCz - 0.15]} s={[0.32, 0.14, 0.2]} r={[0, -0.25, 0]} m={c.bread} />
      <Cyl p={[islCx + 0.05, isl.height + 0.09, islCz + 0.25]} s={[0.12, 0.1, 0.12]} m={c.mug} />
      <Cyl p={[islCx + 0.05, isl.height + 0.135, islCz + 0.25]} s={[0.1, 0.01, 0.1]} m={c.coffee} />
      <Cyl p={[islCx + 1.0, isl.height + 0.09, islCz + 0.2]} s={[0.12, 0.1, 0.12]} m={c.mug} />
      {/* three stools along the front */}
      {k.stoolXs.map((x) => (
        <Stool key={x} x={x} z={k.stoolZ} c={c} />
      ))}
      {/* the kitchen mat between the counter and the island (Mochi naps on its far end) */}
      <FloorPatch x0={k.mat.x0} x1={k.mat.x1} z0={k.mat.z0} z1={k.mat.z1} y={0.008} m={c.rugWoolDeep} />
      <FloorPatch x0={k.mat.x0 + 0.1} x1={k.mat.x1 - 0.1} z0={k.mat.z0 + 0.1} z1={k.mat.z1 - 0.1} y={0.014} m={c.rugWool} />
      {/* the pendants' cords, from the ceiling plane down to the lanterns */}
      <PendantCord x={islCx} z={islCz} propY={1.85} c={c} />
      <PendantCord x={k.bistro.x} z={k.bistro.z} propY={1.8} c={c} />
    </group>
  );
}

function Bistro({ c }: P) {
  const t = KITCHEN.bistro;
  return (
    <group>
      {/* a round ceramic-topped bistro table on a walnut pedestal */}
      <Cyl p={[t.x, 0.03, t.z]} s={[0.6, 0.06, 0.6]} m={c.walnut} />
      <Cyl p={[t.x, t.height / 2, t.z]} s={[0.08, t.height - 0.06, 0.08]} m={c.walnut} />
      <Cyl p={[t.x, t.height - 0.03, t.z]} s={[t.radius * 2, 0.06, t.radius * 2]} m={c.ceramic} />
      {/* a candle and two cups */}
      <Cyl p={[t.x, t.height + 0.06, t.z]} s={[0.08, 0.12, 0.08]} m={c.ceramicSage} />
      <Sph p={[t.x, t.height + 0.14, t.z]} s={0.03} m={c.wick} />
      <Cyl p={[t.x - 0.22, t.height + 0.05, t.z + 0.16]} s={[0.1, 0.09, 0.1]} m={c.mug} />
      <Cyl p={[t.x + 0.2, t.height + 0.05, t.z - 0.18]} s={[0.1, 0.09, 0.1]} m={c.mug} />
      <DiningChair x={t.x} z={KITCHEN.bistroChairZs.north} rotY={0} c={c} />
      <DiningChair x={t.x} z={KITCHEN.bistroChairZs.south} rotY={Math.PI} c={c} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The lounge corner: a loveseat, an armchair, a side table, a rug
// ---------------------------------------------------------------------------------------

function LoungeCorner({ c }: P) {
  const l = LOUNGE_CORNER;
  const ls = l.loveseat;
  const k = CUSHIONS.loveseat;
  const a = CUSHIONS.loftArmchair;
  const cx = (ls.x0 + ls.x1) / 2;
  const cz = (ls.z0 + ls.z1) / 2;
  const w = ls.x1 - ls.x0;
  const d = ls.z1 - ls.z0;
  return (
    <group>
      <PatternedRug x={l.rug.x} z={l.rug.z} radius={l.rug.radius} y={0.06} sx={1.2} outer={c.rugRoseDeep} inner={c.rugRose} />
      {/* the loveseat: base, two cushions, a back along +Z (it faces -Z, into the room), rolled arms joined to the base */}
      <group>
        <B p={[cx, 0.14, cz]} s={[w, 0.28, d]} m={c.terracottaDeep} />
        {l.loveSeatXs.map((x) => (
          <B key={x} p={[x, k.y, cz - 0.08]} s={[1.08, k.h, d - 0.34]} m={c.terracotta} />
        ))}
        <B p={[cx, 0.36, ls.z1 - 0.1]} s={[w, 0.72, 0.2]} m={c.terracotta} />
        {l.loveSeatXs.map((x) => (
          <B key={x} p={[x, surfaceY(k) + 0.14, ls.z1 - 0.28]} s={[1.02, 0.28, 0.14]} r={[0.12, 0, 0]} m={c.terracottaDeep} />
        ))}
        <B p={[ls.x0 + 0.12, 0.26, cz]} s={[0.24, 0.24, d]} m={c.terracotta} />
        <B p={[ls.x1 - 0.12, 0.26, cz]} s={[0.24, 0.24, d]} m={c.terracotta} />
        <Cyl p={[ls.x0 + 0.12, 0.42, cz]} s={[0.24, d, 0.24]} r={[Math.PI / 2, 0, 0]} m={c.terracotta} />
        <Cyl p={[ls.x1 - 0.12, 0.42, cz]} s={[0.24, d, 0.24]} r={[Math.PI / 2, 0, 0]} m={c.terracotta} />
        <B p={[l.loveSeatXs[1] + 0.28, surfaceY(k) + 0.16, ls.z1 - 0.4]} s={[0.36, 0.32, 0.14]} r={[0.16, 0, -0.1]} m={c.cream} />
        {[ls.x0 + 0.2, ls.x1 - 0.2].map((x) =>
          [ls.z0 + 0.15, ls.z1 - 0.15].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.02, z]} s={[0.07, 0.05, 0.07]} m={c.walnut} />)
        )}
      </group>
      {/* the armchair, turned to face the loveseat (+X): rolled arms rising from the seat base */}
      <group position={[l.armchair.x, 0, l.armchair.z]} rotation={[0, Math.PI / 2, 0]}>
        <B p={[0, 0.14, 0]} s={[0.9, 0.28, 0.9]} m={c.creamDeep} />
        <B p={[0, a.y, 0.06]} s={[0.66, a.h, 0.7]} m={c.cream} />
        <B p={[0, 0.5, -0.36]} s={[0.9, 0.48, 0.18]} m={c.cream} />
        <B p={[-0.38, 0.28, 0.02]} s={[0.22, 0.28, 0.86]} m={c.cream} />
        <B p={[0.38, 0.28, 0.02]} s={[0.22, 0.28, 0.86]} m={c.cream} />
        <Cyl p={[-0.38, 0.42, 0.02]} s={[0.22, 0.86, 0.22]} r={[Math.PI / 2, 0, 0]} m={c.cream} />
        <Cyl p={[0.38, 0.42, 0.02]} s={[0.22, 0.86, 0.22]} r={[Math.PI / 2, 0, 0]} m={c.cream} />
        <B p={[0.1, surfaceY(a) + 0.15, -0.22]} s={[0.34, 0.3, 0.12]} r={[-0.2, 0, 0.1]} m={c.mustard} />
        {[-0.36, 0.36].map((dx) =>
          [-0.36, 0.36].map((dz) => <Cyl key={`${dx}${dz}`} p={[dx, 0.02, dz]} s={[0.07, 0.05, 0.07]} m={c.walnut} />)
        )}
      </group>
      {/* a side table beside the loveseat, under the lamp behind it, with a candle and a book */}
      <Cyl p={[l.sideTable.x, 0.02, l.sideTable.z]} s={[0.4, 0.04, 0.4]} m={c.brass} />
      <Cyl p={[l.sideTable.x, 0.23, l.sideTable.z]} s={[0.06, 0.46, 0.06]} m={c.brass} />
      <Cyl p={[l.sideTable.x, 0.46, l.sideTable.z]} s={[0.52, 0.05, 0.52]} m={c.walnut} />
      <Cyl p={[l.sideTable.x - 0.1, 0.56, l.sideTable.z + 0.08]} s={[0.1, 0.16, 0.1]} m={c.ceramic} />
      <Sph p={[l.sideTable.x - 0.1, 0.66, l.sideTable.z + 0.08]} s={0.035} m={c.wick} />
      <B p={[l.sideTable.x + 0.1, 0.51, l.sideTable.z - 0.1]} s={[0.24, 0.05, 0.18]} r={[0, 0.5, 0]} m={c.plum} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The games table under the last window (the board game prop sits on its top)
// ---------------------------------------------------------------------------------------

function GamesTable({ c }: P) {
  const g = GAMES;
  return (
    <group>
      <PatternedRug x={g.table.x} z={g.table.z} radius={1.5} y={0.05} outer={c.rugMossDeep} inner={c.rugMoss} />
      <Cyl p={[g.table.x, 0.03, g.table.z]} s={[0.66, 0.06, 0.66]} m={c.walnut} />
      <Cyl p={[g.table.x, g.table.height / 2, g.table.z]} s={[0.14, g.table.height - 0.06, 0.14]} m={c.walnut} />
      <Cyl p={[g.table.x, g.table.height - 0.035, g.table.z]} s={[g.table.radius * 2, 0.07, g.table.radius * 2]} m={c.walnut} />
      {/* a mug of pencils and a stack of game boxes on the floor */}
      <Cyl p={[g.table.x + 0.42, g.table.height + 0.07, g.table.z - 0.36]} s={[0.1, 0.14, 0.1]} m={c.mug} />
      <B p={[g.table.x + 0.9, 0.06, g.table.z + 0.9]} s={[0.5, 0.12, 0.36]} m={c.plum} />
      <B p={[g.table.x + 0.9, 0.16, g.table.z + 0.9]} s={[0.44, 0.08, 0.32]} r={[0, 0.15, 0]} m={c.mustard} />
      <B p={[g.table.x + 0.9, 0.24, g.table.z + 0.9]} s={[0.4, 0.08, 0.3]} r={[0, -0.1, 0]} m={c.terracotta} />
      <DiningChair x={g.chairA.x} z={g.chairA.z} rotY={0} c={c} />
      <DiningChair x={g.chairB.x} z={g.chairB.z} rotY={-Math.PI / 2} c={c} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// The record console by the open edge (the turntable prop sits on top)
// ---------------------------------------------------------------------------------------

function RecordConsole({ c }: P) {
  const k = CONSOLE;
  const cx = (k.x0 + k.x1) / 2;
  const cz = (k.z0 + k.z1) / 2;
  const w = k.x1 - k.x0;
  const d = k.z1 - k.z0;
  const records = useMemo<InstanceSpec[]>(() => {
    const rnd = seeded(23);
    const out: InstanceSpec[] = [];
    for (let z = k.z0 + 0.12; z < k.z1 - 0.12; z += 0.045) out.push({ p: [k.x0 + 0.3, 0.3, z], s: [0.3, 0.3, 0.03], r: [0, 0, rnd() < 0.1 ? 0.08 : 0], color: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] });
    return out;
  }, [k.x0, k.z0, k.z1]);
  return (
    <group>
      {/* a mid-century sideboard on brass legs: an open record bay */}
      <B p={[cx, k.height - 0.03, cz]} s={[w, 0.06, d]} m={c.walnut} />
      <B p={[cx, 0.12, cz]} s={[w, 0.04, d]} m={c.walnut} />
      <B p={[k.x1 - 0.02, (k.height + 0.1) / 2, cz]} s={[0.04, k.height - 0.16, d]} m={c.walnut} />
      <B p={[k.x0 + 0.02, (k.height + 0.1) / 2, cz]} s={[0.04, k.height - 0.16, d]} m={c.walnut} />
      <B p={[cx, (k.height + 0.1) / 2, k.z0 + 0.02]} s={[w, k.height - 0.16, 0.04]} m={c.walnut} />
      <B p={[cx, (k.height + 0.1) / 2, k.z1 - 0.02]} s={[w, k.height - 0.16, 0.04]} m={c.walnut} />
      <Instanced geo={GEO.box} m={c.tintable} items={records} />
      {[k.x0 + 0.1, k.x1 - 0.1].map((x) =>
        [k.z0 + 0.1, k.z1 - 0.1].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.05, z]} s={[0.05, 0.1, 0.05]} m={c.brass} />)
      )}
      <B p={[cx, k.height + 0.18, k.z1 - 0.06]} s={[0.32, 0.32, 0.02]} r={[0.12, 0, 0]} m={c.record} />
      <B p={[cx + 0.15, k.height + 0.14, k.z0 + 0.14]} s={[0.22, 0.28, 0.2]} m={c.walnut} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------------------

function Plants({ c }: P) {
  return (
    <group>
      {PLANTS.map((p, i) => {
        if (p.kind === "fig") {
          // a fiddle-leaf fig, tall enough to hide someone, so it fades when it does
          return (
            <Occluder key={i} x={p.x} z={p.z} halfWidth={0.9}>
              <Cyl p={[p.x, 0.25, p.z]} s={[0.6, 0.5, 0.6]} m={c.terracotta} />
              <Cyl p={[p.x, 0.5, p.z]} s={[0.5, 0.02, 0.5]} m={c.soil} />
              <Cyl p={[p.x, 1.1, p.z]} s={[0.06, 1.3, 0.06]} m={c.bark} />
              <Sph p={[p.x, 1.6, p.z]} s={[1.0, 0.9, 1.0]} m={c.leaf} />
              <Sph p={[p.x + 0.3, 2.0, p.z - 0.1]} s={[0.7, 0.6, 0.7]} m={c.leafLight} />
              <Sph p={[p.x - 0.35, 1.3, p.z + 0.25]} s={[0.6, 0.5, 0.6]} m={c.leafLight} />
            </Occluder>
          );
        }
        if (p.kind === "monstera") {
          return (
            <group key={i}>
              <Cyl p={[p.x, 0.22, p.z]} s={[0.56, 0.44, 0.56]} m={c.ceramic} />
              <Cyl p={[p.x, 0.44, p.z]} s={[0.46, 0.02, 0.46]} m={c.soil} />
              {[0, 1, 2, 3, 4].map((j) => {
                const a = (j / 5) * Math.PI * 2;
                return (
                  <group key={j}>
                    <Cyl p={[p.x + Math.cos(a) * 0.12, 0.75, p.z + Math.sin(a) * 0.12]} s={[0.03, 0.6, 0.03]} r={[Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]} m={c.leaf} />
                    <Sph p={[p.x + Math.cos(a) * 0.36, 1.0 + (j % 2) * 0.12, p.z + Math.sin(a) * 0.36]} s={[0.46, 0.08, 0.36]} r={[0, -a, 0.3]} m={c.leaf} />
                  </group>
                );
              })}
            </group>
          );
        }
        // an olive in a terracotta pot
        return (
          <group key={i}>
            <Cyl p={[p.x, 0.24, p.z]} s={[0.56, 0.48, 0.56]} m={c.terracotta} />
            <Cyl p={[p.x, 0.48, p.z]} s={[0.46, 0.02, 0.46]} m={c.soil} />
            <Cyl p={[p.x, 0.85, p.z]} s={[0.07, 0.8, 0.07]} m={c.bark} />
            <Sph p={[p.x, 1.45, p.z]} s={[0.9, 0.7, 0.9]} m={c.oliveLeaf} />
            <Sph p={[p.x + 0.25, 1.7, p.z + 0.1]} s={[0.5, 0.4, 0.5]} m={c.oliveLeaf} />
          </group>
        );
      })}
    </group>
  );
}
