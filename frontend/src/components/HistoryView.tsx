import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, date, number, statusLabel } from '../types';
import type { Analysis } from '../types';
import { EmptyState, ErrorNotice, LoadingState, PageHeading, StatusBadge } from './AppUI';

export function HistoryView({ analyses, loading, error, navigate, refresh, onNew }: { analyses: Analysis[]; loading: boolean; error: string; navigate: (s: string) => void; refresh: () => Promise<void>; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [undo, setUndo] = useState<string[]>([]);
  const filtered = useMemo(() => analyses.filter(a => `${a.title} ${a.expression}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || a.status === status)).sort((a, b) => sort === 'size' ? b.processed - a.processed : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)), [analyses, query, status, sort]);
  const allSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id));
  useEffect(() => { const ids = new Set(analyses.map(a => a.id)); setSelected(prev => new Set([...prev].filter(id => ids.has(id)))); }, [analyses]);
  function toggle(id: string) { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function remove(ids: string[]) {
    if (!ids.length) return;
    setBusy(true); setActionError('');
    try { setUndo((await api<{ deleted: string[] }>('/analyses/delete', { ids })).deleted); setSelected(new Set()); await refresh(); }
    catch (e) { setActionError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function restore() {
    setBusy(true); setActionError('');
    try { await api('/analyses/restore', { ids: undo }); setUndo([]); await refresh(); }
    catch (e) { setActionError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="История анализов" description="Сохранённые снимки рынка. Откройте отчёт, чтобы продолжить исследование." action={<Button onClick={onNew}><Plus data-icon="inline-start" />Новый анализ</Button>} />
    {(error || actionError) && <ErrorNotice retry={error ? () => void refresh() : undefined}>{actionError || error}</ErrorNotice>}
    <div className="history-toolbar"><label className="form-field history-search"><span>Поиск по истории</span><div className="input-with-icon"><Search size={15} aria-hidden="true" /><Input placeholder="Найти анализ…" value={query} onChange={e => { setQuery(e.target.value); setSelected(new Set()); }} /></div></label>
      <label className="toolbar-select"><span>Статус</span><NativeSelect value={status} onChange={e => { setStatus(e.target.value); setSelected(new Set()); }}><option value="all">Все статусы</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>
      <label className="toolbar-select"><span>Порядок</span><NativeSelect value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="size">Больше вакансий</option></NativeSelect></label>
    </div>
    {selected.size > 0 && <div className="selection-toolbar"><span>Выбрано: {number(selected.size)}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(new Set())}>Снять выбор</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove([...selected])}><Trash2 data-icon="inline-start" />Удалить выбранные</Button></div>}
    {loading ? <LoadingState text="Загружаем историю анализов" /> : filtered.length ? <div className="history-table-wrap"><table className="history-table"><thead><tr>
      <th className="checkbox-cell"><Checkbox checked={allSelected ? true : selected.size ? 'indeterminate' : false} disabled={busy} aria-label="Выбрать все найденные анализы" onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map(a => a.id)))} /></th><th>Анализ</th><th>Дата создания</th><th className="numeric">Вакансии</th><th>Статус</th><th><span className="sr-only">Действия</span></th>
    </tr></thead><tbody>{filtered.map(a => <tr key={a.id} data-selected={selected.has(a.id)}>
      <td className="checkbox-cell"><Checkbox checked={selected.has(a.id)} disabled={busy} aria-label={`Выбрать ${a.title}, ${date(a.createdAt)}`} onCheckedChange={() => toggle(a.id)} /></td>
      <td className="analysis-name-cell"><a href={`/analyses/${a.id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); navigate(`/analyses/${a.id}`); } }}>{a.title}<ArrowUpRight size={14} aria-hidden="true" /></a><span title={a.expression}>{a.mode === 'roles' ? 'В названии' : 'Во всём тексте'} · {a.query}</span><span className="mobile-row-date">{date(a.createdAt)}</span></td>
      <td className="history-date">{date(a.createdAt)}</td><td className="numeric history-volume"><strong>{number(a.processed)}</strong><span>найдено {number(a.found || a.collected)}</span></td><td className="history-status"><StatusBadge status={a.status} /></td>
      <td className="history-actions"><IconButton variant="ghost" size="sm" aria-label={`Удалить ${a.title}, ${date(a.createdAt)}`} title="Удалить анализ" disabled={busy} onClick={() => void remove([a.id])}><Trash2 /></IconButton></td>
    </tr>)}</tbody></table><div className="table-footnote">{number(filtered.length)} из {number(analyses.length)} анализов</div></div>
      : <EmptyState title={query || status !== 'all' ? 'Анализов по этим условиям нет' : 'Ваш первый анализ ещё впереди'} description={query || status !== 'all' ? 'Измените поисковый запрос или сбросьте фильтры.' : 'Укажите должность или стек, и приложение соберёт вакансии в отчёт.'} action={query || status !== 'all' ? <Button variant="outline" onClick={() => { setQuery(''); setStatus('all'); }}>Сбросить условия</Button> : <Button onClick={onNew}><Plus data-icon="inline-start" />Создать анализ</Button>} />}
    {undo.length > 0 && <div className="undo-toast" role="status"><span>Удалено анализов: {number(undo.length)}</span><Button variant="secondary" size="sm" disabled={busy} onClick={() => void restore()}><Undo2 data-icon="inline-start" />Отменить</Button><IconButton variant="ghost" size="sm" aria-label="Закрыть уведомление" onClick={() => setUndo([])}><X /></IconButton></div>}
  </>;
}
