import type { Observation, Photo, SpringDetail, SpringFeature, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет и повторите.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Что-то пошло не так.');
  }
  return data as T;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: SpringFeature[];
}

export const api = {
  springs: () => request<FeatureCollection>('GET', '/api/springs'),
  spring: (slug: string) => request<SpringDetail>('GET', `/api/springs/${slug}`),
  session: (device_token: string, fingerprint_hash: string | null) =>
    request<{ user: User }>('POST', '/api/session', { device_token, fingerprint_hash }),
  rename: (display_name: string) => request<{ user: User }>('PATCH', '/api/me', { display_name }),
  observe: (
    slug: string,
    body: { kind: string; value: string; comment?: string | null; photo_ids?: string[]; location?: { lon: number; lat: number } },
  ) => request<{ observation: Observation; feature: SpringFeature }>('POST', `/api/springs/${slug}/observations`, body),
  uploadPhoto: (slug: string, file: File, caption?: string) => {
    const form = new FormData();
    if (caption) form.append('caption', caption);
    form.append('file', file);
    return request<{ photo: Photo; feature: SpringFeature }>('POST', `/api/springs/${slug}/photos`, undefined, form);
  },
  subscribe: (slug: string) => request<{ subscribed: boolean }>('PUT', `/api/springs/${slug}/subscription`, {}),
  unsubscribe: (slug: string) => request<{ subscribed: boolean }>('DELETE', `/api/springs/${slug}/subscription`),
  mySubscriptions: () =>
    request<{ subscriptions: { slug: string; name: string; number: string; new_observations: number; new_photos: number }[] }>(
      'GET', '/api/me/subscriptions'),
  stats: () => request<Record<string, any>>('GET', '/api/stats'),
};
