import { MarketIndexCard } from './MarketIndex';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Database, Expand, LoaderCircle, Pause, Play, RefreshCw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, date, isActive, number } from '../types';
import { relativeDate } from '../dates';
import type { Analysis, Metric, Report, Vacancy } from '../types';
import { deriveReport, dimensions, filterVacancies, readViewFilters, salaryGroups } from '../analytics';
import type { Dimension, SalaryRates, ViewFilters } from '../analytics';
import { Explorer } from './Explorer';
import type { Exploration } from './Explorer';
import { ResponsePlot, SalaryPlot } from './VacancyCharts';
import { VacancyBrowser } from './Vacancies';
import { EmptyState, ErrorNotice, LoadingState, StatusBadge } from './AppUI';
import { DeleteAnalysisDialog } from './DeleteAnalysisDialog';
import { Companies } from './Companies';

type RatesResponse = { rates: SalaryRates; date: string; source: string; sourceUrl: string; stale: boolean };

export function AnalysisView({ id, navigate, onRepeat, onChanged }: { id: string; navigate: (s: string) => void; onRepeat: (a: Analysis) => void; onChanged: () => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoaded, setVacanciesLoaded] = useState(false);
  const [vacancyError, setVacancyError] = useState('');
  const [exploration, setExploration] = useState<Exploration | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ViewFilters>(readViewFilters);
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState('overview');
  const previousStatus = useRef<string | undefined>(undefined);
  const active = analysis ? isActive(analysis) : false;
  async function refresh() {
    try { setAnalysis(await api<Analysis>(`/analyses/${id}`)); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  async function loadVacancies() {
    try { setVacancies(await api<Vacancy[]>(`/analyses/${id}/vacancies`)); setVacancyError(''); setVacanciesLoaded(true); }
    catch (e) { setVacancyError((e as Error).message); }
  }
  useEffect(() => { void refresh(); }, [id]);
  async function loadRates() {
    setRatesLoading(true); setRatesError('');
    try { setRates(await api<RatesResponse>('/rates')); }
    catch (e) { setRatesError((e as Error).message); }
    finally { setRatesLoading(false); }
  }
  useEffect(() => { void loadRates(); }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [id, active]);
  useEffect(() => {
    if (analysis && !active) void loadVacancies();
    if (previousStatus.current && previousStatus.current !== analysis?.status) onChanged();
    previousStatus.current = analysis?.status;
  }, [analysis?.status, id]);
  useEffect(() => {
    const url = new URL(location.href);
    if (Object.keys(filters).length) url.searchParams.set('view', JSON.stringify(filters)); else url.searchParams.delete('view');
    history.replaceState({}, '', url.pathname + url.search);
  }, [filters]);
  useEffect(() => {
    const onPop = () => setFilters(readViewFilters());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const scoped = useMemo(() => filterVacancies(vacancies, filters), [vacancies, filters]);
  const loadedTotal = vacancies.filter(v => v.loaded).length;
  const filtered = Object.values(filters).some(values => values?.length);
  const r = useMemo(() => analysis?.report && vacanciesLoaded ? deriveReport(analysis.report, scoped) : null, [analysis?.report, scoped, vacanciesLoaded]);
  const salaryGroup = useMemo(() => salaryGroups(scoped, rates?.rates || { RUB: 1 })[0], [scoped, rates]);
  const unfilteredReport = useMemo(() => analysis?.report && vacanciesLoaded ? deriveReport(analysis.report, vacancies) : null, [analysis?.report, vacancies, vacanciesLoaded]);
  function toggleFilter(dimension: Dimension, value: string) {
    setFilters(previous => {
      const selected = previous[dimension] || [];
      const next = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
      const result = { ...previous }; if (next.length) result[dimension] = next; else delete result[dimension];
      return result;
    });
  }
  function applySourceFilter(dimension: Dimension, value: string) {
    setFilters(previous => ({ ...previous, [dimension]: [...new Set([...(previous[dimension] || []), value])] }));
    setExploration(null);
  }
  async function action(kind: 'cancel' | 'resume') {
    setActionLoading(true);
    try { await api(`/analyses/${id}/${kind}`, {}); if (kind === 'resume') setVacanciesLoaded(false); await refresh(); onChanged(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  }
  if (!analysis) return error ? <ErrorNotice retry={() => void refresh()}>{error}</ErrorNotice> : <LoadingState text="Загружаем анализ" />;
  const a = analysis;
  const canResume = !active && (['cancelled', 'attention', 'interrupted'].includes(a.status) || (a.status === 'partial' && (a.failed > 0 || (a.found > a.collected && a.nextPage < 40))));
  const breakdowns = (report: Report) => <div className="breakdown-stack">{dimensions.map(({ key, title }) => <Breakdown key={key} title={title} dimension={key} metrics={report.dimensions[key] || []} selected={filters[key] || []} onToggle={value => toggleFilter(key, value)} onSources={() => { setShowFilters(false); setExploration({ title, dimension: key === 'format' ? 'workFormats' : key, metrics: report.dimensions[key] || [], filterDimension: key }); }} />)}</div>;

  return <>
    <Button variant="ghost" size="sm" className="back-to-history" onClick={() => navigate('/history')}><ArrowLeft data-icon="inline-start" />История анализов</Button>
    <section className="report-heading"><div className="report-heading-main"><div className="report-title-line"><h1>{a.title}</h1><StatusBadge status={a.status} /></div><p className="report-date"><time dateTime={a.createdAt} title={`${date(a.createdAt)} МСК`}>{relativeDate(a.createdAt)}</time><span>·</span>{a.mode === 'roles' ? 'В названии вакансии' : 'Во всём тексте'}</p></div><div className="report-actions"><Button variant="outline" onClick={() => onRepeat(a)}><RefreshCw data-icon="inline-start" />Повторить поиск</Button>{canResume && <Button disabled={actionLoading} onClick={() => void action('resume')}>{actionLoading ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}Продолжить сбор</Button>}</div></section>
    <details className="report-query"><summary>Параметры запроса<ChevronDown size={14} aria-hidden="true" /></summary><div><code>{a.expression}</code><div className="query-conditions">{Object.entries(a.filters).filter(([, value]) => value).map(([key, value]) => <Badge variant="outline" key={key}>{a.filterLabels?.[key] || value}</Badge>)}</div></div></details>
    {error && <ErrorNotice retry={() => void refresh()}>{error}</ErrorNotice>}
    {!active && a.error && <div className="data-notice"><strong>{a.message}</strong><p>{a.error.replace(/^\w+:\s*/, '')}</p>{/auth|blocked/.test(a.error) && <p>Обновите сессию hh.ru через <code>api-anything login hh --window</code>, затем продолжите сбор.</p>}</div>}
    {active ? <CollectionProgress analysis={a} onCancel={() => void action('cancel')} busy={actionLoading} /> : <>
      {vacancyError ? <ErrorNotice retry={() => void loadVacancies()}>{vacancyError}</ErrorNotice> : !vacanciesLoaded ? <LoadingState text="Загружаем сохранённые вакансии" /> : null}
      {vacanciesLoaded && !r && <EmptyState title="Отчёт пока не сформирован" description="Продолжите сбор, чтобы получить данные для анализа." />}
      {r && <>
        {(a.warnings?.length > 0 || a.found > loadedTotal) && <details className="coverage-notice"><summary>Охват данных: {number(loadedTotal)} из {number(a.found || a.collected)} вакансий<ChevronDown size={14} /></summary><ul>{[...new Set(a.warnings || [])].map((warning, i) => <li key={i}>{warning}</li>)}{!a.warnings?.length && <li>Часть найденных вакансий не загружена. Метрики рассчитаны по сохранённым описаниям.</li>}</ul></details>}
        <div className="report-filterbar"><div className="sample-count"><strong data-testid="vacancy-count">{number(r.total)}</strong><span>{filtered ? `из ${number(loadedTotal)} вакансий` : 'вакансий в выборке'}</span></div><div className="active-filters">{dimensions.flatMap(({ key, title }) => (filters[key] || []).map(value => <button className="filter-chip" key={`${key}-${value}`} onClick={() => toggleFilter(key, value)} aria-label={`Убрать фильтр ${title}: ${value}`}><span>{value}</span><X size={12} /></button>))}</div>{filtered && <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Сбросить</Button>}<Button variant="outline" size="sm" onClick={() => setShowFilters(true)}><SlidersHorizontal data-icon="inline-start" />Фильтры</Button></div>
        <Tabs value={tab} onValueChange={setTab} variant="line" className="report-tabs"><TabsList variant="line" aria-label="Разделы отчёта"><TabsTrigger value="overview">Обзор</TabsTrigger><TabsTrigger value="requirements">Навыки и требования</TabsTrigger><TabsTrigger value="vacancies">Вакансии <span className="tab-count">{number((filtered ? scoped : vacancies).length)}</span></TabsTrigger><TabsTrigger value="companies">Компании</TabsTrigger></TabsList>
          <TabsContent value="overview">{r.total ? <div className="report-overview"><div className="series-stack">
            <MarketIndexCard vacancies={scoped} />
            <Card data-testid="salary-chart"><CardHeader className="chart-card-header"><div><CardTitle>Зарплаты</CardTitle></div><IconButton variant="ghost" aria-label="Развернуть график зарплат" disabled={!salaryGroup} onClick={() => setExploration({ title: 'Зарплаты', dimension: 'salary', salaries: salaryGroup?.points, salaryLabel: salaryGroup?.label, expanded: true })}><Expand /></IconButton></CardHeader><CardContent>
              {ratesLoading && <p className="field-hint" role="status">Обновляем курсы валют…</p>}
              {ratesError && <div className="salary-rate-notice"><p>Курсы валют недоступны. Показаны предложения в рублях.</p><Button size="xs" variant="outline" onClick={() => void loadRates()}>Обновить курсы</Button></div>}
              {salaryGroup ? <><SalaryPlot points={salaryGroup.points} onChoose={vacancyId => setExploration({ title: 'Зарплаты', dimension: 'salary', salaries: salaryGroup.points, salaryLabel: salaryGroup.label, vacancyId })} /><div className="chart-footer"><span>Сопоставимы {number(salaryGroup.points.length)} из {number(r.total)} вакансий</span><Button variant="ghost" size="xs" onClick={() => setExploration({ title: 'Зарплаты', dimension: 'salary', salaries: salaryGroup.points, salaryLabel: salaryGroup.label })}><Database data-icon="inline-start" />Источники</Button></div></> : <EmptyState title="Нет сопоставимых зарплат" description="Для пересчёта нужны сумма, валюта, период оплаты и отметка о налогах." />}
              <details className="salary-method"><summary>Как рассчитано<ChevronDown size={13} aria-hidden="true" /></summary><div><p>Суммы приведены к рублям за месяц. Из gross вычтен НДФЛ резидента РФ по прогрессивной шкале, исходя из одинакового дохода в течение года, без вычетов. Это расчётная оценка.</p><p>Для часовых ставок приняты 176 часов в месяц, для дневных: 22 рабочих дня. Недельные суммы умножены на 52/12, годовые разделены на 12. Предложения без периода, налогового статуса или доступного курса исключены из графика.</p>{rates && <p><a href={rates.sourceUrl} target="_blank" rel="noreferrer">Курсы Банка России на {rates.date.split('-').reverse().join('.')}</a>{rates.stale ? ' (сохранённые данные, обновить сейчас не удалось)' : ''}.</p>}<a href="https://www.nalog.gov.ru/rn39/promo/nu/" target="_blank" rel="noreferrer">Шкала НДФЛ: ФНС России</a></div></details>
            </CardContent></Card>
            <Card data-testid="response-chart"><CardHeader className="chart-card-header"><div><CardTitle>Отклики</CardTitle></div><IconButton variant="ghost" aria-label="Развернуть график откликов" disabled={!r.responses.length} onClick={() => setExploration({ title: 'Отклики', dimension: 'responses', points: r.responses, mean: r.responseMean, expanded: true })}><Expand /></IconButton></CardHeader><CardContent>
              {r.responses.length ? <><div className="chart-stat"><strong>{r.responseMean == null ? 'Нет данных' : number(r.responseMean)}</strong><span>откликов в среднем</span></div><ResponsePlot points={r.responses} mean={r.responseMean} onChoose={vacancyId => setExploration({ title: 'Отклики', dimension: 'responses', points: r.responses, vacancyId })} /><div className="chart-footer"><span>Данные по {number(r.responseCoverage)} из {number(r.total)} вакансий</span><Button variant="ghost" size="xs" onClick={() => setExploration({ title: 'Отклики', dimension: 'responses', points: r.responses })}><Database data-icon="inline-start" />Источники</Button></div></> : <EmptyState title="Нет данных об откликах" description="В сохранённых вакансиях число откликов недоступно." />}
            </CardContent></Card>
            <div className="report-reading-note"><Check size={15} aria-hidden="true" /><p>Каждая точка связана с исходной вакансией. Нажмите на неё, чтобы проверить данные.</p></div>
          </div><aside aria-label="Распределение вакансий">{breakdowns(r)}</aside></div> : <EmptyState title={filtered ? 'По выбранным фильтрам вакансий нет' : 'Вакансии не найдены'} description={filtered ? 'Сбросьте условия или выберите другое сочетание категорий.' : 'Измените запрос и повторите поиск.'} action={<Button variant="outline" onClick={() => filtered ? setFilters({}) : onRepeat(a)}>{filtered ? 'Сбросить фильтры' : 'Изменить запрос'}</Button>} />}</TabsContent>
          <TabsContent value="requirements"><Requirements report={r} onOpen={context => setExploration(context)} /></TabsContent>
          <TabsContent value="vacancies"><VacancyBrowser vacancies={filtered ? scoped : vacancies} /></TabsContent>
          <TabsContent value="companies"><Companies vacancies={scoped} onOpen={metric => setExploration({ title: `Вакансии: ${metric.label}`, dimension: 'company', metrics: [metric], metric })} /></TabsContent>
        </Tabs>
        <Sheet open={showFilters} onOpenChange={setShowFilters}><SheetContent className="filter-sheet" aria-describedby={undefined}><SheetHeader><SheetTitle>Фильтры отчёта</SheetTitle></SheetHeader><div className="filter-sheet-content"><p className="field-hint">Внутри категории условия объединяются через ИЛИ, между категориями через И.</p>{unfilteredReport && breakdowns(unfilteredReport)}<Button variant="outline" onClick={() => setFilters({})}>Сбросить фильтры</Button></div></SheetContent></Sheet>
      </>}
    </>}
    <Explorer context={exploration} vacancies={filtered ? scoped : vacancies} onClose={() => setExploration(null)} onFilter={applySourceFilter} />
    <DeleteAnalysisDialog analysis={deleting ? a : null} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onChanged(); navigate('/history'); }} />
    <div className="report-footer"><Button variant="ghost" className="text-text-destructive" onClick={() => setDeleting(true)}><Trash2 data-icon="inline-start" />Удалить анализ</Button></div>
  </>;
}

function Breakdown({ title, dimension, metrics, selected, onToggle, onSources }: { title: string; dimension: Dimension; metrics: Metric[]; selected: string[]; onToggle: (value: string) => void; onSources: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? metrics : metrics.slice(0, 5);
  return <section className="breakdown" data-testid={`dimension-${dimension}`}><div className="breakdown-heading"><h2>{title}</h2><IconButton variant="ghost" size="xs" aria-label={`Источники: ${title}`} onClick={onSources}><Database /></IconButton></div>{dimension === 'format' && <p className="breakdown-note">Форматы могут пересекаться</p>}<div className="breakdown-rows">{visible.map((m, i) => <button key={m.key} className="breakdown-row" aria-pressed={selected.includes(m.label)} disabled={!m.count && !selected.includes(m.label)} onClick={() => onToggle(m.label)}><span className="breakdown-label">{selected.includes(m.label) && <Check size={12} aria-hidden="true" />}{m.label}</span><span className="breakdown-values"><span>{number(m.count)}</span><strong>{number(m.percent)}%</strong></span><span className="breakdown-track"><span style={{ width: `${m.percent}%`, background: `var(--chart-${i % 5 + 1})` }} /></span></button>)}</div>{!metrics.length && <p className="field-hint">Нет данных в текущей выборке.</p>}{metrics.length > 5 && <Button variant="ghost" size="xs" className="breakdown-expand" onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть' : `Все категории (${metrics.length})`}<ChevronDown data-icon="inline-end" className={expanded ? 'rotate' : ''} /></Button>}</section>;
}

function Requirements({ report, onOpen }: { report: Report; onOpen: (context: Exploration) => void }) {
  const [kind, setKind] = useState('Обязательно');
  const [search, setSearch] = useState('');
  const requirements = report.requirements.filter(m => m.kind === kind);
  return <><div className="requirements-toolbar"><label className="form-field"><span>Поиск навыков и требований</span><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти навык или требование…" /></label><Tabs value={kind} onValueChange={setKind}><TabsList aria-label="Вид требований"><TabsTrigger value="Обязательно">Обязательно</TabsTrigger><TabsTrigger value="Будет плюсом">Будет плюсом</TabsTrigger></TabsList></Tabs></div><div className="requirements-grid"><MetricTable key={`skills-${search}-${report.total}`} title="Ключевые навыки" metrics={report.skills} coverage={report.skillsCoverage} total={report.total} search={search} onOpen={onOpen} /><MetricTable key={`${kind}-${search}-${report.total}`} title="Требования" metrics={requirements} coverage={report.requirementsCoverage} total={report.total} search={search} onOpen={onOpen} /></div><p className="field-hint mt-4">Доля рассчитана от всех вакансий текущей выборки. Нажмите на показатель, чтобы прочитать подтверждающие фрагменты.</p></>;
}

function MetricTable({ title, metrics, coverage, total, search, onOpen }: { title: string; metrics: Metric[]; coverage: number; total: number; search: string; onOpen: (context: Exploration) => void }) {
  const [limit, setLimit] = useState(12);
  const matches = metrics.filter(m => m.label.toLowerCase().includes(search.toLowerCase()));
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Данные в {number(coverage)} из {number(total)} вакансий</CardDescription></CardHeader><CardContent>{metrics.length ? <><div className="metric-table-heading"><span>Показатель</span><span>Вакансии / доля</span></div>{matches.slice(0, limit).map(m => <button key={m.key} className="metric-table-row" onClick={() => onOpen({ title, metrics, metric: m })}><span><strong>{m.label}</strong><span className="metric-track"><span style={{ width: `${m.percent}%` }} /></span></span><span className="metric-values"><strong>{number(m.count)}</strong><span>{number(m.percent)}%</span><ArrowUpRight size={14} aria-hidden="true" /></span></button>)}{matches.length > limit && <Button variant="outline" className="w-full mt-4" onClick={() => setLimit(value => value + 12)}>Показать ещё {Math.min(12, matches.length - limit)}<span className="text-muted-foreground">из {number(matches.length)}</span></Button>}{!matches.length && <p className="field-hint py-6">Совпадений с запросом нет.</p>}</> : <EmptyState title="Нет извлечённых показателей" description="В текущей выборке не удалось найти такие данные." />}</CardContent></Card>;
}

function CollectionProgress({ analysis: a, onCancel, busy }: { analysis: Analysis; onCancel: () => void; busy: boolean }) {
  const percent = a.found ? Math.min(100, a.processed / a.found * 100) : undefined;
  return <Card className="collection-card"><CardHeader><Badge variant="secondary" className="w-fit mb-3">Сбор данных</Badge><CardTitle>Изучаем вакансии</CardTitle><CardDescription aria-live="polite">{a.message || 'Ожидаем начала сбора'}</CardDescription></CardHeader><CardContent><div className="collection-stats"><div><span>Найдено</span><strong>{a.found ? number(a.found) : 'Уточняем'}</strong></div><div><span>Собрано ссылок</span><strong>{number(a.collected)}</strong></div><div><span>Загружено</span><strong>{number(a.processed)}</strong></div>{a.failed > 0 && <div><span>Ошибки загрузки</span><strong>{number(a.failed)}</strong></div>}</div>{percent != null && <Progress value={percent} aria-label="Доля загруженных вакансий" />}<div className="collection-footer"><p>Можно закрыть страницу.<br />Сбор продолжится в фоне.</p><Button variant="outline" onClick={onCancel} disabled={busy}>{busy ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Pause data-icon="inline-start" />}Остановить сбор</Button></div></CardContent></Card>;
}
