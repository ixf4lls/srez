import type { Plugin } from 'vite';
import { createMockApi } from './api';

export function mockApiPlugin(): Plugin {
  const api = createMockApi();
  return {
    name: 'srez-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Srez-Mock', 'true');
        try {
          let raw = '';
          request.setEncoding('utf8');
          for await (const chunk of request) {
            raw += chunk;
            if (raw.length > 65_536) {
              response.statusCode = 413;
              response.end(JSON.stringify({ error: 'Тестовый запрос слишком большой' }));
              return;
            }
          }
          const body: unknown = raw ? JSON.parse(raw) : {};
          const result = api.handle(request.method ?? 'GET', `/api${request.url ?? ''}`, body);
          await new Promise(resolve => setTimeout(resolve, 150));
          response.statusCode = result.status;
          response.end(JSON.stringify(result.body));
        } catch {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Проверьте формат запроса' }));
        }
      });
    },
  };
}
