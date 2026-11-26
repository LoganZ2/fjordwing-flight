// FJORDWING — Custom WebGL2 GLSL ES 3.00 shaders for sky, terrain, ocean, aircraft, rings, and clouds.

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
`;

// 1. Atmospheric Rayleigh/Mie Sky Dome + Sun Corona + Procedural High Cloud Wisps
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

  float up = clamp(dir.y, -0.25, 1.0);
  float horizonBand = pow(1.0 - max(up, 0.0), 3.2);
  float midBand = pow(1.0 - max(up, 0.0), 1.35);

  vec3 midSky = mix(uZenithColor, vec3(0.20, 0.44, 0.72), 0.55);
  vec3 sky = mix(uZenithColor, midSky, midBand);
  sky = mix(sky, uHorizonColor, horizonBand);

  // Subtle below-horizon water bounce tint
  if (dir.y < 0.0) {
    sky = mix(uHorizonColor * 0.72, vec3(0.05, 0.14, 0.24), clamp(-dir.y * 5.0, 0.0, 1.0));
  }

  // Rayleigh / Mie solar forward scattering + crisp solar disc
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  float mieWide = pow(sunDot, 5.0) * 0.52;
  float mieTight = pow(sunDot, 48.0) * 0.85;
  float sunDisc = smoothstep(0.9982, 0.9994, sunDot) * 4.2;
  sky += uSunColor * (mieWide + mieTight + sunDisc);

  // Sunlit high-altitude cirrus & volumetric alpine cloud layer
  if (dir.y > 0.025) {
    vec2 cloudUv = dir.xz / (dir.y + 0.14) * 1.15 + vec2(uTime * 0.004, -uTime * 0.002);
    float n1 = fbmNoise(cloudUv * 1.45);
    float n2 = fbmNoise(cloudUv * 3.1 + vec2(4.2, 8.7));
    float density = smoothstep(0.47, 0.82, n1 * 0.72 + n2 * 0.36);
    float edgeFade = smoothstep(0.025, 0.19, dir.y) * smoothstep(0.95, 0.35, dir.y);
    float cloudAlpha = density * edgeFade * 0.68;

    float silverLining = pow(sunDot, 7.0) * 0.9 + 0.25;
    vec3 cloudLit = mix(uCloudShadow, uCloudTint, clamp(0.45 + 0.55 * n2 + silverLining * 0.4, 0.0, 1.25));
    cloudLit += uSunColor * pow(sunDot, 14.0) * 0.65;
    sky = mix(sky, cloudLit, cloudAlpha);
  }

  vec3 col = gammaCorrect(acesToneMap(sky, uExposure));
  outColor = vec4(col, 1.0);
}
`;

// 2. Multi-Biome Nordic Fjord Terrain + Detailed Runway 09/27 Shader
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
  float slope = 1.0 - clamp(N.y, 0.0, 1.0);
  vec2 xz = vWorldPos.xz;

  // Procedural multi-scale micro detail for rich texture without external image files
  float macroN = fbmNoise(xz * 0.0045);
  float detailN = fbmNoise(xz * 0.042);
  float rockStripes = valueNoise(vec2(xz.x * 0.015 + xz.y * 0.015, h * 0.085));

  // Perturb normal slightly for rocky crispness
  float micro = (detailN - 0.5) * 0.22;
  N = normalize(N + vec3(micro, 0.0, (macroN - 0.5) * 0.22));

  // Biome palette: turquoise reef -> dark granite shore -> rich Nordic spruce -> dramatic slate cliffs -> golden-lit snow
  vec3 reefCol = vec3(0.03, 0.26, 0.32);
  vec3 sandCol = vec3(0.42, 0.36, 0.28);
  vec3 meadowCol = vec3(0.11, 0.23, 0.10);
  vec3 spruceCol = vec3(0.04, 0.12, 0.08);
  vec3 rockCol = mix(vec3(0.14, 0.17, 0.22), vec3(0.32, 0.30, 0.30), rockStripes);
  vec3 snowCol = vec3(0.88, 0.92, 0.98);

  vec3 albedo = reefCol;
  albedo = mix(albedo, sandCol, smoothstep(-2.5, 3.0, h));
  vec3 forest = mix(spruceCol, meadowCol, smoothstep(0.32, 0.74, detailN + macroN * 0.35));
  albedo = mix(albedo, forest, smoothstep(4.5, 16.0, h));

  // Steep Nordic granite fjord walls stay dramatic dark slate-rock
  float rockMask = clamp(smoothstep(0.18, 0.40, slope) + smoothstep(135.0, 245.0, h) * 0.90, 0.0, 1.0);
  albedo = mix(albedo, rockCol, rockMask);

  // Glacier snow crowns high alpine ridges while steep granite cliff faces cut boldly through
  float snowLine = 248.0 + (macroN - 0.5) * 85.0 + slope * 185.0;
  float snowMask = smoothstep(snowLine - 24.0, snowLine + 44.0, h) * (1.0 - smoothstep(0.36, 0.62, slope));
  albedo = mix(albedo, snowCol, clamp(snowMask, 0.0, 1.0));

  // Skjold Island airstrip turf & rocky shoreline rim around runway
  float onIsland = smoothstep(135.0, 72.0, abs(xz.y + 10.0)) * smoothstep(1235.0, 1125.0, xz.x) * smoothstep(-135.0, -35.0, xz.x);
  if (onIsland > 0.01 && h > 11.5 && h < 17.5) {
    vec3 mownGrass = mix(vec3(0.08, 0.19, 0.09), vec3(0.14, 0.25, 0.11), detailN);
    albedo = mix(albedo, mownGrass, onIsland * 0.88);
  }

  // Lighting: strong golden directional sun + crisp cool sapphire shadow contrast
  float ndotl = max(dot(N, L), 0.0);
  vec3 hemi = mix(uAmbientGround * 0.75, uAmbientSky * 0.85, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 diffuse = albedo * (hemi * 0.72 + uSunColor * (ndotl * 1.52 + 0.05));

  vec3 H = normalize(L + V);
  float specPow = mix(18.0, 48.0, snowMask);
  float specAmt = mix(0.05, 0.24, snowMask);
  vec3 spec = uSunColor * pow(max(dot(N, H), 0.0), specPow) * specAmt * ndotl;

  vec3 color = diffuse + spec;

  // Aerial perspective atmospheric haze preserving distant mountain silhouette contrast
  float dist = length(uCamPos - vWorldPos);
  float heightAtten = exp(-max(vWorldPos.y, 0.0) * 0.0018);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * (0.58 + 0.42 * heightAtten));
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.5);
  vec3 fogTint = mix(uFogColor, uHorizonColor * 1.04, sunScatter * 0.62);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.82));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 3. Detailed Painted Asphalt Runway 09/27 Deck Shader (Threshold Piano Keys, Centerline, '09'/'27' Numerals)
export const RUNWAY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;

uniform mat4 uViewProj;
out vec3 vWorldPos;
out vec2 vUv;

void main() {
  vWorldPos = aPos;
  vUv = aUv; // u: 0..1 along length (0=09 threshold West, 1=27 threshold East), v: -1..1 across width
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
uniform float uExposure;

// Crisp 7-segment style runway digit helper in local [0,1]x[0,1] box
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

  // Textured weathered Nordic runway tarmac + subtle tire skid marks in touchdown zone
  float grain = valueNoise(vWorldPos.xz * 0.55) * 0.07 + valueNoise(vWorldPos.xz * 2.1) * 0.04;
  float skids = smoothstep(0.05, 0.14, u) * smoothstep(0.32, 0.18, u) * smoothstep(0.42, 0.08, av) * 0.08;
  vec3 tarmac = vec3(0.14, 0.15, 0.17) + grain - skids;

  float paint = 0.0;
  vec3 paintCol = vec3(0.95, 0.96, 0.92);

  // Continuous white edge lines
  if (av > 0.87 && av < 0.94) paint = 1.0;

  // Threshold piano keys at both 09 (u ~ 0.01..0.055) and 27 (u ~ 0.945..0.99)
  float inThresh = step(0.012, u) * step(u, 0.055) + step(0.945, u) * step(u, 0.988);
  if (inThresh > 0.5 && av < 0.80) {
    float stripe = step(0.45, fract(av * 5.2));
    if (av > 0.07) paint = max(paint, stripe);
  }

  // Painted bold '09' near West threshold (readable when approaching Eastbound!)
  if (u > 0.068 && u < 0.118 && av < 0.45) {
    float px = (u - 0.068) / 0.050; // 0 -> 1 bottom-to-top of numeral
    float d0 = drawDigit(0, vec2((v + 0.36) / 0.30, px));
    float d9 = drawDigit(9, vec2((v - 0.06) / 0.30, px));
    paint = max(paint, max(d0, d9));
  }

  // Aiming point touchdown bars (u ~ 0.155..0.205 and 0.795..0.845)
  float inAim = step(0.155, u) * step(u, 0.205) + step(0.795, u) * step(u, 0.845);
  if (inAim > 0.5 && av > 0.24 && av < 0.42) paint = 1.0;

  // Dashed white centerline
  if (u > 0.128 && u < 0.872 && av < 0.032) {
    if (fract(u * 26.0) < 0.54) paint = 1.0;
  }

  // Illuminated amber/white runway edge lamps along runway border
  float lightGlow = 0.0;
  if (av > 0.945 && av < 0.99) {
    float dLight = abs(fract(u * 22.0) - 0.5);
    lightGlow = smoothstep(0.12, 0.01, dLight);
  }

  vec3 albedo = mix(tarmac, paintCol, paint * 0.92);
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);

  float ndotl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.22 * ndotl;
  vec3 color = albedo * (uAmbientSky * 0.78 + uSunColor * ndotl * 1.35) + uSunColor * spec;

  // Green threshold lights at 09 start, warm amber edge lamps along deck
  vec3 lampCol = u < 0.04 ? vec3(0.2, 1.0, 0.45) : (u > 0.96 ? vec3(1.0, 0.25, 0.2) : vec3(1.0, 0.82, 0.42));
  color += lampCol * lightGlow * 2.4;

  float dist = length(uCamPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.95);
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.0);
  vec3 fogTint = mix(uFogColor, uHorizonColor * 1.05, sunScatter * 0.65);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.92));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 4. Shimmering Specular Fresnel Fjord Ocean Water Shader
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
  // Multi-directional animated capillary & fjord swell ripples
  float w1 = valueNoise(p * 0.022 + vec2(uTime * 0.38, uTime * 0.21));
  float w2 = valueNoise(p * 0.068 + vec2(-uTime * 0.55, uTime * 0.42));
  float w3 = valueNoise(p * 0.175 + vec2(uTime * 0.82, -uTime * 0.65));

  vec3 N = normalize(vec3(
    (w1 - 0.5) * 0.16 + (w2 - 0.5) * 0.13 + (w3 - 0.5) * 0.08,
    1.0,
    (w2 - 0.5) * 0.16 - (w1 - 0.5) * 0.12 + (w3 - 0.5) * 0.08
  ));

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 R = reflect(-V, N);

  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.2);

  // Deep Nordic fjord sapphire-teal water body so golden sun glitter & aircraft silhouette pop!
  vec3 deepWater = vec3(0.01, 0.06, 0.14);
  vec3 shallowTint = vec3(0.03, 0.18, 0.26);
  vec3 waterBody = mix(deepWater, shallowTint, clamp(w1 * 0.55 + 0.18, 0.0, 1.0));

  // Reflected golden-hour sky gradient
  float reflUp = clamp(R.y, 0.0, 1.0);
  vec3 skyRefl = mix(uHorizonColor * 0.78, uZenithColor * 1.25, pow(reflUp, 0.55));

  vec3 color = mix(waterBody, skyRefl, clamp(fresnel * 0.84, 0.08, 0.88));

  // Glittering golden sun path across the fjord waves
  vec3 H = normalize(L + V);
  float ndoth = max(dot(N, H), 0.0);
  float sunGlintTight = pow(ndoth, 210.0) * 4.4;
  float sunGlintBroad = pow(ndoth, 28.0) * 0.52;
  color += uSunColor * (sunGlintTight + sunGlintBroad);

  // Aerial fog matching terrain horizon
  float dist = length(uCamPos - vWorldPos);
  float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.85);
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.5);
  vec3 fogTint = mix(uFogColor, uHorizonColor * 1.04, sunScatter * 0.62);
  color = mix(color, fogTint, clamp(fogAmt, 0.0, 0.86));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, 1.0);
}
`;

// 5. PBR-style Lit Mesh Shader (VX-9 Kestrel Aircraft, Control Tower, Hangars, Lighthouse, Volumetric Clouds)
export const MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor; // rgb = albedo, a = roughness/material tag (>0.9 glossy canopy, <0.2 emissive)

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vColor;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor;
  gl_Position = uViewProj * wp;
}
`;

export const MESH_FS = `${COMMON_GLSL}
in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vColor;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uHorizonColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uExposure;
uniform float uFogScale;
uniform vec3 uEmissiveTint;
uniform float uAlpha;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);

  vec3 base = vColor.rgb;
  float matTag = vColor.a;

  // Emissive material path (matTag < 0.15): glowing lights, beacons, HUD elements
  if (matTag < 0.15) {
    vec3 glow = (base + uEmissiveTint) * 2.4;
    outColor = vec4(gammaCorrect(acesToneMap(glow, uExposure)), uAlpha);
    return;
  }

  // Glossy tinted canopy / metallic trim when matTag > 0.85
  float isGlossy = smoothstep(0.75, 0.95, matTag);
  float ndotl = max(dot(N, L), 0.0);
  // Warm fill light from front-camera hemisphere so aircraft silhouette stays rich and readable
  float fillNdotL = max(dot(N, normalize(vec3(-L.x, 0.55, -L.z))), 0.0) * 0.42;
  vec3 hemi = mix(uAmbientGround * 1.15, uAmbientSky * 1.15, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

  vec3 H = normalize(L + V);
  float specPow = mix(34.0, 110.0, isGlossy);
  float specGain = mix(0.32, 1.15, isGlossy);
  vec3 spec = uSunColor * pow(max(dot(N, H), 0.0), specPow) * specGain * (0.25 + 0.75 * ndotl);

  // Fresnel rim highlight reflecting golden-hour horizon sky on fuselage & canopy
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 rimCol = mix(uAmbientSky, uHorizonColor, 0.65) * rim * mix(0.35, 0.95, isGlossy);

  vec3 color = base * (hemi * 0.88 + uSunColor * (ndotl * 1.28 + fillNdotL)) + spec + rimCol + uEmissiveTint;

  float dist = length(uCamPos - vWorldPos);
  float fogAmt = (1.0 - exp(-dist * uFogDensity * uFogScale));
  color = mix(color, uFogColor, clamp(fogAmt, 0.0, 0.90));

  color = gammaCorrect(acesToneMap(color, uExposure));
  outColor = vec4(color, uAlpha);
}
`;

// 6. Emissive Additive/Translucent FX Shader (Glowing Target Rings, Afterburner Cones, Wingtip Contrails, Nav Strobes)
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
