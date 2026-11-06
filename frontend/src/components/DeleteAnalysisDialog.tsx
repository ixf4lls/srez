import { useEffect, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, date, isActive } from '../types';
import type { Analysis } from '../types';
import { ErrorNotice } from './AppUI';

export function DeleteAnalysisDialog({ analysis, onClose, onDeleted }: { analysis: Analysis | null; onClose: () => void; onDeleted: (analysis: Analysis) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [analysis?.id]);
  async function remove() {
    if (!analysis) return;
    setBusy(true); setError('');
    try { await api(`/analyses/${analysis.id}/delete`, {}); onDeleted(analysis); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open={!!analysis} onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}><DialogHeader><DialogTitle>Удалить анализ?</DialogTitle><DialogDescription>«{analysis?.title}», {analysis && date(analysis.createdAt)}. Анализ и его отчёт будут убраны из истории.{analysis && isActive(analysis) ? ' Текущий сбор остановится.' : ''}</DialogDescription></DialogHeader>{error && <ErrorNotice>{error}</ErrorNotice>}<DialogFooter><Button variant="outline" autoFocus disabled={busy} onClick={onClose}>Отмена</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? <LoaderCircle className="spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}{busy ? 'Удаляем…' : 'Удалить анализ'}</Button></DialogFooter></DialogContent></Dialog>;
}
