import { useEffect, useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { number } from '../types';
import type { Metric, ResponsePoint, Vacancy } from '../types';
import type { Dimension, SalaryPoint } from '../analytics';
import { normalizedSalaryLabel } from '../analytics';
import { ResponsePlot, SalaryPlot } from './VacancyCharts';
import { VacancyBrowser } from './Vacancies';
import { EmptyState } from './AppUI';

export type Exploration = { title: string; dimension?: string; filterDimension?: Dimension; metrics?: Metric[]; metric?: Metric; points?: ResponsePoint[]; salaries?: SalaryPoint[]; salaryLabel?: string; vacancyId?: string; expanded?: boolean; mean?: number | null };

export function Explorer({ context, vacancies, onClose, onFilter }: { context: Exploration | null; vacancies: Vacancy[]; onClose: () => void; onFilter: (dimension: Dimension, value: string) => void }) {
  const [tab, setTab] = useState('data');
  const [metric, setMetric] = useState<Metric | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  useEffect(() => {
    setMetric(context?.metric); setSelectedId(context?.vacancyId);
    setTab(context?.metric || context?.vacancyId ? 'vacancies' : context?.expanded ? 'chart' : 'data');
  }, [context]);
  const ids = metric?.vacancyIds || context?.points?.map(p => p.id) || context?.salaries?.map(p => p.id) || (context?.metrics ? [...new Set(context.metrics.flatMap(m => m.vacancyIds))] : undefined);
  const sourceVacancies = ids ? vacancies.filter(v => ids.includes(v.id)) : vacancies;
  function openVacancy(id: string) { setSelectedId(id); setTab('vacancies'); }
  return <Sheet open={!!context} onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="source-sheet">
    <SheetHeader className="source-sheet-header"><span className="source-caption"><Database size={14} aria-hidden="true" />Источники отчёта</span><SheetTitle>{context?.title || 'Исходные данные'}</SheetTitle><SheetDescription>{context?.salaryLabel || 'Сохранённые данные текущей выборки вакансий.'}</SheetDescription></SheetHeader>
    <Tabs value={tab} onValueChange={setTab} variant="line" className="source-tabs"><TabsList variant="line" aria-label="Представление источников">
      {context?.expanded && <TabsTrigger value="chart">График</TabsTrigger>}<TabsTrigger value="data">Данные</TabsTrigger><TabsTrigger value="vacancies">Вакансии · {number(sourceVacancies.length)}</TabsTrigger>
    </TabsList>
      <TabsContent value="chart"><div className="source-chart">{context?.points ? <ResponsePlot points={context.points} mean={context.mean ?? null} onChoose={openVacancy} expanded /> : context?.salaries ? <SalaryPlot points={context.salaries} onChoose={openVacancy} expanded /> : null}</div></TabsContent>
      <TabsContent value="data"><div className="source-data"><p className="field-hint">Нажмите на строку, чтобы проверить исходные вакансии.</p><div className="data-table-scroll"><table className="data-table"><thead><tr><th>{context?.metrics ? 'Показатель' : 'Вакансия'}</th><th className="numeric">{context?.points ? 'Отклики' : context?.salaries ? 'Зарплата' : 'Вакансии'}</th>{context?.metrics && <th className="numeric">Доля</th>}</tr></thead><tbody>
        {context?.metrics?.map(m => <tr key={m.key}><td><button className="inline-link" onClick={() => { setMetric(m); setSelectedId(undefined); setTab('vacancies'); }}>{m.label}</button></td><td className="numeric">{number(m.count)}</td><td className="numeric">{number(m.percent)}%</td></tr>)}
        {context?.points?.map(p => <tr key={p.id}><td><button className="inline-link" onClick={() => openVacancy(p.id)}>{p.title}</button></td><td className="numeric">{number(p.count)}</td></tr>)}
        {context?.salaries?.map(p => <tr key={p.id}><td><button className="inline-link" onClick={() => openVacancy(p.id)}>{p.title}</button></td><td>{normalizedSalaryLabel(p)}<span className="source-original-salary">{p.raw}</span></td></tr>)}
      </tbody></table></div>{!sourceVacancies.length && <EmptyState title="Источников нет" description="В этой выборке нет вакансий с данными для показателя." />}</div></TabsContent>
      <TabsContent value="vacancies">{metric && <div className="source-metric"><Button variant="ghost" size="sm" onClick={() => { setMetric(undefined); setSelectedId(undefined); setTab('data'); }}><ArrowLeft data-icon="inline-start" />Все показатели</Button><strong>{metric.label}</strong>{context?.filterDimension && <Button size="sm" variant="outline" onClick={() => onFilter(context.filterDimension!, metric.label)}>Применить как фильтр</Button>}</div>}<VacancyBrowser key={`${context?.title}-${metric?.key || ''}`} vacancies={sourceVacancies} initialId={selectedId} metric={metric} dimension={context?.dimension} /></TabsContent>
    </Tabs>
  </SheetContent></Sheet>;
}
