import { useState, type FormEvent } from 'react';
import type { Habit, HabitInput } from '../api';

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const COLORS = ['#7c5cff', '#ff5c8a', '#ff9f43', '#2ecc71', '#18a0fb', '#e84393'];
const EMOJIS = ['🏃', '📚', '💧', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '🧹'];

export function HabitForm({
  habit, onSave, onCancel, onDelete,
}: {
  habit?: Habit;
  onSave: (h: HabitInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(habit?.name ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? '🏃');
  const [color, setColor] = useState(habit?.color ?? COLORS[0]);
  const [scheduleType, setScheduleType] = useState<'days' | 'weekly'>(habit?.scheduleType ?? 'days');
  const [days, setDays] = useState<number[]>(habit?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [timesPerWeek, setTimesPerWeek] = useState(habit?.timesPerWeek ?? 3);
  const [reminder, setReminder] = useState(!!habit?.reminderTime);
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? '09:00');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ name, emoji, color, scheduleType, days, timesPerWeek, reminderTime: reminder ? reminderTime : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setBusy(false);
    }
  }

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{habit ? 'Изменить привычку' : 'Новая привычка'}</h2>

        <label>
          Название
          <input value={name} maxLength={60} required autoFocus onChange={(e) => setName(e.target.value)} placeholder="Например, пробежка" />
        </label>

        <div className="field">
          <span>Иконка</span>
          <div className="chips">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={`chip ${emoji === e ? 'on' : ''}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Цвет</span>
          <div className="chips">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                className={`swatch ${color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span>Расписание</span>
          <div className="segmented">
            <button type="button" className={scheduleType === 'days' ? 'on' : ''} onClick={() => setScheduleType('days')}>
              По дням недели
            </button>
            <button type="button" className={scheduleType === 'weekly' ? 'on' : ''} onClick={() => setScheduleType('weekly')}>
              N раз в неделю
            </button>
          </div>
          {scheduleType === 'days' ? (
            <div className="chips">
              {WEEKDAYS.map((w, i) => (
                <button type="button" key={w} className={`chip ${days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>
                  {w}
                </button>
              ))}
            </div>
          ) : (
            <label className="inline">
              <input type="number" min={1} max={7} value={timesPerWeek} onChange={(e) => setTimesPerWeek(Number(e.target.value))} />
              раз(а) в неделю
            </label>
          )}
        </div>

        <div className="field">
          <label className="inline">
            <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
            Напоминать
            {reminder && <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />}
          </label>
          {reminder && <small className="muted">Включи 🔔 вверху, чтобы получать уведомления в браузере.</small>}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm('Удалить привычку вместе с историей?')) onDelete();
              }}
            >
              Удалить
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
