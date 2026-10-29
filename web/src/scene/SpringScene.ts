import * as THREE from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { readTokens, mix, type Tokens } from '../map/style';
import type { Theme } from '../theme';
import type { Flow, Status } from '../types';
import {
  type V3, anchor, angleDiff, apply, basis, clamp01, comb, cross, css, easeOutBack, easeOutCubic, mul, norm, scale,
  smoothstep, viewport,
} from './math';
import {
  BEAM_FRAG, BURST_VERT, DISC_FRAG, DRIFT_VERT, FOUNTAIN_VERT, ICE_FRAG, MESH_VERT, ORBIT_VERT, POINT_FRAG,
  SHADOW_FRAG, SLAB_FRAG, WATER_FRAG,
} from './shaders';

THREE.ColorManagement.enabled = false;

export interface SceneSpring {
  slug: string;
  lon: number;
  lat: number;
  status: Status;
  flow: Flow;
  frost: 0 | 1 | 2 | 3;
  history: { year: number; status: Status }[];
  visits: number;
}

export interface StageEls {
  left: HTMLElement;
  center: HTMLElement;
  right: HTMLElement;
  /** Контейнер панелей: ему ставится прозрачность по зуму и класс оттаивания. */
  root: HTMLElement;
}

/** 'stage' — панели карточки стоят над родником (широкий экран); 'ground' — только сцена на земле (телефон). */
export type SceneMode = 'stage' | 'ground';

const DEG = Math.PI / 180;
const BASE_Z = 150;
const ALPHA_OPEN = 24 * DEG;
const ALPHA_SHUT_L = 176 * DEG;
const ALPHA_SHUT_R = 170 * DEG;
const SLAB_T = 20;
const DISC_R = 165;
const HIST_R = 128;
const STAGE_DELAY = 620;
const STAGE_MS = 1050;
const GROUND_MS = 900;
const CLOSE_MS = 430;
const MAX_ORBIT = 30;

const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const seedOf = (slug: string) => {
  let h = 2166136261;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

type Uniforms = Record<string, THREE.IUniform>;

interface Variant {
  flow: Flow;
  group: THREE.Group;
  appear: number;
  target: number;
  born: number;
  update(t: number, appear: number): void;
  dispose(): void;
}

interface HistItem {
  group: THREE.Group;
  crystal: THREE.Mesh;
  theta: number;
  delay: number;
  latest: boolean;
  label: HTMLElement;
}

/**
 * Процедурная 3D-сцена над выбранным родником: слой MapLibre на three.js плюс проекция HTML-панелей карточки
 * в ту же камеру (CSS matrix3d). Единица сцены примерно равна пикселю экрана на выбранном зуме.
 */
export class SpringScene implements CustomLayerInterface {
  readonly id = 'spring-scene';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private yawGroup = new THREE.Group();
  private tk: Tokens = readTokens();
  private theme: Theme;
  private rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private spring: SceneSpring | null = null;
  private mode: SceneMode = 'stage';
  private origin = { x: 0, y: 0 };
  private ground = 0;
  private groundTarget = 0;
  private stage = 0;
  private stageTarget = 0;
  private stageAt = 0;
  private folded = false;
  private yaw = 0;
  private tilt = 0;
  private fresh = true;
  private last = performance.now();
  private onClosed: (() => void) | null = null;
  private thawed = false;

  private els: StageEls | null = null;
  private sizes = new WeakMap<HTMLElement, { w: number; h: number }>();
  private ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      this.sizes.set(el, { w: el.offsetWidth, h: el.offsetHeight });
    }
    this.map?.triggerRepaint();
  });
  private labelLayer = document.createElement('div');

  // материалы и объекты
  private uIce!: Uniforms;
  private uWater!: Uniforms;
  private uBeam!: Uniforms;
  private uDisc!: Uniforms;
  private uShadow!: Uniforms;
  private uSlab!: Uniforms;
  private pointUniforms: Uniforms[] = [];
  private iceMats: THREE.ShaderMaterial[] = [];
  private matCache = new Map<string, THREE.ShaderMaterial>();
  private frostKey = '';
  private disc!: THREE.Mesh;
  private beam!: THREE.Mesh;
  private basin!: THREE.Mesh;
  private shadow!: THREE.Mesh;
  private slabs: THREE.Mesh[] = [];
  private emitter!: THREE.Mesh;
  private orbit!: THREE.Points;
  private uOrbit!: Uniforms;
  private orbitCount = 0;
  private frostSpikes: THREE.InstancedMesh | null = null;
  private variants: Variant[] = [];
  private hist: HistItem[] = [];
  private histKey = '';
  private drop!: THREE.Mesh;
  private ring!: THREE.Mesh;
  private uBurst!: Uniforms;
  private dropAt = 0;
  private splashAt = 0;
  private freezeAt = 0;
  private geo = {
    lathe: new THREE.LatheGeometry(
      [new THREE.Vector2(0.001, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0.72), new THREE.Vector2(0.001, 1)],
      6,
    ).rotateX(Math.PI / 2).toNonIndexed(),
    octa: new THREE.OctahedronGeometry(1, 0),
    beam: new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    ball: new THREE.IcosahedronGeometry(1, 2),
    torusFlat: new THREE.TorusGeometry(1, 0.2, 8, 40),
    torusUp: new THREE.TorusGeometry(1, 0.2, 8, 40).rotateX(Math.PI / 2),
    stem: new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    tube: new THREE.CylinderGeometry(1, 1.35, 1, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    dome: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
    ring: new THREE.RingGeometry(0.86, 1, 48),
    cone: new THREE.ConeGeometry(1, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  };

  constructor(theme: Theme) {
    this.theme = theme;
    this.geo.lathe.computeVertexNormals();
    this.labelLayer.className = 'scene-labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.rm = e.matches;
    });
  }

  // ---------- публичный интерфейс ----------

  /** Открыть сцену над родником или обновить данные уже открытого. */
  show(s: SceneSpring, mode: SceneMode) {
    const same = this.spring?.slug === s.slug && this.groundTarget === 1;
    const now = performance.now();
    if (!same) {
      const m = MercatorCoordinate.fromLngLat([s.lon, s.lat], 0);
      this.origin = { x: m.x, y: m.y };
      this.ground = this.rm ? 1 : 0;
      this.stage = this.rm ? (mode === 'stage' ? 1 : 0) : 0;
      this.stageAt = now + (this.rm ? 0 : STAGE_DELAY);
      this.fresh = true;
      this.thawed = false;
      this.els?.root.classList.remove('thaw');
      for (const v of this.variants) {
        this.scene.remove(v.group);
        v.dispose();
      }
      this.variants = [];
      this.orbitCount = 0;
      this.histKey = '';
      this.frostKey = '';
    }
    this.onClosed = null;
    this.mode = mode;
    this.groundTarget = 1;
    this.stageTarget = mode === 'stage' && !this.folded ? 1 : 0;
    const prev = this.spring;
    this.spring = s;
    if (!same || prev?.flow !== s.flow) this.setFlow(s.flow, now);
    this.setStatus(s.status);
    this.setFrost(s.frost);
    this.setHistory(s.history);
    this.map?.triggerRepaint();
  }

  /** Закрыть: панели складываются и уходят в родник, потом onDone. */
  hide(onDone?: () => void) {
    if (!this.spring) {
      onDone?.();
      return;
    }
    this.groundTarget = 0;
    this.stageTarget = 0;
    this.onClosed = onDone ?? null;
    this.els?.root.classList.remove('thaw');
    if (this.rm) this.finishClose();
    this.map?.triggerRepaint();
  }

  /** Сложить панели (например, на время выбора точки на карте) или раскрыть снова. */
  fold(on: boolean) {
    this.folded = on;
    if (this.spring && this.groundTarget === 1) {
      this.stageTarget = this.mode === 'stage' && !on ? 1 : 0;
      if (!on) this.stageAt = performance.now();
    }
    this.map?.triggerRepaint();
  }

  attach(els: StageEls | null) {
    if (this.els) {
      for (const el of [this.els.left, this.els.center, this.els.right]) this.ro.unobserve(el);
    }
    this.els = els;
    if (els) {
      for (const el of [els.left, els.center, els.right]) {
        this.sizes.set(el, { w: el.offsetWidth, h: el.offsetHeight });
        this.ro.observe(el);
      }
      if (this.thawed) els.root.classList.add('thaw');
    }
    this.map?.triggerRepaint();
  }

  fx(kind: 'drop' | 'crystal') {
    const now = performance.now();
    if (kind === 'drop') this.dropAt = now;
    else this.freezeAt = now;
    this.map?.triggerRepaint();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    if (!this.renderer) return;
    this.tk = readTokens();
    this.applyColors();
    this.map.triggerRepaint();
  }

  // ---------- слой MapLibre ----------

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    map.getContainer().appendChild(this.labelLayer);
    this.build();
    this.applyColors();
  }

  onRemove() {
    this.labelLayer.remove();
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.renderer?.dispose();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opts: CustomRenderMethodInput) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.spring) return;
    this.step(now, dt);
    if (!this.spring) return;

    const map = this.map;
    const zoom = map.getZoom();
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    const bearing = map.getBearing() * DEG;
    const pitch = map.getPitch() * DEG;

    // Плавное следование за поворотом и наклоном камеры: видно, что конструкция объёмная.
    const tiltTarget = Math.max(0, (90 * DEG - pitch) - 9 * DEG);
    if (this.fresh || this.rm) {
      this.yaw = bearing;
      this.tilt = tiltTarget;
      this.fresh = false;
    } else {
      const d = angleDiff(bearing, this.yaw);
      this.yaw = bearing - Math.max(-0.9, Math.min(0.9, d * Math.exp(-dt * 6.5)));
      this.tilt += (tiltTarget - this.tilt) * (1 - Math.exp(-dt * 6.5));
    }
    const toCam: V3 = [-Math.sin(bearing) * Math.sin(pitch), -Math.cos(bearing) * Math.sin(pitch), Math.cos(pitch)];
    const viewH: V3 = norm([-Math.sin(bearing), -Math.cos(bearing), 0]);

    // Масштаб: конструкция держит примерно постоянный размер на экране, а складень целиком помещается в кадр.
    const main = opts.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>;
    const zf = Math.min(1.15, Math.max(0.85, Math.pow(2, (zoom - 16.6) * 0.3)));
    const want = this.mode === 'stage' ? zf : Math.min(1, Math.max(0.6, Math.min(W, H) / 640)) * zf;
    let s = want;
    let AL = mul(main, anchor(this.origin.x, this.origin.y, s / (512 * Math.pow(2, zoom))));
    if (this.mode === 'stage') {
      for (let i = 0; i < 3; i++) {
        const ratio = this.measure(mul(viewport(W, H), AL), W, H);
        const next = Math.max(0.45, Math.min(want, s * ratio));
        if (Math.abs(next - s) < 0.004) break;
        s = next;
        AL = mul(main, anchor(this.origin.x, this.origin.y, s / (512 * Math.pow(2, zoom))));
      }
    }
    const anchorW = AL[15];
    if (anchorW <= 0) return;

    this.camera.projectionMatrix.fromArray(AL);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.yawGroup.rotation.z = -this.yaw;

    const t = this.rm ? 2.2 : now / 1000;
    const px = (window.devicePixelRatio || 1) * s;
    for (const u of this.pointUniforms) {
      u.uTime.value = t;
      u.uPx.value = px;
      u.uAnchorW.value = anchorW;
    }
    for (const m of this.iceMats) (m.uniforms.uView.value as THREE.Vector3).set(...toCam);
    this.uWater.uTime.value = t;
    (this.uWater.uViewH.value as THREE.Vector3).set(...viewH);
    this.uBeam.uTime.value = t;
    (this.uBeam.uViewH.value as THREE.Vector3).set(...viewH);
    this.uDisc.uTime.value = t;
    this.uSlab.uTime.value = t;
    (this.uSlab.uView.value as THREE.Vector3).set(...toCam);

    const F0 = mul(viewport(W, H), AL);
    this.layoutStage(F0, toCam, zoom);
    this.layoutGround(t, now);
    this.placeLabels(F0);

    this.renderer.resetState();
    const cv = map.getCanvas();
    this.renderer.setViewport(0, 0, cv.width, cv.height);
    this.renderer.render(this.scene, this.camera);

    const animating = this.ground !== this.groundTarget || this.stage !== this.stageTarget || this.dropAt || this.splashAt;
    if (!document.hidden && (!this.rm || animating)) map.triggerRepaint();
  }

  // ---------- анимация ----------

  private step(now: number, dt: number) {
    const towards = (v: number, target: number, ms: number) =>
      target > v ? Math.min(target, v + (dt * 1000) / ms) : Math.max(target, v - (dt * 1000) / ms);
    if (this.rm) {
      this.ground = this.groundTarget;
      this.stage = this.stageTarget;
    } else {
      const closing = this.groundTarget === 0;
      this.ground = towards(this.ground, this.groundTarget, closing ? CLOSE_MS : GROUND_MS);
      if (this.stageTarget === 0 || now >= this.stageAt) {
        this.stage = towards(this.stage, this.stageTarget, this.stageTarget ? STAGE_MS : CLOSE_MS);
      }
    }
    if (!this.thawed && this.stage > 0.42 && this.stageTarget === 1) {
      this.thawed = true;
      this.els?.root.classList.add('thaw');
    }
    if (this.groundTarget === 0 && this.ground === 0 && this.stage === 0) this.finishClose();
  }

  private finishClose() {
    this.spring = null;
    this.ground = 0;
    this.stage = 0;
    this.labelLayer.replaceChildren();
    this.hist = [];
    this.histKey = '';
    if (this.els) {
      this.els.root.style.opacity = '0';
      this.els.root.classList.remove('thaw');
    }
    const cb = this.onClosed;
    this.onClosed = null;
    cb?.();
    this.map?.triggerRepaint();
  }

  // ---------- панели карточки в 3D ----------

  /** Положение трёх панелей складня при прогрессе открытия q (0 — спрятан в роднике, 1 — раскрыт). */
  private frames(q: number) {
    const rise = easeOutCubic(q / 0.45);
    const unfold = easeOutBack((q - 0.36) / 0.64);
    const rs = 0.05 + 0.95 * rise;
    const baseZ = BASE_Z * Math.pow(rise, 0.8);
    const b = this.yaw;
    const R: V3 = [Math.cos(b), -Math.sin(b), 0];
    const T: V3 = [-Math.sin(b), -Math.cos(b), 0];
    const up: V3 = comb([0, 0, 0], [0, 0, 1], Math.cos(this.tilt), T, -Math.sin(this.tilt));
    const down: V3 = scale(up, -1);
    const N = cross(R, up);

    const els = this.els;
    const size = (el: HTMLElement | undefined, w: number, h: number) => (el && this.sizes.get(el)) || { w, h };
    const c = size(els?.center, 356, 500);
    const l = size(els?.left, 296, 440);
    const r = size(els?.right, 296, 440);
    const B: V3 = [0, 0, baseZ];
    const P0 = comb(B, R, -c.w / 2 * rs, up, c.h * rs);
    const aL = ALPHA_SHUT_L + (ALPHA_OPEN - ALPHA_SHUT_L) * unfold;
    const aR = ALPHA_SHUT_R + (ALPHA_OPEN - ALPHA_SHUT_R) * unfold;
    const uL = comb([0, 0, 0], R, Math.cos(aL), N, -Math.sin(aL));
    const uR = comb([0, 0, 0], R, Math.cos(aR), N, Math.sin(aR));
    const list = [
      { el: els?.center, sz: c, u: R, p: P0, slab: this.slabs[1] },
      // Створки ниже центральной панели и выровнены по её нижнему краю, как у складня.
      { el: els?.left, sz: l, u: uL, p: comb(comb(P0, down, (c.h - l.h) * rs), uL, -l.w * rs), slab: this.slabs[0] },
      { el: els?.right, sz: r, u: uR, p: comb(P0, R, c.w * rs, down, (c.h - r.h) * rs), slab: this.slabs[2] },
    ];
    return { list, rise, rs, baseZ, down, c, l };
  }

  /** Во сколько раз можно увеличить (больше 1) или нужно уменьшить складень, чтобы он поместился в кадр. */
  private measure(F0: Float64Array, W: number, H: number) {
    const { list, rs, down } = this.frames(1);
    const a = apply(F0, [0, 0, 0]);
    let half = 1;
    let top = 1;
    for (const f of list) {
      for (const [x, y] of [[0, 0], [f.sz.w, 0], [0, f.sz.h], [f.sz.w, f.sz.h]]) {
        const p = apply(F0, comb(f.p, f.u, x * rs, down, y * rs));
        if (p.w <= 0) return 0.5;
        half = Math.max(half, Math.abs(p.x - a.x));
        top = Math.max(top, a.y - p.y);
      }
    }
    return Math.min((W / 2 - 22) / half, (Math.min(a.y, H * 0.82) - 46) / top);
  }

  private layoutStage(F0: Float64Array, toCam: V3, zoom: number) {
    const q = this.stage;
    const { list: frames, rise, rs, baseZ, down, c, l } = this.frames(q);

    const visible = this.mode === 'stage' && q > 0.001;
    const zoomFade = smoothstep(13.3, 14.3, zoom);
    this.emitter.visible = visible;
    this.shadow.visible = visible;
    (this.emitter.material as THREE.ShaderMaterial).uniforms.uAlpha.value = rise * 0.9;
    this.emitter.position.set(0, 0, baseZ);
    this.emitter.scale.setScalar(26 * rs);
    this.uShadow.uAlpha.value = (this.theme === 'night' ? 0.42 : 0.2) * rise;
    this.shadow.position.set(0, (c.h * rs * Math.sin(this.tilt)) / 2 + 10, 0.3);
    this.shadow.scale.set((c.w + 2 * l.w * 0.9) * rs * 0.62, (60 + c.h * Math.sin(this.tilt) * 0.5) * rs, 1);

    this.uSlab.uAlpha.value = rise;
    frames.forEach((f, i) => {
      const behind = norm(cross(f.u, down));
      const front = scale(behind, -1);
      const facing = this.dotv(front, toCam);
      const slab = f.slab;
      slab.visible = visible;
      if (visible) {
        const m = basis(scale(f.u, f.sz.w * rs), scale(down, f.sz.h * rs), scale(behind, SLAB_T * rs), f.p);
        slab.matrix.fromArray(m);
        slab.matrixWorldNeedsUpdate = true;
        (slab.material as THREE.ShaderMaterial).uniforms.uSize.value.set(f.sz.w, f.sz.h);
      }
      if (!f.el) return;
      const show = visible && facing > 0.06;
      const op = i === 0 ? smoothstep(0.4, 0.72, q) : smoothstep(0.5, 0.82, q) * smoothstep(0.06, 0.3, facing);
      if (!show || op <= 0.01) {
        f.el.style.visibility = 'hidden';
        return;
      }
      const M = mul(F0, basis(scale(f.u, rs), scale(down, rs), behind, f.p));
      f.el.style.visibility = 'visible';
      f.el.style.transform = css(M);
      f.el.style.opacity = String(op);
    });
    const els = this.els;
    if (els) {
      els.root.style.opacity = String(zoomFade);
      els.root.dataset.live = visible && q > 0.6 && zoomFade > 0.5 ? '1' : '0';
    }
  }

  private dotv(a: V3, b: V3) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  // ---------- земля, вода, история ----------

  private layoutGround(t: number, now: number) {
    const g = easeOutCubic(this.ground);
    this.uDisc.uAlpha.value = g;
    this.disc.scale.setScalar(DISC_R * (0.4 + 0.6 * g));
    this.basin.scale.set(15, 15, 15);
    (this.basin.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0.9 * g;
    const beamTop = this.mode === 'stage' ? Math.max(40, BASE_Z * Math.pow(easeOutCubic(this.stage / 0.45), 0.8)) : 64;
    this.beam.scale.set(7, 7, beamTop * g);
    this.uBeam.uAlpha.value = g;

    // замораживающая волна по диску
    const fw = this.freezeAt ? (now - this.freezeAt) / 800 : 0;
    this.uDisc.uFreeze.value = fw > 0 && fw < 1 ? fw : 0;
    if (fw >= 1) this.freezeAt = 0;

    // варианты воды: старый уходит, новый вырастает
    for (let i = this.variants.length - 1; i >= 0; i--) {
      const v = this.variants[i];
      const sinceBorn = (now - v.born) / 700;
      v.appear = v.target ? (this.rm ? 1 : clamp01(sinceBorn)) : Math.max(0, v.appear - 0.05);
      v.update(t, v.appear * g);
      if (!v.target && v.appear <= 0) {
        this.scene.remove(v.group);
        v.dispose();
        this.variants.splice(i, 1);
      }
    }

    // иней по давности данных
    if (this.frostSpikes) {
      this.frostSpikes.scale.set(1, 1, easeOutBack(this.ground));
      (this.frostSpikes.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0.85 * g;
    }

    // кристаллы истории
    const span = this.hist.length;
    this.hist.forEach((h, i) => {
      const a = this.rm ? 1 : easeOutBack((this.ground * (1 + span * 0.12) - h.delay));
      h.group.scale.setScalar(Math.max(0.0001, a) * (h.latest ? 1.3 : 1));
      h.crystal.rotation.z = t * (0.6 + (i % 3) * 0.15);
      h.label.style.opacity = String(clamp01(a) * g);
    });

    // капли посещений
    const target = Math.min(MAX_ORBIT, this.spring?.visits ?? 0);
    this.orbitCount += (target - this.orbitCount) * (this.rm ? 1 : 0.06);
    this.uOrbit.uCount.value = this.orbitCount;
    this.uOrbit.uAlpha.value = g;

    // «Я был здесь»: капля падает в родник, расходится круг
    if (this.dropAt) {
      const d = Math.min(1, (now - this.dropAt) / 430);
      this.drop.visible = true;
      const z0 = this.mode === 'stage' ? BASE_Z : 70;
      this.drop.position.set(0, 0, z0 * (1 - d * d));
      if (d >= 1) {
        this.dropAt = 0;
        this.splashAt = now;
        this.drop.visible = false;
      }
    } else this.drop.visible = false;
    if (this.splashAt) {
      const d = (now - this.splashAt) / 900;
      this.ring.visible = d < 1;
      this.ring.scale.setScalar(6 + easeOutCubic(d) * 90);
      (this.ring.material as THREE.ShaderMaterial).uniforms.uAlpha.value = (1 - d) * 0.95;
      this.uBurst.uBurst.value = (now - this.splashAt) / 1000;
      if (d >= 1) {
        this.splashAt = 0;
        this.uBurst.uBurst.value = 0;
      }
    } else this.ring.visible = false;
  }

  private placeLabels(F0: Float64Array) {
    if (!this.hist.length) return;
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    for (const h of this.hist) {
      const lx = Math.sin(h.theta) * (HIST_R + 15);
      const ly = -Math.cos(h.theta) * (HIST_R + 15);
      const p = apply(F0, [lx * c - ly * s, lx * s + ly * c, 0]);
      if (p.w <= 0) {
        h.label.style.visibility = 'hidden';
        continue;
      }
      h.label.style.visibility = 'visible';
      h.label.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, 0)`;
    }
  }

  // ---------- построение ----------

  /** Материал льда. С ключом — отдельный экземпляр (его прозрачность анимируется), без ключа — общий. */
  private iceMaterial(color: string, alpha = 0.9, dash = 0, key?: string) {
    const id = key ?? `${color}|${alpha}|${dash}`;
    const cached = this.matCache.get(id);
    if (cached) {
      (cached.uniforms.uColor.value as THREE.Color).set(color);
      return cached;
    }
    const m = new THREE.ShaderMaterial({
      vertexShader: MESH_VERT,
      fragmentShader: ICE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uRim: { value: new THREE.Color(this.tk.snow) },
        uView: { value: new THREE.Vector3(0, 0, 1) },
        uAlpha: { value: alpha },
        uDash: { value: dash },
      },
    });
    this.iceMats.push(m);
    this.matCache.set(id, m);
    return m;
  }

  private points(vert: string, n: number, fill: (i: number, p: number[], q: number[]) => void, extra: Uniforms = {}) {
    const P = new Float32Array(n * 4);
    const Q = new Float32Array(n * 2);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = [0, 0, 0, 0];
      const q = [1, 0];
      fill(i, p, q);
      P.set(p, i * 4);
      Q.set(q, i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(P, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(Q, 2));
    const uniforms: Uniforms = {
      uTime: { value: 0 }, uPx: { value: 1 }, uAnchorW: { value: 1 }, uAlpha: { value: 1 },
      uColor: { value: new THREE.Color(this.tk.ice) }, uHi: { value: new THREE.Color(this.tk.snow) },
      ...extra,
    };
    this.pointUniforms.push(uniforms);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: POINT_FRAG, uniforms, transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    const dispose = () => {
      this.pointUniforms = this.pointUniforms.filter((u) => u !== uniforms);
      geo.dispose();
      mat.dispose();
    };
    return { pts, uniforms, dispose };
  }

  private build() {
    const sc = this.scene;
    sc.add(this.yawGroup);
    const tk = this.tk;

    this.uDisc = {
      uTime: { value: 0 }, uFlow: { value: 0 }, uFrost: { value: 0 }, uDry: { value: 0 }, uFreeze: { value: 0 },
      uAlpha: { value: 0 }, uColor: { value: new THREE.Color(tk.ice) }, uLine: { value: new THREE.Color(tk.ink) },
      uFrostC: { value: new THREE.Color(tk.frost) },
      uInk: { value: new THREE.Color(tk.ink) }, uHi: { value: new THREE.Color(tk.snow) },
    };
    this.disc = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: MESH_VERT, fragmentShader: DISC_FRAG, uniforms: this.uDisc, transparent: true, depthWrite: false }),
    );
    this.disc.position.z = 0.4;
    this.disc.renderOrder = 1;
    sc.add(this.disc);

    this.uShadow = { uColor: { value: new THREE.Color(tk.ink) }, uAlpha: { value: 0 } };
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: MESH_VERT, fragmentShader: SHADOW_FRAG, uniforms: this.uShadow, transparent: true, depthWrite: false }),
    );
    this.shadow.renderOrder = 0;
    this.yawGroup.add(this.shadow);

    this.basin = new THREE.Mesh(this.geo.torusFlat, this.iceMaterial(tk.slate, 0.9, 0, 'basin'));
    this.basin.position.z = 1.5;
    this.basin.renderOrder = 2;
    sc.add(this.basin);

    this.uBeam = {
      uTime: { value: 0 }, uAlpha: { value: 0 }, uViewH: { value: new THREE.Vector3(0, -1, 0) },
      uColor: { value: new THREE.Color(tk.ice) }, uCore: { value: new THREE.Color(tk.snow) },
    };
    this.beam = new THREE.Mesh(
      this.geo.beam,
      new THREE.ShaderMaterial({
        vertexShader: MESH_VERT, fragmentShader: BEAM_FRAG, uniforms: this.uBeam, transparent: true, depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.renderOrder = 4;
    sc.add(this.beam);

    this.emitter = new THREE.Mesh(this.geo.ring, this.iceMaterial(tk.ice, 0.9, 0, 'emitter'));
    this.emitter.renderOrder = 5;
    sc.add(this.emitter);

    this.uWater = {
      uTime: { value: 0 }, uAlpha: { value: 1 }, uViewH: { value: new THREE.Vector3(0, -1, 0) },
      uColor: { value: new THREE.Color(tk.ice) }, uHi: { value: new THREE.Color(tk.snow) },
    };

    // ледяные плиты под панелями: левая, центральная, правая
    const loader = new THREE.TextureLoader();
    const tex = (url: string) => {
      const t = loader.load(url, () => this.map?.triggerRepaint());
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    this.uSlab = {
      uFrostTex: { value: tex('/effects/frost-tile-512.webp') },
      uCaustTex: { value: tex('/effects/caustics-tile-512.webp') },
      uTime: { value: 0 }, uAlpha: { value: 0 }, uView: { value: new THREE.Vector3(0, 0, 1) },
      uIce: { value: new THREE.Color(tk.ice) }, uHi: { value: new THREE.Color(tk.snow) },
      uInk: { value: new THREE.Color(tk.ink) }, uFrostC: { value: new THREE.Color(tk.frost) },
    };
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: MESH_VERT, fragmentShader: SLAB_FRAG, transparent: true, depthWrite: false, depthTest: false,
        uniforms: { ...this.uSlab, uSize: { value: new THREE.Vector2(300, 470) } },
      });
      const slab = new THREE.Mesh(box, mat);
      slab.matrixAutoUpdate = false;
      slab.frustumCulled = false;
      slab.renderOrder = 8;
      slab.visible = false;
      this.slabs.push(slab);
      sc.add(slab);
    }

    // капли посещений
    const r = rnd(7);
    const orbit = this.points(ORBIT_VERT, MAX_ORBIT, (i, p, q) => {
      p[0] = r() * Math.PI * 2;
      p[1] = (0.35 + r() * 0.5) * (r() < 0.5 ? -1 : 1);
      p[2] = 20 + r() * 16;
      p[3] = 26 + r() * 34;
      q[0] = 4.5 + r() * 2.5;
      q[1] = i;
    }, { uCount: { value: 0 } });
    this.orbit = orbit.pts;
    this.uOrbit = orbit.uniforms;
    sc.add(this.orbit);

    // капля и круг для «Я был здесь»
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(3.2, 3.2, 4.8), this.iceMaterial(tk.ice, 0.95, 0, 'drop'));
    this.drop.renderOrder = 7;
    this.drop.visible = false;
    sc.add(this.drop);
    this.ring = new THREE.Mesh(this.geo.ring, this.iceMaterial(tk.snow, 0.9, 0, 'splash'));
    this.ring.position.z = 0.8;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    sc.add(this.ring);
    const br = rnd(11);
    const burst = this.points(BURST_VERT, 22, (_i, p, q) => {
      p[0] = br() * Math.PI * 2;
      p[2] = 40 + br() * 70;
      p[3] = 30 + br() * 45;
      q[0] = 3 + br() * 2.5;
    }, { uBurst: { value: 0 } });
    this.uBurst = burst.uniforms;
    sc.add(burst.pts);
  }

  private applyColors() {
    const tk = this.tk;
    const night = this.theme === 'night';
    const blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    (this.beam.material as THREE.ShaderMaterial).blending = blending;
    (this.uBeam.uColor.value as THREE.Color).set(night ? tk.ice : mix(tk.ice, tk.ink, 0.25));
    (this.uBeam.uCore.value as THREE.Color).set(night ? tk.snow : tk.ice);
    (this.uDisc.uInk.value as THREE.Color).set(night ? tk.dusk : tk.ink);
    (this.uShadow.uColor.value as THREE.Color).set(night ? mix(tk.dusk, tk.ink, 0.6) : tk.ink);
    for (const u of this.pointUniforms) (u.uHi.value as THREE.Color).set(tk.snow);
    (this.uOrbit.uColor.value as THREE.Color).set(this.dropColor());
    (this.uBurst.uColor.value as THREE.Color).set(this.dropColor());
    (this.uWater.uColor.value as THREE.Color).set(night ? tk.ice : mix(tk.ice, tk.ink, 0.22));
    for (const m of [this.beam.material, this.orbit.material] as THREE.ShaderMaterial[]) m.needsUpdate = true;
    if (this.spring) this.setStatus(this.spring.status);
  }

  /** Капли: ночью светлые, днём темнее, чтобы читались на светлой карте. */
  private dropColor() {
    return this.theme === 'night' ? this.tk.ice : mix(this.tk.ice, this.tk.ink, 0.38);
  }

  private statusColor(st: Status) {
    const tk = this.tk;
    return st === 'exceed' ? tk.ochre : st === 'ok' ? tk.ice : tk.slate;
  }

  private setStatus(st: Status) {
    const c = this.statusColor(st);
    const night = this.theme === 'night';
    (this.uDisc.uColor.value as THREE.Color).set(night ? mix(c, this.tk.snow, 0.15) : mix(c, this.tk.ink, 0.12));
    (this.uDisc.uLine.value as THREE.Color).set(night ? mix(c, this.tk.snow, 0.5) : mix(c, this.tk.ink, 0.55));
    const em = (this.emitter.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    em.set(c);
  }

  private setFrost(level: number) {
    this.uDisc.uFrost.value = level / 3;
    const key = `${this.spring?.slug}|${level}`;
    if (key === this.frostKey) return;
    this.frostKey = key;
    if (this.frostSpikes) {
      this.scene.remove(this.frostSpikes);
      this.frostSpikes.dispose();
      this.frostSpikes = null;
    }
    if (!level || !this.spring) return;
    const n = [0, 10, 18, 30][level];
    const mat = this.iceMaterial(this.tk.frost, 0.85, 0, 'frost');
    const mesh = new THREE.InstancedMesh(this.geo.cone, mat, n);
    const r = rnd(seedOf(this.spring.slug) + 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.2;
      const rad = DISC_R * (0.82 + r() * 0.14);
      const h = (6 + r() * 10) * (0.6 + level * 0.35);
      e.set(Math.sin(a) * 0.45 * -1 * (0.4 + r() * 0.6), Math.cos(a) * 0.45 * (0.4 + r() * 0.6), 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0), q, new THREE.Vector3(2 + r() * 2, 2 + r() * 2, h));
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.frostSpikes = mesh;
    this.scene.add(mesh);
  }

  private setHistory(history: { year: number; status: Status }[]) {
    const key = history.map((h) => `${h.year}${h.status}`).join(',');
    if (key === this.histKey) return;
    this.histKey = key;
    for (const h of this.hist) this.yawGroup.remove(h.group);
    this.labelLayer.replaceChildren();
    this.hist = [];
    const items = [...history].sort((a, b) => a.year - b.year).slice(-9);
    const n = items.length;
    const tk = this.tk;
    items.forEach((it, i) => {
      const theta = n === 1 ? 0 : (-64 + (128 * i) / (n - 1)) * DEG;
      const group = new THREE.Group();
      group.position.set(Math.sin(theta) * HIST_R, -Math.cos(theta) * HIST_R, 0);
      const color = this.statusColor(it.status);
      let crystal: THREE.Mesh;
      if (it.status === 'exceed') {
        crystal = new THREE.Mesh(this.geo.octa, this.iceMaterial(color, 0.95));
        crystal.scale.set(9, 9, 13);
      } else if (it.status === 'ok') {
        crystal = new THREE.Mesh(this.geo.ball, this.iceMaterial(color, 0.92));
        crystal.scale.setScalar(9.5);
      } else {
        crystal = new THREE.Mesh(this.geo.torusUp, this.iceMaterial(color, 0.95, 14));
        crystal.scale.setScalar(9);
      }
      crystal.position.z = 30;
      crystal.renderOrder = 5;
      const stem = new THREE.Mesh(this.geo.stem, this.iceMaterial(mix(tk.slate, tk.ink, 0.3), 0.55));
      stem.scale.set(1.1, 1.1, 20);
      stem.renderOrder = 4;
      const base = new THREE.Mesh(this.geo.ring, this.iceMaterial(color, 0.7));
      base.scale.setScalar(8);
      base.position.z = 0.6;
      base.renderOrder = 3;
      group.add(stem, base, crystal);
      this.yawGroup.add(group);
      const label = document.createElement('span');
      label.className = `scene-year${i === n - 1 ? ' latest' : ''}`;
      label.textContent = String(it.year);
      this.labelLayer.appendChild(label);
      this.hist.push({ group, crystal, theta, delay: i * 0.12, latest: i === n - 1, label });
    });
  }

  private setFlow(flow: Flow, born: number) {
    for (const v of this.variants) v.target = 0;
    const v = this.makeVariant(flow, born);
    this.variants.push(v);
    this.scene.add(v.group);
    this.uDisc.uFlow.value = flow === 'flowing' ? 1 : flow === 'weak' ? 0.45 : flow === 'unknown' ? 0.15 : 0;
    this.uDisc.uDry.value = flow === 'dry' ? 1 : 0;
  }

  private makeVariant(flow: Flow, born: number): Variant {
    const group = new THREE.Group();
    const tk = this.tk;
    const r = rnd(seedOf(this.spring?.slug ?? 'x') + flow.length);
    const disposers: (() => void)[] = [];
    const pts = (...a: Parameters<SpringScene['points']>) => {
      const r = this.points(...a);
      disposers.push(r.dispose);
      return r;
    };
    const v: Variant = {
      flow, group, appear: 0, target: 1, born, update: () => {},
      dispose: () => disposers.forEach((d) => d()),
    };

    if (flow === 'flowing' || flow === 'weak') {
      const strong = flow === 'flowing';
      const tubeMat = new THREE.ShaderMaterial({
        vertexShader: MESH_VERT, fragmentShader: WATER_FRAG, uniforms: this.uWater, transparent: true, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const h = strong ? 46 : 26;
      const rad = strong ? 4.6 : 2.6;
      const tube = new THREE.Mesh(this.geo.tube, tubeMat);
      tube.renderOrder = 5;
      const dome = new THREE.Mesh(this.geo.dome, tubeMat);
      dome.renderOrder = 5;
      const fountain = pts(FOUNTAIN_VERT, strong ? 200 : 90, (_i, p, q) => {
        p[0] = r() * Math.PI * 2;
        p[1] = r();
        p[2] = 8 + r() * 26;
        p[3] = 10 + r() * 30;
        q[0] = 2.2 + r() * 2.6;
        q[1] = r();
      }, { uStrength: { value: strong ? 1 : 0.5 }, uH: { value: h } });
      (fountain.uniforms.uColor.value as THREE.Color).set(this.dropColor());
      group.add(tube, dome, fountain.pts);
      v.update = (t, a) => {
        tube.scale.set(rad * a, rad * a, h * a);
        dome.position.z = h * a;
        const pulse = 1 + Math.sin(t * 5) * 0.08;
        dome.scale.set(rad * 1.5 * a * pulse, rad * 1.5 * a * pulse, rad * 1.1 * a * pulse);
        fountain.uniforms.uH.value = h * a;
        fountain.uniforms.uAlpha.value = a;
        this.uWater.uAlpha.value = a;
      };
    } else if (flow === 'frozen') {
      const mat = this.iceMaterial(mix(tk.ice, tk.frost, 0.5), 0.92, 0, 'frozen');
      const prisms: { mesh: THREE.Mesh; r: number; h: number; d: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const mesh = new THREE.Mesh(this.geo.lathe, mat);
        const a = r() * Math.PI * 2;
        const off = i === 0 ? 0 : 4 + r() * 9;
        mesh.position.set(Math.cos(a) * off, Math.sin(a) * off, 0);
        mesh.rotation.set(Math.sin(a) * -0.5 * (off / 13), Math.cos(a) * 0.5 * (off / 13), r() * Math.PI);
        mesh.renderOrder = 5;
        group.add(mesh);
        prisms.push({ mesh, r: i === 0 ? 6 : 2.6 + r() * 3.2, h: i === 0 ? 54 : 16 + r() * 30, d: i * 0.06 });
      }
      const sparks = pts(DRIFT_VERT, 44, (_i, p, q) => {
        const a = r() * Math.PI * 2;
        const d = 6 + r() * 30;
        p[0] = Math.cos(a) * d;
        p[1] = Math.sin(a) * d;
        p[2] = 4 + r() * 50;
        p[3] = r();
        q[0] = 2 + r() * 3;
        q[1] = 0.5 + r();
      }, { uRise: { value: 10 }, uTwinkle: { value: 1 } });
      (sparks.uniforms.uColor.value as THREE.Color).set(tk.snow);
      group.add(sparks.pts);
      v.update = (_t, a) => {
        for (const p of prisms) {
          const gr = easeOutBack((a - p.d) / (1 - p.d * 0.5));
          p.mesh.scale.set(p.r * Math.min(1, gr * 1.4), p.r * Math.min(1, gr * 1.4), Math.max(0.001, p.h * gr));
        }
        sparks.uniforms.uAlpha.value = a;
        mat.uniforms.uAlpha.value = 0.92 * clamp01(a * 2);
      };
    } else if (flow === 'dry') {
      const dust = pts(DRIFT_VERT, 46, (_i, p, q) => {
        const a = r() * Math.PI * 2;
        const d = 4 + r() * 60;
        p[0] = Math.cos(a) * d;
        p[1] = Math.sin(a) * d;
        p[2] = r() * 6;
        p[3] = r();
        q[0] = 2 + r() * 2.5;
        q[1] = 0.3 + r() * 0.5;
      }, { uRise: { value: 34 }, uTwinkle: { value: 0 } });
      (dust.uniforms.uColor.value as THREE.Color).set(mix(tk.ochre, tk.slate, 0.5));
      const stones: THREE.Mesh[] = [];
      const mat = this.iceMaterial(mix(tk.slate, tk.ink, 0.25), 0.95);
      for (let i = 0; i < 7; i++) {
        const st = new THREE.Mesh(this.geo.ball, mat);
        const a = r() * Math.PI * 2;
        const d = 9 + r() * 12;
        st.position.set(Math.cos(a) * d, Math.sin(a) * d, 0);
        st.userData.s = [3 + r() * 3, 2.5 + r() * 2.5, 1.5 + r() * 1.5];
        st.renderOrder = 5;
        stones.push(st);
        group.add(st);
      }
      group.add(dust.pts);
      v.update = (_t, a) => {
        dust.uniforms.uAlpha.value = a * 0.8;
        for (const st of stones) {
          const [x, y, z] = st.userData.s as number[];
          st.scale.set(x * a, y * a, z * a);
        }
      };
    } else {
      const orb = new THREE.Mesh(this.geo.ball, this.iceMaterial(mix(tk.ice, tk.slate, 0.4), 0.55));
      orb.renderOrder = 5;
      const core = new THREE.Mesh(this.geo.ball, this.iceMaterial(tk.snow, 0.5));
      core.renderOrder = 6;
      const mist = pts(DRIFT_VERT, 40, (_i, p, q) => {
        const a = r() * Math.PI * 2;
        const d = r() * 26;
        p[0] = Math.cos(a) * d;
        p[1] = Math.sin(a) * d;
        p[2] = r() * 10;
        p[3] = r();
        q[0] = 5 + r() * 6;
        q[1] = 0.25 + r() * 0.4;
      }, { uRise: { value: 30 }, uTwinkle: { value: 0 } });
      (mist.uniforms.uColor.value as THREE.Color).set(mix(tk.ice, tk.frost, 0.5));
      group.add(orb, core, mist.pts);
      v.update = (t, a) => {
        const p = 1 + Math.sin(t * 1.6) * 0.07;
        orb.position.z = 16 + Math.sin(t * 1.1) * 2;
        core.position.z = orb.position.z;
        orb.scale.setScalar(9 * a * p);
        core.scale.setScalar(3.5 * a * (2 - p));
        mist.uniforms.uAlpha.value = a * 0.45;
      };
    }
    return v;
  }
}
