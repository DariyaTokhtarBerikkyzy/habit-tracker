import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStreaks, type Schedule } from './streak.js';

const daily: Schedule = { type: 'days', days: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 1 };
const workdays: Schedule = { type: 'days', days: [0, 1, 2, 3, 4], timesPerWeek: 1 };
const weekly3: Schedule = { type: 'weekly', days: [], timesPerWeek: 3 };

// 2026-10-26 — понедельник
test('ежедневная серия, сегодня ещё не отмечено — серия не обрывается', () => {
  const done = new Set(['2026-10-26', '2026-10-27']);
  assert.deepEqual(computeStreaks(daily, done, '2026-10-28'), { current: 2, best: 2 });
});

test('пропущенный запланированный день обрывает серию', () => {
  const done = new Set(['2026-10-24', '2026-10-26', '2026-10-27']);
  assert.deepEqual(computeStreaks(daily, done, '2026-10-27'), { current: 2, best: 2 });
});

test('выходные не обрывают серию по будням', () => {
  const done = new Set(['2026-10-23', '2026-10-26']); // пт и пн
  assert.deepEqual(computeStreaks(workdays, done, '2026-10-26'), { current: 2, best: 2 });
});

test('недельная цель: 3 раза в неделю', () => {
  const done = new Set(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-26']);
  // неделя 12–18 выполнена, 19–25 пропущена, текущая в процессе (1 из 3)
  assert.deepEqual(computeStreaks(weekly3, done, '2026-10-28'), { current: 0, best: 1 });
  done.add('2026-10-27');
  done.add('2026-10-28');
  assert.deepEqual(computeStreaks(weekly3, done, '2026-10-28'), { current: 1, best: 1 });
});

test('пустая история', () => {
  assert.deepEqual(computeStreaks(daily, new Set(), '2026-10-28'), { current: 0, best: 0 });
});
