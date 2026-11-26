// FJORDWING — WebGL2 rendering pipeline for golden-hour sky, heightmap-shadowed terrain,
// Fresnel fjord ocean with reflections & shoreline foam, wet runway, landmarks, volumetric clouds,
// sculpted VX-9 Kestrel aircraft, Mach afterburners, lighthouse beam & crossed contrail ribbons.

import { RUNWAY, WORLD } from './config.js';
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
  CLOUD_VS,
  CLOUD_FS,
  FX_VS,
  FX_FS,
} from './shaders.js';
import {
  getTerrainHeight,
  buildHeightmapTextureData,
  buildTerrainMesh,
  buildWaterMesh,
  buildRunwayMesh,
  buildLandmarksMesh,
  buildLighthouseBeamGeometry,
  buildCloudBillboards,
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
      cloud: createProgram(gl, CLOUD_VS, CLOUD_FS),
      fx: createProgram(gl, FX_VS, FX_FS),
    };

    // Bake 512x512 RGBA8 heightmap + coastal bathymetry + valley AO GPU texture
    const hm = buildHeightmapTextureData();
    this.heightMapTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.heightMapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hm.width, hm.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, hm.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.worldBounds = [
      -WORLD.HALF,
      WORLD.SIZE,
      WORLD.HEIGHT_MIN,
      WORLD.HEIGHT_MAX - WORLD.HEIGHT_MIN,
    ];

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
    const cloudAttribs = [{ loc: 0, size: 3 }, { loc: 1, size: 2 }, { loc: 2, size: 2 }, { loc: 3, size: 3 }];
    const fxAttribs = [{ loc: 0, size: 3 }, { loc: 1, size: 4 }];

    const landmarks = buildLandmarksMesh();
    this.landmarksVao = createMeshVao(gl, landmarks.vertices, meshAttribs);
    this.landmarksCount = landmarks.count;

    const clouds = buildCloudBillboards(11);
    this.cloudsVao = createMeshVao(gl, clouds.vertices, cloudAttribs);
    this.cloudsCount = clouds.count;

    const beam = buildLighthouseBeamGeometry();
    this.beamVao = { ...createMeshVao(gl, beam.vertices, fxAttribs), count: beam.count };
    this.lighthouseLanternY = getTerrainHeight(RUNWAY.LIGHTHOUSE_X, RUNWAY.LIGHTHOUSE_Z) + 36.8;

    // Sculpted VX-9 Kestrel aircraft parts
    const craft = buildAircraftGeometry();
    this.aircraftVaos = {
      body: { ...createMeshVao(gl, craft.body.vertices, meshAttribs), count: craft.body.count },
      cockpitExterior: { ...createMeshVao(gl, craft.cockpitExterior.vertices, meshAttribs), count: craft.cockpitExterior.count },
      navLights: { ...createMeshVao(gl, craft.navLights.vertices, meshAttribs), count: craft.navLights.count },
      gear: { ...createMeshVao(gl, craft.gear.vertices, meshAttribs), count: craft.gear.count },
      flaps: { ...createMeshVao(gl, craft.flaps.vertices, meshAttribs), count: craft.flaps.count },
      plumes: { ...createMeshVao(gl, craft.plumes.vertices, fxAttribs), count: craft.plumes.count },
    };

    // Target checkpoint ring & PAPI lamp meshes
    const ring = buildTargetRingGeometry(32, 2.3);
    this.ringVao = { ...createMeshVao(gl, ring.vertices, fxAttribs), count: ring.count };

    const lamp = buildLampGeometry();
    this.lampVao = { ...createMeshVao(gl, lamp.vertices, fxAttribs), count: lamp.count };

    // Dynamic crossed wingtip contrail ribbon buffer
    this.trailVao = gl.createVertexArray();
    gl.bindVertexArray(this.trailVao);
    this.trailVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    this.trailScratch = new Float32Array(4800 * 7);
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

    const proj = mat4Perspective(camera.fovRad, aspect, 0.7, 17500);
    const view = mat4LookAt(camera.pos, camera.target, camera.up);
    const viewProj = mat4Multiply(proj, view);
    this.viewProj = viewProj;

    const camForward = vec3Norm(vec3Sub(camera.target, camera.pos));
    const camRight = vec3Norm(vec3Cross(camForward, camera.up));
    const camUp = vec3Cross(camRight, camForward);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.heightMapTex);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Atmospheric Rayleigh/Mie Sky Dome + Radiant Sun Rays + Volumetric Sky Clouds
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

    // 2. Heightmap-Shadowed, Micro-Normal-Mapped Nordic Fjord Terrain
    {
      const p = this.programs.terrain;
      gl.useProgram(p.prog);
      gl.enable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform1i(p.uniforms.uHeightMap, 0);
      gl.uniform4fv(p.uniforms.uWorldBounds, this.worldBounds);
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

    // 3. Glacial Fresnel Fjord Ocean (Bathymetry, Shoreline Surf Foam, Mountain Reflections & Shadows!)
    {
      const p = this.programs.water;
      gl.useProgram(p.prog);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform1i(p.uniforms.uHeightMap, 0);
      gl.uniform4fv(p.uniforms.uWorldBounds, this.worldBounds);
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

    // 4. Wet-Sheen Painted Asphalt Runway 09/27 Deck
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
      gl.uniform1f(p.uniforms.uWetness, weather.wetness ?? 0.20);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.bindVertexArray(this.runwayVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.runwayCount);
    }

    // 5. PBR Lit Meshes: Airstrip Landmarks, Nordic Village & Sculpted VX-9 Kestrel Aircraft
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
      gl.uniform3fv(p.uniforms.uZenithColor, weather.zenithColor);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.uniform3f(p.uniforms.uEmissiveTint, 0, 0, 0);
      gl.uniform1f(p.uniforms.uAlpha, 1.0);

      // Static landmarks (hangars, tower, Nordic village, lighthouse, pines, boulders, approach pylons)
      gl.uniform1f(p.uniforms.uIsAircraft, 0.0);
      gl.uniform1f(p.uniforms.uFogScale, 0.92);
      gl.uniformMatrix4fv(p.uniforms.uModel, false, mat4Identity());
      gl.bindVertexArray(this.landmarksVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.landmarksCount);

      // Sculpted VX-9 Kestrel Aircraft
      const craft = world.aircraft;
      const craftModel = mat4FromBasis(craft.pos, craft.basis, 1.0);
      gl.uniform1f(p.uniforms.uIsAircraft, 1.0);
      gl.uniform1f(p.uniforms.uFogScale, 0.22);
      gl.uniformMatrix4fv(p.uniforms.uModel, false, craftModel);

      if (camera.mode === 'cockpit') {
        // Render only forward nose radome & wing strakes so pilot sees the sculpted jet nose out the canopy!
        gl.bindVertexArray(this.aircraftVaos.cockpitExterior.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.cockpitExterior.count);
      } else {
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

        const pulse = 0.72 + 0.55 * Math.sin(world.time * 7.5);
        gl.uniform3f(p.uniforms.uEmissiveTint, 0.22 * pulse, 0.22 * pulse, 0.22 * pulse);
        gl.bindVertexArray(this.aircraftVaos.navLights.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.navLights.count);
        gl.uniform3f(p.uniforms.uEmissiveTint, 0, 0, 0);
      }
    }

    // 6. Soft Volumetric-Style FBM Cloud Billboards (Zero Hard Geometric Edges!)
    {
      const p = this.programs.cloud;
      gl.useProgram(p.prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);

      const driftX = (world.time * 3.8) % 900;
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform3f(p.uniforms.uCamRight, camRight.x, camRight.y, camRight.z);
      gl.uniform3f(p.uniforms.uCamUp, camUp.x, camUp.y, camUp.z);
      gl.uniform3f(p.uniforms.uDrift, driftX * 0.2, 0, 0);
      gl.uniform3f(p.uniforms.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
      gl.uniform3fv(p.uniforms.uSunDir, sunArr);
      gl.uniform3fv(p.uniforms.uSunColor, weather.sunColor);
      gl.uniform3fv(p.uniforms.uCloudTint, weather.cloudTint);
      gl.uniform3fv(p.uniforms.uCloudShadow, weather.cloudShadow);
      gl.uniform3fv(p.uniforms.uHorizonColor, weather.horizonColor);
      gl.uniform3fv(p.uniforms.uFogColor, weather.fogColor);
      gl.uniform1f(p.uniforms.uFogDensity, weather.fogDensity);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);

      gl.bindVertexArray(this.cloudsVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.cloudsCount);
    }

    // 7. Emissive Additive & Translucent FX: PAPI Lamps, Rotating Lighthouse Beam, Rings, Mach Plumes & Contrails
    {
      const p = this.programs.fx;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
      gl.uniform1f(p.uniforms.uExposure, weather.exposure);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);

      // 7a. Rotating Volumetric Golden Lighthouse Beam sweeping across Skjold Bay
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      const beamYaw = -2.35 + Math.sin(world.time * 0.45) * 0.65;
      const beamT = mat4TranslateScale(RUNWAY.LIGHTHOUSE_X, this.lighthouseLanternY, RUNWAY.LIGHTHOUSE_Z, 1.0);
      const beamModel = mat4Multiply(beamT, mat4RotateY(beamYaw));
      gl.uniformMatrix4fv(p.uniforms.uModel, false, beamModel);
      gl.uniform3f(p.uniforms.uTint, 1.0, 0.85, 0.45);
      gl.uniform1f(p.uniforms.uIntensity, 1.35);
      gl.uniform1f(p.uniforms.uAlpha, 0.55);
      gl.bindVertexArray(this.beamVao.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.beamVao.count);

      // 7b. Dynamic 4-lamp PAPI Glideslope Light Bar next to Runway 09 (crisp 2-WHITE / 2-RED!)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const papiStates = world.papiLights;
      for (let i = 0; i < 4; i++) {
        const isWhite = papiStates[i];
        const m = mat4TranslateScale(RUNWAY.PAPI_X, RUNWAY.ELEVATION + 2.6, RUNWAY.PAPI_Z - i * 8.5, 1.24);
        gl.uniformMatrix4fv(p.uniforms.uModel, false, m);
        if (isWhite) {
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.97, 0.88);
          gl.uniform1f(p.uniforms.uIntensity, 2.2);
        } else {
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.05, 0.02);
          gl.uniform1f(p.uniforms.uIntensity, 1.75);
        }
        gl.uniform1f(p.uniforms.uAlpha, 0.98);
        gl.bindVertexArray(this.lampVao.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.lampVao.count);
      }

      // 7c. Glowing Rotating Aerial Checkpoint Target Rings
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
          gl.uniform3f(p.uniforms.uTint, 0.08, 0.90, 1.0);
          gl.uniform1f(p.uniforms.uIntensity, (isActive ? 2.1 : 1.25) * pulse);
          gl.uniform1f(p.uniforms.uAlpha, isActive ? 0.95 : 0.48);
        } else if (isActive) {
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.48, 0.04);
          gl.uniform1f(p.uniforms.uIntensity, 2.0 * pulse);
          gl.uniform1f(p.uniforms.uAlpha, 0.96);
        } else {
          gl.uniform3f(p.uniforms.uTint, 0.06, 0.96, 0.52);
          gl.uniform1f(p.uniforms.uIntensity, isNext ? 1.5 : 0.95);
          gl.uniform1f(p.uniforms.uAlpha, isNext ? 0.72 : 0.36);
        }

        gl.bindVertexArray(this.ringVao.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.ringVao.count);
      }

      // 7d. Twin Mach Shock-Diamond Afterburner Plumes (Rich Cobalt-to-Amber when A/B; subtle cool idle core on approach!)
      const craft = world.aircraft;
      if (camera.mode !== 'cockpit' && craft.fuel > 0 && craft.throttle > 0.18) {
        const flicker = 0.95 + 0.10 * Math.sin(world.time * 46.0);
        const baseModel = mat4FromBasis(craft.pos, craft.basis, 1.0);
        const scaleZ = mat4Identity();
        if (craft.afterburner) {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          scaleZ[10] = 1.06 * flicker;
          scaleZ[14] = 7.12 * (1 - scaleZ[10]);
          gl.uniform3f(p.uniforms.uTint, 1.0, 0.56, 0.18);
          gl.uniform1f(p.uniforms.uIntensity, 1.55);
          gl.uniform1f(p.uniforms.uAlpha, 0.86);
        } else {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          scaleZ[10] = (0.10 + craft.throttle * 0.14) * flicker;
          scaleZ[14] = 7.12 * (1 - scaleZ[10]);
          gl.uniform3f(p.uniforms.uTint, 0.24, 0.52, 0.95);
          gl.uniform1f(p.uniforms.uIntensity, 0.85);
          gl.uniform1f(p.uniforms.uAlpha, 0.36);
        }
        const plumeModel = mat4Multiply(baseModel, scaleZ);
        gl.uniformMatrix4fv(p.uniforms.uModel, false, plumeModel);
        gl.bindVertexArray(this.aircraftVaos.plumes.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.aircraftVaos.plumes.count);
      }

      // 7e. Crossed Volumetric Wingtip Contrail / Vortex Ribbons
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

    const pushPt = (x, y, z, r, g, b, a) => {
      const base = vCount * 7;
      buf[base] = x; buf[base + 1] = y; buf[base + 2] = z;
      buf[base + 3] = r; buf[base + 4] = g; buf[base + 5] = b; buf[base + 6] = a;
      vCount++;
    };

    for (const ribbon of trails) {
      if (ribbon.length < 2) continue;
      for (let i = 0; i < ribbon.length - 1; i++) {
        if (vCount + 12 > maxVerts) break;
        const a = ribbon[i];
        const b = ribbon[i + 1];
        const t0 = i / (ribbon.length - 1);
        const t1 = (i + 1) / (ribbon.length - 1);
        const w0 = 0.16 + (1 - t0) * 0.42;
        const w1 = 0.16 + (1 - t1) * 0.42;
        const al0 = t0 * t0 * a.alpha;
        const al1 = t1 * t1 * b.alpha;

        // Vertical ribbon fin
        pushPt(a.x, a.y - w0, a.z, 0.96, 0.98, 1.0, al0);
        pushPt(a.x, a.y + w0, a.z, 0.96, 0.98, 1.0, al0);
        pushPt(b.x, b.y + w1, b.z, 0.96, 0.98, 1.0, al1);
        pushPt(a.x, a.y - w0, a.z, 0.96, 0.98, 1.0, al0);
        pushPt(b.x, b.y + w1, b.z, 0.96, 0.98, 1.0, al1);
        pushPt(b.x, b.y - w1, b.z, 0.96, 0.98, 1.0, al1);

        // Horizontal ribbon fin (ensures contrail stays lush from top-down & wingman angles!)
        pushPt(a.x - w0, a.y, a.z - w0 * 0.5, 0.96, 0.98, 1.0, al0);
        pushPt(a.x + w0, a.y, a.z + w0 * 0.5, 0.96, 0.98, 1.0, al0);
        pushPt(b.x + w1, b.y, b.z + w1 * 0.5, 0.96, 0.98, 1.0, al1);
        pushPt(a.x - w0, a.y, a.z - w0 * 0.5, 0.96, 0.98, 1.0, al0);
        pushPt(b.x + w1, b.y, b.z + w1 * 0.5, 0.96, 0.98, 1.0, al1);
        pushPt(b.x - w1, b.y, b.z - w1 * 0.5, 0.96, 0.98, 1.0, al1);
      }
    }

    if (vCount > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(program.uniforms.uModel, false, mat4Identity());
      gl.uniform3f(program.uniforms.uTint, 1.0, 0.96, 0.92);
      gl.uniform1f(program.uniforms.uIntensity, 1.25);
      gl.uniform1f(program.uniforms.uAlpha, 0.58);
      gl.bindVertexArray(this.trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, vCount * 7));
      gl.drawArrays(gl.TRIANGLES, 0, vCount);
    }
  }
}
