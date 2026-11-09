import type { Metric, Vacancy } from './types.ts';

export function companyMetrics(vacancies: Vacancy[]): Metric[] {
  const loaded = vacancies.filter(vacancy => vacancy.loaded);
  const companies = new Map<string, Metric>();
  for (const vacancy of loaded) {
    const label = vacancy.company.trim() || 'Компания не указана';
    const metric = companies.get(label) || { key: label, label, count: 0, percent: 0, vacancyIds: [], evidence: [] };
    metric.count++;
    metric.vacancyIds.push(vacancy.id);
    metric.evidence.push({ vacancyId: vacancy.id, field: 'company', quote: vacancy.company || label });
    companies.set(label, metric);
  }
  return [...companies.values()]
    .map(metric => ({ ...metric, percent: Math.round(metric.count * 1000 / loaded.length) / 10 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
}
