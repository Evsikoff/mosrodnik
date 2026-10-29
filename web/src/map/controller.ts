import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import bbox from '@turf/bbox';
import type { SpringFeature } from '../types';
import type { Theme } from '../theme';
import type { SceneMode, SceneSpring, SpringScene, StageEls } from '../scene/SpringScene';
import { springTitle } from '../labels';
import { loadStyle, paintFor, paletteFor, readTokens, mix } from './style';

maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MARKER_MIN_ZOOM = 11;
/** Если в выборке не больше стольких родников, кластеры не нужны: маркеры видны на любом зуме. */
const CLUSTER_THRESHOLD = 60;
const MARKER_LAYERS = ['springs-glow', 'springs-pulse', 'springs-halo', 'springs-frost', 'springs-shape', 'springs-state'];
const CLUSTER_LAYERS = ['cluster-glow', 'cluster-circle', 'cluster-count'];
const SHAPE_SVG: Record<string, string> = {
  exceed: '/markers/status-exceed.svg', ok: '/markers/status-ok.svg', not_sampled: '/markers/status-not-sampled.svg',
};
const STATUS_SHORT: Record<string, string> = {
  exceed: 'превышения по химии', ok: 'превышений нет', not_sampled: 'пробы не отбирались',
};
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ESC[c]);
const SRC = 'springs';
const SRC_CLUSTER = 'springs-cluster';
const IMAGES = [
  'frost-1', 'frost-2', 'frost-3', 'selected-halo', 'state-dry', 'state-flowing', 'state-frozen',
  'state-unknown', 'state-weak', 'status-exceed', 'status-not-sampled', 'status-ok', 'me',
];

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export interface MapHandlers {
  onSelect(slug: string): void;
  onZoom(zoom: number): void;
  onReady(): void;
  onPick(lonlat: { lon: number; lat: number }): void;
}

/** Размер маркера: интерполяция по зуму, внутри каждого значения множитель sz (анимация появления). */
const sized = (a: number, b: number): any => [
  'interpolate', ['linear'], ['zoom'],
  8, ['*', a * 0.7, ['get', 'sz']],
  MARKER_MIN_ZOOM, ['*', a, ['get', 'sz']],
  16, ['*', b, ['get', 'sz']],
];
const hiddenState: any = ['boolean', ['feature-state', 'hidden'], false];

export class MapController {
  map!: MlMap;
  private features: SpringFeature[] = [];
  private visible = new Set<string>();
  private sz = new Map<string, number>();
  private loaded = false;
  private theme: Theme;
  private selected: string | null = null;
  private pickMode = false;
  private pickMarker: maplibregl.Marker | null = null;
  private animRaf = 0;
  private animToken = 0;
  private pulseActive = true;
  private rm = reducedMotion();
  private hasFlowing = false;
  private scenePromise: Promise<SpringScene> | null = null;
  private loadedPromise: Promise<void>;
  private resolveLoaded!: () => void;
  private tag: maplibregl.Marker | null = null;
  private tagSlug: string | null = null;
  private intro: boolean;

  constructor(private container: HTMLElement, theme: Theme, private h: MapHandlers, opts: { intro?: boolean } = {}) {
    this.theme = theme;
    this.intro = !!opts.intro && !this.rm;
    this.loadedPromise = new Promise((r) => (this.resolveLoaded = r));
  }

  async init() {
    const style = await loadStyle(this.theme);
    this.map = new maplibregl.Map({
      container: this.container,
      style,
      // Вступление: камера начинает низко над югом Москвы и пролетает к обзору всех родников.
      ...(this.intro
        ? { center: [37.58, 55.5] as [number, number], zoom: 8.6, pitch: 62, bearing: -34 }
        : { center: [37.62, 55.75] as [number, number], zoom: 9.6 }),
      maxPitch: 72,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.on('zoom', () => this.h.onZoom(this.map.getZoom()));
    // Дымка у горизонта: чем сильнее наклон, тем гуще (переменная читается в CSS).
    const wrap = this.container.parentElement;
    const haze = () => wrap?.style.setProperty('--haze', (Math.max(0, this.map.getPitch() - 20) / 45).toFixed(3));
    this.map.on('pitch', haze);
    haze();
    this.map.on('error', (e) => console.warn('[map]', e.error?.message ?? e));
    this.map.on('load', () => this.onLoad());
    document.addEventListener('visibilitychange', () => {
      this.pulseActive = !document.hidden;
      if (this.pulseActive) this.map.triggerRepaint();
    });
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.rm = e.matches;
    });
  }

  private async onLoad() {
    const map = this.map;
    await Promise.all(
      IMAGES.map(async (name) => {
        const img = await map.loadImage(`/markers/png@2x/${name}.png`);
        if (!map.hasImage(name)) map.addImage(name, img.data, { pixelRatio: 2 });
      }),
    );
    this.addPulseImage();

    map.addSource(SRC, { type: 'geojson', data: this.collection(), promoteId: 'slug' });
    map.addSource(SRC_CLUSTER, {
      type: 'geojson', data: this.collection(true), cluster: true, clusterRadius: 46, clusterMaxZoom: MARKER_MIN_ZOOM - 1,
    });

    const tk = readTokens();
    const pal = paletteFor(this.theme, tk);
    // Кластеры на мелких зумах: мягкое свечение, стеклянный круг и число
    map.addLayer({
      id: 'cluster-glow', type: 'circle', source: SRC_CLUSTER, maxzoom: MARKER_MIN_ZOOM, filter: ['has', 'point_count'],
      paint: {
        'circle-color': tk.ice, 'circle-blur': 0.85, 'circle-opacity': this.theme === 'night' ? 0.7 : 0.55,
        'circle-radius': ['step', ['get', 'point_count'], 26, 10, 32, 30, 40, 80, 50],
      },
    });
    map.addLayer({
      id: 'cluster-circle', type: 'circle', source: SRC_CLUSTER, maxzoom: MARKER_MIN_ZOOM, filter: ['has', 'point_count'],
      paint: {
        'circle-color': mix(tk.ice, tk.snow, 0.15), 'circle-stroke-color': tk.ink, 'circle-stroke-width': 1.5,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 24, 80, 30],
      },
    });
    map.addLayer({
      id: 'cluster-count', type: 'symbol', source: SRC_CLUSTER, maxzoom: MARKER_MIN_ZOOM, filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': tk.ink },
    });
    // Свечение маркеров ночью
    map.addLayer({
      id: 'springs-glow', type: 'circle', source: SRC, minzoom: MARKER_MIN_ZOOM,
      paint: {
        'circle-radius': 20, 'circle-blur': 1, 'circle-color': tk.ice,
        'circle-opacity': ['case', hiddenState, 0, pal.glow],
        'circle-opacity-transition': { duration: 300 },
      },
    });
    // Круги на воде у текущих родников
    map.addLayer({
      id: 'springs-pulse', type: 'symbol', source: SRC, minzoom: MARKER_MIN_ZOOM, filter: ['==', ['get', 'user_flow'], 'flowing'],
      layout: {
        'icon-image': 'pulse-rings', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], MARKER_MIN_ZOOM, 0.45, 16, 0.8],
      },
      paint: { 'icon-opacity': ['case', hiddenState, 0, 1], 'icon-opacity-transition': { duration: 300 } },
    });
    const common = { 'icon-allow-overlap': true, 'icon-ignore-placement': true };
    const fade = { 'icon-opacity': ['case', hiddenState, 0, 1], 'icon-opacity-transition': { duration: 300 } } as any;
    map.addLayer({
      id: 'springs-halo', type: 'symbol', source: SRC, minzoom: MARKER_MIN_ZOOM - 1, filter: ['==', ['get', 'slug'], ''],
      layout: { 'icon-image': 'selected-halo', ...common, 'icon-size': sized(0.62, 0.95) }, paint: fade,
    });
    map.addLayer({
      id: 'springs-frost', type: 'symbol', source: SRC, minzoom: MARKER_MIN_ZOOM, filter: ['>', ['get', 'frost_level'], 0],
      layout: { 'icon-image': ['concat', 'frost-', ['to-string', ['get', 'frost_level']]], ...common, 'icon-size': sized(0.5, 0.8) },
      paint: fade,
    });
    map.addLayer({
      id: 'springs-shape', type: 'symbol', source: SRC, minzoom: MARKER_MIN_ZOOM,
      layout: {
        'icon-image': ['match', ['get', 'status'], 'exceed', 'status-exceed', 'ok', 'status-ok', 'status-not-sampled'],
        ...common, 'icon-size': sized(0.5, 0.8),
      },
      paint: fade,
    });
    map.addLayer({
      id: 'springs-state', type: 'symbol', source: SRC, minzoom: MARKER_MIN_ZOOM,
      layout: {
        'icon-image': ['concat', 'state-', ['get', 'user_flow']], ...common,
        'icon-size': sized(0.5, 0.8), 'icon-offset': [18, -18],
      },
      paint: fade,
    });

    void this.addWaterways();
    this.bindEvents();
    this.loaded = true;
    this.applyVisibility(this.visible, false);
    this.setSelected(this.selected);
    this.resolveLoaded();
    this.h.onReady();
  }

  /** Течение рек: бегущий пунктир по направлению линии, только на средних зумах. */
  private async addWaterways() {
    const map = this.map;
    let data: any;
    try {
      data = await (await fetch('/api/waterways')).json();
    } catch {
      return;
    }
    if (!data?.features?.length || !map.getLayer('springs-glow')) return;
    map.addSource('waterways', { type: 'geojson', data });
    const pal = paletteFor(this.theme, readTokens());
    map.addLayer(
      {
        id: 'waterways-flow', type: 'line', source: 'waterways', minzoom: 9, maxzoom: 14.5,
        layout: { 'line-cap': 'butt' },
        paint: {
          'line-color': pal.waterLine, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3],
        },
      },
      'springs-glow',
    );
    if (this.rm) return;
    const seq = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ];
    let step = -1;
    let last = 0;
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      if (document.hidden || this.rm || now - last < 90) return;
      const z = map.getZoom();
      if (z < 9 || z > 14.5) return;
      last = now;
      const next = Math.floor(now / 90) % seq.length;
      if (next === step) return;
      step = next;
      map.setPaintProperty('waterways-flow', 'line-dasharray', seq[step]);
    };
    requestAnimationFrame(tick);
  }

  private bindEvents() {
    const map = this.map;
    map.on('click', (e) => {
      if (this.pickMode) {
        this.placePick(e.lngLat.lng, e.lngLat.lat);
        return;
      }
      const hit = map
        .queryRenderedFeatures(e.point, { layers: ['springs-shape'] })
        .find((f) => this.visible.has(String(f.properties?.slug)));
      if (hit) {
        this.h.onSelect(String(hit.properties!.slug));
        return;
      }
      const cl = map.queryRenderedFeatures(e.point, { layers: ['cluster-circle'] })[0];
      if (cl) {
        const src = map.getSource(SRC_CLUSTER) as GeoJSONSource;
        void src.getClusterExpansionZoom(cl.properties!.cluster_id).then((zoom) => {
          map.easeTo({ center: (cl.geometry as any).coordinates, zoom: zoom + 0.2, duration: this.rm ? 0 : 500 });
        });
      }
    });
    map.on('mousemove', 'springs-shape', (e) => {
      const f = e.features?.find((x) => this.visible.has(String(x.properties?.slug)));
      this.hover(f ? String(f.properties!.slug) : null);
    });
    map.on('mouseleave', 'springs-shape', () => this.hover(null));
    const pointer = (on: boolean) => () => (map.getCanvas().style.cursor = on || this.pickMode ? 'pointer' : '');
    for (const l of ['springs-shape', 'cluster-circle']) {
      map.on('mouseenter', l, pointer(true));
      map.on('mouseleave', l, pointer(false));
    }
  }

  // ---------- данные ----------

  private collection(onlyVisible = false) {
    return {
      type: 'FeatureCollection' as const,
      features: this.features
        .filter((f) => !onlyVisible || this.visible.has(f.properties.slug))
        .map((f) => ({ ...f, properties: { ...f.properties, sz: this.sz.get(f.properties.slug) ?? 1 } })),
    };
  }

  setFeatures(features: SpringFeature[]) {
    this.features = features;
    this.hasFlowing = features.some((f) => f.properties.user_flow === 'flowing');
    if (!this.loaded) return;
    (this.map.getSource(SRC) as GeoJSONSource).setData(this.collection());
    (this.map.getSource(SRC_CLUSTER) as GeoJSONSource).setData(this.collection(true));
  }

  /** Анимированная смена выборки: выпавшие сжимаются и гаснут, попавшие всплывают. */
  setVisible(next: Set<string>, animate = true) {
    this.applyVisibility(next, animate);
  }

  private applyVisibility(next: Set<string>, animate: boolean) {
    const prev = this.visible;
    this.visible = next;
    if (!this.loaded) return;
    const leaving: string[] = [];
    const entering: string[] = [];
    for (const f of this.features) {
      const s = f.properties.slug;
      const was = prev.has(s);
      const now = next.has(s);
      if (was && !now) leaving.push(s);
      if (!was && now) entering.push(s);
      this.map.setFeatureState({ source: SRC, id: s }, { hidden: !now });
    }
    (this.map.getSource(SRC_CLUSTER) as GeoJSONSource).setData(this.collection(true));
    this.updateClusterMode();
    this.map.setPaintProperty('springs-glow', 'circle-opacity-transition', { duration: this.rm ? 0 : 300 });
    for (const id of ['springs-halo', 'springs-frost', 'springs-shape', 'springs-state', 'springs-pulse']) {
      this.map.setPaintProperty(id, 'icon-opacity-transition', { duration: this.rm || !animate ? 0 : 300 });
    }
    if (!animate || this.rm || (!leaving.length && !entering.length)) {
      this.sz.clear();
      return;
    }
    this.animateSizes(leaving, entering);
  }

  private updateClusterMode() {
    const clustered = this.visible.size > CLUSTER_THRESHOLD;
    for (const id of MARKER_LAYERS) this.map.setLayerZoomRange(id, clustered ? (id === 'springs-halo' ? MARKER_MIN_ZOOM - 1 : MARKER_MIN_ZOOM) : 0, 24);
    for (const id of CLUSTER_LAYERS) {
      this.map.setLayoutProperty(id, 'visibility', clustered ? 'visible' : 'none');
    }
  }

  private animateSizes(leaving: string[], entering: string[]) {
    cancelAnimationFrame(this.animRaf);
    const token = ++this.animToken;
    const t0 = performance.now();
    const DUR = 300;
    const src = this.map.getSource(SRC) as GeoJSONSource;
    const tick = (now: number) => {
      if (token !== this.animToken) return;
      const t = Math.min(1, (now - t0) / DUR);
      for (const s of leaving) this.sz.set(s, 1 - 0.65 * easeOutCubic(t));
      for (const s of entering) this.sz.set(s, 0.55 + 0.45 * easeOutBack(t));
      src.setData(this.collection());
      if (t < 1) this.animRaf = requestAnimationFrame(tick);
      else {
        this.sz.clear();
        src.setData(this.collection());
      }
    };
    this.animRaf = requestAnimationFrame(tick);
  }

  setSelected(slug: string | null) {
    this.selected = slug;
    if (slug && slug === this.tagSlug) this.hover(null);
    if (!this.loaded) return;
    this.map.setFilter('springs-halo', ['==', ['get', 'slug'], slug ?? '']);
  }

  /** Обновить агрегаты одного родника после отметки/фото, не пересоздавая слои. */
  updateFeature(f: SpringFeature) {
    const i = this.features.findIndex((x) => x.properties.slug === f.properties.slug);
    if (i >= 0) this.features[i] = f;
    this.setFeatures(this.features);
  }

  // ---------- камера ----------

  fit(features: SpringFeature[], padding: maplibregl.PaddingOptions | number = 60, maxZoom = 15.5) {
    if (!this.loaded || !features.length) return;
    const [w, s, e, n] = bbox({ type: 'FeatureCollection', features: features as any });
    const first = this.intro;
    this.intro = false;
    // absolutePadding: отступ карты (после пролёта к 3D-карточке он большой сверху) плавно заменяется этим.
    this.map.fitBounds([[w, s], [e, n]], {
      padding, absolutePadding: true, duration: this.rm ? 0 : first ? 2800 : 900,
      maxZoom: features.length === 1 ? 14 : maxZoom, pitch: 0, bearing: 0, essential: false,
      ...(first ? { easing: (t: number) => 1 - Math.pow(1 - t, 3) } : {}),
    });
  }

  /** Пролёт к роднику. Для 3D-карточки родник опускается вниз кадра, над ним остаётся место для панелей. */
  fly(f: SpringFeature, padding: maplibregl.PaddingOptions | number = 0, stage = false) {
    if (!this.map) return;
    const H = this.container.clientHeight;
    const pad = stage ? { top: Math.round(H * 0.6), bottom: 0, left: 0, right: 0 } : padding;
    this.map.flyTo({
      center: f.geometry.coordinates, zoom: stage ? 16.6 : 16, pitch: stage ? 58 : 55,
      bearing: this.map.getBearing() + 18, duration: this.rm ? 0 : 1200, padding: pad, essential: false,
    });
  }

  // ---------- 3D-сцена над родником (three.js грузится только при первом открытии карточки) ----------

  scene(): Promise<SpringScene> {
    if (!this.scenePromise) {
      this.scenePromise = this.loadedPromise
        .then(() => import('../scene/SpringScene'))
        .then(({ SpringScene }) => {
          const sc = new SpringScene(this.theme);
          this.map.addLayer(sc, 'springs-glow');
          return sc;
        });
    }
    return this.scenePromise;
  }

  showScene(s: SceneSpring, mode: SceneMode) {
    void this.scene().then((sc) => sc.show(s, mode)).catch((e) => console.warn('[scene]', e));
  }

  hideScene(done: () => void) {
    if (!this.scenePromise) {
      done();
      return;
    }
    void this.scenePromise.then((sc) => sc.hide(done)).catch(done);
  }

  attachStage(els: StageEls | null) {
    if (!els && !this.scenePromise) return;
    void this.scene().then((sc) => sc.attach(els));
  }

  foldScene(on: boolean) {
    void this.scenePromise?.then((sc) => sc.fold(on));
  }

  sceneFx(kind: 'drop' | 'crystal'): boolean {
    if (!this.scenePromise) return false;
    void this.scenePromise.then((sc) => sc.fx(kind));
    return true;
  }

  // ---------- подпись при наведении ----------

  hover(slug: string | null) {
    if (slug === this.tagSlug || !this.loaded) return;
    this.tagSlug = slug;
    // Наведение — сигнал, что скоро откроют карточку: заранее подгружаем код 3D-сцены.
    if (slug && !this.scenePromise) void import('../scene/SpringScene').catch(() => {});
    const f = slug ? this.features.find((x) => x.properties.slug === slug) : undefined;
    if (!f || slug === this.selected || !this.visible.has(slug!)) {
      this.tag?.getElement().classList.remove('on');
      return;
    }
    if (!this.tag) {
      const el = document.createElement('div');
      el.className = 'map-tag';
      el.setAttribute('aria-hidden', 'true');
      this.tag = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -18] });
      this.tag.setLngLat(f.geometry.coordinates).addTo(this.map);
    }
    const p = f.properties;
    const el = this.tag.getElement();
    el.innerHTML = `<div class="map-tag-in"><img src="${SHAPE_SVG[p.status]}" alt=""><span><b>${esc(springTitle(p))}</b>`
      + `<small>${esc(p.district)} · ${STATUS_SHORT[p.status]}</small></span></div>`;
    this.tag.setLngLat(f.geometry.coordinates);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  projectToWindow(lon: number, lat: number): { x: number; y: number } {
    const p = this.map.project([lon, lat]);
    const r = this.container.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  getZoom() {
    return this.map.getZoom();
  }
  resize() {
    this.map?.resize();
  }

  // ---------- выбор точки ----------

  startPick(initial?: { lon: number; lat: number }) {
    this.pickMode = true;
    this.map.getCanvas().style.cursor = 'crosshair';
    if (initial) this.placePick(initial.lon, initial.lat, false);
  }

  stopPick() {
    this.pickMode = false;
    this.map.getCanvas().style.cursor = '';
    this.pickMarker?.remove();
    this.pickMarker = null;
  }

  private placePick(lon: number, lat: number, notify = true) {
    if (!this.pickMarker) {
      const el = document.createElement('img');
      el.src = '/markers/me.svg';
      el.alt = 'Указанная точка';
      el.style.cssText = 'width:44px;height:44px;cursor:grab';
      this.pickMarker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lon, lat]).addTo(this.map);
      this.pickMarker.on('dragend', () => {
        const p = this.pickMarker!.getLngLat();
        this.h.onPick({ lon: p.lng, lat: p.lat });
      });
    } else {
      this.pickMarker.setLngLat([lon, lat]);
    }
    if (notify) this.h.onPick({ lon, lat });
  }

  // ---------- тема ----------

  setTheme(theme: Theme) {
    this.theme = theme;
    if (!this.loaded) return;
    const pal = paletteFor(theme, readTokens());
    for (const layer of this.map.getStyle().layers) {
      if (layer.id.startsWith('springs') || layer.id.startsWith('cluster')) continue;
      for (const [prop, val] of Object.entries(paintFor(layer, pal))) {
        this.map.setPaintProperty(layer.id, prop as any, val);
      }
    }
    this.map.setPaintProperty('springs-glow', 'circle-opacity', ['case', hiddenState, 0, pal.glow]);
    this.map.setPaintProperty('cluster-glow', 'circle-opacity', theme === 'night' ? 0.7 : 0.55);
    void this.scenePromise?.then((sc) => sc.setTheme(theme));
  }

  // ---------- круги на воде ----------

  private addPulseImage() {
    const map = this.map;
    const size = 120;
    const ice = readTokens().ice;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ice.slice(i, i + 2), 16));
    const self = this;
    const img: any = {
      width: size, height: size, data: new Uint8Array(size * size * 4), context: null as CanvasRenderingContext2D | null,
      onAdd() {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        this.context = c.getContext('2d');
      },
      render() {
        const ctx = this.context as CanvasRenderingContext2D;
        const t = self.rm ? 0.5 : (performance.now() % 3000) / 3000;
        ctx.clearRect(0, 0, size, size);
        for (let i = 0; i < 3; i++) {
          const k = (t + i / 3) % 1;
          const radius = 12 + k * 46;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - k) * 0.9})`;
          ctx.lineWidth = 3 * (1 - k * 0.5);
          ctx.stroke();
        }
        this.data = new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
        if (!self.rm && self.pulseActive && self.hasFlowing && map.getZoom() >= MARKER_MIN_ZOOM) map.triggerRepaint();
        return true;
      },
    };
    map.addImage('pulse-rings', img, { pixelRatio: 2 });
  }

  destroy() {
    cancelAnimationFrame(this.animRaf);
    this.map?.remove();
  }
}
