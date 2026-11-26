// FJORDWING — Sculpted 3D VX-9 Kestrel twin-tail delta jet, animated surfaces, afterburner & target ring meshes.

function computeFaceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function pushTri(out, a, b, c, r, g, bCol, mat = 0.45) {
  const n = computeFaceNormal(a, b, c);
  out.push(
    a[0], a[1], a[2], n[0], n[1], n[2], r, g, bCol, mat,
    b[0], b[1], b[2], n[0], n[1], n[2], r, g, bCol, mat,
    c[0], c[1], c[2], n[0], n[1], n[2], r, g, bCol, mat,
  );
}

function pushQuad(out, a, b, c, d, r, g, bCol, mat = 0.45) {
  pushTri(out, a, b, c, r, g, bCol, mat);
  pushTri(out, a, c, d, r, g, bCol, mat);
}

// Extrude a closed polygonal cross-section along stations [ { z, pts: [[x,y],...] } ]
function pushLoft(out, stations, colorsPerSpan, mat = 0.48) {
  for (let s = 0; s < stations.length - 1; s++) {
    const stA = stations[s];
    const stB = stations[s + 1];
    const col = colorsPerSpan[s] ?? [0.92, 0.94, 0.97];
    const n = stA.pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = [stA.pts[i][0], stA.pts[i][1], stA.z];
      const a1 = [stA.pts[j][0], stA.pts[j][1], stA.z];
      const b0 = [stB.pts[i][0], stB.pts[i][1], stB.z];
      const b1 = [stB.pts[j][0], stB.pts[j][1], stB.z];
      // Slight underside darkening for realistic aerospace shading
      const under = (a0[1] + a1[1]) < -0.2 ? 0.84 : 1.0;
      pushQuad(out, a0, b0, b1, a1, col[0] * under, col[1] * under, col[2] * under, mat);
    }
  }
}

// Build a swept airfoil wing panel (mirrored by side = +1 starboard, -1 port)
function pushAirfoilPanel(out, side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, r, g, b, mat = 0.48) {
  const s = side;
  const rMidZ = (rootLE[2] + rootTE[2]) * 0.42;
  const tMidZ = (tipLE[2] + tipTE[2]) * 0.42;

  const rL = [rootLE[0] * s, rootLE[1], rootLE[2]];
  const rT = [rootTE[0] * s, rootTE[1], rootTE[2]];
  const rTop = [rootLE[0] * s, rootLE[1] + rootThick, rMidZ];
  const rBot = [rootLE[0] * s, rootLE[1] - rootThick * 0.42, rMidZ];

  const tL = [tipLE[0] * s, tipLE[1], tipLE[2]];
  const tT = [tipTE[0] * s, tipTE[1], tipTE[2]];
  const tTop = [tipLE[0] * s, tipLE[1] + tipThick, tMidZ];
  const tBot = [tipLE[0] * s, tipLE[1] - tipThick * 0.42, tMidZ];

  const emitQ = (p0, p1, p2, p3, shade) => {
    if (s > 0) pushQuad(out, p0, p1, p2, p3, r * shade, g * shade, b * shade, mat);
    else pushQuad(out, p0, p3, p2, p1, r * shade, g * shade, b * shade, mat);
  };

  // Top leading & trailing bevels
  emitQ(rL, tL, tTop, rTop, 1.04);
  emitQ(rTop, tTop, tT, rT, 0.98);
  // Bottom surfaces
  emitQ(rL, rBot, tBot, tL, 0.78);
  emitQ(rBot, rT, tT, tBot, 0.74);
  // Wingtip cap
  if (s > 0) {
    pushTri(out, tL, tT, tTop, r * 0.9, g * 0.9, b * 0.9, mat);
    pushTri(out, tL, tBot, tT, r * 0.75, g * 0.75, b * 0.75, mat);
  } else {
    pushTri(out, tL, tTop, tT, r * 0.9, g * 0.9, b * 0.9, mat);
    pushTri(out, tL, tT, tBot, r * 0.75, g * 0.75, b * 0.75, mat);
  }
}

// Local aircraft space: -Z = Nose (forward), +Z = Tail (aft), +X = Starboard wing, +Y = Dorsal Up.
// Wingspan ~13.8 m, Length ~16.2 m — dramatic and crisp in Chase & Approach views!
export function buildAircraftGeometry() {
  const body = [];

  const PEARL = [0.93, 0.95, 0.98];
  const COBALT = [0.10, 0.25, 0.56];
  const CRIMSON = [0.88, 0.20, 0.14];
  const RADOME = [0.16, 0.20, 0.26];
  const TITANIUM = [0.34, 0.38, 0.44];
  const NOZZLE = [0.15, 0.17, 0.21];
  const CANOPY = [0.06, 0.16, 0.28];

  // 1. Sculpted Chined Fuselage Loft (nose tip at z = -8.2 to twin exhaust rear at z = +6.6)
  function octagonalRing(wx, hyTop, hyBot, yOff = 0) {
    return [
      [0, hyTop + yOff],
      [wx * 0.62, hyTop * 0.72 + yOff],
      [wx, yOff],
      [wx * 0.72, -hyBot * 0.72 + yOff],
      [0, -hyBot + yOff],
      [-wx * 0.72, -hyBot * 0.72 + yOff],
      [-wx, yOff],
      [-wx * 0.62, hyTop * 0.72 + yOff],
    ];
  }

  const stations = [
    { z: -8.3, pts: octagonalRing(0.05, 0.04, 0.04, -0.10) },
    { z: -6.4, pts: octagonalRing(0.54, 0.40, 0.36, -0.06) },
    { z: -4.4, pts: octagonalRing(0.95, 0.64, 0.54, -0.02) },
    { z: -1.8, pts: octagonalRing(1.38, 0.78, 0.68, 0.0) },
    { z: 1.6, pts: octagonalRing(1.62, 0.84, 0.70, 0.02) },
    { z: 4.5, pts: octagonalRing(1.48, 0.76, 0.62, 0.02) },
    { z: 6.5, pts: octagonalRing(1.16, 0.56, 0.48, 0.02) },
  ];
  pushLoft(body, stations, [RADOME, PEARL, PEARL, PEARL, COBALT, TITANIUM], 0.52);

  // Rear fuselage bulkhead cap
  const rear = stations[stations.length - 1];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    pushTri(
      body,
      [0, 0.02, rear.z],
      [rear.pts[i][0], rear.pts[i][1], rear.z],
      [rear.pts[j][0], rear.pts[j][1], rear.z],
      NOZZLE[0], NOZZLE[1], NOZZLE[2], 0.55
    );
  }

  // 2. Twin Side Supersonic Engine Intakes + Crimson Leading Trim
  for (const s of [-1, 1]) {
    const xIn = 1.05 * s;
    const xOut = 1.88 * s;
    const intake = [
      { z: -2.4, pts: [[xIn, 0.38], [xOut, 0.24], [xOut * 0.94, -0.42], [xIn, -0.48]] },
      { z: -1.8, pts: [[xIn, 0.44], [xOut * 1.04, 0.30], [xOut * 0.98, -0.46], [xIn, -0.52]] },
      { z: 3.4, pts: [[xIn * 0.92, 0.46], [xOut * 0.98, 0.26], [xOut * 0.90, -0.46], [xIn * 0.92, -0.48]] },
      { z: 6.2, pts: [[xIn * 0.72, 0.36], [xOut * 0.72, 0.22], [xOut * 0.66, -0.36], [xIn * 0.72, -0.38]] },
    ];
    // Ensure consistent winding for both sides
    if (s < 0) {
      for (const st of intake) st.pts.reverse();
    }
    pushLoft(body, intake, [CRIMSON, PEARL, COBALT], 0.52);
  }

  // 3. Glossy Tinted Bubble Canopy + Dorsal Avionics Spine
  const canopyStations = [
    { z: -4.3, pts: octagonalRing(0.18, 0.14, 0.02, 0.56) },
    { z: -3.2, pts: octagonalRing(0.64, 0.76, 0.02, 0.58) },
    { z: -1.5, pts: octagonalRing(0.74, 0.86, 0.02, 0.62) },
    { z: 0.4, pts: octagonalRing(0.62, 0.64, 0.02, 0.64) },
    { z: 2.2, pts: octagonalRing(0.32, 0.24, 0.02, 0.74) },
  ];
  pushLoft(body, canopyStations, [CANOPY, CANOPY, CANOPY, TITANIUM], 0.96);

  // Pilot helmet silhouette & glowing green HUD combiner visible under canopy
  pushQuad(
    body,
    [-0.18, 0.88, -2.95], [0.18, 0.88, -2.95],
    [0.14, 1.12, -2.75], [-0.14, 1.12, -2.75],
    0.25, 1.0, 0.62, 0.05
  );

  // 4. Swept Delta Main Wings (Inner Pearl Strake + Outer Cobalt Wing + Crimson Wingtip Flashes)
  for (const s of [-1, 1]) {
    // Inner wing root strake (pearl white)
    pushAirfoilPanel(body, s, [1.35, -0.05, -2.5], [1.45, -0.05, 3.6], [3.65, -0.08, 0.15], [3.65, -0.08, 3.85], 0.26, 0.19, PEARL[0], PEARL[1], PEARL[2], 0.54);
    // Mid-outer swept wing (cobalt navy livery)
    pushAirfoilPanel(body, s, [3.65, -0.08, 0.15], [3.65, -0.08, 3.85], [6.35, -0.14, 2.55], [6.35, -0.14, 4.35], 0.19, 0.11, COBALT[0], COBALT[1], COBALT[2], 0.58);
    // Crimson wingtip finlet / rail
    pushAirfoilPanel(body, s, [6.35, -0.14, 2.55], [6.35, -0.14, 4.35], [7.05, -0.16, 3.10], [7.05, -0.16, 4.55], 0.11, 0.06, CRIMSON[0], CRIMSON[1], CRIMSON[2], 0.55);
  }

  // 5. All-Moving Swept Horizontal Stabilators (tailplanes)
  for (const s of [-1, 1]) {
    pushAirfoilPanel(body, s, [1.22, 0.04, 4.35], [1.10, 0.04, 6.25], [3.45, -0.08, 5.55], [3.45, -0.08, 6.85], 0.14, 0.07, COBALT[0], COBALT[1], COBALT[2], 0.56);
  }

  // 6. Twin Canted Vertical Tail Fins (iconic twin-tail interceptor silhouette + crimson fin flashes)
  for (const s of [-1, 1]) {
    const rLE = [1.05 * s, 0.58, 3.35];
    const rTE = [1.02 * s, 0.52, 6.15];
    const tLE = [2.15 * s, 2.82, 5.10];
    const tTE = [2.12 * s, 2.75, 6.65];
    const thick = 0.10;
    const emitFin = (a, b, c, d, col) => {
      pushQuad(body, [a[0] + thick, a[1], a[2]], [b[0] + thick, b[1], b[2]], [c[0] + thick * 0.5, c[1], c[2]], [d[0] + thick * 0.5, d[1], d[2]], col[0], col[1], col[2], 0.56);
      pushQuad(body, [b[0] - thick, b[1], b[2]], [a[0] - thick, a[1], a[2]], [d[0] - thick * 0.5, d[1], d[2]], [c[0] - thick * 0.5, c[1], c[2]], col[0], col[1], col[2], 0.56);
    };
    // Lower cobalt fin + upper crimson fin tip flash
    const mLE = [rLE[0] * 0.35 + tLE[0] * 0.65, rLE[1] * 0.35 + tLE[1] * 0.65, rLE[2] * 0.35 + tLE[2] * 0.65];
    const mTE = [rTE[0] * 0.35 + tTE[0] * 0.65, rTE[1] * 0.35 + tTE[1] * 0.65, rTE[2] * 0.35 + tTE[2] * 0.65];
    emitFin(rLE, rTE, mTE, mLE, COBALT);
    emitFin(mLE, mTE, tTE, tLE, CRIMSON);
  }

  // 7. Twin Recessed Jet Exhaust Nozzles (metallic titanium shrouds)
  for (const s of [-1, 1]) {
    const nx = 0.62 * s;
    const segs = 12;
    const r0 = 0.50;
    const r1 = 0.42;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [nx + Math.cos(a0) * r0, 0.02 + Math.sin(a0) * r0, 6.2];
      const p1 = [nx + Math.cos(a1) * r0, 0.02 + Math.sin(a1) * r0, 6.2];
      const p2 = [nx + Math.cos(a1) * r1, 0.02 + Math.sin(a1) * r1, 7.25];
      const p3 = [nx + Math.cos(a0) * r1, 0.02 + Math.sin(a0) * r1, 7.25];
      pushQuad(body, p0, p3, p2, p1, TITANIUM[0], TITANIUM[1], TITANIUM[2], 0.72);
    }
  }

  // 8. Wingtip Navigation Lights (port RED, starboard GREEN, dorsal tail WHITE strobe)
  const navLights = [];
  function pushOrb(out, cx, cy, cz, rad, r, g, b) {
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
      pushTri(out, a, bP, c, r, g, b, 0.04);
    }
  }
  pushOrb(navLights, -7.12, -0.15, 3.85, 0.24, 1.0, 0.16, 0.14); // Port red
  pushOrb(navLights, 7.12, -0.15, 3.85, 0.24, 0.14, 1.0, 0.36);  // Starboard green
  pushOrb(navLights, 0.0, 0.95, 6.25, 0.18, 1.0, 0.96, 0.88);    // Tail strobe

  // 9. Separate Retractable Tricycle Landing Gear Geometry (rendered when gear > 0.05)
  const gear = [];
  function pushStrutAndWheel(x, z, dropY, wheelR) {
    // Strut leg
    const w = 0.11;
    pushQuad(gear, [x - w, -0.35, z - w], [x + w, -0.35, z - w], [x + w, -dropY, z - w], [x - w, -dropY, z - w], 0.78, 0.80, 0.84, 0.55);
    pushQuad(gear, [x + w, -0.35, z + w], [x - w, -0.35, z + w], [x - w, -dropY, z + w], [x + w, -dropY, z + w], 0.78, 0.80, 0.84, 0.55);
    // Rubber tire wheel box
    const tw = 0.22;
    const wy = -dropY;
    pushQuad(gear, [x - tw, wy - wheelR, z - wheelR], [x + tw, wy - wheelR, z - wheelR], [x + tw, wy + wheelR, z - wheelR], [x - tw, wy + wheelR, z - wheelR], 0.12, 0.13, 0.15, 0.3);
    pushQuad(gear, [x + tw, wy - wheelR, z + wheelR], [x - tw, wy - wheelR, z + wheelR], [x - tw, wy + wheelR, z + wheelR], [x + tw, wy + wheelR, z + wheelR], 0.12, 0.13, 0.15, 0.3);
    pushQuad(gear, [x - tw, wy - wheelR, z + wheelR], [x - tw, wy - wheelR, z - wheelR], [x - tw, wy + wheelR, z - wheelR], [x - tw, wy + wheelR, z + wheelR], 0.16, 0.18, 0.20, 0.35);
    pushQuad(gear, [x + tw, wy - wheelR, z - wheelR], [x + tw, wy - wheelR, z + wheelR], [x + tw, wy + wheelR, z + wheelR], [x + tw, wy + wheelR, z - wheelR], 0.16, 0.18, 0.20, 0.35);
    pushQuad(gear, [x - tw, wy - wheelR, z - wheelR], [x - tw, wy - wheelR, z + wheelR], [x + tw, wy - wheelR, z + wheelR], [x + tw, wy - wheelR, z - wheelR], 0.10, 0.10, 0.12, 0.3);
  }
  pushStrutAndWheel(0, -4.6, 1.72, 0.42);     // Nose gear
  pushStrutAndWheel(-1.85, 1.45, 1.72, 0.48); // Left main gear
  pushStrutAndWheel(1.85, 1.45, 1.72, 0.48);  // Right main gear
  // Nose taxi/landing spotlight
  pushOrb(gear, 0, -1.05, -4.82, 0.18, 1.0, 0.96, 0.82);

  // 10. Separate Animated Wing Flaps (deflected downward when flaps deployed)
  const flaps = [];
  for (const s of [-1, 1]) {
    pushAirfoilPanel(flaps, s, [1.55, -0.10, 3.65], [1.55, -0.45, 4.48], [4.10, -0.14, 3.92], [4.10, -0.48, 4.72], 0.08, 0.06, CRIMSON[0], CRIMSON[1], CRIMSON[2], 0.5);
  }

  // 11. Twin Glowing Cobalt-to-Amber Afterburner Plume Cones (FX shader: pos 3 + rgba 4)
  const plumes = [];
  const segs = 14;
  for (const s of [-1, 1]) {
    const nx = 0.62 * s;
    const ny = 0.02;
    const zStart = 7.15;
    const zMid = 9.0;
    const zEnd = 12.2;
    const r0 = 0.36;
    const rMid = 0.22;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      // Electric cobalt-cyan nozzle core -> fiery amber-orange mid flame -> fading crimson tip
      const p0 = [nx + c0 * r0, ny + s0 * r0, zStart, 0.32, 0.72, 1.0, 0.94];
      const p1 = [nx + c1 * r0, ny + s1 * r0, zStart, 0.32, 0.72, 1.0, 0.94];
      const p2 = [nx + c1 * rMid, ny + s1 * rMid, zMid, 1.0, 0.50, 0.08, 0.76];
      const p3 = [nx + c0 * rMid, ny + s0 * rMid, zMid, 1.0, 0.50, 0.08, 0.76];
      const tip = [nx, ny, zEnd, 0.95, 0.22, 0.02, 0.0];

      plumes.push(
        ...p0, ...p1, ...p2,
        ...p0, ...p2, ...p3,
        ...p3, ...p2, ...tip
      );
    }
  }

  return {
    body: { vertices: new Float32Array(body), count: body.length / 10 },
    navLights: { vertices: new Float32Array(navLights), count: navLights.length / 10 },
    gear: { vertices: new Float32Array(gear), count: gear.length / 10 },
    flaps: { vertices: new Float32Array(flaps), count: flaps.length / 10 },
    plumes: { vertices: new Float32Array(plumes), count: plumes.length / 7 },
  };
}

// Build glowing 3D aerial checkpoint ring (torus frame + inner directional chevron glow)
export function buildTargetRingGeometry(radius = 34, tube = 2.6) {
  const out = [];
  const majorSegs = 36;
  const minorSegs = 8;

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
        const bright = 0.78 + 0.22 * sv;
        return [rr * cu, rr * su, tube * sv, bright, bright, bright, 0.94];
      };
      const a = pt(cu0, su0, cv0, sv0);
      const b = pt(cu1, su1, cv0, sv0);
      const c = pt(cu1, su1, cv1, sv1);
      const d = pt(cu0, su0, cv1, sv1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }

    // Add 4 outer aviation fin tabs at cardinal points (0, 90, 180, 270 deg)
    if (i % 9 === 0) {
      const rIn = radius + tube * 0.6;
      const rOut = radius + tube * 3.8;
      const w = 0.08;
      const ca = Math.cos(u0 - w), sa = Math.sin(u0 - w);
      const cb = Math.cos(u0 + w), sb = Math.sin(u0 + w);
      const p0 = [ca * rIn, sa * rIn, -1.8, 1, 1, 1, 0.95];
      const p1 = [cb * rIn, sb * rIn, -1.8, 1, 1, 1, 0.95];
      const p2 = [cb * rOut, sb * rOut, 0, 1, 1, 1, 0.95];
      const p3 = [ca * rOut, sa * rOut, 0, 1, 1, 1, 0.95];
      const p4 = [ca * rIn, sa * rIn, 1.8, 1, 1, 1, 0.95];
      const p5 = [cb * rIn, sb * rIn, 1.8, 1, 1, 1, 0.95];
      out.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      out.push(...p4, ...p2, ...p5, ...p4, ...p3, ...p2);
    }
  }

  // Soft translucent luminous halo inside the ring perimeter
  const haloIn = radius - tube * 3.2;
  const haloOut = radius - tube * 0.4;
  for (let i = 0; i < majorSegs; i++) {
    const u0 = (i / majorSegs) * Math.PI * 2;
    const u1 = ((i + 1) / majorSegs) * Math.PI * 2;
    const a = [Math.cos(u0) * haloIn, Math.sin(u0) * haloIn, 0, 1, 1, 1, 0.0];
    const b = [Math.cos(u1) * haloIn, Math.sin(u1) * haloIn, 0, 1, 1, 1, 0.0];
    const c = [Math.cos(u1) * haloOut, Math.sin(u1) * haloOut, 0, 1, 1, 1, 0.42];
    const d = [Math.cos(u0) * haloOut, Math.sin(u0) * haloOut, 0, 1, 1, 1, 0.42];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  return { vertices: new Float32Array(out), count: out.length / 7 };
}

// Build glowing billboard quad/octahedron used for PAPI glideslope lamps
export function buildLampGeometry() {
  const out = [];
  const r = 2.4;
  const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const oct = [
    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
    [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
  ];
  for (const [i0, i1, i2] of oct) {
    out.push(
      dirs[i0][0] * r, dirs[i0][1] * r, dirs[i0][2] * r, 1, 1, 1, 1,
      dirs[i1][0] * r, dirs[i1][1] * r, dirs[i1][2] * r, 1, 1, 1, 1,
      dirs[i2][0] * r, dirs[i2][1] * r, dirs[i2][2] * r, 1, 1, 1, 1,
    );
  }
  return { vertices: new Float32Array(out), count: out.length / 7 };
}
