// FJORDWING — 3 distinct playable missions + Free Flight, ring courses, ILS glideslope & PAPI lighting.

import { RUNWAY, WEATHER_PRESETS, WORLD } from './config.js';
import { clamp, radToDeg } from './math.js';

export const MISSIONS = [
  {
    id: 'rally',
    index: 1,
    code: 'MSN 01',
    name: 'FJORD RING RALLY',
    subtitle: 'Golden-Hour Canyon Time Trial',
    description: 'Carve through 8 glowing alpine fjord gates at high speed, manage afterburner fuel across climbs, and line up onto Coastal Runway 09.',
    weatherKey: 'golden',
    difficulty: 'STANDARD',
    fuelStart: 88,
    objectiveType: 'rings',
    spawn: {
      x: -1650,
      y: 255,
      z: 210,
      headingDeg: 79,
      pitchDeg: -2,
      rollDeg: 14,
      speed: 132,
      throttle: 0.78,
      afterburner: false,
      gearDeployed: false,
      flaps: 0,
      fuel: 88,
    },
    rings: [
      { x: -1020, y: 205, z: 85, radius: 34, yawRad: Math.PI * 0.44, kind: 'gate' },
      { x: -340, y: 160, z: -25, radius: 34, yawRad: Math.PI * 0.48, kind: 'gate' },
      { x: 420, y: 125, z: 10, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate' },
      { x: 1180, y: 175, z: 115, radius: 34, yawRad: Math.PI * 0.56, kind: 'gate' },
      { x: 1860, y: 260, z: -140, radius: 34, yawRad: Math.PI * 0.25, kind: 'gate' },
      { x: 1460, y: 310, z: -690, radius: 34, yawRad: -Math.PI * 0.38, kind: 'gate' },
      { x: 350, y: 245, z: -610, radius: 34, yawRad: -Math.PI * 0.52, kind: 'gate' },
      { x: -580, y: 115, z: 0, radius: 36, yawRad: Math.PI * 0.50, kind: 'gate' },
    ],
  },
  {
    id: 'fuelrun',
    index: 2,
    code: 'MSN 02',
    name: 'ALPINE FUEL RUN',
    subtitle: 'High-Altitude Bingo Economy Sortie',
    description: 'Launch on 42% reserve fuel. Climb over glacier ridges through 6 aerial refueling beacons, conserve cruise throttle, and touch down on Runway 09.',
    weatherKey: 'alpine',
    difficulty: 'TACTICAL',
    fuelStart: 42,
    objectiveType: 'fuel_and_land',
    spawn: {
      x: 120,
      y: 16.4,
      z: 0,
      headingDeg: 90,
      pitchDeg: 0,
      rollDeg: 0,
      speed: 35,
      throttle: 0.72,
      afterburner: false,
      gearDeployed: true,
      flaps: 0,
      fuel: 42,
      onGround: true,
    },
    rings: [
      { x: 1350, y: 245, z: -120, radius: 34, yawRad: Math.PI * 0.42, kind: 'fuel', fuelBonus: 18 },
      { x: 2240, y: 470, z: -560, radius: 34, yawRad: Math.PI * 0.20, kind: 'fuel', fuelBonus: 20 },
      { x: 1740, y: 540, z: -1150, radius: 34, yawRad: -Math.PI * 0.35, kind: 'fuel', fuelBonus: 20 },
      { x: 480, y: 460, z: -980, radius: 34, yawRad: -Math.PI * 0.55, kind: 'fuel', fuelBonus: 18 },
      { x: -940, y: 310, z: -480, radius: 34, yawRad: -Math.PI * 0.80, kind: 'fuel', fuelBonus: 16 },
      { x: -820, y: 135, z: 0, radius: 36, yawRad: Math.PI * 0.50, kind: 'gate' },
    ],
  },
  {
    id: 'ils',
    index: 3,
    code: 'MSN 03',
    name: 'STORM ILS APPROACH',
    subtitle: 'Crosswind Precision Glideslope Landing',
    description: 'Descend through a 16 kt Nordic fjord squall with gear & flaps deployed. Track the ILS localizer, glideslope diamond, and PAPI lamps onto Runway 09.',
    weatherKey: 'storm',
    difficulty: 'EXPERT',
    fuelStart: 54,
    objectiveType: 'land',
    spawn: {
      x: -1680,
      y: 175,
      z: 95,
      headingDeg: 86,
      pitchDeg: -3.2,
      rollDeg: -4,
      speed: 82,
      throttle: 0.48,
      afterburner: false,
      gearDeployed: true,
      flaps: 1,
      fuel: 54,
    },
    rings: [
      { x: -1120, y: 112, z: 18, radius: 34, yawRad: Math.PI * 0.50, kind: 'gate' },
      { x: -560, y: 66, z: 0, radius: 32, yawRad: Math.PI * 0.50, kind: 'gate' },
    ],
  },
  {
    id: 'free',
    index: 4,
    code: 'FREE',
    name: 'FREE FLIGHT',
    subtitle: 'Open Skjold Fjord Exploration',
    description: 'Take off or soar freely across the entire golden-hour Skjold Fjord archipelago, practice canyon aerobatics, and perform touch-and-go landings.',
    weatherKey: 'golden',
    difficulty: 'SANDBOX',
    fuelStart: 100,
    objectiveType: 'free',
    spawn: {
      x: -1200,
      y: 265,
      z: 180,
      headingDeg: 82,
      pitchDeg: 0,
      rollDeg: 8,
      speed: 126,
      throttle: 0.72,
      afterburner: false,
      gearDeployed: false,
      flaps: 0,
      fuel: 100,
    },
    rings: [
      { x: -420, y: 190, z: 30, radius: 36, yawRad: Math.PI * 0.48, kind: 'gate' },
      { x: 560, y: 140, z: 0, radius: 36, yawRad: Math.PI * 0.50, kind: 'gate' },
      { x: 1480, y: 230, z: 85, radius: 36, yawRad: Math.PI * 0.46, kind: 'gate' },
    ],
  },
];

export function getMissionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function getWeatherForMission(mission) {
  return WEATHER_PRESETS[mission.weatherKey] ?? WEATHER_PRESETS.golden;
}

// Compute live ILS Localizer (lateral) and Glideslope (vertical) deviations for Runway 09
export function computeIlsGuidance(craft) {
  const dx = RUNWAY.TOUCHDOWN_X - craft.pos.x; // positive when West of touchdown point (approaching 09)
  const dz = craft.pos.z - RUNWAY.CENTER_Z;     // positive when South of centerline (need left correction)
  const distM = Math.hypot(dx, dz);
  const distNm = distM / 1852;

  const heightAboveRunway = craft.pos.y - RUNWAY.SURFACE_Y;
  const horizToTouchdown = Math.max(dx, 1);
  const actualAngleDeg = radToDeg(Math.atan2(heightAboveRunway, horizToTouchdown));
  const gsErrorDeg = actualAngleDeg - RUNWAY.GLIDESLOPE_DEG; // >0 high, <0 low
  const locAngleDeg = radToDeg(Math.atan2(dz, Math.max(dx, 50)));

  // Normalize to [-1, +1] for cockpit & HUD ILS diamond scales
  const locDev = clamp(-locAngleDeg / 6.0, -1, 1); // +1 = runway is to the right
  const gsDev = clamp(-gsErrorDeg / 2.2, -1, 1);   // +1 = glideslope is above aircraft (fly up)

  const inApproachCone = dx > -120 && dx < 3800 && Math.abs(dz) < 950;

  // 4-lamp PAPI glideslope bar (ideal 3.6 deg = 2 WHITE, 2 RED!)
  const papiThresholds = [2.6, 3.25, 3.95, 4.6];
  const papiLights = papiThresholds.map((th) => actualAngleDeg >= th);

  return {
    inApproachCone,
    distM,
    distNm,
    actualAngleDeg,
    gsErrorDeg,
    locDev,
    gsDev,
    papiLights,
    altitudeAboveRunwayFt: Math.max(0, heightAboveRunway * WORLD.M_TO_FT),
  };
}
