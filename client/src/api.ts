export interface User {
  id: number;
  email: string;
  xp: number;
  level: number;
  levelTitle: string;
  levelStartXp: number;
  nextLevelXp: number;
  totalCheckins: number;
}

export interface Habit {
  id: number;
  name: string;
  emoji: string;
  color: string;
  scheduleType: 'days' | 'weekly';
  days: number[];
  timesPerWeek: number;
  reminderTime: string | null;
  streak: number;
  bestStreak: number;
  totalDone: number;
  doneToday: boolean;
  scheduledToday: boolean;
  weekCount: number;
}

export interface HabitInput {
  name: string;
  emoji: string;
  color: string;
  scheduleType: 'days' | 'weekly';
  days: number[];
  timesPerWeek: number;
  reminderTime: string | null;
}

export interface Achievement {
  code: string;
  emoji: string;
  title: string;
  description: string;
  bonusXp?: number;
  unlockedAt?: string | null;
}

export interface CheckinResult {
  habit: Habit;
  user: User;
  xpGained: number;
  newAchievements: Achievement[];
}

export interface Stats {
  heatmap: Record<string, number>;
  weeks: { weekStart: string; done: number; planned: number }[];
  perHabit: { id: number; name: string; emoji: string; color: string; streak: number; bestStreak: number; totalDone: number; last30: number }[];
}

const TOKEN_KEY = 'ht_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Локальная дата пользователя — сервер использует её как «сегодня». */
export const today = () => toISO(new Date());
export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export class ApiError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(data.error ?? 'Что-то пошло не так');
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string) => request<{ token: string; user: User }>('POST', '/auth/register', { email, password, tz: tz() }),
  login: (email: string, password: string) => request<{ token: string; user: User }>('POST', '/auth/login', { email, password, tz: tz() }),
  me: () => request<{ user: User }>('GET', `/me?tz=${encodeURIComponent(tz())}`),
  habits: () => request<{ habits: Habit[] }>('GET', `/habits?today=${today()}`),
  createHabit: (h: HabitInput) => request<{ habit: Habit; user: User; newAchievements: Achievement[] }>('POST', '/habits', { ...h, today: today() }),
  updateHabit: (id: number, h: HabitInput) => request<{ habit: Habit }>('PUT', `/habits/${id}`, { ...h, today: today() }),
  deleteHabit: (id: number) => request<{ user: User }>('DELETE', `/habits/${id}`),
  checkin: (id: number, date: string, done: boolean) => request<CheckinResult>('PUT', `/habits/${id}/checkin`, { date, done, today: today() }),
  checkins: (id: number, from: string, to: string) => request<{ dates: string[] }>('GET', `/habits/${id}/checkins?from=${from}&to=${to}`),
  stats: () => request<Stats>('GET', `/stats?today=${today()}`),
  achievements: () => request<{ achievements: Achievement[] }>('GET', '/achievements'),
  pushKey: () => request<{ publicKey: string }>('GET', '/push/key'),
  subscribe: (sub: PushSubscriptionJSON) => request<{ ok: true }>('POST', '/push/subscribe', sub),
  unsubscribe: (endpoint: string) => request<{ ok: true }>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ sent: number }>('POST', '/push/test'),
};
