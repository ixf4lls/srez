import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../mocks/api.ts';
import { historyStatusGroup, historyStatusLabels } from './historyStatus.ts';
import type { Analysis } from './types.ts';

test('four history filters partition all analyses without dropping intermediate states', () => {
  const analyses = createMockApi().handle('GET', '/api/analyses').body as Analysis[];
  const expected = {
    completed: ['completed'],
    running: ['running', 'queued'],
    cancelled: ['cancelled'],
    interrupted: ['partial', 'attention', 'interrupted'],
  };
  const seen = new Set<string>();
  for (const [group, sourceStatuses] of Object.entries(expected)) {
    const matches = analyses.filter(a => historyStatusGroup(a.status) === group);
    assert.deepEqual(new Set(matches.map(a => a.status)), new Set(sourceStatuses));
    for (const analysis of matches) {
      assert.equal(seen.has(analysis.id), false);
      seen.add(analysis.id);
    }
  }
  assert.equal(seen.size, analyses.length);
  assert.deepEqual(Object.values(historyStatusLabels), ['Готов', 'Выполняется', 'Остановлен', 'Прерван']);
});

test('an unrecognized state is not presented as completed or removed from history', () => {
  assert.equal(historyStatusGroup('failed'), 'interrupted');
});
