import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type { ZodType } from 'zod';

type Log = { warn: (msg: string) => void };

/** Сущность = папка, экземпляр = JSON-файл. Чтение из памяти, запись в память и на диск через очередь. */
export class Collection<T> {
  private items = new Map<string, T>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly dir: string,
    private schema: ZodType<T>,
    private keyOf: (item: T) => string,
    private log: Log = console,
  ) {}

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const names = await fs.readdir(this.dir);
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8'));
        const parsed = this.schema.safeParse(raw);
        if (!parsed.success) {
          this.log.warn(`${this.dir}/${name}: невалидный файл пропущен`);
          continue;
        }
        this.items.set(this.keyOf(parsed.data), parsed.data);
      } catch (e) {
        this.log.warn(`${this.dir}/${name}: не удалось прочитать (${(e as Error).message})`);
      }
    }
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }
  all(): T[] {
    return [...this.items.values()];
  }
  get size(): number {
    return this.items.size;
  }

  fileName(key: string): string {
    return `${key.replace(/[\/:*?"<>|]/g, '_')}.json`;
  }

  put(item: T): Promise<void> {
    const key = this.keyOf(item);
    this.items.set(key, item);
    return this.enqueue(() =>
      writeFileAtomic(path.join(this.dir, this.fileName(key)), JSON.stringify(item, null, 2) + '\n'),
    );
  }

  remove(key: string): Promise<void> {
    this.items.delete(key);
    return this.enqueue(() => fs.rm(path.join(this.dir, this.fileName(key)), { force: true }));
  }

  flush(): Promise<unknown> {
    return this.queue;
  }

  private enqueue(job: () => Promise<unknown>): Promise<void> {
    const next = this.queue.then(job, job).then(() => undefined);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
