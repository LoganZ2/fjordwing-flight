// FJORDWING — Simulation world state, mission progression, ring collection, contrails & sortie lifecycle.

import { CAMERA_MODES, AIRCRAFT_SPEC } from './config.js';
import { createRng, vec3Add, vec3Dist, vec3Scale } from './math.js';
import { createAircraftState, stepFlightPhysics } from './physics.js';
import { getMissionById, getWeatherForMission, computeIlsGuidance } from './missions.js';

export class FlightWorld {
  constructor(seed = 1) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.time = 0;
    this.missionTime = 0;
    this.phase = 'briefing'; // 'briefing' | 'flying' | 'debrief'
    this.paused = false;
    this.cameraModeIndex = 0;
    this.cameraMode = CAMERA_MODES[0];
    this.briefingOrbitAngle = 0.62;
    this.shotMode = null;

    this.selectedMissionId = 'rally';
    this.mission = getMissionById('rally');
    this.weather = getWeatherForMission(this.mission);
    this.aircraft = createAircraftState(this.mission.spawn);
    this.rings = [];
    this.activeRingIndex = 0;
    this.ringsCleared = 0;
    this.score = 0;
    this.contrails = [[], []];
    this.trailAccum = 0;
    this.ils = computeIlsGuidance(this.aircraft);
    this.papiLights = this.ils.papiLights;
    this.debrief = null;
    this.events = [];

    this.loadMission('rally', 'briefing');
  }

  loadMission(missionId, nextPhase = 'flying') {
    this.selectedMissionId = missionId;
    this.mission = getMissionById(missionId);
    this.weather = getWeatherForMission(this.mission);
    this.aircraft = createAircraftState(this.mission.spawn);
    this.rings = this.mission.rings.map((r) => ({ ...r, cleared: false }));
    this.activeRingIndex = 0;
    this.ringsCleared = 0;
    this.score = 0;
    this.missionTime = 0;
    this.phase = nextPhase;
    this.paused = false;
    this.debrief = null;
    this.contrails = [[], []];
    this.trailAccum = 0;
    this.ils = computeIlsGuidance(this.aircraft);
    this.papiLights = this.ils.papiLights;
    this.events = [];

    // Seed initial wingtip contrail ribbons when airborne so flight feels immediately kinetic
    if (!this.aircraft.onGround) {
      this.seedContrails(22, 2.4);
    }
  }

  seedContrails(points = 24, spacingM = 2.6) {
    this.contrails = [[], []];
    const craft = this.aircraft;
    const f = craft.basis.forward;
    const r = craft.basis.right;
    const u = craft.basis.up;
    const leftTip = vec3Add(craft.pos, vec3Add(vec3Scale(r, -7.08), vec3Add(vec3Scale(f, -4.95), vec3Scale(u, -0.15))));
    const rightTip = vec3Add(craft.pos, vec3Add(vec3Scale(r, 7.08), vec3Add(vec3Scale(f, -4.95), vec3Scale(u, -0.15))));

    for (let i = points - 1; i >= 0; i--) {
      const back = vec3Scale(f, -i * spacingM);
      const alpha = craft.afterburner ? 0.56 : 0.34;
      this.contrails[0].push({ x: leftTip.x + back.x, y: leftTip.y + back.y, z: leftTip.z + back.z, alpha });
      this.contrails[1].push({ x: rightTip.x + back.x, y: rightTip.y + back.y, z: rightTip.z + back.z, alpha });
    }
  }

  cycleCamera() {
    this.cameraModeIndex = (this.cameraModeIndex + 1) % CAMERA_MODES.length;
    this.cameraMode = CAMERA_MODES[this.cameraModeIndex];
    return this.cameraMode;
  }

  setCameraMode(mode) {
    const idx = CAMERA_MODES.indexOf(mode);
    if (idx >= 0) {
      this.cameraModeIndex = idx;
      this.cameraMode = mode;
    }
  }

  step(controls, dt) {
    this.events.length = 0;

    if (this.phase === 'briefing') {
      this.time += dt;
      this.briefingOrbitAngle += dt * 0.16;
      this.ils = computeIlsGuidance(this.aircraft);
      this.papiLights = this.ils.papiLights;
      return;
    }

    if (this.paused || this.phase === 'debrief') {
      return;
    }

    this.time += dt;
    this.missionTime += dt;

    const wasAirborne = !this.aircraft.onGround;
    stepFlightPhysics(this.aircraft, controls, this.weather, dt, this.time);

    if (wasAirborne && this.aircraft.onGround && !this.aircraft.crashed) {
      this.events.push({ type: 'touchdown' });
    }

    // Check active target checkpoint ring collection
    const ring = this.rings[this.activeRingIndex];
    if (ring && !ring.cleared) {
      const dist = vec3Dist(this.aircraft.pos, ring);
      if (dist <= (ring.radius || 34) + 12) {
        ring.cleared = true;
        this.ringsCleared++;
        this.activeRingIndex++;
        this.score += ring.kind === 'fuel' ? 350 : 250;
        if (ring.fuelBonus) {
          this.aircraft.fuel = Math.min(AIRCRAFT_SPEC.FUEL_CAPACITY, this.aircraft.fuel + ring.fuelBonus);
        }
        this.events.push({ type: 'ring', isFuel: ring.kind === 'fuel' });
      }
    }

    // Update wingtip contrail ribbons during high-speed or high-G maneuvers
    this.trailAccum += dt;
    if (this.trailAccum >= 0.032) {
      this.trailAccum = 0;
      const craft = this.aircraft;
      const activeTrail = !craft.onGround && (craft.speed > 78 || Math.abs(craft.gLoad) > 1.7 || craft.afterburner);
      if (activeTrail) {
        const f = craft.basis.forward;
        const r = craft.basis.right;
        const u = craft.basis.up;
        const alpha = craft.afterburner ? 0.58 : Math.min(0.48, 0.16 + Math.abs(craft.gLoad - 1) * 0.18 + (craft.speed - 75) * 0.002);
        const lTip = vec3Add(craft.pos, vec3Add(vec3Scale(r, -7.08), vec3Add(vec3Scale(f, -4.95), vec3Scale(u, -0.15))));
        const rTip = vec3Add(craft.pos, vec3Add(vec3Scale(r, 7.08), vec3Add(vec3Scale(f, -4.95), vec3Scale(u, -0.15))));
        this.contrails[0].push({ x: lTip.x, y: lTip.y, z: lTip.z, alpha });
        this.contrails[1].push({ x: rTip.x, y: rTip.y, z: rTip.z, alpha });
        if (this.contrails[0].length > 34) this.contrails[0].shift();
        if (this.contrails[1].length > 34) this.contrails[1].shift();
      } else {
        if (this.contrails[0].length > 0) this.contrails[0].shift();
        if (this.contrails[1].length > 0) this.contrails[1].shift();
      }
    }

    // Update ILS guidance & dynamic PAPI glideslope lamps
    this.ils = computeIlsGuidance(this.aircraft);
    this.papiLights = this.ils.papiLights;

    // Evaluate mission completion or crash debrief
    if (this.aircraft.crashed) {
      this.phase = 'debrief';
      this.events.push({ type: 'crash' });
      this.debrief = {
        success: false,
        title: this.aircraft.crashReason || 'AIRCRAFT LOST',
        subtitle: `${this.mission.code} · ${this.mission.name}`,
        time: this.missionTime,
        ringsCleared: this.ringsCleared,
        totalRings: this.rings.length,
        fuelRemaining: Math.round(this.aircraft.fuel),
        hullRemaining: 0,
        touchdownFpm: this.aircraft.lastTouchdownFpm,
        score: this.score,
      };
    } else if (this.checkMissionComplete()) {
      this.phase = 'debrief';
      const timeBonus = Math.max(0, Math.round(600 - this.missionTime * 4));
      const fuelBonus = Math.round(this.aircraft.fuel * 8);
      const hullBonus = Math.round(this.aircraft.hull * 5);
      this.score += timeBonus + fuelBonus + hullBonus;
      this.debrief = {
        success: true,
        title: this.aircraft.landedSafely ? 'SMOOTH LANDING · MISSION COMPLETE' : 'SORTIE COMPLETE',
        subtitle: `${this.mission.code} · ${this.mission.name}`,
        time: this.missionTime,
        ringsCleared: this.ringsCleared,
        totalRings: this.rings.length,
        fuelRemaining: Math.round(this.aircraft.fuel),
        hullRemaining: Math.round(this.aircraft.hull),
        touchdownFpm: this.aircraft.lastTouchdownFpm,
        score: this.score,
      };
    }
  }

  checkMissionComplete() {
    const type = this.mission.objectiveType;
    if (type === 'rings') {
      return this.ringsCleared >= this.rings.length && (this.aircraft.landedSafely || this.aircraft.onGround);
    }
    if (type === 'fuel_and_land') {
      return this.ringsCleared >= this.rings.length && this.aircraft.landedSafely;
    }
    if (type === 'land') {
      return this.aircraft.landedSafely;
    }
    return false;
  }
}
