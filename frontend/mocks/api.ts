import type { Analysis, Filters } from '../src/types.ts';
import { filterGroups, makeEntries, makeEntry, makeReport } from './fixtures.ts';
import type { MockEntry } from './fixtures.ts';

type Reply = { status: number; body: unknown };
type Input = { query?: string; title?: string; mode?: string; excludeWords?: string; expression?: string; confirmed?: boolean; filters?: Filters; filterLabels?: Filters; scenario?: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: structuredClone(body) });
const failure = (status: number, error: string) => reply(status, { error });

export function createMockApi(now = () => Date.now()) {
  let entries = new Map(makeEntries(now()).map(entry => [entry.analysis.id, entry]));
  const update = (entry: MockEntry) => { entry.analysis.updatedAt = new Date(now()).toISOString(); };
  const start = (entry: MockEntry) => {
    const a = entry.analysis;
    entry.jobStartedAt = now();
    a.status = a.stage = 'queued'; a.message = 'Тестовый сбор поставлен в очередь';
    a.collected = a.processed = a.failed = 0;
    delete a.report; delete a.completedAt;
    update(entry);
  };
  const advance = () => {
    for (const entry of entries.values()) {
      if (entry.deleted || entry.jobStartedAt === undefined) continue;
      const elapsed = now() - entry.jobStartedAt;
      if (elapsed < 1000) continue;
      const a = entry.analysis;
      a.status = 'running'; a.stage = 'details'; a.message = 'Загружаем тестовые описания вакансий';
      a.collected = Math.min(a.found, Math.floor(a.found * elapsed / 6000));
      a.processed = Math.min(a.collected, Math.floor(a.found * elapsed / 12000));
      update(entry);
      if (elapsed >= 12000) {
        entry.vacancies.forEach(v => { v.collectedAt = new Date(now()).toISOString(); });
        a.report = makeReport(entry.vacancies);
        a.processed = a.report.total; a.failed = a.found - a.processed;
        a.status = a.failed ? 'partial' : 'completed'; a.stage = 'done';
        a.message = 'Тестовый анализ готов'; a.completedAt = a.updatedAt;
        delete entry.jobStartedAt;
      }
    }
  };

  return {
    handle(method: string, rawPath: string, body: unknown = {}): Reply {
      advance();
      const path = new URL(rawPath, 'http://mock.local').pathname.replace(/\/$/, '');
      const input: Input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      if (path === '/api/mock/reset' && method === 'POST') {
        if (input.scenario && !['default', 'empty'].includes(input.scenario)) return failure(400, 'Неизвестный тестовый сценарий');
        entries = new Map((input.scenario === 'empty' ? [] : makeEntries(now())).map(entry => [entry.analysis.id, entry]));
        return reply(200, { ok: true, mock: true });
      }
      if (method === 'GET' && path === '/api/health') return reply(200, { ok: true, session: true, provider: 'mock', version: 'mock-1' });
      if (method === 'GET' && path === '/api/filters') return reply(200, { groups: filterGroups, fetchedAt: new Date(now()).toISOString(), source: 'Тестовые фильтры' });
      if (method === 'GET' && path === '/api/rates') return reply(200, { rates: { RUB: 1, USD: 95, EUR: 103, KZT: 0.2, BYN: 29 }, date: new Date(now()).toISOString().slice(0, 10), source: 'Тестовые курсы', sourceUrl: 'https://www.cbr.ru/currency_base/daily/', stale: false });
      if (method === 'GET' && path === '/api/analyses') return reply(200, [...entries.values()].filter(entry => !entry.deleted).map(entry => entry.analysis).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      if (method === 'POST' && ['/api/prepare', '/api/analyses'].includes(path)) {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (!query || query.length > 1500) return failure(400, 'Введите запрос длиной от 1 до 1500 символов');
        if (input.mode !== 'roles' && input.mode !== 'stack') return failure(400, 'Неизвестный режим релевантности');
        if (path === '/api/prepare') return reply(200, { expression: input.mode === 'roles' ? `NAME:(${query})` : query, explanations: ['Тестовый запрос без обращения к hh.ru'], technologies: [] });
        if (input.confirmed !== true) return failure(400, 'Сначала подтвердите поисковый запрос');
        if (typeof input.expression !== 'string' || !input.expression.trim() || input.expression.length > 3000) return failure(400, 'Запрос должен содержать от 1 до 3000 символов');
        if (typeof input.title === 'string' && input.title.trim().length > 180) return failure(400, 'Название поиска должно быть не длиннее 180 символов');
        const filters = input.filters ?? {};
        if (typeof filters !== 'object' || Array.isArray(filters) || Object.entries(filters).some(([key, value]) => !filterGroups.some(group => group.key === key) || typeof value !== 'string')) return failure(400, 'Недопустимый фильтр');
        const id = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
        const entry = makeEntry(id, now(), query);
        const title = input.title?.trim() || query;
        Object.assign(entry.analysis, { title: title.startsWith('[Тест] ') ? title : `[Тест] ${title}`, mode: input.mode, excludeWords: input.excludeWords, expression: input.expression, filters, filterLabels: input.filterLabels ?? {} } satisfies Partial<Analysis>);
        start(entry); entries.set(id, entry);
        return reply(201, entry.analysis);
      }
      const match = /^\/api\/analyses\/([^/]+)(?:\/(vacancies|delete|restore|cancel|resume|refresh))?$/.exec(path);
      if (!match) return failure(404, 'Тестовый маршрут не найден');
      const [, id, action] = match;
      if (!/^[a-f0-9]{24}$/.test(id)) return failure(400, 'Некорректный идентификатор анализа');
      const entry = entries.get(id);
      if (!entry || (entry.deleted && action !== 'restore')) return failure(404, 'Анализ не найден');
      const a = entry.analysis;
      if (method === 'GET' && !action) return reply(200, a);
      if (method === 'GET' && action === 'vacancies') return reply(200, entry.vacancies.slice(0, a.collected));
      if (method !== 'POST' || !action || action === 'vacancies') return failure(405, 'Метод не поддерживается');
      if (action === 'delete') {
        if (['queued', 'running'].includes(a.status)) {
          a.status = a.stage = 'cancelled'; a.message = 'Тестовый сбор остановлен при удалении';
        }
        delete entry.jobStartedAt; entry.deleted = true; update(entry);
        return reply(200, { deleted: [id] });
      }
      if (action === 'restore') {
        if (!entry.deleted) return failure(404, 'Анализ не найден');
        entry.deleted = false; update(entry);
        return reply(200, { restored: [id] });
      }
      if (action === 'cancel') {
        delete entry.jobStartedAt;
        a.status = a.stage = 'cancelled'; a.message = 'Тестовый сбор остановлен. Можно продолжить позже.';
        a.report = makeReport(entry.vacancies.slice(0, a.collected)); update(entry);
        return reply(200, a);
      }
      if (['queued', 'running'].includes(a.status)) return failure(409, 'Анализ уже выполняется');
      if (action === 'resume' && a.status === 'completed') return failure(409, 'Анализ уже завершён. Запустите новый поиск для обновления.');
      start(entry);
      return reply(200, a);
    },
  };
}
