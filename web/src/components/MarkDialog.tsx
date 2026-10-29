import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api, ApiError } from '../api';
import type { SpringFeature } from '../types';
import { Modal } from './Dialogs';

const GROUPS = [
  {
    kind: 'flow', title: 'Течёт ли родник',
    options: [['flowing', 'Течёт'], ['weak', 'Слабо'], ['frozen', 'Замёрз'], ['dry', 'Пересох']],
  },
  {
    kind: 'access', title: 'Подход',
    options: [['cleared', 'Расчищен'], ['icy', 'Обледенел'], ['blocked', 'Закрыт']],
  },
  {
    kind: 'cleanliness', title: 'Чистота вокруг',
    options: [['clean', 'Чисто'], ['litter', 'Мусор'], ['damaged', 'Повреждено']],
  },
] as const;

interface Props {
  slug: string;
  onClose(): void;
  onDone(info: { kinds: string[]; values: Record<string, string>; feature?: SpringFeature }): void;
}

export default function MarkDialog({ slug, onClose, onDone }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const kinds = Object.keys(picked);
  const can = kinds.length > 0 || !!file;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can) return;
    setBusy(true);
    setErr('');
    try {
      let photoIds: string[] = [];
      let feature: SpringFeature | undefined;
      if (file) {
        const r = await api.uploadPhoto(slug, file, comment.trim() || undefined);
        photoIds = [r.photo.id];
        feature = r.feature;
      }
      let first = true;
      for (const kind of kinds) {
        const r = await api.observe(slug, {
          kind, value: picked[kind],
          comment: first ? comment.trim() || null : null,
          photo_ids: first ? photoIds : [],
        });
        feature = r.feature;
        first = false;
      }
      onDone({ kinds, values: picked, feature });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Не удалось отправить отметку.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Отметить состояние" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Отметить состояние</h2>
        {GROUPS.map((g) => (
          <fieldset className="field" key={g.kind}>
            <legend>{g.title}</legend>
            <div className="chips">
              {g.options.map(([value, label]) => (
                <button
                  type="button" key={value} className="chip" aria-pressed={picked[g.kind] === value}
                  onClick={() =>
                    setPicked((p) => {
                      const n = { ...p };
                      if (n[g.kind] === value) delete n[g.kind];
                      else n[g.kind] = value;
                      return n;
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="field">
          <label htmlFor="cm">Комментарий (необязательно)</label>
          <textarea id="cm" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div className="field">
          <input
            ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn ghost" onClick={() => input.current?.click()}>
            <Camera size={18} aria-hidden /> {file ? `Фото: ${file.name}` : 'Добавить фото (необязательно)'}
          </button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary" disabled={!can || busy}>
            {busy ? 'Отправляем…' : 'Отправить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
