import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverHeader, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../types';
import type { Analysis, FilterGroup, Filters, Proposal } from '../types';
import { formatExclusionWords, parseExclusionWords } from '../searchExclusions';
import { ErrorNotice } from './AppUI';
import { HeadingSkeleton, LoadingRegion, SearchFiltersSkeleton, TextSkeleton } from './DataSkeletons';

export function SearchForm({ initial, onCreated }: { initial: Analysis | null; onCreated: (a: Analysis) => void }) {
  const [query, setQuery] = useState(initial?.query || '');
  const [excludeWords, setExcludeWords] = useState(initial?.excludeWords || '');
  const [draftExcludeWords, setDraftExcludeWords] = useState(initial?.excludeWords || '');
  const [mode, setMode] = useState<'roles' | 'stack'>(initial?.mode || 'roles');
  const [filters, setFilters] = useState<Filters>(initial?.filters || {});
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [filterContent, setFilterContent] = useState<HTMLDivElement | null>(null);
  const [filterSideOffset, setFilterSideOffset] = useState(12);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [expression, setExpression] = useState('');
  useLayoutEffect(() => {
    if (!filtersOpen) return;
    const content = filterContent;
    const trigger = filterTriggerRef.current;
    if (!content || !trigger) return;
    const fitFilterWindow = () => {
      const height = content.offsetHeight;
      const anchor = trigger.getBoundingClientRect();
      const below = anchor.bottom + 12;
      const above = anchor.top - 12 - height;
      // A tall window can overlap its trigger to use the viewport instead of
      // being squeezed into the smaller space on either side of the search bar.
      const top = below >= 16 && below + height <= innerHeight - 16 ? below
        : above >= 16 && above + height <= innerHeight - 16 ? above
        : Math.max(16, Math.min(below, innerHeight - 16 - height));
      setFilterSideOffset(top - anchor.bottom);
    };
    fitFilterWindow();
    const observer = new ResizeObserver(fitFilterWindow);
    observer.observe(content);
    window.addEventListener('resize', fitFilterWindow);
    window.addEventListener('scroll', fitFilterWindow, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fitFilterWindow);
      window.removeEventListener('scroll', fitFilterWindow, true);
    };
  }, [filterContent, filtersOpen, filtersLoading, filterError, groups]);
  async function loadFilters() {
    setFiltersLoading(true); setFilterError('');
    try { setGroups((await api<{ groups: FilterGroup[] }>('/filters')).groups); }
    catch (e) { setFilterError((e as Error).message); }
    finally { setFiltersLoading(false); }
  }
  function openFilters(open: boolean) {
    if (open) setDraftExcludeWords(excludeWords);
    setFiltersOpen(open);
    if (open && !groups.length && !filtersLoading) void loadFilters();
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setError(''); setPreparing(true); setFiltersOpen(false); setConfirmationOpen(true); setProposal(null); setExpression('');
    try { const p = await api<Proposal>('/prepare', { query, mode, excludeWords }); setExpression(p.expression); setProposal(p); }
    catch (e) { setError((e as Error).message); setConfirmationOpen(false); }
    finally { setPreparing(false); }
  }
  async function start() {
    setStarting(true); setError('');
    try {
      const filterLabels = Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, groups.find(g => g.key === k)?.options.find(o => o.value === v)?.label || initial?.filterLabels?.[k] || v]));
      onCreated(await api<Analysis>('/analyses', { query, mode, excludeWords, expression, filters, filterLabels, confirmed: true }));
    } catch (e) { setError((e as Error).message); }
    finally { setStarting(false); }
  }
  const selected = Object.entries(filters).filter(([, v]) => v);
  const excludedTerms = parseExclusionWords(excludeWords);
  const hasExclusions = excludedTerms.length > 0;
  const exclusionsLabel = formatExclusionWords(excludedTerms);
  const selectedCount = selected.length + Number(hasExclusions);
  return <section className="hero-content">
    <div className="hero-heading"><h1 className="wordmark">srez<span>.</span></h1><p>анализ рынка вакансий</p></div>
    <form className="hero-search" onSubmit={prepare}>
      <label className="hero-query-label" htmlFor="market-query">Какую должность или технологию исследуем?</label>
      <div className="hero-search-row"><Search className="hero-search-icon" size={20} aria-hidden="true" /><Input id="market-query" className="hero-query-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Должность, технология или стек" maxLength={1500} required autoComplete="off" />
        <Popover open={filtersOpen} onOpenChange={openFilters}><PopoverTrigger asChild><Button ref={filterTriggerRef} type="button" variant="ghost" className="hero-filter-button"><SlidersHorizontal data-icon="inline-start" />Фильтры{selectedCount > 0 && <Badge variant="secondary">{selectedCount}</Badge>}</Button></PopoverTrigger>
          <PopoverContent ref={setFilterContent} align="end" side="bottom" sideOffset={filterSideOffset} collisionPadding={16} className="search-filters-popover" aria-label="Фильтры поиска"><PopoverHeader><h2>{filtersLoading ? <HeadingSkeleton>Фильтры поиска</HeadingSkeleton> : <span className="data-reveal">Фильтры поиска</span>}</h2></PopoverHeader>
            <div className="search-filters-body"><label className="form-field search-exclusions"><span id="search-exclusions-label">Исключить слова</span><Input aria-labelledby="search-exclusions-label" value={draftExcludeWords} onChange={e => setDraftExcludeWords(e.target.value)} placeholder="Например: стажёр, продажи, холодные звонки" maxLength={1600} aria-describedby="search-exclusions-hint" autoComplete="off" /><span className="field-hint" id="search-exclusions-hint">Разделяйте слова и фразы запятыми. Исключаем из названия и описания вакансии.</span></label>{filtersLoading ? <SearchFiltersSkeleton /> : filterError ? <ErrorNotice retry={() => void loadFilters()}>{filterError}</ErrorNotice> : <div className="form-filter-grid data-reveal">{groups.map(g => <label className="form-field" key={g.key}><span>{g.label}</span><NativeSelect value={filters[g.key] || ''} onChange={e => setFilters({ ...filters, [g.key]: e.target.value })}><option value="">Без ограничений</option>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect></label>)}</div>}</div>
            <div className="popover-actions"><Button type="button" variant="ghost" size="sm" onClick={() => { setFilters({}); setDraftExcludeWords(''); }} disabled={!selected.length && !draftExcludeWords}>Сбросить</Button><Button type="button" size="sm" onClick={() => { setExcludeWords(draftExcludeWords); setFiltersOpen(false); }}>Готово</Button></div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="hero-search-options"><Tabs value={mode} onValueChange={value => setMode(value as 'roles' | 'stack')}><TabsList aria-label="Где искать"><TabsTrigger value="roles">В названии вакансии</TabsTrigger><TabsTrigger value="stack">Во всём тексте</TabsTrigger></TabsList></Tabs><Button className="hero-submit" disabled={preparing || !query.trim()}>{preparing ? <LoaderCircle data-icon="inline-start" className="spin" /> : null}{preparing ? 'Готовим запрос…' : 'Анализировать'}<ArrowRight data-icon="inline-end" /></Button></div>
      {selectedCount > 0 && <div className="selected-filter-list">{hasExclusions && <button type="button" className="filter-chip" onClick={() => setExcludeWords('')} aria-label="Убрать фильтр Исключить слова"><span>Исключить: {exclusionsLabel}</span><X size={12} /></button>}{selected.map(([key, value]) => <button type="button" className="filter-chip" key={key} onClick={() => setFilters({ ...filters, [key]: '' })} aria-label={`Убрать фильтр ${groups.find(g => g.key === key)?.label || key}`}><span>{groups.find(g => g.key === key)?.options.find(o => o.value === value)?.label || initial?.filterLabels?.[key] || value}</span><X size={12} /></button>)}</div>}
      {error && !proposal && <ErrorNotice>{error}</ErrorNotice>}
    </form>
    <Dialog open={confirmationOpen} onOpenChange={open => { if (!open && !starting) { setConfirmationOpen(false); setProposal(null); setError(''); } }}><DialogContent className="query-confirm-dialog" aria-describedby="query-language-help"><DialogHeader><DialogTitle>{preparing ? <HeadingSkeleton>Подтвердите запрос</HeadingSkeleton> : <span className="data-reveal">Подтвердите запрос</span>}</DialogTitle></DialogHeader>
      <div className="query-summary"><span>Ваш запрос</span><strong>{query}</strong></div>
      {hasExclusions && <div className="query-summary"><span>Исключить слова</span><p>{exclusionsLabel}</p></div>}
      {selected.length > 0 && <div className="query-summary"><span>Условия поиска</span><p>{selected.map(([key, value]) => groups.find(g => g.key === key)?.options.find(o => o.value === value)?.label || initial?.filterLabels?.[key] || value).join(' · ')}</p></div>}
      {preparing ? <div className="form-field"><span>Выражение для hh.ru</span><LoadingRegion label="Готовим выражение для hh.ru" className="query-expression-skeleton"><TextSkeleton width="90%" /><TextSkeleton width="75%" /><TextSkeleton width="85%" /><TextSkeleton width="55%" /></LoadingRegion></div> : <label className="form-field data-reveal"><span>Выражение для hh.ru</span><Textarea autoFocus value={expression} onChange={e => setExpression(e.target.value)} rows={5} maxLength={3000} className="query-expression" /></label>}
      <p className="query-language-help" id="query-language-help">Для оптимизации используется <a href="https://hh.ru/article/1175" target="_blank" rel="noreferrer">Язык запросов hh.ru</a></p>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <DialogFooter><Button variant="outline" disabled={starting} onClick={() => { setConfirmationOpen(false); setProposal(null); setError(''); }}>Назад</Button><Button disabled={preparing || starting || !proposal || !expression.trim()} onClick={() => void start()}>{starting ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}{starting ? 'Запускаем…' : 'Подтвердить и запустить'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
