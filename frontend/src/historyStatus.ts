export const historyStatusLabels = {
  completed: 'Готов',
  running: 'Выполняется',
  cancelled: 'Остановлен',
  interrupted: 'Прерван',
} as const;

export type HistoryStatus = keyof typeof historyStatusLabels;

export function historyStatusGroup(status: string): HistoryStatus {
  if (status === 'completed' || status === 'cancelled') return status;
  if (status === 'running' || status === 'queued') return 'running';
  return 'interrupted';
}
