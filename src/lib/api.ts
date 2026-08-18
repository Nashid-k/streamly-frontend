import { Category, Movie, Episode, User, SearchResponse } from '../types';

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://streamly-backend-9q7i.onrender.com/api').trim().replace(/\/+$/, '');
const apiBaseUrl = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
const cache = new Map<string, { expiresAt: number; value: unknown }>();

const getPlatform = () => typeof window !== 'undefined' ? (localStorage.getItem('app_platform') || 'nflix') : 'nflix';

/** Returns stored auth token or null */
export const getAuthToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

async function request<T>(path: string, ttlMs: number, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured.');
  const key = `${init?.method || 'GET'}:${path}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  // Inject auth token if available
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  if (token && !headers['authorization']) {
    headers['authorization'] = `Bearer ${token}`;
  }

  try {
    const timeoutId = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('server-wakeup'));
      }
    }, 5000);

    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
    
    clearTimeout(timeoutId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('server-wakeup-done'));
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: unknown } | null;
      const message = typeof body?.message === 'string' ? body.message : `Request failed: ${response.status}`;
      throw new Error(message);
    }
    const value = await response.json() as T;
    
    if (cache.size >= 50) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });

    // ✈️ True PWA Offline Resilience: Persist JSON metadata to LocalStorage for zero-network playback
    if (typeof window !== 'undefined' && init?.method !== 'POST') {
      try {
        localStorage.setItem(`pwa_cache_${key}`, JSON.stringify(value));
      } catch (e) {} // ignore quota exceeded
    }

    return value;
  } catch (error) {
    // If network fails (airplane mode), aggressively return cached metadata for zero-interruption UX
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`pwa_cache_${key}`);
      if (stored) {
        console.warn(`[PWA] Network unavailable. Serving cached data for ${path}`);
        return JSON.parse(stored) as T;
      }
    }
    throw error;
  }
}

export const fetchFeaturedMovie = (p = getPlatform()) => request<Movie | null>(`/movies/featured?platform=${p}`, 300_000);
export const fetchCategories = (p = getPlatform()) => request<Category[]>(`/movies/categories?platform=${p}`, 300_000);
export const fetchTop10Movies = (p = getPlatform()) => request<Movie[]>(`/movies/top10?platform=${p}`, 300_000);
export const fetchMovieById = (id: string, p = getPlatform()) => request<Movie>(`/movies/${id}?platform=${p}`, 300_000);
export const fetchSeasonEpisodes = (id: string, season: number, p = getPlatform()) => request<Episode[]>(`/movies/${id}/season/${season}?platform=${p}`, 300_000);

export function searchMovies(query: string, genre?: string): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (genre) params.set('genre', genre);
  params.set('platform', getPlatform());
  return request<SearchResponse>(`/movies/search?${params}`, 120_000);
}

/** Pre-warms catalog data in the background for instant platform switching */
export function prewarmPlatformCatalogs() {
  if (typeof window === 'undefined') return;
  const current = getPlatform();
  const platforms: ('nflix' | 'nprime' | 'hotstar')[] = ['nflix', 'nprime', 'hotstar'];
  platforms.filter(p => p !== current).forEach(async (p) => {
    try {
      await Promise.allSettled([
        request(`/movies/categories?platform=${p}`, 300_000),
        request(`/movies/featured?platform=${p}`, 300_000),
        request(`/movies/top10?platform=${p}`, 300_000),
      ]);
    } catch (e) {}
  });
}

export const fetchUser = () => request<User>('/user', 300_000);

/** Clears only user-related cache entries (mylist, preferences, profile) */
function invalidateUserCache() {
  for (const key of Array.from(cache.keys())) {
    if (key.includes('/user') || key.includes('/auth')) cache.delete(key);
  }
}

export async function toggleMyListApi(movieId: string): Promise<{ myList: string[]; isSaved: boolean }> {
  const result = await request<{ myList: string[]; isSaved: boolean }>('/user/mylist/toggle', 0, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movieId }),
  });
  invalidateUserCache();
  return result;
}

export async function updateUserPreferencesApi(preferences: import('../types').UserPreferences) {
  const result = await request<any>('/user/preferences', 0, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  invalidateUserCache();
  return result;
}

export async function switchProfileApi(profileId: string): Promise<import('../types').UserProfile> {
  const result = await request<import('../types').UserProfile>(`/user/profile/${profileId}`, 0, { method: 'POST' });
  invalidateUserCache();
  return result;
}

// ─── Authentication ────────────────────────────────────────────────────────────

export async function loginApi(email: string, password: string) {
  return request<{ token: string; user: any }>('/auth/login', 0, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function registerApi(email: string, password: string, name: string) {
  return request<{ token: string; user: any }>('/auth/register', 0, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
}

export async function fetchAuthProfile() {
  return request<any>('/auth/me', 0);
}

// ─── Continue Watching (backend sync) ─────────────────────────────────────────

export interface ContinueWatchingItem {
  movieId: string;
  title: string;
  posterUrl: string;
  progressSeconds: number;
  durationSeconds: number;
  platform: string;
  updatedAt: number;
}

export async function fetchContinueWatchingApi(): Promise<ContinueWatchingItem[]> {
  try {
    const token = getAuthToken();
    if (token) {
      // Auth user: fetch from /auth/continue-watching
      return await request<ContinueWatchingItem[]>('/auth/continue-watching', 0);
    }
    // Guest: fetch from /user/continue-watching
    return await request<ContinueWatchingItem[]>('/user/continue-watching', 0);
  } catch {
    return [];
  }
}

export async function updateContinueWatchingApi(item: ContinueWatchingItem): Promise<void> {
  try {
    const token = getAuthToken();
    const endpoint = token ? '/auth/continue-watching' : '/user/continue-watching';
    await request<any>(endpoint, 0, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  } catch {
    // Silently fail — localStorage is the fallback
  }
}

export async function removeContinueWatchingApi(movieId: string): Promise<void> {
  try {
    const token = getAuthToken();
    const endpoint = token ? `/auth/continue-watching/${movieId}` : `/user/continue-watching/${movieId}`;
    await fetch(`${apiBaseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // Silently fail
  }
}

// ─── Recommendations ───────────────────────────────────────────────────────────

export async function fetchRecommendationsApi(movieId: string, platform?: string): Promise<Movie[]> {
  const p = platform || getPlatform();
  try {
    return await request<Movie[]>(`/movies/${movieId}/recommendations?platform=${p}`, 300_000);
  } catch {
    return [];
  }
}

// ─── Intro Timings ─────────────────────────────────────────────────────────────

export async function fetchIntroTimingsApi(
  movieId: string,
  season?: number,
  episode?: number,
  platform?: string,
): Promise<{ hasIntro: boolean; startSeconds: number; endSeconds: number }> {
  const p = platform || getPlatform();
  const params = new URLSearchParams({ platform: p });
  if (episode) params.set('episode', String(episode));
  
  try {
    return await request<{ hasIntro: boolean; startSeconds: number; endSeconds: number }>(
      `/movies/${movieId}/intro?${params.toString()}`,
      3600_000
    );
  } catch (e) {
    return { hasIntro: false, startSeconds: 0, endSeconds: 0 };
  }
}

export const fetchSkipIntroTiming = async (movieId: string, platform = getPlatform()) => {
  try {
    return await request<{ hasIntro: boolean; startSeconds: number; endSeconds: number }>(
      `/movies/${movieId}/skip-intro?platform=${platform}`,
      3600_000
    );
  } catch (e) {
    return { hasIntro: false, startSeconds: 0, endSeconds: 0 };
  }
};

export async function fetchAIRecommendations(historyTitles: string[]): Promise<string[]> {
  try {
    const res = await fetch('/api/ai-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: historyTitles })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch {
    return [];
  }
}
