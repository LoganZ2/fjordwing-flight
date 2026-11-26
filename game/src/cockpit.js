// FJORDWING — Sculpted 3D-Crafted Glass Cockpit with riveted titanium canopy bow,
// optical HUD projector & dual combiner glass, brushed-carbon glare-shield,
// spherical PFD synthetic attitude display, backlit UFC switches & Tactical Fjord MFD.

import { HUD_COLORS, WORLD } from './config.js';
import { clamp, degToRad, projectWorldPoint, vec3Add, vec3Dist, vec3Scale, wrapAngleDeg } from './math.js';
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

function drawHexBolt(ctx, x, y, r = 3.2) {
  ctx.save();
  ctx.fillStyle = '#2B3A4D';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 215, 245, 0.35)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = '#0D141E';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGlassCockpit(ctx, width, height, world, viewProj) {
  const craft = world.aircraft;
  const tel = craft.telemetry;
  const cx = width * 0.5;
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  drawWeatherOverlay(ctx, width, height, world);

  ctx.save();

  // 1. SUBTLE CURVED CANOPY GLASS TINT & SPECULAR GLARE STREAKS (in upper corners)
  {
    const canopyGlare = ctx.createLinearGradient(0, 0, width * 0.38, height * 0.42);
    canopyGlare.addColorStop(0, 'rgba(160, 215, 255, 0.14)');
    canopyGlare.addColorStop(0.5, 'rgba(255, 215, 165, 0.05)');
    canopyGlare.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = canopyGlare;
    ctx.fillRect(0, 0, width, height * 0.65);

    const rightGlare = ctx.createLinearGradient(width, 0, width * 0.62, height * 0.40);
    rightGlare.addColorStop(0, 'rgba(255, 200, 145, 0.12)');
    rightGlare.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = rightGlare;
    ctx.fillRect(0, 0, width, height * 0.65);
  }

  // 2. SCULPTED TITANIUM CANOPY ARCH BOW, STRUCTURAL FLANGES, RIVETS & SIDE MIRRORS
  {
    const archPath = (insetX = 0, insetY = 0) => {
      ctx.beginPath();
      ctx.moveTo(width * 0.032 + insetX, height * 0.68);
      ctx.bezierCurveTo(
        width * 0.055 + insetX, height * 0.12 + insetY,
        width * 0.25 + insetX, height * 0.02 + insetY,
        cx, height * 0.018 + insetY
      );
      ctx.bezierCurveTo(
        width * 0.75 - insetX, height * 0.02 + insetY,
        width * 0.945 - insetX, height * 0.12 + insetY,
        width * 0.968 - insetX, height * 0.68
      );
    };

    // Outer dark carbon canopy shadow bevel
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#070C14';
    ctx.lineWidth = Math.max(28, width * 0.026);
    archPath(0, 0);
    ctx.stroke();

    // Brushed metallic titanium core arch
    const archGrad = ctx.createLinearGradient(0, 0, width, height * 0.5);
    archGrad.addColorStop(0, '#1B2736');
    archGrad.addColorStop(0.28, '#2C3D52');
    archGrad.addColorStop(0.5, '#192432');
    archGrad.addColorStop(0.75, '#33455B');
    archGrad.addColorStop(1, '#141E2B');
    ctx.strokeStyle = archGrad;
    ctx.lineWidth = Math.max(18, width * 0.017);
    archPath(0, 0);
    ctx.stroke();

    // Warm sunlit inner metallic rim catchlight along arch
    ctx.strokeStyle = 'rgba(255, 212, 168, 0.34)';
    ctx.lineWidth = 2.0;
    archPath(Math.max(9, width * 0.0085), 9);
    ctx.stroke();

    // Outer cool cyan edge bevel
    ctx.strokeStyle = 'rgba(130, 185, 235, 0.22)';
    ctx.lineWidth = 1.4;
    archPath(-Math.max(8, width * 0.0075), -8);
    ctx.stroke();

    // Sample exact cubic Bezier canopy arch so every rivet & mirror sits squarely on the titanium frame!
    const evalArch = (side, t) => {
      const p0 = side < 0 ? [width * 0.032, height * 0.68] : [width * 0.968, height * 0.68];
      const p1 = side < 0 ? [width * 0.055, height * 0.12] : [width * 0.945, height * 0.12];
      const p2 = side < 0 ? [width * 0.25, height * 0.02] : [width * 0.75, height * 0.02];
      const p3 = [cx, height * 0.018];
      const u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      return [x, y];
    };

    // Structural aircraft rivets seated directly on the titanium canopy arch
    for (const side of [-1, 1]) {
      for (const t of [0.12, 0.26, 0.42, 0.58, 0.74, 0.88]) {
        const [rx, ry] = evalArch(side, t);
        drawHexBolt(ctx, rx, ry, 2.2);
      }
    }

    // Twin Fighter Canopy Rearview Mirrors bolted neatly to the upper Bezier arch
    for (const side of [-1, 1]) {
      const [ax, ay] = evalArch(side, 0.66);
      const mx = ax - side * 8;
      const my = ay + 20;
      ctx.save();
      // Bracket stalk physically joining arch to mirror
      ctx.strokeStyle = '#243345';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(mx, my);
      ctx.stroke();

      ctx.translate(mx, my);
      ctx.rotate(side * 0.16);
      ctx.fillStyle = '#121B28';
      roundRect(ctx, -26, -7, 52, 18, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 195, 235, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const mGrad = ctx.createLinearGradient(-22, -5, 22, 10);
      mGrad.addColorStop(0, '#1B3864');
      mGrad.addColorStop(0.55, '#5C779A');
      mGrad.addColorStop(1, '#DC8B4E');
      ctx.fillStyle = mGrad;
      roundRect(ctx, -22, -4, 44, 12, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  // 3. CENTRAL OPTICAL HUD COMBINER GLASS & COLLIMATED PHOSPHOR SYMBOLOGY
  const dashTopY = height * 0.615;
  {
    const glassW = Math.min(418, width * 0.33);
    const glassH = Math.min(282, height * 0.395);
    const gx = cx - glassW * 0.5;
    const gy = height * 0.145;

    const defineGlassPath = () => {
      ctx.beginPath();
      ctx.moveTo(gx + 34, gy);
      ctx.lineTo(gx + glassW - 34, gy);
      ctx.lineTo(gx + glassW, gy + 34);
      ctx.lineTo(gx + glassW - 14, gy + glassH);
      ctx.lineTo(gx + 14, gy + glassH);
      ctx.lineTo(gx, gy + 34);
      ctx.closePath();
    };

    // Machined dark-titanium side combiner mounting arms
    const strutGrad = ctx.createLinearGradient(gx, gy + glassH - 20, gx, dashTopY + 12);
    strutGrad.addColorStop(0, '#2B3B4E');
    strutGrad.addColorStop(1, '#111924');
    ctx.strokeStyle = strutGrad;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx + 10, gy + glassH - 28);
    ctx.lineTo(gx + 16, gy + glassH);
    ctx.lineTo(gx + 4, dashTopY + 16);
    ctx.moveTo(gx + glassW - 10, gy + glassH - 28);
    ctx.lineTo(gx + glassW - 16, gy + glassH);
    ctx.lineTo(gx + glassW - 4, dashTopY + 16);
    ctx.stroke();

    // Subtle secondary angled optical glass edge (gives authentic dual-pane thickness!)
    ctx.save();
    ctx.translate(0, -5);
    defineGlassPath();
    ctx.strokeStyle = 'rgba(130, 255, 205, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    defineGlassPath();

    // Ultra-clear optical crystal glass tint with crisp diagonal anti-reflective glint
    const glassGrad = ctx.createLinearGradient(gx, gy, gx + glassW, gy + glassH);
    glassGrad.addColorStop(0, 'rgba(16, 68, 54, 0.12)');
    glassGrad.addColorStop(0.42, 'rgba(10, 44, 36, 0.05)');
    glassGrad.addColorStop(0.54, 'rgba(110, 255, 200, 0.07)');
    glassGrad.addColorStop(1, 'rgba(12, 54, 44, 0.14)');
    ctx.fillStyle = glassGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(118, 255, 198, 0.62)';
    ctx.lineWidth = 2.1;
    ctx.stroke();

    defineGlassPath();
    ctx.clip();

    // Crisp phosphor glow inside HUD combiner glass
    ctx.shadowColor = 'rgba(40, 255, 150, 0.65)';
    ctx.shadowBlur = 6;

    const hCy = gy + glassH * 0.54;
    const hudGreen = HUD_COLORS.PRIMARY;

    // Heading Compass Ribbon at top of HUD glass
    ctx.strokeStyle = hudGreen;
    ctx.fillStyle = hudGreen;
    ctx.lineWidth = 1.5;
    ctx.font = `700 11px ${mono}`;
    ctx.textAlign = 'center';
    const hdg = tel.headingDeg;
    const startH = Math.floor((hdg - 28) / 5) * 5;
    ctx.beginPath();
    ctx.moveTo(gx + 48, gy + 36);
    ctx.lineTo(gx + glassW - 48, gy + 36);
    ctx.stroke();
    for (let d = startH; d <= hdg + 28; d += 5) {
      const tx = cx + (d - hdg) * 4.5;
      const wd = wrapAngleDeg(d);
      const isMajor = wd % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(tx, gy + 36);
      ctx.lineTo(tx, gy + (isMajor ? 28 : 32));
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(String(Math.round(wd)).padStart(3, '0'), tx, gy + 24);
      }
    }
    // Center heading chevron & box
    ctx.fillStyle = 'rgba(4, 24, 18, 0.55)';
    ctx.fillRect(cx - 28, gy + 41, 56, 19);
    ctx.strokeStyle = hudGreen;
    ctx.strokeRect(cx - 28, gy + 41, 56, 19);
    ctx.fillStyle = hudGreen;
    ctx.font = `800 12px ${mono}`;
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, cx, gy + 55);

    // Moving Collimated Pitch Ladder inside combiner
    ctx.save();
    ctx.translate(cx, hCy);
    ctx.rotate(-tel.rollRad);
    const pxPerDeg = 5.0;
    const pOff = tel.pitchDeg * pxPerDeg;
    ctx.strokeStyle = 'rgba(75, 255, 155, 0.94)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-98, pOff);
    ctx.lineTo(-24, pOff);
    ctx.moveTo(24, pOff);
    ctx.lineTo(98, pOff);
    ctx.stroke();

    for (let deg = -20; deg <= 20; deg += 10) {
      if (deg === 0) continue;
      const y = pOff - deg * pxPerDeg;
      ctx.beginPath();
      if (deg < 0) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.moveTo(-54, y);
      ctx.lineTo(-20, y);
      ctx.moveTo(20, y);
      ctx.lineTo(54, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const tk = deg > 0 ? 6 : -6;
      ctx.beginPath();
      ctx.moveTo(-54, y); ctx.lineTo(-54, y + tk);
      ctx.moveTo(54, y); ctx.lineTo(54, y + tk);
      ctx.stroke();
    }
    ctx.restore();

    // Fixed boresight reticle & projected flight-path velocity vector
    ctx.strokeStyle = hudGreen;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, hCy);
    ctx.lineTo(cx - 7, hCy);
    ctx.lineTo(cx, hCy + 6);
    ctx.lineTo(cx + 7, hCy);
    ctx.lineTo(cx + 20, hCy);
    ctx.stroke();

    if (craft.speed > 8) {
      const pVel = projectWorldPoint(vec3Add(craft.pos, vec3Scale(craft.vel, 14)), viewProj, width, height);
      if (pVel.visible) {
        const vx = clamp(pVel.x, gx + 48, gx + glassW - 48);
        const vy = clamp(pVel.y, gy + 66, gy + glassH - 24);
        ctx.strokeStyle = HUD_COLORS.CYAN;
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.arc(vx, vy, 7, 0, Math.PI * 2);
        ctx.moveTo(vx - 15, vy); ctx.lineTo(vx - 7, vy);
        ctx.moveTo(vx + 7, vy); ctx.lineTo(vx + 15, vy);
        ctx.moveTo(vx, vy - 7); ctx.lineTo(vx, vy - 13);
        ctx.stroke();
      }
    }

    // Fighter-style open-bracket Airspeed (left) & Altitude (right) inside HUD glass
    const kt = Math.round(craft.airspeedKt);
    const altFt = Math.round(craft.altitudeFt);

    // Left SPD rail & box
    ctx.strokeStyle = hudGreen;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx + 76, hCy - 52); ctx.lineTo(gx + 76, hCy + 52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(4, 24, 18, 0.55)';
    ctx.fillRect(gx + 16, hCy - 14, 56, 28);
    ctx.strokeRect(gx + 16, hCy - 14, 56, 28);
    ctx.fillStyle = hudGreen;
    ctx.font = `800 16px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(kt).padStart(3, '0'), gx + 44, hCy + 5);
    ctx.font = `700 9px ${mono}`;
    ctx.fillText(`M ${(craft.speed / 340).toFixed(2)}`, gx + 44, hCy + 28);

    // Right ALT rail & box
    ctx.beginPath();
    ctx.moveTo(gx + glassW - 76, hCy - 52); ctx.lineTo(gx + glassW - 76, hCy + 52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(4, 24, 18, 0.55)';
    ctx.fillRect(gx + glassW - 72, hCy - 14, 58, 28);
    ctx.strokeRect(gx + glassW - 72, hCy - 14, 58, 28);
    ctx.fillStyle = hudGreen;
    ctx.font = `800 16px ${mono}`;
    ctx.fillText(String(altFt), gx + glassW - 43, hCy + 5);
    ctx.font = `700 9px ${mono}`;
    ctx.fillText(`R ${Math.round(craft.aglM * WORLD.M_TO_FT)}`, gx + glassW - 43, hCy + 28);

    // 3D Target Ring Designator Diamond projected through combiner glass
    const activeRing = world.rings[world.activeRingIndex];
    if (activeRing && !activeRing.cleared) {
      const p = projectWorldPoint(activeRing, viewProj, width, height);
      if (p.visible) {
        const col = activeRing.kind === 'fuel' ? HUD_COLORS.CYAN : HUD_COLORS.AMBER;
        ctx.shadowColor = col;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 13);
        ctx.lineTo(p.x + 13, p.y);
        ctx.lineTo(p.x, p.y + 13);
        ctx.lineTo(p.x - 13, p.y);
        ctx.closePath();
        ctx.stroke();
        const distM = Math.round(vec3Dist(craft.pos, activeRing));
        ctx.fillStyle = col;
        ctx.font = `800 10px ${mono}`;
        ctx.fillText(`${distM}M`, p.x, p.y + 26);
      }
    }

    ctx.restore();
  }

  // 4. SCULPTED 3D-SHADED CARBON-FIBER GLARE-SHIELD & INSTRUMENT DECK
  {
    // Center recessed HUD projector hood rising slightly above glare-shield
    const hudHoodW = 240;
    const hoodGrad = ctx.createLinearGradient(0, dashTopY - 24, 0, dashTopY + 20);
    hoodGrad.addColorStop(0, '#2B394A');
    hoodGrad.addColorStop(0.5, '#17212E');
    hoodGrad.addColorStop(1, '#0C121B');
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.moveTo(cx - hudHoodW * 0.58, dashTopY + 4);
    ctx.lineTo(cx - hudHoodW * 0.44, dashTopY - 18);
    ctx.lineTo(cx + hudHoodW * 0.44, dashTopY - 18);
    ctx.lineTo(cx + hudHoodW * 0.58, dashTopY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(155, 198, 240, 0.34)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing green optical HUD lens aperture recessed into hood!
    const lensGrad = ctx.createRadialGradient(cx, dashTopY - 6, 4, cx, dashTopY - 6, 62);
    lensGrad.addColorStop(0, 'rgba(95, 255, 185, 0.72)');
    lensGrad.addColorStop(0.45, 'rgba(35, 185, 125, 0.34)');
    lensGrad.addColorStop(1, 'rgba(10, 40, 32, 0.0)');
    ctx.fillStyle = lensGrad;
    ctx.beginPath();
    ctx.ellipse(cx, dashTopY - 7, 64, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main angled glare-shield & console body
    ctx.beginPath();
    ctx.moveTo(0, height * 0.70);
    ctx.lineTo(width * 0.14, dashTopY + 12);
    ctx.lineTo(cx - 195, dashTopY - 4);
    ctx.lineTo(cx + 195, dashTopY - 4);
    ctx.lineTo(width * 0.86, dashTopY + 12);
    ctx.lineTo(width, height * 0.70);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    const dashGrad = ctx.createLinearGradient(0, dashTopY - 6, 0, height);
    dashGrad.addColorStop(0, '#233142');
    dashGrad.addColorStop(0.06, '#151F2C');
    dashGrad.addColorStop(0.22, '#0E1621');
    dashGrad.addColorStop(1, '#060A10');
    ctx.fillStyle = dashGrad;
    ctx.fill();

    // Subtle sunlit machined bevel along glare-shield upper brow
    ctx.strokeStyle = 'rgba(220, 200, 175, 0.30)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.70);
    ctx.lineTo(width * 0.14, dashTopY + 12);
    ctx.lineTo(cx - 195, dashTopY - 4);
    ctx.lineTo(cx + 195, dashTopY - 4);
    ctx.lineTo(width * 0.86, dashTopY + 12);
    ctx.lineTo(width, height * 0.70);
    ctx.stroke();

    // Glare-shield brow warning indicators (Left: MASTER CAUTION, Right: A/B / ENG FIRE)
    const drawBrowLight = (bx, by, label, lit, activeCol) => {
      ctx.fillStyle = lit ? activeCol : 'rgba(20, 30, 42, 0.9)';
      roundRect(ctx, bx - 38, by, 76, 16, 3);
      ctx.fill();
      ctx.strokeStyle = lit ? activeCol : 'rgba(130, 165, 200, 0.25)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = lit ? '#050A10' : 'rgba(145, 175, 200, 0.45)';
      ctx.font = `800 8.5px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx, by + 11);
    };
    drawBrowLight(cx - 242, dashTopY + 3, 'MASTER CAUT', craft.stall || craft.fuel < 20, HUD_COLORS.AMBER);
    drawBrowLight(cx + 242, dashTopY + 3, 'A/B ACTIVE', craft.afterburner, HUD_COLORS.AMBER);

    // Subtle brushed panel screws along glare-shield edge
    for (const sx of [width * 0.15, cx - 180, cx + 180, width * 0.85]) {
      drawHexBolt(ctx, sx, dashTopY + 14, 2.8);
    }
  }

  // Helper to draw realistic recessed machined MFD bezel with corner hex screws & top OSK softkey notches
  function drawMfdFrame(x, y, w, h) {
    // Deep recessed outer casing
    const frameGrad = ctx.createLinearGradient(x, y, x, y + h);
    frameGrad.addColorStop(0, '#1C2836');
    frameGrad.addColorStop(1, '#0C121B');
    ctx.fillStyle = frameGrad;
    roundRect(ctx, x - 11, y - 11, w + 22, h + 22, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(135, 185, 230, 0.36)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Inner bevel shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 7);
    ctx.stroke();

    // 4 machined corner hex bolts
    drawHexBolt(ctx, x - 5, y - 5, 2.6);
    drawHexBolt(ctx, x + w + 5, y - 5, 2.6);
    drawHexBolt(ctx, x - 5, y + h + 5, 2.6);
    drawHexBolt(ctx, x + w + 5, y + h + 5, 2.6);

    // Physical tactile OSB bezel buttons along left & right edges
    ctx.fillStyle = '#253447';
    for (let i = 0; i < 4; i++) {
      const by = y + 32 + i * 44;
      ctx.fillRect(x - 10, by, 5, 16);
      ctx.fillRect(x + w + 5, by, 5, 16);
    }
  }

  const panelY = dashTopY + 26;
  const panelH = Math.min(228, height - panelY - 14);

  // 5. LEFT ILLUMINATED GARMIN-INSPIRED PFD (Spherical Attitude Horizon + Engine EICAS)
  {
    const pfdW = Math.min(352, width * 0.28);
    const px = cx - pfdW - 102;
    drawMfdFrame(px, panelY, pfdW, panelH);

    ctx.save();
    roundRect(ctx, px, panelY, pfdW, panelH, 6);
    ctx.clip();
    ctx.fillStyle = '#050C15';
    ctx.fillRect(px, panelY, pfdW, panelH);

    const aiW = pfdW * 0.62;
    const aiCx = px + aiW * 0.5;
    const aiCy = panelY + panelH * 0.52;

    // Synthetic Vision Attitude Ball
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 4, panelY + 22, aiW - 8, panelH - 26);
    ctx.clip();

    ctx.translate(aiCx, aiCy);
    ctx.rotate(-tel.rollRad);
    const shiftY = clamp(tel.pitchDeg * 3.1, -90, 90);

    // Sky hemisphere gradient
    const skyG = ctx.createLinearGradient(0, -160 + shiftY, 0, shiftY);
    skyG.addColorStop(0, '#08357D');
    skyG.addColorStop(0.75, '#1D6EC2');
    skyG.addColorStop(1, '#5EB8F0');
    ctx.fillStyle = skyG;
    ctx.fillRect(-190, -230 + shiftY, 380, 230);

    // Shaded alpine earth hemisphere gradient
    const gndG = ctx.createLinearGradient(0, shiftY, 0, 160 + shiftY);
    gndG.addColorStop(0, '#7B5228');
    gndG.addColorStop(0.5, '#59391B');
    gndG.addColorStop(1, '#2D1C0E');
    ctx.fillStyle = gndG;
    ctx.fillRect(-190, shiftY, 380, 230);

    // Subtle synthetic perspective ground grid lines
    ctx.strokeStyle = 'rgba(255, 220, 170, 0.16)';
    ctx.lineWidth = 1;
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 16, shiftY);
      ctx.lineTo(k * 58, shiftY + 135);
      ctx.stroke();
    }

    // Crisp horizon line & calibrated pitch rungs
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-170, shiftY);
    ctx.lineTo(170, shiftY);
    ctx.stroke();

    ctx.lineWidth = 1.3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `700 8px ${mono}`;
    ctx.textAlign = 'right';
    for (let deg = -15; deg <= 15; deg += 5) {
      if (deg === 0) continue;
      const ly = shiftY - deg * 3.0;
      if (ly < -44 || ly > 66) continue; // Keep cleanly below top bank arc
      const hw = deg % 10 === 0 ? 26 : 12;
      ctx.beginPath();
      ctx.moveTo(-hw, ly);
      ctx.lineTo(hw, ly);
      ctx.stroke();
      if (deg % 10 === 0) {
        ctx.fillText(String(Math.abs(deg)), -hw - 4, ly + 3);
      }
    }
    ctx.restore();

    // Roll bank-angle scale arc & live roll pointer triangle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.4;
    const bankR = 64;
    ctx.beginPath();
    ctx.arc(aiCx, aiCy, bankR, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
    for (const deg of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
      const a = -Math.PI * 0.5 + degToRad(deg);
      const len = deg % 30 === 0 ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(aiCx + Math.cos(a) * bankR, aiCy + Math.sin(a) * bankR);
      ctx.lineTo(aiCx + Math.cos(a) * (bankR + len), aiCy + Math.sin(a) * (bankR + len));
      ctx.stroke();
    }
    const ptrA = -Math.PI * 0.5 - clamp(tel.rollRad, -0.85, 0.85);
    const ptx = aiCx + Math.cos(ptrA) * (bankR - 2);
    const pty = aiCy + Math.sin(ptrA) * (bankR - 2);
    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.arc(ptx, pty, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Fixed amber fighter delta boresight
    ctx.strokeStyle = HUD_COLORS.AMBER;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(aiCx - 30, aiCy);
    ctx.lineTo(aiCx - 10, aiCy);
    ctx.lineTo(aiCx, aiCy + 9);
    ctx.lineTo(aiCx + 10, aiCy);
    ctx.lineTo(aiCx + 30, aiCy);
    ctx.stroke();

    // Integrated flanking speed & altitude readout windows
    ctx.fillStyle = 'rgba(4, 10, 18, 0.88)';
    ctx.fillRect(px + 6, aiCy - 13, 46, 26);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(px + 6, aiCy - 13, 46, 26);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 13px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(craft.airspeedKt)), px + 29, aiCy + 4.5);

    ctx.fillStyle = 'rgba(4, 10, 18, 0.88)';
    ctx.fillRect(px + aiW - 58, aiCy - 13, 52, 26);
    ctx.strokeStyle = HUD_COLORS.PRIMARY;
    ctx.strokeRect(px + aiW - 58, aiCy - 13, 52, 26);
    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.fillText(String(Math.round(craft.altitudeFt)), px + aiW - 32, aiCy + 4.5);

    // Right 38% EICAS column: Radial N1 Thrust Arc + Fuel/Hull + G/AoA
    const engX = px + aiW + 6;
    const engW = pfdW - aiW - 12;
    const gCx = engX + engW * 0.5;
    const gCy = panelY + 68;
    const gR = 30;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 6.5;
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
    ctx.font = `700 8.5px ${mono}`;
    ctx.fillText(craft.afterburner ? 'A/B MAX' : 'N1 RPM', gCx, gCy + 18);

    const drawMiniBar = (bx, by, bw, lbl, val, col) => {
      ctx.fillStyle = 'rgba(205, 232, 250, 0.88)';
      ctx.font = `700 9.5px ${mono}`;
      ctx.textAlign = 'left';
      ctx.fillText(lbl, bx, by);
      ctx.textAlign = 'right';
      ctx.fillStyle = col;
      ctx.fillText(`${Math.round(val)}%`, bx + bw, by);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, by + 4, bw, 6);
      ctx.fillStyle = col;
      ctx.fillRect(bx, by + 4, bw * clamp(val / 100, 0, 1), 6);
    };

    drawMiniBar(engX + 4, panelY + 120, engW - 8, 'FUEL', craft.fuel, craft.fuel < 25 ? HUD_COLORS.AMBER : HUD_COLORS.CYAN);
    drawMiniBar(engX + 4, panelY + 148, engW - 8, 'HULL', craft.hull, craft.hull < 55 ? HUD_COLORS.AMBER : HUD_COLORS.PRIMARY);

    ctx.fillStyle = 'rgba(215, 240, 255, 0.90)';
    ctx.font = `700 10.5px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`G-LD ${craft.gLoad.toFixed(1)}G`, engX + 4, panelY + 182);
    ctx.fillText(`AOA  ${(craft.aoaRad * 57.3).toFixed(1)}°`, engX + 4, panelY + 200);

    // Header bar
    ctx.fillStyle = 'rgba(11, 24, 38, 0.96)';
    ctx.fillRect(px, panelY, pfdW, 19);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `800 9.5px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('PFD 1 · VX-9 SYNTHETIC ATTITUDE / EICAS', px + 8, panelY + 13);

    // Subtle diagonal glass screen reflection
    const scrGlint = ctx.createLinearGradient(px, panelY, px + pfdW * 0.65, panelY + panelH * 0.7);
    scrGlint.addColorStop(0, 'rgba(190, 235, 255, 0.08)');
    scrGlint.addColorStop(0.5, 'rgba(190, 235, 255, 0.0)');
    ctx.fillStyle = scrGlint;
    ctx.fillRect(px, panelY, pfdW, panelH);

    ctx.restore();
  }

  // 6. CENTER AVIONICS UFC & TACTILE BACKLIT ANNUNCIATOR STACK
  {
    const mw = 166;
    const mx = cx - mw * 0.5;
    drawMfdFrame(mx, panelY, mw, panelH);

    ctx.save();
    roundRect(ctx, mx, panelY, mw, panelH, 6);
    ctx.clip();
    ctx.fillStyle = '#070E18';
    ctx.fillRect(mx, panelY, mw, panelH);

    ctx.fillStyle = 'rgba(12, 24, 38, 0.95)';
    ctx.fillRect(mx, panelY, mw, 19);
    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 9.5px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('SKJOLD UFC · 118.4 MHz', cx, panelY + 13);

    // Recessed phosphor LCD telemetry scratchpad
    ctx.fillStyle = '#061A18';
    roundRect(ctx, mx + 9, panelY + 25, mw - 18, 46, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(75, 255, 155, 0.38)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.fillStyle = HUD_COLORS.PRIMARY;
    ctx.font = `800 15px ${mono}`;
    ctx.fillText(formatMissionTime(world.missionTime), cx, panelY + 45);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `700 10.5px ${mono}`;
    ctx.fillText(`GATE ${world.ringsCleared}/${world.rings.length} · ${world.mission.code}`, cx, panelY + 62);

    // Tactile backlit cockpit annunciator buttons (2 x 4 grid)
    const lamps = [
      { label: 'GEAR DN', on: craft.gearDeployed, col: HUD_COLORS.PRIMARY },
      { label: 'FLAPS', on: craft.flaps > 0.5, col: HUD_COLORS.CYAN },
      { label: 'A/B MAX', on: craft.afterburner, col: HUD_COLORS.AMBER },
      { label: 'SPD BRK', on: craft.speedbrake, col: HUD_COLORS.AMBER },
      { label: 'ILS LOC', on: Boolean(world.ils?.inApproachCone), col: HUD_COLORS.CYAN },
      { label: 'STALL', on: craft.stall, col: HUD_COLORS.DANGER },
      { label: 'BINGO', on: craft.fuel < 22, col: HUD_COLORS.AMBER },
      { label: 'HUD ON', on: true, col: HUD_COLORS.PRIMARY },
    ];
    const bw = 69;
    const bh = 25;
    lamps.forEach((lp, i) => {
      const colIdx = i % 2;
      const rowIdx = Math.floor(i / 2);
      const lx = mx + 10 + colIdx * (bw + 8);
      const ly = panelY + 80 + rowIdx * (bh + 8);

      const btnGrad = ctx.createLinearGradient(lx, ly, lx, ly + bh);
      if (lp.on) {
        if (lp.col === HUD_COLORS.AMBER) { btnGrad.addColorStop(0, '#5B390D'); btnGrad.addColorStop(1, '#311E06'); }
        else if (lp.col === HUD_COLORS.DANGER) { btnGrad.addColorStop(0, '#6B131C'); btnGrad.addColorStop(1, '#3A0A0F'); }
        else if (lp.col === HUD_COLORS.CYAN) { btnGrad.addColorStop(0, '#0E3F54'); btnGrad.addColorStop(1, '#082330'); }
        else { btnGrad.addColorStop(0, '#104433'); btnGrad.addColorStop(1, '#08261D'); }
      } else {
        btnGrad.addColorStop(0, '#162130');
        btnGrad.addColorStop(1, '#0D1520');
      }
      ctx.fillStyle = btnGrad;
      roundRect(ctx, lx, ly, bw, bh, 4);
      ctx.fill();
      ctx.strokeStyle = lp.on ? lp.col : 'rgba(130, 165, 200, 0.22)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = lp.on ? lp.col : 'rgba(145, 175, 200, 0.44)';
      ctx.font = `800 9.5px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(lp.label, lx + bw * 0.5, ly + 16);
    });

    ctx.restore();
  }

  // 7. RIGHT ILLUMINATED TACTICAL MFD (Fjord Topographic Contour Radar + ILS CDI Crosshair)
  {
    const mfdW = Math.min(352, width * 0.28);
    const rx = cx + 102;
    drawMfdFrame(rx, panelY, mfdW, panelH);

    ctx.save();
    roundRect(ctx, rx, panelY, mfdW, panelH, 6);
    ctx.clip();
    ctx.fillStyle = '#050C15';
    ctx.fillRect(rx, panelY, mfdW, panelH);

    ctx.fillStyle = 'rgba(11, 24, 38, 0.96)';
    ctx.fillRect(rx, panelY, mfdW, 19);
    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.font = `800 9.5px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('MFD 2 · SKJOLD FJORD TAC-MAP & ILS CDI', rx + 8, panelY + 13);

    // Circular topographic radar inside left portion of MFD
    const radR = Math.min(79, panelH * 0.375);
    drawTacticalRadar(ctx, rx + radR + 18, panelY + 28 + radR, radR, world, 2800, false);

    // Right column of MFD: ILS DME / GS / AGL + Live Localizer/Glideslope CDI Crosshair
    const infoX = rx + radR * 2 + 34;
    const infoW = mfdW - (radR * 2 + 44);
    const ils = world.ils;

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.font = `800 10.5px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText('ILS RWY 09', infoX, panelY + 40);

    ctx.fillStyle = HUD_COLORS.WHITE;
    ctx.font = `700 10.5px ${mono}`;
    ctx.fillText(`DME ${ils.distNm.toFixed(2)} NM`, infoX, panelY + 58);
    ctx.fillText(`GS  ${ils.actualAngleDeg.toFixed(1)}°`, infoX, panelY + 75);
    ctx.fillText(`AGL ${Math.round(craft.aglM * WORLD.M_TO_FT)} FT`, infoX, panelY + 92);

    const boxY = panelY + 104;
    const boxH = 84;
    ctx.fillStyle = 'rgba(9, 24, 40, 0.88)';
    roundRect(ctx, infoX, boxY, infoW, boxH, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(88, 238, 255, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const mCx = infoX + infoW * 0.5;
    const mCy = boxY + boxH * 0.5;
    ctx.strokeStyle = 'rgba(88, 238, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(infoX + 8, mCy); ctx.lineTo(infoX + infoW - 8, mCy);
    ctx.moveTo(mCx, boxY + 8); ctx.lineTo(mCx, boxY + boxH - 8);
    ctx.stroke();

    const dotX = mCx + ils.locDev * (infoW * 0.36);
    const dotY = mCy - ils.gsDev * (boxH * 0.36);
    ctx.fillStyle = (Math.abs(ils.locDev) < 0.25 && Math.abs(ils.gsDev) < 0.28) ? HUD_COLORS.PRIMARY : HUD_COLORS.AMBER;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(180, 225, 245, 0.80)';
    ctx.font = `700 9px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText('LOC / GS CDI', mCx, boxY + boxH + 14);

    // Subtle glass screen reflection
    const scrGlint = ctx.createLinearGradient(rx, panelY, rx + mfdW * 0.65, panelY + panelH * 0.7);
    scrGlint.addColorStop(0, 'rgba(190, 235, 255, 0.08)');
    scrGlint.addColorStop(0.5, 'rgba(190, 235, 255, 0.0)');
    ctx.fillStyle = scrGlint;
    ctx.fillRect(rx, panelY, mfdW, panelH);

    ctx.restore();
  }

  // 8. SLEEK FRAMELESS TOP CORNER MISSION & COCKPIT TAGS (With soft atmospheric legibility scrim!)
  {
    ctx.save();
    const scrimL = ctx.createLinearGradient(0, 0, 340, 0);
    scrimL.addColorStop(0, 'rgba(4, 10, 18, 0.56)');
    scrimL.addColorStop(0.75, 'rgba(4, 10, 18, 0.24)');
    scrimL.addColorStop(1, 'rgba(4, 10, 18, 0.0)');
    ctx.fillStyle = scrimL;
    ctx.fillRect(0, 0, 340, 62);

    const scrimR = ctx.createLinearGradient(width, 0, width - 340, 0);
    scrimR.addColorStop(0, 'rgba(4, 10, 18, 0.56)');
    scrimR.addColorStop(0.75, 'rgba(4, 10, 18, 0.24)');
    scrimR.addColorStop(1, 'rgba(4, 10, 18, 0.0)');
    ctx.fillStyle = scrimR;
    ctx.fillRect(width - 340, 0, 340, 62);

    ctx.shadowColor = 'rgba(0, 10, 16, 0.90)';
    ctx.shadowBlur = 4;

    ctx.fillStyle = HUD_COLORS.AMBER;
    ctx.fillRect(24, 18, 3, 30);
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${world.mission.code} · ${world.mission.name}`, 34, 30);
    ctx.fillStyle = '#F2FAFF';
    ctx.font = `700 11.5px ${mono}`;
    ctx.fillText(`SPD ${Math.round(craft.airspeedKt)} KT · ALT ${Math.round(craft.altitudeFt)} FT · HDG ${String(Math.round(tel.headingDeg)).padStart(3, '0')}°`, 34, 46);

    ctx.fillStyle = HUD_COLORS.CYAN;
    ctx.fillRect(width - 27, 18, 3, 28);
    ctx.font = `800 11px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText('GLASS COCKPIT [C] · VX-9 KESTREL', width - 36, 30);
    ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
    ctx.font = `600 10px ${mono}`;
    ctx.fillText(`${world.weather.label} · SKJOLD SECTOR 09`, width - 36, 45);
    ctx.restore();
  }

  ctx.restore();
}
