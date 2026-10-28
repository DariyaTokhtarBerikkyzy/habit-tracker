import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { api } from './routes.js';
import { startReminders } from './push.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

// В продакшене отдаём собранный клиент (npm run build).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) =>
    req.method === 'GET' ? res.sendFile(path.join(clientDist, 'index.html')) : next(),
  );
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API: http://localhost:${port}`));
startReminders();
