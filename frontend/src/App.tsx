import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined, FileChartColumn, History, Menu, Moon, Plus, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { api, date, isActive, statusLabel } from './types';
import type { Analysis } from './types';
import { SearchForm } from './components/SearchForm';
import { HistoryView } from './components/HistoryView';
import { EmptyState, LoadingState } from './components/AppUI';

const AnalysisView = lazy(() => import('./components/AnalysisView').then(m => ({ default: m.AnalysisView })));

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [repeat, setRepeat] = useState<Analysis | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const id = path.match(/^\/analyses\/([a-f0-9]+)$/)?.[1];
  const current = analyses.find(a => a.id === id);
  const page = id ? current?.title || 'Отчёт' : path === '/history' ? 'История анализов' : 'Новый анализ';

  function navigate(next: string) {
    history.pushState({}, '', next);
    setPath(next.split('?')[0]);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, next: string) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(next);
  }
  function newAnalysis() {
    setRepeat(null); setFormKey(k => k + 1); navigate('/');
  }
  async function refresh() {
    try { setAnalyses(await api<Analysis[]>('/analyses')); setHistoryError(''); }
    catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => {
    const onPop = () => { setPath(location.pathname); setMenuOpen(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { void refresh(); }, [path]);
  const hasActive = analyses.some(isActive);
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [hasActive]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('srez-theme', dark ? 'dark' : 'light'); } catch { /* Storage can be disabled by the browser. */ }
  }, [dark]);
  useEffect(() => { document.title = `${page} · srez.`; }, [page]);

  const navigation = <>
    <SidebarHeader className="brand-header">
      <a className="wordmark" href="/" onClick={e => follow(e, '/')}>srez<span>.</span></a>
      <p className="text-muted-foreground text-xs">Аналитика рынка вакансий</p>
      <Button className="mt-5 w-full justify-start" onClick={newAnalysis}><Plus data-icon="inline-start" />Новый анализ</Button>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={path === '/history'}><a href="/history" onClick={e => follow(e, '/history')}><History aria-hidden="true" /><span>История анализов</span><span className="ml-auto text-xs text-muted-foreground">{analyses.length || ''}</span></a></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
      <SidebarGroup className="recent-navigation"><SidebarGroupLabel>Последние анализы</SidebarGroupLabel>
        <SidebarMenu>{analyses.slice(0, 7).map(a => <SidebarMenuItem key={a.id}><SidebarMenuButton asChild isActive={a.id === id} className="recent-analysis-link"><a href={`/analyses/${a.id}`} onClick={e => follow(e, `/analyses/${a.id}`)} title={`${a.title}: ${statusLabel[a.status] || a.status}`}><FileChartColumn aria-hidden="true" /><span className="recent-analysis-copy"><span>{a.title}</span><small>{isActive(a) ? statusLabel[a.status] : date(a.createdAt).split(',')[0]}</small></span>{isActive(a) && <span className="activity-mark" aria-label={statusLabel[a.status]} />}</a></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
        {!analyses.length && <p className="sidebar-hint">Сохранённые отчёты появятся здесь после первого анализа.</p>}
        {historyError && <p className="sidebar-hint">Не удалось обновить историю. <button className="inline-link" onClick={() => void refresh()}>Повторить</button></p>}
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="sidebar-bottom"><Button variant="ghost" className="justify-start" onClick={() => setDark(!dark)}>{dark ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}{dark ? 'Светлая тема' : 'Тёмная тема'}</Button><div className="sidebar-source"><span>Источник данных</span><a href="https://hh.ru" target="_blank" rel="noreferrer">hh.ru<ArrowUpRight size={12} aria-hidden="true" /></a></div></SidebarFooter>
  </>;

  return <SidebarProvider style={{ '--sidebar-width': '15rem' } as CSSProperties}>
    <a className="skip-link" href="#workspace">Перейти к содержимому</a>
    <Sidebar collapsible="none"><nav className="sidebar-nav" aria-label="Основная навигация">{navigation}</nav></Sidebar>
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetContent side="left" className="mobile-navigation" aria-describedby={undefined}><SheetHeader className="sr-only"><SheetTitle>Навигация srez.</SheetTitle></SheetHeader><nav className="sidebar-nav" aria-label="Мобильная навигация">{navigation}</nav></SheetContent></Sheet>
    <SidebarInset className="min-w-0">
      <header className="workspace-topbar"><IconButton variant="ghost" className="mobile-menu-button" aria-label="Открыть навигацию" onClick={() => setMenuOpen(true)}><Menu /></IconButton><span className="workspace-label"><ChartNoAxesCombined size={15} aria-hidden="true" />Рабочее пространство</span><span className="breadcrumb-divider">/</span><span className="breadcrumb-current">{page}</span></header>
      <div id="workspace" className="workspace-content" tabIndex={-1}>
        {id ? <Suspense fallback={<LoadingState text="Загружаем отчёт" />}><AnalysisView key={id} id={id} navigate={navigate} onChanged={() => void refresh()} onRepeat={a => { setRepeat(a); setFormKey(k => k + 1); navigate('/'); }} /></Suspense>
          : path === '/history' ? <HistoryView analyses={analyses} loading={historyLoading} error={historyError} navigate={navigate} refresh={refresh} onNew={newAnalysis} />
          : path === '/' ? <SearchForm key={formKey} initial={repeat} onCreated={a => { setRepeat(null); navigate(`/analyses/${a.id}`); }} />
          : <EmptyState title="Страница не найдена" description="Откройте историю или начните новый анализ." action={<Button onClick={newAnalysis}><ArrowLeft data-icon="inline-start" />Новый анализ</Button>} />}
      </div>
    </SidebarInset>
  </SidebarProvider>;
}
