import type { ReactNode } from 'react';
import { AlertCircle, Check, CircleDashed, LoaderCircle, Pause } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { statusLabel } from '../types';

export function StatusBadge({ status }: { status: string }) {
  const Icon = status === 'completed' ? Check : ['queued', 'running'].includes(status) ? LoaderCircle : ['attention', 'interrupted', 'partial'].includes(status) ? AlertCircle : Pause;
  return <Badge variant={status === 'attention' ? 'destructive' : 'secondary'} className={['queued', 'running'].includes(status) ? 'active-status' : ''}><Icon data-icon="inline-start" className={status === 'running' ? 'spin' : ''} />{statusLabel[status] || status}</Badge>;
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><CircleDashed size={25} aria-hidden="true" /><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div className="error-notice" role="alert"><AlertCircle size={17} aria-hidden="true" /><div>{children}</div>{retry && <Button variant="outline" size="sm" onClick={retry}>Повторить</Button>}</div>;
}

export function LoadingState({ text }: { text: string }) {
  return <div className="loading-state" role="status"><p><LoaderCircle className="spin" size={16} aria-hidden="true" />{text}</p><Skeleton className="h-8 w-2/5" /><Skeleton className="h-40 w-full" /><Skeleton className="h-20 w-full" /></div>;
}
