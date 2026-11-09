import type { Analysis } from './types.ts';
import { historyStatusGroup, historyStatusLabels } from './historyStatus.ts';

export const historySortLabels = {
  status: 'Статус',
  title: 'Анализ',
  updatedAt: 'Последнее обновление',
  processed: 'Вакансии',
} as const;

export type HistorySortKey = keyof typeof historySortLabels;
export type HistorySort = { key: HistorySortKey; direction: 'asc' | 'desc' };
export const defaultHistorySort: HistorySort = { key: 'updatedAt', direction: 'desc' };

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const updatedTime = (analysis: Analysis) => Date.parse(analysis.updatedAt) || 0;

export function nextHistorySort(previous: HistorySort, key: HistorySortKey): HistorySort {
  const direction = previous.key === key
    ? previous.direction === 'asc' ? 'desc' : 'asc'
    : key === 'updatedAt' || key === 'processed' ? 'desc' : 'asc';
  return { key, direction };
}

export function sortHistory(analyses: readonly Analysis[], sort = defaultHistorySort): Analysis[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...analyses].sort((a, b) => {
    let comparison = 0;
    switch (sort.key) {
      case 'title': comparison = collator.compare(a.title, b.title); break;
      case 'status': comparison = collator.compare(historyStatusLabels[historyStatusGroup(a.status)], historyStatusLabels[historyStatusGroup(b.status)]); break;
      case 'processed': comparison = a.processed - b.processed; break;
      case 'updatedAt': comparison = updatedTime(a) - updatedTime(b); break;
    }
    return comparison * direction || updatedTime(b) - updatedTime(a) || a.id.localeCompare(b.id);
  });
}
