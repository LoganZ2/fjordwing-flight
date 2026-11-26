// FJORDWING — Smooth spring-damped Chase, Cockpit, Wingman & Briefing Orbit cameras.

import {
  clamp,
  degToRad,
  lerp,
  vec3,
  vec3Add,
  vec3Scale,
  vec3Lerp,
  vec3Norm,
} from './math.js';
import { getTerrainHeight } from './terrain.js';

export class FlightCamera {
  constructor() {
    this.mode = 'chase';
    this.pos = vec3(-1680, 265, 220);
    this.target = vec3(-1600, 255, 210);
    this.up = vec3(0, 1, 0);
    this.fovRad = degToRad(62);
    this.initialized = false;
  }

  setMode(mode) {
    this.mode = mode;
    this.initialized = false;
  }

  snap(world) {
    this.initialized = false;
    this.update(world, 0.016, true);
  }

  update(world, dt, forceSnap = false) {
    const craft = world.aircraft;
    const f = craft.basis.forward;
    const r = craft.basis.right;
    const u = craft.basis.up;

    // Briefing / Hangar live scenic orbit showcasing VX-9 Kestrel over golden-hour Skjold Fjord
    if (world.phase === 'briefing') {
      const ang = world.briefingOrbitAngle ?? 0.56;
      const dist = 20.0;
      const desiredPos = vec3Add(
        craft.pos,
        vec3Add(
          vec3Scale(f, Math.cos(ang) * dist * 0.62),
          vec3Add(vec3Scale(r, Math.sin(ang) * dist), vec3Scale(u, -0.8))
        )
      );
      // Slight low-angle hero perspective framing VX-9 Kestrel against snow-capped peaks & golden sky
      const desiredTarget = vec3Add(craft.pos, vec3Add(vec3Scale(f, 2.0), vec3(0, -1.8, 0)));
      this.pos = desiredPos;
      this.target = desiredTarget;
      this.up = vec3(0, 1, 0);
      this.fovRad = degToRad(50);
      this.initialized = true;
      return;
    }

    let desiredPos;
    let desiredTarget;
    let desiredUp;
    let desiredFov;

    if (this.mode === 'cockpit') {
      // Eye inside the VX-9 Kestrel canopy looking cleanly down the nose & HUD combiner
      desiredPos = vec3Add(craft.pos, vec3Add(vec3Scale(f, 2.5), vec3Scale(u, 1.32)));
      desiredTarget = vec3Add(desiredPos, vec3Scale(f, 250));
      desiredUp = u;
      desiredFov = degToRad(craft.afterburner ? 68 : 63);
      this.pos = desiredPos;
      this.target = desiredTarget;
      this.up = desiredUp;
      this.fovRad = desiredFov;
      this.initialized = true;
      return;
    }

    if (this.mode === 'wingman') {
      // Dramatic cinematic starboard-quarter beauty angle
      desiredPos = vec3Add(
        craft.pos,
        vec3Add(vec3Scale(f, -15.5), vec3Add(vec3Scale(r, 14.2), vec3Scale(u, 4.5)))
      );
      desiredTarget = vec3Add(craft.pos, vec3Scale(f, 18.0));
      desiredUp = vec3Norm(vec3Lerp(vec3(0, 1, 0), u, 0.28));
      desiredFov = degToRad(56);
    } else {
      // Chase camera: spring-damped behind & slightly above aircraft, never fighting pilot inputs
      const speedNorm = clamp((craft.speed - 55) / 145, 0, 1);
      const backDist = 18.8 + speedNorm * 3.4 + (craft.afterburner ? 1.8 : 0);
      const heightOff = 4.6 + (craft.onGround ? 0.8 : 0);
      desiredPos = vec3Add(
        craft.pos,
        vec3Add(vec3Scale(f, -backDist), vec3Add(vec3Scale(u, heightOff * 0.55), vec3(0, heightOff * 0.52, 0)))
      );
      desiredTarget = vec3Add(craft.pos, vec3Add(vec3Scale(f, 52.0), vec3Scale(u, 1.2)));
      // Subtle bank coupling (32% roll follow) keeps horizon natural while feeling kinetic!
      desiredUp = vec3Norm(vec3Lerp(vec3(0, 1, 0), u, 0.30));
      desiredFov = degToRad(58 + speedNorm * 8 + (craft.afterburner ? 5 : 0));
    }

    // Prevent chase camera from dipping beneath water or fjord terrain
    const groundY = Math.max(2.5, getTerrainHeight(desiredPos.x, desiredPos.z) + 3.2);
    if (desiredPos.y < groundY) desiredPos.y = groundY;

    // Subtle tactile afterburner / stall camera vibration
    if (!forceSnap && !world.paused && world.phase === 'flying') {
      const shake = (craft.afterburner ? 0.08 : 0) + (craft.stall ? 0.14 : 0);
      if (shake > 0) {
        desiredPos.x += Math.sin(world.time * 53) * shake;
        desiredPos.y += Math.cos(world.time * 61) * shake;
      }
    }

    if (!this.initialized || forceSnap) {
      this.pos = desiredPos;
      this.target = desiredTarget;
      this.up = desiredUp;
      this.fovRad = desiredFov;
      this.initialized = true;
    } else {
      const posRate = clamp(1 - Math.exp(-dt * 9.5), 0, 1);
      const tgtRate = clamp(1 - Math.exp(-dt * 14.0), 0, 1);
      this.pos = vec3Lerp(this.pos, desiredPos, posRate);
      this.target = vec3Lerp(this.target, desiredTarget, tgtRate);
      this.up = vec3Norm(vec3Lerp(this.up, desiredUp, clamp(dt * 7.0, 0, 1)));
      this.fovRad = lerp(this.fovRad, desiredFov, clamp(dt * 5.0, 0, 1));
    }
  }
}
