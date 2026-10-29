import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { Collection } from './store.js';
import {
  SpringSchema, UserSchema, ObservationSchema, PhotoSchema, SubscriptionSchema, HiddenSchema,
  SyncStateSchema,
  type Spring, type User, type Observation, type Photo, type Subscription, type Hidden, type SyncState,
} from './schemas.js';
import { reduceGeojsonFeature } from '../sync/fromGeojson.js';

type Log = { info: (m: string) => void; warn: (m: string) => void };

export class Database {
  springs: Collection<Spring>;
  users: Collection<User>;
  observations: Collection<Observation>;
  photos: Collection<Photo>;
  subscriptions: Collection<Subscription>;
  hidden: Collection<Hidden>;
  syncState: SyncState = SyncStateSchema.parse({});
  /** Растёт при любой записи; по нему сбрасывается кэш агрегатов. */
  rev = 0;

  private bySlug = new Map<string, Spring>();
  private bySpringId = new Map<string, Spring>();
  private userByToken = new Map<string, User>();
  private userByFp = new Map<string, User>();

  constructor(readonly dir: string, private log: Log = console) {
    this.springs = new Collection(path.join(dir, 'springs'), SpringSchema, (s) => s.slug, log);
    this.users = new Collection(path.join(dir, 'users'), UserSchema, (u) => u.id, log);
    this.observations = new Collection(path.join(dir, 'observations'), ObservationSchema, (o) => o.id, log);
    this.photos = new Collection(path.join(dir, 'photos'), PhotoSchema, (p) => p.id, log);
    this.subscriptions = new Collection(
      path.join(dir, 'subscriptions'), SubscriptionSchema, (s) => `${s.user_id}__${s.slug}`, log);
    this.hidden = new Collection(path.join(dir, 'hidden'), HiddenSchema, (h) => `${h.entity}__${h.id}`, log);
  }

  get syncStatePath() {
    return path.join(this.dir, 'datamos', 'sync-state.json');
  }

  /** Первый старт на пустом томе: копируем образцы и опорный GeoJSON из seedDir. */
  async seed(seedDir: string) {
    if (path.resolve(seedDir) === path.resolve(this.dir)) return;
    for (const entity of ['users', 'observations', 'photos', 'source']) {
      const target = path.join(this.dir, entity);
      const exists = await fs.stat(target).then(() => true, () => false);
      if (exists) continue;
      // из образа берём только образцы: рабочие записи разработчика на прод не попадают
      const onlySamples = (src: string) => entity === 'source' || !path.extname(src) || path.basename(src).startsWith('sample');
      await fs.cp(path.join(seedDir, entity), target, { recursive: true, filter: onlySamples }).catch(() => {});
    }
  }

  async load() {
    await Promise.all([
      this.springs.load(), this.users.load(), this.observations.load(),
      this.photos.load(), this.subscriptions.load(), this.hidden.load(),
    ]);
    await fs.mkdir(path.join(this.dir, 'datamos'), { recursive: true });
    try {
      this.syncState = SyncStateSchema.parse(JSON.parse(await fs.readFile(this.syncStatePath, 'utf8')));
    } catch {
      // нет состояния синхронизации: нормально при первом старте
    }
    if (this.springs.size === 0) await this.seedSpringsFromGeojson();
    this.reindex();
  }

  private async seedSpringsFromGeojson() {
    const file = path.join(this.dir, 'source', 'springs.geojson');
    const geo = JSON.parse(await fs.readFile(file, 'utf8'));
    const now = new Date().toISOString();
    for (const f of geo.features) await this.springs.put(reduceGeojsonFeature(f, now));
    this.log.info(`springs: загружено ${geo.features.length} из data/source/springs.geojson`);
  }

  reindex() {
    this.bySlug.clear();
    this.bySpringId.clear();
    for (const s of this.springs.all()) {
      this.bySlug.set(s.slug, s);
      this.bySpringId.set(s.spring_id, s);
    }
    this.userByToken.clear();
    this.userByFp.clear();
    for (const u of this.users.all()) {
      if (u.device_token_hash) this.userByToken.set(u.device_token_hash, u);
      if (u.fingerprint_hash) this.userByFp.set(u.fingerprint_hash, u);
    }
    this.rev++;
  }

  touch() {
    this.rev++;
  }
  springBySlug(slug: string) {
    return this.bySlug.get(slug);
  }
  springBySpringId(id: string) {
    return this.bySpringId.get(id);
  }
  userByTokenHash(h: string) {
    return this.userByToken.get(h);
  }
  userByFingerprintHash(h: string) {
    return this.userByFp.get(h);
  }

  async saveUser(u: User) {
    for (const [k, v] of this.userByToken) if (v.id === u.id) this.userByToken.delete(k);
    for (const [k, v] of this.userByFp) if (v.id === u.id) this.userByFp.delete(k);
    if (u.device_token_hash) this.userByToken.set(u.device_token_hash, u);
    if (u.fingerprint_hash) this.userByFp.set(u.fingerprint_hash, u);
    await this.users.put(u);
  }

  isHidden(entity: 'observations' | 'photos', id: string) {
    return !!this.hidden.get(`${entity}__${id}`);
  }

  async saveSyncState(patch: Partial<SyncState>) {
    this.syncState = { ...this.syncState, ...patch };
    await writeFileAtomic(this.syncStatePath, JSON.stringify(this.syncState, null, 2) + '\n');
  }
}
