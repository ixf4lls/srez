import type { ReactNode } from 'react';
import { AlertCircle, Check, CircleDashed, LoaderCircle, Pause } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeadingSkeleton } from './DataSkeletons';
import { statusLabel } from '../types';

export function StatusBadge({ status }: { status: string }) {
  const Icon = status === 'completed' ? Check : ['queued', 'running'].includes(status) ? LoaderCircle : ['attention', 'interrupted', 'partial'].includes(status) ? AlertCircle : Pause;
  return <Badge variant={status === 'attention' ? 'destructive' : 'secondary'} className={['queued', 'running'].includes(status) ? 'active-status' : ''}><Icon data-icon="inline-start" className={status === 'running' ? 'spin' : ''} />{statusLabel[status] || status}</Badge>;
}

export function PageHeading({ title, description, action, loading = false }: { title: string; description?: string; action?: ReactNode; loading?: boolean }) {
  return <div className="page-heading" aria-busy={loading || undefined}><div><h1>{loading ? <HeadingSkeleton>{title}</HeadingSkeleton> : <span className="data-reveal">{title}</span>}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><CircleDashed size={25} aria-hidden="true" /><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div className="error-notice" role="alert"><AlertCircle size={17} aria-hidden="true" /><div>{children}</div>{retry && <Button variant="outline" size="sm" onClick={retry}>Повторить</Button>}</div>;
}
