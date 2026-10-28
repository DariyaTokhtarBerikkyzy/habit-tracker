import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { api } from './routes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', api);

  // Неизвестный путь API — JSON-ответ, а не HTML-страница.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
  });

  // В продакшене отдаём собранный клиент (npm run build).
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) =>
      req.method === 'GET' ? res.sendFile(path.join(clientDist, 'index.html')) : next(),
    );
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
    if (err?.type === 'entity.too.large') return void res.status(413).json({ error: 'Слишком большой запрос' });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
