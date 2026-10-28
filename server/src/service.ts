import { db } from './db.js';
import { addDays, dow, weekStart } from './dates.js';
import { computeStreaks, isScheduled, type Schedule } from './streak.js';
import {
  ACHIEVEMENTS, type AchievementDef, levelForXp, levelTitle, totalXp, xpForLevel, XP_PER_ACHIEVEMENT, type UserStats,
} from './gamification.js';

export interface HabitRow {
  id: number;
  user_id: number;
  name: string;
  emoji: string;
  color: string;
  schedule_type: 'days' | 'weekly';
  days: string;
  times_per_week: number;
  reminder_time: string | null;
  created_at: string;
}

export const scheduleOf = (h: HabitRow): Schedule => ({
  type: h.schedule_type,
  days: h.days ? h.days.split(',').map(Number) : [],
  timesPerWeek: h.times_per_week,
});

export function getHabitRow(userId: number, id: number): HabitRow | undefined {
  return db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(id, userId) as HabitRow | undefined;
}

function doneByHabit(userId: number): Map<number, Set<string>> {
  const rows = db
    .prepare('SELECT c.habit_id, c.date FROM checkins c JOIN habits h ON h.id = c.habit_id WHERE h.user_id = ?')
    .all(userId) as { habit_id: number; date: string }[];
  const map = new Map<number, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.habit_id)) map.set(r.habit_id, new Set());
    map.get(r.habit_id)!.add(r.date);
  }
  return map;
}

export function habitView(h: HabitRow, done: Set<string>, today: string) {
  const schedule = scheduleOf(h);
  const { current, best } = computeStreaks(schedule, done, today);
  const wk = weekStart(today);
  let weekCount = 0;
  for (let i = 0; i < 7; i++) if (done.has(addDays(wk, i))) weekCount++;
  return {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    color: h.color,
    scheduleType: schedule.type,
    days: schedule.days,
    timesPerWeek: schedule.timesPerWeek,
    reminderTime: h.reminder_time,
    streak: current,
    bestStreak: best,
    totalDone: done.size,
    doneToday: done.has(today),
    scheduledToday: isScheduled(schedule, today),
    weekCount,
  };
}

export function listHabits(userId: number, today: string) {
  const rows = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY id').all(userId) as unknown as HabitRow[];
  const done = doneByHabit(userId);
  return rows.map((h) => habitView(h, done.get(h.id) ?? new Set(), today));
}

export function userView(userId: number) {
  const u = db.prepare('SELECT id, email, tz FROM users WHERE id = ?').get(userId) as { id: number; email: string; tz: string };
  const { n: checkins } = db
    .prepare('SELECT COUNT(*) n FROM checkins c JOIN habits h ON h.id = c.habit_id WHERE h.user_id = ?')
    .get(userId) as { n: number };
  const { n: achieved } = db.prepare('SELECT COUNT(*) n FROM achievements WHERE user_id = ?').get(userId) as { n: number };
  const xp = totalXp(checkins, achieved);
  const level = levelForXp(xp);
  return {
    id: u.id,
    email: u.email,
    xp,
    level,
    levelTitle: levelTitle(level),
    levelStartXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    totalCheckins: checkins,
  };
}

/** Проверяет условия достижений, сохраняет новые и возвращает их. Бонусные XP считаются по числу достижений. */
export function evaluateAchievements(userId: number, today: string): AchievementDef[] {
  const habits = listHabits(userId, today);
  const dueToday = habits.filter((h) => h.scheduleType === 'days' && h.scheduledToday);
  const view = userView(userId);
  const stats: UserStats = {
    totalCheckins: view.totalCheckins,
    maxStreak: Math.max(0, ...habits.map((h) => h.streak)),
    habitCount: habits.length,
    perfectDay: dueToday.length >= 2 && dueToday.every((h) => h.doneToday),
    level: view.level,
  };
  const have = new Set(
    (db.prepare('SELECT code FROM achievements WHERE user_id = ?').all(userId) as { code: string }[]).map((r) => r.code),
  );
  const fresh = ACHIEVEMENTS.filter((a) => !have.has(a.code) && a.test(stats));
  const insert = db.prepare('INSERT OR IGNORE INTO achievements (user_id, code) VALUES (?, ?)');
  for (const a of fresh) insert.run(userId, a.code);
  // Бонусные XP могут поднять уровень и открыть level_5 — проверяем ещё раз.
  if (fresh.length > 0) {
    const more = evaluateAchievements(userId, today);
    return [...fresh, ...more];
  }
  return fresh;
}

export function achievementList(userId: number) {
  const unlocked = new Map(
    (db.prepare('SELECT code, unlocked_at FROM achievements WHERE user_id = ?').all(userId) as { code: string; unlocked_at: string }[]).map(
      (r) => [r.code, r.unlocked_at],
    ),
  );
  return ACHIEVEMENTS.map(({ test: _t, ...a }) => ({
    ...a,
    bonusXp: XP_PER_ACHIEVEMENT,
    unlockedAt: unlocked.get(a.code) ?? null,
  }));
}

export function statsView(userId: number, today: string) {
  const rows = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY id').all(userId) as unknown as HabitRow[];
  const done = doneByHabit(userId);

  const heatmap: Record<string, number> = {};
  for (const set of done.values()) for (const d of set) heatmap[d] = (heatmap[d] ?? 0) + 1;

  const weeks = [];
  const thisWeek = weekStart(today);
  for (let w = 7; w >= 0; w--) {
    const start = addDays(thisWeek, -7 * w);
    let doneSum = 0;
    let planned = 0;
    for (const h of rows) {
      const s = scheduleOf(h);
      const set = done.get(h.id) ?? new Set<string>();
      const created = h.created_at.slice(0, 10);
      if (addDays(start, 6) < created) continue;
      let count = 0;
      let sched = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        if (d > today) break;
        if (set.has(d)) count++;
        if (d >= created && s.type === 'days' && s.days.includes(dow(d))) sched++;
      }
      const target = s.type === 'weekly' ? s.timesPerWeek : sched;
      planned += target;
      doneSum += Math.min(count, target);
    }
    weeks.push({ weekStart: start, done: doneSum, planned });
  }

  const perHabit = listHabits(userId, today).map((h) => {
    const set = done.get(h.id) ?? new Set<string>();
    let last30 = 0;
    for (let i = 0; i < 30; i++) if (set.has(addDays(today, -i))) last30++;
    return { id: h.id, name: h.name, emoji: h.emoji, color: h.color, streak: h.streak, bestStreak: h.bestStreak, totalDone: h.totalDone, last30 };
  });

  return { heatmap, weeks, perHabit };
}
