/** Мелкая линейная алгебра в двойной точности: матрицы 4x4 по столбцам, как в gl-matrix и CSS matrix3d. */

export type V3 = [number, number, number];
export type M4 = Float64Array;

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** a + b*s + c*t */
export const comb = (a: V3, b: V3, s: number, c?: V3, t = 0): V3 => [
  a[0] + b[0] * s + (c ? c[0] * t : 0),
  a[1] + b[1] * s + (c ? c[1] * t : 0),
  a[2] + b[2] * s + (c ? c[2] * t : 0),
];

export function mul(a: ArrayLike<number>, b: ArrayLike<number>): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

/** Базис: столбцы u, v, n и точка p. */
export const basis = (u: V3, v: V3, n: V3, p: V3): M4 =>
  Float64Array.of(u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, p[0], p[1], p[2], 1);

/** Пространство отсечения -> пиксели CSS контейнера карты. */
export const viewport = (w: number, h: number): M4 =>
  Float64Array.of(w / 2, 0, 0, 0, 0, -h / 2, 0, 0, 0, 0, 1, 0, w / 2, h / 2, 0, 1);

/** Перенос и масштаб (локальные единицы -> меркатор; ось y меркатора направлена на юг). */
export const anchor = (x: number, y: number, k: number): M4 =>
  Float64Array.of(k, 0, 0, 0, 0, -k, 0, 0, 0, 0, k, 0, x, y, 0, 1);

export function apply(m: ArrayLike<number>, p: V3): { x: number; y: number; w: number } {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return {
    x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    w,
  };
}

export const css = (m: M4) => {
  let s = 'matrix3d(';
  for (let i = 0; i < 16; i++) s += (i ? ',' : '') + (Math.abs(m[i]) < 1e-12 ? 0 : +m[i].toPrecision(10));
  return s + ')';
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  const x = clamp01(t);
  const c1 = 1.4;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Кратчайшая разница углов в радианах. */
export const angleDiff = (to: number, from: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
