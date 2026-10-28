import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, type Achievement, type CheckinResult, type Habit, type User } from './api';
import { AuthScreen } from './components/AuthScreen';
import { TodayView } from './components/TodayView';
import { StatsView } from './components/StatsView';
import { AchievementsView } from './components/AchievementsView';
import { NotificationsButton } from './components/NotificationsButton';

type Tab = 'today' | 'stats' | 'achievements';
export interface Toast { id: number; kind: 'xp' | 'achievement'; text: string; emoji: string }

let toastId = 0;

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(!!getToken());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [tab, setTab] = useState<Tab>('today');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setHabits([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    Promise.all([api.me(), api.habits()])
      .then(([m, h]) => {
        setUser(m.user);
        setHabits(h.habits);
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [logout]);

  const toast = useCallback((items: Omit<Toast, 'id'>[]) => {
    const withIds = items.map((t) => ({ ...t, id: ++toastId }));
    setToasts((cur) => [...cur, ...withIds]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => !withIds.some((w) => w.id === t.id))), 4000);
  }, []);

  const announce = useCallback(
    (xpGained: number, achievements: Achievement[]) => {
      const items: Omit<Toast, 'id'>[] = [];
      if (xpGained > 0) items.push({ kind: 'xp', emoji: '✨', text: `+${xpGained} XP` });
      for (const a of achievements) items.push({ kind: 'achievement', emoji: a.emoji, text: `Достижение: ${a.title}` });
      if (items.length) toast(items);
    },
    [toast],
  );

  const applyCheckin = useCallback(
    (r: CheckinResult) => {
      setHabits((cur) => cur.map((h) => (h.id === r.habit.id ? r.habit : h)));
      setUser(r.user);
      announce(r.xpGained, r.newAchievements);
    },
    [announce],
  );

  if (booting) return <div className="boot">🔥</div>;

  if (!user) {
    return (
      <AuthScreen
        onAuth={(token, u) => {
          setToken(token);
          setUser(u);
          api.habits().then((h) => setHabits(h.habits));
        }}
      />
    );
  }

  const span = user.nextLevelXp - user.levelStartXp;
  const pct = Math.min(100, Math.round(((user.xp - user.levelStartXp) / span) * 100));

  return (
    <div className="app">
      <header className="top">
        <div className="level">
          <div className="level-badge">{user.level}</div>
          <div className="level-info">
            <div className="level-title">{user.levelTitle}</div>
            <div className="xpbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="xpbar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="xp-text">
              {user.xp} / {user.nextLevelXp} XP
            </div>
          </div>
        </div>
        <div className="top-actions">
          <NotificationsButton />
          <button className="ghost" onClick={logout} title={user.email}>
            Выйти
          </button>
        </div>
      </header>

      <main>
        {tab === 'today' && (
          <TodayView habits={habits} setHabits={setHabits} setUser={setUser} onCheckin={applyCheckin} announce={announce} />
        )}
        {tab === 'stats' && <StatsView key={user.totalCheckins} />}
        {tab === 'achievements' && <AchievementsView key={user.xp} />}
      </main>

      <nav className="tabs">
        {(
          [
            ['today', '🔥', 'Сегодня'],
            ['stats', '📊', 'Статистика'],
            ['achievements', '🏆', 'Награды'],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.emoji}</span> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
