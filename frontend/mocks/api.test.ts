import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from './api.ts';
import { deriveReport } from '../src/analytics.ts';
import type { Analysis, FilterGroup, Vacancy } from '../src/types.ts';

const initialTime = Date.parse('2026-11-09T10:00:00Z');
const completedId = '000000000000000000000001';
const post = { query: 'React', mode: 'roles', expression: 'NAME:(React)', confirmed: true };

test('seed covers every status, relative dates, reports, evidence, categories and missing values', () => {
  const api = createMockApi(() => initialTime);
  const list = api.handle('GET', '/api/analyses').body as Analysis[];
  assert.equal(list.length, 10);
  assert.deepEqual(new Set(list.map(a => a.status)), new Set(['completed', 'partial', 'running', 'queued', 'attention', 'cancelled', 'interrupted']));
  assert.ok(list.some(a => a.createdAt === new Date(initialTime - 86_400_000).toISOString()));
  const analysis = api.handle('GET', `/api/analyses/${completedId}`).body as Analysis;
  const vacancies = api.handle('GET', `/api/analyses/${completedId}/vacancies`).body as Vacancy[];
  const report = analysis.report!;
  assert.equal(vacancies.length, analysis.collected);
  assert.equal(report.total, vacancies.filter(v => v.loaded).length);
  const derived = deriveReport(report, vacancies);
  assert.deepEqual(derived, { ...report, responses: report.responses.map(point => ({ ...point, grade: vacancies.find(v => v.id === point.id)!.grade || 'Не указан' })) });
  assert.ok(report.dimensions.city.length > 5);
  assert.ok(report.dimensions.company.length > 5);
  assert.ok(vacancies.some(v => v.responseCount === null));
  assert.ok(vacancies.some(v => v.responseCount === 0));
  assert.ok(vacancies.some(v => !v.salary));
  for (const metric of [...report.skills, ...report.requirements]) {
    assert.equal(metric.count, metric.vacancyIds.length);
    assert.ok(metric.evidence.every(e => vacancies.some(v => v.id === e.vacancyId && v.loaded)));
  }
  assert.ok(list.some(a => a.report?.total === 0));
});

test('all supporting routes and both query modes work without external services', () => {
  const api = createMockApi(() => initialTime);
  assert.equal((api.handle('GET', '/api/health').body as { provider: string }).provider, 'mock');
  const groups = (api.handle('GET', '/api/filters').body as { groups: FilterGroup[] }).groups;
  assert.equal(groups.length, 8);
  assert.ok(groups.every(group => group.options.length));
  assert.equal(api.handle('GET', '/api/rates').status, 200);
  assert.equal((api.handle('POST', '/api/prepare', post).body as { expression: string }).expression, 'NAME:(React)');
  assert.equal((api.handle('POST', '/api/prepare', { ...post, mode: 'stack' }).body as { expression: string }).expression, 'React');
});

test('create, progress, cancel, resume and refresh retain isolated mutable state', () => {
  let time = initialTime;
  const api = createMockApi(() => time);
  const created = api.handle('POST', '/api/analyses', post);
  assert.equal(created.status, 201);
  const analysis = created.body as Analysis;
  assert.match(analysis.id, /^[a-f0-9]{24}$/);
  assert.equal(analysis.status, 'queued');
  const path = `/api/analyses/${analysis.id}`;
  time += 4000;
  const running = api.handle('GET', path).body as Analysis;
  assert.equal(running.status, 'running');
  assert.ok(running.collected > 0 && running.processed > 0);
  assert.equal(api.handle('POST', `${path}/resume`).status, 409);
  assert.equal((api.handle('POST', `${path}/cancel`).body as Analysis).status, 'cancelled');
  assert.equal((api.handle('POST', `${path}/resume`).body as Analysis).status, 'queued');
  time += 13_000;
  const finished = api.handle('GET', path).body as Analysis;
  assert.equal(finished.status, 'partial');
  assert.ok(finished.report!.total > 0);
  assert.equal((api.handle('POST', `${path}/refresh`).body as Analysis).status, 'queued');
  assert.equal(api.handle('POST', `/api/analyses/${completedId}/resume`).status, 409);
  assert.equal(analysis.status, 'queued');
});

test('soft deletion hides analysis and vacancies, restore preserves the snapshot', () => {
  const api = createMockApi(() => initialTime);
  const path = `/api/analyses/${completedId}`;
  const before = api.handle('GET', path).body;
  assert.deepEqual(api.handle('POST', `${path}/delete`).body, { deleted: [completedId] });
  assert.equal((api.handle('GET', '/api/analyses').body as Analysis[]).length, 9);
  assert.equal(api.handle('GET', path).status, 404);
  assert.equal(api.handle('GET', `${path}/vacancies`).status, 404);
  assert.deepEqual(api.handle('POST', `${path}/restore`).body, { restored: [completedId] });
  assert.deepEqual(api.handle('GET', path).body, before);
  assert.equal(api.handle('POST', `${path}/restore`).status, 404);
});

test('invalid requests, missing analyses and empty/reset scenarios return useful responses', () => {
  const api = createMockApi(() => initialTime);
  assert.equal(api.handle('POST', '/api/analyses', { ...post, confirmed: false }).status, 400);
  assert.equal(api.handle('POST', '/api/prepare', { ...post, query: '' }).status, 400);
  assert.equal(api.handle('POST', '/api/analyses', { ...post, filters: { invalid: 'x' } }).status, 400);
  assert.equal(api.handle('GET', '/api/analyses/bad').status, 400);
  assert.equal(api.handle('GET', '/api/analyses/ffffffffffffffffffffffff').status, 404);
  assert.equal(api.handle('DELETE', `/api/analyses/${completedId}`).status, 405);
  assert.equal(api.handle('GET', '/api/unknown').status, 404);
  assert.equal(api.handle('POST', '/api/mock/reset', { scenario: 'empty' }).status, 200);
  assert.deepEqual(api.handle('GET', '/api/analyses').body, []);
  api.handle('POST', '/api/mock/reset');
  assert.equal((api.handle('GET', '/api/analyses').body as Analysis[]).length, 10);
});
