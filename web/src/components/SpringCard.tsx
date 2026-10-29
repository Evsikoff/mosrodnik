import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Camera, Check, Droplet, Eye, EyeOff, MapPin, Navigation, Share2, SquarePen, X,
} from 'lucide-react';
import { api, ApiError } from '../api';
import type { SpringDetail, SpringFeature, SpringProps, Status, User } from '../types';
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

function HowToFind({ m }: { m: Model }) {
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
      {m.drift > 100 && (
        <div className="drift">
          В базе координаты этого родника в разные годы расходятся на {m.drift} м. Если вы знаете, где он находится,
          помогите уточнить точку.
        </div>
      )}
    </>
  );
}

function Water({ m }: { m: Model }) {
  const s = m.detail?.spring;
  return (
    <div className="water">
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
      <div className="picto"><img src="/pictograms/chemistry-only.svg" alt="" /><span>Анализ только по химическим показателям</span></div>
      <div className="picto"><img src="/pictograms/no-microbiology.svg" alt="" /><span>Микробиология не проверяется</span></div>
      <div className="picto strong"><img src="/pictograms/boil-water.svg" alt="" />
        <span>Роспотребнадзор рекомендует пить воду из родников только после кипячения</span></div>
      {(s?.history.length ?? 0) > 0 && (
        <div className="timeline" role="img"
          aria-label={`История анализов: ${(s?.history ?? []).map((h) => `${h.year} ${STATUS_LABEL[h.status]}`).join('; ')}`}>
          {(s?.history ?? []).map((h) => (
            <span className="y" key={h.year}><img src={SHAPE[h.status]} alt="" />{h.year}</span>
          ))}
        </div>
      )}
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

function Feed({ m }: { m: Model }) {
  const d = m.detail;
  return (
    <>
      {d && d.observations.length === 0 && (
        <p className="sample-note">Отметок пока нет. Будьте первым, кто расскажет о состоянии родника.</p>
      )}
      {d?.samples_shown && d.observations.some((o) => o.is_sample) && (
        <p className="sample-note">Образцы: пример того, как будут выглядеть отметки жителей.</p>
      )}
      <ul className="feed">
        {d?.observations.map((o) => {
          const photos = d.photos.filter((ph) => o.photo_ids.includes(ph.id));
          return (
            <li key={o.id}>
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
                    {photos.map((ph) => (
                      <button key={ph.id} onClick={() => m.p.onLightbox(ph.file, ph.caption ?? undefined)} aria-label="Открыть фото">
                        <img src={ph.thumb ?? ph.file} alt={ph.caption ?? 'Фото к отметке'} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
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

// ---------- 3D-панели над родником (широкий экран) ----------

/**
 * Карточка в виде складня из трёх ледяных панелей, которые стоят над родником прямо в сцене карты.
 * Положение и перспективу панелям задаёт 3D-сцена (CSS matrix3d в камере карты), здесь только содержимое.
 */
export function SpringStage(p: Props & { onPanels(els: StageEls | null): void }) {
  const m = useCard(p);
  const root = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLElement>(null);
  const center = useRef<HTMLElement>(null);
  const right = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { onPanels } = p;

  useEffect(() => {
    if (root.current && left.current && center.current && right.current) {
      onPanels({ root: root.current, left: left.current, center: center.current, right: right.current });
    }
    return () => onPanels(null);
  }, [onPanels]);

  useEffect(() => {
    for (const el of [left.current, center.current, right.current]) el?.querySelector('.stage-scroll')?.scrollTo({ top: 0 });
    const t = window.setTimeout(() => heading.current?.focus({ preventScroll: true }), 900);
    return () => window.clearTimeout(t);
  }, [p.slug]);

  const frost = <div className="frost-overlay" aria-hidden="true" />;

  return (
    <div className="stage" ref={root} role="region" aria-label={`Карточка родника: ${m.title}`} data-live="0">
      <section className="stage-panel center" ref={center} aria-label="О роднике и воде">
        <div className="stage-scroll">
          <Hero m={m}>
            <button className="back" onClick={p.onBack} aria-label="Закрыть карточку"><X size={18} aria-hidden /></button>
          </Hero>
          <div className="stage-sec">
            <h1 ref={heading} tabIndex={-1}>{m.title}</h1>
            <p className="where">{p.fallback.adm_area}, {m.district}</p>
          </div>
          <div className="stage-sec">
            <h2>О воде</h2>
            <Water m={m} />
          </div>
          {m.error && <div className="stage-sec"><p className="err" role="alert">{m.error}</p></div>}
        </div>
        {frost}
      </section>

      <section className="stage-panel left" ref={left} aria-label="Как найти">
        <div className="stage-scroll">
          <div className="stage-sec">
            <h2>Как найти</h2>
            <HowToFind m={m} />
          </div>
          <div className="stage-sec">
            <PointCheck m={m} />
            <FollowShare m={m} />
          </div>
          {m.detail && m.detail.photos.length > 0 && (
            <div className="stage-sec">
              <h2>Фото</h2>
              <Gallery m={m} />
            </div>
          )}
        </div>
        {frost}
      </section>

      <section className="stage-panel right" ref={right} aria-label="Сейчас у родника">
        <div className="stage-scroll">
          <div className="stage-sec">
            <h2>Сейчас у родника</h2>
            <NowCells m={m} />
            <Actions m={m} />
          </div>
          <div className="stage-sec">
            <h2>Лента</h2>
            <Feed m={m} />
          </div>
        </div>
        {frost}
      </section>
      {m.markDialog && createPortal(m.markDialog, document.body)}
    </div>
  );
}
