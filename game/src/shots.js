// FJORDWING — Deterministic screenshot scene presets (?shot=chase|cockpit|approach|wingman|briefing&seed=1).

import { WORLD } from './config.js';
import { basisFromHeadingPitchRoll, extractTelemetryAngles, vec3, vec3Scale } from './math.js';
import { computeIlsGuidance } from './missions.js';

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') ?? '1') || 1;
  return { shot, seed };
}

function setAircraftPose(world, cfg) {
  const craft = world.aircraft;
  const basis = basisFromHeadingPitchRoll(cfg.headingDeg, cfg.pitchDeg, cfg.rollDeg);
  craft.pos = vec3(cfg.x, cfg.y, cfg.z);
  craft.basis = basis;
  craft.speed = cfg.speed;
  craft.vel = vec3Scale(basis.forward, cfg.speed);
  craft.airspeedKt = cfg.speed * WORLD.MPS_TO_KT;
  craft.altitudeFt = cfg.y * WORLD.M_TO_FT;
  craft.aglM = cfg.aglM ?? cfg.y;
  craft.vsiFpm = craft.vel.y * WORLD.M_TO_FT * 60;
  craft.throttle = cfg.throttle;
  craft.afterburner = Boolean(cfg.afterburner);
  craft.flaps = cfg.flaps ?? 0;
  craft.gearDeployed = Boolean(cfg.gearDeployed);
  craft.speedbrake = Boolean(cfg.speedbrake);
  craft.fuel = cfg.fuel;
  craft.hull = cfg.hull ?? 100;
  craft.gLoad = cfg.gLoad ?? 1.0;
  craft.aoaRad = cfg.aoaRad ?? 0.04;
  craft.stall = false;
  craft.overspeed = false;
  craft.onGround = false;
  craft.telemetry = extractTelemetryAngles(basis);
}

// Configure exact deterministic golden-hour chase, 3D glass cockpit, storm ILS approach & alpine wingman renders.
export function applyShotPreset(world, camera, shotName) {
  if (!shotName) return false;
  world.shotMode = shotName;
  world.time = 18.4;

  if (shotName === 'chase') {
    // 1-chase-fjord.jpg (LARGE COVER): Dramatic golden-hour chase over sapphire-gold Skjold Fjord,
    // sculpted VX-9 Kestrel banking smoothly with Mach shock-diamond afterburners & contrails,
    // glowing amber gate lined up toward Runway 09, Nordic village & lighthouse, frameless fighter HUD!
    world.loadMission('rally', 'flying');
    world.setCameraMode('chase');
    world.rings[0].cleared = true;
    world.rings[1].cleared = true;
    world.ringsCleared = 2;
    world.activeRingIndex = 2;
    world.missionTime = 38.4;
    world.score = 500;
    world.rings[2] = { x: -320, y: 156, z: 18, radius: 36, yawRad: Math.PI * 0.48, kind: 'gate', cleared: false };
    world.rings[3] = { x: 420, y: 118, z: 0, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate', cleared: false };

    setAircraftPose(world, {
      x: -710,
      y: 174,
      z: 56,
      headingDeg: 84,
      pitchDeg: -2.0,
      rollDeg: 18.5,
      speed: 138,
      throttle: 0.94,
      afterburner: true,
      gearDeployed: false,
      flaps: 0,
      fuel: 78,
      hull: 100,
      gLoad: 2.1,
      aglM: 174,
    });
    world.seedContrails(30, 2.7);
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = world.ils.papiLights;
    camera.setMode('chase');
    camera.snap(world);
    return true;
  }

  if (shotName === 'cockpit') {
    // 2-cockpit-hud.jpg: Full Sculpted 3D Glass Cockpit — live 3D aircraft nose cone visible out canopy,
    // riveted titanium bow arch, collimated optical HUD combiner aligned on glowing canyon ring,
    // backlit PFD artificial horizon + UFC switches + Tactical Fjord Contour MFD!
    world.loadMission('rally', 'flying');
    world.setCameraMode('cockpit');
    world.rings[0].cleared = true;
    world.ringsCleared = 1;
    world.activeRingIndex = 1;
    world.missionTime = 24.6;
    world.score = 250;
    world.rings[1] = { x: -240, y: 172, z: 8, radius: 36, yawRad: Math.PI * 0.49, kind: 'gate', cleared: false };
    world.rings[2] = { x: 460, y: 120, z: 0, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate', cleared: false };

    setAircraftPose(world, {
      x: -590,
      y: 165,
      z: 20,
      headingDeg: 87,
      pitchDeg: 1.6,
      rollDeg: -8.5,
      speed: 126,
      throttle: 0.82,
      afterburner: false,
      gearDeployed: false,
      flaps: 0,
      fuel: 82,
      hull: 100,
      gLoad: 1.4,
      aglM: 165,
    });
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = world.ils.papiLights;
    camera.setMode('cockpit');
    camera.snap(world);
    return true;
  }

  if (shotName === 'approach') {
    // 3-runway-approach.jpg: Final ILS Glideslope Approach onto Wet-Sheen Runway 09 —
    // Dramatic clearing Nordic squall with sunset rays, sculpted VX-9 Kestrel with gear & flaps down,
    // vivid 2-WHITE / 2-RED PAPI lamps, ATC tower, hangars, Nordic village, lighthouse beam & ILS crosshairs!
    world.loadMission('ils', 'flying');
    world.weather = {
      ...world.weather,
      fogDensity: 0.000125,
      sunColor: [1.0, 0.68, 0.36],
      horizonColor: [0.80, 0.54, 0.40],
      fogColor: [0.34, 0.42, 0.52],
      rainIntensity: 0.32,
      wetness: 0.90,
      exposure: 1.14,
    };
    world.setCameraMode('chase');
    world.rings[0].cleared = true;
    world.rings[1].cleared = true;
    world.ringsCleared = 2;
    world.activeRingIndex = 2;
    world.missionTime = 46.2;
    world.score = 500;

    setAircraftPose(world, {
      x: -360,
      y: 50.0,
      z: 3.0,
      headingDeg: 90,
      pitchDeg: -3.2,
      rollDeg: -1.5,
      speed: 74,
      throttle: 0.44,
      afterburner: false,
      gearDeployed: true,
      flaps: 1,
      fuel: 48,
      hull: 100,
      gLoad: 1.0,
      aglM: 35.7,
    });
    world.contrails = [[], []];
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = [true, true, false, false]; // Textbook 2-WHITE / 2-RED on-glideslope PAPI!
    camera.setMode('chase');
    camera.snap(world);
    return true;
  }

  if (shotName === 'wingman') {
    // 4-canyon-wingman.jpg: Magazine-cover Hero 3/4 Wingman Canyon Bank in MSN 02 (ALPINE FUEL RUN) —
    // ENTIRE sculpted VX-9 Kestrel (nose radome to twin blazing Mach shock-diamond afterburners & contrails)
    // banking steeply across open golden sunrise Skjold Fjord toward a glowing cyan Aerial Fuel Beacon gate,
    // snow-capped alpine spires, sunlit volumetric clouds & sparkling turquoise fjord waters below!
    world.loadMission('fuelrun', 'flying');
    world.setCameraMode('wingman');
    world.rings[0].cleared = true;
    world.ringsCleared = 1;
    world.activeRingIndex = 1;
    world.missionTime = 52.8;
    world.score = 350;
    world.rings[1] = { x: -490, y: 278, z: -215, radius: 36, yawRad: Math.PI * 0.46, kind: 'fuel', fuelBonus: 20, cleared: false };
    world.rings[2] = { x: 420, y: 245, z: -120, radius: 36, yawRad: Math.PI * 0.50, kind: 'fuel', fuelBonus: 20, cleared: false };

    setAircraftPose(world, {
      x: -960,
      y: 238,
      z: -165,
      headingDeg: 86,
      pitchDeg: 4.5,
      rollDeg: -26.0,
      speed: 146,
      throttle: 0.96,
      afterburner: true,
      gearDeployed: false,
      flaps: 0,
      fuel: 42,
      hull: 100,
      gLoad: 2.6,
      aglM: 238,
    });
    world.seedContrails(34, 2.8);
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = world.ils.papiLights;
    camera.setMode('wingman');
    camera.snap(world);
    return true;
  }

  if (shotName === 'briefing') {
    world.loadMission('rally', 'briefing');
    world.briefingOrbitAngle = 0.72;
    setAircraftPose(world, {
      x: -720,
      y: 175,
      z: 220,
      headingDeg: 82,
      pitchDeg: 4.5,
      rollDeg: -14,
      speed: 132,
      throttle: 0.88,
      afterburner: true,
      gearDeployed: false,
      flaps: 0,
      fuel: 88,
      hull: 100,
      gLoad: 1.5,
      aglM: 175,
    });
    world.rings.forEach((r) => { r.cleared = true; });
    world.seedContrails(24, 2.5);
    camera.snap(world);
    return true;
  }

  return false;
}
