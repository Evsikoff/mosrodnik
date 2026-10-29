import { useEffect, useRef } from 'react';

interface Flake {
  x: number; y: number; size: number; vy: number; sway: number; phase: number; sprite: number;
  rot: number; vrot: number; alpha: number; target: number;
}

const MAX_FLAKES = 110;

/** Плотность по зуму: максимум на зуме <= 11, к зуму 14 снег исчезает. */
export function snowDensity(zoom: number) {
  if (zoom <= 11) return 1;
  if (zoom >= 14) return 0;
  return 1 - (zoom - 11) / 3;
}

interface Props {
  zoomRef: { current: number };
  /** При открытой карточке плотность вдвое меньше. */
  halved: boolean;
}

export default function Snow({ zoomRef, halved }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const halvedRef = useRef(halved);
  halvedRef.current = halved;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;
    const ctx = el.getContext('2d')!;
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    const sprites = [1, 2, 3, 4, 5].map((n) => {
      const img = new Image();
      img.src = `/effects/snowflake-${n}.svg`;
      return img;
    });
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const flakes: Flake[] = [];
    const spawn = (anywhere: boolean): Flake => ({
      x: Math.random() * w, y: anywhere ? Math.random() * h : -20, size: 7 + Math.random() * 13,
      vy: 22 + Math.random() * 38, sway: 8 + Math.random() * 18, phase: Math.random() * Math.PI * 2,
      sprite: Math.floor(Math.random() * 5), rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.8,
      alpha: 0, target: 0.55 + Math.random() * 0.4,
    });

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const density = snowDensity(zoomRef.current) * (halvedRef.current ? 0.5 : 1) * (weak ? 0.5 : 1);
      const want = Math.round(MAX_FLAKES * density);
      while (flakes.length < want) flakes.push(spawn(true));
      ctx.clearRect(0, 0, w, h);
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        const excess = i >= want;
        f.y += f.vy * dt;
        f.phase += dt * 1.2;
        f.rot += f.vrot * dt;
        f.alpha += ((excess ? 0 : f.target) - f.alpha) * Math.min(1, dt * 2.5);
        if (excess && f.alpha < 0.02) {
          flakes.splice(i, 1);
          continue;
        }
        if (f.y > h + 20) {
          Object.assign(f, spawn(false), { alpha: f.alpha });
        }
        const x = f.x + Math.sin(f.phase) * f.sway;
        const img = sprites[f.sprite];
        if (!img.complete || !img.naturalWidth) continue;
        ctx.globalAlpha = f.alpha;
        ctx.save();
        ctx.translate(x, f.y);
        ctx.rotate(f.rot);
        ctx.drawImage(img, -f.size / 2, -f.size / 2, f.size, f.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [zoomRef]);

  return <canvas ref={canvas} className="snow" aria-hidden="true" />;
}
