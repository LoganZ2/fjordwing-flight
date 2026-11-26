// FJORDWING — Deterministic Skjold Fjord archipelago heightfield, runway plateau, landmarks & cloud geometry.

import { WORLD, RUNWAY } from './config.js';
import { clamp, smoothstep, createRng } from './math.js';

function hash2(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2D(x, z, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2D(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function ridgedFbm(x, z) {
  let v = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1.0 - Math.abs(noise2D(x * freq, z * freq) * 2.0 - 1.0);
    v += amp * n * n;
    freq *= 2.07;
    amp *= 0.48;
  }
  return v;
}

// Analytical terrain elevation query used by both mesh generation and flight collision/landing physics.
export function getTerrainHeight(x, z) {
  // Sweeping main Skjold Fjord waterway curving gently East-West
  const channelCenter =
    260 * Math.sin(x * 0.00048 - 0.15) +
    115 * Math.sin(x * 0.00115 + 0.6);

  // Near the airstrip bay (X in [-1300, 1700]), widen water channel cleanly around Z = 0
  const bayBlend = smoothstep(-1900, -900, x) * (1 - smoothstep(1350, 2200, x));
  const effCenter = channelCenter * (1 - bayBlend * 0.85);
  const distToChannel = Math.abs(z - effCenter);

  // Channel half-width: ~420m in canyon, ~680m in the Skjold Island bay
  const channelHalfWidth = 390 + bayBlend * 300;
  const wallRise = smoothstep(channelHalfWidth * 0.72, channelHalfWidth * 1.95, distToChannel);

  // Sculpt dramatic glacial alpine peaks along North and South fjord walls
  const ridge = ridgedFbm(x * 0.00058 + 7.3, z * 0.00058 - 4.1);
  const baseRoll = fbm2D(x * 0.00028 - 2.1, z * 0.00028 + 3.4, 4);
  const crag = fbm2D(x * 0.0022 + 12.0, z * 0.0022 - 9.0, 3);

  let h = -26 + wallRise * (290 + ridge * 540 + baseRoll * 220 + (crag - 0.5) * 48);

  // Iconic Jagged Eastern Lofoten Glacier Spire behind Runway 09 (sharp faceted alpine ridges!)
  const ridgeSharp = ridgedFbm(x * 0.00145 + 3.1, z * 0.00145 - 2.7);
  const dSpire = Math.hypot((x - 3250) * 0.78, z - 40);
  if (dSpire < 1550) {
    const s = 1 - smoothstep(40, 1550, dSpire);
    const spireProfile = Math.pow(s, 1.45) * (540 + ridgeSharp * 430);
    h = Math.max(h, -15 + spireProfile);
  }

  // Secondary jagged Nordic twin peaks framing the North-East and South-East skyline
  const dNorthHorn = Math.hypot(x - 2180, z + 1140);
  if (dNorthHorn < 1250) {
    const s = 1 - smoothstep(40, 1250, dNorthHorn);
    h = Math.max(h, -10 + Math.pow(s, 1.4) * (490 + ridgeSharp * 350));
  }
  const dSouthPeak = Math.hypot(x - 1960, z - 1180);
  if (dSouthPeak < 1250) {
    const s = 1 - smoothstep(40, 1250, dSouthPeak);
    h = Math.max(h, -10 + Math.pow(s, 1.4) * (460 + ridgeSharp * 320));
  }

  // Western fjord headlands framing the approach corridor
  const dWestNorth = Math.hypot(x + 1650, z + 1060);
  if (dWestNorth < 1180) {
    const s = 1 - smoothstep(45, 1180, dWestNorth);
    h = Math.max(h, -10 + Math.pow(s, 1.4) * (430 + ridgeSharp * 290));
  }
  const dWestSouth = Math.hypot(x + 1500, z - 1080);
  if (dWestSouth < 1180) {
    const s = 1 - smoothstep(45, 1180, dWestSouth);
    h = Math.max(h, -10 + Math.pow(s, 1.4) * (410 + ridgeSharp * 270));
  }

  // Scenic outer island skerries in the western fjord bay
  const dSkerry1 = Math.hypot(x + 980, z - 360);
  if (dSkerry1 < 230) {
    const s = 1 - smoothstep(45, 230, dSkerry1);
    h = Math.max(h, -12 + s * (68 + crag * 18));
  }
  const dSkerry2 = Math.hypot(x + 1320, z + 420);
  if (dSkerry2 < 260) {
    const s = 1 - smoothstep(50, 260, dSkerry2);
    h = Math.max(h, -12 + s * (88 + crag * 22));
  }

  // Sculpt Skjold Island Airstrip plateau cleanly at RUNWAY.ELEVATION (14.0m) with organic rocky coastline
  const coastJitter = (fbm2D(x * 0.008 + 5.2, z * 0.008 - 3.1, 3) - 0.5) * 52;
  const dx = Math.max(RUNWAY.START_X - 85 - x, 0, x - (RUNWAY.END_X + 125));
  const dz = Math.max(-118 - z, 0, z - 98);
  const islandDist = Math.hypot(dx, dz) + coastJitter;
  if (islandDist < 195) {
    const plateauMask = 1 - smoothstep(24, 195, islandDist);
    // Keep lighthouse headland rocky at east end
    const dLight = Math.hypot(x - RUNWAY.LIGHTHOUSE_X, z - RUNWAY.LIGHTHOUSE_Z);
    const headlandBoost = (1 - smoothstep(15, 78, dLight)) * 11.5;
    const targetH = RUNWAY.ELEVATION + headlandBoost;
    h = h * (1 - plateauMask) + targetH * plateauMask;
  }

  // Guarantee completely level runway strip & apron safety zone
  if (x >= RUNWAY.START_X - 65 && x <= RUNWAY.END_X + 65 && z >= -105 && z <= 68) {
    const padBlend =
      smoothstep(RUNWAY.START_X - 65, RUNWAY.START_X - 25, x) *
      (1 - smoothstep(RUNWAY.END_X + 25, RUNWAY.END_X + 65, x)) *
      smoothstep(-105, -75, z) *
      (1 - smoothstep(42, 68, z));
    h = h * (1 - padBlend) + RUNWAY.ELEVATION * padBlend;
  }

  return h;
}

export function isOnRunway(x, z) {
  return (
    x >= RUNWAY.START_X - 8 &&
    x <= RUNWAY.END_X + 8 &&
    Math.abs(z - RUNWAY.CENTER_Z) <= RUNWAY.WIDTH * 0.52
  );
}

// Build indexed terrain triangle mesh with analytical central-difference normals
export function buildTerrainMesh() {
  const N = WORLD.GRID_N;
  const size = WORLD.SIZE;
  const half = WORLD.HALF;
  const step = size / N;
  const vertsPerSide = N + 1;
  const positions = new Float32Array(vertsPerSide * vertsPerSide * 6); // pos(3) + normal(3)

  let ptr = 0;
  const eps = step * 0.5;
  for (let iz = 0; iz <= N; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix <= N; ix++) {
      const x = -half + ix * step;
      const y = getTerrainHeight(x, z);
      const hx = getTerrainHeight(x + eps, z) - getTerrainHeight(x - eps, z);
      const hz = getTerrainHeight(x, z + eps) - getTerrainHeight(x, z - eps);
      let nx = -hx;
      let ny = 2 * eps;
      let nz = -hz;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = z;
      positions[ptr++] = nx;
      positions[ptr++] = ny;
      positions[ptr++] = nz;
    }
  }

  const indices = new Uint32Array(N * N * 6);
  let iptr = 0;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * vertsPerSide + ix;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices[iptr++] = a;
      indices[iptr++] = c;
      indices[iptr++] = b;
      indices[iptr++] = b;
      indices[iptr++] = c;
      indices[iptr++] = d;
    }
  }

  return { vertices: positions, indices };
}

// Build wide fjord ocean plane
export function buildWaterMesh() {
  const S = 18000;
  const y = WORLD.WATER_LEVEL;
  const vertices = new Float32Array([
    -S, y, -S,
    -S, y, S,
    S, y, S,
    -S, y, -S,
    S, y, S,
    S, y, -S,
  ]);
  return { vertices, count: 6 };
}

// Build painted Runway 09/27 deck quad slightly above island plateau
export function buildRunwayMesh() {
  const x0 = RUNWAY.START_X;
  const x1 = RUNWAY.END_X;
  const hw = RUNWAY.WIDTH * 0.5;
  const y = RUNWAY.SURFACE_Y;
  // pos(3) + uv(2) where u in [0,1], v in [-1,1]
  const vertices = new Float32Array([
    x0, y, -hw, 0, -1,
    x0, y, hw, 0, 1,
    x1, y, hw, 1, 1,
    x0, y, -hw, 0, -1,
    x1, y, hw, 1, 1,
    x1, y, -hw, 1, -1,
  ]);
  return { vertices, count: 6 };
}

// Helper for colored box geometry (pos 3 + normal 3 + rgba 4)
function pushBox(out, cx, cy, cz, sx, sy, sz, r, g, b, mat = 0.45) {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const faces = [
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ];
  const idx = [0, 1, 2, 0, 2, 3];
  for (const f of faces) {
    for (const k of idx) {
      const p = f.v[k];
      out.push(cx + p[0], cy + p[1], cz + p[2], f.n[0], f.n[1], f.n[2], r, g, b, mat);
    }
  }
}

function pushCylinder(out, cx, y0, cz, rBot, rTop, height, segs, r, g, b, mat = 0.45) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [cx + c0 * rBot, y0, cz + s0 * rBot];
    const p1 = [cx + c1 * rBot, y0, cz + s1 * rBot];
    const p2 = [cx + c1 * rTop, y0 + height, cz + s1 * rTop];
    const p3 = [cx + c0 * rTop, y0 + height, cz + s0 * rTop];
    const n0 = [c0, 0.12, s0];
    const n1 = [c1, 0.12, s1];

    out.push(
      p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], r, g, b, mat,
      p2[0], p2[1], p2[2], n1[0], n1[1], n1[2], r, g, b, mat,
      p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], r, g, b, mat,

      p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], r, g, b, mat,
      p3[0], p3[1], p3[2], n0[0], n0[1], n0[2], r, g, b, mat,
      p2[0], p2[1], p2[2], n1[0], n1[1], n1[2], r, g, b, mat,
    );
  }
}

// Build Skjold Airstrip landmarks: Hangars, Control Tower, Apron, Coastal Lighthouse, Pine Trees & Approach Stakes
export function buildLandmarksMesh() {
  const out = [];
  const y = RUNWAY.ELEVATION;

  // Taxiway & concrete hangar apron North of Runway 09
  pushBox(out, 470, y + 0.18, -60, 310, 0.36, 48, 0.25, 0.27, 0.30, 0.35);
  pushBox(out, 270, y + 0.18, -36, 22, 0.36, 24, 0.23, 0.25, 0.28, 0.35);
  pushBox(out, 660, y + 0.18, -36, 22, 0.36, 24, 0.23, 0.25, 0.28, 0.35);

  // Twin Nordic Aviation Hangars (slate walls, crimson-red pitched roofs, open hangar doors)
  for (const hx of [355, 430]) {
    pushBox(out, hx, y + 7.5, -80, 44, 15, 30, 0.72, 0.75, 0.78, 0.45);
    pushBox(out, hx, y + 16.5, -80, 47, 3.2, 33, 0.68, 0.18, 0.14, 0.40);
    // Dark recessed hangar bay door facing the runway
    pushBox(out, hx, y + 5.8, -64.6, 28, 11.2, 1.0, 0.09, 0.12, 0.16, 0.6);
    // Warm hangar interior strip glow
    pushBox(out, hx, y + 11.0, -64.0, 26, 0.8, 0.5, 1.0, 0.82, 0.45, 0.05);
  }

  // Air Traffic Control Tower (tall concrete shaft + panoramic tinted glass cab + radar dome)
  const tx = RUNWAY.TOWER_X;
  const tz = RUNWAY.TOWER_Z;
  pushBox(out, tx, y + 12, tz, 11, 24, 11, 0.78, 0.80, 0.83, 0.4);
  pushBox(out, tx, y + 25.5, tz, 16, 3.2, 16, 0.22, 0.27, 0.34, 0.5);
  // Tinted glass observation cab (glossy)
  pushBox(out, tx, y + 29.8, tz, 15.2, 5.4, 15.2, 0.10, 0.32, 0.42, 0.92);
  // Illuminated green ATC interior band
  pushBox(out, tx, y + 28.2, tz, 15.4, 0.7, 15.4, 0.25, 0.95, 0.65, 0.05);
  // Roof cap & red aviation obstruction beacon
  pushBox(out, tx, y + 33.4, tz, 17.5, 1.8, 17.5, 0.76, 0.20, 0.16, 0.42);
  pushCylinder(out, tx, y + 34.3, tz, 0.5, 0.35, 7.5, 8, 0.85, 0.87, 0.90, 0.5);
  pushBox(out, tx, y + 42.2, tz, 1.8, 1.8, 1.8, 1.0, 0.18, 0.15, 0.05);

  // Fuel Depot Tanks (white/amber aviation fuel silos East of tower)
  for (const fx of [580, 606]) {
    pushCylinder(out, fx, y, -82, 7.5, 7.5, 11.5, 12, 0.88, 0.90, 0.92, 0.5);
    pushCylinder(out, fx, y + 5.0, -82, 7.65, 7.65, 1.8, 12, 0.92, 0.56, 0.10, 0.45);
  }

  // Coastal Stone Lighthouse on the Eastern Headland (iconic red/white Nordic bands + glowing lantern)
  const lx = RUNWAY.LIGHTHOUSE_X;
  const lz = RUNWAY.LIGHTHOUSE_Z;
  const ly = getTerrainHeight(lx, lz) - 1.5;
  pushCylinder(out, lx, ly, lz, 7.5, 6.2, 12, 12, 0.92, 0.92, 0.90, 0.42);
  pushCylinder(out, lx, ly + 12, lz, 6.2, 5.1, 10, 12, 0.78, 0.16, 0.13, 0.42);
  pushCylinder(out, lx, ly + 22, lz, 5.1, 4.2, 9, 12, 0.92, 0.92, 0.90, 0.42);
  pushCylinder(out, lx, ly + 31, lz, 4.9, 4.9, 1.8, 12, 0.18, 0.20, 0.24, 0.5);
  // Glowing golden lighthouse beacon lantern
  pushCylinder(out, lx, ly + 32.8, lz, 3.6, 3.6, 5.0, 12, 1.0, 0.88, 0.48, 0.05);
  pushCylinder(out, lx, ly + 37.8, lz, 4.6, 0.4, 4.5, 12, 0.74, 0.15, 0.12, 0.45);

  // Approach Lead-in Light Towers West of Runway 09 threshold (standing on sea pilings!)
  for (let i = 1; i <= 4; i++) {
    const ax = RUNWAY.START_X - i * 85;
    const ay = RUNWAY.ELEVATION - 1.5 - i * 1.6;
    pushBox(out, ax, ay * 0.5, 0, 1.4, ay + 12, 1.4, 0.35, 0.38, 0.42, 0.4);
    pushBox(out, ax, ay + 0.5, 0, 1.8, 1.2, 18, 0.82, 0.84, 0.86, 0.45);
    for (const lzOff of [-7, -3.5, 0, 3.5, 7]) {
      pushBox(out, ax - 0.6, ay + 1.4, lzOff, 1.4, 1.4, 1.4, 1.0, 0.96, 0.78, 0.05);
    }
  }

  // PAPI glideslope mounting plinth (dark metallic bar so 2-WHITE / 2-RED lamps stand out crisply!)
  pushBox(out, RUNWAY.PAPI_X, y + 0.9, RUNWAY.PAPI_Z - 12.75, 4.2, 1.8, 32.0, 0.12, 0.14, 0.18, 0.45);

  // Stylized Nordic Spruce Pine Clusters along the airstrip perimeter & coastal ridges
  const rng = createRng(409);
  for (let i = 0; i < 95; i++) {
    const px = -90 + rng() * 1300;
    const pz = rng() < 0.5 ? (48 + rng() * 68) : (-105 - rng() * 48);
    if (Math.abs(px - tx) < 40 && Math.abs(pz - tz) < 35) continue;
    if (px > 315 && px < 480 && pz < -52) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 4.5) continue;
    const scale = 0.8 + rng() * 0.75;
    pushCylinder(out, px, py - 0.5, pz, 0.7 * scale, 0.4 * scale, 4.0 * scale, 6, 0.24, 0.16, 0.10, 0.4);
    pushCylinder(out, px, py + 2.8 * scale, pz, 4.4 * scale, 0.4 * scale, 10.5 * scale, 7, 0.06, 0.18, 0.10, 0.35);
    pushCylinder(out, px, py + 8.5 * scale, pz, 3.1 * scale, 0.2 * scale, 8.2 * scale, 7, 0.08, 0.22, 0.13, 0.35);
  }

  return { vertices: new Float32Array(out), count: out.length / 10 };
}

// Build sunlit 3D volumetric cloud clusters floating majestically over the fjord peaks
export function buildCloudsMesh(seed = 7) {
  const rng = createRng(seed);
  const out = [];

  // Push soft icosphere-like multi-faceted puff
  function pushPuff(cx, cy, cz, rx, ry, rz) {
    const stacks = 5;
    const slices = 8;
    for (let i = 0; i < stacks; i++) {
      const phi0 = (i / stacks) * Math.PI;
      const phi1 = ((i + 1) / stacks) * Math.PI;
      for (let j = 0; j < slices; j++) {
        const th0 = (j / slices) * Math.PI * 2;
        const th1 = ((j + 1) / slices) * Math.PI * 2;

        const pts = [
          [Math.sin(phi0) * Math.cos(th0), Math.cos(phi0), Math.sin(phi0) * Math.sin(th0)],
          [Math.sin(phi1) * Math.cos(th0), Math.cos(phi1), Math.sin(phi1) * Math.sin(th0)],
          [Math.sin(phi1) * Math.cos(th1), Math.cos(phi1), Math.sin(phi1) * Math.sin(th1)],
          [Math.sin(phi0) * Math.cos(th1), Math.cos(phi0), Math.sin(phi0) * Math.sin(th1)],
        ];
        const tris = [0, 1, 2, 0, 2, 3];
        for (const k of tris) {
          const n = pts[k];
          // Warm sunlit tops, soft lavender-slate cloud bellies
          const shade = clamp(n[1] * 0.5 + 0.55, 0.25, 1.0);
          const r = 0.72 + 0.28 * shade;
          const g = 0.68 + 0.26 * shade;
          const b = 0.72 + 0.20 * shade;
          out.push(
            cx + n[0] * rx, cy + n[1] * ry, cz + n[2] * rz,
            n[0], n[1] * 0.9 + 0.25, n[2],
            r, g, b, 0.35
          );
        }
      }
    }
  }

  // Hand-placed dramatic banks + procedural fjord cumulus clusters
  const anchors = [
    [2450, 680, -720, 1.3],
    [3250, 790, 520, 1.5],
    [1550, 620, 1080, 1.1],
    [980, 740, -1350, 1.2],
    [-850, 690, -1120, 1.25],
    [-1250, 640, 1020, 1.15],
    [2800, 880, -1650, 1.4],
    [420, 760, 1650, 1.3],
    [-2100, 710, -450, 1.2],
    [3800, 740, -280, 1.35],
    [-420, 810, -2100, 1.4],
    [1820, 640, -1720, 1.2],
  ];

  for (const [bx, by, bz, sc] of anchors) {
    const puffs = 4 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const ox = (rng() - 0.5) * 260 * sc;
      const oy = (rng() - 0.35) * 42 * sc;
      const oz = (rng() - 0.5) * 210 * sc;
      const rx = (95 + rng() * 90) * sc;
      const ry = (28 + rng() * 26) * sc;
      const rz = (80 + rng() * 80) * sc;
      pushPuff(bx + ox, by + oy, bz + oz, rx, ry, rz);
    }
  }

  return { vertices: new Float32Array(out), count: out.length / 10 };
}
