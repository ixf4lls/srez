import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../types';
import type { Analysis, FilterGroup, Filters, Proposal } from '../types';
import { ErrorNotice, PageHeading } from './AppUI';

export function SearchForm({ initial, onCreated }: { initial: Analysis | null; onCreated: (a: Analysis) => void }) {
  const [query, setQuery] = useState(initial?.query || '');
  const [mode, setMode] = useState<'roles' | 'stack'>(initial?.mode || 'roles');
  const [filters, setFilters] = useState<Filters>(initial?.filters || {});
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filterError, setFilterError] = useState('');
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [expression, setExpression] = useState('');
  const expressionRef = useRef<HTMLTextAreaElement>(null);

  async function loadFilters() {
    setFiltersLoading(true); setFilterError('');
    try { setGroups((await api<{ groups: FilterGroup[] }>('/filters')).groups); }
    catch (e) { setFilterError((e as Error).message); }
    finally { setFiltersLoading(false); }
  }
  useEffect(() => { void loadFilters(); }, []);
  useEffect(() => { if (proposal) expressionRef.current?.focus(); }, [proposal]);
  async function prepare(e: React.FormEvent) {
    e.preventDefault(); setError(''); setPreparing(true);
    try { const p = await api<Proposal>('/prepare', { query, mode }); setProposal(p); setExpression(p.expression); }
    catch (e) { setError((e as Error).message); }
    finally { setPreparing(false); }
  }
  async function start() {
    setStarting(true); setError('');
    try {
      const filterLabels = Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, groups.find(g => g.key === k)?.options.find(o => o.value === v)?.label || initial?.filterLabels?.[k] || v]));
      onCreated(await api<Analysis>('/analyses', { query, mode, expression, filters, filterLabels, confirmed: true }));
    } catch (e) { setError((e as Error).message); }
    finally { setStarting(false); }
  }
  const selected = Object.entries(filters).filter(([, v]) => v);
  const primary = groups.filter(g => /^(area|experience|work_format)$/.test(g.key));
  const primaryKeys = new Set((primary.length ? primary : groups.slice(0, 3)).map(g => g.key));
  const field = (g: FilterGroup) => <label className="form-field" key={g.key}><span>{g.label}</span><NativeSelect value={filters[g.key] || ''} onChange={e => setFilters({ ...filters, [g.key]: e.target.value })}><option value="">Без ограничений</option>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect></label>;

  return <div className="new-analysis-page">
    <PageHeading title={initial ? 'Повторный анализ' : 'Новый анализ'} description="Узнайте, что предлагают работодатели и какие навыки им нужны." />
    <div className="creation-steps" aria-label="Этапы создания"><span className={!proposal ? 'current-step' : 'complete-step'}>{proposal ? <Check size={14} /> : <span>1</span>}Параметры поиска</span><span className="step-rule" /><span className={proposal ? 'current-step' : ''}><span>2</span>Проверка запроса</span></div>
    {!proposal ? <form onSubmit={prepare}>
      <Card className="search-panel"><CardHeader><CardTitle>Что исследуем?</CardTitle><CardDescription>Укажите должность, технологию или сочетание навыков.</CardDescription></CardHeader><CardContent className="space-y-6">
        <label className="form-field"><span>Поисковый запрос</span><div className="input-with-icon"><Search aria-hidden="true" size={16} /><Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, Go backend или Python AND SQL" maxLength={1500} required autoComplete="off" /></div></label>
        <div className="form-field"><span id="search-mode-label">Где искать</span><Tabs value={mode} onValueChange={value => setMode(value as 'roles' | 'stack')}><TabsList aria-labelledby="search-mode-label"><TabsTrigger value="roles">В названии вакансии</TabsTrigger><TabsTrigger value="stack">Во всём тексте</TabsTrigger></TabsList></Tabs><p className="field-hint">{mode === 'roles' ? 'Основная технология или должность должна быть указана в названии.' : 'Технологии могут встречаться в описании, требованиях и ключевых навыках.'}</p></div>
        <div className="filter-section"><div className="section-title"><SlidersHorizontal size={16} aria-hidden="true" /><h2>Условия поиска</h2><span>Необязательно</span></div>
          {filtersLoading ? <p className="field-hint" role="status">Загружаем доступные фильтры hh.ru…</p> : filterError ? <ErrorNotice retry={() => void loadFilters()}>{filterError}</ErrorNotice> : <>
            <div className="form-filter-grid">{groups.filter(g => primaryKeys.has(g.key)).map(field)}</div>
            {groups.some(g => !primaryKeys.has(g.key)) && <button type="button" className="disclosure-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Дополнительные фильтры<ChevronDown size={14} className={expanded ? 'rotate' : ''} /></button>}
            {expanded && <div className="form-filter-grid extra-filters">{groups.filter(g => !primaryKeys.has(g.key)).map(field)}</div>}
          </>}
          {selected.length > 0 && <div className="selected-filter-list">{selected.map(([key, value]) => <button type="button" key={key} className="filter-chip" onClick={() => setFilters({ ...filters, [key]: '' })} aria-label={`Убрать фильтр ${groups.find(g => g.key === key)?.label || key}`}><span>{groups.find(g => g.key === key)?.options.find(o => o.value === value)?.label || initial?.filterLabels?.[key] || value}</span><X size={12} /></button>)}<Button size="xs" variant="ghost" type="button" onClick={() => setFilters({})}>Сбросить всё</Button></div>}
        </div>
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </CardContent></Card>
      <div className="creation-footer"><p>Сначала проверим поисковое выражение.<br />Сбор начнётся после вашего подтверждения.</p><Button disabled={preparing || !query.trim()}>{preparing ? <LoaderCircle className="spin" data-icon="inline-start" /> : null}{preparing ? 'Готовим запрос…' : 'Проверить запрос'}<ArrowRight data-icon="inline-end" /></Button></div>
    </form> : <>
      <Card><CardHeader><CardTitle>Проверьте запрос</CardTitle><CardDescription>Это выражение будет отправлено в поиск hh.ru. Его можно изменить.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="query-summary"><span>Ваш запрос</span><strong>{query}</strong><span>{mode === 'roles' ? 'Поиск в названии вакансии' : 'Поиск во всём тексте'}</span></div>
        <label className="form-field"><span>Выражение для hh.ru</span><Textarea ref={expressionRef} value={expression} onChange={e => setExpression(e.target.value)} rows={5} maxLength={3000} className="query-expression" /></label>
        {proposal.explanations?.length > 0 && <ul className="query-explanations">{proposal.explanations.map((explanation, i) => <li key={i}>{explanation}</li>)}</ul>}
        {selected.length > 0 && <div className="query-summary"><span>Условия поиска</span><p>{selected.map(([k, v]) => groups.find(g => g.key === k)?.options.find(o => o.value === v)?.label || initial?.filterLabels?.[k] || v).join(' · ')}</p></div>}
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </CardContent></Card>
      <div className="creation-footer"><Button variant="outline" disabled={starting} onClick={() => { setProposal(null); setError(''); }}><ArrowLeft data-icon="inline-start" />К параметрам</Button><Button disabled={starting || !expression.trim()} onClick={() => void start()}>{starting ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}{starting ? 'Запускаем…' : 'Подтвердить и запустить'}</Button></div>
    </>}
    <div className="creation-note"><span>О результатах</span><p>Отчёт сохранит снимок вакансий. У каждой метрики можно открыть исходные данные и проверить вывод.</p></div>
  </div>;
}
