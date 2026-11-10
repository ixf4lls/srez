import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Report } from '../types';

const sidebarSections = [
  { key: 'grade', title: 'Грейд', rows: 5 },
  { key: 'experience', title: 'Опыт работы', rows: 5 },
  { key: 'format', title: 'Формат работы', rows: 3 },
  { key: 'employmentForm', title: 'Способ оформления', rows: 5 },
] as const;

export function LoadingRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <div role="status" aria-label={label} aria-busy="true" className={className}>
    <span className="sr-only">{label}</span><div className="skeleton-layout" aria-hidden="true">{children}</div>
  </div>;
}

export function TextSkeleton({ width = '100%', className = '' }: { width?: string; className?: string }) {
  return <span data-slot="skeleton" aria-hidden="true" className={`skeleton-text rounded-md bg-muted ${className}`} style={{ width }} />;
}

export function HistoryRowSkeleton() {
  return <tr aria-hidden="true">
    <td className="history-status"><Skeleton className="skeleton-status" /></td>
    <td className="analysis-name-cell"><TextSkeleton width="75%" /><span className="mobile-row-date"><TextSkeleton width="9rem" /></span></td>
    <td className="history-date"><TextSkeleton width="8rem" /></td>
    <td className="numeric history-volume"><TextSkeleton width="2rem" /><TextSkeleton width="5rem" /></td>
    <td className="history-actions"><Skeleton className="skeleton-control skeleton-icon" /></td>
  </tr>;
}

export function SearchFiltersSkeleton() {
  return <LoadingRegion label="Загружаем фильтры hh.ru" className="form-filter-grid">
    {Array.from({ length: 8 }, (_, i) => <div className="form-field" key={i}><TextSkeleton width="65%" /><Skeleton className="skeleton-control" /></div>)}
  </LoadingRegion>;
}

export function SalaryDataSkeleton() {
  return <LoadingRegion label="Загружаем зарплаты и курсы валют">
    <PlotSkeleton />
    <ChartFooterSkeleton />
  </LoadingRegion>;
}

function PlotSkeleton({ responses = false }: { responses?: boolean }) {
  return <>
    {responses && <div className="chart-stat"><Skeleton className="h-8 w-16" /><TextSkeleton width="9rem" /></div>}
    <div className="response-chart"><p className="chart-axis-caption"><TextSkeleton width="10rem" /></p><Skeleton className="skeleton-plot" />
      {responses && <p className="chart-legend-note"><TextSkeleton width="65%" /></p>}
    </div>
  </>;
}

function ChartFooterSkeleton() {
  return <div className="chart-footer"><TextSkeleton width="45%" /><Skeleton className="skeleton-source-button" /></div>;
}

export function ReportDataSkeleton({ report }: { report?: Report }) {
  return <LoadingRegion label="Загружаем сохранённые вакансии" className="report-data-skeleton">
    <div className="report-filterbar"><Skeleton className="h-8 w-12" /><TextSkeleton width="9rem" /><Skeleton className="skeleton-control skeleton-filter-button" /></div>
    <div className="report-tabs skeleton-tabs"><div className="skeleton-tab-list">{['4rem', '10rem', '6rem', '5rem'].map(width => <TextSkeleton key={width} width={width} />)}</div>
      <div className="report-overview"><div className="series-stack">
        {[false, true].map(responses => <Card key={String(responses)}><CardHeader className="chart-card-header"><CardTitle>{responses ? 'Отклики' : 'Зарплаты'}</CardTitle><Skeleton className="skeleton-control skeleton-icon" /></CardHeader><CardContent>
          <PlotSkeleton responses={responses} /><ChartFooterSkeleton />
          {!responses && <div className="salary-method"><TextSkeleton width="8rem" /></div>}
        </CardContent></Card>)}
      </div><aside>
        <section className="breakdown market-index-card"><div className="breakdown-heading"><h2>Индекс рынка</h2><Skeleton className="skeleton-small-icon" /></div><Skeleton className="h-8 w-20" /></section>
        <div className="breakdown-stack">{sidebarSections.map(({ key, title, rows }) => <section className="breakdown" key={key}>
          <div className="breakdown-heading"><div><h2>{title}</h2>{key === 'format' && <p className="breakdown-note">Форматы могут пересекаться</p>}</div><Skeleton className="skeleton-small-icon" /></div>
          <div className="breakdown-rows">{Array.from({ length: Math.min(5, report?.dimensions[key]?.length ?? rows) }, (_, row) => <div className="breakdown-row" key={row}><TextSkeleton width={`${65 + row % 2 * 20}%`} /><TextSkeleton width="4rem" /><Skeleton className="breakdown-track" /></div>)}</div>
          {(report?.dimensions[key]?.length ?? 0) > 5 && <Skeleton className="breakdown-expand skeleton-source-button" />}
        </section>)}</div>
      </aside></div>
    </div>
  </LoadingRegion>;
}

export function AnalysisSkeleton({ onBack }: { onBack: () => void }) {
  return <>
    <Button variant="ghost" size="sm" className="back-to-history" onClick={onBack}><ArrowLeft data-icon="inline-start" />История анализов</Button>
    <LoadingRegion label="Загружаем анализ" className="analysis-heading-skeleton">
      <section className="report-heading"><div className="report-heading-main"><div className="report-title-line"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-status" /></div><p className="report-date"><TextSkeleton width="8rem" /></p></div><Skeleton className="skeleton-control w-44" /></section>
      <div className="report-query"><TextSkeleton width="10rem" /></div>
    </LoadingRegion>
    <ReportDataSkeleton />
  </>;
}
