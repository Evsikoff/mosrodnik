import { Search, X } from 'lucide-react';
import type { Filters, SpringFeature } from '../types';
import {
  ADM_OPTIONS, AGE_OPTIONS, FLOW_OPTIONS, STATUS_OPTIONS, EMPTY_FILTERS, facetCounts, hasFilters,
} from '../filters';

interface Props {
  all: SpringFeature[];
  filters: Filters;
  mine: Set<string>;
  onChange(f: Filters): void;
}

const SHAPE: Record<string, string> = {
  exceed: '/markers/status-exceed.svg', ok: '/markers/status-ok.svg', not_sampled: '/markers/status-not-sampled.svg',
};
const STATE: Record<string, string> = {
  flowing: '/markers/state-flowing.svg', weak: '/markers/state-weak.svg', frozen: '/markers/state-frozen.svg',
  dry: '/markers/state-dry.svg', unknown: '/markers/state-unknown.svg',
};

export function SearchBox({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <div className="search" role="search">
      <Search className="icon icon-l" size={18} aria-hidden />
      <input
        type="search" value={value} placeholder="Название, район, описание места"
        aria-label="Поиск родника" onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="clear" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default function FilterPanel({ all, filters, mine, onChange }: Props) {
  const counts = facetCounts(all, filters, mine);
  const toggle = (key: 'status' | 'age' | 'flow' | 'adm', id: string) => {
    const cur = filters[key];
    onChange({ ...filters, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const group = (
    title: string, key: 'status' | 'age' | 'flow' | 'adm', options: { id: string; label: string }[],
    icons?: Record<string, string>,
  ) => (
    <div className="fgroup" role="group" aria-label={title}>
      <h3>{title}</h3>
      <div className="chips">
        {options.map((o) => {
          const n = (counts[key] as Record<string, number>)[o.id] ?? 0;
          const on = filters[key].includes(o.id);
          return (
            <button
              key={o.id} className={`chip${n === 0 ? ' zero' : ''}`} aria-pressed={on} onClick={() => toggle(key, o.id)}
            >
              {icons?.[o.id] && <img className="shape" src={icons[o.id]} alt="" />}
              {o.label} <span className="n">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="filters">
      {group('Результат анализа', 'status', STATUS_OPTIONS, SHAPE)}
      {group('Давность анализа', 'age', AGE_OPTIONS)}
      {group('Состояние по отметкам жителей', 'flow', FLOW_OPTIONS, STATE)}
      {group('Округ', 'adm', ADM_OPTIONS)}
      <div className="chips">
        <button className={`chip${counts.photo === 0 ? ' zero' : ''}`} aria-pressed={filters.photo}
          onClick={() => onChange({ ...filters, photo: !filters.photo })}>
          Только с фото <span className="n">{counts.photo}</span>
        </button>
        <button className={`chip${counts.mine === 0 ? ' zero' : ''}`} aria-pressed={filters.mine}
          onClick={() => onChange({ ...filters, mine: !filters.mine })}>
          Мои родники <span className="n">{counts.mine}</span>
        </button>
        {hasFilters(filters) && (
          <button className="link-btn reset" onClick={() => onChange({ ...EMPTY_FILTERS })}>Сбросить</button>
        )}
      </div>
    </div>
  );
}
