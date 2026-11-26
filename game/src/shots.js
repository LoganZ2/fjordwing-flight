// FJORDWING — Deterministic screenshot scene configuration (?shot=chase|cockpit|approach|briefing&seed=1).

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

// Configure exact deterministic golden-hour, cockpit, approach & briefing renders.
export function applyShotPreset(world, camera, shotName) {
  if (!shotName) return false;
  world.shotMode = shotName;
  world.time = 18.4;

  if (shotName === 'chase') {
    // 1-chase-fjord.jpg (LARGE COVER): Dramatic golden-hour chase over Skjold Fjord,
    // VX-9 Kestrel banking smoothly with twin afterburners & contrails, Runway 09 below-ahead,
    // glowing amber target ring dead ahead, snow peaks & shimmering bay, ultra-crisp HUD!
    world.loadMission('rally', 'flying');
    world.setCameraMode('chase');
    world.rings[0].cleared = true;
    world.rings[1].cleared = true;
    world.ringsCleared = 2;
    world.activeRingIndex = 2;
    world.missionTime = 38.4;
    world.score = 500;
    // Frame ring #2 right in front of the banking aircraft along the golden fjord towards Runway 09
    world.rings[2] = { x: -340, y: 158, z: 22, radius: 36, yawRad: Math.PI * 0.48, kind: 'gate', cleared: false };
    world.rings[3] = { x: 420, y: 120, z: 0, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate', cleared: false };

    setAircraftPose(world, {
      x: -720,
      y: 176,
      z: 58,
      headingDeg: 84,
      pitchDeg: -2.0,
      rollDeg: 17.5,
      speed: 136,
      throttle: 0.92,
      afterburner: true,
      gearDeployed: false,
      flaps: 0,
      fuel: 78,
      hull: 100,
      gLoad: 2.1,
      aglM: 176,
    });
    world.seedContrails(28, 2.7);
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = world.ils.papiLights;
    camera.setMode('chase');
    camera.snap(world);
    return true;
  }

  if (shotName === 'cockpit') {
    // 2-cockpit-hud.jpg: Full Illuminated 3D Glass Cockpit — collimated HUD combiner glass,
    // Garmin-style PFD attitude/engine display + MFD Fjord radar/ILS, glowing ring & runway ahead!
    world.loadMission('rally', 'flying');
    world.setCameraMode('cockpit');
    world.rings[0].cleared = true;
    world.ringsCleared = 1;
    world.activeRingIndex = 1;
    world.missionTime = 24.6;
    world.score = 250;
    world.rings[1] = { x: -240, y: 175, z: 10, radius: 36, yawRad: Math.PI * 0.49, kind: 'gate', cleared: false };
    world.rings[2] = { x: 460, y: 122, z: 0, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate', cleared: false };

    setAircraftPose(world, {
      x: -590,
      y: 165,
      z: 22,
      headingDeg: 87,
      pitchDeg: 1.4,
      rollDeg: -8.5,
      speed: 124,
      throttle: 0.80,
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
    // 3-runway-approach.jpg: Final ILS Glideslope Approach onto Runway 09 —
    // Painted '09' & threshold piano keys, control tower, hangars, glowing 2W/2R PAPI lamps,
    // gear & flaps deployed, ILS localizer/glideslope crosshairs dead-on!
    world.loadMission('ils', 'flying');
    world.weather = {
      ...world.weather,
      fogDensity: 0.000145,
      sunColor: [0.96, 0.72, 0.48],
      horizonColor: [0.64, 0.56, 0.54],
      fogColor: [0.46, 0.50, 0.58],
      rainIntensity: 0.35,
      exposure: 1.08,
    };
    world.setCameraMode('chase');
    world.rings[0].cleared = true;
    world.rings[1].cleared = true;
    world.ringsCleared = 2;
    world.activeRingIndex = 2;
    world.missionTime = 46.2;
    world.score = 500;

    setAircraftPose(world, {
      x: -365,
      y: 50.5,
      z: 3.5,
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
      aglM: 36.2,
    });
    world.contrails = [[], []];
    world.ils = computeIlsGuidance(world.aircraft);
    world.papiLights = [true, true, false, false]; // Textbook 2-WHITE / 2-RED on-glideslope PAPI!
    camera.setMode('chase');
    camera.snap(world);
    return true;
  }

  if (shotName === 'briefing') {
    // 4-mission-briefing.jpg: Translucent Mission Hangar over live golden-hour Skjold Fjord & VX-9 Kestrel!
    world.loadMission('rally', 'briefing');
    world.briefingOrbitAngle = 1.24;
    setAircraftPose(world, {
      x: -740,
      y: 168,
      z: 240,
      headingDeg: 82,
      pitchDeg: 5.0,
      rollDeg: -11,
      speed: 132,
      throttle: 0.88,
      afterburner: true,
      gearDeployed: false,
      flaps: 0,
      fuel: 88,
      hull: 100,
      gLoad: 1.5,
      aglM: 168,
    });
    // Hide rings behind briefing camera so only the dramatic fjord peaks, bay & jet frame the hangar
    world.rings.forEach((r) => { r.cleared = true; });
    world.seedContrails(24, 2.5);
    camera.snap(world);
    return true;
  }

  return false;
}
