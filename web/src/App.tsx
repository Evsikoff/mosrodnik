import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { api, ApiError } from './api';
import { startSession } from './session';
import type { Filters, SpringFeature, User } from './types';
import { EMPTY_FILTERS, filtersToSearch, matches, parseFilters, hasFilters } from './filters';
import { currentTheme, type Theme } from './theme';
import { MapController, reducedMotion } from './map/controller';
import FilterPanel, { SearchBox } from './components/Filters';
import SpringList, { Summary } from './components/SpringList';
import SpringCard, { SpringStage, type CardScene } from './components/SpringCard';
import type { SceneSpring, StageEls } from './scene/SpringScene';
import Snow from './components/Snow';
import Fx, { type FxItem } from './components/Fx';
import { AboutDialog, Lightbox, NameDialog, PrivacyDialog, Toast } from './components/Dialogs';
import { springTitle } from './labels';

const slugFromPath = () => /^\/spring\/([\w-]+)/.exec(location.pathname)?.[1] ?? null;
const FORCED_THEME = new URLSearchParams(location.search).get('theme');

function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

interface StoryStep { title: string; text: string; set?: Set<string> | null }

export default function App() {
  const mobile = useMedia('(max-width: 1023px)');
  const [features, setFeatures] = useState<SpringFeature[]>([]);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<Filters>(() => parseFilters(location.search));
  const [selected, setSelected] = useState<string | null>(slugFromPath());
  const [user, setUser] = useState<User | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'name' | 'about' | 'privacy'>(null);
  const [toast, setToast] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (FORCED_THEME as Theme) || currentTheme());
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tall, setTall] = useState(false);
  const [thaw, setThaw] = useState(0);
  const [fx, setFx] = useState<FxItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [pick, setPick] = useState<{ slug: string; point?: { lon: number; lat: number } } | null>(null);
  const [storyStep, setStoryStep] = useState<number | null>(null);
  /** Родник, чьи 3D-панели стоят над картой (на широком экране). При закрытии живёт, пока панели складываются. */
  const [stageSlug, setStageSlug] = useState<string | null>(null);
  const [intro, setIntro] = useState(() => !slugFromPath() && !reducedMotion());
  const [sceneOk, setSceneOk] = useState(true);

  const mapEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);
  const zoomRef = useRef(9.6);
  const firstVis = useRef(true);
  const toastTimer = useRef<number>(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const openRef = useRef<(slug: string) => void>(() => {});
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const mobileRef = useRef(mobile);
  mobileRef.current = mobile;
  const sceneData = useRef<SceneSpring | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  // ---------- данные ----------
  useEffect(() => {
    api.springs().then((fc) => setFeatures(fc.features)).catch((e) => setLoadError(e.message));
    startSession()
      .then((u) => {
        setUser(u);
        return api.mySubscriptions();
      })
      .then((r) => setMine(new Set(r.subscriptions.map((s) => s.slug))))
      .catch(() => {});
  }, []);

  const bySlug = useMemo(() => new Map(features.map((f) => [f.properties.slug, f])), [features]);
  const bySlugRef = useRef(bySlug);
  bySlugRef.current = bySlug;

  const visible = useMemo(
    () => features.filter((f) => matches(f, filters, mine)),
    [features, filters, mine],
  );

  const story: StoryStep[] = useMemo(() => {
    const never = features.filter((f) => f.properties.never_sampled);
    const drift = features.filter((f) => f.properties.coord_drift_m > 100);
    const ids = (a: SpringFeature[]) => new Set(a.map((f) => f.properties.slug));
    return [
      { title: `${features.length} родников`, text: 'Столько родников Москвы есть в открытых данных. Каждый можно открыть и посмотреть официальные анализы.' },
      { title: 'Анализ только химический', text: 'В наборе нет микробиологии. Поэтому Роспотребнадзор рекомендует пить воду из родников только после кипячения.' },
      { title: `${never.length} ни разу не проверялись`, text: 'Для этих родников в базе нет ни одной пробы. Отметки жителей помогут понять, где брать пробы в первую очередь.', set: ids(never) },
      { title: `У ${drift.length} расходятся координаты`, text: 'В разные годы точка родника в базе отличается больше чем на 100 метров. Вы можете подтвердить или поправить её на карте.', set: ids(drift) },
      { title: 'Что могут сделать жители', text: 'Отметить, течёт ли родник и можно ли подойти, добавить фото, подтвердить точку на карте. Это данные, которых нет в базе.' },
    ];
  }, [features]);

  const visibleSet = useMemo(() => {
    const st = storyStep != null ? story[storyStep]?.set : null;
    return st ?? new Set(visible.map((f) => f.properties.slug));
  }, [visible, story, storyStep]);

  const visibleFeatures = useMemo(
    () => features.filter((f) => visibleSet.has(f.properties.slug)),
    [features, visibleSet],
  );

  // ---------- карта ----------
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const c = new MapController(el, theme, {
      onSelect: (slug) => openRef.current(slug),
      onZoom: (z) => { zoomRef.current = z; },
      onReady: () => setReady(true),
      onPick: (point) => setPick((p) => (p ? { ...p, point } : p)),
    }, { intro });
    ctl.current = c;
    if (import.meta.env.DEV || location.search.includes('debug')) (window as any).__ctl = c;
    c.init().catch((e) => setLoadError(`Карта не загрузилась: ${e.message}`));
    return () => { c.destroy(); ctl.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !features.length) return;
    ctl.current?.setFeatures(features);
  }, [ready, features]);

  const padding = useCallback(() => {
    if (!mobile) return { top: 60, bottom: 60, left: 60, right: 60 };
    const open = selected || sheetOpen;
    return { top: 80, left: 30, right: 30, bottom: open ? Math.round(window.innerHeight * 0.62) : 40 };
  }, [mobile, selected, sheetOpen]);

  // смена выборки: анимация маркеров и камера
  useEffect(() => {
    if (!ready || !features.length) return;
    const c = ctl.current!;
    c.setVisible(visibleSet, !firstVis.current);
    const first = firstVis.current;
    firstVis.current = false;
    if (selected && first) return;
    if (!selected && visibleFeatures.length > 0) {
      c.fit(visibleFeatures, padding());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, features.length, visibleSet]);

  // открытие и закрытие карточки
  const prevSelected = useRef<string | null>(null);
  const flownFor = useRef<string | null>(null);
  const flyTo = useCallback((f: SpringFeature) => {
    const m = mobileRef.current;
    ctl.current?.fly(f, m ? { bottom: Math.round(window.innerHeight * 0.55), top: 0, left: 0, right: 0 } : 0, !m);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const c = ctl.current!;
    c.setSelected(selected);
    const f = selected ? bySlug.get(selected) : undefined;
    if (selected && f) {
      if (!mobile) setStageSlug(selected);
      // Пролёт только при смене родника, а не при каждом обновлении его данных после отметки.
      if (flownFor.current !== selected) {
        flownFor.current = selected;
        flyTo(f);
        setThaw((n) => n + 1);
      }
    } else if (!selected) {
      flownFor.current = null;
      if (prevSelected.current) {
        c.hideScene(() => setStageSlug((s) => (selectedRef.current ? s : null)));
        if (visibleFeatures.length) c.fit(visibleFeatures, padding());
      }
    }
    prevSelected.current = selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected, bySlug]);

  useEffect(() => {
    ctl.current?.resize();
    // Шторка на телефоне и 3D-панели на широком экране: при смене ширины сцена меняет режим.
    if (selected && sceneData.current) {
      ctl.current?.showScene(sceneData.current, mobile ? 'ground' : 'stage');
      setStageSlug(mobile ? null : selected);
      const f = bySlug.get(selected);
      if (f) flyTo(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  const onScene = useCallback((d: CardScene) => {
    const f = bySlugRef.current.get(d.slug);
    if (!f || selectedRef.current !== d.slug) return;
    const s: SceneSpring = { ...d, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    sceneData.current = s;
    ctl.current?.showScene(s, mobileRef.current ? 'ground' : 'stage');
  }, []);
  useEffect(() => {
    if (!ready || !selected || mobile) return;
    ctl.current?.scene().catch(() => setSceneOk(false));
  }, [ready, selected, mobile]);
  const onPanels = useCallback((els: StageEls | null) => ctl.current?.attachStage(els), []);

  useEffect(() => {
    if (!intro) return;
    // Иней вступления не должен закрывать карту дольше нескольких секунд, даже если что-то не загрузилось.
    if (loadError) {
      setIntro(false);
      return;
    }
    const t = window.setTimeout(() => setIntro(false), ready && features.length ? 2600 : 8000);
    return () => window.clearTimeout(t);
  }, [intro, ready, features.length, loadError]);

  // тема
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    ctl.current?.setTheme(theme);
  }, [theme, ready]);
  useEffect(() => {
    if (FORCED_THEME) return;
    const t = window.setInterval(() => setTheme(currentTheme()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // ---------- навигация и URL ----------
  const search = (f: Filters) => filtersToSearch(f);

  const openSpring = useCallback((slug: string) => {
    const f = bySlug.get(slug);
    if (slug === selectedRef.current) {
      // Повторный клик по открытому роднику возвращает камеру к нему.
      if (f) flyTo(f);
      return;
    }
    history.pushState(null, '', `/spring/${slug}${search(filtersRef.current)}`);
    setSelected(slug);
    setSheetOpen(false);
    setTall(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bySlug, flyTo]);

  openRef.current = openSpring;

  const closeSpring = useCallback(() => {
    ctl.current?.stopPick();
    ctl.current?.foldScene(false);
    setPick(null);
    history.pushState(null, '', `/${search(filtersRef.current)}`);
    setSelected(null);
  }, []);

  useEffect(() => {
    const pop = () => {
      setSelected(slugFromPath());
      setFilters(parseFilters(location.search));
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  const changeFilters = (f: Filters) => {
    setFilters(f);
    history.replaceState(null, '', `${location.pathname}${search(f)}`);
  };

  useEffect(() => {
    const t = selected ? bySlug.get(selected) : null;
    document.title = t ? `${springTitle(t.properties)} — Московский родник` : 'Московский родник';
  }, [selected, bySlug]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected && !dialog && !lightbox) closeSpring();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, dialog, lightbox, closeSpring]);

  // ---------- действия ----------
  const onFeature = (f: SpringFeature) => {
    setFeatures((all) => all.map((x) => (x.properties.slug === f.properties.slug ? f : x)));
  };

  const onFx = (kind: 'crystal' | 'drop') => {
    const f = selected ? bySlug.get(selected) : null;
    const c = ctl.current;
    if (!f || !c) return;
    // Капля падает в родник прямо в 3D-сцене; кристалл льда прорастает и в сцене, и поверх маркера.
    if (c.sceneFx(kind) && kind === 'drop') return;
    const pt = c.projectToWindow(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    const id = Date.now() + Math.random();
    setFx((a) => [...a, { id, kind, x: pt.x, y: pt.y }]);
    window.setTimeout(() => setFx((a) => a.filter((i) => i.id !== id)), 2400);
  };

  const startPick = () => {
    if (!selected) return;
    const f = bySlug.get(selected);
    setPick({ slug: selected });
    ctl.current?.foldScene(true);
    ctl.current?.startPick();
    if (f) ctl.current?.map.easeTo({ pitch: 0, bearing: 0, duration: reducedMotion() ? 0 : 500 });
  };
  const cancelPick = () => {
    ctl.current?.stopPick();
    ctl.current?.foldScene(false);
    setPick(null);
    const f = selected ? bySlug.get(selected) : undefined;
    if (f) flyTo(f);
  };
  const submitPick = async () => {
    if (!pick?.point) return;
    try {
      await api.observe(pick.slug, { kind: 'location_check', value: 'wrong', location: pick.point });
      say('Спасибо, мы сохранили вашу отметку о точке.');
      cancelPick();
      setReloadKey((n) => n + 1);
    } catch (e) {
      say(e instanceof ApiError ? e.message : 'Не удалось отправить точку.');
    }
  };

  const onSubscribed = (slug: string, on: boolean) => {
    setMine((m) => {
      const n = new Set(m);
      if (on) n.add(slug);
      else n.delete(slug);
      return n;
    });
  };

  // ---------- рассказ ----------
  useEffect(() => {
    if (storyStep == null) return;
    const c = ctl.current;
    if (!c) return;
    const step = story[storyStep];
    const list = step.set ? features.filter((f) => step.set!.has(f.properties.slug)) : features;
    c.setSelected(null);
    c.fit(list, padding());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyStep]);
  const startStory = () => {
    setDialog(null);
    if (selected) closeSpring();
    setSheetOpen(false);
    setStoryStep(0);
  };
  const endStory = () => {
    setStoryStep(null);
    ctl.current?.fit(features.filter((f) => matches(f, filters, mine)), padding());
  };

  // ---------- разметка ----------
  const selectedFeature = selected ? bySlug.get(selected) : undefined;
  const filterView = (
    <>
      <SearchBox value={filters.q} onChange={(q) => changeFilters({ ...filters, q })} />
      <FilterPanel all={features} filters={filters} mine={mine} onChange={changeFilters} />
      <Summary shown={visible.length} total={features.length} features={visible} />
      {visible.length === 0 && features.length > 0 ? (
        <div className="empty">
          <img src="/illustrations/empty/empty-filters.webp" alt="" />
          <p>По этим условиям родников не нашлось. Попробуйте снять часть фильтров.</p>
        </div>
      ) : (
        <SpringList features={visible} selected={selected} onOpen={openSpring} onHover={(s) => ctl.current?.hover(s)} />
      )}
    </>
  );

  const card = selectedFeature && (
    <SpringCard
      slug={selectedFeature.properties.slug}
      fallback={selectedFeature.properties}
      user={user}
      reloadKey={reloadKey}
      onBack={closeSpring}
      onFeature={onFeature}
      onSubscribed={onSubscribed}
      onFx={onFx}
      onPickLocation={startPick}
      onToast={say}
      onLightbox={(src, caption) => setLightbox({ src, caption })}
      onScene={onScene}
    />
  );

  const stageFeature = !mobile && sceneOk && stageSlug ? bySlug.get(stageSlug) : undefined;
  const stage = stageFeature && (
    <SpringStage
      key="stage"
      slug={stageFeature.properties.slug}
      fallback={stageFeature.properties}
      user={user}
      reloadKey={reloadKey}
      onBack={closeSpring}
      onFeature={onFeature}
      onSubscribed={onSubscribed}
      onFx={onFx}
      onPickLocation={startPick}
      onToast={say}
      onLightbox={(src, caption) => setLightbox({ src, caption })}
      onScene={onScene}
      onPanels={onPanels}
    />
  );

  const rm = reducedMotion();

  const foot = (
    <div className="panel-foot">
      <button className="link-btn" onClick={() => setDialog('about')}>О проекте</button>
      <button className="link-btn" onClick={() => setDialog('privacy')}>Конфиденциальность</button>
      <span>Источник данных: <a href="https://data.mos.ru/opendata/2454" target="_blank" rel="noopener noreferrer">data.mos.ru, набор 2454</a></span>
    </div>
  );

  const userBtn = user && (
    <button className="user-btn" onClick={() => setDialog('name')} aria-label={`Ваше имя: ${user.display_name}. Изменить`}>
      {user.avatar && <img src={user.avatar} alt="" />}
      <span>{user.display_name}</span>
    </button>
  );

  const step = storyStep != null ? story[storyStep] : null;

  return (
    <div className={`app${!mobile && selected && sceneOk ? ' focus' : ''}`}>
      {!mobile && (
        <aside className="panel">
          <header className="panel-head">
            <a className="brand" href="/" aria-label="Московский родник: к списку" onClick={(e) => { e.preventDefault(); if (selected) closeSpring(); }}>
              <span className="mr-logo mr-logo--auto mr-logo--animated" style={{ ["--logo-width" as string]: "44px" }} aria-hidden="true" />
              <b>Московский<br />родник</b>
            </a>
            {userBtn}
          </header>
          {/* Карточка родника на широком экране не в панели, а в 3D над родником на карте.
              Если WebGL-сцена не загрузилась, карточка остаётся в панели, как запасной вариант. */}
          <div className="panel-body">{selected && !sceneOk ? card : filterView}</div>
          {foot}
        </aside>
      )}

      <div className="map-wrap">
        <div ref={mapEl} className="map" role="application" aria-label="Карта родников Москвы" />
        <div className="haze" aria-hidden="true" />
        <Snow zoomRef={zoomRef} halved={!!selected} />
        {stage}
        {!mobile && selected && sceneOk && (
          <button className="focus-back" onClick={closeSpring}>
            <span className="mr-logo mr-logo--auto mr-logo--animated" style={{ ['--logo-width' as string]: '30px' }} aria-hidden="true" />
            <span>Все родники</span>
          </button>
        )}
        {intro && (
          <div className={`intro${ready && features.length ? ' go' : ''}`} aria-hidden="true">
            <span className="mr-logo mr-logo--auto mr-logo--animated" style={{ ['--logo-width' as string]: '72px' }} />
          </div>
        )}
        {loadError && <div className="map-error" role="alert"><p>{loadError}</p></div>}

        {pick && (
          <div className="pickbar" role="status">
            <span>{pick.point ? 'Точка выбрана. Её можно перетащить.' : 'Нажмите на карте там, где находится родник'}</span>
            <button className="btn ghost" onClick={cancelPick}>Отмена</button>
            <button className="btn primary" disabled={!pick.point} onClick={submitPick}>Отправить</button>
          </div>
        )}

        {step && (
          <div className="story" role="region" aria-label="О проекте: рассказ">
            <div className="dots" aria-hidden="true">
              {story.map((_, i) => <i key={i} className={i <= (storyStep ?? 0) ? 'on' : ''} />)}
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            <div className="btns" style={{ marginTop: 0 }}>
              <button className="btn ghost" onClick={endStory}>Закрыть</button>
              {storyStep! > 0 && <button className="btn" onClick={() => setStoryStep(storyStep! - 1)}>Назад</button>}
              {storyStep! < story.length - 1
                ? <button className="btn primary" onClick={() => setStoryStep(storyStep! + 1)}>Дальше</button>
                : <button className="btn primary" onClick={endStory}>К карте</button>}
            </div>
          </div>
        )}
      </div>

      {mobile && (
        <>
          <div className="m-top">
            <button className="pill" onClick={() => { setSheetOpen(true); setTall(false); }} aria-label="Поиск и фильтры">
              <span className="mr-logo mr-logo--auto mr-logo--animated" style={{ ["--logo-width" as string]: "32px" }} aria-hidden="true" />
              <span>{hasFilters(filters) ? `Показано ${visible.length} из ${features.length}` : 'Поиск и фильтры'}</span>
              <SlidersHorizontal size={18} aria-hidden />
            </button>
            {user && (
              <button className="round" onClick={() => setDialog('name')} aria-label={`Ваше имя: ${user.display_name}. Изменить`}>
                {user.avatar && <img src={user.avatar} alt="" />}
              </button>
            )}
          </div>
          <AnimatePresence>
            {(sheetOpen || selected) && !pick && (
              <motion.div
                key={selected ? 'c' : 'f'}
                className={`sheet${tall ? ' tall' : ''}`}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ duration: rm ? 0 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                role="dialog" aria-label={selected ? 'Карточка родника' : 'Поиск и фильтры'}
              >
                <button className="grip" aria-label={tall ? 'Свернуть' : 'Развернуть'} onClick={() => setTall((t) => !t)}>
                  <i />
                  <span className="sr-only">{tall ? <ChevronDown /> : <ChevronUp />}</span>
                </button>
                <button className="btn ghost sheet-close" aria-label="Закрыть" onClick={selected ? closeSpring : () => setSheetOpen(false)}>
                  <X size={18} />
                </button>
                <div className="panel-body sheet-body" style={{ flex: 1 }}>
                  {selected ? card : filterView}
                  {!selected && foot}
                </div>
                {thaw > 0 && selected && !rm && <div key={thaw} className="frost-overlay" aria-hidden="true" />}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <Fx items={fx} />
      {dialog === 'name' && user && (
        <NameDialog user={user} onClose={() => setDialog(null)} onSaved={setUser} />
      )}
      {dialog === 'privacy' && <PrivacyDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} onStory={startStory} />}
      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      {toast && <Toast text={toast} />}
    </div>
  );
}
