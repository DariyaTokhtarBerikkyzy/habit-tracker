import { useEffect, useState } from 'react';
import { api } from '../api';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';

export function NotificationsButton() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s && Notification.permission === 'granted')).catch(() => {});
  }, []);

  if (!pushSupported()) return null;

  async function toggle() {
    setMsg('');
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        await enablePush();
        setOn(true);
        await api.pushTest().catch(() => {});
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось включить уведомления');
      setTimeout(() => setMsg(''), 4000);
    }
  }

  return (
    <>
      <button className="ghost" onClick={toggle} title="Напоминания в браузере">
        {on ? '🔔 Вкл' : '🔕 Выкл'}
      </button>
      {msg && <div className="inline-error">{msg}</div>}
    </>
  );
}
