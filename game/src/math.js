// FJORDWING — Deterministic PRNG, 3D vector, matrix, basis, and projection math utilities.

export function createRng(seed = 1) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(d) {
  return (d * Math.PI) / 180;
}

export function radToDeg(r) {
  return (r * 180) / Math.PI;
}

export function wrapAngleDeg(deg) {
  let r = deg % 360;
  if (r < 0) r += 360;
  return r;
}

export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function vec3Clone(a) {
  return { x: a.x, y: a.y, z: a.z };
}

export function vec3Add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vec3Dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3Len(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function vec3Norm(a) {
  const len = Math.hypot(a.x, a.y, a.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function vec3Lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function vec3Dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Orthonormal 3D aircraft orientation basis { forward, right, up } with zero gimbal lock.
export function basisFromHeadingPitchRoll(headingDeg, pitchDeg, rollDeg) {
  const h = degToRad(headingDeg);
  const p = degToRad(pitchDeg);
  const r = degToRad(rollDeg);

  // Heading 0 = North (-Z), 90 = East (+X)
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  let forward = { x: fx, y: 0, z: fz };
  let up = { x: 0, y: 1, z: 0 };
  let right = vec3Cross(forward, up);

  // Apply pitch around right axis
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const f1 = {
    x: forward.x * cp + up.x * sp,
    y: forward.y * cp + up.y * sp,
    z: forward.z * cp + up.z * sp,
  };
  const u1 = {
    x: up.x * cp - forward.x * sp,
    y: up.y * cp - forward.y * sp,
    z: up.z * cp - forward.z * sp,
  };
  forward = f1;
  up = u1;

  // Apply roll around forward axis (positive roll = right wing down)
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const r2 = {
    x: right.x * cr - up.x * sr,
    y: right.y * cr - up.y * sr,
    z: right.z * cr - up.z * sr,
  };
  const u2 = {
    x: up.x * cr + right.x * sr,
    y: up.y * cr + right.y * sr,
    z: up.z * cr + right.z * sr,
  };
  return orthonormalizeBasis({ forward, right: r2, up: u2 });
}

export function rotateBasisLocal(basis, dPitch, dRoll, dYaw) {
  let { forward, right, up } = basis;

  if (Math.abs(dPitch) > 1e-7) {
    const c = Math.cos(dPitch);
    const s = Math.sin(dPitch);
    const nf = {
      x: forward.x * c + up.x * s,
      y: forward.y * c + up.y * s,
      z: forward.z * c + up.z * s,
    };
    const nu = {
      x: up.x * c - forward.x * s,
      y: up.y * c - forward.y * s,
      z: up.z * c - forward.z * s,
    };
    forward = nf;
    up = nu;
  }

  if (Math.abs(dRoll) > 1e-7) {
    const c = Math.cos(dRoll);
    const s = Math.sin(dRoll);
    const nr = {
      x: right.x * c - up.x * s,
      y: right.y * c - up.y * s,
      z: right.z * c - up.z * s,
    };
    const nu = {
      x: up.x * c + right.x * s,
      y: up.y * c + right.y * s,
      z: up.z * c + right.z * s,
    };
    right = nr;
    up = nu;
  }

  if (Math.abs(dYaw) > 1e-7) {
    const c = Math.cos(dYaw);
    const s = Math.sin(dYaw);
    const nf = {
      x: forward.x * c + right.x * s,
      y: forward.y * c + right.y * s,
      z: forward.z * c + right.z * s,
    };
    const nr = {
      x: right.x * c - forward.x * s,
      y: right.y * c - forward.y * s,
      z: right.z * c - forward.z * s,
    };
    forward = nf;
    right = nr;
  }

  return orthonormalizeBasis({ forward, right, up });
}

export function orthonormalizeBasis(basis) {
  const forward = vec3Norm(basis.forward);
  const right = vec3Norm(vec3Cross(forward, basis.up));
  const up = vec3Norm(vec3Cross(right, forward));
  return { forward, right, up };
}

export function extractTelemetryAngles(basis) {
  const headingDeg = wrapAngleDeg(radToDeg(Math.atan2(basis.forward.x, -basis.forward.z)));
  const pitchRad = Math.asin(clamp(basis.forward.y, -1, 1));
  // Horizon-relative bank angle (positive = right wing down)
  const worldUp = { x: 0, y: 1, z: 0 };
  let horizRight = vec3Cross(basis.forward, worldUp);
  if (vec3Len(horizRight) < 1e-4) {
    horizRight = basis.right;
  } else {
    horizRight = vec3Norm(horizRight);
  }
  const horizUp = vec3Cross(horizRight, basis.forward);
  const rollRad = Math.atan2(vec3Dot(basis.up, horizRight), vec3Dot(basis.up, horizUp));
  return {
    headingDeg,
    pitchRad,
    pitchDeg: radToDeg(pitchRad),
    rollRad,
    rollDeg: radToDeg(rollRad),
  };
}

// Column-major 4x4 WebGL matrices
export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye, target, up) {
  const f = vec3Norm(vec3Sub(target, eye));
  const s = vec3Norm(vec3Cross(f, up));
  const u = vec3Cross(s, f);
  const m = new Float32Array(16);
  m[0] = s.x;
  m[4] = s.y;
  m[8] = s.z;
  m[12] = -vec3Dot(s, eye);
  m[1] = u.x;
  m[5] = u.y;
  m[9] = u.z;
  m[13] = -vec3Dot(u, eye);
  m[2] = -f.x;
  m[6] = -f.y;
  m[10] = -f.z;
  m[14] = vec3Dot(f, eye);
  m[15] = 1;
  return m;
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// Model matrix from aircraft basis (+X=right, +Y=up, +Z=-forward) and world position
export function mat4FromBasis(pos, basis, scale = 1) {
  const m = new Float32Array(16);
  m[0] = basis.right.x * scale;
  m[1] = basis.right.y * scale;
  m[2] = basis.right.z * scale;
  m[4] = basis.up.x * scale;
  m[5] = basis.up.y * scale;
  m[6] = basis.up.z * scale;
  m[8] = -basis.forward.x * scale;
  m[9] = -basis.forward.y * scale;
  m[10] = -basis.forward.z * scale;
  m[12] = pos.x;
  m[13] = pos.y;
  m[14] = pos.z;
  m[15] = 1;
  return m;
}

export function mat4TranslateScale(x, y, z, sx = 1, sy = sx, sz = sx) {
  const m = new Float32Array(16);
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  m[12] = x;
  m[13] = y;
  m[14] = z;
  m[15] = 1;
  return m;
}

export function mat4RotateY(angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const m = mat4Identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mat4RotateZ(angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const m = mat4Identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

export function projectWorldPoint(point, viewProj, width, height) {
  const x = point.x;
  const y = point.y;
  const z = point.z;
  const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
  const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
  const cz = viewProj[2] * x + viewProj[6] * y + viewProj[10] * z + viewProj[14];
  const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
  if (cw <= 0.05) {
    return { x: (cx / (Math.abs(cw) + 1e-4)) * 0.5 * width + width * 0.5, y: height * 0.5, visible: false, behind: true, ndcZ: 1 };
  }
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  const sx = (ndcX * 0.5 + 0.5) * width;
  const sy = (0.5 - ndcY * 0.5) * height;
  const inBounds = ndcX >= -1.05 && ndcX <= 1.05 && ndcY >= -1.05 && ndcY <= 1.05 && ndcZ <= 1.0;
  return { x: sx, y: sy, visible: inBounds, behind: false, ndcX, ndcY, ndcZ };
}
