import {Suspense, lazy, useEffect, useState} from 'react';
import {Plus} from './kitIcons';
import type {Analysis} from './types';
import {api, date, isActive, number, statusLabel} from './types';
import {SearchForm} from './components/SearchForm';
import {HistoryView} from './components/HistoryView';

const AnalysisView = lazy(() => import('./components/AnalysisView').then(module => ({default: module.AnalysisView})));

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [repeat, setRepeat] = useState<Analysis | null>(null);

  function navigate(next: string) {
    history.pushState({}, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  }

  function openNewAnalysis() {
    setRepeat(null);
    if (path !== '/') navigate('/');
    window.setTimeout(() => document.getElementById('market-query')?.focus(), 0);
  }

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refresh = () => api<Analysis[]>('/analyses')
    .then(items => { setAnalyses(items); setHistoryError(''); })
    .catch(error => setHistoryError(error.message))
    .finally(() => setHistoryLoading(false));

  useEffect(() => { void refresh(); }, [path]);
  useEffect(() => {
    if (!analyses.some(isActive)) return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [analyses.some(isActive)]);

  const id = path.match(/^\/analyses\/([a-f0-9]+)$/)?.[1];
  const isHistory = path === '/history';
  const recent = analyses.slice(0, 4);

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('/'); }} aria-label="Srez home">Srez<span>.</span></a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="/" className={path === '/' ? 'active' : ''} aria-current={path === '/' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate('/'); }}>Workspace</a>
          <a href="/history" className={path === '/history' || id ? 'active' : ''} aria-current={path === '/history' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate('/history'); }}>History</a>
        </nav>
        <button type="button" className="button primary header-action" onClick={openNewAnalysis}><Plus size={18} aria-hidden="true"/>New analysis</button>
      </div>
    </header>

    <main className="main-content" id="main">
      {id ? <Suspense fallback={<div className="empty-state large" role="status">Loading analysis…</div>}>
        <AnalysisView key={id} id={id} navigate={navigate} onRepeat={analysis => { setRepeat(analysis); navigate('/'); }}/>
      </Suspense> : isHistory ? <HistoryView analyses={analyses} loading={historyLoading} error={historyError} navigate={navigate} refresh={refresh} onNew={openNewAnalysis}/> : path === '/' ? <div className="home-page">
        <section className="home-intro" aria-labelledby="home-title">
          <div className="home-intro-copy">
            <h1 id="home-title">Explore the vacancy market.</h1>
            <p>Compare roles, salaries, skills and requirements from hh.ru listings. Open the vacancies behind every result.</p>
          </div>
          <div className="home-source" aria-label="Data source">
            <span>DATA SOURCE</span>
            <strong>hh.ru</strong>
            <p>Reports are based on collected listings, with a link back to each original vacancy.</p>
          </div>
        </section>

        <section className="home-search" id="new-analysis" aria-labelledby="new-analysis-title">
          <div className="home-section-heading"><div><h2 id="new-analysis-title">Start an analysis</h2><p>Enter a role or technology stack, then review the search expression before collection starts.</p></div></div>
          <SearchForm initial={repeat} onCreated={analysis => { setRepeat(null); navigate(`/analyses/${analysis.id}`); }}/>
        </section>

        <section className="home-explainer" aria-labelledby="home-explainer-title">
          <div><h2 id="home-explainer-title">A clear path from query to evidence</h2><p>The report keeps its filters, source counts and original listings together, so you can check what each result means.</p></div>
          <ol>
            <li><span>01</span><div><strong>Shape the search</strong><p>Choose where terms should match, set filters and confirm the hh.ru expression.</p></div></li>
            <li><span>02</span><div><strong>Inspect the result</strong><p>Filter the report, open a chart’s source data and read the matching vacancies.</p></div></li>
          </ol>
        </section>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="home-section-heading"><div><h2 id="recent-title">Recent analyses</h2><p>Your latest searches are kept in History.</p></div>{recent.length > 0 && <a className="text-link" href="/history" onClick={event => { event.preventDefault(); navigate('/history'); }}>View history</a>}</div>
          {historyLoading ? <div className="home-recent-state" role="status">Loading recent analyses…</div> : historyError ? <div className="home-recent-state" role="alert"><span>Recent analyses could not be loaded. {historyError}</span><button type="button" className="text-link" onClick={() => void refresh()}>Try again</button></div> : recent.length ? <div className="recent-list">{recent.map(analysis => <a key={analysis.id} href={`/analyses/${analysis.id}`} onClick={event => { event.preventDefault(); navigate(`/analyses/${analysis.id}`); }}>
            <span className="recent-title">{analysis.title}</span><span className="recent-date">{date(analysis.createdAt)}</span><span className="recent-count">{number(analysis.processed)} {analysis.processed === 1 ? 'listing' : 'listings'}</span><span className={`status-badge status-${analysis.status}`}>{statusLabel[analysis.status] || analysis.status}</span>
          </a>)}</div> : <div className="home-recent-state">No analyses yet. Start with a role or technology stack above to create your first report.</div>}
        </section>
      </div> : <div className="empty-state large"><h1>Page not found</h1><p>This address does not match an analysis or a page in the app.</p><a className="button primary" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}>Back to workspace</a></div>}
    </main>

    <footer className="site-footer"><span>Srez</span><span>Vacancy data from <a href="https://hh.ru" target="_blank" rel="noopener noreferrer">hh.ru</a></span></footer>
  </div>;
}
