import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeColor, gradeLabel, gradeLayout } from './chartGrades.ts';
import { deriveReport, salaryGroups } from './analytics.ts';
import type { Report, Vacancy } from './types.ts';

test('grade groups are continuous in seniority order with stable ascending values inside each group', () => {
  const source = [
    { id: 'senior-high', grade: 'Senior', amount: 90 }, { id: 'junior-high', grade: 'Junior', amount: 50 },
    { id: 'unknown', amount: 0 }, { id: 'senior-low', grade: 'Senior', amount: 10 },
    { id: 'middle', grade: 'Middle', amount: 60 }, { id: 'junior-tie', grade: 'Junior', amount: 50 },
    { id: 'lead', grade: 'Lead', amount: 30 },
  ];
  const snapshot = structuredClone(source);
  const layout = gradeLayout(source, point => point.amount);
  assert.deepEqual(layout.groups.map(group => group.label), ['Junior', 'Middle', 'Senior', 'Lead', 'Не указан']);
  assert.deepEqual(layout.points.map(point => point.id), ['junior-high', 'junior-tie', 'middle', 'senior-low', 'senior-high', 'lead', 'unknown']);
  assert.deepEqual(source, snapshot);
  assert.ok(layout.points.every((point, index) => index === 0 || point.chartX > layout.points[index - 1].chartX));
});

test('each band covers its points and reserves room for a single shared label, including one-point groups', () => {
  const source = [{ grade: 'Junior', amount: 0 }, { grade: 'Middle / Senior', amount: 4 }, { grade: '', amount: 2 }];
  const layout = gradeLayout(source, point => point.amount);
  for (const group of layout.groups) {
    const points = layout.points.filter(point => point.chartGrade === group.label);
    assert.ok(points.length > 0);
    assert.ok(points.every(point => point.chartX > group.start && point.chartX < group.end));
    assert.ok(group.end - group.start >= group.label.length * 7 + 8);
  }
  assert.equal(gradeLabel(' middle/senior '), 'Middle / Senior');
  assert.equal(gradeLabel(' '), 'Не указан');
  assert.deepEqual(gradeLayout([], () => 0), { points: [], groups: [], width: 1 });
});

test('grade colors stay the same across charts and after filtering out other grades', () => {
  const source = ['Junior', 'Middle', 'Senior', 'Lead', 'Не указан'].map((grade, index) => ({ grade, amount: index }));
  const all = gradeLayout(source, point => point.amount);
  const filtered = gradeLayout(source.filter(point => point.grade === 'Senior'), point => point.amount);
  assert.equal(filtered.groups[0].color, all.groups.find(group => group.label === 'Senior')!.color);
  assert.equal(filtered.groups[0].color, gradeColor('Senior'));
  assert.equal(new Set(all.groups.map(group => group.color)).size, 5);
});

test('salary and response chart points inherit grades from the same source vacancies', () => {
  const vacancy = { id: '1', title: 'Job', grade: 'Senior', loaded: true, salary: '100 000 ₽ за месяц, на руки', responseCount: 0, keySkills: [], requirements: [], workFormats: [] } as unknown as Vacancy;
  const base: Report = { total: 0, dimensions: {}, skills: [], requirements: [], responses: [], responseMean: null, responseCoverage: 0, skillsCoverage: 0, requirementsCoverage: 0, version: 'test' };
  assert.equal(salaryGroups([vacancy])[0].points[0].grade, 'Senior');
  assert.equal(deriveReport(base, [vacancy]).responses[0].grade, 'Senior');
  assert.equal(deriveReport(base, [{ ...vacancy, grade: '' }]).responses[0].grade, 'Не указан');
});
