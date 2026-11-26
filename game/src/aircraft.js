// FJORDWING — High-detail smooth-sculpted 3D VX-9 Kestrel twin-tail interceptor jet,
// cockpit forward exterior, Mach shock-diamond afterburner plumes, landing gear & target rings.

function computeFaceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function pushTri(out, a, b, c, r, g, bCol, mat = 0.48) {
  const n = computeFaceNormal(a, b, c);
  out.push(
    a[0], a[1], a[2], n[0], n[1], n[2], r, g, bCol, mat,
    b[0], b[1], b[2], n[0], n[1], n[2], r, g, bCol, mat,
    c[0], c[1], c[2], n[0], n[1], n[2], r, g, bCol, mat,
  );
}

function pushSmoothTri(out, a, na, b, nb, c, nc, r, g, bCol, mat = 0.48) {
  out.push(
    a[0], a[1], a[2], na[0], na[1], na[2], r, g, bCol, mat,
    b[0], b[1], b[2], nb[0], nb[1], nb[2], r, g, bCol, mat,
    c[0], c[1], c[2], nc[0], nc[1], nc[2], r, g, bCol, mat,
  );
}

function pushQuad(out, a, b, c, d, r, g, bCol, mat = 0.48) {
  pushTri(out, a, b, c, r, g, bCol, mat);
  pushTri(out, a, c, d, r, g, bCol, mat);
}

// Smooth-normal loft across closed rings [ { z, pts: [[x,y],...], col?: [r,g,b], mat?: number } ]
// Computes smooth averaged vertex normals so curved fuselage & glass bubble canopy gleam without faceting!
function pushSmoothLoft(out, stations, defaultMat = 0.52, closedRing = true) {
  const S = stations.length;
  const N = stations[0].pts.length;

  // Accumulate face normals per (station, ringIndex)
  const norms = Array.from({ length: S }, () => Array.from({ length: N }, () => [0, 0, 0]));
  const addN = (s, i, n) => {
    norms[s][i][0] += n[0];
    norms[s][i][1] += n[1];
    norms[s][i][2] += n[2];
  };

  const segCount = closedRing ? N : N - 1;
  for (let s = 0; s < S - 1; s++) {
    const stA = stations[s];
    const stB = stations[s + 1];
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % N;
      const a0 = [stA.pts[i][0], stA.pts[i][1], stA.z];
      const a1 = [stA.pts[j][0], stA.pts[j][1], stA.z];
      const b0 = [stB.pts[i][0], stB.pts[i][1], stB.z];
      const b1 = [stB.pts[j][0], stB.pts[j][1], stB.z];
      const n1 = computeFaceNormal(a0, b0, b1);
      const n2 = computeFaceNormal(a0, b1, a1);
      addN(s, i, n1); addN(s + 1, i, n1); addN(s + 1, j, n1);
      addN(s, i, n2); addN(s + 1, j, n2); addN(s, j, n2);
    }
  }

  for (let s = 0; s < S; s++) {
    for (let i = 0; i < N; i++) {
      const n = norms[s][i];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n[0] /= len; n[1] /= len; n[2] /= len;
    }
  }

  for (let s = 0; s < S - 1; s++) {
    const stA = stations[s];
    const stB = stations[s + 1];
    const col = stA.col ?? [0.90, 0.93, 0.96];
    const mat = stA.mat ?? defaultMat;
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % N;
      const a0 = [stA.pts[i][0], stA.pts[i][1], stA.z];
      const a1 = [stA.pts[j][0], stA.pts[j][1], stA.z];
      const b0 = [stB.pts[i][0], stB.pts[i][1], stB.z];
      const b1 = [stB.pts[j][0], stB.pts[j][1], stB.z];

      // Subtle belly darkening for realistic tactical jet countershading (lighter grey-blue undersides)
      const avgY = (a0[1] + a1[1] + b0[1] + b1[1]) * 0.25;
      const under = avgY < -0.15 ? 0.86 : 1.0;
      const r = col[0] * under;
      const g = col[1] * under;
      const b = col[2] * under;

      pushSmoothTri(out, a0, norms[s][i], b0, norms[s + 1][i], b1, norms[s + 1][j], r, g, b, mat);
      pushSmoothTri(out, a0, norms[s][i], b1, norms[s + 1][j], a1, norms[s][j], r, g, b, mat);
    }
  }
}

// Generate a sleek 16-point chined fighter cross-section (stealth nose chines + curved dorsal deck + twin-engine belly)
function fighterRing(wx, hyTop, hyBot, yOff = 0, chineSharp = 0.35, twinBump = 0.0) {
  const N = 16;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const s = Math.sin(a);
    const c = Math.cos(a);
    let x = s * wx;
    let y = (c >= 0 ? c * hyTop : c * hyBot) + yOff;
    // Slight stealth chine crease along lateral midline
    if (Math.abs(c) < 0.25) {
      x *= 1.0 + chineSharp * (1.0 - Math.abs(c) * 4.0) * 0.22;
    }
    // Subtle twin-engine bulge at rear fuselage stations
    if (twinBump > 0.01) {
      const bulge = Math.sin(a * 2.0);
      y += Math.abs(bulge) * twinBump * (c >= 0 ? 0.12 : -0.14);
    }
    pts.push([x, y]);
  }
  return pts;
}

// Smooth cambered 6-point NACA-inspired swept airfoil wing panel (mirrored by side = +1 starboard, -1 port)
function pushCamberedWing(out, side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, colTop, colBot, mat = 0.56) {
  const s = side;
  const stations = [0.0, 0.22, 0.52, 0.78, 1.0];
  const upperProf = [0.0, 0.92, 1.0, 0.58, 0.0];
  const lowerProf = [0.0, -0.36, -0.34, -0.16, 0.0];

  const lerpPt = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];

  const rTop = [], rBot = [], tTop = [], tBot = [];
  for (let i = 0; i < stations.length; i++) {
    const f = stations[i];
    const rp = lerpPt(rootLE, rootTE, f);
    const tp = lerpPt(tipLE, tipTE, f);
    rTop.push([rp[0] * s, rp[1] + upperProf[i] * rootThick, rp[2]]);
    rBot.push([rp[0] * s, rp[1] + lowerProf[i] * rootThick, rp[2]]);
    tTop.push([tp[0] * s, tp[1] + upperProf[i] * tipThick, tp[2]]);
    tBot.push([tp[0] * s, tp[1] + lowerProf[i] * tipThick, tp[2]]);
  }

  const emitQ = (p0, p1, p2, p3, col) => {
    if (s > 0) pushQuad(out, p0, p1, p2, p3, col[0], col[1], col[2], mat);
    else pushQuad(out, p0, p3, p2, p1, col[0], col[1], col[2], mat);
  };

  for (let i = 0; i < stations.length - 1; i++) {
    emitQ(rTop[i], tTop[i], tTop[i + 1], rTop[i + 1], colTop);
    emitQ(rBot[i], rBot[i + 1], tBot[i + 1], tBot[i], colBot);
  }
  // Wingtip chord cap
  for (let i = 0; i < stations.length - 1; i++) {
    if (s > 0) pushQuad(out, tTop[i], tBot[i], tBot[i + 1], tTop[i + 1], colTop[0] * 0.9, colTop[1] * 0.9, colTop[2] * 0.9, mat);
    else pushQuad(out, tTop[i], tTop[i + 1], tBot[i + 1], tBot[i], colTop[0] * 0.9, colTop[1] * 0.9, colTop[2] * 0.9, mat);
  }
}

// Sharp diamond-airfoil swept vertical stabilizer fin (canted outward, zero chunky boxiness!)
function pushSweptTailFin(out, side, rLE, rTE, tLE, tTE, rootThick, tipThick, colLower, colStripe, colTip, mat = 0.56) {
  const s = side;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Build 4 vertical bands: lower navy, crisp white accent band, upper Nordic crimson flash
  const bands = [
    { t0: 0.0, t1: 0.62, col: colLower },
    { t0: 0.62, t1: 0.72, col: colStripe },
    { t0: 0.72, t1: 1.0, col: colTip },
  ];

  // Outward normal approximation perpendicular to canted fin plane
  const dx = tLE[0] - rLE[0];
  const dy = tLE[1] - rLE[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (dy / len) * s;
  const ny = -(dx / len) * s;

  for (const band of bands) {
    const bLE = lerp3(rLE, tLE, band.t0);
    const bTE = lerp3(rTE, tTE, band.t0);
    const uLE = lerp3(rLE, tLE, band.t1);
    const uTE = lerp3(rTE, tTE, band.t1);
    const thB = rootThick + (tipThick - rootThick) * band.t0;
    const thU = rootThick + (tipThick - rootThick) * band.t1;

    const bMid = lerp3(bLE, bTE, 0.36);
    const uMid = lerp3(uLE, uTE, 0.36);

    const off = (pt, k) => [pt[0] + nx * k, pt[1] + ny * k, pt[2]];
    const bOut = off(bMid, thB);
    const bIn = off(bMid, -thB);
    const uOut = off(uMid, thU);
    const uIn = off(uMid, -thU);

    const c = band.col;
    // Outer leading & trailing airfoil facets
    pushQuad(out, bLE, bOut, uOut, uLE, c[0] * 1.02, c[1] * 1.02, c[2] * 1.02, mat);
    pushQuad(out, bOut, bTE, uTE, uOut, c[0] * 0.96, c[1] * 0.96, c[2] * 0.96, mat);
    // Inner leading & trailing airfoil facets
    pushQuad(out, bIn, bLE, uLE, uIn, c[0] * 0.92, c[1] * 0.92, c[2] * 0.92, mat);
    pushQuad(out, bTE, bIn, uIn, uTE, c[0] * 0.88, c[1] * 0.88, c[2] * 0.88, mat);

    if (band.t1 >= 0.99) {
      pushTri(out, uLE, uOut, uTE, c[0], c[1], c[2], mat);
      pushTri(out, uLE, uTE, uIn, c[0], c[1], c[2], mat);
    }
  }
}

function pushCylinderMesh(out, x0, y0, z0, x1, y1, z1, r0, r1, segs, col, mat = 0.62) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ax = dx / len, ay = dy / len, az = dz / len;
  // Orthogonal frame
  const ref = Math.abs(ay) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ux = ay * ref[2] - az * ref[1];
  let uy = az * ref[0] - ax * ref[2];
  let uz = ax * ref[1] - ay * ref[0];
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen; uy /= uLen; uz /= uLen;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const n0 = [ux * c0 + vx * s0, uy * c0 + vy * s0, uz * c0 + vz * s0];
    const n1 = [ux * c1 + vx * s1, uy * c1 + vy * s1, uz * c1 + vz * s1];
    const p0 = [x0 + n0[0] * r0, y0 + n0[1] * r0, z0 + n0[2] * r0];
    const p1 = [x0 + n1[0] * r0, y0 + n1[1] * r0, z0 + n1[2] * r0];
    const p2 = [x1 + n1[0] * r1, y1 + n1[1] * r1, z1 + n1[2] * r1];
    const p3 = [x1 + n0[0] * r1, y1 + n0[1] * r1, z1 + n0[2] * r1];

    pushSmoothTri(out, p0, n0, p1, n1, p2, n1, col[0], col[1], col[2], mat);
    pushSmoothTri(out, p0, n0, p2, n1, p3, n0, col[0], col[1], col[2], mat);
  }
}

function pushOrb(out, cx, cy, cz, rad, r, g, b, mat = 0.04) {
  const dirs = [
    [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  ];
  const oct = [
    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
    [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
  ];
  for (const [i0, i1, i2] of oct) {
    const a = [cx + dirs[i0][0] * rad, cy + dirs[i0][1] * rad, cz + dirs[i0][2] * rad];
    const bP = [cx + dirs[i1][0] * rad, cy + dirs[i1][1] * rad, cz + dirs[i1][2] * rad];
    const c = [cx + dirs[i2][0] * rad, cy + dirs[i2][1] * rad, cz + dirs[i2][2] * rad];
    pushTri(out, a, bP, c, r, g, b, mat);
  }
}

// Local aircraft space: -Z = Nose (forward), +Z = Tail (aft), +X = Starboard, +Y = Dorsal Up.
export function buildAircraftGeometry() {
  const body = [];

  // Crisp Nordic Tactical Aerobatic Squadron Livery (Pearl Arctic White + Deep Fjord Navy + Crimson + Brushed Titanium)
  const PEARL = [0.90, 0.93, 0.96];
  const SILVER = [0.76, 0.80, 0.86];
  const NAVY = [0.09, 0.21, 0.44];
  const NAVY_DARK = [0.06, 0.14, 0.30];
  const CRIMSON = [0.86, 0.16, 0.12];
  const RADOME = [0.13, 0.16, 0.22];
  const TITANIUM = [0.36, 0.40, 0.46];
  const NOZZLE_DARK = [0.12, 0.14, 0.18];
  const CANOPY_GLASS = [0.07, 0.13, 0.20];
  const CANOPY_BOW = [0.10, 0.13, 0.18];

  // 1. Sleek 16-Sided Smooth-Normal Sculpted Chined Fuselage (14 longitudinal stations!)
  const fuselageStations = [
    { z: -9.10, pts: fighterRing(0.02, 0.02, 0.02, -0.14, 0.0, 0.0), col: TITANIUM, mat: 0.78 },
    { z: -8.35, pts: fighterRing(0.06, 0.05, 0.05, -0.13, 0.1, 0.0), col: RADOME, mat: 0.48 },
    { z: -7.45, pts: fighterRing(0.30, 0.24, 0.22, -0.10, 0.3, 0.0), col: RADOME, mat: 0.48 },
    { z: -6.30, pts: fighterRing(0.58, 0.44, 0.38, -0.07, 0.4, 0.0), col: RADOME, mat: 0.50 },
    { z: -5.15, pts: fighterRing(0.84, 0.58, 0.48, -0.04, 0.5, 0.0), col: PEARL, mat: 0.56 },
    { z: -3.80, pts: fighterRing(1.06, 0.66, 0.56, -0.02, 0.55, 0.0), col: PEARL, mat: 0.56 },
    { z: -2.20, pts: fighterRing(1.30, 0.74, 0.62, 0.0, 0.60, 0.0), col: PEARL, mat: 0.56 },
    { z: -0.40, pts: fighterRing(1.48, 0.80, 0.66, 0.02, 0.55, 0.15), col: PEARL, mat: 0.56 },
    { z: 1.50,  pts: fighterRing(1.58, 0.82, 0.68, 0.02, 0.45, 0.35), col: PEARL, mat: 0.56 },
    { z: 3.30,  pts: fighterRing(1.52, 0.78, 0.64, 0.02, 0.35, 0.55), col: NAVY, mat: 0.60 },
    { z: 4.85,  pts: fighterRing(1.40, 0.68, 0.56, 0.02, 0.25, 0.70), col: NAVY, mat: 0.60 },
    { z: 5.95,  pts: fighterRing(1.24, 0.56, 0.48, 0.02, 0.15, 0.65), col: TITANIUM, mat: 0.72 },
    { z: 6.55,  pts: fighterRing(1.12, 0.48, 0.42, 0.02, 0.10, 0.45), col: NOZZLE_DARK, mat: 0.72 },
  ];
  pushSmoothLoft(body, fuselageStations, 0.56, true);

  // Rear engine bulkhead cap & central tail sting fairing between twin nozzles
  const rearSt = fuselageStations[fuselageStations.length - 1];
  for (let i = 0; i < rearSt.pts.length; i++) {
    const j = (i + 1) % rearSt.pts.length;
    pushTri(
      body,
      [0, 0.02, rearSt.z],
      [rearSt.pts[i][0], rearSt.pts[i][1], rearSt.z],
      [rearSt.pts[j][0], rearSt.pts[j][1], rearSt.z],
      NOZZLE_DARK[0], NOZZLE_DARK[1], NOZZLE_DARK[2], 0.60
    );
  }
  // Sleek central beaver-tail electronics sting extending between twin exhausts
  const stingStations = [
    { z: 5.4, pts: fighterRing(0.24, 0.22, 0.18, 0.06, 0.2, 0.0), col: TITANIUM, mat: 0.72 },
    { z: 6.9, pts: fighterRing(0.18, 0.15, 0.12, 0.06, 0.2, 0.0), col: TITANIUM, mat: 0.72 },
    { z: 7.75, pts: fighterRing(0.04, 0.04, 0.04, 0.06, 0.0, 0.0), col: CRIMSON, mat: 0.55 },
  ];
  pushSmoothLoft(body, stingStations, 0.70, true);

  // Dorsal spine fairing tapering smoothly from behind canopy back to tail
  const spineStations = [
    { z: 0.65, pts: fighterRing(0.56, 0.48, 0.02, 0.72, 0.0, 0.0), col: PEARL, mat: 0.58 },
    { z: 2.20, pts: fighterRing(0.46, 0.36, 0.02, 0.76, 0.0, 0.0), col: NAVY, mat: 0.60 },
    { z: 4.10, pts: fighterRing(0.32, 0.24, 0.02, 0.74, 0.0, 0.0), col: NAVY, mat: 0.60 },
    { z: 5.85, pts: fighterRing(0.14, 0.10, 0.02, 0.58, 0.0, 0.0), col: TITANIUM, mat: 0.70 },
  ];
  pushSmoothLoft(body, spineStations, 0.58, true);

  // Crimson tactical nose-stripe accent band right behind radome
  const noseBand = [
    { z: -5.35, pts: fighterRing(0.81, 0.57, 0.47, -0.04, 0.48, 0.0), col: CRIMSON, mat: 0.56 },
    { z: -4.92, pts: fighterRing(0.89, 0.61, 0.51, -0.03, 0.50, 0.0), col: CRIMSON, mat: 0.56 },
  ];
  pushSmoothLoft(body, noseBand, 0.56, true);

  // 2. Smooth Glossy Bubble Canopy Dome (16-sided smooth teardrop with gold/sapphire tint + metallic bow frame!)
  function canopyRing(wx, hy, yBase) {
    const N = 16;
    const pts = [];
    for (let i = 0; i < N; i++) {
      // Arch around top dome and tuck neatly beneath fuselage coaming
      const a = (i / N) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const x = s * wx;
      const y = c >= -0.15 ? yBase + Math.max(0, c + 0.15) * (hy / 1.15) : yBase - 0.06;
      pts.push([x, y]);
    }
    return pts;
  }

  const canopyStations = [
    { z: -4.95, pts: canopyRing(0.16, 0.08, 0.52), col: CANOPY_BOW, mat: 0.72 },
    { z: -4.45, pts: canopyRing(0.46, 0.42, 0.54), col: CANOPY_GLASS, mat: 0.96 },
    { z: -3.65, pts: canopyRing(0.64, 0.72, 0.58), col: CANOPY_GLASS, mat: 0.96 },
    { z: -2.60, pts: canopyRing(0.72, 0.88, 0.62), col: CANOPY_GLASS, mat: 0.96 },
    { z: -1.45, pts: canopyRing(0.70, 0.85, 0.64), col: CANOPY_GLASS, mat: 0.96 },
    { z: -0.30, pts: canopyRing(0.62, 0.70, 0.66), col: CANOPY_GLASS, mat: 0.96 },
    { z: 0.65,  pts: canopyRing(0.50, 0.46, 0.70), col: CANOPY_BOW, mat: 0.72 },
    { z: 1.25,  pts: canopyRing(0.32, 0.24, 0.74), col: NAVY, mat: 0.58 },
  ];
  pushSmoothLoft(body, canopyStations, 0.96, true);

  // Structural dark-titanium canopy windshield arch bow & rear frame ring
  const archBow = [
    { z: -3.45, pts: canopyRing(0.67, 0.76, 0.58), col: CANOPY_BOW, mat: 0.76 },
    { z: -3.28, pts: canopyRing(0.69, 0.80, 0.59), col: CANOPY_BOW, mat: 0.76 },
  ];
  pushSmoothLoft(body, archBow, 0.76, true);

  // Pilot helmet silhouette + ejection seat + glowing emerald HUD glass inside canopy
  pushOrb(body, 0, 1.06, -2.15, 0.24, 0.92, 0.94, 0.96, 0.72); // White flight helmet
  pushOrb(body, 0, 1.04, -2.30, 0.19, 0.08, 0.10, 0.14, 0.95); // Tinted pilot visor
  pushQuad(
    body,
    [-0.18, 0.82, -3.55], [0.18, 0.82, -3.55],
    [0.14, 1.08, -3.32], [-0.14, 1.08, -3.32],
    0.22, 1.0, 0.60, 0.06
  );

  // 3. Sculpted Supersonic Twin Side Air Intakes (DSI) + Dark Recessed Compressor Ducts + Crimson Chevrons
  for (const s of [-1, 1]) {
    const makeIntakePts = (xIn, xOut, yTop, yBot) => {
      const pts = [
        [xIn * s, yTop],
        [xOut * s, yTop - 0.14],
        [(xOut + 0.06) * s, (yTop + yBot) * 0.5],
        [(xOut - 0.08) * s, yBot],
        [xIn * s, yBot - 0.05],
      ];
      if (s < 0) pts.reverse();
      return pts;
    };
    const intakeStations = [
      { z: -2.65, pts: makeIntakePts(1.06, 1.78, 0.34, -0.44), col: CRIMSON, mat: 0.56 },
      { z: -2.15, pts: makeIntakePts(1.12, 1.96, 0.42, -0.48), col: PEARL, mat: 0.58 },
      { z: 0.80,  pts: makeIntakePts(1.18, 1.98, 0.44, -0.50), col: PEARL, mat: 0.58 },
      { z: 3.60,  pts: makeIntakePts(1.06, 1.82, 0.42, -0.48), col: NAVY, mat: 0.60 },
      { z: 6.10,  pts: makeIntakePts(0.76, 1.32, 0.32, -0.38), col: TITANIUM, mat: 0.72 },
    ];
    pushSmoothLoft(body, intakeStations, 0.58, true);

    // Dark recessed intake mouth aperture facing forward (-Z)
    const pIn = makeIntakePts(1.09, 1.72, 0.29, -0.40);
    pushQuad(
      body,
      [pIn[0][0], pIn[0][1], -2.63],
      [pIn[1][0], pIn[1][1], -2.63],
      [pIn[3][0], pIn[3][1], -2.63],
      [pIn[4][0], pIn[4][1], -2.63],
      0.04, 0.05, 0.08, 0.35
    );
  }

  // 4. Swept Blended Delta Main Wings (Forward LERX Strake + Pearl Inner + Navy Outer + Crimson Wingtip + Missile Rails!)
  for (const s of [-1, 1]) {
    // Sleek Leading-Edge Root Extension (LERX) blending smoothly from forward fuselage into main wing
    pushCamberedWing(body, s, [0.92, 0.04, -4.60], [1.28, -0.02, -1.60], [1.95, 0.00, -1.80], [2.15, -0.04, 0.40], 0.16, 0.18, PEARL, SILVER, 0.56);
    // Inner main delta wing (Arctic Pearl White)
    pushCamberedWing(body, s, [1.45, -0.04, -2.05], [1.50, -0.04, 3.65], [3.85, -0.08, 0.40], [3.85, -0.08, 3.92], 0.24, 0.17, PEARL, SILVER, 0.58);
    // Mid-outer swept wing (Deep Fjord Navy)
    pushCamberedWing(body, s, [3.85, -0.08, 0.40], [3.85, -0.08, 3.92], [6.25, -0.14, 2.55], [6.25, -0.14, 4.32], 0.17, 0.10, NAVY, NAVY_DARK, 0.60);
    // High-vis Nordic Crimson wingtip flash
    pushCamberedWing(body, s, [6.25, -0.14, 2.55], [6.25, -0.14, 4.32], [7.05, -0.16, 3.18], [7.05, -0.16, 4.56], 0.10, 0.06, CRIMSON, CRIMSON, 0.58);
    // Sleek titanium wingtip missile/sensor rail & aero pod
    pushCylinderMesh(body, 7.08 * s, -0.15, 2.45, 7.08 * s, -0.15, 4.95, 0.09, 0.08, 8, TITANIUM, 0.74);
    pushCylinderMesh(body, 7.08 * s, -0.15, 2.05, 7.08 * s, -0.15, 2.45, 0.015, 0.09, 8, CRIMSON, 0.58);
  }

  // 5. Swept All-Moving Horizontal Stabilators (sharp tapered airfoils)
  for (const s of [-1, 1]) {
    pushCamberedWing(body, s, [1.18, 0.04, 4.25], [1.08, 0.04, 6.20], [3.62, -0.08, 5.55], [3.62, -0.08, 6.88], 0.13, 0.06, NAVY, NAVY_DARK, 0.60);
  }

  // 6. Twin Canted Swept Vertical Tail Fins (razor-sharp NACA diamond airfoil profile + white stripe + crimson tips!)
  for (const s of [-1, 1]) {
    pushSweptTailFin(
      body, s,
      [1.06 * s, 0.50, 2.95],
      [1.04 * s, 0.44, 6.18],
      [2.24 * s, 2.86, 5.05],
      [2.20 * s, 2.78, 6.68],
      0.11, 0.05,
      NAVY, PEARL, CRIMSON,
      0.60
    );
  }

  // 7. Twin Detailed Thrust-Vectoring Exhaust Nozzles (16-segment metallic turkey-feather shroud + glowing hot inner ring!)
  for (const s of [-1, 1]) {
    const nx = 0.62 * s;
    const ny = 0.02;
    const segs = 16;
    const r0 = 0.52;
    const r1 = 0.42;
    const rIn = 0.34;
    // Outer brushed titanium nozzle shroud
    pushCylinderMesh(body, nx, ny, 6.05, nx, ny, 7.28, r0, r1, segs, TITANIUM, 0.78);
    // Dark heat-blued outer vectoring petal lip
    pushCylinderMesh(body, nx, ny, 6.95, nx, ny, 7.36, r1 + 0.015, r1 - 0.02, segs, NOZZLE_DARK, 0.80);
    // Recessed dark turbine interior wall
    pushCylinderMesh(body, nx, ny, 6.25, nx, ny, 7.26, rIn, rIn + 0.03, segs, NOZZLE_DARK, 0.45);
    // Glowing hot orange-amber inner afterburner flameholder ring (emissive!)
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [nx + Math.cos(a0) * rIn, ny + Math.sin(a0) * rIn, 6.55];
      const p1 = [nx + Math.cos(a1) * rIn, ny + Math.sin(a1) * rIn, 6.55];
      const c = [nx, ny, 6.45];
      pushTri(body, c, p0, p1, 1.0, 0.48, 0.14, 0.06);
    }
  }

  // 8. Wingtip & Tail Navigation Strobe Orbs (port RED, starboard GREEN, dorsal tail WHITE)
  const navLights = [];
  pushOrb(navLights, -7.12, -0.15, 3.60, 0.18, 1.0, 0.14, 0.12, 0.04); // Port red
  pushOrb(navLights, 7.12, -0.15, 3.60, 0.18, 0.14, 1.0, 0.40, 0.04);  // Starboard green
  pushOrb(navLights, 0.0, 0.65, 7.65, 0.14, 1.0, 0.96, 0.86, 0.04);    // Rear tail strobe

  // 9. Detailed Retractable Tricycle Landing Gear (oleo struts, 12-sided tires, metallic hubs, open bay doors, taxi lamp)
  const gear = [];
  function pushDetailedGear(x, z, dropY, wheelR, wheelW) {
    // Upper chrome/titanium oleo strut + diagonal brace
    pushCylinderMesh(gear, x, -0.32, z, x, -dropY + 0.15, z, 0.11, 0.09, 8, [0.76, 0.80, 0.85], 0.75);
    pushCylinderMesh(gear, x, -0.38, z - 0.65, x, -dropY * 0.68, z, 0.06, 0.06, 6, TITANIUM, 0.70);
    // Open gear bay door next to strut
    const doorSide = x === 0 ? 0.36 : Math.sign(x) * 0.38;
    pushQuad(
      gear,
      [x + doorSide, -0.40, z - 0.55], [x + doorSide, -0.40, z + 0.55],
      [x + doorSide, -1.18, z + 0.48], [x + doorSide, -1.18, z - 0.48],
      SILVER[0], SILVER[1], SILVER[2], 0.55
    );
    // 12-sided cylindrical rubber tire + alloy hubcaps
    pushCylinderMesh(gear, x - wheelW, -dropY, z, x + wheelW, -dropY, z, wheelR, wheelR, 12, [0.09, 0.10, 0.12], 0.32);
    pushCylinderMesh(gear, x - wheelW - 0.02, -dropY, z, x + wheelW + 0.02, -dropY, z, wheelR * 0.52, wheelR * 0.52, 10, [0.72, 0.76, 0.82], 0.76);
  }
  pushDetailedGear(0, -4.55, 1.88, 0.40, 0.19);     // Nose gear
  pushDetailedGear(-1.92, 1.45, 1.92, 0.49, 0.24);  // Left main gear
  pushDetailedGear(1.92, 1.45, 1.92, 0.49, 0.24);   // Right main gear
  // Bright warm LED landing spotlight on nose strut
  pushOrb(gear, 0, -1.06, -4.75, 0.17, 1.0, 0.96, 0.82, 0.04);

  // 10. Separate Deflected Trailing-Edge Wing Flaps (deployed smoothly on approach)
  const flaps = [];
  for (const s of [-1, 1]) {
    pushCamberedWing(flaps, s, [1.55, -0.09, 3.65], [1.55, -0.48, 4.54], [4.15, -0.14, 3.92], [4.15, -0.52, 4.78], 0.08, 0.06, CRIMSON, NAVY_DARK, 0.56);
  }

  // 11. Multi-Stage Supersonic Mach Shock-Diamond Afterburner Plumes (FX shader: pos 3 + rgba 4)
  // Nested electric blue-white core + 4 distinct glowing shock diamonds + fiery golden-amber outer shear envelope!
  const plumes = [];
  const segs = 16;
  function pushConeRing(x, y, zA, rA, colA, zB, rB, colB) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p0 = [x + c0 * rA, y + s0 * rA, zA, colA[0], colA[1], colA[2], colA[3]];
      const p1 = [x + c1 * rA, y + s1 * rA, zA, colA[0], colA[1], colA[2], colA[3]];
      const p2 = [x + c1 * rB, y + s1 * rB, zB, colB[0], colB[1], colB[2], colB[3]];
      const p3 = [x + c0 * rB, y + s0 * rB, zB, colB[0], colB[1], colB[2], colB[3]];
      plumes.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    }
  }

  for (const s of [-1, 1]) {
    const nx = 0.62 * s;
    const ny = 0.02;
    // Outer golden-amber shear flame envelope
    pushConeRing(nx, ny, 7.12, 0.36, [0.42, 0.78, 1.0, 0.88], 8.20, 0.33, [1.0, 0.56, 0.14, 0.72]);
    pushConeRing(nx, ny, 8.20, 0.33, [1.0, 0.56, 0.14, 0.72], 10.10, 0.21, [1.0, 0.34, 0.05, 0.44]);
    pushConeRing(nx, ny, 10.10, 0.21, [1.0, 0.34, 0.05, 0.44], 12.60, 0.02, [0.95, 0.16, 0.02, 0.0]);

    // Inner incandescent cyan-white Mach shock diamonds (4 pulsing compression nodes!)
    const diamonds = [
      { z: 7.45, r: 0.24, l: 0.48, c: [0.85, 0.96, 1.0, 0.96] },
      { z: 8.35, r: 0.20, l: 0.46, c: [1.0, 0.86, 0.58, 0.88] },
      { z: 9.25, r: 0.15, l: 0.44, c: [1.0, 0.70, 0.30, 0.72] },
      { z: 10.15, r: 0.10, l: 0.40, c: [1.0, 0.52, 0.16, 0.48] },
    ];
    for (const d of diamonds) {
      pushConeRing(nx, ny, d.z - d.l * 0.5, 0.02, [d.c[0], d.c[1], d.c[2], 0.15], d.z, d.r, d.c);
      pushConeRing(nx, ny, d.z, d.r, d.c, d.z + d.l * 0.5, 0.02, [d.c[0], d.c[1], d.c[2], 0.10]);
    }
  }

  // 12. 3D Cockpit Forward Exterior Mesh (nose radome, pitot & subtle LERX wings visible out the cockpit glass!)
  const cockpitExterior = [];
  const noseFwdStations = [
    { z: -9.10, pts: fighterRing(0.02, 0.02, 0.02, -0.14, 0.0, 0.0), col: TITANIUM, mat: 0.78 },
    { z: -8.35, pts: fighterRing(0.06, 0.05, 0.05, -0.13, 0.1, 0.0), col: RADOME, mat: 0.48 },
    { z: -7.45, pts: fighterRing(0.30, 0.24, 0.22, -0.10, 0.3, 0.0), col: RADOME, mat: 0.48 },
    { z: -6.30, pts: fighterRing(0.58, 0.44, 0.38, -0.07, 0.4, 0.0), col: RADOME, mat: 0.50 },
    { z: -5.15, pts: fighterRing(0.84, 0.58, 0.48, -0.04, 0.5, 0.0), col: PEARL, mat: 0.56 },
    { z: -4.20, pts: fighterRing(0.98, 0.62, 0.52, -0.03, 0.52, 0.0), col: [0.10, 0.12, 0.16], mat: 0.35 },
  ];
  pushSmoothLoft(cockpitExterior, noseFwdStations, 0.52, true);
  for (const s of [-1, 1]) {
    pushCamberedWing(cockpitExterior, s, [0.92, 0.04, -4.60], [1.28, -0.02, -1.60], [1.95, 0.00, -1.80], [2.15, -0.04, 0.40], 0.16, 0.18, PEARL, SILVER, 0.56);
    pushCamberedWing(cockpitExterior, s, [3.85, -0.08, 0.40], [3.85, -0.08, 3.92], [6.25, -0.14, 2.55], [6.25, -0.14, 4.32], 0.17, 0.10, NAVY, NAVY_DARK, 0.60);
  }

  return {
    body: { vertices: new Float32Array(body), count: body.length / 10 },
    cockpitExterior: { vertices: new Float32Array(cockpitExterior), count: cockpitExterior.length / 10 },
    navLights: { vertices: new Float32Array(navLights), count: navLights.length / 10 },
    gear: { vertices: new Float32Array(gear), count: gear.length / 10 },
    flaps: { vertices: new Float32Array(flaps), count: flaps.length / 10 },
    plumes: { vertices: new Float32Array(plumes), count: plumes.length / 7 },
  };
}

// Build glowing 3D aerial checkpoint ring (sleek beveled aerospace hoop + 4 directional fins + luminous inner halo)
export function buildTargetRingGeometry(radius = 34, tube = 2.4) {
  const out = [];
  const majorSegs = 44;
  const minorSegs = 10;

  for (let i = 0; i < majorSegs; i++) {
    const u0 = (i / majorSegs) * Math.PI * 2;
    const u1 = ((i + 1) / majorSegs) * Math.PI * 2;
    const cu0 = Math.cos(u0), su0 = Math.sin(u0);
    const cu1 = Math.cos(u1), su1 = Math.sin(u1);

    for (let j = 0; j < minorSegs; j++) {
      const v0 = (j / minorSegs) * Math.PI * 2;
      const v1 = ((j + 1) / minorSegs) * Math.PI * 2;
      const cv0 = Math.cos(v0), sv0 = Math.sin(v0);
      const cv1 = Math.cos(v1), sv1 = Math.sin(v1);

      const pt = (cu, su, cv, sv) => {
        const rr = radius + tube * cv;
        const bright = 0.76 + 0.24 * sv;
        return [rr * cu, rr * su, tube * sv, bright, bright, bright, 0.94];
      };
      const a = pt(cu0, su0, cv0, sv0);
      const b = pt(cu1, su1, cv0, sv0);
      const c = pt(cu1, su1, cv1, sv1);
      const d = pt(cu0, su0, cv1, sv1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }

    // 4 outer chevron fin brackets at 0, 90, 180, 270 deg
    if (i % 11 === 0) {
      const rIn = radius + tube * 0.5;
      const rOut = radius + tube * 3.9;
      const w = 0.065;
      const ca = Math.cos(u0 - w), sa = Math.sin(u0 - w);
      const cb = Math.cos(u0 + w), sb = Math.sin(u0 + w);
      const p0 = [ca * rIn, sa * rIn, -1.6, 1, 1, 1, 0.95];
      const p1 = [cb * rIn, sb * rIn, -1.6, 1, 1, 1, 0.95];
      const p2 = [cb * rOut, sb * rOut, 0, 1, 1, 1, 0.95];
      const p3 = [ca * rOut, sa * rOut, 0, 1, 1, 1, 0.95];
      const p4 = [ca * rIn, sa * rIn, 1.6, 1, 1, 1, 0.95];
      const p5 = [cb * rIn, sb * rIn, 1.6, 1, 1, 1, 0.95];
      out.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      out.push(...p4, ...p2, ...p5, ...p4, ...p3, ...p2);
    }
  }

  // Soft translucent luminous holographic halo inside the ring perimeter
  const haloIn = radius - tube * 4.2;
  const haloOut = radius - tube * 0.4;
  for (let i = 0; i < majorSegs; i++) {
    const u0 = (i / majorSegs) * Math.PI * 2;
    const u1 = ((i + 1) / majorSegs) * Math.PI * 2;
    const a = [Math.cos(u0) * haloIn, Math.sin(u0) * haloIn, 0, 1, 1, 1, 0.0];
    const b = [Math.cos(u1) * haloIn, Math.sin(u1) * haloIn, 0, 1, 1, 1, 0.0];
    const c = [Math.cos(u1) * haloOut, Math.sin(u1) * haloOut, 0, 1, 1, 1, 0.44];
    const d = [Math.cos(u0) * haloOut, Math.sin(u0) * haloOut, 0, 1, 1, 1, 0.44];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  return { vertices: new Float32Array(out), count: out.length / 7 };
}

// Build glowing 3D orb used for PAPI glideslope lamps + soft outer halo
export function buildLampGeometry() {
  const out = [];
  const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const oct = [
    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
    [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
  ];
  // Bright solid core
  const rCore = 2.2;
  for (const [i0, i1, i2] of oct) {
    out.push(
      dirs[i0][0] * rCore, dirs[i0][1] * rCore, dirs[i0][2] * rCore, 1, 1, 1, 1.0,
      dirs[i1][0] * rCore, dirs[i1][1] * rCore, dirs[i1][2] * rCore, 1, 1, 1, 1.0,
      dirs[i2][0] * rCore, dirs[i2][1] * rCore, dirs[i2][2] * rCore, 1, 1, 1, 1.0,
    );
  }
  // Soft translucent bloom shell around PAPI lamp
  const rHalo = 4.2;
  for (const [i0, i1, i2] of oct) {
    out.push(
      dirs[i0][0] * rHalo, dirs[i0][1] * rHalo, dirs[i0][2] * rHalo, 1, 1, 1, 0.24,
      dirs[i1][0] * rHalo, dirs[i1][1] * rHalo, dirs[i1][2] * rHalo, 1, 1, 1, 0.24,
      dirs[i2][0] * rHalo, dirs[i2][1] * rHalo, dirs[i2][2] * rHalo, 1, 1, 1, 0.24,
    );
  }
  return { vertices: new Float32Array(out), count: out.length / 7 };
}
