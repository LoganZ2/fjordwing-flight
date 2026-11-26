// FJORDWING — WebGL2 rendering pipeline for sky, terrain, ocean, runway, landmarks, rings, aircraft & contrails.

import { RUNWAY } from './config.js';
import {
  mat4Identity,
  mat4Perspective,
  mat4LookAt,
  mat4Multiply,
  mat4FromBasis,
  mat4TranslateScale,
  mat4RotateY,
  mat4RotateZ,
  vec3Norm,
  vec3Sub,
  vec3Cross,
} from './math.js';
import {
  SKY_VS,
  SKY_FS,
  TERRAIN_VS,
  TERRAIN_FS,
  RUNWAY_VS,
  RUNWAY_FS,
  WATER_VS,
  WATER_FS,
  MESH_VS,
  MESH_FS,
  FX_VS,
  FX_FS,
} from './shaders.js';
import {
  buildTerrainMesh,
  buildWaterMesh,
  buildRunwayMesh,
  buildLandmarksMesh,
  buildCloudsMesh,
} from './terrain.js';
import {
  buildAircraftGeometry,
  buildTargetRingGeometry,
  buildLampGeometry,
} from './aircraft.js';

function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${log}`);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (info) uniforms[info.name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, uniforms };
}

function createMeshVao(gl, vertices, attribs, indices = null) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const stride = attribs.reduce((sum, a) => sum + a.size, 0) * 4;
  let offset = 0;
  for (const attr of attribs) {
    gl.enableVertexAttribArray(attr.loc);
    gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, offset);
    offset += attr.size * 4;
  }

  let ebo = null;
  let indexCount = 0;
  if (indices) {
    ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    indexCount = indices.length;
  }

  gl.bindVertexArray(null);
  return { vao, vbo, ebo, indexCount };
}

export class FjordRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL2 is required to render FJORDWING.');
    }
    this.gl = gl;
    this.canvas = canvas;
    this.viewProj = mat4Identity();

    this.programs = {
      sky: createProgram(gl, SKY_VS, SKY_FS),
      terrain: createProgram(gl, TERRAIN_VS, TERRAIN_FS),
      runway: createProgram(gl, RUNWAY_VS, RUNWAY_FS),
      water: createProgram(gl, WATER_VS, WATER_FS),
      mesh: createProgram(gl, MESH_VS, MESH_FS),
      fx: createProgram(gl, FX_VS, FX_FS),
    };

    // Fullscreen sky quad
    const skyVerts = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
    this.skyVao = createMeshVao(gl, skyVerts, [{ loc: 0, size: 2 }]);

    // World static meshes
    const terrain = buildTerrainMesh();
    this.terrainVao = createMeshVao(
      gl,
      terrain.vertices,
      [{ loc: 0, size: 3 }, { loc: 1, size: 3 }],
      terrain.indices
    );

    const water = buildWaterMesh();
    this.waterVao = createMeshVao(gl, water.vertices, [{ loc: 0, size: 3 }]);
    this.waterCount = water.count;

    const runway = buildRunwayMesh();
    this.runwayVao = createMeshVao(gl, runway.vertices, [{ loc: 0, size: 3 }, { loc: 1, size: 2 }]);
    this.runwayCount = runway.count;

    const meshAttribs = [{ loc: 0, size: 3 }, { loc: 1, size: 3 }, { loc: 2, size: 4 }];
    const fxAttribs = [{ loc: 0, size: 3 }, { loc: 1, size: 4 }];

    const landmarks = buildLandmarksMesh();
    this.landmarksVao = createMeshVao(gl, landmarks.vertices, meshAttribs);
    this.landmarksCount = landmarks.count;

    const clouds = buildCloudsMesh(7);
    this.cloudsVao = createMeshVao(gl, clouds.vertices, meshAttribs);
    this.cloudsCount = clouds.count;

    // Aircraft parts
    const craft = buildAircraftGeometry();
    this.aircraftVaos = {
      body: { ...createMeshVao(gl, craft.body.vertices, meshAttribs), count: craft.body.count },
      navLights: { ...createMeshVao(gl, craft.navLights.vertices, meshAttribs), count: craft.navLights.count },
      gear: { ...createMeshVao(gl, craft.gear.vertices, meshAttribs), count: craft.gear.count },
      flaps: { ...createMeshVao(gl, craft.flaps.vertices, meshAttribs), count: craft.flaps.count },
      plumes: { ...createMeshVao(gl, craft.plumes.vertices, fxAttribs), count: craft.plumes.count },
    };

    // Target checkpoint ring & PAPI lamp meshes
    const ring = buildTargetRingGeometry(32, 2.5);
    this.ringVao = { ...createMeshVao(gl, ring.vertices, fxAttribs), count: ring.count };

    const lamp = buildLampGeometry();
    this.lampVao = { ...createMeshVao(gl, lamp.vertices, fxAttribs), count: lamp.count };

    // Dynamic wingtip contrail ribbon buffer
    this.trailVao = gl.createVertexArray();
    gl.bindVertexArray(this.trailVao);
    this.trailVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    this.trailScratch = new Float32Array(2400 * 7);
    gl.bufferData(gl.ARRAY_BUFFER, this.trailScratch.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(world, camera) {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const aspect = width / Math.max(height, 1);
    const weather = world.weather;
    const sunDir = vec3Norm({ x: weather.sunDir[0], y: weather.sunDir[1], z: weather.sunDir[2] });
    const sunArr = [sunDir.x, sunDir.y, sunDir.z];

    const proj = mat4Perspective(camera.fovRad, aspect, 0.8, 17500);
    const view = mat4LookAt(camera.pos, camera.target, camera.up);
    const viewProj = mat4Multiply(proj, view);
    this.viewProj = viewProj;

    const camForward = vec3Norm(vec3Sub(camera.target, camera.pos));
    const camRight = vec3Norm(vec3Cross(camForward, camera.up));
    const camUp = vec3Cross(camRight, camForward);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Atmospheric Rayleigh/Mie Sky Dome
    {
      const p = this.programs.sky;
      gl.useProgram(p.prog);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniform3f(p.uniforms.uCamForward, camForward.x, camForward.y, camForward.z);
      gl.uniform3f(p.uniforms.uCamRight, camRight.x, camRight.y, camRight.z);
      gl.uniform3f(p.uniforms.uCamUp, camUp.x, camUp.y, camUp.z);
      gl.uniform1f(p.uniforms.uTanHalfFov, Math.tan(camera.fovRad * 0.5));
      gl.uniform1f(p.uniforms.uAspect, aspect);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uZenithColor, weather.zenithColor);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform3fv(p.uniforms.uCloudTint, weather.cloudTint);
      gl.uniform3fv(p.uniforms.uCloudShadow, weather.cloudShadow);
      gl.uniform1f(p.uniforms.uTime, world.time);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.bindVertexArray(this.skyVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
    }

    // 2. Multi-Biome Nordic Fjord Terrain
    {
      const p = this.programs.terrain;
      gl.useProgram(p.prog);
      gl.enable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform3f(p.uniforms.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uAmbientSky, weather.ambientSky);
      gl.uniform3fv(p.uniforms.uAmbientGround, weather.ambientGround);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.bindVertexArray(this.terrainVao.vao);
      gl.drawElements(gl.TRIANGLES, this.terrainVao.indexCount, gl.UNSIGNED_INT, 0);
    }

    // 3. Shimmering Fresnel Fjord Ocean
    {
      const p = this.programs.water;
      gl.useProgram(p.prog);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform3f(p.uniforms.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uZenithColor, weather.zenithColor);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uTime, world.time);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.bindVertexArray(this.waterVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.waterCount);
    }

    // 4. Painted Asphalt Runway 09/27 Deck
    {
      const p = this.programs.runway;
      gl.useProgram(p.prog);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform3f(p.uniforms.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uAmbientSky, weather.ambientSky);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.bindVertexArray(this.runwayVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.runwayCount);
    }

    // 5. PBR Lit Meshes: Airstrip Landmarks, Volumetric Cloud Banks & VX-9 Kestrel Aircraft
    {
      const p = this.programs.mesh;
      gl.useProgram(p.prog);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform3f(p.uniforms.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uAmbientSky, weather.ambientSky);
      gl.uniform3fv(p.uniforms.uAmbientGround, weather.ambientGround);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.uniform3f(p.uniforms.uEmissiveTint, 0, 0, 0);
      gl.uniform1f(p.uniforms.uAlpha, 1.0);

      // Static landmarks (hangars, tower, lighthouse, approach pylons, pines)
      gl.uniform1f(p.uniforms.uFogScale, 0.95);
      gl.uniformMatrix4fv(p.uniforms.uModel, false, mat4Identity());
      gl.bindVertexArray(this.landmarksVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.landmarksCount);

      // Sunlit 3D cloud clusters (gentle wind drift)
      gl.uniform1f(p.uniforms.uFogScale, 0.45);
      const driftX = (world.time * 4.5) % 800;
      const cloudModel = mat4TranslateScale(driftX * 0.2, 0, 0, 1, 1, 1);
      gl.uniformMatrix4fv(p.uniforms.uModel, false, cloudModel);
      gl.bindVertexArray(this.cloudsVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.cloudsCount);

      // VX-9 Kestrel Aircraft (skip body in cockpit view so fuselage never clips the glass HUD)
      if (camera.mode !== 'cockpit') {
        const craft = world.aircraft;
        const craftModel = mat4FromBasis(craft.pos, craft.basis, 1.0);
        gl.uniform1f(p.uniforms.uFogScale, 0.25);
        gl.uniformMatrix4fv(p.uniforms.uModel, false, craftModel);

        gl.bindVertexArray(this.aircraftVaos.body.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.body.count);

        if (craft.gearDeployed) {
          gl.bindVertexArray(this.aircraftVaos.gear.vao);
          gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.gear.count);
        }
        if (craft.flaps > 0.1) {
          gl.bindVertexArray(this.aircraftVaos.flaps.vao);
          gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.flaps.count);
        }

        // Pulsing wingtip nav strobes
        const pulse = 0.72 + 0.55 * Math.sin(world.time * 7.5);
        gl.uniform3f(p.uniforms.uEmissiveTint, 0.2 * pulse, 0.2 * pulse, 0.2 * pulse);
        gl.bindVertexArray(this.aircraftVaos.navLights.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.navLights.count);
        gl.uniform3f(p.uniforms.uEmissiveTint, 0, 0, 0);
      }
    }

    // 6. Emissive Additive & Translucent FX: PAPI Glideslope Lights, Glowing Aerial Rings, Afterburner, Contrails
    {
      const p = this.programs.fx;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);

      // 6a. Dynamic 4-lamp PAPI Glideslope Light Bar next to Runway 09 (distinct ruby-RED vs crisp WHITE!)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const papiStates = world.papiLights; // array of 4 booleans: true=WHITE (high), false=RED (low)
      for (let i = 0; i < 4; i++) {
        const isWhite = papiStates[i];
        const m = mat4TranslateScale(RUNWAY.PAPI_X, RUNWAY.ELEVATION + 2.6, RUNWAY.PAPI_Z - i * 8.5, 1.28);
        gl.uniformMatrix4fv(p.uniforms.uModel, false, m);
        if (isWhite) {
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.96, 0.86);
          gl.uniform1f(p.uniforms.uIntensity, 1.9);
        } else {
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.04, 0.02);
          gl.uniform1f(p.uniforms.uIntensity, 1.45);
        }
        gl.uniform1f(p.uniforms.uAlpha, 0.98);
        gl.bindVertexArray(this.lampVao.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.lampVao.count);
      }

      // 6b. Glowing Rotating Aerial Checkpoint Target Rings
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const rings = world.rings;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        if (ring.cleared) continue;
        const isActive = i === world.activeRingIndex;
        const isNext = i === world.activeRingIndex + 1;
        if (!isActive && !isNext && i > world.activeRingIndex + 3) continue;

        const scale = (ring.radius || 32) / 32;
        const spin = world.time * (isActive ? 0.55 : 0.22) + i * 0.7;
        const tMat = mat4TranslateScale(ring.x, ring.y, ring.z, scale);
        const yRot = mat4RotateY(ring.yawRad ?? 0);
        const zRot = mat4RotateZ(spin);
        const model = mat4Multiply(tMat, mat4Multiply(yRot, zRot));

        gl.uniformMatrix4fv(p.uniforms.uModel, false, model);
        const pulse = 0.92 + 0.12 * Math.sin(world.time * 4.5 + i);

        if (ring.kind === 'fuel') {
          gl.uniform3f(p.uniforms.uTint, 0.08, 0.86, 1.0);
          gl.uniform1f(p.uniforms.uIntensity, (isActive ? 1.85 : 1.15) * pulse);
          gl.uniform1f(p.uniforms.uAlpha, isActive ? 0.94 : 0.45);
        } else if (isActive) {
          // Active ring: saturated fiery electric amber-orange!
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.46, 0.03);
          gl.uniform1f(p.uniforms.uIntensity, 1.85 * pulse);
          gl.uniform1f(p.uniforms.uAlpha, 0.96);
        } else {
          // Upcoming ring: crisp emerald-cyan guide
          gl.uniform3f(p.uniforms.uTint, 0.05, 0.95, 0.48);
          gl.uniform1f(p.uniforms.uIntensity, isNext ? 1.45 : 0.95);
          gl.uniform1f(p.uniforms.uAlpha, isNext ? 0.72 : 0.36);
        }

        gl.bindVertexArray(this.ringVao.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.ringVao.count);
      }

      // 6c. Twin Afterburner Plumes (vivid cobalt-to-amber when A/B engaged; subtle short core at low cruise/approach)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const craft = world.aircraft;
      if (camera.mode !== 'cockpit' && craft.fuel > 0 && craft.throttle > 0.18) {
        const flicker = 0.94 + 0.12 * Math.sin(world.time * 46.0);
        const baseModel = mat4FromBasis(craft.pos, craft.basis, 1.0);
        const scaleZ = mat4Identity();
        if (craft.afterburner) {
          scaleZ[10] = 1.05 * flicker;
          scaleZ[14] = 7.15 * (1 - scaleZ[10]);
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.56, 0.16);
          gl.uniform1f(p.uniforms.uIntensity, 1.75);
          gl.uniform1f(p.uniforms.uAlpha, 0.88);
        } else {
          scaleZ[10] = (0.18 + craft.throttle * 0.24) * flicker;
          scaleZ[14] = 7.15 * (1 - scaleZ[10]);
          gl.uniform3f(p.uniforms.uTint, 0.28, 0.64, 1.0);
          gl.uniform1f(p.uniforms.uIntensity, 1.25);
          gl.uniform1f(p.uniforms.uAlpha, 0.52);
        }
        const plumeModel = mat4Multiply(baseModel, scaleZ);
        gl.uniformMatrix4fv(p.uniforms.uModel, false, plumeModel);
        gl.bindVertexArray(this.aircraftVaos.plumes.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.plumes.count);
      }

      // 6d. Wingtip Contrail / Vortex Ribbons
      this.renderContrails(world, p);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  renderContrails(world, program) {
    const gl = this.gl;
    const trails = world.contrails;
    let vCount = 0;
    const buf = this.trailScratch;
    const maxVerts = buf.length / 7;

    for (const ribbon of trails) {
      if (ribbon.length < 2) continue;
      for (let i = 0; i < ribbon.length - 1; i++) {
        if (vCount + 6 > maxVerts) break;
        const a = ribbon[i];
        const b = ribbon[i + 1];
        const t0 = i / (ribbon.length - 1);
        const t1 = (i + 1) / (ribbon.length - 1);
        const w0 = 0.22 + (1 - t0) * 0.45;
        const w1 = 0.22 + (1 - t1) * 0.45;
        const al0 = t0 * t0 * a.alpha;
        const al1 = t1 * t1 * b.alpha;

        const pts = [
          [a.x, a.y - w0, a.z, 0.94, 0.97, 1.0, al0],
          [a.x, a.y + w0, a.z, 0.94, 0.97, 1.0, al0],
          [b.x, b.y + w1, b.z, 0.94, 0.97, 1.0, al1],
          [a.x, a.y - w0, a.z, 0.94, 0.97, 1.0, al0],
          [b.x, b.y + w1, b.z, 0.94, 0.97, 1.0, al1],
          [b.x, b.y - w1, b.z, 0.94, 0.97, 1.0, al1],
        ];
        for (const pt of pts) {
          const base = vCount * 7;
          buf[base] = pt[0];
          buf[base + 1] = pt[1];
          buf[base + 2] = pt[2];
          buf[base + 3] = pt[3];
          buf[base + 4] = pt[4];
          buf[base + 5] = pt[5];
          buf[base + 6] = pt[6];
          vCount++;
        }
      }
    }

    if (vCount > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(program.uniforms.uModel, false, mat4Identity());
      gl.uniform3f(program.uniforms.uTint, 1.0, 0.96, 0.92);
      gl.uniform1f(program.uniforms.uIntensity, 1.15);
      gl.uniform1f(program.uniforms.uAlpha, 0.55);
      gl.bindVertexArray(this.trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, vCount * 7));
      gl.drawArrays(gl.TRIANGLES, 0, vCount);
    }
  }
}
