// FJORDWING — 6-DOF aerodynamic flight physics, stall dynamics, fuel burn, damage & runway landings.

import { WORLD, RUNWAY, AIRCRAFT_SPEC } from './config.js';
import {
  clamp,
  lerp,
  vec3,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Dot,
  vec3Len,
  rotateBasisLocal,
  basisFromHeadingPitchRoll,
  extractTelemetryAngles,
} from './math.js';
import { getTerrainHeight, isOnRunway } from './terrain.js';

export function createAircraftState(spawn) {
  const basis = basisFromHeadingPitchRoll(spawn.headingDeg, spawn.pitchDeg ?? 0, spawn.rollDeg ?? 0);
  const speed = spawn.speed ?? AIRCRAFT_SPEC.CRUISE_MPS;
  const vel = vec3Scale(basis.forward, speed);
  return {
    pos: vec3(spawn.x, spawn.y, spawn.z),
    vel,
    basis,
    speed,
    airspeedKt: speed * WORLD.MPS_TO_KT,
    altitudeFt: spawn.y * WORLD.M_TO_FT,
    aglM: Math.max(0, spawn.y - Math.max(0, getTerrainHeight(spawn.x, spawn.z))),
    vsiFpm: vel.y * WORLD.M_TO_FT * 60,
    throttle: spawn.throttle ?? 0.68,
    afterburner: Boolean(spawn.afterburner),
    flaps: spawn.flaps ?? 0,
    gearDeployed: Boolean(spawn.gearDeployed),
    speedbrake: false,
    fuel: spawn.fuel ?? AIRCRAFT_SPEC.FUEL_CAPACITY,
    hull: 100,
    aoaRad: 0.03,
    gLoad: 1.0,
    stall: false,
    overspeed: false,
    onGround: Boolean(spawn.onGround),
    touchdownBanner: null,
    touchdownTimer: 0,
    lastTouchdownFpm: 0,
    pitchRateCur: 0,
    rollRateCur: 0,
    yawRateCur: 0,
    telemetry: extractTelemetryAngles(basis),
    crashed: false,
    crashReason: null,
    landedSafely: false,
  };
}

export function stepFlightPhysics(craft, controls, weather, dt, simTime) {
  if (craft.crashed) return;

  // 1. Controls: throttle, afterburner, flaps, gear, speedbrake
  if (controls.throttleDelta !== 0) {
    craft.throttle = clamp(craft.throttle + controls.throttleDelta * dt * 0.62, 0, 1);
  }
  craft.afterburner = controls.afterburner && craft.fuel > 0 && craft.throttle > 0.35;
  craft.speedbrake = controls.brake;

  if (controls.toggleFlaps) {
    craft.flaps = craft.flaps > 0.5 ? 0 : 1;
  }
  if (controls.toggleGear && !craft.onGround) {
    craft.gearDeployed = !craft.gearDeployed;
  }

  // 2. Fuel burn (afterburner burns 3.7x faster, creating genuine sortie decisions!)
  const burnRate = craft.fuel > 0
    ? (AIRCRAFT_SPEC.FUEL_BURN_BASE * (0.18 + craft.throttle * 0.82) + (craft.afterburner ? AIRCRAFT_SPEC.FUEL_BURN_AB : 0))
    : 0;
  craft.fuel = Math.max(0, craft.fuel - burnRate * dt);
  if (craft.fuel <= 0) {
    craft.afterburner = false;
  }

  // 3. Relative air velocity accounting for fjord wind & storm turbulence
  const turb = weather.turbulence * (craft.onGround ? 0.05 : 1.0);
  const gustX = weather.windX + Math.sin(simTime * 1.9 + craft.pos.z * 0.01) * 4.2 * turb;
  const gustY = Math.cos(simTime * 2.7 + craft.pos.x * 0.01) * 2.1 * turb;
  const gustZ = weather.windZ + Math.sin(simTime * 1.4 - craft.pos.x * 0.008) * 5.0 * turb;

  const airVel = {
    x: craft.vel.x - gustX,
    y: craft.vel.y - gustY,
    z: craft.vel.z - gustZ,
  };
  const airspeed = vec3Len(airVel);
  const qDyn = 0.5 * WORLD.AIR_DENSITY_SEA * Math.exp(-Math.max(craft.pos.y, 0) / 8500) * airspeed * airspeed;

  // Control authority scales smoothly with airflow so controls feel crisp at every speed
  const controlAuthority = clamp((airspeed - 12) / 52, 0.22, 1.15);

  // Smooth angular response rates (never twitchy, never sluggish)
  const targetPitchRate = controls.pitch * AIRCRAFT_SPEC.PITCH_RATE * controlAuthority;
  const targetRollRate = controls.roll * AIRCRAFT_SPEC.ROLL_RATE * controlAuthority;
  const targetYawRate = controls.yaw * AIRCRAFT_SPEC.YAW_RATE * controlAuthority;

  const rateBlend = clamp(dt * 8.5, 0, 1);
  craft.pitchRateCur = lerp(craft.pitchRateCur, targetPitchRate, rateBlend);
  craft.rollRateCur = lerp(craft.rollRateCur, targetRollRate, rateBlend);
  craft.yawRateCur = lerp(craft.yawRateCur, targetYawRate, rateBlend);

  // Subtle coordinated turn yaw assist when rolling cleanly in flight
  const bankYaw = !craft.onGround ? Math.sin(craft.telemetry.rollRad) * 0.24 * clamp(airspeed / 85, 0.2, 1.0) : 0;

  // Stall nose-drop & buffet when below critical speed or excessive AoA
  const fwdSpeed = vec3Dot(airVel, craft.basis.forward);
  const upSpeed = vec3Dot(airVel, craft.basis.up);
  const aoa = airspeed > 6 ? Math.atan2(-upSpeed, Math.max(fwdSpeed, 1.0)) : 0;
  craft.aoaRad = aoa;

  const stallThresh = AIRCRAFT_SPEC.STALL_SPEED_MPS * (craft.flaps > 0.5 ? 0.80 : 1.0);
  craft.stall = !craft.onGround && (airspeed < stallThresh || Math.abs(aoa) > AIRCRAFT_SPEC.STALL_AOA_RAD);
  craft.overspeed = airspeed > AIRCRAFT_SPEC.VNE_MPS;

  let stallPitch = 0;
  let stallRoll = 0;
  if (craft.stall) {
    stallPitch = -0.35 * dt;
    stallRoll = Math.sin(simTime * 19.0) * 0.32 * dt;
  }

  // Apply local 3D basis rotation (restrict roll & negative pitch on ground)
  if (craft.onGround) {
    const steerYaw = (controls.yaw + controls.roll * 0.55) * 0.75 * clamp(airspeed / 35, 0.15, 1.0);
    const groundPitch = Math.max(0, craft.pitchRateCur) * (airspeed > 32 ? 0.85 : 0.08);
    // Keep wings level on tarmac
    const levelRoll = -craft.telemetry.rollRad * 4.0;
    craft.basis = rotateBasisLocal(craft.basis, groundPitch * dt, levelRoll * dt, steerYaw * dt);
  } else {
    craft.basis = rotateBasisLocal(
      craft.basis,
      craft.pitchRateCur * dt + stallPitch,
      craft.rollRateCur * dt + stallRoll,
      (craft.yawRateCur + bankYaw) * dt
    );
  }

  // 4. Aerodynamic Forces: Thrust, Lift, Drag, Sideslip Damping, Gravity
  const effThrottle = craft.fuel > 0 ? craft.throttle : 0;
  const thrustMag =
    AIRCRAFT_SPEC.MAX_THRUST *
    effThrottle *
    (craft.afterburner ? AIRCRAFT_SPEC.AFTERBURNER_MULT : 1.0);
  const thrustForce = vec3Scale(craft.basis.forward, thrustMag);

  // Lift curve with soft post-stall dropoff
  let cl = (aoa + 0.048) * AIRCRAFT_SPEC.CL_ALPHA + craft.flaps * AIRCRAFT_SPEC.CL_FLAPS;
  if (Math.abs(aoa) > AIRCRAFT_SPEC.STALL_AOA_RAD) {
    const excess = Math.abs(aoa) - AIRCRAFT_SPEC.STALL_AOA_RAD;
    cl *= Math.max(0.28, 1.0 - excess * 2.2);
  }
  cl = clamp(cl, -1.1, AIRCRAFT_SPEC.CL_MAX + craft.flaps * 0.35);

  const liftMag = qDyn * AIRCRAFT_SPEC.WING_AREA * cl;
  const liftForce = vec3Scale(craft.basis.up, liftMag);

  // Parasitic + induced + configuration drag
  const cd =
    AIRCRAFT_SPEC.CD_BASE +
    cl * cl * 0.044 +
    craft.flaps * AIRCRAFT_SPEC.CD_FLAPS +
    (craft.gearDeployed ? AIRCRAFT_SPEC.CD_GEAR : 0) +
    (craft.speedbrake ? AIRCRAFT_SPEC.CD_BRAKE : 0);
  const dragMag = qDyn * AIRCRAFT_SPEC.WING_AREA * cd;
  const airDir = airspeed > 0.1 ? vec3Scale(airVel, 1 / airspeed) : craft.basis.forward;
  const dragForce = vec3Scale(airDir, -dragMag);

  // Lateral weathervane stability keeps flight crisp and aligned with nose
  const sideSpeed = vec3Dot(airVel, craft.basis.right);
  const sideForce = vec3Scale(craft.basis.right, -sideSpeed * AIRCRAFT_SPEC.MASS * 2.15);

  // Gentle vertical weathervane damping so velocity tracks nose smoothly without mushy slide
  const vertAlignForce = vec3Scale(craft.basis.up, -upSpeed * AIRCRAFT_SPEC.MASS * 0.55);

  const gravityForce = { x: 0, y: -AIRCRAFT_SPEC.MASS * WORLD.GRAVITY, z: 0 };

  let netForce = vec3Add(thrustForce, liftForce);
  netForce = vec3Add(netForce, dragForce);
  netForce = vec3Add(netForce, sideForce);
  netForce = vec3Add(netForce, vertAlignForce);
  netForce = vec3Add(netForce, gravityForce);

  const accel = vec3Scale(netForce, 1 / AIRCRAFT_SPEC.MASS);
  craft.vel = vec3Add(craft.vel, vec3Scale(accel, dt));

  // G-load measurement (normal acceleration + 1G gravity projection)
  const normalAccel = vec3Dot(vec3Sub(accel, { x: 0, y: -WORLD.GRAVITY, z: 0 }), craft.basis.up);
  craft.gLoad = lerp(craft.gLoad, clamp(normalAccel / WORLD.GRAVITY, -3.5, 9.5), clamp(dt * 8, 0, 1));

  // Overspeed or extreme G-load gently stresses airframe hull
  if (craft.overspeed) {
    craft.hull = Math.max(0, craft.hull - 5.5 * dt);
  }
  if (Math.abs(craft.gLoad) > 7.8) {
    craft.hull = Math.max(0, craft.hull - 4.0 * dt);
  }

  // Integrate world position
  craft.pos = vec3Add(craft.pos, vec3Scale(craft.vel, dt));

  // Soft archipelago boundary wrap-in pushback so pilot never flies off world edge
  const bound = WORLD.HALF - 550;
  if (Math.abs(craft.pos.x) > bound) {
    craft.vel.x -= Math.sign(craft.pos.x) * 35 * dt;
  }
  if (Math.abs(craft.pos.z) > bound) {
    craft.vel.z -= Math.sign(craft.pos.z) * 35 * dt;
  }
  if (craft.pos.y > 2400) {
    craft.pos.y = 2400;
    craft.vel.y = Math.min(craft.vel.y, 0);
  }

  // 5. Ground, Ocean & Runway 09/27 Contact / Landing Evaluation
  const terrainH = getTerrainHeight(craft.pos.x, craft.pos.z);
  const onRunwayDeck = isOnRunway(craft.pos.x, craft.pos.z);
  const surfaceY = onRunwayDeck ? RUNWAY.SURFACE_Y : Math.max(WORLD.WATER_LEVEL, terrainH);
  const clearance = craft.gearDeployed ? AIRCRAFT_SPEC.GEAR_HEIGHT : 1.1;
  const agl = craft.pos.y - surfaceY;

  if (agl <= clearance) {
    const sinkRate = -craft.vel.y;
    const rollAbs = Math.abs(craft.telemetry.rollDeg);
    const hitWater = !onRunwayDeck && terrainH <= WORLD.WATER_LEVEL + 0.5;

    if (hitWater) {
      craft.pos.y = WORLD.WATER_LEVEL + 1.0;
      craft.crashed = true;
      craft.hull = 0;
      craft.crashReason = 'WATER IMPACT';
      craft.vel = vec3(0, 0, 0);
    } else if (onRunwayDeck && craft.gearDeployed && rollAbs < 24 && sinkRate < AIRCRAFT_SPEC.HARD_LANDING_SINK) {
      // Runway touchdown!
      const wasAirborne = !craft.onGround;
      craft.pos.y = surfaceY + clearance;
      craft.vel.y = Math.max(0, craft.vel.y);
      craft.onGround = true;

      if (wasAirborne && sinkRate > 0.35) {
        craft.lastTouchdownFpm = Math.round(sinkRate * WORLD.M_TO_FT * 60);
        if (sinkRate < 2.2) {
          craft.touchdownBanner = `SMOOTH LANDING · ${craft.lastTouchdownFpm} FPM`;
        } else if (sinkRate < AIRCRAFT_SPEC.MAX_SAFE_SINK) {
          craft.touchdownBanner = `TOUCHDOWN · ${craft.lastTouchdownFpm} FPM`;
        } else {
          const dmg = Math.round((sinkRate - AIRCRAFT_SPEC.MAX_SAFE_SINK) * 8);
          craft.hull = Math.max(10, craft.hull - dmg);
          craft.touchdownBanner = `FIRM TOUCHDOWN (-${dmg}% HULL)`;
        }
        craft.touchdownTimer = 4.0;
      }

      // Wheel rolling drag & braking on tarmac
      const wheelBrake = craft.speedbrake || controls.throttleDelta < 0 || craft.throttle < 0.08 ? 22.0 : 3.2;
      const horizSpeed = Math.hypot(craft.vel.x, craft.vel.z);
      if (horizSpeed > 0.1) {
        const drop = Math.min(horizSpeed, wheelBrake * dt);
        const factor = (horizSpeed - drop) / horizSpeed;
        craft.vel.x *= factor;
        craft.vel.z *= factor;
      }
      // Safe full-stop landing check
      if (horizSpeed < 9.5 && craft.throttle < 0.15) {
        craft.landedSafely = true;
      }
    } else if (onRunwayDeck && (!craft.gearDeployed || sinkRate >= AIRCRAFT_SPEC.HARD_LANDING_SINK)) {
      craft.pos.y = surfaceY + 1.0;
      craft.crashed = true;
      craft.hull = 0;
      craft.crashReason = !craft.gearDeployed ? 'GEAR-UP IMPACT' : 'HARD LANDING';
      craft.vel = vec3(0, 0, 0);
    } else {
      // Terrain impact off-runway
      craft.pos.y = surfaceY + 1.0;
      craft.crashed = true;
      craft.hull = 0;
      craft.crashReason = craft.fuel <= 0 ? 'FUEL EXHAUSTED' : 'TERRAIN IMPACT';
      craft.vel = vec3(0, 0, 0);
    }
  } else {
    craft.onGround = false;
  }

  if (craft.hull <= 0 && !craft.crashed) {
    craft.crashed = true;
    craft.crashReason = 'AIRFRAME FAILURE';
  }

  if (craft.touchdownTimer > 0) {
    craft.touchdownTimer = Math.max(0, craft.touchdownTimer - dt);
  }

  // 6. Refresh HUD telemetry readouts
  craft.speed = vec3Len(craft.vel);
  craft.airspeedKt = craft.speed * WORLD.MPS_TO_KT;
  craft.altitudeFt = Math.max(0, craft.pos.y * WORLD.M_TO_FT);
  craft.aglM = Math.max(0, craft.pos.y - surfaceY);
  craft.vsiFpm = craft.vel.y * WORLD.M_TO_FT * 60;
  craft.telemetry = extractTelemetryAngles(craft.basis);
}
