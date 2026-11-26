// FJORDWING — High-DPI collimated vector Chase/Wingman HUD, ILS guidance, corner radar & storm rain overlay.

import { HUD_COLORS, RUNWAY, WORLD } from './config.js';
import { clamp, degToRad, projectWorldPoint, vec3Add, vec3Dist, vec3Scale, wrapAngleDeg } from './math.js';
import { getTerrainHeight } from './terrain.js';

// Precomputed miniature terrain elevation grid for crisp Fjord Tactical Radar
const RADAR_CACHE = (() => {
  const N = 48;
  const half = 2800;
  const grid = new Uint8Array(N * N);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + (iz / (N - 1)) * half * 2;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + (ix / (N - 1)) * half * 2;
      const h = getTerrainHeight(x, z);
      grid[iz * N + ix] = h > 2 ? (h > 260 ? 2 : 1) : 0;
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

export function drawTacticalRadar(ctx, cx, cy, radius, world, rangeM = 2600) {
  const craft = world.aircraft;
  const hdgRad = degToRad(craft.telemetry.headingDeg);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7, 17, 27, 0.84)';
  ctx.fill();
  ctx.clip();

  // Subtle range rings & crosshairs
  ctx.strokeStyle = 'rgba(60, 255, 142, 0.16)';
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

  // Transform world coordinates into heading-up radar space
  const scale = radius / rangeM;
  const cosH = Math.cos(-hdgRad);
  const sinH = Math.sin(-hdgRad);
  function worldToRadar(wx, wz) {
    const dx = wx - craft.pos.x;
    const dz = wz - craft.pos.z;
    // Heading 0 = North (-Z) -> radar up (-Y)
    const rx = dx * cosH + dz * sinH;
    const ry = -dx * sinH + dz * cosH;
    return { x: cx + rx * scale, y: cy + ry * scale };
  }

  // Plot Skjold Fjord archipelago landmass & alpine ridge blips
  const { N, half, grid } = RADAR_CACHE;
  const cellW = (half * 2) / (N - 1);
  for (let iz = 0; iz < N; iz++) {
    const wz = -half + iz * cellW;
    for (let ix = 0; ix < N; ix++) {
      const tag = grid[iz * N + ix];
      if (tag === 0) continue;
      const wx = -half + ix * cellW;
      const pt = worldToRadar(wx, wz);
      if (Math.hypot(pt.x - cx, pt.y - cy) > radius + 4) continue;
      ctx.fillStyle = tag === 2 ? 'rgba(130, 195, 220, 0.28)' : 'rgba(42, 138, 108, 0.25)';
      ctx.fillRect(pt.x - 2.2, pt.y - 2.2, 4.4, 4.4);
    }
  }

  // Runway 09/27 illuminated tarmac bar on radar
  const r0 = worldToRadar(RUNWAY.START_X, RUNWAY.CENTER_Z);
  const r1 = worldToRadar(RUNWAY.END_X, RUNWAY.CENTER_Z);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();
  ctx.strokeStyle = '#3CFF8E';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();

  // Route polyline & checkpoint ring pips
  const remaining = world.rings.filter((r) => !r.cleared);
  if (remaining.length > 1) {
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.35)';
    ctx.lineWidth = 1.3;
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
    ctx.fillStyle = ring.kind === 'fuel' ? '#4CE8FF' : (isAct ? '#FFB422' : '#3CFF8E');
    ctx.beginPath();
    ctx.arc(clampedX, clampedY, isAct ? 4.8 : 3.0, 0, Math.PI * 2);
    ctx.fill();
    if (isAct) {
      ctx.strokeStyle = 'rgba(255, 180, 34, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 8.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Own aircraft heading chevron at radar center
  ctx.fillStyle = '#3CFF8E';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx + 6, cy + 6);
  ctx.lineTo(cx, cy + 2.5);
  ctx.lineTo(cx - 6, cy + 6);
  ctx.closePath();
  ctx.fill();

  // North cardinal tick on radar bezel
  const northX = cx + Math.sin(-hdgRad) * (radius - 10);
  const northY = cy - Math.cos(-hdgRad) * (radius - 10);
  ctx.fillStyle = '#4CE8FF';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', northX, northY);

  ctx.restore();

  // Radar outer chrome bezel
  ctx.strokeStyle = 'rgba(76, 232, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(76, 232, 255, 0.85)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RADAR · RWY 09', cx, cy + radius + 13);
}

// Render rain streaks in Nordic storm weather
export function drawWeatherOverlay(ctx, width, height, world) {
  const intensity = world.weather.rainIntensity;
  if (intensity <= 0.01) return;

  ctx.save();
  ctx.strokeStyle = `rgba(200, 224, 245, ${0.24 * intensity})`;
  ctx.lineWidth = 1.15;
  const count = Math.floor(85 * intensity);
  const t = world.time;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const seed = i * 197.31;
    const x = ((seed * 37.1 + t * 520) % (width + 140)) - 70;
    const y = ((seed * 91.7 + t * 1180) % (height + 120)) - 60;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 14, y + 36);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawCollimatedHud(ctx, width, height, world, viewProj) {
  const craft = world.aircraft;
  const tel = craft.telemetry;
  const cx = width * 0.5;
  const cy = height * 0.48;
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  drawWeatherOverlay(ctx, width, height, world);

  ctx.save();

  // 1. Center Collimated Pitch Ladder & Horizon Reference
  {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 210, cy - 165, 420, 325);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(-tel.rollRad);

    const pxPerDeg = 6.2;
    const pitchOffset = tel.pitchDeg * pxPerDeg;

    ctx.strokeStyle = 'rgba(60, 255, 142, 0.78)';
    ctx.fillStyle = 'rgba(60, 255, 142, 0.92)';
    ctx.lineWidth = 1.8;
    ctx.font = `700 11px ${mono}`;

    // Horizon line (0 deg)
    ctx.beginPath();
    ctx.moveTo(-145, pitchOffset);
    ctx.lineTo(-34, pitchOffset);
    ctx.moveTo(34, pitchOffset);
    ctx.lineTo(145, pitchOffset);
    ctx.stroke();

    // Pitch rungs (-30..+30 deg in 10 deg increments)
    for (let deg = -30; deg <= 30; deg += 10) {
      if (deg === 0) continue;
      const y = pitchOffset - deg * pxPerDeg;
      if (Math.abs(y) > 165) continue;
      const w = 68;
      const gap = 28;
      ctx.beginPath();
      if (deg < 0) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);
      ctx.moveTo(-w, y);
      ctx.lineTo(-gap, y);
      ctx.moveTo(gap, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // End ticks pointing toward horizon
      const tick = deg > 0 ? 7 : -7;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(-w, y + tick);
      ctx.moveTo(w, y);
      ctx.lineTo(w, y + tick);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(deg), -w - 6, y + 4);
      ctx.textAlign = 'left';
      ctx.fillText(String(deg), w + 6, y + 4);
    }

    ctx.restore();

    // Fixed boresight aircraft watermark (-v-)
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 9, cy);
    ctx.lineTo(cx, cy + 8);
    ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.stroke();

    // Flight path velocity vector (-o-)
    if (craft.speed > 10) {
      const velAhead = vec3Add(craft.pos, vec3Scale(craft.vel, 12));
      const pVel = projectWorldPoint(velAhead, viewProj, width, height);
      if (pVel.visible) {
        const vx = clamp(pVel.x, cx - 180, cx + 180);
        const vy = clamp(pVel.y, cy - 130, cy + 130);
        ctx.strokeStyle = HUD_COLORS.CYAN;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(vx, vy, 7.5, 0, Math.PI * 2);
        ctx.moveTo(vx - 18, vy);
        ctx.lineTo(vx - 7.5, vy);
        ctx.moveTo(vx + 7.5, vy);
        ctx.lineTo(vx + 18, vy);
        ctx.moveTo(vx, vy - 7.5);
        ctx.lineTo(vx, vy - 15);
        ctx.stroke();
      }
    }
  }

  // 2. 3D Projected Target Ring Designator Diamond & Runway 09 Approach Marker
  {
    const activeRing = world.rings[world.activeRingIndex];
    if (activeRing && !activeRing.cleared) {
      const p = projectWorldPoint(activeRing, viewProj, width, height);
      const distM = vec3Dist(craft.pos, activeRing);
      const distLabel = distM > 1000 ? `${(distM / 1000).toFixed(1)} KM` : `${Math.round(distM)} M`;
      const ringCol = activeRing.kind === 'fuel' ? HUD_COLORS.CYAN : HUD_COLORS.AMBER;

      if (p.visible) {
        const tx = p.x;
        const ty = p.y;
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 16);
        ctx.lineTo(tx + 16, ty);
        ctx.lineTo(tx, ty + 16);
        ctx.lineTo(tx - 16, ty);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(8, 16, 26, 0.78)';
        roundRectPath(ctx, tx - 40, ty + 20, 80, 20, 4);
        ctx.fill();
        ctx.fillStyle = ringCol;
        ctx.font = `700 11px ${mono}`;
        ctx.textAlign = 'center';
        ctx.fillText(`GATE ${distLabel}`, tx, ty + 34);
      } else {
        // Offscreen edge directional arrow
        const angle = Math.atan2(p.y - cy, p.x - cx) + (p.behind ? Math.PI : 0);
        const ax = cx + Math.cos(angle) * 210;
        const ay = cy + Math.sin(angle) * 140;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.fillStyle = ringCol;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -8);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 3. Active ILS Localizer & Glideslope Crosshairs when approaching Runway 09
  const ils = world.ils;
  if (ils && ils.inApproachCone && (craft.gearDeployed || world.mission.id === 'ils' || world.activeRingIndex >= world.rings.length)) {
    const bw = 186;
    const ix = cx;
    const iy = cy - 6;
    const locY = iy + 62;

    // Horizontal Localizer bar positioned cleanly above aircraft tail
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.78)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(ix - bw * 0.5, locY);
    ctx.lineTo(ix + bw * 0.5, locY);
    ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(ix + k * 34, locY, k === 0 ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Localizer diamond
    const locX = ix + ils.locDev * 68;
    ctx.fillStyle = Math.abs(ils.locDev) < 0.25 ? HUD_COLORS.PRIMARY : HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.moveTo(locX, locY - 8);
    ctx.lineTo(locX + 7, locY);
    ctx.lineTo(locX, locY + 8);
    ctx.lineTo(locX - 7, locY);
    ctx.closePath();
    ctx.fill();

    // Vertical Glideslope bar to the right of boresight
    const gx = ix + bw * 0.68;
    ctx.beginPath();
    ctx.moveTo(gx, iy - 66);
    ctx.lineTo(gx, iy + 66);
    ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(gx, iy + k * 27, k === 0 ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    const gsY = iy - ils.gsDev * 54;
    ctx.fillStyle = Math.abs(ils.gsDev) < 0.28 ? HUD_COLORS.PRIMARY : HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.moveTo(gx - 8, gsY);
    ctx.lineTo(gx, gsY - 7);
    ctx.lineTo(gx + 8, gsY);
    ctx.lineTo(gx, gsY + 7);
    ctx.closePath();
    ctx.fill();

    // ILS readout badge tucked neatly above the boresight area or below localizer without touching jet
    const pillW = 224;
    ctx.fillStyle = 'rgba(8, 18, 30, 0.88)';
    roundRectPath(ctx, ix - pillW * 0.5, locY + 12, pillW, 24, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`ILS RWY 09 · ${ils.distNm.toFixed(1)} NM · GS ${ils.actualAngleDeg.toFixed(1)}°`, ix, locY + 28);
  }

  // 4. TOP HEADING COMPASS TAPE (Razor-sharp even when downscaled on contact sheet!)
  {
    const tapeW = 376;
    const tapeH = 44;
    const tx = cx - tapeW * 0.5;
    const ty = 14;

    ctx.fillStyle = 'rgba(7, 15, 25, 0.84)';
    roundRectPath(ctx, tx, ty, tapeW, tapeH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(tx + 16, ty, tapeW - 32, tapeH);
    ctx.clip();

    const hdg = tel.headingDeg;
    const pxPerDegH = 4.6;
    const startDeg = Math.floor((hdg - 32) / 5) * 5;
    const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

    ctx.strokeStyle = 'rgba(60, 255, 142, 0.72)';
    ctx.fillStyle = 'rgba(220, 255, 235, 0.92)';
    ctx.font = `700 12px ${mono}`;
    ctx.textAlign = 'center';

    for (let d = startDeg; d <= hdg + 32; d += 5) {
      const x = cx + (d - hdg) * pxPerDegH;
      const wd = wrapAngleDeg(d);
      const isMajor = wd % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, ty + tapeH);
      ctx.lineTo(x, ty + tapeH - (isMajor ? 11 : 6));
      ctx.stroke();
      if (isMajor && Math.abs(x - cx) < tapeW * 0.5 - 28) {
        const lbl = cardinals[wd] ?? String(Math.round(wd)).padStart(3, '0');
        ctx.fillText(lbl, x, ty + 22);
      }
    }
    ctx.restore();

    // Bold center HDG readout box
    const boxW = 92;
    ctx.fillStyle = 'rgba(5, 13, 22, 0.95)';
    roundRectPath(ctx, cx - boxW * 0.5, ty + tapeH - 4, boxW, 28, 6);
    ctx.fill();
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 17px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, cx, ty + tapeH + 16);
  }

  // 5. LEFT AIRSPEED TAPE & BOLD SPD READOUT POD
  {
    const x = 32;
    const y = cy - 115;
    const w = 132;
    const h = 228;

    ctx.fillStyle = 'rgba(7, 15, 25, 0.80)';
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = craft.stall ? HUD_COLORS.DANGER : (craft.overspeed ? HUD_COLORS.AMBER : 'rgba(60, 255, 142, 0.48)');
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Header label
    ctx.fillStyle = 'rgba(76, 232, 255, 0.90)';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('AIRSPEED', x + 12, y + 20);

    // Big crisp digital knots readout
    const kt = Math.round(craft.airspeedKt);
    ctx.fillStyle = craft.stall ? HUD_COLORS.DANGER : HUD_COLORS.PRIMARY;
    ctx.font = `800 32px ${mono}`;
    ctx.fillText(String(kt).padStart(3, '0'), x + 12, y + 58);
    ctx.font = `700 13px ${mono}`;
    ctx.fillStyle = 'rgba(220, 245, 255, 0.85)';
    ctx.fillText('KT', x + 84, y + 58);

    // Mach & Throttle bar inside SPD pod
    const mach = (craft.speed / 340).toFixed(2);
    ctx.fillStyle = 'rgba(180, 220, 240, 0.82)';
    ctx.font = `700 12px ${mono}`;
    ctx.fillText(`M ${mach} · THR ${Math.round(craft.throttle * 100)}%`, x + 12, y + 80);

    // Vertical thrust gauge bar
    const barX = x + 14;
    const barY = y + 96;
    const barW = 14;
    const barH = 114;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(barX, barY, barW, barH);
    const fillH = clamp(craft.throttle, 0, 1) * barH;
    ctx.fillStyle = craft.afterburner ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY;
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

    // Rolling airspeed tick scale beside thrust bar
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 36, barY, w - 44, barH);
    ctx.clip();
    const scaleMidY = barY + barH * 0.5;
    const startKt = Math.floor((kt - 65) / 20) * 20;
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.65)';
    ctx.fillStyle = 'rgba(215, 255, 232, 0.88)';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'right';
    for (let k = startKt; k <= kt + 65; k += 20) {
      if (k < 0) continue;
      const ty = scaleMidY - (k - kt) * 1.15;
      ctx.beginPath();
      ctx.moveTo(x + 40, ty);
      ctx.lineTo(x + 54, ty);
      ctx.stroke();
      ctx.fillText(String(k), x + w - 12, ty + 4);
    }
    ctx.restore();

    // Pointer triangle on airspeed scale
    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.moveTo(x + 36, scaleMidY);
    ctx.lineTo(x + 44, scaleMidY - 5);
    ctx.lineTo(x + 44, scaleMidY + 5);
    ctx.closePath();
    ctx.fill();
  }

  // 6. RIGHT ALTITUDE TAPE & BOLD ALT / VSI READOUT POD
  {
    const w = 138;
    const h = 228;
    const x = width - w - 32;
    const y = cy - 115;

    ctx.fillStyle = 'rgba(7, 15, 25, 0.80)';
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = craft.aglM < 35 && !craft.onGround && !craft.gearDeployed ? HUD_COLORS.AMBER : 'rgba(60, 255, 142, 0.48)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = 'rgba(76, 232, 255, 0.90)';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('ALTITUDE', x + 12, y + 20);

    const altFt = Math.round(craft.altitudeFt);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 30px ${mono}`;
    ctx.fillText(String(altFt).padStart(4, ' '), x + 10, y + 58);
    ctx.font = `700 13px ${mono}`;
    ctx.fillStyle = 'rgba(220, 245, 255, 0.85)';
    ctx.fillText('FT', x + 98, y + 58);

    // AGL & Vertical Speed readout
    const vsiSign = craft.vsiFpm >= 0 ? '+' : '';
    const vsiVal = Math.round(craft.vsiFpm / 10) * 10;
    ctx.fillStyle = Math.abs(vsiVal) > 1500 ? HUD_COLORS.AMBER : 'rgba(180, 220, 240, 0.84)';
    ctx.font = `700 11px ${mono}`;
    ctx.fillText(`AGL ${Math.round(craft.aglM * WORLD.M_TO_FT)} · VS ${vsiSign}${vsiVal}`, x + 12, y + 80);

    // Rolling altitude ticks
    const barY = y + 98;
    const barH = 112;
    const scaleMidY = barY + barH * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 10, barY, w - 20, barH);
    ctx.clip();
    const startAlt = Math.floor((altFt - 280) / 100) * 100;
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.65)';
    ctx.fillStyle = 'rgba(215, 255, 232, 0.88)';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'left';
    for (let a = startAlt; a <= altFt + 280; a += 100) {
      if (a < 0) continue;
      const ty = scaleMidY - (a - altFt) * 0.26;
      if (ty < barY + 9 || ty > barY + barH - 7) continue;
      ctx.beginPath();
      ctx.moveTo(x + w - 26, ty);
      ctx.lineTo(x + w - 12, ty);
      ctx.stroke();
      ctx.fillText(String(a), x + 16, ty + 4);
    }
    ctx.restore();

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.moveTo(x + w - 12, scaleMidY);
    ctx.lineTo(x + w - 20, scaleMidY - 5);
    ctx.lineTo(x + w - 20, scaleMidY + 5);
    ctx.closePath();
    ctx.fill();
  }

  // 7. TOP-LEFT MISSION OBJECTIVE PILL
  {
    const x = 28;
    const y = 16;
    const w = 326;
    const h = 58;
    ctx.fillStyle = 'rgba(7, 15, 25, 0.82)';
    roundRectPath(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${world.mission.code} · ${world.mission.name}`, x + 14, y + 21);

    const total = world.rings.length;
    const cleared = world.ringsCleared;
    let objText = '';
    if (world.mission.objectiveType === 'land') {
      objText = `LAND RWY 09 · GEAR ${craft.gearDeployed ? 'DN' : 'UP'} · ${formatMissionTime(world.missionTime)}`;
    } else if (cleared < total) {
      objText = `GATES ${cleared}/${total} · TIME ${formatMissionTime(world.missionTime)} · PTS ${world.score}`;
    } else {
      objText = `ALL GATES CLEAR · LAND RWY 09 · ${formatMissionTime(world.missionTime)}`;
    }
    ctx.fillStyle = HUD_COLORS.WHITE;
    ctx.font = `700 13px ${mono}`;
    ctx.fillText(objText, x + 14, y + 43);
  }

  // 8. TOP-RIGHT CAMERA / WEATHER / CONTROL CHIP
  {
    const w = 296;
    const h = 46;
    const x = width - w - 26;
    const y = 16;
    ctx.fillStyle = 'rgba(7, 15, 25, 0.84)';
    roundRectPath(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.42)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(`CAM: ${world.cameraMode.toUpperCase()} [C] · ${world.weather.label}`, x + w - 14, y + 19);
    ctx.fillStyle = 'rgba(215, 235, 250, 0.82)';
    ctx.font = `600 10px ${mono}`;
    ctx.fillText(`[V] FLAPS  [G] GEAR  [Y] YOKE  [P] MENU`, x + w - 14, y + 36);
  }

  // 9. BOTTOM-LEFT AIRCRAFT SYSTEMS & FUEL / HULL INSTRUMENT POD
  {
    const x = 28;
    const w = 350;
    const h = 88;
    const y = height - h - 22;

    ctx.fillStyle = 'rgba(7, 15, 25, 0.84)';
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fuel & Hull bars
    const drawBar = (bx, by, bw, label, pct, color) => {
      ctx.fillStyle = 'rgba(200, 230, 245, 0.90)';
      ctx.font = `700 11px ${mono}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${label}`, bx, by);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(`${Math.round(pct)}%`, bx + bw, by);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRectPath(ctx, bx, by + 6, bw, 9, 4);
      ctx.fill();
      ctx.fillStyle = color;
      roundRectPath(ctx, bx, by + 6, bw * clamp(pct / 100, 0, 1), 9, 4);
      ctx.fill();
    };

    const fuelCol = craft.fuel < 20 ? HUD_COLORS.DANGER : (craft.fuel < 35 ? HUD_COLORS.AMBER : HUD_COLORS.CYAN);
    const hullCol = craft.hull < 40 ? HUD_COLORS.DANGER : (craft.hull < 70 ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY);
    drawBar(x + 14, y + 22, 148, 'FUEL', craft.fuel, fuelCol);
    drawBar(x + 184, y + 22, 150, 'HULL', craft.hull, hullCol);

    // Illuminated Systems Annunciator Chips
    const chips = [
      { label: 'A/B', on: craft.afterburner, col: HUD_COLORS.AMBER },
      { label: 'GEAR', on: craft.gearDeployed, col: HUD_COLORS.PRIMARY },
      { label: 'FLAPS', on: craft.flaps > 0.5, col: HUD_COLORS.CYAN },
      { label: 'BRK', on: craft.speedbrake, col: HUD_COLORS.AMBER },
      { label: `${craft.gLoad.toFixed(1)}G`, on: Math.abs(craft.gLoad) > 4.5, col: HUD_COLORS.AMBER, alwaysLit: true },
    ];
    let cxChip = x + 14;
    for (const ch of chips) {
      const cw = 58;
      ctx.fillStyle = ch.on ? 'rgba(255, 180, 34, 0.22)' : 'rgba(255, 255, 255, 0.06)';
      if (ch.on && ch.col === HUD_COLORS.PRIMARY) ctx.fillStyle = 'rgba(60, 255, 142, 0.22)';
      if (ch.on && ch.col === HUD_COLORS.CYAN) ctx.fillStyle = 'rgba(76, 232, 255, 0.22)';
      roundRectPath(ctx, cxChip, y + 50, cw, 24, 5);
      ctx.fill();
      ctx.strokeStyle = ch.on ? ch.col : 'rgba(180, 210, 230, 0.24)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = ch.on || ch.alwaysLit ? ch.col : 'rgba(170, 195, 215, 0.55)';
      ctx.font = `800 11px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(ch.label, cxChip + cw * 0.5, y + 66);
      cxChip += cw + 8;
    }
  }

  // 10. BOTTOM-RIGHT TACTICAL FJORD MINI-RADAR
  drawTacticalRadar(ctx, width - 92, height - 102, 66, world, 2600);

  // 11. WARNINGS & TOUCHDOWN BANNERS (STALL / LOW FUEL / SMOOTH LANDING)
  let bannerText = null;
  let bannerColor = HUD_COLORS.AMBER;
  if (craft.stall) {
    bannerText = '⚠ STALL WARNING · PITCH DOWN / ADD THRUST';
    bannerColor = HUD_COLORS.DANGER;
  } else if (craft.overspeed) {
    bannerText = '⚠ OVERSPEED · REDUCE THROTTLE';
    bannerColor = HUD_COLORS.AMBER;
  } else if (craft.fuel <= 0) {
    bannerText = '⚠ FLAMEOUT · GLIDE TO RUNWAY 09';
    bannerColor = HUD_COLORS.DANGER;
  } else if (craft.fuel < 18) {
    bannerText = '⚠ BINGO FUEL · CONSERVE AFTERBURNER';
    bannerColor = HUD_COLORS.AMBER;
  } else if (craft.touchdownBanner && craft.touchdownTimer > 0) {
    bannerText = craft.touchdownBanner;
    bannerColor = HUD_COLORS.PRIMARY;
  }

  if (bannerText) {
    ctx.font = `800 14px ${sans}`;
    const tw = Math.max(260, ctx.measureText(bannerText).width + 44);
    const bx = cx - tw * 0.5;
    const by = 98;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.88)';
    roundRectPath(ctx, bx, by, tw, 34, 7);
    ctx.fill();
    ctx.strokeStyle = bannerColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = bannerColor;
    ctx.textAlign = 'center';
    ctx.fillText(bannerText, cx, by + 22);
  }

  ctx.restore();
}
