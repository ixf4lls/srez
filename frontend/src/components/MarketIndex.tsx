import { CircleHelp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { analysisSnapshotAt, marketIndex } from '../marketIndex';
import type { Analysis, Vacancy } from '../types';
import { number } from '../types';

const indexNumber=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4});
const periodDate=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'});

export function MarketIndexCard({analysis,vacancies}:{analysis:Analysis;vacancies:Vacancy[]}) {
  const index=marketIndex(vacancies,analysisSnapshotAt(analysis));
  const partial=index.responseCoverage>0&&index.responseCoverage<index.vacancyCount;
  const value=(amount:number|null)=>amount===null?'Нет данных':indexNumber.format(amount);
  return <Card data-testid="market-index"><CardHeader className="chart-card-header"><div><CardTitle>Индекс рынка</CardTitle><CardDescription>Вакансии, опубликованные за последние 30 дней снимка</CardDescription></div><Tooltip><TooltipTrigger asChild><IconButton variant="ghost" className="min-h-11 min-w-11" aria-label="Как рассчитывается индекс рынка"><CircleHelp aria-hidden="true" /></IconButton></TooltipTrigger><TooltipContent className="max-w-[min(24rem,90vw)] leading-relaxed" side="left"><p><strong>Среднее откликов / вакансии:</strong> среднее число откликов на вакансии с известными откликами делится на число всех вакансий периода.</p><p className="mt-2"><strong>Всего откликов / вакансии:</strong> сумма известных откликов делится на число всех вакансий периода. При неполных данных это нижняя оценка.</p><p className="mt-2">Период: 30 суток до завершения или последнего обновления анализа. Учитываются даты публикации и фильтры отчёта. Вакансии без корректной даты публикации исключены. Отклики взяты на момент сохранения, их прирост за 30 дней не измеряется. Неизвестные отклики исключены из среднего, реальные нули учитываются.</p></TooltipContent></Tooltip></CardHeader><CardContent>
    <dl className="grid gap-6 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Среднее откликов / вакансии</dt><dd className="mt-2 text-2xl font-semibold tabular-nums" data-testid="market-index-mean">{value(index.meanPerVacancy)}</dd></div><div><dt className="text-xs text-muted-foreground">Всего откликов / вакансии</dt><dd className="mt-2 text-2xl font-semibold tabular-nums" data-testid="market-index-total">{partial?'≥ ':''}{value(index.totalPerVacancy)}</dd></div></dl>
    <div className="mt-5 space-y-2 text-xs leading-relaxed text-muted-foreground"><p>Данные об откликах: {number(index.responseCoverage)} из {number(index.vacancyCount)} вакансий периода.</p>{index.periodStart&&index.periodEnd&&<p>С {periodDate.format(new Date(index.periodStart))} по {periodDate.format(new Date(index.periodEnd))} МСК.</p>}{partial&&<p>Среднее рассчитано по известным откликам. Второй индекс показывает нижнюю оценку: часть откликов недоступна.</p>}{index.totalPerVacancy===null&&<p>{!index.periodEnd?'Не удалось определить дату снимка анализа.':!index.vacancyCount?'В выборке нет загруженных вакансий с датой публикации в этом периоде.':'У вакансий периода нет данных об откликах.'}</p>}</div>
  </CardContent></Card>;
}
