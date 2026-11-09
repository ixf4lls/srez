import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, Search, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, date, number } from '../types';
import { relativeDate } from '../dates';
import { historyStatusGroup, historyStatusLabels } from '../historyStatus';
import type { Analysis } from '../types';
import { EmptyState, ErrorNotice, LoadingState, PageHeading, StatusBadge } from './AppUI';
import { DeleteAnalysisDialog } from './DeleteAnalysisDialog';

export function HistoryView({ analyses, loading, error, navigate, refresh, onNew }: { analyses: Analysis[]; loading: boolean; error: string; navigate: (s: string) => void; refresh: () => Promise<void>; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [deleting, setDeleting] = useState<Analysis | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [actionError, setActionError] = useState('');
  const [undo, setUndo] = useState<Analysis | null>(null);
  const filtered = useMemo(() => analyses.filter(a => `${a.title} ${a.expression}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || historyStatusGroup(a.status) === status)).sort((a, b) => sort === 'size' ? b.processed - a.processed : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)), [analyses, query, status, sort]);
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
    <div className="history-toolbar"><label className="form-field history-search"><span>Поиск по истории</span><div className="input-with-icon"><Search size={15} aria-hidden="true" /><Input placeholder="Найти анализ…" value={query} onChange={e => setQuery(e.target.value)} /></div></label><label className="toolbar-select"><span>Статус</span><NativeSelect value={status} onChange={e => setStatus(e.target.value)}><option value="all">Все статусы</option>{Object.entries(historyStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label><label className="toolbar-select"><span>Порядок</span><NativeSelect value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="size">Больше вакансий</option></NativeSelect></label></div>
    {loading ? <LoadingState text="Загружаем историю анализов" /> : filtered.length ? <div className="history-table-wrap"><table className="history-table"><thead><tr><th className="history-status">Статус</th><th>Анализ</th><th className="history-date">Последнее обновление</th><th className="numeric">Вакансии</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{filtered.map(a => <tr key={a.id}>
      <td className="history-status"><StatusBadge status={historyStatusGroup(a.status)} /></td><td className="analysis-name-cell"><a href={`/analyses/${a.id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); navigate(`/analyses/${a.id}`); } }}>{a.title}<ArrowUpRight size={14} aria-hidden="true" /></a><span title={a.expression}>{a.mode === 'roles' ? 'В названии' : 'Во всём тексте'} · {a.query}</span><span className="mobile-row-date">Обновлён: <time dateTime={a.updatedAt} title={`${date(a.updatedAt)} МСК`}>{relativeDate(a.updatedAt)}</time></span></td><td className="history-date"><time dateTime={a.updatedAt} title={`${date(a.updatedAt)} МСК`}>{relativeDate(a.updatedAt)}</time></td><td className="numeric history-volume"><strong>{number(a.processed)}</strong><span>найдено {number(a.found || a.collected)}</span></td><td className="history-actions"><IconButton variant="ghost" aria-label={`Удалить ${a.title}, ${date(a.createdAt)}`} title="Удалить анализ" onClick={() => setDeleting(a)}><Trash2 /></IconButton></td>
    </tr>)}</tbody></table><div className="table-footnote">{number(filtered.length)} из {number(analyses.length)} анализов</div></div> : <EmptyState title={query || status !== 'all' ? 'Анализов по этим условиям нет' : 'Здесь появятся ваши анализы'} description={query || status !== 'all' ? 'Измените запрос или сбросьте условия поиска.' : 'Начните с должности или технологии, которую хотите исследовать.'} action={query || status !== 'all' ? <Button variant="outline" onClick={() => { setQuery(''); setStatus('all'); }}>Сбросить условия</Button> : <Button onClick={onNew}><Plus data-icon="inline-start" aria-hidden="true" />Новый анализ</Button>} />}
    <DeleteAnalysisDialog analysis={deleting} onClose={() => setDeleting(null)} onDeleted={a => { setUndo(a); setDeleting(null); void refresh(); }} />
    {undo && <div className="undo-toast" role="status"><span>Анализ «{undo.title}» удалён</span><Button variant="secondary" size="sm" disabled={restoring} onClick={() => void restore()}><Undo2 data-icon="inline-start" />Отменить</Button><IconButton variant="ghost" size="sm" aria-label="Закрыть уведомление" onClick={() => setUndo(null)}><X /></IconButton></div>}
  </>;
}
