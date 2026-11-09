import test from 'node:test';
import assert from 'node:assert/strict';
import type { Analysis } from './types.ts';
import { makeEntry } from '../mocks/fixtures.ts';
import { defaultHistorySort, historySortLabels, nextHistorySort, sortHistory } from './historySort.ts';
import type { HistorySort, HistorySortKey } from './historySort.ts';

const analysis = (id: string, values: Partial<Analysis> = {}): Analysis => ({
  ...makeEntry(id, Date.parse('2026-11-01T09:00:00Z'), 'Проверка', 'completed', 0).analysis,
  ...values,
});
const ids = (values: Analysis[]) => values.map(a => a.id);

test('history defaults to last update descending rather than creation date', () => {
  const values = [
    analysis('new', { createdAt: '2026-11-09T12:00:00Z', updatedAt: '2026-11-09T12:00:00Z' }),
    analysis('old', { createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-11-09T16:00:00+03:00' }),
    analysis('middle', { updatedAt: '2026-11-09T12:30:00Z' }),
  ];
  assert.deepEqual(ids(sortHistory(values)), ['old', 'middle', 'new']);
  assert.deepEqual(ids(values), ['new', 'old', 'middle']);
});

test('titles use Russian alphabetical and natural numeric ordering', () => {
  const values = [analysis('10', { title: 'Анализ 10' }), analysis('2', { title: 'анализ 2' }), analysis('ya', { title: 'Яндекс' })];
  assert.deepEqual(ids(sortHistory(values, { key: 'title', direction: 'asc' })), ['2', '10', 'ya']);
  assert.deepEqual(ids(sortHistory(values, { key: 'title', direction: 'desc' })), ['ya', '10', '2']);
});

test('vacancy counts sort numerically using the displayed processed count', () => {
  const values = [analysis('2', { processed: 2, found: 1000 }), analysis('100', { processed: 100, found: 100 }), analysis('10', { processed: 10, found: 10 })];
  assert.deepEqual(ids(sortHistory(values, { key: 'processed', direction: 'asc' })), ['2', '10', '100']);
  assert.deepEqual(ids(sortHistory(values, { key: 'processed', direction: 'desc' })), ['100', '10', '2']);
});

test('status sorting follows the four visible labels including grouped backend states', () => {
  const values = [analysis('partial', { status: 'partial' }), analysis('stopped', { status: 'cancelled' }), analysis('done'), analysis('queued', { status: 'queued' }), analysis('attention', { status: 'attention' })];
  assert.deepEqual(ids(sortHistory(values, { key: 'status', direction: 'asc' })), ['queued', 'done', 'stopped', 'attention', 'partial']);
  assert.deepEqual(ids(sortHistory(values, { key: 'status', direction: 'desc' })), ['attention', 'partial', 'stopped', 'done', 'queued']);
});

test('clicking each column twice reverses its primary ordering', () => {
  const values = [analysis('a', { title: 'А', processed: 2, status: 'completed', updatedAt: '2026-11-01T09:00:00Z' }), analysis('b', { title: 'Б', processed: 10, status: 'cancelled', updatedAt: '2026-11-02T09:00:00Z' })];
  for (const key of Object.keys(historySortLabels) as HistorySortKey[]) {
    const first = nextHistorySort(defaultHistorySort, key);
    const second = nextHistorySort(first, key);
    assert.notEqual(first.direction, second.direction);
    assert.deepEqual(ids(sortHistory(values, second)), ids(sortHistory(values, first)).reverse());
  }
});

test('ties remain deterministic after a refresh returns rows in another order', () => {
  const values = [analysis('b'), analysis('a'), analysis('recent', { updatedAt: '2026-11-09T09:00:00Z' })];
  const sort: HistorySort = { key: 'processed', direction: 'desc' };
  assert.deepEqual(ids(sortHistory(values, sort)), ['recent', 'a', 'b']);
  assert.deepEqual(ids(sortHistory([...values].reverse(), sort)), ['recent', 'a', 'b']);
  assert.deepEqual(sortHistory([], sort), []);
});
