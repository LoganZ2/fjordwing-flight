// FJORDWING — Custom WebGL2 GLSL ES 3.00 shaders for cinematic golden-hour sky,
// heightmap-shadowed micro-normal terrain, Fresnel fjord water with reflections & foam,
// wet-sheen asphalt runway, PBR aerospace aircraft, volumetric cloud billboards & Mach plumes.

const COMMON_GLSL = `#version 300 es
precision highp float;

vec3 acesToneMap(vec3 color, float exposure) {
  vec3 x = max(color * exposure, vec3(0.0));
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 gammaCorrect(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbmNoise(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += amp * valueNoise(p);
    p = rot * p * 2.04 + vec2(17.1, 31.7);
    amp *= 0.5;
  }
  return v;
}

float ridgedNoise(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    float n = 1.0 - abs(valueNoise(p) * 2.0 - 1.0);
    v += amp * n * n;
    p = rot * p * 2.12 + vec2(9.3, 21.4);
    amp *= 0.48;
  }
  return v;
}
`;

const HEIGHTMAP_GLSL = `
uniform sampler2D uHeightMap;
uniform vec4 uWorldBounds; // xy = (-half, size), zw = (hMin, hSpan)

vec4 sampleHeightData(vec2 xz) {
  vec2 uv = clamp((xz - vec2(uWorldBounds.x)) / uWorldBounds.y, 0.002, 0.998);
  vec4 tex = texture(uHeightMap, uv);
  float hFull = uWorldBounds.z + tex.r * uWorldBounds.w;
  float hCoast = -30.0 + tex.g * 60.0;
  return vec4(hFull, tex.b, tex.a, hCoast); // x=fullHeight, y=valleyAO, z=landMask, w=highResCoastHeight
}

// Fast 6-step directional heightfield shadow ray toward sun
float computeTerrainShadow(vec3 worldPos, vec3 sunDir) {
  float shade = 1.0;
  float stepD = 95.0;
  for (int i = 1; i <= 6; i++) {
    float t = stepD * float(i) * (0.7 + 0.28 * float(i));
    vec3 sp = worldPos + sunDir * t;
    vec2 uv = (sp.xz - vec2(uWorldBounds.x)) / uWorldBounds.y;
    if (uv.x < 0.01 || uv.x > 0.99 || uv.y < 0.01 || uv.y > 0.99) break;
    float hTerr = sampleHeightData(sp.xz).x;
    float diff = sp.y - hTerr;
    if (diff < 12.0) {
      shade = min(shade, smoothstep(-34.0, 22.0, diff));
    }
  }
  return clamp(shade, 0.16, 1.0);
}
`;

// 1. Atmospheric Rayleigh/Mie Sky Dome + Radiant Sun Corona + Crepuscular Shafts + Volumetric Sky Clouds
export const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.9999, 1.0);
}
`;

export const SKY_FS = `${COMMON_GLSL}
in vec2 vNdc;
out vec4 outColor;

uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uCloudTint;
uniform vec3 uCloudShadow;
uniform float uTime;
uniform float uExposure;

void main() {
  vec3 dir = normalize(
    uCamForward +
    uCamRight * (vNdc.x * uAspect * uTanHalfFov) +
    uCamUp * (vNdc.y * uTanHalfFov)
  );
  vec3 sunDir = normalize(uSunDir);

  float up = clamp(dir.y, -0.25, 1.0);
  float horizonGlow = pow(1.0 - max(up, 0.0), 5.2);
  float midGrad = pow(1.0 - max(up, 0.0), 1.95);

  // Rich dramatic Nordic cobalt zenith -> crisp twilight sapphire -> fiery golden-coral sunset horizon!
  vec3 midSky = mix(uZenithColor * 1.35, vec3(0.11, 0.26, 0.56), 0.58);
  vec3 sky = mix(uZenithColor, midSky, midGrad);
  vec3 warmBand = mix(uHorizonColor, vec3(1.0, 0.58, 0.26), 0.28);
  sky = mix(sky, warmBand, horizonGlow);

  // Subtle below-horizon water bounce
  if (dir.y < 0.0) {
    sky = mix(uHorizonColor * 0.64, vec3(0.02, 0.08, 0.17), clamp(-dir.y * 5.0, 0.0, 1.0));
  }

  // Physically inspired Rayleigh/Mie solar forward scattering + radiant sun disc + subtle sun rays
  float sunDot = max(dot(dir, sunDir), 0.0);
  float mieAura = pow(sunDot, 4.8) * 0.30;
  float mieCorona = pow(sunDot, 30.0) * 0.68;
  float mieCore = pow(sunDot, 210.0) * 1.75;
  float sunDisc = smoothstep(0.9985, 0.9995, sunDot) * 5.2;

  // Atmospheric sunbeams radiating around solar azimuth near horizon
  float sunAzim = atan(dir.y - sunDir.y, dot(dir - sunDir * sunDot, normalize(cross(vec3(0.0, 1.0, 0.0), sunDir))));
  float rays = (0.5 + 0.5 * sin(sunAzim * 9.0 + 0.4)) * (0.5 + 0.5 * sin(sunAzim * 17.0 - 1.2));
  float rayMask = pow(sunDot, 6.5) * smoothstep(0.45, 0.02, abs(dir.y - sunDir.y)) * rays * 0.26;

  sky += uSunColor * (mieAura + mieCorona + mieCore + sunDisc + rayMask);

  // Dual-layer procedural alpine sky clouds:
  // Layer A: High wispy golden cirrus streaks
  if (dir.y > 0.015) {
    vec2 cirrusUv = dir.xz / (dir.y + 0.16) * 0.95 + vec2(uTime * 0.0025, -uTime * 0.0012);
    float warp = fbmNoise(cirrusUv * 1.2) * 0.65;
    float streak = fbmNoise(vec2(cirrusUv.x * 2.8 + warp, cirrusUv.y * 0.85 - warp * 0.5));
    float cirrus = smoothstep(0.57, 0.86, streak) * smoothstep(0.015, 0.14, dir.y) * smoothstep(0.88, 0.28, dir.y);
    vec3 cirrusCol = mix(uCloudTint * 0.92, uSunColor * 1.45, pow(sunDot, 4.0) * 0.72);
    sky = mix(sky, cirrusCol, cirrus * 0.38);

    // Layer B: Dramatic sculpted alpine stratocumulus clouds with deep shadowed bellies & blazing gold rims!
    vec2 cumUv = dir.xz / (dir.y + 0.11) * 1.32 + vec2(uTime * 0.004, -uTime * 0.0018);
    float cBase = fbmNoise(cumUv * 1.18);
    float cDetail = fbmNoise(cumUv * 2.85 + vec2(5.4, 9.1));
    float density = smoothstep(0.50, 0.80, cBase * 0.72 + cDetail * 0.36);

    vec2 sunStep = sunDir.xz / max(abs(sunDir.y) + 0.35, 0.35) * 0.14;
    float cSun = fbmNoise((cumUv + sunStep) * 1.18) * 0.72 + fbmNoise((cumUv + sunStep) * 2.85 + vec2(5.4, 9.1)) * 0.36;
    float transmittance = clamp(1.0 - (cSun - 0.36) * 1.75, 0.10, 1.0);
    float silverLining = pow(sunDot, 7.0) * (1.0 - density * 0.58) * 1.45;

    vec3 cloudCol = mix(uCloudShadow * 0.92, uCloudTint * 1.08, clamp(transmittance * 0.88 + 0.12, 0.0, 1.0));
    cloudCol += uSunColor * (silverLining + pow(sunDot, 22.0) * 0.85);
    cloudCol += uHorizonColor * (1.0 - transmittance) * 0.16;

    float horizonFade = smoothstep(0.02, 0.16, dir.y) * smoothstep(0.92, 0.26, dir.y);
    sky = mix(sky, cloudCol, density * horizonFade * 0.68);
  }

  vec3 col = gammaCorrect(acesToneMap(sky, uExposure));
  outColor = vec4(col, 1.0);
}
`;

// 2. Heightmap-Shadowed, Micro-Normal-Mapped Multi-Biome Nordic Fjord Terrain Shader
export const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;

uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vWorldPos = aPos;
  vNormal = normalize(aNormal);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const TERRAIN_FS = `${COMMON_GLSL}
${HEIGHTMAP_GLSL}

in vec3 vWorldPos;
in vec3 vNormal;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uFogColor;
uniform vec3 uHorizonColor;
uniform float uFogDensity;
uniform float uExposure;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);

  float h = vWorldPos.y;
  vec2 xz = vWorldPos.xz;
  float dist = length(uCamPos - vWorldPos);

  // Sample precomputed valley ambient occlusion & directional terrain shadow from heightmap
  vec4 hData = sampleHeightData(xz);
  float valleyAO = hData.y;
  float sunShadow = computeTerrainShadow(vWorldPos + vec3(0.0, 4.0, 0.0), L);

  // Multi-scale procedural rock/cliff strata & analytic normal bump mapping
  float macroN = fbmNoise(xz * 0.0038);
  float medN = fbmNoise(xz * 0.022);
  float fineN = valueNoise(xz * 0.11);
  float strata = ridgedNoise(vec2(xz.x * 0.011 + xz.y * 0.009, h * 0.055));

  // Finite-difference micro-normal perturbation (faded gracefully at extreme distance to prevent shimmer)
  float bumpFade = 1.0 - smoothstep(1400.0, 5200.0, dist);
  float eps = 3.2;
  float n0 = fbmNoise(xz * 0.036) + ridgedNoise(vec2(xz.x * 0.014, h * 0.06)) * 0.65;
  float nx = fbmNoise((xz + vec2(eps, 0.0)) * 0.036) + ridgedNoise(vec2((xz.x + eps) * 0.014, h * 0.06)) * 0.65;
  float nz = fbmNoise((xz + vec2(0.0, eps)) * 0.036) + ridgedNoise(vec2(xz.x * 0.014, (h + eps * 0.4) * 0.06)) * 0.65;
  float slopeOrig = 1.0 - clamp(N.y, 0.0, 1.0);
  float bumpStrength = mix(0.28, 0.72, smoothstep(0.12, 0.50, slopeOrig)) * bumpFade;
  vec3 bumpVec = vec3((n0 - nx) * bumpStrength * 2.1, 0.0, (n0 - nz) * bumpStrength * 2.1);
  N = normalize(N + bumpVec);

  float slope = 1.0 - clamp(N.y, 0.0, 1.0);

  // Authentic Norwegian Lofoten / Skjold Fjord biome palette:
  vec3 seabedCol = vec3(0.02, 0.16, 0.22);
  vec3 wetRockCol = vec3(0.08, 0.10, 0.13);
  vec3 heatherCol = mix(vec3(0.14, 0.18, 0.08), vec3(0.21, 0.19, 0.10), medN);
  vec3 spruceCol = mix(vec3(0.03, 0.10, 0.06), vec3(0.07, 0.16, 0.08), fineN * 0.6 + medN * 0.4);
  vec3 graniteDark = vec3(0.09, 0.11, 0.15);
  vec3 graniteLight = vec3(0.26, 0.25, 0.27);
  vec3 cliffCol = mix(graniteDark, graniteLight, clamp(strata * 0.85 + medN * 0.28, 0.0, 1.0));
  // Subtle mineral lichen & iron veins on rugged rock faces
  cliffCol = mix(cliffCol, vec3(0.20, 0.18, 0.14), smoothstep(0.55, 0.85, macroN) * 0.28);

  // Glacial snow with crisp crystalline albedo (cool blue in shadow, warm golden alpenglow in sun)
  vec3 snowCol = mix(vec3(0.84, 0.90, 0.98), vec3(0.96, 0.97, 1.0), fineN * 0.5 + 0.5);

  vec3 albedo = seabedCol;
  albedo = mix(albedo, wetRockCol, smoothstep(-3.0, 2.8, h));
  vec3 lowerSlope = mix(spruceCol, heatherCol, smoothstep(0.40, 0.76, macroN + medN * 0.25));
  albedo = mix(albedo, lowerSlope, smoothstep(4.2, 16.0, h));

  // Steep fjord cliffs expose dark dramatic Norwegian granite rock faces
  float rockMask = clamp(
    smoothstep(0.16, 0.36, slope) +
    smoothstep(115.0, 235.0, h) * 0.85 +
    smoothstep(0.65, 0.92, strata) * smoothstep(45.0, 140.0, h) * 0.45,
    0.0, 1.0
  );
  albedo = mix(albedo, cliffCol, rockMask);

  // Wind-carved glacier snow caps & snow-filled gullies on high peaks while vertical cliffs stay dark rock!
  float snowLine = 215.0 + (macroN - 0.5) * 95.0 + slope * 215.0 - (1.0 - valleyAO) * 45.0;
  float snowMask = smoothstep(snowLine - 28.0, snowLine + 42.0, h) * (1.0 - smoothstep(0.38, 0.62, slope));
  // Dusting of snow in crevices slightly below snowline
  float snowDust = smoothstep(160.0, 260.0, h) * smoothstep(0.32, 0.08, slope) * smoothstep(0.45, 0.78, medN) * 0.55;
  snowMask = clamp(max(snowMask, snowDust), 0.0, 1.0);
  albedo = mix(albedo, snowCol, snowMask);

  // Skjold Island airstrip manicured turf & textured coastal granite/heather shoreline
  float onIsland = smoothstep(155.0, 74.0, abs(xz.y + 8.0)) * smoothstep(1260.0, 1110.0, xz.x) * smoothstep(-150.0, -35.0, xz.x);
  if (onIsland > 0.01) {
    if (h > 4.2 && h < 18.0) {
      float mowStripe = 0.5 + 0.5 * sin(xz.x * 0.28);
      vec3 turf = mix(vec3(0.08, 0.19, 0.09), vec3(0.16, 0.26, 0.11), medN * 0.65 + mowStripe * 0.20);
      vec3 grassEdge = mix(heatherCol * 1.15, turf, smoothstep(5.5, 11.5, h));
      float flatMask = 1.0 - smoothstep(0.18, 0.42, slope);
      albedo = mix(albedo, grassEdge, onIsland * 0.88 * flatMask * smoothstep(4.2, 6.8, h));
    }
    if (h <= 5.4) {
      vec3 coastalRock = mix(vec3(0.26, 0.27, 0.29), vec3(0.42, 0.38, 0.33), clamp(strata * 0.65 + medN * 0.45, 0.0, 1.0));
      albedo = mix(albedo, coastalRock, onIsland * 0.84 * (1.0 - smoothstep(3.6, 5.4, h)));
    }
  }

  // Wet shoreline darkening right above waterline
  float wetBand = smoothstep(4.2, 0.2, h) * smoothstep(-2.0, 0.0, h);
  albedo *= (1.0 - wetBand * 0.38);

  // Dramatic Golden-Hour Lighting: strong warm sun * terrain shadow + cool alpine sapphire sky fill
  float ndotl = max(dot(N, L), 0.0);
  float litSun = ndotl * sunShadow;
  vec3 coolShadowTint = uAmbientSky * mix(0.62, 1.08, snowMask);
  vec3 hemi = mix(uAmbientGround * 0.65, coolShadowTint, clamp(N.y * 0.5 + 0.5, 0.0, 1.0)) * valleyAO;

  // Warm sunset bounce light on sunlit peaks
  vec3 diffuse = albedo * (hemi * 0.85 + uSunColor * (litSun * 1.72 + 0.03));

  // Crisp specular glint on glacial snow & wet coastal rock
  vec3 H = normalize(L + V);
  float specPow = mix(22.0, 64.0, max(snowMask, wetBand));
  float specAmt = mix(0.05, 0.32, max(snowMask * 0.85, wetBand));
  vec3 spec = uSunColor * pow(max(dot(N, H), 0.0), specPow) * specAmt * litSun;

  vec3 color = diffuse + spec;

  // Rich Aerial Perspective Haze (cool glacial violet-blue in fjord shadows, golden Mie glow toward sun!)
  float heightAtten = exp(-max(vWorldPos.y, 0.0) * 0.0021);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * (0.52 + 0.48 * heightAtten));
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.2);
  vec3 valleyFog = mix(uFogColor * vec3(0.84, 0.92, 1.08), uHorizonColor * 1.08, sunScatter * 0.68);
  color = mix(color, valleyFog, clamp(fogAmt, 0.0, 0.84));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 3. Detailed Weathered Wet-Sheen Painted Asphalt Runway 09/27 Shader
export const RUNWAY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;

uniform mat4 uViewProj;
out vec3 vWorldPos;
out vec2 vUv;

void main() {
  vWorldPos = aPos;
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const RUNWAY_FS = `${COMMON_GLSL}
in vec3 vWorldPos;
in vec2 vUv;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientSky;
uniform vec3 uFogColor;
uniform vec3 uHorizonColor;
uniform float uFogDensity;
uniform float uWetness;
uniform float uExposure;

float boxMask(vec2 p, vec2 lo, vec2 hi) {
  vec2 s = step(lo, p) * step(p, hi);
  return s.x * s.y;
}

float drawDigit(int d, vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  float t = 0.22;
  float top = boxMask(p, vec2(0.0, 1.0 - t), vec2(1.0, 1.0));
  float mid = boxMask(p, vec2(0.0, 0.5 - t * 0.5), vec2(1.0, 0.5 + t * 0.5));
  float bot = boxMask(p, vec2(0.0, 0.0), vec2(1.0, t));
  float tl = boxMask(p, vec2(0.0, 0.5), vec2(t, 1.0));
  float tr = boxMask(p, vec2(1.0 - t, 0.5), vec2(1.0, 1.0));
  float bl = boxMask(p, vec2(0.0, 0.0), vec2(t, 0.5));
  float br = boxMask(p, vec2(1.0 - t, 0.0), vec2(1.0, 0.5));
  if (d == 0) return clamp(top + bot + tl + tr + bl + br, 0.0, 1.0);
  if (d == 9) return clamp(top + mid + bot + tl + tr + br, 0.0, 1.0);
  if (d == 2) return clamp(top + mid + bot + tr + bl, 0.0, 1.0);
  if (d == 7) return clamp(top + tr + br, 0.0, 1.0);
  return 0.0;
}

void main() {
  float u = vUv.x;
  float v = vUv.y;
  float av = abs(v);

  // Detailed micro-aggregate asphalt texture + rainwater puddle variation + rubber tire marks
  float grain = valueNoise(vWorldPos.xz * 0.65) * 0.055 + valueNoise(vWorldPos.xz * 2.6) * 0.032;
  float puddle = smoothstep(0.42, 0.72, fbmNoise(vWorldPos.xz * 0.048));
  float skids = smoothstep(0.06, 0.15, u) * smoothstep(0.34, 0.19, u) * smoothstep(0.42, 0.07, av) * 0.085;
  vec3 tarmac = vec3(0.11, 0.12, 0.145) + grain - skids - uWetness * puddle * 0.035;

  float paint = 0.0;
  vec3 paintCol = vec3(0.95, 0.96, 0.93);

  // Continuous white edge lines
  if (av > 0.87 && av < 0.935) paint = 1.0;

  // Threshold piano keys at both 09 and 27
  float inThresh = step(0.012, u) * step(u, 0.055) + step(0.945, u) * step(u, 0.988);
  if (inThresh > 0.5 && av < 0.80) {
    float stripe = step(0.45, fract(av * 5.2));
    if (av > 0.07) paint = max(paint, stripe);
  }

  // Painted bold '09' near West threshold
  if (u > 0.068 && u < 0.118 && av < 0.45) {
    float px = (u - 0.068) / 0.050;
    float d0 = drawDigit(0, vec2((v + 0.36) / 0.30, px));
    float d9 = drawDigit(9, vec2((v - 0.06) / 0.30, px));
    paint = max(paint, max(d0, d9));
  }

  // Aiming point touchdown bars + distance markers
  float inAim = step(0.155, u) * step(u, 0.205) + step(0.795, u) * step(u, 0.845);
  if (inAim > 0.5 && av > 0.24 && av < 0.42) paint = 1.0;

  // Dashed white centerline
  if (u > 0.128 && u < 0.872 && av < 0.030) {
    if (fract(u * 28.0) < 0.55) paint = 1.0;
  }

  // Glowing edge & centerline runway lights
  float lightGlow = 0.0;
  if (av > 0.942 && av < 0.992) {
    float dLight = abs(fract(u * 24.0) - 0.5);
    lightGlow = smoothstep(0.15, 0.01, dLight);
  }
  float centerLamp = 0.0;
  if (av < 0.024 && u > 0.05 && u < 0.95) {
    float dC = abs(fract(u * 32.0) - 0.5);
    centerLamp = smoothstep(0.09, 0.01, dC) * 0.55;
  }

  vec3 albedo = mix(tarmac, paintCol, paint * 0.92);
  vec3 N = normalize(vec3((grain - 0.04) * 0.12, 1.0, (puddle - 0.5) * 0.06));
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);

  float ndotl = max(dot(N, L), 0.0);
  float wetGloss = clamp(uWetness * (0.45 + 0.55 * puddle) + 0.15, 0.15, 1.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float specPow = mix(24.0, 96.0, wetGloss);
  float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.22, 1.35, wetGloss) * (0.3 + 0.7 * ndotl);

  vec3 skyRefl = mix(uHorizonColor * 0.85, uAmbientSky * 1.15, 0.4) * fresnel * wetGloss * 0.65;
  vec3 color = albedo * (uAmbientSky * 0.72 + uSunColor * ndotl * 1.42) + uSunColor * spec + skyRefl;

  // Vivid runway threshold (emerald) & edge/centerline (warm amber-white) lamps
  vec3 lampCol = u < 0.04 ? vec3(0.18, 1.0, 0.45) : (u > 0.96 ? vec3(1.0, 0.20, 0.16) : vec3(1.0, 0.84, 0.42));
  color += lampCol * lightGlow * 3.0 + vec3(0.95, 0.98, 1.0) * centerLamp * 1.6;

  float dist = length(uCamPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.92);
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.0);
  vec3 fogTint = mix(uFogColor, uHorizonColor * 1.06, sunScatter * 0.65);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.90));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 4. Shimmering Glacial Fjord Water Shader (Shallow Bathymetry, Shoreline Surf Foam,
//    6-Step Reflected Mountain Silhouettes, Mountain Shadows & Golden Sun Specular Path)
export const WATER_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;

uniform mat4 uViewProj;
out vec3 vWorldPos;

void main() {
  vWorldPos = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const WATER_FS = `${COMMON_GLSL}
${HEIGHTMAP_GLSL}

in vec3 vWorldPos;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uExposure;

void main() {
  vec2 p = vWorldPos.xz;
  float dist = length(uCamPos - vWorldPos);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);

  // Sample high-precision coastal seafloor height for glacial bathymetry & shoreline surf foam
  float bedH = sampleHeightData(p).w;
  float waterDepth = max(0.0, -bedH);

  // 4-scale smooth animated Nordic fjord swell & capillary wave normals (silky, zero pixel aliasing!)
  float distAtten = 1.0 - smoothstep(900.0, 6200.0, dist) * 0.65;
  float w1 = valueNoise(p * 0.014 + vec2(uTime * 0.30, uTime * 0.16));
  float w2 = valueNoise(p * 0.042 + vec2(-uTime * 0.42, uTime * 0.32));
  float w3 = valueNoise(p * 0.105 + vec2(uTime * 0.68, -uTime * 0.52));
  float w4 = valueNoise(p * 0.230 + vec2(-uTime * 0.95, -uTime * 0.72));

  float nx = ((w1 - 0.5) * 0.10 + (w2 - 0.5) * 0.075 + (w3 - 0.5) * 0.045 + (w4 - 0.5) * 0.025) * distAtten;
  float nz = ((w2 - 0.5) * 0.10 - (w1 - 0.5) * 0.070 + (w3 - 0.5) * 0.045 - (w4 - 0.5) * 0.025) * distAtten;
  vec3 N = normalize(vec3(nx, 1.0, nz));
  vec3 R = reflect(-V, N);
  // Smooth macro reflection ray prevents jagged snow/cliff stippling on ripples
  vec3 Nrefl = normalize(vec3(nx * 0.32, 1.0, nz * 0.32));
  vec3 Rsmooth = reflect(-V, Nrefl);

  float fresnel = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 4.2);

  // Glacial fjord bathymetry: translucent emerald-turquoise shallows -> deep Nordic cobalt sapphire
  vec3 deepFjord = vec3(0.008, 0.046, 0.115);
  vec3 midFjord = vec3(0.018, 0.112, 0.195);
  vec3 shallowGlacial = vec3(0.045, 0.285, 0.325);
  float shallowFactor = exp(-waterDepth * 0.10);
  vec3 waterBody = mix(mix(deepFjord, midFjord, clamp(w1 * 0.55 + 0.18, 0.0, 1.0)), shallowGlacial, shallowFactor * 0.80);

  // Reflected golden-hour sky gradient
  float reflUp = clamp(Rsmooth.y, 0.0, 1.0);
  vec3 skyRefl = mix(uHorizonColor * 0.82, uZenithColor * 1.55, pow(reflUp, 0.50));

  // Silky 6-step heightfield raymarch along Rsmooth for painterly inverted snow-peak fjord reflections!
  vec3 reflColor = skyRefl;
  if (dist < 6200.0 && Rsmooth.y > 0.004) {
    float rStep = 145.0;
    float bestHit = 0.0;
    vec3 hitCol = skyRefl;
    for (int i = 1; i <= 6; i++) {
      float t = rStep * float(i) * (0.68 + 0.24 * float(i));
      vec3 rp = vWorldPos + Rsmooth * t;
      vec2 uv = (rp.xz - vec2(uWorldBounds.x)) / uWorldBounds.y;
      if (uv.x < 0.01 || uv.x > 0.99 || uv.y < 0.01 || uv.y > 0.99) break;
      float mH = sampleHeightData(rp.xz).x;
      float overlap = smoothstep(-55.0, 75.0, mH - rp.y);
      if (overlap > bestHit) {
        bestHit = overlap;
        float isSnow = smoothstep(205.0, 320.0, mH);
        vec3 peakCol = mix(vec3(0.06, 0.09, 0.15), mix(vec3(0.46, 0.54, 0.68), uSunColor * 0.80, 0.35), isSnow);
        float reflFade = 1.0 - smoothstep(1400.0, 5200.0, t);
        hitCol = mix(skyRefl, peakCol, 0.58 * reflFade);
      }
    }
    reflColor = mix(skyRefl, hitCol, bestHit);
  }

  // Mountain sun-shadow cast onto fjord bay water
  float waterSunShadow = computeTerrainShadow(vWorldPos + vec3(0.0, 3.0, 0.0), L);

  vec3 color = mix(waterBody, reflColor, clamp(fresnel * 0.84, 0.12, 0.86));
  color *= mix(0.72, 1.0, waterSunShadow);

  // Liquid hammered-gold sun specular path across fjord ripples (zero harsh single-pixel speckling!)
  vec3 H = normalize(L + V);
  float ndoth = max(dot(N, H), 0.0);
  float sunGlintTight = pow(ndoth, 130.0) * 2.6 * waterSunShadow;
  float sunGlintMid = pow(ndoth, 36.0) * 0.72 * waterSunShadow;
  float sunGlintBroad = pow(ndoth, 12.0) * 0.22 * (0.35 + 0.65 * waterSunShadow);
  color += uSunColor * (sunGlintTight + sunGlintMid + sunGlintBroad);

  // Crisp delicate coastal shoreline surf foam right along rocky fjord banks & Skjold Island!
  float foamNoise = fbmNoise(p * 0.095 + vec2(uTime * 0.22, -uTime * 0.18));
  float waveLap = sin(waterDepth * 2.4 - uTime * 2.2 + foamNoise * 4.2) * 0.5 + 0.5;
  float shoreLine = smoothstep(4.2, 0.15, waterDepth) * smoothstep(0.32, 0.72, foamNoise + waveLap * 0.38);
  float innerRim = smoothstep(1.3, 0.0, waterDepth) * 0.82;
  float foamMask = clamp(max(shoreLine * 0.74, innerRim), 0.0, 0.88) * (1.0 - smoothstep(1800.0, 4800.0, dist));
  vec3 foamCol = mix(vec3(0.78, 0.85, 0.92), vec3(1.0, 0.94, 0.86), 0.42 + 0.45 * waterSunShadow);
  color = mix(color, foamCol, foamMask);

  // Distance aerial perspective matching terrain horizon
  float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.84);
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.2);
  vec3 fogTint = mix(uFogColor * vec3(0.84, 0.92, 1.08), uHorizonColor * 1.06, sunScatter * 0.66);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.86));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 5. PBR-Inspired Aerospace & Architectural Mesh Shader (VX-9 Kestrel, Hangars, Tower, Village, Lighthouse)
export const MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor; // rgb = albedo, a = material tag (<0.15 emissive, >0.85 glossy glass canopy, 0.65-0.84 bare titanium)

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vLocalPos;
out vec3 vNormal;
out vec4 vColor;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vLocalPos = aPos;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor;
  gl_Position = uViewProj * wp;
}
`;

export const MESH_FS = `${COMMON_GLSL}
in vec3 vWorldPos;
in vec3 vLocalPos;
in vec3 vNormal;
in vec4 vColor;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uExposure;
uniform float uFogScale;
uniform vec3 uEmissiveTint;
uniform float uAlpha;
uniform float uIsAircraft;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  // Flip normal for double-sided thin fins if viewed from back
  if (dot(N, V) < 0.0) N = -N;

  vec3 base = vColor.rgb;
  float matTag = vColor.a;

  // Emissive material path (matTag < 0.15): glowing nav strobes, cabin windows, HUD glass, beacons
  if (matTag < 0.15) {
    vec3 glow = (base + uEmissiveTint) * 2.6;
    outColor = vec4(gammaCorrect(acesToneMap(glow, uExposure)), uAlpha);
    return;
  }

  float isGlass = smoothstep(0.84, 0.96, matTag);
  float isMetal = smoothstep(0.60, 0.80, matTag) * (1.0 - isGlass);

  // Subtle aerospace panel-line seams & satin sheen variation on the VX-9 Kestrel airframe!
  if (uIsAircraft > 0.5 && isGlass < 0.5) {
    float pZ = abs(fract(vLocalPos.z * 0.42 + 0.15) - 0.5);
    float pX = abs(fract(abs(vLocalPos.x) * 0.65) - 0.5);
    float seam = (1.0 - smoothstep(0.0, 0.026, pZ)) * 0.11 + (1.0 - smoothstep(0.0, 0.022, pX)) * 0.07;
    float panelVar = (valueNoise(floor(vLocalPos.xz * 0.65) + 3.1) - 0.5) * 0.05;
    base *= (1.0 - seam + panelVar);
  }

  float ndotl = max(dot(N, L), 0.0);
  // Soft counter-hemisphere sky bounce so aircraft underside & shaded wings keep crisp sculpted contrast
  float fillNdotL = max(dot(N, normalize(vec3(-L.x * 0.8, 0.42, -L.z * 0.8))), 0.0) * 0.34;
  vec3 hemi = mix(uAmbientGround * 1.05, uAmbientSky * 1.18, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

  // Analytical sky/sun environment reflection for metallic airframe & gold-tinted bubble canopy
  vec3 R = reflect(-V, N);
  float rUp = clamp(R.y, -0.2, 1.0);
  vec3 envRefl = mix(uHorizonColor * 0.95, uZenithColor * 1.75, pow(max(rUp, 0.0), 0.58));
  if (R.y < 0.0) {
    envRefl = mix(uHorizonColor * 0.65, vec3(0.06, 0.12, 0.18), clamp(-R.y * 3.0, 0.0, 1.0));
  }
  float envSun = pow(max(dot(R, L), 0.0), mix(36.0, 180.0, isGlass));
  envRefl += uSunColor * envSun * mix(0.65, 2.8, isGlass);

  vec3 H = normalize(L + V);
  float ndoth = max(dot(N, H), 0.0);
  float specPow = mix(mix(38.0, 82.0, isMetal), 185.0, isGlass);
  float specGain = mix(mix(0.35, 0.88, isMetal), 1.65, isGlass);
  vec3 specTint = mix(uSunColor, mix(uSunColor, base * 1.4, 0.55), isMetal);
  vec3 spec = specTint * pow(ndoth, specPow) * specGain * (0.25 + 0.75 * ndotl);

  // Fresnel rim reflection (golden-amber stealth sheen on glass canopy, crisp metallic edge on wings)
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), mix(3.4, 2.4, isGlass));
  float reflStrength = mix(mix(0.18, 0.48, isMetal), 0.88, isGlass) * (0.35 + 0.65 * fresnel);

  vec3 litDiffuse = base * (hemi * 0.88 + uSunColor * (ndotl * 1.38 + fillNdotL));
  // Glass canopy has deep tinted interior + strong sky/sun specular reflection
  vec3 color = mix(litDiffuse, litDiffuse * 0.42 + envRefl * vec3(1.02, 0.95, 0.86), isGlass * 0.75);
  color += envRefl * reflStrength * (1.0 - isGlass * 0.5) + spec + uEmissiveTint;

  float dist = length(uCamPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * uFogScale);
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.0);
  vec3 fogTint = mix(uFogColor, uHorizonColor * 1.04, sunScatter * 0.60);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.88));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, uAlpha);
}
`;

// 6. Volumetric-Style Soft Camera-Facing Cloud Billboard Shader (Zero Hard Geometric Edges!)
export const CLOUD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aCenter;
layout(location = 1) in vec2 aCorner; // [-1..1]
layout(location = 2) in vec2 aSize;   // (rx, ry)
layout(location = 3) in vec3 aParams; // (seed, heightFrac, density)

uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uDrift;

out vec2 vUv;
out vec3 vWorldPos;
out vec3 vParams;

void main() {
  vec3 center = aCenter + uDrift;
  vec3 wp = center + uCamRight * (aCorner.x * aSize.x) + uCamUp * (aCorner.y * aSize.y);
  vUv = aCorner;
  vWorldPos = wp;
  vParams = aParams;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

export const CLOUD_FS = `${COMMON_GLSL}
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vParams;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudTint;
uniform vec3 uCloudShadow;
uniform vec3 uHorizonColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uExposure;

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;

  float seed = vParams.x;
  float hFrac = vParams.y;
  float baseDens = vParams.z;

  // Sculpt fluffy billowy cumulus silhouette using multi-octave radial-masked FBM noise
  vec2 nUv = vUv * 1.65 + vec2(seed * 0.37, seed * 0.71);
  float n1 = fbmNoise(nUv);
  float n2 = fbmNoise(nUv * 2.3 + vec2(4.1, 7.9));
  float radial = 1.0 - smoothstep(0.18, 0.98, r);
  float shape = radial * (0.48 + 0.68 * n1 + 0.25 * n2);
  float alpha = smoothstep(0.28, 0.74, shape) * baseDens * 0.72;
  if (alpha < 0.01) discard;

  // Volumetric top-to-bottom shading + Henyey-Greenstein golden solar silver lining
  vec3 V = normalize(vWorldPos - uCamPos);
  vec3 L = normalize(uSunDir);
  float sunDot = max(dot(V, L), 0.0);
  float hgGlow = pow(sunDot, 5.5) * 0.85 + pow(sunDot, 22.0) * 0.75;

  float topLit = clamp(vUv.y * 0.55 + 0.52 + hFrac * 0.25 + (n2 - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = mix(uCloudShadow, uCloudTint * 1.15, smoothstep(0.12, 0.92, topLit));
  // Golden rim scattering along thinner cloud wisps facing the sun
  float edgeThin = 1.0 - clamp(shape, 0.0, 1.0);
  col += uSunColor * hgGlow * (0.45 + 0.75 * edgeThin);
  col += uHorizonColor * 0.08 * (1.0 - topLit);

  float dist = length(uCamPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.42);
  col = mix(col, mix(uFogColor, uHorizonColor, 0.45), clamp(fogAmt, 0.0, 0.65));

  // Fade gently if aircraft flies right through the puff
  float nearFade = smoothstep(45.0, 190.0, dist);
  col = gammaCorrect(acesToneMap(col, uExposure));
  outColor = vec4(col, alpha * nearFade);
}
`;

// 7. Emissive Additive/Translucent FX Shader (Target Rings, Mach Shock-Diamond Afterburner, PAPI Lamps, Lighthouse Beam, Contrails)
export const FX_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec4 vColor;
out vec3 vWorldPos;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vColor = aColor;
  gl_Position = uViewProj * wp;
}
`;

export const FX_FS = `${COMMON_GLSL}
in vec4 vColor;
in vec3 vWorldPos;
out vec4 outColor;

uniform vec3 uTint;
uniform float uIntensity;
uniform float uAlpha;
uniform float uExposure;

void main() {
  vec3 col = vColor.rgb * uTint * uIntensity;
  col = gammaCorrect(acesToneMap(col, uExposure));
  outColor = vec4(col, vColor.a * uAlpha);
}
`;
