import { CircleHelp } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { marketIndex } from '../marketIndex';
import type { Vacancy } from '../types';

const indexNumber=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});

export function MarketIndexCard({vacancies}:{vacancies:Vacancy[]}) {
  const index=marketIndex(vacancies);
  const value=(amount:number|null)=>amount===null?'Нет данных':indexNumber.format(amount);
  return <section className="breakdown market-index-card" data-testid="market-index">
    <div className="breakdown-heading">
      <h2>Индекс рынка</h2>
      <Tooltip><TooltipTrigger asChild><IconButton variant="ghost" size="xs" className="market-index-help" aria-label="Как рассчитывается индекс рынка"><CircleHelp aria-hidden="true" /></IconButton></TooltipTrigger>
        <TooltipContent className="max-w-[min(24rem,90vw)] leading-relaxed" side="top" collisionPadding={12}>
          <div className="market-index-formula" role="math" aria-label="Индекс рынка равен сумме откликов на выбранные вакансии, делённой на количество вакансий в выборке">
            <span aria-hidden="true">Индекс рынка =</span>
            <span className="market-index-fraction" aria-hidden="true"><span>Сумма откликов</span><span>Количество вакансий в выборке</span></span>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
    <div className="market-index-content">
      <dl><dt className="sr-only">Индекс рынка</dt><dd className="text-2xl font-semibold tabular-nums" data-testid="market-index-mean">{value(index.responsesPerVacancy)}</dd></dl>
      {index.responsesPerVacancy===null&&<div className="market-index-notes text-xs leading-relaxed text-muted-foreground">
        <p>{!index.vacancyCount?'В выборке нет загруженных вакансий.':'У вакансий выборки нет данных об откликах.'}</p>
      </div>}
    </div>
  </section>;
}
