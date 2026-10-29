import { z } from 'zod';

export const SPRING_STATUS = ['exceed', 'ok', 'not_sampled'] as const;
export type SpringStatus = (typeof SPRING_STATUS)[number];

export const SpringSchema = z.object({
  slug: z.string(),
  spring_id: z.string(),
  number: z.string(),
  name: z.string(),
  adm_area: z.string(),
  district: z.string(),
  location: z.string(),
  lon: z.number(),
  lat: z.number(),
  status: z.enum(SPRING_STATUS),
  status_year: z.number().int(),
  last_sample_year: z.number().int().nullable(),
  never_sampled: z.boolean(),
  coord_drift_m: z.number(),
  history: z.array(z.object({ year: z.number().int(), status: z.enum(SPRING_STATUS) })),
  source_global_ids: z.array(z.number()),
  updated_from_source_at: z.string(),
});
export type Spring = z.infer<typeof SpringSchema>;

export const UserSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  avatar_id: z.string().optional(),
  device_token_hash: z.string().optional(),
  fingerprint_hash: z.string().nullable().optional(),
  created_at: z.string(),
  last_seen_at: z.string().optional(),
  name_changed_at: z.string().nullable().optional(),
  is_sample: z.boolean().default(false),
});
export type User = z.infer<typeof UserSchema>;

export const OBS_VALUES = {
  flow: ['flowing', 'weak', 'frozen', 'dry'],
  access: ['cleared', 'icy', 'blocked'],
  cleanliness: ['clean', 'litter', 'damaged'],
  visit: ['visited'],
  location_check: ['confirmed', 'wrong'],
} as const;
export type ObsKind = keyof typeof OBS_VALUES;

export const ObservationSchema = z.object({
  id: z.string(),
  spring_id: z.string(),
  user_id: z.string(),
  kind: z.enum(['flow', 'access', 'cleanliness', 'visit', 'location_check']),
  value: z.string(),
  comment: z.string().nullable().optional(),
  photo_ids: z.array(z.string()).default([]),
  created_at: z.string(),
  is_sample: z.boolean().default(false),
  affects_map: z.boolean().default(true),
  location: z.object({ lon: z.number(), lat: z.number() }).optional(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const PhotoSchema = z.object({
  id: z.string(),
  spring_id: z.string(),
  user_id: z.string(),
  file: z.string(),
  thumb: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  season: z.string(),
  caption: z.string().nullable().optional(),
  created_at: z.string(),
  is_sample: z.boolean().default(false),
});
export type Photo = z.infer<typeof PhotoSchema>;

export const SubscriptionSchema = z.object({
  user_id: z.string(),
  spring_id: z.string(),
  slug: z.string(),
  created_at: z.string(),
  last_seen_at: z.string(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const HiddenSchema = z.object({
  entity: z.enum(['observations', 'photos']),
  id: z.string(),
  reason: z.string().nullable().optional(),
  created_at: z.string(),
});
export type Hidden = z.infer<typeof HiddenSchema>;

export const SyncStateSchema = z.object({
  last_attempt_at: z.string().nullable().default(null),
  last_success_at: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  rows: z.number().nullable().default(null),
  springs: z.number().nullable().default(null),
});
export type SyncState = z.infer<typeof SyncStateSchema>;
