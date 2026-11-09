import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, date, number } from '../types';
import { relativeDate } from '../dates';
import { historyStatusGroup, historyStatusLabels } from '../historyStatus';
import { defaultHistorySort, historySortLabels, nextHistorySort, sortHistory } from '../historySort';
import type { HistorySort, HistorySortKey } from '../historySort';
import type { Analysis } from '../types';
import { EmptyState, ErrorNotice, LoadingState, PageHeading, StatusBadge } from './AppUI';
import { DeleteAnalysisDialog } from './DeleteAnalysisDialog';

const sortColumns = Object.keys(historySortLabels) as HistorySortKey[];

export function HistoryView({ analyses, loading, error, navigate, refresh, onNew }: { analyses: Analysis[]; loading: boolean; error: string; navigate: (s: string) => void; refresh: () => Promise<void>; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<HistorySort>(defaultHistorySort);
  const [deleting, setDeleting] = useState<Analysis | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [actionError, setActionError] = useState('');
  const [undo, setUndo] = useState<Analysis | null>(null);
  const filtered = useMemo(() => sortHistory(analyses.filter(a => `${a.title} ${a.expression}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || historyStatusGroup(a.status) === status)), sort), [analyses, query, status, sort]);
  const toolbarSort = sort.key === 'updatedAt' ? sort.direction === 'desc' ? 'newest' : 'oldest' : sort.key === 'processed' && sort.direction === 'desc' ? 'size' : 'column';
  function sortBy(column: HistorySortKey) { setSort(previous => nextHistorySort(previous, column)); }
  async function restore() {
    if (!undo) return;
    setRestoring(true); setActionError('');
    try { await api(`/analyses/${undo.id}/restore`, {}); setUndo(null); await refresh(); }
    catch (e) { setActionError((e as Error).message); }
    finally { setRestoring(false); }
  }
  return <>
    <PageHeading title="История анализов" description="Сохранённые отчёты о рынке вакансий." />
    {(error || actionError) && <ErrorNotice retry={error ? () => void refresh() : undefined}>{actionError || error}</ErrorNotice>}
    <div className="history-toolbar">
      <label className="form-field history-search"><span>Поиск по истории</span><div className="input-with-icon"><Search size={15} aria-hidden="true" /><Input placeholder="Найти анализ…" value={query} onChange={e => setQuery(e.target.value)} /></div></label>
      <label className="toolbar-select"><span>Статус</span><NativeSelect value={status} onChange={e => setStatus(e.target.value)}><option value="all">Все статусы</option>{Object.entries(historyStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>
      <label className="toolbar-select"><span>Порядок</span><NativeSelect value={toolbarSort} onChange={e => setSort(e.target.value === 'size' ? { key: 'processed', direction: 'desc' } : { key: 'updatedAt', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}>{toolbarSort === 'column' && <option value="column" disabled>{historySortLabels[sort.key]} {sort.direction === 'asc' ? '↑' : '↓'}</option>}<option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="size">Больше вакансий</option></NativeSelect></label>
    </div>
    {loading ? <LoadingState text="Загружаем историю анализов" /> : filtered.length ? <div className="history-table-wrap"><div className="history-mobile-sort" role="group" aria-label="Сортировка истории">{sortColumns.map(column => <HistorySortButton key={column} column={column} sort={sort} onSort={sortBy} compact />)}</div><table className="history-table"><thead><tr>{sortColumns.map(column => <th key={column} scope="col" className={`history-sort-header ${column === 'status' ? 'history-status' : column === 'updatedAt' ? 'history-date' : column === 'processed' ? 'numeric' : ''}`} aria-sort={sort.key === column ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}><HistorySortButton column={column} sort={sort} onSort={sortBy} /></th>)}<th scope="col"><span className="sr-only">Действия</span></th></tr></thead><tbody>{filtered.map(a => <tr key={a.id}>
      <td className="history-status" data-status={historyStatusGroup(a.status)}><StatusBadge status={historyStatusGroup(a.status)} /></td>
      <td className="analysis-name-cell"><a href={`/analyses/${a.id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); navigate(`/analyses/${a.id}`); } }}>{a.title}<ArrowUpRight size={14} aria-hidden="true" /></a><span title={a.expression}>{a.mode === 'roles' ? 'В названии' : 'Во всём тексте'} · {a.query}</span><span className="mobile-row-date">Обновлён: <time dateTime={a.updatedAt} title={`${date(a.updatedAt)} МСК`}>{relativeDate(a.updatedAt)}</time></span></td><td className="history-date"><time dateTime={a.updatedAt} title={`${date(a.updatedAt)} МСК`}>{relativeDate(a.updatedAt)}</time></td><td className="numeric history-volume"><strong>{number(a.processed)}</strong><span>найдено {number(a.found || a.collected)}</span></td><td className="history-actions"><IconButton variant="ghost" aria-label={`Удалить ${a.title}, ${date(a.createdAt)}`} title="Удалить анализ" onClick={() => setDeleting(a)}><Trash2 /></IconButton></td>
    </tr>)}</tbody></table><div className="table-footnote">{number(filtered.length)} из {number(analyses.length)} анализов</div></div> : <EmptyState title={query || status !== 'all' ? 'Анализов по этим условиям нет' : 'Здесь появятся ваши анализы'} description={query || status !== 'all' ? 'Измените запрос или сбросьте условия поиска.' : 'Начните с должности или технологии, которую хотите исследовать.'} action={query || status !== 'all' ? <Button variant="outline" onClick={() => { setQuery(''); setStatus('all'); }}>Сбросить условия</Button> : <Button onClick={onNew}><Plus data-icon="inline-start" aria-hidden="true" />Новый анализ</Button>} />}
    <DeleteAnalysisDialog analysis={deleting} onClose={() => setDeleting(null)} onDeleted={a => { setUndo(a); setDeleting(null); void refresh(); }} />
    {undo && <div className="undo-toast" role="status"><span>Анализ «{undo.title}» удалён</span><Button variant="secondary" size="sm" disabled={restoring} onClick={() => void restore()}><Undo2 data-icon="inline-start" />Отменить</Button><IconButton variant="ghost" size="sm" aria-label="Закрыть уведомление" onClick={() => setUndo(null)}><X /></IconButton></div>}
  </>;
}

function HistorySortButton({ column, sort, onSort, compact = false }: { column: HistorySortKey; sort: HistorySort; onSort: (column: HistorySortKey) => void; compact?: boolean }) {
  const active = sort.key === column;
  const label = historySortLabels[column];
  const direction = sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию';
  const nextDirection = nextHistorySort(sort, column).direction === 'asc' ? 'по возрастанию' : 'по убыванию';
  const Icon = active ? sort.direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
  return <Button type="button" variant="ghost" size="sm" className="history-sort-button" data-active={active || undefined} aria-label={`${label}: ${active ? direction : 'сортировать'}`} title={`Сортировать ${nextDirection}`} onClick={() => onSort(column)}>{compact && column === 'updatedAt' ? 'Обновление' : label}<Icon aria-hidden="true" /></Button>;
}
