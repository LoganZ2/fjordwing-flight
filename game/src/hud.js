// FJORDWING — Sleek frameless collimated military fighter HUD, topographic fjord radar, ILS & storm rain overlay.

import { HUD_COLORS, RUNWAY, WORLD } from './config.js';
import { clamp, degToRad, projectWorldPoint, radToDeg, vec3Add, vec3Dist, vec3Scale, wrapAngleDeg } from './math.js';
import { getTerrainHeight } from './terrain.js';

// Precomputed high-res miniature terrain elevation grid for crisp Fjord Topographic Radar
const RADAR_CACHE = (() => {
  const N = 64;
  const half = 2850;
  const grid = new Uint8Array(N * N);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + (iz / (N - 1)) * half * 2;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + (ix / (N - 1)) * half * 2;
      const h = getTerrainHeight(x, z);
      if (h <= 1.5) grid[iz * N + ix] = 0;
      else if (h < 95) grid[iz * N + ix] = 1;
      else if (h < 250) grid[iz * N + ix] = 2;
      else grid[iz * N + ix] = 3;
    }
  }
  return { N, half, grid };
})();

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function formatMissionTime(sec) {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

// High-contrast subtle dark shadow halo so frameless HUD vector strokes pop crisply over bright golden sky!
function setHudGlow(ctx, blur = 5) {
  ctx.shadowColor = 'rgba(0, 10, 16, 0.82)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}

function clearHudGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function drawTacticalRadar(ctx, cx, cy, radius, world, rangeM = 2600, showLabel = true) {
  const craft = world.aircraft;
  const hdgRad = degToRad(craft.telemetry.headingDeg);
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  ctx.save();

  // Outer soft drop shadow
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(3, 9, 16, 0.56)';
  ctx.fill();

  // Glass scope aperture
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const bgGrad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  bgGrad.addColorStop(0, 'rgba(8, 24, 36, 0.80)');
  bgGrad.addColorStop(0.82, 'rgba(4, 14, 24, 0.88)');
  bgGrad.addColorStop(1, 'rgba(2, 9, 16, 0.94)');
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.clip();

  // Transform world coordinates into heading-up radar space
  const scale = radius / rangeM;
  const cosH = Math.cos(-hdgRad);
  const sinH = Math.sin(-hdgRad);
  function worldToRadar(wx, wz) {
    const dx = wx - craft.pos.x;
    const dz = wz - craft.pos.z;
    const rx = dx * cosH + dz * sinH;
    const ry = -dx * sinH + dz * cosH;
    return { x: cx + rx * scale, y: cy + ry * scale };
  }

  // Plot Skjold Fjord multi-elevation topographic contours
  const { N, half, grid } = RADAR_CACHE;
  const cellW = (half * 2) / (N - 1);
  const dotSz = Math.max(2.6, (cellW * scale) * 1.15);
  for (let iz = 0; iz < N; iz++) {
    const wz = -half + iz * cellW;
    for (let ix = 0; ix < N; ix++) {
      const tag = grid[iz * N + ix];
      if (tag === 0) continue;
      const wx = -half + ix * cellW;
      const pt = worldToRadar(wx, wz);
      if (Math.hypot(pt.x - cx, pt.y - cy) > radius + 3) continue;
      if (tag === 1) ctx.fillStyle = 'rgba(32, 128, 96, 0.28)';
      else if (tag === 2) ctx.fillStyle = 'rgba(56, 152, 138, 0.34)';
      else ctx.fillStyle = 'rgba(148, 212, 240, 0.36)';
      ctx.fillRect(pt.x - dotSz * 0.5, pt.y - dotSz * 0.5, dotSz, dotSz);
    }
  }

  // Animated faint radar sweep wedge
  const sweepAng = ((world.time * 1.15) % (Math.PI * 2)) - Math.PI * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, sweepAng - 0.42, sweepAng);
  ctx.closePath();
  const sweepGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
  sweepGrad.addColorStop(0, 'rgba(75, 255, 155, 0.04)');
  sweepGrad.addColorStop(1, 'rgba(75, 255, 155, 0.16)');
  ctx.fillStyle = sweepGrad;
  ctx.fill();

  // Range rings & crisp reticle ticks
  ctx.strokeStyle = 'rgba(88, 238, 255, 0.18)';
  ctx.lineWidth = 1;
  for (const frac of [0.35, 0.68]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * frac, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Illuminated Runway 09/27 strip
  const r0 = worldToRadar(RUNWAY.START_X, RUNWAY.CENTER_Z);
  const r1 = worldToRadar(RUNWAY.END_X, RUNWAY.CENTER_Z);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();
  ctx.strokeStyle = HUD_COLORS.PRIMARY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();

  // Route polyline & checkpoint ring pips
  const remaining = world.rings.filter((r) => !r.cleared);
  if (remaining.length > 1) {
    ctx.strokeStyle = 'rgba(88, 238, 255, 0.40)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    remaining.forEach((r, idx) => {
      const p = worldToRadar(r.x, r.z);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  world.rings.forEach((ring, i) => {
    if (ring.cleared) return;
    const isAct = i === world.activeRingIndex;
    const p = worldToRadar(ring.x, ring.z);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    const clampedX = dist > radius - 7 ? cx + (dx / dist) * (radius - 7) : p.x;
    const clampedY = dist > radius - 7 ? cy + (dy / dist) * (radius - 7) : p.y;
    const col = ring.kind === 'fuel' ? HUD_COLORS.CYAN : (isAct ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(clampedX, clampedY, isAct ? 4.4 : 2.8, 0, Math.PI * 2);
    ctx.fill();
    if (isAct) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 7.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Own aircraft symbol at scope center
  ctx.fillStyle = HUD_COLORS.PRIMARY;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx + 5.5, cy + 5.5);
  ctx.lineTo(cx, cy + 2.2);
  ctx.lineTo(cx - 5.5, cy + 5.5);
  ctx.closePath();
  ctx.fill();

  // North cardinal indicator
  const northX = cx + Math.sin(-hdgRad) * (radius - 10);
  const northY = cy - Math.cos(-hdgRad) * (radius - 10);
  ctx.fillStyle = HUD_COLORS.CYAN;
  ctx.font = `800 9px ${mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', northX, northY);

  // Subtle top glass sheen reflection across radar scope
  const glint = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius * 0.4, cy + radius * 0.2);
  glint.addColorStop(0, 'rgba(180, 230, 255, 0.14)');
  glint.addColorStop(0.45, 'rgba(180, 230, 255, 0.02)');
  glint.addColorStop(1, 'rgba(180, 230, 255, 0.0)');
  ctx.fillStyle = glint;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // Crisp metallic compass bezel ring & degree notches
  ctx.save();
  ctx.strokeStyle = 'rgba(110, 230, 255, 0.52)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(75, 255, 155, 0.48)';
  ctx.lineWidth = 1.2;
  for (let deg = 0; deg < 360; deg += 30) {
    const a = degToRad(deg) - hdgRad;
    const len = deg % 90 === 0 ? 5.5 : 3.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * radius, cy - Math.cos(a) * radius);
    ctx.lineTo(cx + Math.sin(a) * (radius - len), cy - Math.cos(a) * (radius - len));
    ctx.stroke();
  }

  if (showLabel) {
    setHudGlow(ctx, 4);
    ctx.fillStyle = 'rgba(165, 240, 255, 0.90)';
    ctx.font = `700 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('TAC-MAP · RWY 09', cx, cy + radius + 14);
  }
  ctx.restore();
}

// Render sleek angled rain streaks during Nordic squall weather
export function drawWeatherOverlay(ctx, width, height, world) {
  const intensity = world.weather.rainIntensity;
  if (intensity <= 0.01) return;

  ctx.save();
  ctx.strokeStyle = `rgba(210, 232, 252, ${0.24 * intensity})`;
  ctx.lineWidth = 1.1;
  const count = Math.floor(90 * intensity);
  const t = world.time;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const seed = i * 197.31;
    const x = ((seed * 37.1 + t * 540) % (width + 140)) - 70;
    const y = ((seed * 91.7 + t * 1240) % (height + 120)) - 60;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 16, y + 40);
  }
  ctx.stroke();
  ctx.restore();
}

// Frameless Collimated Military Fighter HUD (Chase & Wingman modes)
// Frees 85%+ of viewport so golden fjord cliffs, sculpted VX-9 Kestrel & dramatic skies take center stage!
export function drawCollimatedHud(ctx, width, height, world, viewProj) {
  const craft = world.aircraft;
  const tel = craft.telemetry;
  const cx = width * 0.5;
  const cy = height * 0.46;
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const isWingman = world.cameraMode === 'wingman';

  drawWeatherOverlay(ctx, width, height, world);

  ctx.save();
  setHudGlow(ctx, 5);

  const hudGreen = HUD_COLORS.PRIMARY;
  const hudGreenSoft = 'rgba(75, 255, 155, 0.78)';
  const hudCyan = HUD_COLORS.CYAN;
  const hudAmber = HUD_COLORS.AMBER;

  // 1. CENTER COLLIMATED PITCH LADDER, BORESIGHT & VELOCITY VECTOR (Skip center clutter in scenic Wingman mode!)
  if (!isWingman) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 195, cy - 155, 390, 300);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(-tel.rollRad);

    const pxPerDeg = 6.0;
    const pitchOffset = tel.pitchDeg * pxPerDeg;

    ctx.strokeStyle = hudGreenSoft;
    ctx.fillStyle = hudGreen;
    ctx.lineWidth = 1.65;
    ctx.font = `700 10px ${mono}`;

    // Crisp segmented horizon line (0 deg)
    ctx.beginPath();
    ctx.moveTo(-140, pitchOffset);
    ctx.lineTo(-34, pitchOffset);
    ctx.moveTo(34, pitchOffset);
    ctx.lineTo(140, pitchOffset);
    ctx.stroke();

    // Pitch rungs (-30..+30 deg)
    for (let deg = -30; deg <= 30; deg += 10) {
      if (deg === 0) continue;
      const y = pitchOffset - deg * pxPerDeg;
      if (Math.abs(y) > 155) continue;
      const w = 64;
      const gap = 26;
      ctx.beginPath();
      if (deg < 0) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);
      ctx.moveTo(-w, y);
      ctx.lineTo(-gap, y);
      ctx.moveTo(gap, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const tick = deg > 0 ? 7 : -7;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(-w, y + tick);
      ctx.moveTo(w, y);
      ctx.lineTo(w, y + tick);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(deg)), -w - 6, y + 3.5);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(deg)), w + 6, y + 3.5);
    }
    ctx.restore();

    // Fixed boresight aircraft watermark (-v-)
    ctx.strokeStyle = hudGreen;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx, cy + 7);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.stroke();

    // Subtle lower bank-angle roll arc scale
    {
      const arcR = 132;
      ctx.strokeStyle = 'rgba(75, 255, 155, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy + 16, arcR, Math.PI * 0.34, Math.PI * 0.66);
      ctx.stroke();
      for (const bDeg of [-30, -15, 0, 15, 30]) {
        const a = Math.PI * 0.5 + degToRad(bDeg);
        const len = bDeg === 0 ? 8 : 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * arcR, cy + 16 + Math.sin(a) * arcR);
        ctx.lineTo(cx + Math.cos(a) * (arcR + len), cy + 16 + Math.sin(a) * (arcR + len));
        ctx.stroke();
      }
      // Live bank pointer triangle
      const bankA = Math.PI * 0.5 - clamp(tel.rollRad, -0.56, 0.56);
      const bx = cx + Math.cos(bankA) * (arcR - 2);
      const by = cy + 16 + Math.sin(bankA) * (arcR - 2);
      ctx.fillStyle = hudGreen;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flight-path velocity vector (-o-)
    if (craft.speed > 10) {
      const velAhead = vec3Add(craft.pos, vec3Scale(craft.vel, 14));
      const pVel = projectWorldPoint(velAhead, viewProj, width, height);
      if (pVel.visible) {
        const vx = clamp(pVel.x, cx - 175, cx + 175);
        const vy = clamp(pVel.y, cy - 125, cy + 125);
        ctx.strokeStyle = hudCyan;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(vx, vy, 7, 0, Math.PI * 2);
        ctx.moveTo(vx - 17, vy);
        ctx.lineTo(vx - 7, vy);
        ctx.moveTo(vx + 7, vy);
        ctx.lineTo(vx + 17, vy);
        ctx.moveTo(vx, vy - 7);
        ctx.lineTo(vx, vy - 14);
        ctx.stroke();
      }
    }
  }

  // 2. 3D PROJECTED TARGET GATE DESIGNATOR DIAMOND (Crisp frameless HUD marker!)
  {
    const activeRing = world.rings[world.activeRingIndex];
    if (activeRing && !activeRing.cleared) {
      const p = projectWorldPoint(activeRing, viewProj, width, height);
      const distM = vec3Dist(craft.pos, activeRing);
      const distLabel = distM > 1000 ? `${(distM / 1000).toFixed(1)} KM` : `${Math.round(distM)} M`;
      const ringCol = activeRing.kind === 'fuel' ? hudCyan : hudAmber;

      if (p.visible) {
        const tx = p.x;
        const ty = p.y;
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 14);
        ctx.lineTo(tx + 14, ty);
        ctx.lineTo(tx, ty + 14);
        ctx.lineTo(tx - 14, ty);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = ringCol;
        ctx.font = `800 11px ${mono}`;
        ctx.textAlign = 'center';
        ctx.fillText(activeRing.kind === 'fuel' ? `FUEL ${distLabel}` : `GATE ${distLabel}`, tx, ty + 28);
      } else {
        const angle = Math.atan2(p.y - cy, p.x - cx) + (p.behind ? Math.PI : 0);
        const ax = cx + Math.cos(angle) * 200;
        const ay = cy + Math.sin(angle) * 135;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.fillStyle = ringCol;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, -7);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 3. COLLIMATED ILS LOCALIZER & GLIDESLOPE SCALES (Frameless aviation reticle, never blocking aircraft!)
  const ils = world.ils;
  if (!isWingman && ils && ils.inApproachCone && (craft.gearDeployed || world.mission.id === 'ils' || world.activeRingIndex >= world.rings.length)) {
    const bw = 176;
    const ix = cx;
    const iy = cy - 4;
    const locY = iy + 54;

    // Horizontal Localizer dotted scale
    ctx.strokeStyle = 'rgba(88, 238, 255, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ix - bw * 0.5, locY);
    ctx.lineTo(ix + bw * 0.5, locY);
    ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(ix + k * 34, locY, k === 0 ? 3.4 : 2.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    const locX = ix + ils.locDev * 68;
    ctx.fillStyle = Math.abs(ils.locDev) < 0.25 ? hudGreen : hudAmber;
    ctx.beginPath();
    ctx.moveTo(locX, locY - 7.5);
    ctx.lineTo(locX + 6.5, locY);
    ctx.lineTo(locX, locY + 7.5);
    ctx.lineTo(locX - 6.5, locY);
    ctx.closePath();
    ctx.fill();

    // Vertical Glideslope dotted scale to right of center
    const gx = ix + bw * 0.66;
    ctx.strokeStyle = 'rgba(88, 238, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(gx, iy - 62);
    ctx.lineTo(gx, iy + 62);
    ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(gx, iy + k * 25, k === 0 ? 3.4 : 2.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    const gsY = iy - ils.gsDev * 50;
    ctx.fillStyle = Math.abs(ils.gsDev) < 0.28 ? hudGreen : hudAmber;
    ctx.beginPath();
    ctx.moveTo(gx - 7.5, gsY);
    ctx.lineTo(gx, gsY - 6.5);
    ctx.lineTo(gx + 7.5, gsY);
    ctx.lineTo(gx, gsY + 6.5);
    ctx.closePath();
    ctx.fill();

    // Clean frameless ILS telemetry line tucked cleanly ABOVE boresight (leaves aircraft tail 100% unobstructed!)
    ctx.fillStyle = hudCyan;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`ILS RWY 09 · ${ils.distNm.toFixed(1)} NM · GS ${ils.actualAngleDeg.toFixed(1)}°`, ix, iy - 82);
  }

  // 4. TOP FRAMELESS OPEN-SKY HEADING TAPE (True Fighter Jet Collimated Style!)
  {
    const tapeW = 350;
    const baseY = 36;

    // Horizontal scale rail
    ctx.strokeStyle = 'rgba(75, 255, 155, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - tapeW * 0.5, baseY);
    ctx.lineTo(cx + tapeW * 0.5, baseY);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - tapeW * 0.5, 4, tapeW, 44);
    ctx.clip();

    const hdg = tel.headingDeg;
    const pxPerDegH = 4.5;
    const startDeg = Math.floor((hdg - 38) / 5) * 5;
    const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

    ctx.strokeStyle = 'rgba(75, 255, 155, 0.85)';
    ctx.fillStyle = '#E8FFF2';
    ctx.font = `800 12px ${mono}`;
    ctx.textAlign = 'center';

    for (let d = startDeg; d <= hdg + 38; d += 5) {
      const x = cx + (d - hdg) * pxPerDegH;
      const wd = wrapAngleDeg(d);
      const isMajor = wd % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - (isMajor ? 10 : 5));
      ctx.stroke();
      if (isMajor && Math.abs(x - cx) < tapeW * 0.5 - 16) {
        const lbl = cardinals[wd] ?? String(Math.round(wd)).padStart(3, '0');
        ctx.fillText(lbl, x, baseY - 14);
      }
    }

    // Active gate or runway bearing caret bug on heading tape
    const targetPt = (world.rings[world.activeRingIndex] && !world.rings[world.activeRingIndex].cleared)
      ? world.rings[world.activeRingIndex]
      : { x: RUNWAY.TOUCHDOWN_X, z: RUNWAY.CENTER_Z };
    const tgtBrg = wrapAngleDeg(radToDeg(Math.atan2(targetPt.x - craft.pos.x, -(targetPt.z - craft.pos.z))));
    let diff = tgtBrg - hdg;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const bugX = cx + clamp(diff, -36, 36) * pxPerDegH;
    ctx.fillStyle = hudAmber;
    ctx.beginPath();
    ctx.moveTo(bugX, baseY + 1);
    ctx.lineTo(bugX - 5, baseY + 8);
    ctx.lineTo(bugX + 5, baseY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Open-bottom center heading caret & crisp digital HDG box
    ctx.fillStyle = hudGreen;
    ctx.beginPath();
    ctx.moveTo(cx, baseY + 1);
    ctx.lineTo(cx - 5, baseY + 8);
    ctx.lineTo(cx + 5, baseY + 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(4, 14, 20, 0.44)';
    roundRectPath(ctx, cx - 38, baseY + 10, 76, 23, 4);
    ctx.fill();
    ctx.strokeStyle = hudGreen;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = hudGreen;
    ctx.font = `800 15px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, cx, baseY + 27);
  }

  // 5. LEFT FRAMELESS OPEN-SKY AIRSPEED LADDER (F/A-18 / Gripen Fighter Style!)
  {
    const railX = isWingman ? 106 : Math.max(115, cx - 295);
    const tapeH = 210;
    const topY = cy - tapeH * 0.5;
    const kt = Math.round(craft.airspeedKt);
    const col = craft.stall ? HUD_COLORS.DANGER : (craft.overspeed ? hudAmber : hudGreen);

    // Vertical tick rail
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(railX, topY);
    ctx.lineTo(railX, topY + tapeH);
    ctx.moveTo(railX - 10, topY);
    ctx.lineTo(railX, topY);
    ctx.moveTo(railX - 10, topY + tapeH);
    ctx.lineTo(railX, topY + tapeH);
    ctx.stroke();

    // Rolling airspeed graduations
    ctx.save();
    ctx.beginPath();
    ctx.rect(railX - 88, topY + 6, 88, tapeH - 12);
    ctx.clip();
    const startKt = Math.floor((kt - 80) / 10) * 10;
    ctx.strokeStyle = 'rgba(75, 255, 155, 0.78)';
    ctx.fillStyle = '#E8FFF2';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'right';
    for (let k = startKt; k <= kt + 80; k += 10) {
      if (k < 0) continue;
      const ty = cy - (k - kt) * 1.45;
      if (Math.abs(ty - cy) < 18) continue; // Keep center readout box crystal clean
      const isMajor = k % 20 === 0;
      ctx.beginPath();
      ctx.moveTo(railX, ty);
      ctx.lineTo(railX - (isMajor ? 10 : 5), ty);
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(String(k), railX - 14, ty + 4);
      }
    }
    ctx.restore();

    // Pointed fighter chevron airspeed readout box
    ctx.fillStyle = 'rgba(4, 14, 20, 0.48)';
    ctx.beginPath();
    ctx.moveTo(railX - 4, cy);
    ctx.lineTo(railX - 14, cy - 14);
    ctx.lineTo(railX - 84, cy - 14);
    ctx.lineTo(railX - 84, cy + 14);
    ctx.lineTo(railX - 14, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.font = `800 18px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(kt).padStart(3, '0'), railX - 19, cy + 6);

    // Compact aviation speed captions right above & below ladder (KT, Mach, THR%)
    ctx.fillStyle = 'rgba(180, 245, 255, 0.92)';
    ctx.font = `800 10px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText('IAS KT', railX, topY - 11);

    const mach = (craft.speed / 340).toFixed(2);
    ctx.fillStyle = craft.afterburner ? hudAmber : hudGreen;
    ctx.font = `800 11px ${mono}`;
    ctx.fillText(`M ${mach}`, railX, topY + tapeH + 16);
    ctx.fillStyle = craft.afterburner ? hudAmber : 'rgba(205, 245, 230, 0.92)';
    ctx.fillText(craft.afterburner ? 'A/B MAX' : `THR ${Math.round(craft.throttle * 100)}%`, railX, topY + tapeH + 31);
  }

  // 6. RIGHT FRAMELESS OPEN-SKY ALTITUDE LADDER (Mirrors Airspeed Tape!)
  {
    const railX = isWingman ? (width - 106) : Math.min(width - 115, cx + 295);
    const tapeH = 210;
    const topY = cy - tapeH * 0.5;
    const altFt = Math.round(craft.altitudeFt);
    const lowWarn = craft.aglM < 32 && !craft.onGround && !craft.gearDeployed;
    const col = lowWarn ? hudAmber : hudGreen;

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(railX, topY);
    ctx.lineTo(railX, topY + tapeH);
    ctx.moveTo(railX, topY);
    ctx.lineTo(railX + 10, topY);
    ctx.moveTo(railX, topY + tapeH);
    ctx.lineTo(railX + 10, topY + tapeH);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(railX, topY + 6, 92, tapeH - 12);
    ctx.clip();
    const startAlt = Math.floor((altFt - 320) / 50) * 50;
    ctx.strokeStyle = 'rgba(75, 255, 155, 0.78)';
    ctx.fillStyle = '#E8FFF2';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'left';
    for (let a = startAlt; a <= altFt + 320; a += 50) {
      if (a < 0) continue;
      const ty = cy - (a - altFt) * 0.34;
      if (Math.abs(ty - cy) < 18) continue;
      const isMajor = a % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(railX, ty);
      ctx.lineTo(railX + (isMajor ? 10 : 5), ty);
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(String(a), railX + 14, ty + 4);
      }
    }
    ctx.restore();

    // Pointed fighter chevron altitude box
    ctx.fillStyle = 'rgba(4, 14, 20, 0.48)';
    ctx.beginPath();
    ctx.moveTo(railX + 4, cy);
    ctx.lineTo(railX + 14, cy - 14);
    ctx.lineTo(railX + 90, cy - 14);
    ctx.lineTo(railX + 90, cy + 14);
    ctx.lineTo(railX + 14, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.font = `800 18px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(altFt), railX + 19, cy + 6);

    ctx.fillStyle = 'rgba(180, 245, 255, 0.92)';
    ctx.font = `800 10px ${mono}`;
    ctx.fillText('ALT FT', railX, topY - 11);

    const aglFt = Math.round(craft.aglM * WORLD.M_TO_FT);
    const vsiVal = Math.round(craft.vsiFpm / 10) * 10;
    const vsiSign = vsiVal >= 0 ? '+' : '';
    ctx.fillStyle = hudGreen;
    ctx.font = `800 11px ${mono}`;
    ctx.fillText(`R ${aglFt} FT`, railX, topY + tapeH + 16);
    ctx.fillStyle = Math.abs(vsiVal) > 1600 ? hudAmber : 'rgba(205, 245, 230, 0.90)';
    ctx.fillText(`VS ${vsiSign}${vsiVal}`, railX, topY + tapeH + 31);
  }

  // 7. MINIMAL FRAMELESS TOP-LEFT MISSION SORTIE TELEMETRY STRIP (Zero boxy chrome, crisp legibility scrim!)
  {
    const x = 24;
    const y = 20;
    const scrimL = ctx.createLinearGradient(0, 0, 355, 0);
    scrimL.addColorStop(0, 'rgba(4, 10, 18, 0.52)');
    scrimL.addColorStop(0.75, 'rgba(4, 10, 18, 0.22)');
    scrimL.addColorStop(1, 'rgba(4, 10, 18, 0.0)');
    ctx.fillStyle = scrimL;
    ctx.fillRect(0, 0, 355, 68);

    ctx.fillStyle = hudAmber;
    ctx.fillRect(x, y, 3, 34);

    ctx.fillStyle = hudAmber;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${world.mission.code} · ${world.mission.name}`, x + 11, y + 12);

    const total = world.rings.length;
    const cleared = world.ringsCleared;
    let objText = '';
    if (world.mission.objectiveType === 'land') {
      objText = `ILS RWY 09 · GEAR ${craft.gearDeployed ? 'DN' : 'UP'} · ${formatMissionTime(world.missionTime)}`;
    } else if (cleared < total) {
      objText = `GATES ${cleared}/${total} · ${formatMissionTime(world.missionTime)} · ${world.score} PTS`;
    } else {
      objText = `ALL GATES CLEAR · LAND RWY 09 · ${formatMissionTime(world.missionTime)}`;
    }
    ctx.fillStyle = '#F2FAFF';
    ctx.font = `700 12px ${mono}`;
    ctx.fillText(objText, x + 11, y + 30);
  }

  // 8. MINIMAL FRAMELESS TOP-RIGHT CAMERA & WEATHER TAG
  {
    const x = width - 24;
    const y = 20;
    const scrimR = ctx.createLinearGradient(width, 0, width - 350, 0);
    scrimR.addColorStop(0, 'rgba(4, 10, 18, 0.52)');
    scrimR.addColorStop(0.75, 'rgba(4, 10, 18, 0.22)');
    scrimR.addColorStop(1, 'rgba(4, 10, 18, 0.0)');
    ctx.fillStyle = scrimR;
    ctx.fillRect(width - 350, 0, 350, 64);

    ctx.fillStyle = hudCyan;
    ctx.fillRect(x - 3, y, 3, 30);

    ctx.fillStyle = hudCyan;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${world.cameraMode.toUpperCase()} [C] · ${world.weather.label}`, x - 11, y + 12);
    ctx.fillStyle = 'rgba(225, 242, 255, 0.86)';
    ctx.font = `600 10px ${mono}`;
    ctx.fillText('[V] FLAPS · [G] GEAR · [B] BRK · [P] MENU', x - 11, y + 27);
  }

  // 9. MINIMAL TRANSLUCENT BOTTOM-LEFT AIRCRAFT SYSTEMS STRIP (Compact, crisp, non-intrusive!)
  {
    const x = 24;
    const y = height - 64;

    const fuelCol = craft.fuel < 22 ? HUD_COLORS.DANGER : (craft.fuel < 45 ? hudAmber : hudCyan);
    const hullCol = craft.hull < 45 ? HUD_COLORS.DANGER : (craft.hull < 75 ? hudAmber : hudGreen);

    const drawSlimGauge = (bx, by, bw, lbl, pct, col) => {
      ctx.fillStyle = 'rgba(220, 242, 255, 0.90)';
      ctx.font = `800 10px ${mono}`;
      ctx.textAlign = 'left';
      ctx.fillText(lbl, bx, by);
      ctx.fillStyle = col;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(pct)}%`, bx + bw, by);

      ctx.fillStyle = 'rgba(6, 18, 28, 0.52)';
      ctx.fillRect(bx, by + 5, bw, 5);
      ctx.fillStyle = col;
      ctx.fillRect(bx, by + 5, bw * clamp(pct / 100, 0, 1), 5);
    };

    drawSlimGauge(x, y, 122, 'FUEL', craft.fuel, fuelCol);
    drawSlimGauge(x + 138, y, 118, 'HULL', craft.hull, hullCol);

    // Compact fighter annunciator tags right beneath fuel/hull
    const tags = [
      { label: 'A/B', on: craft.afterburner, col: hudAmber },
      { label: 'GEAR', on: craft.gearDeployed, col: hudGreen },
      { label: 'FLAPS', on: craft.flaps > 0.5, col: hudCyan },
      { label: 'BRK', on: craft.speedbrake, col: hudAmber },
      { label: `${craft.gLoad.toFixed(1)}G`, on: true, col: Math.abs(craft.gLoad) > 4.5 ? hudAmber : hudGreen },
    ];
    let tx = x;
    const ty = y + 22;
    for (const tg of tags) {
      const tw = 48;
      if (tg.on) {
        ctx.fillStyle = 'rgba(6, 18, 26, 0.52)';
        roundRectPath(ctx, tx, ty, tw, 20, 3);
        ctx.fill();
        ctx.strokeStyle = tg.col;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = tg.col;
      } else {
        ctx.strokeStyle = 'rgba(180, 215, 235, 0.28)';
        ctx.lineWidth = 1.0;
        roundRectPath(ctx, tx, ty, tw, 20, 3);
        ctx.stroke();
        ctx.fillStyle = 'rgba(195, 222, 240, 0.48)';
      }
      ctx.font = `800 10px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(tg.label, tx + tw * 0.5, ty + 13.5);
      tx += tw + 6;
    }
  }

  clearHudGlow(ctx);

  // 10. BOTTOM-RIGHT CIRCULAR GLASS FJORD TOPOGRAPHIC RADAR
  drawTacticalRadar(ctx, width - 86, height - 96, 62, world, 2600, true);

  // 11. WARNINGS & TOUCHDOWN BANNERS
  let bannerText = null;
  let bannerColor = hudAmber;
  if (craft.stall) {
    bannerText = 'STALL WARNING · PITCH DOWN / ADD THRUST';
    bannerColor = HUD_COLORS.DANGER;
  } else if (craft.overspeed) {
    bannerText = 'OVERSPEED · REDUCE THROTTLE';
    bannerColor = hudAmber;
  } else if (craft.fuel <= 0) {
    bannerText = 'FLAMEOUT · GLIDE TO RUNWAY 09';
    bannerColor = HUD_COLORS.DANGER;
  } else if (craft.fuel < 18) {
    bannerText = 'BINGO FUEL · CONSERVE AFTERBURNER';
    bannerColor = hudAmber;
  } else if (craft.touchdownBanner && craft.touchdownTimer > 0) {
    bannerText = craft.touchdownBanner;
    bannerColor = hudGreen;
  }

  if (bannerText) {
    setHudGlow(ctx, 6);
    ctx.font = `800 13px ${sans}`;
    const tw = Math.max(250, ctx.measureText(bannerText).width + 38);
    const bx = cx - tw * 0.5;
    const by = 82;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
    roundRectPath(ctx, bx, by, tw, 30, 5);
    ctx.fill();
    ctx.strokeStyle = bannerColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = bannerColor;
    ctx.textAlign = 'center';
    ctx.fillText(bannerText, cx, by + 20);
  }

  ctx.restore();
}
