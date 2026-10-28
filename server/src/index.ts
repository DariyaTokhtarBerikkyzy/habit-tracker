import { createApp } from './app.js';
import { startReminders } from './push.js';
import { seedDemo } from './seed.js';

if (process.env.SEED_DEMO === 'true') await seedDemo();

const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => console.log(`API: http://localhost:${port}`));
startReminders();
