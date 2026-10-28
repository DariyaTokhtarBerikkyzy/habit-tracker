import { addDays, daysBetween, dow, weekStart } from './dates.js';

export interface Schedule {
  type: 'days' | 'weekly';
  days: number[];
  timesPerWeek: number;
}

export const isScheduled = (s: Schedule, date: string) =>
  s.type === 'weekly' ? true : s.days.includes(dow(date));

/**
 * Streak по дням недели: подряд выполненные запланированные дни (незапланированные пропускаются).
 * Streak по неделям: подряд недели, где выполнено не меньше timesPerWeek раз.
 * Сегодняшний день / текущая неделя ещё «в процессе» и серию не обрывают.
 */
export function computeStreaks(s: Schedule, done: Set<string>, today: string): { current: number; best: number } {
  if (done.size === 0) return { current: 0, best: 0 };
  const first = [...done].sort()[0];
  let run = 0;
  let best = 0;

  if (s.type === 'days') {
    const span = daysBetween(first, today);
    for (let i = 0; i <= span; i++) {
      const d = addDays(first, i);
      if (done.has(d)) {
        run++;
        best = Math.max(best, run);
      } else if (isScheduled(s, d) && d !== today) {
        run = 0;
      }
    }
    return { current: run, best };
  }

  const perWeek = new Map<string, number>();
  for (const d of done) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const thisWeek = weekStart(today);
  for (let w = weekStart(first); w <= thisWeek; w = addDays(w, 7)) {
    if ((perWeek.get(w) ?? 0) >= s.timesPerWeek) {
      run++;
      best = Math.max(best, run);
    } else if (w !== thisWeek) {
      run = 0;
    }
  }
  return { current: run, best };
}
