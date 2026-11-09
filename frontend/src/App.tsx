import { lazy, Suspense, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowLeft, History, Moon, Plus, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { api, isActive } from './types';
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
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const id = path.match(/^\/analyses\/([a-f0-9]+)$/)?.[1];
  const hero = path === '/';
  const page = id ? analyses.find(a => a.id === id)?.title || 'Отчёт' : path === '/history' ? 'История анализов' : 'Анализ рынка вакансий';

  function navigate(next: string) {
    history.pushState({}, '', next); setPath(next.split('?')[0]); window.scrollTo({ top: 0 });
  }
  function newAnalysis(event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault(); setRepeat(null); setFormKey(k => k + 1); navigate('/');
  }
  function historyLink(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate('/history');
  }
  async function refresh() {
    try { setAnalyses(await api<Analysis[]>('/analyses')); setHistoryError(''); }
    catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
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

  return <div className={`app-shell ${hero ? 'hero-shell' : ''}`}>
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <header className="app-header">{!hero && <a className="wordmark" href="/" onClick={newAnalysis} aria-label="srez. На главную">srez<span>.</span></a>}<nav aria-label="Основная навигация">
      {!hero && <Button asChild><a href="/" onClick={newAnalysis}><Plus data-icon="inline-start" aria-hidden="true" />Новый анализ</a></Button>}
      <Button asChild variant="ghost" className="history-nav"><a href="/history" onClick={historyLink} aria-current={path === '/history' ? 'page' : undefined}><History data-icon="inline-start" aria-hidden="true" />История</a></Button>
      <IconButton variant="ghost" className="theme-toggle" aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} title={dark ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</IconButton>
    </nav></header>
    <main id="main-content" className={hero ? 'hero-main' : 'content-page'} tabIndex={-1}>
      {id ? <Suspense fallback={<LoadingState text="Загружаем отчёт" />}><AnalysisView key={id} id={id} navigate={navigate} onChanged={() => void refresh()} onRepeat={a => { setRepeat(a); setFormKey(k => k + 1); navigate('/'); }} /></Suspense>
        : path === '/history' ? <HistoryView analyses={analyses} loading={historyLoading} error={historyError} navigate={navigate} refresh={refresh} onNew={() => newAnalysis()} />
        : hero ? <SearchForm key={formKey} initial={repeat} onCreated={a => { setRepeat(null); navigate(`/analyses/${a.id}`); }} />
        : <EmptyState title="Страница не найдена" description="Откройте историю или начните новый анализ." action={<Button onClick={() => newAnalysis()}><ArrowLeft data-icon="inline-start" />Новый анализ</Button>} />}
    </main>
  </div>;
}
