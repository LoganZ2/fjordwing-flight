// FJORDWING — Deterministic Skjold Fjord archipelago heightfield, GPU heightmap/AO bake,
// rocky island landmarks, Nordic coastal village, lighthouse beam & volumetric cloud billboard puffs.

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

function ridgedFbm(x, z, octaves = 5) {
  let v = 0;
  let amp = 0.54;
  let freq = 1;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    let n = 1.0 - Math.abs(noise2D(x * freq, z * freq) * 2.0 - 1.0);
    n = n * n * weight;
    weight = clamp(n * 1.85, 0.25, 1.0);
    v += amp * n;
    freq *= 2.08;
    amp *= 0.48;
  }
  return v;
}

// Analytical terrain elevation query used by mesh generation, GPU heightmap bake, and flight physics.
export function getTerrainHeight(x, z) {
  // Sweeping main Skjold Fjord waterway curving gently East-West
  const channelCenter =
    260 * Math.sin(x * 0.00048 - 0.15) +
    115 * Math.sin(x * 0.00115 + 0.6);

  // Near the airstrip bay (X in [-1300, 1700]), widen water channel cleanly around Z = 0
  const bayBlend = smoothstep(-1900, -900, x) * (1 - smoothstep(1350, 2200, x));
  const effCenter = channelCenter * (1 - bayBlend * 0.85);
  const distToChannel = Math.abs(z - effCenter);

  // Channel half-width: ~395m in canyon, ~685m in the Skjold Island bay
  const channelHalfWidth = 395 + bayBlend * 290;
  const wallRise = smoothstep(channelHalfWidth * 0.68, channelHalfWidth * 1.88, distToChannel);

  // Sculpt dramatic Lofoten-style jagged glacial alpine peaks & steep granite fjord walls
  const ridge = ridgedFbm(x * 0.00056 + 7.3, z * 0.00056 - 4.1, 5);
  const ridgeFine = ridgedFbm(x * 0.00165 - 5.2, z * 0.00165 + 8.4, 4);
  const baseRoll = fbm2D(x * 0.00028 - 2.1, z * 0.00028 + 3.4, 4);
  const crag = fbm2D(x * 0.0028 + 12.0, z * 0.0028 - 9.0, 3);

  // Steeper cliff shoulders emerging from the water for authentic Norwegian fjord walls
  const fjordWall = Math.pow(wallRise, 0.86);
  let h = -28 + fjordWall * (300 + ridge * 580 + ridgeFine * 115 + baseRoll * 195 + (crag - 0.5) * 56);

  // Iconic Jagged Eastern Lofoten Glacier Spire behind Runway 09 (razor-crested arêtes!)
  const ridgeSharp = ridgedFbm(x * 0.0015 + 3.1, z * 0.0015 - 2.7, 5);
  const dSpire = Math.hypot((x - 3220) * 0.76, z - 35);
  if (dSpire < 1620) {
    const s = 1 - smoothstep(35, 1620, dSpire);
    const spireProfile = Math.pow(s, 1.38) * (570 + ridgeSharp * 470);
    h = Math.max(h, -15 + spireProfile);
  }

  // Secondary jagged Nordic twin peaks framing the North-East and South-East skyline
  const dNorthHorn = Math.hypot(x - 2160, z + 1120);
  if (dNorthHorn < 1300) {
    const s = 1 - smoothstep(35, 1300, dNorthHorn);
    h = Math.max(h, -12 + Math.pow(s, 1.35) * (520 + ridgeSharp * 390));
  }
  const dSouthPeak = Math.hypot(x - 1960, z - 1160);
  if (dSouthPeak < 1300) {
    const s = 1 - smoothstep(35, 1300, dSouthPeak);
    h = Math.max(h, -12 + Math.pow(s, 1.35) * (485 + ridgeSharp * 355));
  }

  // Dramatic Western fjord headlands framing the approach corridor & wingman canyon shot
  const dWestNorth = Math.hypot(x + 1580, z + 1020);
  if (dWestNorth < 1220) {
    const s = 1 - smoothstep(40, 1220, dWestNorth);
    h = Math.max(h, -12 + Math.pow(s, 1.32) * (470 + ridgeSharp * 330));
  }
  const dWestSouth = Math.hypot(x + 1480, z - 1040);
  if (dWestSouth < 1220) {
    const s = 1 - smoothstep(40, 1220, dWestSouth);
    h = Math.max(h, -12 + Math.pow(s, 1.32) * (445 + ridgeSharp * 310));
  }

  // Scenic outer rocky skerries & granite islets in the western & eastern fjord bays
  const skerries = [
    [-980, 360, 235, 76],
    [-1340, -410, 270, 96],
    [-420, -490, 175, 58],
    [1620, -340, 220, 82],
    [1540, 460, 240, 92],
  ];
  for (const [sx, sz, sRad, sPeak] of skerries) {
    const dS = Math.hypot(x - sx, z - sz);
    if (dS < sRad) {
      const s = 1 - smoothstep(sRad * 0.18, sRad, dS);
      h = Math.max(h, -14 + Math.pow(s, 1.15) * (sPeak + ridgeFine * 34));
    }
  }

  // Sculpt Skjold Island Airstrip plateau cleanly at RUNWAY.ELEVATION (14.0m) with rugged coastal sea cliffs
  const coastJitter = (fbm2D(x * 0.0095 + 5.2, z * 0.0095 - 3.1, 3) - 0.5) * 62;
  const dx = Math.max(RUNWAY.START_X - 88 - x, 0, x - (RUNWAY.END_X + 135));
  const dz = Math.max(-124 - z, 0, z - 106);
  const islandDist = Math.hypot(dx, dz) + coastJitter;
  if (islandDist < 195) {
    // Steeper rocky cliff lip transitioning from ocean floor up to runway plateau
    const plateauMask = 1 - smoothstep(18, 178, islandDist);
    const rockyRim = smoothstep(55, 130, islandDist) * (1 - smoothstep(130, 178, islandDist)) * (crag - 0.45) * 14.0;
    const dLight = Math.hypot(x - RUNWAY.LIGHTHOUSE_X, z - RUNWAY.LIGHTHOUSE_Z);
    const headlandBoost = (1 - smoothstep(14, 86, dLight)) * 13.5;
    const targetH = RUNWAY.ELEVATION + headlandBoost + rockyRim;
    h = h * (1 - plateauMask) + targetH * plateauMask;
  }

  // Guarantee completely level runway strip & apron safety zone
  if (x >= RUNWAY.START_X - 65 && x <= RUNWAY.END_X + 65 && z >= -108 && z <= 70) {
    const padBlend =
      smoothstep(RUNWAY.START_X - 65, RUNWAY.START_X - 24, x) *
      (1 - smoothstep(RUNWAY.END_X + 24, RUNWAY.END_X + 65, x)) *
      smoothstep(-108, -74, z) *
      (1 - smoothstep(42, 70, z));
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

// Bake a 512x512 GPU heightmap + valley ambient occlusion texture (RGBA8) once at startup.
// R,G = 16-bit normalized height in [HEIGHT_MIN, HEIGHT_MAX]; B = ridge/valley AO; A = coastal depth mask.
export function buildHeightmapTextureData() {
  const S = WORLD.HEIGHTMAP_SIZE;
  const half = WORLD.HALF;
  const size = WORLD.SIZE;
  const hMin = WORLD.HEIGHT_MIN;
  const hSpan = WORLD.HEIGHT_MAX - WORLD.HEIGHT_MIN;
  const heights = new Float32Array(S * S);

  for (let iz = 0; iz < S; iz++) {
    const z = -half + (iz / (S - 1)) * size;
    for (let ix = 0; ix < S; ix++) {
      const x = -half + (ix / (S - 1)) * size;
      heights[iz * S + ix] = getTerrainHeight(x, z);
    }
  }

  const data = new Uint8Array(S * S * 4);
  const dirs = [
    [3, 0], [-3, 0], [0, 3], [0, -3],
    [6, 6], [-6, 6], [6, -6], [-6, -6],
  ];

  for (let iz = 0; iz < S; iz++) {
    for (let ix = 0; ix < S; ix++) {
      const idx = iz * S + ix;
      const h = heights[idx];
      // R: full-range monotonic height [-40..+1060] for linear-filtered shadows & reflections
      // G: high-precision coastal depth [-30..+30m] for artifact-free shoreline bathymetry & surf foam!
      const normFull = clamp((h - hMin) / hSpan, 0, 1);
      const normCoast = clamp((h + 30) / 60, 0, 1);

      // Estimate horizon-occlusion / cavity AO by comparing against surrounding neighborhood
      let occ = 0;
      for (const [dx, dz] of dirs) {
        const sx = clamp(ix + dx, 0, S - 1);
        const sz = clamp(iz + dz, 0, S - 1);
        const dh = heights[sz * S + sx] - h;
        occ += clamp(dh / 140, 0, 1);
      }
      const ao = clamp(1.0 - (occ / dirs.length) * 0.92, 0.25, 1.0);
      const landMask = smoothstep(-8, 12, h);

      const base = idx * 4;
      data[base] = Math.round(normFull * 255);
      data[base + 1] = Math.round(normCoast * 255);
      data[base + 2] = Math.round(ao * 255);
      data[base + 3] = Math.round(landMask * 255);
    }
  }

  return { width: S, height: S, data };
}

// Build high-resolution indexed terrain triangle mesh with analytical central-difference normals
export function buildTerrainMesh() {
  const N = WORLD.GRID_N;
  const size = WORLD.SIZE;
  const half = WORLD.HALF;
  const step = size / N;
  const vertsPerSide = N + 1;
  const positions = new Float32Array(vertsPerSide * vertsPerSide * 6); // pos(3) + normal(3)

  let ptr = 0;
  const eps = step * 0.48;
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

// Geometry helpers for detailed Skjold Airstrip & Nordic Village landmarks (pos 3 + normal 3 + rgba 4)
function pushTri(out, a, b, c, r, g, bCol, mat = 0.45) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  out.push(
    a[0], a[1], a[2], nx, ny, nz, r, g, bCol, mat,
    b[0], b[1], b[2], nx, ny, nz, r, g, bCol, mat,
    c[0], c[1], c[2], nx, ny, nz, r, g, bCol, mat,
  );
}

function pushQuad(out, a, b, c, d, r, g, bCol, mat = 0.45) {
  pushTri(out, a, b, c, r, g, bCol, mat);
  pushTri(out, a, c, d, r, g, bCol, mat);
}

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

function pushPitchedRoof(out, cx, baseY, cz, sx, sy, sz, r, g, b, mat = 0.42) {
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const topY = baseY + sy;
  // Ridge running along X axis
  const fl = [cx - hx, baseY, cz + hz];
  const fr = [cx + hx, baseY, cz + hz];
  const bl = [cx - hx, baseY, cz - hz];
  const br = [cx + hx, baseY, cz - hz];
  const rl = [cx - hx, topY, cz];
  const rr = [cx + hx, topY, cz];

  pushQuad(out, fl, fr, rr, rl, r, g, b, mat);
  pushQuad(out, br, bl, rl, rr, r * 0.92, g * 0.92, b * 0.92, mat);
  pushTri(out, bl, fl, rl, r * 0.8, g * 0.8, b * 0.8, mat);
  pushTri(out, fr, br, rr, r * 0.8, g * 0.8, b * 0.8, mat);
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
    const ny = (rBot - rTop) / Math.max(height, 0.1) * 0.4;
    const l0 = Math.hypot(c0, ny, s0) || 1;
    const l1 = Math.hypot(c1, ny, s1) || 1;
    const n0 = [c0 / l0, ny / l0, s0 / l0];
    const n1 = [c1 / l1, ny / l1, s1 / l1];

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

function pushPineTree(out, px, py, pz, scale, tintVar) {
  // Bark trunk
  pushCylinder(out, px, py - 0.6, pz, 0.65 * scale, 0.35 * scale, 4.4 * scale, 6, 0.22, 0.14, 0.09, 0.38);
  // 3 layered Nordic spruce boughs with subtle color depth
  const gBase = 0.15 + tintVar * 0.05;
  const rBase = 0.04 + tintVar * 0.02;
  const bBase = 0.07 + tintVar * 0.03;
  pushCylinder(out, px, py + 2.4 * scale, pz, 4.9 * scale, 1.1 * scale, 8.2 * scale, 7, rBase, gBase, bBase, 0.34);
  pushCylinder(out, px, py + 7.2 * scale, pz, 3.8 * scale, 0.8 * scale, 7.6 * scale, 7, rBase + 0.015, gBase + 0.035, bBase + 0.015, 0.34);
  pushCylinder(out, px, py + 11.8 * scale, pz, 2.5 * scale, 0.15 * scale, 6.4 * scale, 7, rBase + 0.03, gBase + 0.06, bBase + 0.025, 0.35);
}

// Build Skjold Airstrip landmarks: Hangars, ATC Tower, Nordic Rorbuer Village, Coastal Lighthouse, Pines & Approach Lights
export function buildLandmarksMesh() {
  const out = [];
  const y = RUNWAY.ELEVATION;

  // 1. Concrete hangar apron, connecting taxiways & yellow taxiway center stripes
  pushBox(out, 470, y + 0.16, -62, 340, 0.32, 52, 0.22, 0.24, 0.27, 0.38);
  pushBox(out, 270, y + 0.16, -36, 22, 0.32, 26, 0.20, 0.22, 0.25, 0.38);
  pushBox(out, 660, y + 0.16, -36, 22, 0.32, 26, 0.20, 0.22, 0.25, 0.38);
  pushBox(out, 470, y + 0.34, -48, 300, 0.06, 0.9, 0.94, 0.72, 0.14, 0.42);

  // 2. Twin Sculpted Nordic Aviation Hangars (weathered steel walls, pitched crimson Nordic roofs, glowing bays)
  for (const hx of [348, 428]) {
    pushBox(out, hx, y + 7.4, -82, 48, 14.8, 32, 0.72, 0.75, 0.79, 0.48);
    pushPitchedRoof(out, hx, y + 14.8, -82, 52, 6.8, 36, 0.66, 0.16, 0.12, 0.42);
    // Dark recessed hangar bay door facing Runway 09
    pushBox(out, hx, y + 5.8, -65.6, 30, 11.4, 1.2, 0.06, 0.09, 0.14, 0.62);
    // Warm illuminated hangar interior ceiling & amber floodlight strip
    pushBox(out, hx, y + 11.2, -65.0, 28, 1.0, 0.6, 1.0, 0.80, 0.40, 0.05);
    pushBox(out, hx - 18, y + 9.5, -65.6, 4.2, 2.2, 0.4, 0.95, 0.84, 0.52, 0.06);
    pushBox(out, hx + 18, y + 9.5, -65.6, 4.2, 2.2, 0.4, 0.95, 0.84, 0.52, 0.06);
  }

  // 3. Detailed Air Traffic Control Tower (flared concrete shaft, catwalk, canted panoramic glass cab, radar dome)
  const tx = RUNWAY.TOWER_X;
  const tz = RUNWAY.TOWER_Z;
  pushCylinder(out, tx, y, tz, 7.6, 5.8, 24.5, 8, 0.76, 0.79, 0.82, 0.44);
  pushCylinder(out, tx, y + 24.5, tz, 6.2, 9.6, 3.0, 8, 0.20, 0.25, 0.32, 0.52);
  // Panoramic canted tinted glass cab (glossy reflective)
  pushCylinder(out, tx, y + 27.5, tz, 8.8, 9.8, 5.8, 8, 0.08, 0.28, 0.38, 0.94);
  // Illuminated emerald ATC console interior band visible through glass
  pushCylinder(out, tx, y + 28.4, tz, 8.95, 9.05, 0.9, 8, 0.25, 1.0, 0.68, 0.05);
  // Overhanging crimson-trimmed roof cap & radome + obstruction beacon
  pushCylinder(out, tx, y + 33.3, tz, 10.6, 9.8, 1.8, 8, 0.72, 0.18, 0.14, 0.45);
  pushCylinder(out, tx, y + 35.1, tz, 3.2, 2.4, 3.2, 10, 0.92, 0.94, 0.96, 0.55);
  pushCylinder(out, tx, y + 35.1, tz + 4.0, 0.35, 0.25, 8.5, 8, 0.85, 0.87, 0.90, 0.55);
  pushBox(out, tx, y + 44.0, tz + 4.0, 1.9, 1.9, 1.9, 1.0, 0.14, 0.12, 0.05);

  // 4. Aviation Fuel Depot Tanks East of Tower
  for (const fx of [578, 606, 634]) {
    pushCylinder(out, fx, y, -82, 7.4, 7.4, 12.0, 14, 0.88, 0.90, 0.92, 0.55);
    pushCylinder(out, fx, y + 5.2, -82, 7.55, 7.55, 1.8, 14, 0.94, 0.54, 0.08, 0.48);
    pushCylinder(out, fx, y + 12.0, -82, 7.4, 0.5, 2.0, 14, 0.82, 0.85, 0.88, 0.55);
  }

  // 5. Picturesque Nordic Rorbuer Fishing Village & Timber Pier along the South Cove (clearly visible on approach!)
  const cabins = [
    [320, 82, 18, 9.2, 13, [0.68, 0.14, 0.11]],  // Falu red boathouse near approach
    [354, 86, 17, 8.8, 12, [0.80, 0.52, 0.14]],  // Warm Nordic ochre cabin
    [388, 84, 20, 9.8, 14, [0.66, 0.15, 0.12]],  // Red waterfront lodge
    [424, 88, 16, 8.5, 12, [0.90, 0.90, 0.88]],  // White timber house
    [940, 82, 18, 9.2, 13, [0.68, 0.14, 0.11]],  // East cove red rorbu
    [974, 86, 17, 8.8, 12, [0.78, 0.50, 0.13]],  // East cove ochre cabin
    [1010, 84, 19, 9.6, 13, [0.66, 0.14, 0.11]], // East cove lighthouse keeper lodge
  ];
  for (const [cx, cz, sx, sy, sz, wallCol] of cabins) {
    const cy = Math.max(4.5, getTerrainHeight(cx, cz) - 1.0);
    pushBox(out, cx, cy + 1.2, cz, sx + 1.2, 2.8, sz + 1.2, 0.28, 0.30, 0.34, 0.38);
    pushBox(out, cx, cy + 2.4 + sy * 0.5, cz, sx, sy, sz, wallCol[0], wallCol[1], wallCol[2], 0.42);
    pushPitchedRoof(out, cx, cy + 2.4 + sy, cz, sx + 2.4, sy * 0.62, sz + 2.6, 0.14, 0.17, 0.22, 0.45);
    for (const wxOff of [-sx * 0.24, sx * 0.24]) {
      pushBox(out, cx + wxOff, cy + 2.4 + sy * 0.52, cz - sz * 0.51, 2.8, 2.6, 0.35, 1.0, 0.80, 0.38, 0.05);
      pushBox(out, cx + wxOff, cy + 2.4 + sy * 0.52, cz + sz * 0.51, 2.8, 2.6, 0.35, 1.0, 0.80, 0.38, 0.05);
    }
  }
  // Wooden waterfront pier jutting into south cove + moored white & crimson fishing boat
  pushBox(out, 372, 2.2, 122, 14, 1.4, 46, 0.36, 0.26, 0.18, 0.38);
  for (const pz of [104, 120, 136, 144]) {
    pushCylinder(out, 366, -4, pz, 0.7, 0.7, 7.2, 6, 0.24, 0.18, 0.12, 0.35);
    pushCylinder(out, 378, -4, pz, 0.7, 0.7, 7.2, 6, 0.24, 0.18, 0.12, 0.35);
  }
  pushBox(out, 392, 1.3, 134, 5.5, 2.6, 14.0, 0.90, 0.92, 0.94, 0.55);
  pushBox(out, 392, 3.2, 131, 3.8, 2.4, 5.0, 0.76, 0.18, 0.14, 0.45);

  // 6. Iconic Coastal Stone Lighthouse on Eastern Headland (smooth 16-seg bands + gallery + glowing lantern)
  const lx = RUNWAY.LIGHTHOUSE_X;
  const lz = RUNWAY.LIGHTHOUSE_Z;
  const ly = getTerrainHeight(lx, lz) - 2.0;
  pushCylinder(out, lx, ly, lz, 8.2, 6.6, 13, 16, 0.94, 0.93, 0.90, 0.44);
  pushCylinder(out, lx, ly + 13, lz, 6.6, 5.4, 11, 16, 0.80, 0.15, 0.12, 0.44);
  pushCylinder(out, lx, ly + 24, lz, 5.4, 4.4, 10, 16, 0.94, 0.93, 0.90, 0.44);
  pushCylinder(out, lx, ly + 34, lz, 5.6, 5.6, 2.0, 16, 0.16, 0.19, 0.24, 0.55);
  // Blazing golden Fresnel lantern room
  pushCylinder(out, lx, ly + 36.0, lz, 3.8, 3.8, 5.6, 16, 1.0, 0.88, 0.44, 0.05);
  // Pointed crimson lighthouse cupola
  pushCylinder(out, lx, ly + 41.6, lz, 5.0, 0.35, 5.2, 16, 0.76, 0.14, 0.11, 0.48);

  // 7. Approach Lead-in Light Towers West of Runway 09 threshold (standing on sea pilings over the fjord!)
  for (let i = 1; i <= 5; i++) {
    const ax = RUNWAY.START_X - i * 82;
    const ay = RUNWAY.ELEVATION - 1.2 - i * 1.4;
    pushBox(out, ax, ay * 0.5 - 2.0, -5.5, 1.2, ay + 14, 1.2, 0.30, 0.34, 0.38, 0.42);
    pushBox(out, ax, ay * 0.5 - 2.0, 5.5, 1.2, ay + 14, 1.2, 0.30, 0.34, 0.38, 0.42);
    pushBox(out, ax, ay + 0.5, 0, 1.8, 1.1, 20, 0.84, 0.86, 0.88, 0.46);
    for (const lzOff of [-8, -4, 0, 4, 8]) {
      pushBox(out, ax - 0.8, ay + 1.5, lzOff, 1.6, 1.6, 1.6, 1.0, 0.95, 0.76, 0.04);
    }
  }

  // Runway 09 Green Threshold Light Bar & 27 Red End Light Bar
  for (let lzOff = -22; lzOff <= 22; lzOff += 5.5) {
    pushBox(out, RUNWAY.START_X - 2.0, RUNWAY.SURFACE_Y + 0.7, lzOff, 1.4, 1.2, 1.4, 0.18, 1.0, 0.45, 0.04);
    pushBox(out, RUNWAY.END_X + 2.0, RUNWAY.SURFACE_Y + 0.7, lzOff, 1.4, 1.2, 1.4, 1.0, 0.20, 0.18, 0.04);
  }

  // PAPI glideslope mounting plinth (dark matte bar so 2-WHITE / 2-RED lamps pop vividly!)
  pushBox(out, RUNWAY.PAPI_X, y + 0.9, RUNWAY.PAPI_Z - 12.75, 4.4, 1.8, 33.0, 0.10, 0.12, 0.16, 0.45);

  // 8. Rich 3-Tiered Nordic Spruce Pine Groves across Skjold Island & nearby outer skerries (keeping runway approach crystal clear!)
  const rng = createRng(409);
  for (let i = 0; i < 165; i++) {
    let px, pz;
    if (i < 130) {
      px = -75 + rng() * 1320;
      pz = rng() < 0.5 ? (46 + rng() * 76) : (-106 - rng() * 56);
    } else {
      const sk = i % 2 === 0 ? [-980, 360] : [-1340, -410];
      px = sk[0] + (rng() - 0.5) * 210;
      pz = sk[1] + (rng() - 0.5) * 210;
    }
    if (Math.abs(px - tx) < 42 && Math.abs(pz - tz) < 38) continue;
    if (px > 300 && px < 485 && pz < -50) continue;
    if (px > 295 && px < 455 && pz > 58) continue; // Keep south village clear
    if (px > 915 && px < 1045 && pz > 60) continue; // Keep east cove village clear
    if (Math.hypot(px - lx, pz - lz) < 36) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 4.5) continue;
    const scale = 0.78 + rng() * 0.85;
    pushPineTree(out, px, py, pz, scale, rng());
  }

  return { vertices: new Float32Array(out), count: out.length / 10 };
}

// Build translucent volumetric lighthouse beam cone (origin at 0,0,0 pointing along +X)
export function buildLighthouseBeamGeometry() {
  const out = [];
  const segs = 14;
  const len = 460;
  const r0 = 3.5;
  const r1 = 54.0;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [0, c0 * r0, s0 * r0, 1.0, 0.90, 0.55, 0.42];
    const p1 = [0, c1 * r0, s1 * r0, 1.0, 0.90, 0.55, 0.42];
    const p2 = [len, c1 * r1, s1 * r1, 1.0, 0.84, 0.45, 0.0];
    const p3 = [len, c0 * r1, s0 * r1, 1.0, 0.84, 0.45, 0.0];
    out.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  }
  return { vertices: new Float32Array(out), count: out.length / 7 };
}

// Build soft volumetric camera-facing cloud billboard puffs floating gracefully around fjord ridges.
// Vertex layout (10 floats): center(3), cornerUv(2), size(2), params(3: seed, heightFrac, density)
export function buildCloudBillboards(seed = 11) {
  const rng = createRng(seed);
  const out = [];

  const corners = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1, 1], [-1, 1],
  ];

  // Dramatic fjord cumulus & mist anchors framing the peaks without obstructing runway approach
  const anchors = [
    [2550, 740, -820, 1.35],
    [3350, 860, 560, 1.50],
    [1680, 660, 1180, 1.20],
    [1020, 790, -1420, 1.30],
    [-920, 720, -1180, 1.25],
    [-1320, 680, 1080, 1.20],
    [2900, 940, -1700, 1.45],
    [480, 810, 1720, 1.35],
    [-2250, 760, -480, 1.25],
    [3900, 810, -260, 1.40],
    [-460, 850, -2180, 1.45],
    [1880, 680, -1820, 1.25],
    [2400, 420, 1450, 1.05], // Lower valley mist puff clinging to southern cliffs
    [2200, 440, -1350, 1.05], // Lower valley mist puff clinging to northern cliffs
  ];

  for (const [bx, by, bz, sc] of anchors) {
    const puffs = 7 + Math.floor(rng() * 5);
    for (let p = 0; p < puffs; p++) {
      const ox = (rng() - 0.5) * 420 * sc;
      const oy = (rng() - 0.42) * 85 * sc;
      const oz = (rng() - 0.5) * 340 * sc;
      const sx = (165 + rng() * 140) * sc;
      const sy = (78 + rng() * 68) * sc;
      const pSeed = rng() * 100.0;
      const heightFrac = clamp((oy / (85 * sc)) + 0.5, 0, 1);
      const density = 0.55 + rng() * 0.35;

      for (const [cu, cv] of corners) {
        out.push(
          bx + ox, by + oy, bz + oz,
          cu, cv,
          sx, sy,
          pSeed, heightFrac, density
        );
      }
    }
  }

  return { vertices: new Float32Array(out), count: out.length / 10 };
}
