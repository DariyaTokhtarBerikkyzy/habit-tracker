import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, today, type Achievement, type CheckinResult, type Habit, type HabitInput, type User } from '../api';
import { HabitForm, WEEKDAYS } from './HabitForm';
import { HabitCalendar } from './HabitCalendar';

interface Props {
  habits: Habit[];
  setHabits: Dispatch<SetStateAction<Habit[]>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  onCheckin: (r: CheckinResult) => void;
  announce: (xp: number, a: Achievement[]) => void;
}

const subtitle = (h: Habit) => {
  if (h.scheduleType === 'weekly') return `${h.weekCount} из ${h.timesPerWeek} на этой неделе`;
  if (h.days.length === 7) return 'Каждый день';
  return h.days.map((d) => WEEKDAYS[d]).join(', ');
};

export function TodayView({ habits, setHabits, setUser, onCheckin, announce }: Props) {
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [opened, setOpened] = useState<Habit | null>(null);
  const [error, setError] = useState('');

  async function toggle(h: Habit) {
    setError('');
    try {
      onCheckin(await api.checkin(h.id, today(), !h.doneToday));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function save(input: HabitInput) {
    if (editing === 'new') {
      const r = await api.createHabit(input);
      setHabits((cur) => [...cur, r.habit]);
      setUser(r.user);
      announce(0, r.newAchievements);
    } else if (editing) {
      const r = await api.updateHabit(editing.id, input);
      setHabits((cur) => cur.map((h) => (h.id === r.habit.id ? r.habit : h)));
    }
    setEditing(null);
  }

  async function remove() {
    if (!editing || editing === 'new') return;
    const r = await api.deleteHabit(editing.id);
    setHabits((cur) => cur.filter((h) => h.id !== editing.id));
    setUser(r.user);
    setEditing(null);
    setOpened(null);
  }

  const due = habits.filter((h) => h.scheduledToday);
  const rest = habits.filter((h) => !h.scheduledToday);
  const doneCount = due.filter((h) => h.doneToday).length;

  const card = (h: Habit) => (
    <li key={h.id} className={`habit ${h.doneToday ? 'done' : ''}`} style={{ ['--c' as string]: h.color }}>
      <button className="habit-main" onClick={() => setOpened(h)}>
        <span className="habit-emoji">{h.emoji}</span>
        <span className="habit-text">
          <strong>{h.name}</strong>
          <small>{subtitle(h)}</small>
        </span>
        <span className={`streak ${h.streak > 0 ? 'hot' : ''}`} title={`Лучшая серия: ${h.bestStreak}`}>
          🔥 {h.streak}
          <small>{h.scheduleType === 'weekly' ? 'нед.' : 'дн.'}</small>
        </span>
      </button>
      <button
        className="check"
        aria-label={h.doneToday ? 'Снять отметку' : 'Отметить выполненным'}
        aria-pressed={h.doneToday}
        onClick={() => toggle(h)}
      >
        {h.doneToday ? '✓' : ''}
      </button>
    </li>
  );

  return (
    <section>
      <div className="section-head">
        <h2>Сегодня</h2>
        {due.length > 0 && (
          <span className="badge">
            {doneCount}/{due.length}
            {doneCount === due.length && ' 🎉'}
          </span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {habits.length === 0 ? (
        <div className="card empty">
          <div className="empty-emoji">🌱</div>
          <p>Пока нет привычек. Заведи первую — за каждую отметку дают XP!</p>
        </div>
      ) : (
        <>
          <ul className="habits">{due.map(card)}</ul>
          {rest.length > 0 && (
            <>
              <h3 className="muted-title">Не на сегодня</h3>
              <ul className="habits dim">{rest.map(card)}</ul>
            </>
          )}
        </>
      )}

      <button className="fab primary" onClick={() => setEditing('new')}>
        + Привычка
      </button>

      {editing && (
        <HabitForm
          habit={editing === 'new' ? undefined : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : remove}
        />
      )}

      {opened && (
        <HabitCalendar
          habit={habits.find((h) => h.id === opened.id) ?? opened}
          onClose={() => setOpened(null)}
          onCheckin={onCheckin}
          onEdit={() => {
            setEditing(habits.find((h) => h.id === opened.id) ?? opened);
            setOpened(null);
          }}
        />
      )}
    </section>
  );
}
