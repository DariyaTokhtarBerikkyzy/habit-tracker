import { Router, type Request, type Response } from 'express';
import { db, transaction } from './db.js';
import { checkPassword, hashPassword, requireAuth, signToken } from './auth.js';
import { addDays, isDate, utcToday } from './dates.js';
import {
  achievementList, evaluateAchievements, getHabitRow, habitView, listHabits, statsView, userView,
} from './service.js';
import { publicKey, sendToUser } from './push.js';

export const api = Router();

const uid = (res: Response) => res.locals.userId as number;
const todayOf = (req: Request): string => {
  const t = req.query.today ?? req.body?.today;
  return isDate(t) ? t : utcToday();
};
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });

function validTz(tz: unknown): string {
  if (typeof tz !== 'string') return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// ---------- Авторизация ----------

api.post('/auth/register', async (req, res) => {
  const { email, password, tz } = req.body ?? {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Некорректный email');
  if (typeof password !== 'string' || password.length < 6) return fail(res, 400, 'Пароль — минимум 6 символов');
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) return fail(res, 409, 'Этот email уже зарегистрирован');
  const info = db
    .prepare('INSERT INTO users (email, password_hash, tz) VALUES (?, ?, ?)')
    .run(normalized, await hashPassword(password), validTz(tz));
  const id = Number(info.lastInsertRowid);
  res.status(201).json({ token: signToken(id), user: userView(id) });
});

api.post('/auth/login', async (req, res) => {
  const { email, password, tz } = req.body ?? {};
  const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(String(email ?? '').trim().toLowerCase()) as
    | { id: number; password_hash: string }
    | undefined;
  if (!row || typeof password !== 'string' || !(await checkPassword(password, row.password_hash))) {
    return fail(res, 401, 'Неверный email или пароль');
  }
  if (tz) db.prepare('UPDATE users SET tz = ? WHERE id = ?').run(validTz(tz), row.id);
  res.json({ token: signToken(row.id), user: userView(row.id) });
});

api.use(requireAuth);

api.get('/me', (req, res) => {
  const tz = req.query.tz;
  if (tz) db.prepare('UPDATE users SET tz = ? WHERE id = ?').run(validTz(tz), uid(res));
  res.json({ user: userView(uid(res)) });
});

// ---------- Привычки ----------

interface HabitInput {
  name: string;
  emoji: string;
  color: string;
  scheduleType: 'days' | 'weekly';
  days: string;
  timesPerWeek: number;
  reminderTime: string | null;
}

function parseHabit(body: any): HabitInput | string {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60) return 'Название: от 1 до 60 символов';
  const scheduleType = body.scheduleType === 'weekly' ? 'weekly' : 'days';
  let days = '0,1,2,3,4,5,6';
  if (scheduleType === 'days') {
    const list: number[] = Array.isArray(body.days) ? [...new Set<number>(body.days.map(Number))] : [];
    if (list.length === 0 || list.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Выбери хотя бы один день недели';
    days = list.sort().join(',');
  }
  const timesPerWeek = scheduleType === 'weekly' ? Number(body.timesPerWeek) : 1;
  if (!Number.isInteger(timesPerWeek) || timesPerWeek < 1 || timesPerWeek > 7) return 'Раз в неделю: от 1 до 7';
  const reminderTime = body.reminderTime ? String(body.reminderTime) : null;
  if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) return 'Время напоминания: формат ЧЧ:ММ';
  const color = typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#7c5cff';
  const emoji = typeof body.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : '✅';
  return { name, emoji, color, scheduleType, days, timesPerWeek, reminderTime };
}

api.get('/habits', (req, res) => {
  res.json({ habits: listHabits(uid(res), todayOf(req)) });
});

api.post('/habits', (req, res) => {
  const h = parseHabit(req.body);
  if (typeof h === 'string') return fail(res, 400, h);
  const today = todayOf(req);
  const userId = uid(res);
  const info = db
    .prepare(
      'INSERT INTO habits (user_id, name, emoji, color, schedule_type, days, times_per_week, reminder_time, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(userId, h.name, h.emoji, h.color, h.scheduleType, h.days, h.timesPerWeek, h.reminderTime, today);
  const newAchievements = evaluateAchievements(userId, today);
  res.status(201).json({
    habit: listHabits(userId, today).find((x) => x.id === Number(info.lastInsertRowid)),
    user: userView(userId),
    newAchievements: newAchievements.map(({ test: _t, ...a }) => a),
  });
});

api.put('/habits/:id', (req, res) => {
  const row = getHabitRow(uid(res), Number(req.params.id));
  if (!row) return fail(res, 404, 'Привычка не найдена');
  const h = parseHabit(req.body);
  if (typeof h === 'string') return fail(res, 400, h);
  db.prepare(
    'UPDATE habits SET name=?, emoji=?, color=?, schedule_type=?, days=?, times_per_week=?, reminder_time=? WHERE id=?',
  ).run(h.name, h.emoji, h.color, h.scheduleType, h.days, h.timesPerWeek, h.reminderTime, row.id);
  res.json({ habit: listHabits(uid(res), todayOf(req)).find((x) => x.id === row.id) });
});

api.delete('/habits/:id', (req, res) => {
  const row = getHabitRow(uid(res), Number(req.params.id));
  if (!row) return fail(res, 404, 'Привычка не найдена');
  db.prepare('DELETE FROM habits WHERE id = ?').run(row.id);
  res.json({ user: userView(uid(res)) });
});

// ---------- Отметки ----------

api.put('/habits/:id/checkin', (req, res) => {
  const userId = uid(res);
  const row = getHabitRow(userId, Number(req.params.id));
  if (!row) return fail(res, 404, 'Привычка не найдена');
  const { date, done } = req.body ?? {};
  if (!isDate(date) || typeof done !== 'boolean') return fail(res, 400, 'Нужны date (YYYY-MM-DD) и done (boolean)');
  const today = todayOf(req);
  const now = utcToday();
  if (date > addDays(now, 1) || date > addDays(today, 1)) return fail(res, 400, 'Нельзя отмечать будущее');
  if (date < addDays(now, -31)) return fail(res, 400, 'Можно править только последние 30 дней');

  const xpBefore = userView(userId).xp;
  const newAchievements = transaction(() => {
    if (done) db.prepare('INSERT OR IGNORE INTO checkins (habit_id, date) VALUES (?, ?)').run(row.id, date);
    else db.prepare('DELETE FROM checkins WHERE habit_id = ? AND date = ?').run(row.id, date);
    return done ? evaluateAchievements(userId, today) : [];
  });
  const user = userView(userId);
  const dates = (db.prepare('SELECT date FROM checkins WHERE habit_id = ?').all(row.id) as { date: string }[]).map((r) => r.date);
  res.json({
    habit: habitView(row, new Set(dates), today),
    user,
    xpGained: user.xp - xpBefore,
    newAchievements: newAchievements.map(({ test: _t, ...a }) => a),
  });
});

api.get('/habits/:id/checkins', (req, res) => {
  const row = getHabitRow(uid(res), Number(req.params.id));
  if (!row) return fail(res, 404, 'Привычка не найдена');
  const from = isDate(req.query.from) ? req.query.from : '0000-01-01';
  const to = isDate(req.query.to) ? req.query.to : '9999-12-31';
  const rows = db
    .prepare('SELECT date FROM checkins WHERE habit_id = ? AND date BETWEEN ? AND ? ORDER BY date')
    .all(row.id, from, to) as { date: string }[];
  res.json({ dates: rows.map((r) => r.date) });
});

// ---------- Статистика и достижения ----------

api.get('/stats', (req, res) => res.json(statsView(uid(res), todayOf(req))));
api.get('/achievements', (_req, res) => res.json({ achievements: achievementList(uid(res)) }));

// ---------- Push ----------

api.get('/push/key', (_req, res) => res.json({ publicKey }));

api.post('/push/subscribe', (req, res) => {
  const { endpoint, keys } = req.body ?? {};
  if (typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) return fail(res, 400, 'Некорректная подписка');
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(uid(res), endpoint, keys.p256dh, keys.auth);
  res.status(201).json({ ok: true });
});

api.post('/push/unsubscribe', (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body?.endpoint ?? ''), uid(res));
  res.json({ ok: true });
});

api.post('/push/test', async (_req, res) => {
  const sent = await sendToUser(uid(res), { title: 'Привычки', body: 'Уведомления работают! 🎉', url: '/' });
  if (sent === 0) return fail(res, 404, 'Нет активных подписок на уведомления');
  res.json({ sent });
});
