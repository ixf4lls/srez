import type { Analysis } from './types.ts';

export const historySortLabels = {
  updatedAt: 'Последнее обновление',
  processed: 'Вакансии',
} as const;

export type HistorySortKey = keyof typeof historySortLabels;
export type HistorySort = { key: HistorySortKey; direction: 'asc' | 'desc' };
export const defaultHistorySort: HistorySort = { key: 'updatedAt', direction: 'desc' };

const updatedTime = (analysis: Analysis) => Date.parse(analysis.updatedAt) || 0;

export function nextHistorySort(previous: HistorySort, key: HistorySortKey): HistorySort {
  const direction = previous.key === key
    ? previous.direction === 'asc' ? 'desc' : 'asc'
    : 'desc';
  return { key, direction };
}

export function sortHistory(analyses: readonly Analysis[], sort = defaultHistorySort): Analysis[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...analyses].sort((a, b) => {
    const comparison = sort.key === 'processed' ? a.processed - b.processed : updatedTime(a) - updatedTime(b);
    return comparison * direction || updatedTime(b) - updatedTime(a) || a.id.localeCompare(b.id);
  });
}
