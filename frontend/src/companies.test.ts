import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVacancies } from './analytics.ts';
import { companyMetrics } from './companies.ts';
import type { Vacancy } from './types.ts';

const vacancy = (id: string, values: Partial<Vacancy> = {}): Vacancy => ({
  id, url: `https://hh.ru/vacancy/${id}`, title: `Job ${id}`, company: 'Example',
  salary: '', city: 'Москва', address: 'Москва', experience: '1–3 года',
  workFormats: [], format: '', grade: 'Middle', employment: '', workSchedule: '',
  workingHours: '', description: '', keySkills: [], responseCount: null,
  publishedAt: '', collectedAt: '2026-11-01T09:00:00Z', loaded: true, requirements: [], ...values,
});

test('companies show the whole loaded sample with counts, shares and exact source vacancies', () => {
  const vs = [vacancy('1', { company: ' Альфа ' }), vacancy('2', { company: 'Альфа' }), vacancy('3', { company: 'Бета' }), vacancy('4', { company: 'Бета', loaded: false })];
  const companies = companyMetrics(vs);
  assert.equal(companies.length, 2);
  assert.deepEqual(companies.map(({ label, count, percent }) => ({ label, count, percent })), [{ label: 'Альфа', count: 2, percent: 66.7 }, { label: 'Бета', count: 1, percent: 33.3 }]);
  assert.deepEqual(companies[0].vacancyIds, ['1', '2']);
  assert.deepEqual(companies[0].evidence, [{ vacancyId: '1', field: 'company', quote: ' Альфа ' }, { vacancyId: '2', field: 'company', quote: 'Альфа' }]);
});

test('companies retain missing names, empty samples and all companies beyond the first five', () => {
  assert.deepEqual(companyMetrics([]), []);
  const companies = companyMetrics([vacancy('1', { company: '' }), vacancy('2', { company: '   ' }), ...Array.from({ length: 7 }, (_, i) => vacancy(`${i + 3}`, { company: `Компания ${i + 1}` }))]);
  assert.equal(companies.length, 8);
  assert.equal(companies[0].label, 'Компания не указана');
  assert.deepEqual(companies[0].vacancyIds, ['1', '2']);
  assert.ok(companies.every(company => Number.isFinite(company.percent)));
});

test('company shares and source vacancies follow the current report filters', () => {
  const vs = [vacancy('1', { company: 'Альфа' }), vacancy('2', { company: 'Бета', city: 'Казань' }), vacancy('3', { company: 'Бета' })];
  const companies = companyMetrics(filterVacancies(vs, { city: ['Москва'] }));
  assert.deepEqual(companies.map(company => [company.label, company.percent, company.vacancyIds]), [['Альфа', 50, ['1']], ['Бета', 50, ['3']]]);
});
