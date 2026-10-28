import { useEffect, useState } from 'react';
import { api, pad, today, type CheckinResult, type Habit } from '../api';
import { WEEKDAYS } from './HabitForm';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function HabitCalendar({
  habit, onClose, onCheckin, onEdit,
}: {
  habit: Habit;
  onClose: () => void;
  onCheckin: (r: CheckinResult) => void;
  onEdit: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // неделя с понедельника
  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

  useEffect(() => {
    api.checkins(habit.id, from, to).then((r) => setDone(new Set(r.dates)));
  }, [habit.id, from, to]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function toggle(date: string) {
    setError('');
    const want = !done.has(date);
    try {
      const r = await api.checkin(habit.id, date, want);
      setDone((cur) => {
        const next = new Set(cur);
        if (want) next.add(date);
        else next.delete(date);
        return next;
      });
      onCheckin(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  const t = today();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" style={{ ['--c' as string]: habit.color }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <span className="habit-emoji">{habit.emoji}</span>
          <div>
            <h2>{habit.name}</h2>
            <small className="muted">
              Серия 🔥 {habit.streak} · рекорд {habit.bestStreak} · всего {habit.totalDone}
            </small>
          </div>
        </div>

        <div className="cal-nav">
          <button className="ghost" onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
          <strong>
            {MONTHS[month]} {year}
          </strong>
          <button className="ghost" onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-dow">{w}</div>
          ))}
          {cells.map((date, i) =>
            date === null ? (
              <div key={`e${i}`} />
            ) : (
              <button
                key={date}
                className={`cal-day ${done.has(date) ? 'on' : ''} ${date === t ? 'today' : ''}`}
                disabled={date > t}
                onClick={() => toggle(date)}
                aria-label={`${date}${done.has(date) ? ', выполнено' : ''}`}
              >
                {Number(date.slice(8))}
              </button>
            ),
          )}
        </div>
        <small className="muted">Нажми на день, чтобы отметить или снять (до 30 дней назад).</small>
        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button className="ghost" onClick={onEdit}>Изменить</button>
          <span className="spacer" />
          <button className="primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
