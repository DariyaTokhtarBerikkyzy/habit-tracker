import { useEffect, useState } from 'react';
import { api, toISO, type Stats } from '../api';

const HEAT_WEEKS = 15;

function heatLevel(n: number, max: number) {
  if (n === 0) return 0;
  return Math.min(4, Math.ceil((n / Math.max(max, 1)) * 4));
}

export function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.stats().then(setStats);
  }, []);

  if (!stats) return <div className="muted">Загрузка…</div>;
  if (stats.perHabit.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-emoji">📊</div>
        <p>Статистика появится, когда заведёшь первую привычку.</p>
      </div>
    );
  }

  // Сетка тепловой карты: столбцы — недели (с понедельника), строки — дни.
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 7 * (HEAT_WEEKS - 1));
  const max = Math.max(0, ...Object.values(stats.heatmap));
  const columns = Array.from({ length: HEAT_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      return { date: toISO(day), future: day > end };
    }),
  );

  return (
    <section>
      <div className="section-head"><h2>Статистика</h2></div>

      <div className="card">
        <h3>Активность</h3>
        <div className="heat" role="img" aria-label="Тепловая карта отметок за последние недели">
          {columns.map((col, i) => (
            <div key={i} className="heat-col">
              {col.map((c) => (
                <div
                  key={c.date}
                  className={`heat-cell l${c.future ? 0 : heatLevel(stats.heatmap[c.date] ?? 0, max)} ${c.future ? 'future' : ''}`}
                  title={`${c.date}: ${stats.heatmap[c.date] ?? 0}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Выполнение по неделям</h3>
        <div className="bars">
          {stats.weeks.map((w) => {
            const rate = w.planned ? Math.round((w.done / w.planned) * 100) : 0;
            return (
              <div key={w.weekStart} className="bar-col" title={`${w.done} из ${w.planned}`}>
                <span className="bar-val">{w.planned ? `${rate}%` : '–'}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${rate}%` }} />
                </div>
                <small>{w.weekStart.slice(8)}.{w.weekStart.slice(5, 7)}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>По привычкам</h3>
        <ul className="per-habit">
          {stats.perHabit.map((h) => (
            <li key={h.id} style={{ ['--c' as string]: h.color }}>
              <span className="habit-emoji">{h.emoji}</span>
              <div className="per-habit-body">
                <div className="per-habit-top">
                  <strong>{h.name}</strong>
                  <small>🔥 {h.streak} · рекорд {h.bestStreak} · всего {h.totalDone}</small>
                </div>
                <div className="progress"><div style={{ width: `${Math.round((h.last30 / 30) * 100)}%` }} /></div>
                <small className="muted">{h.last30} из 30 последних дней</small>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
