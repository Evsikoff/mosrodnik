import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { User } from '../types';

export function Modal({
  title, onClose, children, className = '',
}: { title: string; onClose(): void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className={`overlay ${className}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function NameDialog({ user, onClose, onSaved }: { user: User; onClose(): void; onSaved(u: User): void }) {
  const [name, setName] = useState(user.display_name);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user: u } = await api.rename(name);
      onSaved(u);
      onClose();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Не удалось сохранить имя.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Ваше имя" onClose={onClose}>
      <form onSubmit={save}>
        <h2>Как вас называть</h2>
        <p>Имя видят другие жители рядом с вашими отметками. Регистрация не нужна.</p>
        <div className="field">
          <label htmlFor="nm">Имя (2–32 символа: буквы, цифры, пробел, дефис)</label>
          <input id="nm" type="text" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary" disabled={busy || name.trim().length < 2}>Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}

export function PrivacyDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Конфиденциальность" onClose={onClose}>
      <h2>Конфиденциальность</h2>
      <p><b>Что мы храним.</b> Случайный идентификатор вашего устройства (только в виде хеша), хеш отпечатка браузера для
        восстановления доступа после очистки данных, ваше имя в приложении, ваши отметки и загруженные фото.</p>
      <p><b>Фото.</b> При загрузке из снимка удаляются все метаданные, включая координаты съёмки (GPS), дату и модель
        устройства.</p>
      <p><b>Чего мы не храним.</b> Сырые компоненты отпечатка браузера, адрес электронной почты, телефон, пароли,
        точное местоположение устройства и историю перемещений.</p>
      <p>Имя, отметки и фото видны всем посетителям. Не публикуйте в комментариях личные данные.</p>
      <div className="row-end"><button className="btn primary" onClick={onClose}>Понятно</button></div>
    </Modal>
  );
}

export function AboutDialog({ onClose, onStory }: { onClose(): void; onStory(): void }) {
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);
  return (
    <Modal title="О проекте" onClose={onClose}>
      <h2>О проекте «Московский родник»</h2>
      <p>Приложение показывает состояние родников Москвы по открытым данным data.mos.ru (набор 2454) и собирает отметки
        жителей: течёт ли родник, как к нему подойти, верна ли точка на карте.</p>
      <p>Анализ в наборе только химический, микробиология не проверяется. Роспотребнадзор рекомендует пить воду из
        родников только после кипячения. Приложение не делает вывод о пригодности воды для питья.</p>
      {stats && (
        <p className="sample-note">
          Жителями оставлено отметок: {stats.observations}, загружено фото: {stats.photos}, родников с отметками:{' '}
          {stats.springs_with_observations} из {stats.springs_total}.
        </p>
      )}
      <div className="row-end">
        <button className="btn ghost" onClick={onClose}>Закрыть</button>
        <button className="btn primary" onClick={onStory}>Показать рассказ</button>
      </div>
    </Modal>
  );
}

export function Lightbox({ src, caption, onClose }: { src: string; caption?: string; onClose(): void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="overlay lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Фото">
      <button className="btn x-close" aria-label="Закрыть фото" onClick={onClose}><X size={18} /></button>
      <figure>
        <img src={src} alt={caption ?? 'Фото родника'} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return <div className="toast" role="status">{text}</div>;
}
