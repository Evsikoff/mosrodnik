import { useEffect, useState } from 'react';

export interface FxItem {
  id: number;
  kind: 'crystal' | 'drop';
  x: number;
  y: number;
}

let crystalSvg: string | null = null;

/** Эффекты поверх карты: кристалл на замёрзшем роднике и капля при отметке «Я был здесь». */
export default function Fx({ items }: { items: FxItem[] }) {
  const [svg, setSvg] = useState(crystalSvg);
  useEffect(() => {
    if (crystalSvg || !items.some((i) => i.kind === 'crystal')) return;
    fetch('/effects/ice-crystal.svg')
      .then((r) => r.text())
      .then((t) => {
        crystalSvg = t;
        setSvg(t);
      })
      .catch(() => {});
  }, [items]);

  return (
    <div className="fx-layer" aria-hidden="true">
      {items.map((i) =>
        i.kind === 'crystal' ? (
          svg && <div key={i.id} className="crystal" style={{ left: i.x, top: i.y }} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div key={i.id}>
            <div className="drop" style={{ left: i.x, top: i.y }} />
            <div className="ring" style={{ left: i.x, top: i.y }} />
          </div>
        ),
      )}
    </div>
  );
}
