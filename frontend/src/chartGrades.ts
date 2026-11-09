import { kitColors } from './designTokens.ts';

const grades = ['Junior', 'Middle', 'Senior', 'Lead'];
const pointStep = 16;

export function gradeLabel(value?: string): string {
  return value?.split('/').map(part => part.trim()).filter(Boolean).map(part => grades.find(grade => grade.toLowerCase() === part.toLowerCase()) || part).join(' / ') || 'Не указан';
}

function gradeRank(label: string): number {
  if (label === 'Не указан') return 100;
  const ranks = label.split(' / ').map(part => grades.indexOf(part)).filter(rank => rank >= 0);
  return ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : 50;
}

export function gradeColor(value?: string): string {
  const label = gradeLabel(value);
  const colors: Record<string, string> = {
    Junior: 'var(--chart-4)', Middle: kitColors.green[10], Senior: kitColors.violet[6],
    Lead: kitColors.violet[7], 'Не указан': 'var(--muted-foreground)',
  };
  return colors[label] || 'var(--chart-2)';
}

export type GradeBand = { label: string; color: string; start: number; end: number; seriesKey: string };
export type GradedPoint<T> = T & { chartX: number; chartGrade: string; chartColor: string; seriesKey: string };

export function gradeLayout<T extends { grade?: string }>(points: readonly T[], amount: (point: T) => number): { points: GradedPoint<T>[]; groups: GradeBand[]; width: number } {
  const members = new Map<string, T[]>();
  for (const point of points) {
    const label = gradeLabel(point.grade);
    const group = members.get(label);
    if (group) group.push(point); else members.set(label, [point]);
  }
  const groups: GradeBand[] = [];
  const ordered: GradedPoint<T>[] = [];
  let cursor = 0;
  const entries = [...members.entries()].sort(([a], [b]) => gradeRank(a) - gradeRank(b) || a.localeCompare(b, 'ru'));
  for (const [label, values] of entries) {
    const sorted = [...values].sort((a, b) => amount(a) - amount(b));
    const width = Math.max(sorted.length * pointStep + 16, 72, label.length * 7 + 16);
    const color = gradeColor(label);
    const seriesKey = `grade${groups.length}`;
    groups.push({ label, color, seriesKey, start: cursor + 4, end: cursor + width - 4 });
    sorted.forEach((point, index) => ordered.push({
      ...point, chartGrade: label, chartColor: color, seriesKey,
      chartX: cursor + width / 2 + (index - (sorted.length - 1) / 2) * pointStep,
    }));
    cursor += width;
  }
  return { points: ordered, groups, width: Math.max(1, cursor) };
}
