import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Map as MapIcon, Pause, Play, RotateCcw, X } from 'lucide-react';
import deck from '../presentation/deck.json';
import { DeckAudio } from '../presentation/audio';
import { reducedMotion } from '../map/controller';

// Слайды, озвучка и тексты готовит presentations/moskovsky-rodnik/scripts/publish-web.mjs
const files = import.meta.glob<string>('../presentation/media/*', { eager: true, query: '?url', import: 'default' });
const media = (name: string) => files[`../presentation/media/${name}`];
const slides = deck.slides;
const last = slides.length - 1;
const GAP = 1100; // пауза после озвучки перед следующим слайдом, мс

/** Вызывать в обработчике нажатия «О проекте», чтобы браузер разрешил звук. */
export const startDeckAudio = () => DeckAudio.start(media(deck.music), media(slides[0].voice));

// Подсветка текущей фразы: время озвучки делится между предложениями пропорционально их длине.
function sentences(text: string) {
  let at = 0;
  return text.split(/(?<=[.!?])\s+/).map((t) => {
    const from = at / text.length;
    at += t.length + 1;
    return { t, from };
  });
}

export default function Presentation({ audio, onClose, onStory }: { audio: DeckAudio; onClose(): void; onStory(): void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const advance = useRef(0);
  const swipeX = useRef<number | null>(null);
  const iRef = useRef(i);
  iRef.current = i;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const rm = reducedMotion();

  const go = useCallback((n: number) => {
    if (n < 0 || n > last) return;
    window.clearTimeout(advance.current);
    setPaused(false);
    setDone(false);
    setProgress(0);
    if (n === iRef.current) audio.playVoice(n, media(slides[n].voice)).catch(() => setPaused(true));
    setI(n);
  }, [audio]);

  const toggle = useCallback(() => {
    if (!pausedRef.current) {
      window.clearTimeout(advance.current);
      audio.voice.pause();
      setPaused(true);
    } else if (audio.voice.ended) {
      go(iRef.current + 1);
    } else {
      setPaused(false);
      audio.voice.play().catch(() => setPaused(true));
    }
  }, [audio, go]);
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // озвучка текущего слайда; первый слайд уже запущен нажатием на кнопку
  useEffect(() => {
    if (audio.voiceIndex !== i) audio.playVoice(i, media(slides[i].voice)).catch(() => setPaused(true));
  }, [audio, i]);

  useEffect(() => {
    const v = audio.voice;
    const onTime = () => { if (v.duration) setProgress(v.currentTime / v.duration); };
    const onEnd = () => {
      setProgress(1);
      if (iRef.current >= last) setDone(true);
      else if (!pausedRef.current) advance.current = window.setTimeout(() => go(iRef.current + 1), GAP);
    };
    // Если файл озвучки не загрузился, слайд держится столько, сколько длилась бы речь.
    const onError = () => { advance.current = window.setTimeout(onEnd, slides[iRef.current].seconds * 1000); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('error', onError);
      window.clearTimeout(advance.current);
    };
  }, [audio, go]);

  useEffect(() => {
    slides.forEach((s) => { new Image().src = media(s.image); });
    slides.slice(1).forEach((s) => { fetch(media(s.voice)).catch(() => {}); });
  }, []);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.deck-close')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const els = [...ref.current!.querySelectorAll<HTMLElement>('button:not([disabled])')];
        const edge = e.shiftKey ? els[0] : els[els.length - 1];
        if (document.activeElement !== edge) return;
        (e.shiftKey ? els[els.length - 1] : els[0]).focus();
      } else if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(iRef.current + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(iRef.current - 1);
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) toggleRef.current();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [go]);

  const s = slides[i];
  const parts = useMemo(() => sentences(s.text), [s]);
  const cur = parts.findLastIndex((p) => p.from <= progress);

  return createPortal(
    <div className="deck" role="dialog" aria-modal="true" aria-label="О проекте: презентация" ref={ref}>
      <div className="deck-top">
        <div className="deck-bars">
          {slides.map((sl, k) => (
            <button key={sl.number} className="deck-bar" onClick={() => go(k)}
              aria-label={`Слайд ${k + 1}: ${sl.title}`} aria-current={k === i ? 'step' : undefined}>
              <span><i style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} /></span>
            </button>
          ))}
        </div>
        <span className="deck-count">{i + 1} / {slides.length}</span>
        <button className="deck-icon deck-close" onClick={onClose} aria-label="Закрыть презентацию"><X size={20} /></button>
      </div>

      <div
        className="deck-stage"
        onPointerDown={(e) => { swipeX.current = e.clientX; }}
        onPointerUp={(e) => {
          const dx = swipeX.current == null ? 0 : e.clientX - swipeX.current;
          swipeX.current = null;
          if (Math.abs(dx) > 50) go(iRef.current + (dx < 0 ? 1 : -1));
        }}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={s.image} src={media(s.image)} alt={s.title} draggable={false}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: rm ? 0 : 0.5, ease: 'easeOut' }}
          />
        </AnimatePresence>
      </div>

      <p className="deck-text">
        {parts.map((p, k) => <span key={k} className={k < cur ? 'past' : k === cur ? 'on' : ''}>{p.t} </span>)}
      </p>

      <div className="deck-controls">
        {done ? (
          <>
            <button className="deck-ctl" onClick={() => go(0)}><RotateCcw size={18} aria-hidden />Смотреть снова</button>
            <button className="deck-ctl" onClick={onStory}><MapIcon size={18} aria-hidden />Рассказ на карте</button>
            <button className="deck-ctl primary" onClick={onClose}>Закрыть</button>
          </>
        ) : (
          <>
            <button className="deck-ctl" onClick={() => go(i - 1)} disabled={i === 0}><ChevronLeft size={18} aria-hidden />Назад</button>
            <button className="deck-icon big" onClick={toggle} aria-label={paused ? 'Продолжить' : 'Пауза'}>
              {paused ? <Play size={22} aria-hidden /> : <Pause size={22} aria-hidden />}
            </button>
            <button className="deck-ctl" onClick={() => go(i + 1)} disabled={i === last}>Дальше<ChevronRight size={18} aria-hidden /></button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
