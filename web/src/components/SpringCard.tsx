import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, Droplet, Eye, EyeOff, MapPin, Navigation, Share2, SquarePen, X,
} from 'lucide-react';
import { api, ApiError } from '../api';
import type { Observation, SpringDetail, SpringFeature, SpringProps, Status, User } from '../types';
import {
  ACCESS_LABEL, CLEAN_LABEL, FLOW_LABEL, KIND_LABEL, STATUS_LABEL, SEASON_LABEL, ago, cardIllustration, obsText,
  routeUrl, springTitle,
} from '../labels';
import type { StageEls } from '../scene/SpringScene';
import MarkDialog from './MarkDialog';

const SHAPE: Record<string, string> = {
  exceed: '/markers/status-exceed.svg', ok: '/markers/status-ok.svg', not_sampled: '/markers/status-not-sampled.svg',
};

/** Что карточка сообщает 3D-сцене над родником. */
export interface CardScene {
  slug: string;
  status: Status;
  flow: SpringProps['user_flow'];
  frost: SpringProps['frost_level'];
  history: { year: number; status: Status }[];
  visits: number;
}

interface Props {
  slug: string;
  fallback: SpringProps;
  user: User | null;
  reloadKey: number;
  onBack(): void;
  onFeature(f: SpringFeature): void;
  onSubscribed(slug: string, on: boolean): void;
  onFx(kind: 'crystal' | 'drop'): void;
  onPickLocation(): void;
  onToast(text: string): void;
  onLightbox(src: string, caption?: string): void;
  onScene?(s: CardScene): void;
}

/** Данные и действия карточки: общие для шторки (телефон) и 3D-панелей над родником (широкий экран). */
function useCard(p: Props) {
  const { slug, fallback: fb } = p;
  const [detail, setDetail] = useState<SpringDetail | null>(null);
  const [error, setError] = useState('');
  const [markOpen, setMarkOpen] = useState(false);
  const [extraVisits, setExtraVisits] = useState(0);
  const [busy, setBusy] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setError('');
    api.spring(slug).then((d) => live && setDetail(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [slug, p.reloadKey]);

  useEffect(() => {
    setDetail(null);
    setExtraVisits(0);
  }, [slug]);

  const s = detail?.spring;
  const agg = detail?.aggregate;
  const status = s?.status ?? fb.status;
  const visits = (agg?.visits_30d ?? fb.visits_30d) + extraVisits;
  const flow = agg?.user_flow ?? fb.user_flow;
  const frost = agg?.frost_level ?? fb.frost_level;
  const historyKey = (s?.history ?? []).map((h) => `${h.year}${h.status}`).join(',');

  useEffect(() => {
    p.onScene?.({ slug, status, flow, frost, history: s?.history ?? [], visits });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, status, flow, frost, historyKey, visits]);

  const refresh = async () => {
    const d = await api.spring(slug);
    setDetail(d);
  };

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      p.onToast(e instanceof ApiError ? e.message : 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusy('');
    }
  };

  const needUser = () => {
    if (!p.user) {
      p.onToast('Сессия ещё не готова. Обновите страницу.');
      return false;
    }
    return true;
  };

  const visit = () => needUser() && run('visit', async () => {
    const r = await api.observe(slug, { kind: 'visit', value: 'visited' });
    p.onFx('drop');
    setTimeout(() => setExtraVisits((n) => n + 1), 450);
    p.onFeature(r.feature);
    await refresh();
    setExtraVisits(0);
    p.onToast('Отметили, что вы были здесь.');
  });

  const locationOk = () => needUser() && run('loc', async () => {
    const r = await api.observe(slug, { kind: 'location_check', value: 'confirmed' });
    p.onFeature(r.feature);
    await refresh();
    p.onToast('Спасибо, точка подтверждена.');
  });

  const upload = (file: File | undefined) => {
    if (!file || !needUser()) return;
    void run('photo', async () => {
      const r = await api.uploadPhoto(slug, file);
      p.onFeature(r.feature);
      await refresh();
      p.onToast('Фото добавлено.');
    });
  };

  const toggleSub = () => needUser() && run('sub', async () => {
    const on = !detail?.subscribed;
    if (on) await api.subscribe(slug);
    else await api.unsubscribe(slug);
    p.onSubscribed(slug, on);
    setDetail((d) => (d ? { ...d, subscribed: on } : d));
  });

  const share = async () => {
    const url = `${location.origin}/spring/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      p.onToast('Ссылка скопирована.');
    } catch {
      window.prompt('Скопируйте ссылку', url);
    }
  };

  const nowCells = [
    { k: 'flow', title: 'Течение', value: flow, at: agg?.user_flow_at ?? fb.user_flow_at, labels: FLOW_LABEL },
    { k: 'access', title: 'Подход', value: agg?.user_access ?? fb.user_access, at: agg?.user_access_at ?? fb.user_access_at, labels: ACCESS_LABEL },
    { k: 'clean', title: 'Чистота', value: agg?.user_cleanliness ?? fb.user_cleanliness, at: agg?.user_cleanliness_at ?? fb.user_cleanliness_at, labels: CLEAN_LABEL },
  ];

  const markDialog = markOpen && (
    <MarkDialog
      slug={slug}
      onClose={() => setMarkOpen(false)}
      onDone={async ({ values, feature }) => {
        setMarkOpen(false);
        if (feature) p.onFeature(feature);
        if (values.flow === 'frozen') p.onFx('crystal');
        await refresh();
        p.onToast('Спасибо, отметка сохранена.');
      }}
    />
  );

  return {
    p, detail, error, busy, photoInput, nowCells, visits, markDialog,
    title: springTitle({ name: s?.name ?? fb.name, number: s?.number ?? fb.number }),
    status,
    statusYear: s?.status_year ?? fb.status_year,
    lastSample: s?.last_sample_year ?? fb.last_sample_year,
    neverSampled: s?.never_sampled ?? fb.never_sampled,
    drift: s?.coord_drift_m ?? fb.coord_drift_m,
    lon: s?.lon,
    lat: s?.lat,
    location: s?.location ?? fb.location,
    district: s?.district ?? fb.district,
    realPhoto: detail?.photos.find((x) => !x.is_sample),
    openMark: () => needUser() && setMarkOpen(true),
    visit, locationOk, upload, toggleSub, share,
    pickLocation: () => needUser() && p.onPickLocation(),
  };
}

type Model = ReturnType<typeof useCard>;

// ---------- части карточки ----------

function Hero({ m, children }: { m: Model; children?: React.ReactNode }) {
  return (
    <div className="hero">
      <img className="bg" src={m.realPhoto ? m.realPhoto.file : cardIllustration(m.p.slug)} alt="" />
      <div className="caustics" aria-hidden="true" />
      {children}
    </div>
  );
}

function HowToFind({ m, drift = true }: { m: Model; drift?: boolean }) {
  const { lat, lon } = m;
  return (
    <>
      <p className="kv">{m.location}</p>
      {lat != null && lon != null && (
        <p className="coords"><MapPin size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> {lat.toFixed(5)}, {lon.toFixed(5)}</p>
      )}
      {lat != null && lon != null && (
        <div className="btns">
          <a className="btn" href={routeUrl(lat, lon)} target="_blank" rel="noopener noreferrer">
            <Navigation size={18} aria-hidden /> Маршрут
          </a>
        </div>
      )}
      {drift && <DriftNote m={m} />}
    </>
  );
}

function DriftNote({ m }: { m: Model }) {
  if (m.drift <= 100) return null;
  return (
    <div className="drift">
      В базе координаты этого родника в разные годы расходятся на {m.drift} м. Если вы знаете, где он находится,
      помогите уточнить точку.
    </div>
  );
}

function WaterStatus({ m }: { m: Model }) {
  return (
    <>
      <div className="status">
        <img src={SHAPE[m.status]} alt="" />
        <span>
          {STATUS_LABEL[m.status]}
          <br /><small style={{ fontWeight: 400, color: 'var(--muted)' }}>последние данные: {m.statusYear} год</small>
        </span>
      </div>
      {m.status === 'not_sampled' && (
        <div className="picto"><img src="/pictograms/never-sampled.svg" alt="" />
          <span>Пробы не отбирались{m.neverSampled ? ': за все годы в базе' : `. Последняя проба: ${m.lastSample} год`}</span></div>
      )}
      {m.status !== 'not_sampled' && m.lastSample && (
        <div className="picto"><img src="/pictograms/last-sample.svg" alt="" /><span>Последняя проба: {m.lastSample} год</span></div>
      )}
    </>
  );
}

/** Оговорки, которые показываются у любого родника. */
function Caveats() {
  return (
    <>
      <div className="picto"><img src="/pictograms/chemistry-only.svg" alt="" /><span>Анализ только по химическим показателям</span></div>
      <div className="picto"><img src="/pictograms/no-microbiology.svg" alt="" /><span>Микробиология не проверяется</span></div>
      <div className="picto strong"><img src="/pictograms/boil-water.svg" alt="" />
        <span>Роспотребнадзор рекомендует пить воду из родников только после кипячения</span></div>
    </>
  );
}

function HistoryRow({ m }: { m: Model }) {
  const h = m.detail?.spring.history ?? [];
  if (!h.length) return null;
  return (
    <div className="timeline" role="img"
      aria-label={`История анализов: ${h.map((x) => `${x.year} ${STATUS_LABEL[x.status]}`).join('; ')}`}>
      {h.map((x) => (
        <span className="y" key={x.year}><img src={SHAPE[x.status]} alt="" />{x.year}</span>
      ))}
    </div>
  );
}

function Water({ m }: { m: Model }) {
  return (
    <div className="water">
      <WaterStatus m={m} />
      <Caveats />
      <HistoryRow m={m} />
    </div>
  );
}

function NowCells({ m }: { m: Model }) {
  return (
    <>
      <div className="now">
        {m.nowCells.map((c) => (
          <div className="cell" key={c.k}>
            <small>{c.title}</small>
            <b>
              {c.k === 'flow' && c.value !== 'unknown' && <img src={`/markers/state-${c.value}.svg`} alt="" />}
              {c.value === 'unknown' ? '—' : c.labels[c.value] ?? c.value}
            </b>
            <em>{c.at ? ago(c.at) : 'Свежих отметок нет'}</em>
          </div>
        ))}
      </div>
      <p className="visits" aria-live="polite">
        Были здесь за 30 дней: <b>{m.visits}</b>
      </p>
    </>
  );
}

function Actions({ m }: { m: Model }) {
  return (
    <div className="btns">
      <button className="btn primary" onClick={m.openMark}>
        <SquarePen size={18} aria-hidden /> Отметить состояние
      </button>
      <button className="btn" disabled={m.busy === 'visit'} onClick={m.visit}>
        <Droplet size={18} aria-hidden /> Я был здесь
      </button>
      <input ref={m.photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
        onChange={(e) => { m.upload(e.target.files?.[0]); e.target.value = ''; }} />
      <button className="btn" disabled={m.busy === 'photo'} onClick={() => m.photoInput.current?.click()}>
        <Camera size={18} aria-hidden /> {m.busy === 'photo' ? 'Загружаем…' : 'Добавить фото'}
      </button>
    </div>
  );
}

function PointCheck({ m }: { m: Model }) {
  return (
    <div className={`drift${m.drift > 100 ? '' : ' mild'}`} style={{ marginTop: 0 }}>
      <b>Точка на карте верна?</b>
      <div className="btns">
        <button className="btn" disabled={m.busy === 'loc'} onClick={m.locationOk}><Check size={18} aria-hidden /> Да</button>
        <button className="btn" onClick={m.pickLocation}><X size={18} aria-hidden /> Нет, показать на карте</button>
      </div>
    </div>
  );
}

function FollowShare({ m }: { m: Model }) {
  const on = !!m.detail?.subscribed;
  return (
    <div className="btns">
      <button className={`btn${on ? ' on' : ''}`} aria-pressed={on} disabled={m.busy === 'sub'} onClick={m.toggleSub}>
        {on ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        {on ? 'Слежу за родником' : 'Следить за родником'}
      </button>
      <button className="btn" onClick={m.share}><Share2 size={18} aria-hidden /> Поделиться</button>
    </div>
  );
}

function Gallery({ m }: { m: Model }) {
  const d = m.detail;
  if (!d || !d.photos.length) return null;
  return (
    <div className="gallery">
      {d.photos.map((ph) => (
        <button key={ph.id} onClick={() => m.p.onLightbox(ph.file, ph.caption ?? undefined)} aria-label="Открыть фото">
          <img src={ph.thumb ?? ph.file} alt={ph.caption ?? `Фото, ${SEASON_LABEL[ph.season] ?? ''}`} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/** Одна отметка жителя: автор, когда, что отмечено, комментарий, фото. */
function ObsBody({ m, o }: { m: Model; o: Observation }) {
  const photos = m.detail?.photos.filter((ph) => o.photo_ids.includes(ph.id)) ?? [];
  return (
    <>
      {o.author.avatar ? <img className="av" src={o.author.avatar} alt="" /> : <span className="av" aria-hidden="true" />}
      <div>
        <div className="who">
          {o.author.name}
          {o.is_sample && <span className="sample-badge">Образец</span>} · {ago(o.created_at)}
        </div>
        <div className="what">{KIND_LABEL[o.kind]}: {obsText(o.kind, o.value)}</div>
        {o.comment && <p className="cm">{o.comment}</p>}
        {photos.length > 0 && (
          <div className="thumbs">
            {photos.slice(0, 3).map((ph) => (
              <button key={ph.id} onClick={() => m.p.onLightbox(ph.file, ph.caption ?? undefined)} aria-label="Открыть фото">
                <img src={ph.thumb ?? ph.file} alt={ph.caption ?? 'Фото к отметке'} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const showSamplesNote = (d: SpringDetail | null) => !!d?.samples_shown && d.observations.some((o) => o.is_sample);

function Feed({ m }: { m: Model }) {
  const d = m.detail;
  return (
    <>
      {d && d.observations.length === 0 && (
        <p className="sample-note">Отметок пока нет. Будьте первым, кто расскажет о состоянии родника.</p>
      )}
      {showSamplesNote(d) && (
        <p className="sample-note">Образцы: пример того, как будут выглядеть отметки жителей.</p>
      )}
      <ul className="feed">
        {d?.observations.map((o) => <li key={o.id}><ObsBody m={m} o={o} /></li>)}
      </ul>
    </>
  );
}

// ---------- шторка (узкие экраны) ----------

export default function SpringCard(p: Props) {
  const m = useCard(p);
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    top.current?.closest('.panel-body, .sheet-body')?.scrollTo({ top: 0 });
  }, [p.slug]);

  return (
    <article className="card" ref={top} aria-label={m.title}>
      <Hero m={m}>
        <button className="back" onClick={p.onBack}><ArrowLeft size={18} aria-hidden /> Назад</button>
      </Hero>
      <section>
        <h1>{m.title}</h1>
        <p className="where">{p.fallback.adm_area}, {m.district}</p>
      </section>
      <section>
        <h2>Как найти</h2>
        <HowToFind m={m} />
      </section>
      <section>
        <h2>О воде</h2>
        <Water m={m} />
      </section>
      <section>
        <h2>Сейчас у родника</h2>
        <NowCells m={m} />
        <Actions m={m} />
      </section>
      <section>
        <PointCheck m={m} />
        <FollowShare m={m} />
      </section>
      {m.error && <section><p className="err" role="alert">{m.error}</p></section>}
      {m.detail && m.detail.photos.length > 0 && (
        <section>
          <h2>Фото</h2>
          <Gallery m={m} />
        </section>
      )}
      <section>
        <h2>Лента</h2>
        <Feed m={m} />
      </section>
      {m.markDialog}
    </article>
  );
}

// ---------- 3D-карточки над родником (широкий экран) ----------

/** Фото родника: до четырёх превью, на последнем — сколько ещё. */
function PhotoGrid({ m }: { m: Model }) {
  const photos = m.detail?.photos ?? [];
  const more = photos.length - 4;
  return (
    <div className="photo-grid">
      {photos.slice(0, 4).map((ph, i) => (
        <button key={ph.id} onClick={() => m.p.onLightbox(ph.file, ph.caption ?? undefined)}
          aria-label={i === 3 && more > 0 ? `Открыть фото, ещё ${more}` : 'Открыть фото'}>
          <img src={ph.thumb ?? ph.file} alt={ph.caption ?? `Фото, ${SEASON_LABEL[ph.season] ?? ''}`} loading="lazy" />
          {i === 3 && more > 0 && <span className="more" aria-hidden="true">+{more}</span>}
        </button>
      ))}
    </div>
  );
}

interface StageProps extends Props {
  onPanels(els: StageEls | null): void;
  /** Номер отметки, которая должна стоять перед родником. */
  onRing(i: number): void;
}

/**
 * Карточка родника как раскрывающийся складень над маркером: под каждую функцию своя карточка без прокрутки.
 * Створка задаётся data-col (от -2 слева до 2 справа), карточки внутри створки идут сверху вниз.
 * Отметки жителей — отдельное кольцо карточек вокруг родника на земле: его поворачивают колесом мыши,
 * перетаскиванием, стрелками или кнопками. Положение и перспективу задаёт 3D-сцена (CSS matrix3d в камере карты).
 */
export function SpringStage(p: StageProps) {
  const m = useCard(p);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [ring, setRing] = useState(0);
  const { onPanels, onRing } = p;
  const obs = m.detail?.observations ?? [];
  const n = obs.length;
  const photos = m.detail?.photos.length ?? 0;
  const history = m.detail?.spring.history.length ?? 0;
  const shape = `${p.slug}|${obs.map((o) => o.id).join(',')}|${photos}|${history}|${m.drift > 100}|${!!m.error}`;

  // Сцене нужен список карточек; он меняется, когда приходят отметки, фото или история.
  useLayoutEffect(() => {
    const r = root.current;
    if (!r) return;
    onPanels({
      root: r,
      cards: [...r.querySelectorAll<HTMLElement>('.stage-card[data-col]')],
      ring: [...r.querySelectorAll<HTMLElement>('.ring-card')],
    });
  }, [onPanels, shape]);
  useEffect(() => () => onPanels(null), [onPanels]);

  useEffect(() => {
    setRing(0);
    const t = window.setTimeout(() => heading.current?.focus({ preventScroll: true }), 1300);
    return () => window.clearTimeout(t);
  }, [p.slug]);

  const current = Math.min(ring, Math.max(0, n - 1));
  useEffect(() => onRing(current), [current, onRing]);
  const go = (i: number) => setRing(Math.max(0, Math.min(n - 1, i)));
  const step = (d: number) => setRing((r) => Math.max(0, Math.min(n - 1, r + d)));

  // Колесо: накопленная прокрутка поворачивает кольцо на одну карточку, не чаще чем раз в 140 мс.
  const wheel = useRef({ acc: 0, at: 0 });
  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const w = wheel.current;
    w.acc += d;
    const now = performance.now();
    if (Math.abs(w.acc) >= 40 && now - w.at > 140) {
      step(Math.sign(w.acc));
      w.acc = 0;
      w.at = now;
    }
  };
  // Перетаскивание: каждые 70 px по горизонтали — следующая карточка.
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const ringHandlers = (i: number) => ({
    onWheel,
    onFocus: () => go(i),
    onClick: () => {
      if (!drag.current?.moved) go(i);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0) drag.current = { x: e.clientX, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || !(e.buttons & 1)) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 8) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (Math.abs(dx) > 70) {
        step(dx < 0 ? 1 : -1);
        d.x = e.clientX;
        d.moved = true;
      }
    },
    onPointerUp: () => window.setTimeout(() => (drag.current = null)),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
        (root.current?.querySelectorAll<HTMLElement>('.ring-card')[next])?.focus({ preventScroll: true });
      }
    },
  });

  const frost = <div className="frost-overlay" aria-hidden="true" />;
  const card = (col: number, label: string, cls: string, body: React.ReactNode) => (
    <section className={`stage-card ${cls}`} data-col={col} aria-label={label}>
      {body}
      {frost}
    </section>
  );

  return (
    <div className="stage" ref={root} role="region" aria-label={`Карточка родника: ${m.title}`} data-live="0">
      {card(0, 'Родник', 'title-card', (
        <>
          <Hero m={m}>
            <button className="back" onClick={p.onBack} aria-label="Закрыть карточку"><X size={18} aria-hidden /></button>
          </Hero>
          <div className="stage-sec">
            <h1 ref={heading} tabIndex={-1}>{m.title}</h1>
            <p className="where">{p.fallback.adm_area}, {m.district}</p>
          </div>
        </>
      ))}
      {card(0, 'О воде', 'water-card', (
        <>
          <h2>О воде</h2>
          <WaterStatus m={m} />
          {m.error && <p className="err" role="alert">{m.error}</p>}
        </>
      ))}
      {history > 0 && card(0, 'История анализов', 'history-card', (
        <>
          <h2>История анализов</h2>
          <HistoryRow m={m} />
        </>
      ))}
      {card(-1, 'Важно знать', 'caveats-card', (
        <>
          <h2>Важно знать</h2>
          <Caveats />
        </>
      ))}
      {photos > 0 && card(-1, 'Фото', 'photos-card', (
        <>
          <h2>Фото</h2>
          <PhotoGrid m={m} />
        </>
      ))}
      {card(-2, 'Как найти', 'find-card', (
        <>
          <h2>Как найти</h2>
          <HowToFind m={m} drift={false} />
        </>
      ))}
      {card(-2, 'Точка на карте', 'point-card', (
        <>
          <h2>Точка на карте</h2>
          <DriftNote m={m} />
          <PointCheck m={m} />
        </>
      ))}
      {card(1, 'Сейчас у родника', 'now-card', (
        <>
          <h2>Сейчас у родника</h2>
          <NowCells m={m} />
        </>
      ))}
      {card(1, 'Отметить', 'actions-card', (
        <>
          <h2>Отметить</h2>
          <Actions m={m} />
        </>
      ))}
      <section className="stage-card feed-ctl" data-col={2} aria-label="Отметки жителей" onWheel={onWheel}>
        <h2>Отметки жителей</h2>
        {n > 0 ? (
          <>
            <div className="ring-nav">
              <button className="btn" onClick={() => step(-1)} disabled={current <= 0} aria-label="Предыдущая отметка">
                <ChevronLeft size={18} aria-hidden />
              </button>
              <span className="ring-count" aria-live="polite"><b>{current + 1}</b> из {n}</span>
              <button className="btn" onClick={() => step(1)} disabled={current >= n - 1} aria-label="Следующая отметка">
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
            {showSamplesNote(m.detail) && (
              <p className="sample-note">Образцы: пример того, как будут выглядеть отметки жителей.</p>
            )}
            <p className="hint">Колесо мыши или перетаскивание поворачивают отметки вокруг родника.</p>
          </>
        ) : (
          <p className="sample-note">
            {m.detail ? 'Отметок пока нет. Будьте первым, кто расскажет о состоянии родника.' : 'Загружаем отметки…'}
          </p>
        )}
        {frost}
      </section>
      {card(2, 'Следить и делиться', 'follow-card', (
        <>
          <h2>Следить и делиться</h2>
          <FollowShare m={m} />
        </>
      ))}

      <div className="stage-ring" role="list" aria-label="Отметки жителей у родника">
        {obs.map((o, i) => (
          <article key={o.id} role="listitem" tabIndex={0} aria-current={i === current ? 'true' : undefined}
            className={`stage-card ring-card${o.is_sample ? ' sample' : ''}`} {...ringHandlers(i)}>
            <ObsBody m={m} o={o} />
            {frost}
          </article>
        ))}
      </div>
      {m.markDialog && createPortal(m.markDialog, document.body)}
    </div>
  );
}
