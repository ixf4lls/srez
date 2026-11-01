import {Suspense,lazy,useEffect,useState} from 'react';
import {ChartNoAxesColumnIncreasing,History,ArrowLeft,LoaderCircle} from 'lucide-react';
import type {Analysis} from './types';
import {api,isActive} from './types';
import {SearchForm} from './components/SearchForm';
import {HistoryView} from './components/HistoryView';
const AnalysisView=lazy(()=>import('./components/AnalysisView').then(m=>({default:m.AnalysisView})));

export default function App(){
  const [path,setPath]=useState(location.pathname);
  const [analyses,setAnalyses]=useState<Analysis[]>([]);
  const [historyError,setHistoryError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(true);
  const [repeat,setRepeat]=useState<Analysis|null>(null);
  const navigate=(next:string)=>{history.pushState({},'',next);setPath(next);window.scrollTo({top:0,behavior:'smooth'})};
  useEffect(()=>{const onPop=()=>setPath(location.pathname);window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
  const refresh=()=>api<Analysis[]>('/analyses').then(x=>{setAnalyses(x);setHistoryError('')}).catch(e=>setHistoryError(e.message)).finally(()=>setHistoryLoading(false));
  useEffect(()=>{void refresh()},[path]);
  useEffect(()=>{if(!analyses.some(isActive))return;const t=setInterval(()=>void refresh(),4000);return()=>clearInterval(t)},[analyses.some(isActive)]);
  const id=path.match(/^\/analyses\/([a-f0-9]+)$/)?.[1];
  const isHistory=path==='/history';
  return <div className="app-shell">
    <header className="site-header"><div className="header-inner">
      <nav className="main-nav" aria-label="Разделы"><a href="/" className={!isHistory?'active':''} onClick={e=>{e.preventDefault();navigate('/')}}><ChartNoAxesColumnIncreasing size={16}/>Анализ рынка</a><a href="/history" className={isHistory?'active':''} onClick={e=>{e.preventDefault();navigate('/history')}}><History size={16}/>История</a></nav>
    </div></header>
    <main className="main-content">
      {id?<Suspense fallback={<div className="empty-state large"><LoaderCircle className="spin"/>Загрузка…</div>}><AnalysisView key={id} id={id} navigate={navigate} onRepeat={a=>{setRepeat(a);navigate('/')}}/></Suspense>:isHistory?<HistoryView analyses={analyses} loading={historyLoading} error={historyError} navigate={navigate} refresh={refresh} onNew={()=>{setRepeat(null);navigate('/')}}/>:path==='/'?<>
        <section className="hero"><h1>Анализ рынка вакансий</h1></section>
        <SearchForm initial={repeat} onCreated={a=>{setRepeat(null);navigate(`/analyses/${a.id}`)}}/>
      </>:<div className="empty-state large"><h1>Страница не найдена</h1><button className="button primary" onClick={()=>navigate('/')}><ArrowLeft size={16}/>На главную</button></div>}
    </main>
  </div>
}
