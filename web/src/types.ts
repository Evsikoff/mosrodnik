export type Status = 'exceed' | 'ok' | 'not_sampled';
export type Flow = 'flowing' | 'weak' | 'frozen' | 'dry' | 'unknown';

export interface SpringProps {
  slug: string;
  spring_id: string;
  number: string;
  name: string;
  adm_area: string;
  district: string;
  location: string;
  status: Status;
  status_year: number;
  last_sample_year: number | null;
  never_sampled: boolean;
  coord_drift_m: number;
  user_flow: Flow;
  user_access: string;
  user_cleanliness: string;
  user_flow_at: string | null;
  user_access_at: string | null;
  user_cleanliness_at: string | null;
  visits_30d: number;
  photos_count: number;
  observations_count: number;
  last_activity_at: string | null;
  frost_level: 0 | 1 | 2 | 3;
}

export interface SpringFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SpringProps;
}

export interface Author {
  id: string;
  name: string;
  avatar: string | null;
  is_sample: boolean;
}

export interface Observation {
  id: string;
  spring_id: string;
  user_id: string;
  kind: 'flow' | 'access' | 'cleanliness' | 'visit' | 'location_check';
  value: string;
  comment?: string | null;
  photo_ids: string[];
  created_at: string;
  is_sample: boolean;
  location?: { lon: number; lat: number };
  author: Author;
}

export interface Photo {
  id: string;
  spring_id: string;
  file: string;
  thumb?: string;
  width?: number;
  height?: number;
  season: string;
  caption?: string | null;
  created_at: string;
  is_sample: boolean;
  author: Author;
}

export interface Aggregate {
  user_flow: Flow;
  user_access: string;
  user_cleanliness: string;
  user_flow_at: string | null;
  user_access_at: string | null;
  user_cleanliness_at: string | null;
  visits_30d: number;
  photos_count: number;
  observations_count: number;
  last_activity_at: string | null;
  frost_level: 0 | 1 | 2 | 3;
}

export interface SpringDetail {
  spring: {
    slug: string; spring_id: string; number: string; name: string; adm_area: string; district: string;
    location: string; lon: number; lat: number; status: Status; status_year: number;
    last_sample_year: number | null; never_sampled: boolean; coord_drift_m: number;
    history: { year: number; status: Status }[];
  };
  aggregate: Aggregate;
  observations: Observation[];
  photos: Photo[];
  subscribed: boolean;
  samples_shown: boolean;
}

export interface User {
  id: string;
  display_name: string;
  avatar: string | null;
}

export interface Filters {
  status: string[];
  age: string[];
  flow: string[];
  adm: string[];
  photo: boolean;
  mine: boolean;
  q: string;
}
