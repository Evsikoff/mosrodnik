import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, Check, Droplet, Eye, EyeOff, MapPin, Navigation, Share2, SquarePen, X,
} from 'lucide-react';
import { api, ApiError } from '../api';
import type { SpringDetail, SpringFeature, SpringProps, User } from '../types';
import {
  ACCESS_LABEL, CLEAN_LABEL, FLOW_LABEL, KIND_LABEL, STATUS_LABEL, SEASON_LABEL, ago, cardIllustration, obsText,
  routeUrl, springTitle,
} from '../labels';
import MarkDialog from './MarkDialog';

const SHAPE: Record<string, string> = {
  exceed: '/markers/status-exceed.svg', ok: '/markers/status-ok.svg', not_sampled: '/markers/status-not-sampled.svg',
};

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
}

export default function SpringCard(p: Props) {
  const { slug, fallback: fb } = p;
  const [detail, setDetail] = useState<SpringDetail | null>(null);
  const [error, setError] = useState('');
  const [markOpen, setMarkOpen] = useState(false);
  const [extraVisits, setExtraVisits] = useState(0);
  const [busy, setBusy] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setError('');
    api.spring(slug).then((d) => live && setDetail(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [slug, p.reloadKey]);

  useEffect(() => {
    setDetail(null);
    setExtraVisits(0);
    top.current?.closest('.panel-body, .sheet-body')?.scrollTo({ top: 0 });
  }, [slug]);

  const s = detail?.spring;
  const agg = detail?.aggregate;
  const title = springTitle({ name: s?.name ?? fb.name, number: s?.number ?? fb.number });
  const status = s?.status ?? fb.status;
  const statusYear = s?.status_year ?? fb.status_year;
  const lastSample = s?.last_sample_year ?? fb.last_sample_year;
  const neverSampled = s?.never_sampled ?? fb.never_sampled;
  const drift = s?.coord_drift_m ?? fb.coord_drift_m;
  const lon = s?.lon;
  const lat = s?.lat;
  const realPhoto = detail?.photos.find((x) => !x.is_sample);
  const visits = (agg?.visits_30d ?? fb.visits_30d) + extraVisits;

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
    setTimeout(() => setExtraVisits((n) => n + 1), 350);
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
    { k: 'flow', title: 'Течение', value: agg?.user_flow ?? fb.user_flow, at: agg?.user_flow_at ?? fb.user_flow_at, labels: FLOW_LABEL },
    { k: 'access', title: 'Подход', value: agg?.user_access ?? fb.user_access, at: agg?.user_access_at ?? fb.user_access_at, labels: ACCESS_LABEL },
    { k: 'clean', title: 'Чистота', value: agg?.user_cleanliness ?? fb.user_cleanliness, at: agg?.user_cleanliness_at ?? fb.user_cleanliness_at, labels: CLEAN_LABEL },
  ];

  return (
    <article className="card" ref={top} aria-label={title}>
      <div className="hero">
        <img className="bg" src={realPhoto ? realPhoto.file : cardIllustration(slug)} alt="" />
        <div className="caustics" aria-hidden="true" />
        <button className="back" onClick={p.onBack}><ArrowLeft size={18} aria-hidden /> Назад</button>
      </div>

      <section>
        <h1>{title}</h1>
        <p className="where">{fb.adm_area}, {(s?.district ?? fb.district)}</p>
      </section>

      <section>
        <h2>Как найти</h2>
        <p className="kv">{s?.location ?? fb.location}</p>
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
        {drift > 100 && (
          <div className="drift">
            В базе координаты этого родника в разные годы расходятся на {drift} м. Если вы знаете, где он находится,
            помогите уточнить точку.
          </div>
        )}
      </section>

      <section>
        <h2>О воде</h2>
        <div className="water">
          <div className="status">
            <img src={SHAPE[status]} alt="" />
            <span>
              {STATUS_LABEL[status]}
              <br /><small style={{ fontWeight: 400, color: 'var(--muted)' }}>последние данные: {statusYear} год</small>
            </span>
          </div>
          {status === 'not_sampled' && (
            <div className="picto"><img src="/pictograms/never-sampled.svg" alt="" />
              <span>Пробы не отбирались{neverSampled ? ': за все годы в базе' : `. Последняя проба: ${lastSample} год`}</span></div>
          )}
          {status !== 'not_sampled' && lastSample && (
            <div className="picto"><img src="/pictograms/last-sample.svg" alt="" /><span>Последняя проба: {lastSample} год</span></div>
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
      </section>

      <section>
        <h2>Сейчас у родника</h2>
        <div className="now">
          {nowCells.map((c) => (
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
          Были здесь за 30 дней: <b>{visits}</b>
        </p>
        <div className="btns">
          <button className="btn primary" onClick={() => needUser() && setMarkOpen(true)}>
            <SquarePen size={18} aria-hidden /> Отметить состояние
          </button>
          <button className="btn" disabled={busy === 'visit'} onClick={visit}>
            <Droplet size={18} aria-hidden /> Я был здесь
          </button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn" disabled={busy === 'photo'} onClick={() => photoInput.current?.click()}>
            <Camera size={18} aria-hidden /> {busy === 'photo' ? 'Загружаем…' : 'Добавить фото'}
          </button>
        </div>
      </section>

      <section>
        <div className={`drift${drift > 100 ? '' : ' mild'}`} style={{ marginTop: 0 }}>
          <b>Точка на карте верна?</b>
          <div className="btns">
            <button className="btn" disabled={busy === 'loc'} onClick={locationOk}><Check size={18} aria-hidden /> Да</button>
            <button className="btn" onClick={() => needUser() && p.onPickLocation()}><X size={18} aria-hidden /> Нет, показать на карте</button>
          </div>
        </div>
        <div className="btns">
          <button className={`btn${detail?.subscribed ? ' on' : ''}`} aria-pressed={!!detail?.subscribed}
            disabled={busy === 'sub'} onClick={toggleSub}>
            {detail?.subscribed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            {detail?.subscribed ? 'Слежу за родником' : 'Следить за родником'}
          </button>
          <button className="btn" onClick={share}><Share2 size={18} aria-hidden /> Поделиться</button>
        </div>
      </section>

      {error && <section><p className="err" role="alert">{error}</p></section>}

      {detail && detail.photos.length > 0 && (
        <section>
          <h2>Фото</h2>
          <div className="gallery">
            {detail.photos.map((ph) => (
              <button key={ph.id} onClick={() => p.onLightbox(ph.file, ph.caption ?? undefined)} aria-label="Открыть фото">
                <img src={ph.thumb ?? ph.file} alt={ph.caption ?? `Фото, ${SEASON_LABEL[ph.season] ?? ''}`} loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Лента</h2>
        {detail && detail.observations.length === 0 && (
          <p className="sample-note">Отметок пока нет. Будьте первым, кто расскажет о состоянии родника.</p>
        )}
        {detail?.samples_shown && detail.observations.some((o) => o.is_sample) && (
          <p className="sample-note">Образцы: пример того, как будут выглядеть отметки жителей.</p>
        )}
        <ul className="feed">
          {detail?.observations.map((o) => {
            const photos = detail.photos.filter((ph) => o.photo_ids.includes(ph.id));
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
                        <button key={ph.id} onClick={() => p.onLightbox(ph.file, ph.caption ?? undefined)} aria-label="Открыть фото">
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
      </section>

      {markOpen && (
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
      )}
    </article>
  );
}
