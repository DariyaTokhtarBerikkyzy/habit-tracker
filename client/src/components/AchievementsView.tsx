import { useEffect, useState } from 'react';
import { api, type Achievement } from '../api';

export function AchievementsView() {
  const [items, setItems] = useState<Achievement[] | null>(null);

  useEffect(() => {
    api.achievements().then((r) => setItems(r.achievements));
  }, []);

  if (!items) return <div className="muted">Загрузка…</div>;
  const got = items.filter((a) => a.unlockedAt).length;

  return (
    <section>
      <div className="section-head">
        <h2>Достижения</h2>
        <span className="badge">{got}/{items.length}</span>
      </div>
      <ul className="ach-grid">
        {items.map((a) => (
          <li key={a.code} className={`card ach ${a.unlockedAt ? 'got' : 'locked'}`}>
            <div className="ach-emoji">{a.unlockedAt ? a.emoji : '🔒'}</div>
            <strong>{a.title}</strong>
            <small>{a.description}</small>
            <small className="ach-xp">+{a.bonusXp} XP</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
