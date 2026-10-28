import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { dataDir, db } from './db.js';
import { isScheduled } from './streak.js';
import { scheduleOf, type HabitRow } from './service.js';

function loadVapid(): { publicKey: string; privateKey: string } {
  const file = path.join(dataDir, 'vapid.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys));
  return keys;
}

const vapid = loadVapid();
export const publicKey = vapid.publicKey;
webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

interface Sub { id: number; endpoint: string; p256dh: string; auth: string }

export async function sendToUser(userId: number, payload: { title: string; body: string; url: string }): Promise<number> {
  const subs = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as unknown as Sub[];
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      else console.error('push failed:', e?.statusCode ?? e);
    }
  }
  return sent;
}

/** Локальные дата и время пользователя в его часовом поясе. */
export function localNow(tz: string, at = new Date()): { date: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    return localNow('UTC', at);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Раз в минуту шлёт напоминание о невыполненных привычках; окно 60 минут переживает кратковременный простой сервера. */
export async function runReminders(): Promise<void> {
  const rows = db
    .prepare(
      `SELECT h.*, u.tz FROM habits h JOIN users u ON u.id = h.user_id
       WHERE h.reminder_time IS NOT NULL
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = h.user_id)`,
    )
    .all() as unknown as (HabitRow & { tz: string })[];

  for (const h of rows) {
    const { date, time } = localNow(h.tz);
    const late = minutes(time) - minutes(h.reminder_time!);
    if (late < 0 || late >= 60) continue;
    if (!isScheduled(scheduleOf(h), date)) continue;
    if (db.prepare('SELECT 1 FROM reminder_log WHERE habit_id = ? AND date = ?').get(h.id, date)) continue;
    if (db.prepare('SELECT 1 FROM checkins WHERE habit_id = ? AND date = ?').get(h.id, date)) continue;
    db.prepare('INSERT OR IGNORE INTO reminder_log (habit_id, date) VALUES (?, ?)').run(h.id, date);
    await sendToUser(h.user_id, { title: `${h.emoji} ${h.name}`, body: 'Пора отметить привычку — не прерывай серию! 🔥', url: '/' });
  }
}

export function startReminders(): void {
  setInterval(() => runReminders().catch((e) => console.error('reminders:', e)), 60_000);
}
