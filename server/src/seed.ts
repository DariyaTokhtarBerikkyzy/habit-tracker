import { db, transaction } from './db.js';
import { hashPassword } from './auth.js';
import { addDays, dow, utcToday } from './dates.js';

export const DEMO_EMAIL = 'demo@test.ru';
export const DEMO_PASSWORD = 'demo123';

interface DemoHabit {
  name: string;
  emoji: string;
  color: string;
  scheduleType: 'days' | 'weekly';
  days: number[];
  timesPerWeek: number;
  reminderTime: string | null;
  /** Какие из последних 30 дней отмечены (смещение назад от сегодня). */
  done: (offset: number, date: string) => boolean;
}

const DEMO_HABITS: DemoHabit[] = [
  // Ежедневная привычка: серия 12 дней, затем пропуск, до этого — отметки через день.
  { name: 'Пробежка', emoji: '🏃', color: '#ff5c8a', scheduleType: 'days', days: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 1, reminderTime: '08:00',
    done: (o) => o < 12 || (o >= 13 && o % 2 === 1) },
  // Недельная цель: 3 раза в неделю, последние недели выполнены.
  { name: 'Чтение', emoji: '📚', color: '#18a0fb', scheduleType: 'weekly', days: [], timesPerWeek: 3, reminderTime: null,
    done: (o) => o < 28 && o % 2 === 1 },
  // Только по будням.
  { name: 'Вода 2 литра', emoji: '💧', color: '#2ecc71', scheduleType: 'days', days: [0, 1, 2, 3, 4], timesPerWeek: 1, reminderTime: null,
    done: (o, d) => o > 0 && o < 20 && dow(d) < 5 },
];

/**
 * Создаёт демо-пользователя с историей отметок за 30 дней. Повторный запуск ничего не меняет.
 * Включается переменной SEED_DEMO=true — нужна для тестовых учётных записей из README.
 */
export async function seedDemo(): Promise<void> {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_EMAIL)) return;
  const hash = await hashPassword(DEMO_PASSWORD);
  const today = utcToday();
  transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, password_hash, tz) VALUES (?, ?, ?)')
      .run(DEMO_EMAIL, hash, 'UTC');
    const userId = Number(lastInsertRowid);
    for (const h of DEMO_HABITS) {
      const habitId = Number(
        db
          .prepare(
            'INSERT INTO habits (user_id, name, emoji, color, schedule_type, days, times_per_week, reminder_time, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          )
          .run(userId, h.name, h.emoji, h.color, h.scheduleType, h.days.length ? h.days.join(',') : '0,1,2,3,4,5,6', h.timesPerWeek, h.reminderTime, addDays(today, -30))
          .lastInsertRowid,
      );
      for (let o = 0; o < 30; o++) {
        const date = addDays(today, -o);
        if (h.done(o, date)) db.prepare('INSERT OR IGNORE INTO checkins (habit_id, date) VALUES (?, ?)').run(habitId, date);
      }
    }
  });
  console.log(`Демо-пользователь создан: ${DEMO_EMAIL}`);
}
