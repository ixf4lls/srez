import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { companyMetrics } from '../companies';
import { number } from '../types';
import type { Metric, Vacancy } from '../types';
import { EmptyState } from './AppUI';

export function Companies({ vacancies, onOpen }: { vacancies: Vacancy[]; onOpen: (metric: Metric) => void }) {
  const companies = useMemo(() => companyMetrics(vacancies), [vacancies]);
  if (!companies.length) return <EmptyState title="Компании не найдены" description="В текущей выборке нет загруженных вакансий. Измените фильтры или продолжите сбор." />;
  return <Card className="companies-card" data-testid="companies-table">
    <CardHeader><CardTitle>Вакансии по компаниям</CardTitle><CardDescription>Доля рассчитана от всех загруженных вакансий текущей выборки по этому запросу. Данные сохранены на момент сбора, текущий статус вакансий на hh.ru может измениться.</CardDescription></CardHeader>
    <CardContent><div className="data-table-scroll"><table className="data-table companies-table"><thead><tr><th scope="col">Компания</th><th scope="col" className="numeric">Вакансии</th><th scope="col" className="numeric">Доля выборки</th></tr></thead><tbody>
      {companies.map(company => <tr key={company.key}><td><button className="inline-link company-link" onClick={() => onOpen(company)} aria-label={`Открыть вакансии: ${company.label}`}>{company.label}</button></td><td className="numeric">{number(company.count)}</td><td className="numeric">{number(company.percent)}%</td></tr>)}
    </tbody></table></div><p className="field-hint mt-4">Нажмите на компанию, чтобы открыть её вакансии из этого анализа.</p></CardContent>
  </Card>;
}
