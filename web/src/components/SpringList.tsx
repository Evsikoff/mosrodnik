import type { SpringFeature } from '../types';
import { FLOW_LABEL, springTitle, plural } from '../labels';

const SHAPE: Record<string, string> = {
  exceed: '/markers/status-exceed.svg', ok: '/markers/status-ok.svg', not_sampled: '/markers/status-not-sampled.svg',
};
const STATUS_SHORT: Record<string, string> = {
  exceed: 'превышения', ok: 'превышений нет', not_sampled: 'пробы не отбирались',
};

export function Summary({ shown, total, features }: { shown: number; total: number; features: SpringFeature[] }) {
  const c = { exceed: 0, ok: 0, not_sampled: 0 };
  let never = 0;
  for (const f of features) {
    c[f.properties.status]++;
    if (f.properties.never_sampled) never++;
  }
  return (
    <div className="summary" aria-live="polite">
      <b>Показано {shown} из {total}</b>
      <span className="sub">
        превышения {c.exceed} · нет {c.ok} · без проб {c.not_sampled}
        {never > 0 ? ` · ни разу ${never}` : ''}
      </span>
    </div>
  );
}

interface Props {
  features: SpringFeature[];
  selected?: string | null;
  onOpen(slug: string): void;
  onHover?(slug: string | null): void;
}

export default function SpringList({ features, selected, onOpen, onHover }: Props) {
  return (
    <ul className="list">
      {features.map((f) => {
        const p = f.properties;
        return (
          <li key={p.slug}>
            <button
              className="row" onClick={() => onOpen(p.slug)} aria-current={p.slug === selected ? 'true' : undefined}
              onMouseEnter={() => onHover?.(p.slug)} onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(p.slug)} onBlur={() => onHover?.(null)}
            >
              <img className="mk" src={SHAPE[p.status]} alt="" />
              <span>
                <span className="t">{springTitle(p)}</span>
                <span className="s">
                  {p.adm_area}, {p.district.replace(/^район /, '')} · {STATUS_SHORT[p.status]}
                  {p.last_sample_year ? `, проба ${p.last_sample_year}` : ''}
                </span>
              </span>
              <span className="badges">
                {p.user_flow !== 'unknown' && (
                  <img src={`/markers/state-${p.user_flow}.svg`} alt={FLOW_LABEL[p.user_flow]} title={FLOW_LABEL[p.user_flow]} />
                )}
                {p.photos_count > 0 && (
                  <span className="s" title="Есть фото">{p.photos_count} {plural(p.photos_count, 'фото', 'фото', 'фото')}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
