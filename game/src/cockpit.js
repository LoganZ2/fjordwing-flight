// FJORDWING — Illuminated 3D-perspective Garmin-G1000-style Glass Cockpit & Collimated HUD Combiner.

import { HUD_COLORS, WORLD } from './config.js';
import { clamp, projectWorldPoint, vec3Add, vec3Dist, vec3Scale, wrapAngleDeg } from './math.js';
import { drawTacticalRadar, drawWeatherOverlay, formatMissionTime } from './hud.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawGlassCockpit(ctx, width, height, world, viewProj) {
  const craft = world.aircraft;
  const tel = craft.telemetry;
  const cx = width * 0.5;
  const horizonY = height * 0.43;
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  drawWeatherOverlay(ctx, width, height, world);

  ctx.save();

  // 1. Swept Outer Canopy Frame Struts (frames the fjord vista authentically without blocking view!)
  {
    const frameGrad = ctx.createLinearGradient(0, 0, 0, height * 0.7);
    frameGrad.addColorStop(0, '#0C141F');
    frameGrad.addColorStop(0.5, '#182433');
    frameGrad.addColorStop(1, '#091019');

    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = Math.max(18, width * 0.018);
    ctx.lineCap = 'round';

    // Top arched canopy bow
    ctx.beginPath();
    ctx.moveTo(width * 0.04, height * 0.65);
    ctx.quadraticCurveTo(width * 0.07, height * 0.08, cx, height * 0.025);
    ctx.quadraticCurveTo(width * 0.93, height * 0.08, width * 0.96, height * 0.65);
    ctx.stroke();

    // Subtle specular rim highlight along inner canopy bow
    ctx.strokeStyle = 'rgba(170, 210, 245, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.052, height * 0.64);
    ctx.quadraticCurveTo(width * 0.082, height * 0.095, cx, height * 0.038);
    ctx.quadraticCurveTo(width * 0.918, height * 0.095, width * 0.948, height * 0.64);
    ctx.stroke();
  }

  // 2. Central Glowing Holographic HUD Combiner Glass & Collimated Symbology
  {
    const glassW = Math.min(430, width * 0.34);
    const glassH = Math.min(285, height * 0.40);
    const gx = cx - glassW * 0.5;
    const gy = height * 0.14;

    // Translucent emerald-tinted optical combiner pane
    const defineGlassPath = () => {
      ctx.beginPath();
      ctx.moveTo(gx + 26, gy);
      ctx.lineTo(gx + glassW - 26, gy);
      ctx.lineTo(gx + glassW, gy + 30);
      ctx.lineTo(gx + glassW - 14, gy + glassH);
      ctx.lineTo(gx + 14, gy + glassH);
      ctx.lineTo(gx, gy + 30);
      ctx.closePath();
    };

    // Combiner mounting struts drawn behind combiner glass
    ctx.strokeStyle = '#1E2C3E';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(gx + 14, gy + glassH);
    ctx.lineTo(gx + 4, gy + glassH + 48);
    ctx.moveTo(gx + glassW - 14, gy + glassH);
    ctx.lineTo(gx + glassW - 4, gy + glassH + 48);
    ctx.stroke();

    ctx.save();
    defineGlassPath();

    const glassGrad = ctx.createLinearGradient(0, gy, 0, gy + glassH);
    glassGrad.addColorStop(0, 'rgba(10, 38, 32, 0.24)');
    glassGrad.addColorStop(0.5, 'rgba(8, 28, 24, 0.16)');
    glassGrad.addColorStop(1, 'rgba(12, 44, 36, 0.28)');
    ctx.fillStyle = glassGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 255, 195, 0.62)';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Clip collimated HUD symbology cleanly inside combiner glass polygon
    defineGlassPath();
    ctx.clip();

    const hCy = gy + glassH * 0.54;

    // Top Heading Compass Ribbon inside combiner
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 1.6;
    ctx.font = `700 12px ${mono}`;
    ctx.textAlign = 'center';
    const hdg = tel.headingDeg;
    const startH = Math.floor((hdg - 30) / 10) * 10;
    for (let d = startH; d <= hdg + 30; d += 10) {
      const tx = cx + (d - hdg) * 4.4;
      const wd = wrapAngleDeg(d);
      ctx.beginPath();
      ctx.moveTo(tx, gy + 34);
      ctx.lineTo(tx, gy + 42);
      ctx.stroke();
      ctx.fillText(String(Math.round(wd)).padStart(3, '0'), tx, gy + 28);
    }
    // Heading readout box
    ctx.fillStyle = 'rgba(6, 20, 18, 0.72)';
    ctx.fillRect(cx - 32, gy + 44, 64, 20);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.strokeRect(cx - 32, gy + 44, 64, 20);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 13px ${mono}`;
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, cx, gy + 59);

    // Moving Collimated Pitch Ladder inside combiner
    ctx.save();
    ctx.translate(cx, hCy);
    ctx.rotate(-tel.rollRad);
    const pxPerDeg = 5.2;
    const pOff = tel.pitchDeg * pxPerDeg;
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.92)';
    ctx.lineWidth = 1.9;
    // Horizon bar
    ctx.beginPath();
    ctx.moveTo(-108, pOff);
    ctx.lineTo(-26, pOff);
    ctx.moveTo(26, pOff);
    ctx.lineTo(108, pOff);
    ctx.stroke();

    for (let deg = -20; deg <= 20; deg += 10) {
      if (deg === 0) continue;
      const y = pOff - deg * pxPerDeg;
      ctx.beginPath();
      if (deg < 0) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.moveTo(-58, y);
      ctx.lineTo(-22, y);
      ctx.moveTo(22, y);
      ctx.lineTo(58, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Fixed boresight reticle & projected flight-path velocity vector
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 22, hCy);
    ctx.lineTo(cx - 7, hCy);
    ctx.lineTo(cx, hCy + 6);
    ctx.lineTo(cx + 7, hCy);
    ctx.lineTo(cx + 22, hCy);
    ctx.stroke();

    if (craft.speed > 8) {
      const pVel = projectWorldPoint(vec3Add(craft.pos, vec3Scale(craft.vel, 12)), viewProj, width, height);
      if (pVel.visible) {
        const vx = clamp(pVel.x, gx + 45, gx + glassW - 45);
        const vy = clamp(pVel.y, gy + 70, gy + glassH - 25);
        ctx.strokeStyle = HUD_COLORS.CYAN;
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.arc(vx, vy, 7, 0, Math.PI * 2);
        ctx.moveTo(vx - 16, vy);
        ctx.lineTo(vx - 7, vy);
        ctx.moveTo(vx + 7, vy);
        ctx.lineTo(vx + 16, vy);
        ctx.moveTo(vx, vy - 7);
        ctx.lineTo(vx, vy - 13);
        ctx.stroke();
      }
    }

    // Airspeed (left) & Altitude (right) boxes on combiner glass
    const kt = Math.round(craft.airspeedKt);
    const altFt = Math.round(craft.altitudeFt);

    ctx.fillStyle = 'rgba(6, 22, 18, 0.72)';
    ctx.fillRect(gx + 14, hCy - 18, 76, 36);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(gx + 14, hCy - 18, 76, 36);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 18px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(kt).padStart(3, '0'), gx + 52, hCy + 2);
    ctx.font = `700 10px ${mono}`;
    ctx.fillText('KT', gx + 52, hCy + 14);

    ctx.fillStyle = 'rgba(6, 22, 18, 0.72)';
    ctx.fillRect(gx + glassW - 94, hCy - 18, 80, 36);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.strokeRect(gx + glassW - 94, hCy - 18, 80, 36);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 17px ${mono}`;
    ctx.fillText(String(altFt), gx + glassW - 54, hCy + 2);
    ctx.font = `700 10px ${mono}`;
    ctx.fillText('FT', gx + glassW - 54, hCy + 14);

    // 3D Target Ring Diamond projected through combiner
    const activeRing = world.rings[world.activeRingIndex];
    if (activeRing && !activeRing.cleared) {
      const p = projectWorldPoint(activeRing, viewProj, width, height);
      if (p.visible) {
        const col = activeRing.kind === 'fuel' ? HUD_COLORS.CYAN : HUD_COLORS.AMBER;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 14);
        ctx.lineTo(p.x + 14, p.y);
        ctx.lineTo(p.x, p.y + 14);
        ctx.lineTo(p.x - 14, p.y);
        ctx.closePath();
        ctx.stroke();
        const distM = Math.round(vec3Dist(craft.pos, activeRing));
        ctx.fillStyle = col;
        ctx.font = `700 11px ${mono}`;
        ctx.fillText(`${distM}M`, p.x, p.y + 27);
      }
    }

    ctx.restore();
  }

  // 3. Brushed-Carbon Cockpit Glareshield & Lower Instrument Console Deck
  const dashTopY = height * 0.60;
  {
    ctx.beginPath();
    ctx.moveTo(0, height * 0.68);
    ctx.lineTo(width * 0.16, dashTopY + 14);
    ctx.lineTo(cx - 210, dashTopY - 6);
    ctx.lineTo(cx + 210, dashTopY - 6);
    ctx.lineTo(width * 0.84, dashTopY + 14);
    ctx.lineTo(width, height * 0.68);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    const dashGrad = ctx.createLinearGradient(0, dashTopY, 0, height);
    dashGrad.addColorStop(0, '#1B2838');
    dashGrad.addColorStop(0.14, '#0D1520');
    dashGrad.addColorStop(1, '#070B12');
    ctx.fillStyle = dashGrad;
    ctx.fill();

    // Machined metallic glareshield lip highlight
    ctx.strokeStyle = 'rgba(130, 175, 220, 0.34)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.68);
    ctx.lineTo(width * 0.16, dashTopY + 14);
    ctx.lineTo(cx - 210, dashTopY - 6);
    ctx.lineTo(cx + 210, dashTopY - 6);
    ctx.lineTo(width * 0.84, dashTopY + 14);
    ctx.lineTo(width, height * 0.68);
    ctx.stroke();
  }

  // 4. LEFT ILLUMINATED GARMIN-G1000-STYLE PFD (Artificial Horizon + Speed/Alt + Engine/Fuel/G-Load)
  {
    const pfdW = Math.min(340, width * 0.27);
    const pfdH = Math.min(230, height * 0.32);
    const px = cx - pfdW - 95;
    const py = dashTopY + 22;

    // Bezel frame
    ctx.fillStyle = '#09111B';
    roundRect(ctx, px - 8, py - 8, pfdW + 16, pfdH + 16, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 150, 200, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner glowing screen
    ctx.save();
    roundRect(ctx, px, py, pfdW, pfdH, 8);
    ctx.clip();
    ctx.fillStyle = '#060E18';
    ctx.fillRect(px, py, pfdW, pfdH);

    // Left 62% of PFD: Blue-Sky / Earth-Ochre Attitude Indicator (Artificial Horizon)
    const aiW = pfdW * 0.62;
    const aiCx = px + aiW * 0.5;
    const aiCy = py + pfdH * 0.50;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 4, py + 24, aiW - 8, pfdH - 30);
    ctx.clip();

    ctx.translate(aiCx, aiCy);
    ctx.rotate(-tel.rollRad);
    const shiftY = clamp(tel.pitchDeg * 3.1, -90, 90);

    // Sky blue upper half
    const skyG = ctx.createLinearGradient(0, -160 + shiftY, 0, shiftY);
    skyG.addColorStop(0, '#0D47A1');
    skyG.addColorStop(1, '#2980D9');
    ctx.fillStyle = skyG;
    ctx.fillRect(-180, -220 + shiftY, 360, 220);

    // Earth ochre lower half
    const gndG = ctx.createLinearGradient(0, shiftY, 0, 160 + shiftY);
    gndG.addColorStop(0, '#8D5B2D');
    gndG.addColorStop(1, '#4E3118');
    ctx.fillStyle = gndG;
    ctx.fillRect(-180, shiftY, 360, 220);

    // Crisp horizon white line & pitch bars
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-160, shiftY);
    ctx.lineTo(160, shiftY);
    ctx.stroke();

    ctx.lineWidth = 1.4;
    for (let deg = -20; deg <= 20; deg += 10) {
      if (deg === 0) continue;
      const ly = shiftY - deg * 3.1;
      ctx.beginPath();
      ctx.moveTo(-26, ly);
      ctx.lineTo(26, ly);
      ctx.stroke();
    }
    ctx.restore();

    // Fixed amber aircraft delta symbol on PFD attitude ball
    ctx.strokeStyle = HUD_COLORS.AMBER;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(aiCx - 30, aiCy);
    ctx.lineTo(aiCx - 10, aiCy);
    ctx.lineTo(aiCx, aiCy + 9);
    ctx.lineTo(aiCx + 10, aiCy);
    ctx.lineTo(aiCx + 30, aiCy);
    ctx.stroke();

    // Roll arc ticks at top of attitude indicator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aiCx, aiCy, 66, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();

    // Speed & Altitude numeric overlays flanking PFD attitude ball
    ctx.fillStyle = 'rgba(5, 11, 18, 0.88)';
    ctx.fillRect(px + 6, aiCy - 14, 48, 28);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(px + 6, aiCy - 14, 48, 28);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 13px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(craft.airspeedKt)), px + 30, aiCy + 5);

    ctx.fillStyle = 'rgba(5, 11, 18, 0.88)';
    ctx.fillRect(px + aiW - 60, aiCy - 14, 54, 28);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.strokeRect(px + aiW - 60, aiCy - 14, 54, 28);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.fillText(String(Math.round(craft.altitudeFt)), px + aiW - 33, aiCy + 5);

    // Right 38% of PFD: Engine N1 Arc Gauge, Fuel %, Hull %, G-Load
    const engX = px + aiW + 6;
    const engW = pfdW - aiW - 12;

    // N1 Thrust Radial Gauge
    const gCx = engX + engW * 0.5;
    const gCy = py + 72;
    const gR = 32;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(gCx, gCy, gR, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    const thrFrac = craft.afterburner ? 1.0 : clamp(craft.throttle, 0, 1);
    ctx.strokeStyle = craft.afterburner ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY;
    ctx.beginPath();
    ctx.arc(gCx, gCy, gR, Math.PI * 0.75, Math.PI * (0.75 + thrFrac * 1.5));
    ctx.stroke();

    ctx.fillStyle = craft.afterburner ? HUD_COLORS.AMBER : HUD_COLORS.WHITE;
    ctx.font = `800 14px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(craft.throttle * 100)}%`, gCx, gCy + 4);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 9px ${mono}`;
    ctx.fillText(craft.afterburner ? 'A/B MAX' : 'N1 THR', gCx, gCy + 19);

    // Fuel & Hull vertical bars in PFD EICAS strip
    const drawMiniBar = (bx, by, bw, lbl, val, col) => {
      ctx.fillStyle = 'rgba(200, 225, 245, 0.85)';
      ctx.font = `700 10px ${mono}`;
      ctx.textAlign = 'left';
      ctx.fillText(lbl, bx, by);
      ctx.textAlign = 'right';
      ctx.fillStyle = col;
      ctx.fillText(`${Math.round(val)}%`, bx + bw, by);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, by + 4, bw, 7);
      ctx.fillStyle = col;
      ctx.fillRect(bx, by + 4, bw * clamp(val / 100, 0, 1), 7);
    };

    const fuelCol = craft.fuel < 25 ? HUD_COLORS.AMBER : HUD_COLORS.CYAN;
    const hullCol = craft.hull < 55 ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY;
    drawMiniBar(engX + 4, py + 124, engW - 8, 'FUEL', craft.fuel, fuelCol);
    drawMiniBar(engX + 4, py + 154, engW - 8, 'HULL', craft.hull, hullCol);

    ctx.fillStyle = 'rgba(215, 240, 255, 0.90)';
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`G-LOAD: ${craft.gLoad.toFixed(1)}G`, engX + 4, py + 188);
    ctx.fillText(`AOA: ${(craft.aoaRad * 57.3).toFixed(1)}°`, engX + 4, py + 206);

    // Top PFD Title Strip
    ctx.fillStyle = 'rgba(12, 28, 44, 0.95)';
    ctx.fillRect(px, py, pfdW, 20);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 10px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('PFD 1 · VX-9 KESTREL ATTITUDE / EICAS', px + 8, py + 14);
    ctx.restore();
  }

  // 5. CENTER AVIONICS MASTER ANNUNCIATOR & MISSION TELEMETRY CONSOLE
  {
    const mw = 166;
    const mh = Math.min(230, height * 0.32);
    const mx = cx - mw * 0.5;
    const my = dashTopY + 22;

    ctx.fillStyle = '#08101A';
    roundRect(ctx, mx, my, mw, mh, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.42)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('SKJOLD AVIONICS', cx, my + 18);

    // Digital Mission Timer & Gate Counter
    ctx.fillStyle = 'rgba(16, 32, 48, 0.9)';
    roundRect(ctx, mx + 10, my + 26, mw - 20, 46, 6);
    ctx.fill();
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 15px ${mono}`;
    ctx.fillText(formatMissionTime(world.missionTime), cx, my + 46);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 11px ${mono}`;
    ctx.fillText(`GATE ${world.ringsCleared}/${world.rings.length} · ${world.mission.code}`, cx, my + 64);

    // Backlit cockpit annunciator push-lamps (2 columns x 4 rows)
    const lamps = [
      { label: 'GEAR DN', on: craft.gearDeployed, col: HUD_COLORS.PRIMARY },
      { label: 'FLAPS', on: craft.flaps > 0.5, col: HUD_COLORS.CYAN },
      { label: 'A/B HOT', on: craft.afterburner, col: HUD_COLORS.AMBER },
      { label: 'SPD BRK', on: craft.speedbrake, col: HUD_COLORS.AMBER },
      { label: 'ILS LOC', on: Boolean(world.ils?.inApproachCone), col: HUD_COLORS.CYAN },
      { label: 'STALL', on: craft.stall, col: HUD_COLORS.DANGER },
      { label: 'LOW FUEL', on: craft.fuel < 22, col: HUD_COLORS.AMBER },
      { label: 'HUD ON', on: true, col: HUD_COLORS.PRIMARY },
    ];
    const bw = 68;
    const bh = 25;
    lamps.forEach((lp, i) => {
      const colIdx = i % 2;
      const rowIdx = Math.floor(i / 2);
      const lx = mx + 11 + colIdx * (bw + 8);
      const ly = my + 84 + rowIdx * (bh + 8);
      ctx.fillStyle = lp.on ? 'rgba(20, 48, 42, 0.95)' : 'rgba(255,255,255,0.05)';
      if (lp.on && lp.col === HUD_COLORS.AMBER) ctx.fillStyle = 'rgba(72, 46, 12, 0.95)';
      if (lp.on && lp.col === HUD_COLORS.DANGER) ctx.fillStyle = 'rgba(84, 16, 22, 0.95)';
      if (lp.on && lp.col === HUD_COLORS.CYAN) ctx.fillStyle = 'rgba(14, 46, 62, 0.95)';
      roundRect(ctx, lx, ly, bw, bh, 4);
      ctx.fill();
      ctx.strokeStyle = lp.on ? lp.col : 'rgba(140, 170, 200, 0.22)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = lp.on ? lp.col : 'rgba(140, 165, 190, 0.42)';
      ctx.font = `800 10px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(lp.label, lx + bw * 0.5, ly + 16);
    });
  }

  // 6. RIGHT ILLUMINATED TACTICAL MFD (Moving Fjord Map Radar + ILS Localizer/Glideslope Indicator)
  {
    const mfdW = Math.min(340, width * 0.27);
    const mfdH = Math.min(230, height * 0.32);
    const rx = cx + 95;
    const ry = dashTopY + 22;

    ctx.fillStyle = '#09111B';
    roundRect(ctx, rx - 8, ry - 8, mfdW + 16, mfdH + 16, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 150, 200, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    roundRect(ctx, rx, ry, mfdW, mfdH, 8);
    ctx.clip();
    ctx.fillStyle = '#060E18';
    ctx.fillRect(rx, ry, mfdW, mfdH);

    // MFD Header
    ctx.fillStyle = 'rgba(12, 28, 44, 0.95)';
    ctx.fillRect(rx, ry, mfdW, 20);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 10px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('MFD 2 · SKJOLD FJORD TAC-MAP & ILS', rx + 8, ry + 14);

    // Radar scope inside left portion of MFD
    const radR = Math.min(78, mfdH * 0.37);
    drawTacticalRadar(ctx, rx + radR + 22, ry + 28 + radR, radR, world, 2800);

    // Right column of MFD: ILS Glideslope & Localizer Readouts + Waypoint Info
    const infoX = rx + radR * 2 + 40;
    const infoW = mfdW - (radR * 2 + 50);
    const ils = world.ils;

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('ILS RWY 09', infoX, ry + 42);

    ctx.fillStyle = HUD_COLORS.WHITE;
    ctx.font = `700 11px ${mono}`;
    ctx.fillText(`DME ${ils.distNm.toFixed(2)} NM`, infoX, ry + 62);
    ctx.fillText(`GS  ${ils.actualAngleDeg.toFixed(1)}°`, infoX, ry + 80);
    ctx.fillText(`AGL ${Math.round(craft.aglM * WORLD.M_TO_FT)} FT`, infoX, ry + 98);

    // Mini Glideslope deviation scale inside MFD
    const boxY = ry + 112;
    const boxH = 82;
    ctx.fillStyle = 'rgba(14, 30, 48, 0.85)';
    roundRect(ctx, infoX, boxY, infoW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const mCx = infoX + infoW * 0.5;
    const mCy = boxY + boxH * 0.5;
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(infoX + 8, mCy);
    ctx.lineTo(infoX + infoW - 8, mCy);
    ctx.moveTo(mCx, boxY + 8);
    ctx.lineTo(mCx, boxY + boxH - 8);
    ctx.stroke();

    // Live ILS Crosshair Target Dot
    const dotX = mCx + ils.locDev * (infoW * 0.36);
    const dotY = mCy - ils.gsDev * (boxH * 0.36);
    ctx.fillStyle = (Math.abs(ils.locDev) < 0.25 && Math.abs(ils.gsDev) < 0.28) ? HUD_COLORS.PRIMARY : HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(180, 220, 240, 0.78)';
    ctx.font = `700 9px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('LOC / GS', mCx, boxY + boxH + 14);

    ctx.restore();
  }

  // 7. Compact top-left & top-right flight banners (so cockpit shot is self-explanatory at a glance!)
  {
    ctx.fillStyle = 'rgba(7, 15, 25, 0.78)';
    roundRect(ctx, 26, 14, 290, 46, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 255, 142, 0.44)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${world.mission.code} · ${world.mission.name}`, 38, 32);
    ctx.fillStyle = HUD_COLORS.WHITE;
    ctx.font = `700 12px ${mono}`;
    ctx.fillText(`SPD ${Math.round(craft.airspeedKt)} KT · ALT ${Math.round(craft.altitudeFt)} FT · HDG ${String(Math.round(tel.headingDeg)).padStart(3, '0')}°`, 38, 50);

    ctx.fillStyle = 'rgba(7, 15, 25, 0.84)';
    roundRect(ctx, width - 278, 14, 252, 38, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(76, 232, 255, 0.48)';
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText('GLASS COCKPIT [C] · VX-9 KESTREL', width - 40, 37);
  }

  ctx.restore();
}
