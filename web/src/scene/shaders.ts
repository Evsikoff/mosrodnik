/** Шейдеры процедурной сцены над родником. Цвета приходят униформами из токенов. */

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 voronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash(i + g), hash(i + g + 17.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(d1, d2);
}
`;

export const MESH_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vObjN;
varying vec2 vUv;
varying float vH;
void main() {
  vec4 pos = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    pos = instanceMatrix * pos;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  vUv = uv;
  vObjN = normal;
  vH = position.z;
  vN = normalize(normalMatrix * nrm);
  gl_Position = projectionMatrix * modelViewMatrix * pos;
}
`;

/** Лёд и кристаллы: френелевский край, фасеточный свет, блик. */
export const ICE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform vec3 uView;
uniform float uAlpha;
uniform float uDash;
varying vec3 vN;
varying vec2 vUv;
void main() {
  if (uDash > 0.0 && fract(vUv.x * uDash) > 0.58) discard;
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.35, 0.45, 0.82));
  float f = pow(1.0 - abs(dot(n, uView)), 2.0);
  float d = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), uView), 0.0), 22.0);
  vec3 c = uColor * (0.6 + 0.4 * d) + uRim * (f * 0.7 + spec * 0.65);
  gl_FragColor = vec4(c, uAlpha * (0.74 + 0.26 * f));
}
`;

/** Поток воды из родника: полосы бегут вверх. */
export const WATER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHi;
uniform vec3 uViewH;
uniform float uTime;
uniform float uAlpha;
varying vec3 vN;
varying vec2 vUv;
varying float vH;
void main() {
  vec3 n = normalize(vN);
  float f = pow(1.0 - abs(dot(normalize(vec3(n.xy, 0.0)), uViewH)), 1.4);
  float s = 0.5 + 0.5 * sin((vH * 5.0 - uTime * 2.4 + vUv.x * 2.0) * 6.2831);
  float s2 = 0.5 + 0.5 * sin((vH * 11.0 - uTime * 3.7 - vUv.x * 5.0) * 6.2831);
  vec3 c = mix(uColor, uHi, s * 0.35 + s2 * 0.15 + f * 0.45);
  gl_FragColor = vec4(c, uAlpha * (0.58 + 0.32 * f));
}
`;

/** Световой столб от родника к панелям. */
export const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform vec3 uViewH;
uniform float uTime;
uniform float uAlpha;
varying vec3 vN;
varying float vH;
void main() {
  vec3 n = normalize(vec3(vN.xy, 0.0));
  float core = pow(abs(dot(n, uViewH)), 3.0);
  float stripes = 0.5 + 0.5 * sin((vH * 7.0 - uTime * 1.3) * 6.2831);
  float fade = smoothstep(0.0, 0.05, vH) * (1.0 - 0.55 * smoothstep(0.75, 1.0, vH));
  vec3 c = mix(uColor, uCore, core);
  gl_FragColor = vec4(c, (0.12 + 0.6 * core + 0.28 * stripes * core) * fade * uAlpha);
}
`;

/** Диск на земле: чаша, круги на воде, иней давности данных, трещины пересохшего родника. */
export const DISC_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uFrost;
uniform float uDry;
uniform float uFreeze;
uniform float uAlpha;
uniform vec3 uColor;
uniform vec3 uLine;
uniform vec3 uFrostC;
uniform vec3 uInk;
uniform vec3 uHi;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float edge = smoothstep(1.0, 0.62, r);
  float pool = smoothstep(0.36, 0.0, r);
  float rip = 0.0;
  for (int i = 0; i < 4; i++) {
    float k = fract(uTime * (0.16 + 0.22 * uFlow) + float(i) / 4.0);
    rip += (1.0 - k) * smoothstep(0.02, 0.0, abs(r - k * 0.92));
  }
  rip *= uFlow;
  float ang = atan(p.y, p.x);
  float guide = smoothstep(0.006, 0.0, abs(r - 0.6)) * 0.55 + smoothstep(0.005, 0.0, abs(r - 0.88)) * 0.45;
  float tick = step(0.9, r) * step(r, 0.95) * step(0.9, abs(sin(ang * 30.0)));
  float fn = vnoise(p * 8.0) * 0.6 + vnoise(p * 21.0) * 0.4;
  float frost = uFrost * smoothstep(0.2, 0.92, r) * smoothstep(0.42, 0.78, fn);
  float wave = 0.0;
  if (uFreeze > 0.0) wave = smoothstep(0.06, 0.0, abs(r - uFreeze)) * (1.0 - uFreeze);
  vec2 v = voronoi(p * 5.5);
  float crack = uDry * smoothstep(0.07, 0.0, v.y - v.x) * smoothstep(0.92, 0.25, r);
  float lines = clamp(guide + tick, 0.0, 1.0);
  vec3 col = mix(uColor, uLine, lines);
  float a = pool * 0.55 + rip * 0.85 + lines * 0.75;
  col = mix(col, uHi, rip * 0.35);
  col = mix(col, uFrostC, clamp(frost * 1.4, 0.0, 1.0));
  a += frost * 0.7;
  col = mix(col, uHi, wave);
  a += wave;
  col = mix(col, uInk, crack);
  a += crack * 0.65;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * edge * uAlpha);
}
`;

/** Мягкая тень конструкции на земле. */
export const SHADOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = smoothstep(1.0, 0.1, length(p));
  gl_FragColor = vec4(uColor, a * a * uAlpha);
}
`;

/** Ледяная плита под панелью карточки: спереди блики, сзади иней, по краям тонкая линия. */
export const SLAB_FRAG = /* glsl */ `
uniform sampler2D uFrostTex;
uniform sampler2D uCaustTex;
uniform float uTime;
uniform float uAlpha;
uniform vec2 uSize;
uniform vec3 uView;
uniform vec3 uIce;
uniform vec3 uHi;
uniform vec3 uInk;
uniform vec3 uFrostC;
varying vec3 vN;
varying vec3 vObjN;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  float f = pow(1.0 - abs(dot(n, uView)), 1.5);
  vec2 e = min(vUv, 1.0 - vUv);
  if (vObjN.z < -0.5) {
    vec2 t = vUv * uSize / 512.0;
    float ca = texture2D(uCaustTex, t + vec2(uTime * 0.01, uTime * 0.006)).r;
    float glow = smoothstep(0.0, 0.5, vUv.y);
    gl_FragColor = vec4(mix(uIce, uHi, ca * 0.8), (0.18 + 0.4 * ca) * glow * uAlpha);
  } else if (vObjN.z > 0.5) {
    float fr = clamp((1.0 - texture2D(uFrostTex, vUv * uSize / 360.0).r) * 6.0, 0.0, 1.0);
    float rim = smoothstep(5.0, 0.0, min(e.x * uSize.x, e.y * uSize.y));
    float sheen = smoothstep(0.0, 1.0, vUv.y) * 0.35;
    vec3 c = mix(mix(uFrostC, uHi, 0.45 + sheen), uIce, fr * 0.8);
    c = mix(c, uInk, rim * 0.55);
    gl_FragColor = vec4(c, 0.94 * uAlpha);
  } else {
    float line = smoothstep(0.1, 0.0, min(e.x, e.y));
    vec3 c = mix(uIce, uHi, 0.3 + 0.6 * f);
    c = mix(c, uInk, line * 0.6);
    gl_FragColor = vec4(c, 0.96 * uAlpha);
  }
}
`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHi;
uniform float uAlpha;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.12, r);
  float hl = smoothstep(0.24, 0.0, length(c + vec2(0.12, 0.12)));
  gl_FragColor = vec4(mix(uColor, uHi, hl * 0.85), a * vA * uAlpha);
}
`;
export { POINT_FRAG };

const POINT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform float uAnchorW;
varying float vA;
void place(vec3 p, float size) {
  vec4 cp = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_Position = cp;
  gl_PointSize = size * uPx * (uAnchorW / max(cp.w, 0.0001));
}
`;

/** Фонтан: капли летят по параболе из устья и падают на землю. aP: угол, фаза, гориз. скорость, верт. скорость. */
export const FOUNTAIN_VERT = /* glsl */ `
attribute vec4 aP;
attribute vec2 aQ;
uniform float uStrength;
uniform float uH;
${POINT_HEAD}
void main() {
  float g = 90.0;
  float vz = aP.w * (0.45 + 0.55 * uStrength);
  float vh = aP.z * (0.5 + 0.5 * uStrength);
  float T = (vz + sqrt(vz * vz + 2.0 * g * uH)) / g;
  float t = fract(uTime / T + aP.y) * T;
  float z = uH + vz * t - 0.5 * g * t * t;
  vA = smoothstep(0.0, 2.5, z) * smoothstep(0.0, 0.06, t / T) * step(aQ.y, uStrength);
  place(vec3(cos(aP.x) * vh * t, sin(aP.x) * vh * t, max(z, 0.0)), aQ.x);
}
`;

/** Брызги после падения капли «Я был здесь». */
export const BURST_VERT = /* glsl */ `
attribute vec4 aP;
attribute vec2 aQ;
uniform float uBurst;
${POINT_HEAD}
void main() {
  float g = 140.0;
  float t = uBurst;
  float z = aP.w * t - 0.5 * g * t * t;
  vA = step(0.0, z) * step(0.0001, t) * (1.0 - smoothstep(0.4, 0.9, t));
  place(vec3(cos(aP.x) * aP.z * t, sin(aP.x) * aP.z * t, max(z, 0.0)), aQ.x);
}
`;

/** Капли посещений кружат вокруг столба. aP: угол, угл. скорость, радиус, высота; aQ: размер, номер. */
export const ORBIT_VERT = /* glsl */ `
attribute vec4 aP;
attribute vec2 aQ;
uniform float uCount;
${POINT_HEAD}
void main() {
  float ang = aP.x + uTime * aP.y;
  float z = aP.w + sin(uTime * 0.8 + aP.x * 3.0) * 4.0;
  vA = clamp(uCount - aQ.y, 0.0, 1.0);
  place(vec3(cos(ang) * aP.z, sin(ang) * aP.z, z), aQ.x * (0.6 + 0.4 * vA));
}
`;

/** Дрейф: искры у льда, пыль у сухого, туман у неизвестного. aP: x, y, z0, фаза; aQ: размер, скорость. */
export const DRIFT_VERT = /* glsl */ `
attribute vec4 aP;
attribute vec2 aQ;
uniform float uRise;
uniform float uTwinkle;
${POINT_HEAD}
void main() {
  float t = fract(uTime * aQ.y * 0.08 + aP.w);
  vec3 p = vec3(aP.x + sin(uTime * 0.5 + aP.w * 6.28) * 3.0, aP.y + cos(uTime * 0.4 + aP.w * 4.0) * 3.0, aP.z + t * uRise);
  float tw = 0.5 + 0.5 * sin(uTime * 5.0 + aP.w * 40.0);
  vA = sin(t * 3.1416) * mix(1.0, tw * tw, uTwinkle);
  place(p, aQ.x);
}
`;
