import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

// База и ключи создаются при импорте модулей, поэтому папку данных задаём до него.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'habits-test-'));
process.env.DATA_DIR = dataDir;

const { createApp } = await import('./app.js');
const { db } = await import('./db.js');
const { addDays, utcToday } = await import('./dates.js');
const { runReminders } = await import('./push.js');
const { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } = await import('./seed.js');

let server: Server;
let base: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

let counter = 0;
async function newUser() {
  const email = `user${++counter}@test.ru`;
  const r = await call('POST', '/auth/register', { email, password: 'secret1' });
  assert.equal(r.status, 201);
  return { email, token: r.body.token as string };
}

const dailyHabit = { name: 'Бег', emoji: '🏃', scheduleType: 'days', days: [0, 1, 2, 3, 4, 5, 6] };
const today = utcToday();

async function newHabit(token: string, extra: object = {}) {
  const r = await call('POST', '/habits', { ...dailyHabit, today, ...extra }, token);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.habit as { id: number };
}

describe('С-1: регистрация и вход', () => {
  test('регистрация возвращает токен и пользователя с 0 XP', async () => {
    const r = await call('POST', '/auth/register', { email: 'Reg@Test.ru', password: 'secret1' });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, 'reg@test.ru');
    assert.equal(r.body.user.xp, 0);
    assert.equal(r.body.user.level, 1);
  });

  test('пароль хранится как bcrypt-хеш', () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('reg@test.ru') as { password_hash: string };
    assert.match(row.password_hash, /^\$2[aby]\$10\$/);
  });

  test('повторная регистрация того же email — 409', async () => {
    const r = await call('POST', '/auth/register', { email: 'reg@test.ru', password: 'secret1' });
    assert.equal(r.status, 409);
    assert.ok(r.body.error);
  });

  for (const [name, body] of [
    ['пустой email', { email: '', password: 'secret1' }],
    ['email без @', { email: 'abc', password: 'secret1' }],
    ['короткий пароль', { email: 'a@b.ru', password: '123' }],
    ['пароль не строка', { email: 'a@b.ru', password: 12345678 }],
    ['пустое тело', {}],
  ] as const) {
    test(`регистрация: ${name} — 400 с сообщением`, async () => {
      const r = await call('POST', '/auth/register', body);
      assert.equal(r.status, 400);
      assert.ok(r.body.error);
    });
  }

  test('вход с верным паролем', async () => {
    const r = await call('POST', '/auth/login', { email: 'REG@test.ru', password: 'secret1' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });

  test('вход с неверным паролем и с неизвестным email — 401', async () => {
    assert.equal((await call('POST', '/auth/login', { email: 'reg@test.ru', password: 'wrong' })).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: 'nobody@test.ru', password: 'secret1' })).status, 401);
  });

  test('защищённые маршруты без токена или с чужим токеном — 401', async () => {
    assert.equal((await call('GET', '/habits')).status, 401);
    assert.equal((await call('GET', '/habits', undefined, 'garbage')).status, 401);
    assert.equal((await call('GET', '/me', undefined, 'a.b.c')).status, 401);
  });
});

describe('Обработка некорректного ввода', () => {
  test('битый JSON — 400, а не падение сервера', async () => {
    const r = await call('POST', '/auth/login', '{"email": ');
    assert.equal(r.status, 400);
    assert.ok(r.body.error);
  });

  test('неизвестный маршрут API — 404 в JSON', async () => {
    const r = await call('GET', '/nope', undefined, (await newUser()).token);
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  });

  test('сервер продолжает отвечать после ошибок', async () => {
    assert.equal((await call('GET', '/habits', undefined, (await newUser()).token)).status, 200);
  });
});

describe('С-2: создание и изменение привычки', () => {
  test('создание по дням недели возвращает привычку с нулевой серией', async () => {
    const { token } = await newUser();
    const r = await call('POST', '/habits', { ...dailyHabit, days: [0, 2, 4], reminderTime: '08:30', today }, token);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.habit.days, [0, 2, 4]);
    assert.equal(r.body.habit.reminderTime, '08:30');
    assert.equal(r.body.habit.streak, 0);
  });

  test('создание «N раз в неделю»', async () => {
    const { token } = await newUser();
    const r = await call('POST', '/habits', { name: 'Чтение', scheduleType: 'weekly', timesPerWeek: 3, today }, token);
    assert.equal(r.status, 201);
    assert.equal(r.body.habit.scheduleType, 'weekly');
    assert.equal(r.body.habit.timesPerWeek, 3);
    assert.equal(r.body.habit.scheduledToday, true);
  });

  const invalid: [string, object][] = [
    ['пустое название', { ...dailyHabit, name: '   ' }],
    ['название длиннее 60 символов', { ...dailyHabit, name: 'x'.repeat(61) }],
    ['не выбран ни один день', { ...dailyHabit, days: [] }],
    ['день недели вне 0–6', { ...dailyHabit, days: [7] }],
    ['раз в неделю: 0', { name: 'A', scheduleType: 'weekly', timesPerWeek: 0 }],
    ['раз в неделю: 8', { name: 'A', scheduleType: 'weekly', timesPerWeek: 8 }],
    ['время напоминания неверного формата', { ...dailyHabit, reminderTime: '25:99' }],
  ];
  for (const [name, body] of invalid) {
    test(`отказ: ${name}`, async () => {
      const { token } = await newUser();
      const r = await call('POST', '/habits', body, token);
      assert.equal(r.status, 400);
      assert.ok(r.body.error);
    });
  }

  test('изменение привычки сохраняется', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    const r = await call('PUT', `/habits/${h.id}`, { ...dailyHabit, name: 'Новое имя', days: [1] }, token);
    assert.equal(r.status, 200);
    const list = await call('GET', `/habits?today=${today}`, undefined, token);
    assert.equal(list.body.habits[0].name, 'Новое имя');
    assert.deepEqual(list.body.habits[0].days, [1]);
  });

  test('удаление привычки удаляет и её отметки', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    assert.equal((await call('DELETE', `/habits/${h.id}`, undefined, token)).status, 200);
    assert.equal((await call('GET', '/habits', undefined, token)).body.habits.length, 0);
    const left = db.prepare('SELECT COUNT(*) n FROM checkins WHERE habit_id = ?').get(h.id) as { n: number };
    assert.equal(left.n, 0);
  });

  test('несуществующий и нечисловой id — 404', async () => {
    const { token } = await newUser();
    assert.equal((await call('PUT', '/habits/99999', dailyHabit, token)).status, 404);
    assert.equal((await call('DELETE', '/habits/abc', undefined, token)).status, 404);
    assert.equal((await call('PUT', '/habits/99999/checkin', { date: today, done: true }, token)).status, 404);
  });

  test('чужая привычка недоступна: 404 на изменение, удаление и отметку', async () => {
    const owner = await newUser();
    const other = await newUser();
    const h = await newHabit(owner.token);
    assert.equal((await call('PUT', `/habits/${h.id}`, dailyHabit, other.token)).status, 404);
    assert.equal((await call('DELETE', `/habits/${h.id}`, undefined, other.token)).status, 404);
    assert.equal((await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true }, other.token)).status, 404);
    assert.equal((await call('GET', '/habits', undefined, other.token)).body.habits.length, 0);
  });
});

describe('С-3 и С-4: отметки, серии, календарь', () => {
  test('отметка сохраняется, даёт 60 XP (10 + достижение «Первый шаг») и видна в списке', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    const r = await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.habit.doneToday, true);
    assert.equal(r.body.habit.streak, 1);
    assert.equal(r.body.xpGained, 60);
    assert.deepEqual(r.body.newAchievements.map((a: { code: string }) => a.code), ['first_checkin']);
    const list = await call('GET', `/habits?today=${today}`, undefined, token);
    assert.equal(list.body.habits[0].doneToday, true);
  });

  test('повторная отметка того же дня не начисляет XP второй раз', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    const again = await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    assert.equal(again.body.xpGained, 0);
    assert.equal(again.body.habit.totalDone, 1);
  });

  test('снятие отметки уменьшает счётчики и XP', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    const on = await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    const off = await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: false, today }, token);
    assert.equal(off.body.habit.doneToday, false);
    assert.equal(off.body.habit.streak, 0);
    assert.equal(off.body.user.totalCheckins, 0);
    assert.equal(off.body.user.xp, on.body.user.xp - 10);
  });

  test('три дня подряд дают серию 3 и достижение «Разгон»', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    let last: any;
    for (const back of [2, 1, 0]) {
      last = await call('PUT', `/habits/${h.id}/checkin`, { date: addDays(today, -back), done: true, today }, token);
    }
    assert.equal(last.body.habit.streak, 3);
    assert.ok(last.body.newAchievements.some((a: { code: string }) => a.code === 'streak_3'));
  });

  test('пропущенный день обрывает серию, рекорд сохраняется', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    let last: any;
    for (const back of [4, 3, 1, 0]) {
      last = await call('PUT', `/habits/${h.id}/checkin`, { date: addDays(today, -back), done: true, today }, token);
    }
    assert.equal(last.body.habit.streak, 2);
    assert.equal(last.body.habit.bestStreak, 2);
    assert.equal(last.body.habit.totalDone, 4);
  });

  test('календарь возвращает даты отметок за период', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    for (const back of [5, 3, 1]) {
      await call('PUT', `/habits/${h.id}/checkin`, { date: addDays(today, -back), done: true, today }, token);
    }
    const r = await call('GET', `/habits/${h.id}/checkins?from=${addDays(today, -4)}&to=${today}`, undefined, token);
    assert.deepEqual(r.body.dates, [addDays(today, -3), addDays(today, -1)]);
  });

  const badCheckins: [string, object][] = [
    ['будущая дата', { date: addDays(today, 5), done: true }],
    ['старше 30 дней', { date: addDays(today, -40), done: true }],
    ['неверный формат даты', { date: '28.10.2026', done: true }],
    ['несуществующая дата', { date: '2026-02-31', done: true }],
    ['done не boolean', { date: today, done: 'yes' }],
    ['пустое тело', {}],
  ];
  for (const [name, body] of badCheckins) {
    test(`отметка: ${name} — 400`, async () => {
      const { token } = await newUser();
      const h = await newHabit(token);
      const r = await call('PUT', `/habits/${h.id}/checkin`, body, token);
      assert.equal(r.status, 400);
      assert.ok(r.body.error);
    });
  }
});

describe('С-5: XP, уровни, достижения', () => {
  test('10 отметок: 10×10 XP + бонусы за «Первый шаг» и «Десятка» = 200 XP, уровень 3', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    let last: any;
    for (let back = 9; back >= 0; back--) {
      last = await call('PUT', `/habits/${h.id}/checkin`, { date: addDays(today, -back), done: true, today }, token);
    }
    const codes = (await call('GET', '/achievements', undefined, token)).body.achievements
      .filter((a: { unlockedAt: string | null }) => a.unlockedAt)
      .map((a: { code: string }) => a.code);
    assert.ok(codes.includes('first_checkin') && codes.includes('checkins_10') && codes.includes('streak_3') && codes.includes('streak_7'));
    assert.equal(last.body.user.totalCheckins, 10);
    assert.equal(last.body.user.xp, 100 + 50 * codes.length);
    assert.ok(last.body.user.level >= 3);
  });

  test('список достижений содержит 12 пунктов, открытые помечены', async () => {
    const { token } = await newUser();
    const r = await call('GET', '/achievements', undefined, token);
    assert.equal(r.body.achievements.length, 12);
    assert.ok(r.body.achievements.every((a: { unlockedAt: unknown }) => a.unlockedAt === null));
  });

  test('«Коллекционер» открывается при третьей привычке', async () => {
    const { token } = await newUser();
    await newHabit(token);
    await newHabit(token);
    const r = await call('POST', '/habits', { ...dailyHabit, today }, token);
    assert.deepEqual(r.body.newAchievements.map((a: { code: string }) => a.code), ['habits_3']);
  });

  test('«Идеальный день»: две привычки дня выполнены', async () => {
    const { token } = await newUser();
    const a = await newHabit(token);
    const b = await newHabit(token, { name: 'Вода' });
    await call('PUT', `/habits/${a.id}/checkin`, { date: today, done: true, today }, token);
    const r = await call('PUT', `/habits/${b.id}/checkin`, { date: today, done: true, today }, token);
    assert.ok(r.body.newAchievements.some((x: { code: string }) => x.code === 'perfect_day'));
  });
});

describe('С-6: статистика', () => {
  test('возвращает 8 недель, тепловую карту и данные по привычкам', async () => {
    const { token } = await newUser();
    const h = await newHabit(token);
    await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    const r = await call('GET', `/stats?today=${today}`, undefined, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.weeks.length, 8);
    assert.equal(r.body.heatmap[today], 1);
    assert.equal(r.body.perHabit.length, 1);
    assert.equal(r.body.perHabit[0].last30, 1);
  });

  test('статистика пользователя не содержит чужих данных', async () => {
    const a = await newUser();
    const b = await newUser();
    const h = await newHabit(a.token);
    await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, a.token);
    const r = await call('GET', `/stats?today=${today}`, undefined, b.token);
    assert.deepEqual(r.body.heatmap, {});
    assert.deepEqual(r.body.perHabit, []);
  });
});

describe('С-7: напоминания', () => {
  async function userWithReminder(reminderTime: string) {
    const { token, email } = await newUser();
    const h = await newHabit(token, { reminderTime });
    const userId = (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id;
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)').run(
      userId, `https://127.0.0.1:9/push/${email}`, 'BAD', 'BAD',
    );
    return { token, h };
  }
  const logged = (id: number) => db.prepare('SELECT COUNT(*) n FROM reminder_log WHERE habit_id = ?').get(id) as { n: number };
  const at = (hhmm: string) => new Date(`${today}T${hhmm}:00Z`);

  test('в назначенное время напоминание обрабатывается один раз в день', async () => {
    const { h } = await userWithReminder('09:00');
    await runReminders(at('09:05'));
    assert.equal(logged(h.id).n, 1);
    await runReminders(at('09:10'));
    assert.equal(logged(h.id).n, 1);
  });

  test('раньше назначенного времени и позже чем через час — не отправляется', async () => {
    const { h } = await userWithReminder('09:00');
    await runReminders(at('08:59'));
    await runReminders(at('10:00'));
    assert.equal(logged(h.id).n, 0);
  });

  test('уже выполненная привычка не напоминает', async () => {
    const { token, h } = await userWithReminder('09:00');
    await call('PUT', `/habits/${h.id}/checkin`, { date: today, done: true, today }, token);
    await runReminders(at('09:01'));
    assert.equal(logged(h.id).n, 0);
  });

  test('подписка на push: сохранение и отключение', async () => {
    const { token } = await newUser();
    const sub = { endpoint: 'https://example.invalid/sub1', keys: { p256dh: 'k1', auth: 'k2' } };
    assert.equal((await call('POST', '/push/subscribe', sub, token)).status, 201);
    assert.equal((await call('POST', '/push/subscribe', { endpoint: 'x' }, token)).status, 400);
    assert.equal((await call('POST', '/push/unsubscribe', { endpoint: sub.endpoint }, token)).status, 200);
    const n = db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint) as { n: number };
    assert.equal(n.n, 0);
  });

  test('публичный ключ VAPID отдаётся авторизованному пользователю', async () => {
    const { token } = await newUser();
    const r = await call('GET', '/push/key', undefined, token);
    assert.ok(r.body.publicKey.length > 40);
  });
});

describe('Демо-данные', () => {
  test('seedDemo создаёт пользователя с входом и историей; повторный вызов безопасен', async () => {
    await seedDemo();
    await seedDemo();
    const r = await call('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    assert.equal(r.status, 200);
    const habits = await call('GET', `/habits?today=${today}`, undefined, r.body.token);
    assert.equal(habits.body.habits.length, 3);
    assert.ok(habits.body.habits[0].streak === 12);
    const users = db.prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get(DEMO_EMAIL) as { n: number };
    assert.equal(users.n, 1);
  });
});

describe('НФТ: время ответа', () => {
  test('список привычек и статистика отвечают быстрее 500 мс при 20 привычках и 3 650 отметках', async () => {
    const { token, email } = await newUser();
    const userId = (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id;
    for (let i = 0; i < 20; i++) {
      const id = Number(
        db.prepare("INSERT INTO habits (user_id, name, schedule_type) VALUES (?, ?, 'days')").run(userId, `Привычка ${i}`).lastInsertRowid,
      );
      db.exec('BEGIN');
      for (let d = 0; d < 365; d++) db.prepare('INSERT INTO checkins (habit_id, date) VALUES (?, ?)').run(id, addDays(today, -d));
      db.exec('COMMIT');
    }
    for (const url of [`/habits?today=${today}`, `/stats?today=${today}`]) {
      const t0 = performance.now();
      const r = await call('GET', url, undefined, token);
      const ms = performance.now() - t0;
      assert.equal(r.status, 200);
      assert.ok(ms < 500, `${url}: ${Math.round(ms)} мс`);
    }
  });
});
