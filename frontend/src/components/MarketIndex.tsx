import { CircleHelp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { analysisSnapshotAt, marketIndex } from '../marketIndex';
import type { Analysis, Vacancy } from '../types';

const indexNumber=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});

export function MarketIndexCard({analysis,vacancies}:{analysis:Analysis;vacancies:Vacancy[]}) {
  const index=marketIndex(vacancies,analysisSnapshotAt(analysis));
  const partial=index.responseCoverage>0&&index.responseCoverage<index.vacancyCount;
  const value=(amount:number|null)=>amount===null?'Нет данных':indexNumber.format(amount);
  return <Card className="market-index-card" data-testid="market-index">
    <CardHeader className="chart-card-header market-index-header">
      <CardTitle>Индекс рынка</CardTitle>
      <Tooltip><TooltipTrigger asChild><IconButton variant="ghost" className="market-index-help min-h-11 min-w-11" aria-label="Как рассчитывается индекс рынка"><CircleHelp aria-hidden="true" /></IconButton></TooltipTrigger>
        <TooltipContent className="max-w-[min(24rem,90vw)] leading-relaxed" side="top" collisionPadding={12}>
          <div className="market-index-formula" role="math" aria-label="Индекс рынка равен среднему количеству откликов, делённому на количество активных вакансий">
            <span aria-hidden="true">Индекс рынка =</span>
            <span className="market-index-fraction" aria-hidden="true"><span>Среднее количество откликов</span><span>Количество активных вакансий</span></span>
          </div>
        </TooltipContent>
      </Tooltip>
    </CardHeader>
    <CardContent className="market-index-content">
      <dl><dt className="sr-only">Индекс рынка</dt><dd className="text-2xl font-semibold tabular-nums" data-testid="market-index-mean">{value(index.meanPerVacancy)}</dd></dl>
      {(partial||index.meanPerVacancy===null)&&<div className="market-index-notes text-xs leading-relaxed text-muted-foreground">
        {partial&&<p>Среднее количество откликов рассчитано по вакансиям с известным числом откликов.</p>}
        {index.meanPerVacancy===null&&<p>{!index.periodEnd?'Не удалось определить дату снимка анализа.':!index.vacancyCount?'В выборке нет загруженных вакансий с датой публикации в этом периоде.':'У вакансий периода нет данных об откликах.'}</p>}
      </div>}
    </CardContent>
  </Card>;
}
