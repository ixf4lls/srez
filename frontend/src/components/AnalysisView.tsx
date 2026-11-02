import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowLeft,ChevronRight,Clock3,Database,Expand,LoaderCircle,Pause,Play,RefreshCw,Search,ShieldCheck,SlidersHorizontal,X} from 'lucide-react';
import {Cell,Pie,PieChart,ResponsiveContainer,Tooltip} from 'recharts';
import {api,date,isActive,number,statusLabel} from '../types';
import type {Analysis,Metric,Vacancy} from '../types';
import {deriveReport,dimensions,filterVacancies,readViewFilters,salaryGroups} from '../analytics';
import type {Dimension,ViewFilters} from '../analytics';
import {Explorer} from './Explorer';
import type {Exploration} from './Explorer';
import {ResponsePlot,SalaryPlot} from './VacancyCharts';

const colors=['#8470ed','#242428','#a9cbb6','#e8bf79','#b3b9c9','#d5c4eb','#93b8cd','#c9d0d3'];

export function AnalysisView({id,navigate,onRepeat}:{id:string;navigate:(s:string)=>void;onRepeat:(a:Analysis)=>void}) {
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [error,setError]=useState('');
  const [vacancies,setVacancies]=useState<Vacancy[]>([]);
  const [vacanciesLoaded,setVacanciesLoaded]=useState(false);
  const [vacancyError,setVacancyError]=useState('');
  const [exploration,setExploration]=useState<Exploration|null>(null);
  const [actionLoading,setActionLoading]=useState(false);
  const [reqKind,setReqKind]=useState('Обязательно');
  const [showQuery,setShowQuery]=useState(false);
  const [filters,setFilters]=useState<ViewFilters>(readViewFilters);
  const [salaryKey,setSalaryKey]=useState('');
  const active=analysis?isActive(analysis):false;
  const refresh=async()=>{try{setAnalysis(await api<Analysis>(`/analyses/${id}`));setError('')}catch(e){setError((e as Error).message)}};
  const loadVacancies=async()=>{
    try{setVacancies(await api<Vacancy[]>(`/analyses/${id}/vacancies`));setVacancyError('');setVacanciesLoaded(true)}
    catch(e){setVacancyError((e as Error).message)}
  };
  useEffect(()=>{void refresh()},[id]);
  useEffect(()=>{if(!active)return;const timer=setInterval(()=>void refresh(),1500);return()=>clearInterval(timer)},[id,active]);
  useEffect(()=>{if(analysis&&!active)void loadVacancies()},[analysis?.status,id]);
  useEffect(()=>{
    const url=new URL(location.href);
    if(Object.keys(filters).length)url.searchParams.set('view',JSON.stringify(filters));else url.searchParams.delete('view');
    history.replaceState({},'',url.pathname+url.search);
  },[filters]);

  const scoped=useMemo(()=>filterVacancies(vacancies,filters),[vacancies,filters]);
  const loadedTotal=vacancies.filter(v=>v.loaded).length;
  const filtered=Object.values(filters).some(values=>values?.length);
  const r=useMemo(()=>analysis?.report&&vacanciesLoaded?deriveReport(analysis.report,scoped):null,[analysis?.report,scoped,vacanciesLoaded]);
  const salaries=useMemo(()=>salaryGroups(scoped),[scoped]);
  const salaryGroup=salaries.find(g=>g.key===salaryKey)||salaries[0];
  const sourceVacancies=filtered?scoped:vacancies;

  function toggleFilter(dimension:Dimension,value:string|string[]) {
    const values=Array.isArray(value)?value:[value];
    setFilters(previous=>{
      const selected=previous[dimension]||[];
      const next=values.every(v=>selected.includes(v))?selected.filter(v=>!values.includes(v)):[...new Set([...selected,...values])];
      const result={...previous};if(next.length)result[dimension]=next;else delete result[dimension];return result;
    });
    setExploration(null);
  }
  function removeFilter(dimension:Dimension,value:string) {
    setFilters(previous=>{const result={...previous};const values=(result[dimension]||[]).filter(v=>v!==value);if(values.length)result[dimension]=values;else delete result[dimension];return result});
  }
  async function action(kind:'cancel'|'resume') {
    setActionLoading(true);try{await api(`/analyses/${id}/${kind}`,{});await refresh()}catch(e){setError((e as Error).message)}finally{setActionLoading(false)}
  }
  function openResponses(expanded=false) {
    if(r)setExploration({title:'Отклики',dimension:'responses',points:r.responses,expanded,mean:r.responseMean});
  }
  function openSalary(expanded=false) {
    if(salaryGroup)setExploration({title:'Зарплаты',dimension:'salary',salaries:salaryGroup.points,salaryLabel:salaryGroup.label,expanded});
  }

  if(!analysis)return <div className="empty-state large">{error?<><AlertCircle/><p>{error}</p><button className="button secondary" onClick={()=>void refresh()}>Повторить</button></>:<><LoaderCircle className="spin"/><p>Загрузка…</p></>}</div>;
  const a=analysis;
  const canResume=!active&&(['cancelled','attention','interrupted'].includes(a.status)||(a.status==='partial'&&(a.failed>0||(a.found>a.collected&&a.nextPage<40))));
  const requirements=r?.requirements.filter(m=>m.kind===reqKind)||[];

  return <>
    <section className="analysis-heading">
      <div className="report-topline"><button className="text-button" onClick={()=>navigate('/history')}><ArrowLeft size={15}/>История</button><span className={`status-badge status-${a.status}`}>{active&&<LoaderCircle size={12} className="spin"/>}{statusLabel[a.status]}</span></div>
      <div className="report-heading"><div><h1>{a.title}</h1><div className="report-subtitle"><span><Clock3 size={14}/>{date(a.createdAt)} МСК</span><span>{a.mode==='roles'?'В названии':'Во всём тексте'}</span></div></div>
        <div className="report-actions">{canResume&&<button className="button primary" disabled={actionLoading} onClick={()=>void action('resume')}>{actionLoading?<LoaderCircle size={15} className="spin"/>:<Play size={15}/>}Продолжить сбор</button>}<button className="button secondary" onClick={()=>onRepeat(a)}><RefreshCw size={15}/>Повторить поиск</button></div>
      </div>
      <div className="report-query"><button onClick={()=>setShowQuery(!showQuery)} aria-expanded={showQuery}><Search size={14}/><span>Запрос</span><ChevronRight size={13} className={showQuery?'rotate-90':''}/></button><div className="report-filter-tags">{Object.entries(a.filters).filter(([,v])=>v).map(([key,value])=><span className="tag" key={key}>{a.filterLabels?.[key]||value}</span>)}</div>{showQuery&&<code>{a.expression}</code>}</div>
    </section>

    {error&&<div className="notice error" role="alert"><AlertCircle size={17}/>{error}</div>}
    {!active&&a.error&&<div className="notice warning"><AlertCircle size={18}/><div><strong>{a.message}</strong><p>{a.error.replace(/^\w+:\s*/,'')}</p>{/auth|blocked/.test(a.error)&&<p><code>api-anything login hh --window</code></p>}</div></div>}
    {active?<Progress analysis={a} onCancel={()=>void action('cancel')} loading={actionLoading}/>:<>
      {vacancyError?<div className="notice error" role="alert">{vacancyError}<button onClick={()=>void loadVacancies()}>Повторить загрузку</button></div>:!vacanciesLoaded?<div className="empty-state"><LoaderCircle size={20} className="spin"/>Загрузка вакансий…</div>:null}
      {r&&<>
        {a.warnings?.length>0&&<details className="coverage-notice"><summary><ShieldCheck size={15}/>Загружено: {number(a.processed)} из {number(a.found||a.collected)}<ChevronRight size={14}/></summary><ul>{[...new Set(a.warnings)].map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}
        <section className="analysis-filterbar" aria-label="Фильтры отчёта">
          <div className="vacancy-count"><strong data-testid="vacancy-count">{number(r.total)}</strong><span>{filtered?`из ${number(loadedTotal)} вакансий`:'вакансий'}</span>{!filtered&&a.found>loadedTotal&&<small>из {number(a.found)} найденных</small>}</div>
          <div className="view-filter-chips">{dimensions.flatMap(({key,title})=>(filters[key]||[]).map(value=><button className="view-filter-chip" key={`${key}:${value}`} onClick={()=>removeFilter(key,value)} aria-label={`Убрать фильтр ${title}: ${value}`}><span>{title}:</span>{value}<X size={13}/></button>))}</div>
          {filtered&&<button className="text-button reset-filters" onClick={()=>setFilters({})}>Сбросить<RefreshCw size={13}/></button>}
        </section>

        {r.total>0?<div className="report-panels">
          <div className="dimensions-grid">{dimensions.map(({key,title})=>{
            const data=r.dimensions[key]||[];
            const context={title,dimension:key==='format'?'workFormats':key,metrics:data,filterDimension:key};
            return <article className="chart-card" key={key} data-testid={`dimension-${key}`}>
              <div className="card-heading"><h3>{title}</h3>{key==='format'&&<span className="chart-meta" title="Каждая вакансия учитывается в каждом указанном формате; сумма долей может превышать 100%">С пересечениями</span>}<button className="icon-button" aria-label={`Развернуть: ${title}`} onClick={()=>setExploration({...context,expanded:true})}><Expand size={15}/></button></div>
              {key==='format'?<div className="format-summary">{data.map((metric,i)=><button key={metric.key} className={`format-row ${filters.format?.includes(metric.label)?'selected':''}`} aria-pressed={!!filters.format?.includes(metric.label)} disabled={!metric.count} onClick={()=>toggleFilter('format',metric.label)}><span className="format-row-heading"><span className="legend-dot" style={{background:colors[i]}}/><span>{metric.label}</span><small>{number(metric.count)}</small><strong>{number(metric.percent)}%</strong></span><span className="format-track"><span style={{width:`${metric.percent}%`,background:colors[i]}}/></span></button>)}</div>:<div className="donut-content">
                <div className="donut-chart"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={data.slice(0,7).concat(data.length>7?[otherMetric(data.slice(7))]:[])} dataKey="count" nameKey="label" innerRadius={58} outerRadius={80} paddingAngle={3} cornerRadius={5} stroke="none" isAnimationActive={false} onClick={(_,i)=>toggleFilter(key,i<7?data[i].label:data.slice(7).map(m=>m.label))}>{data.slice(0,8).map((metric,i)=><Cell key={metric.key} fill={colors[i%colors.length]} className="chart-segment"/>)}</Pie><Tooltip formatter={value=>[`${number(Number(value))} вакансий`,'Количество']} contentStyle={{borderRadius:10,border:'1px solid #eee',fontSize:12}}/></PieChart></ResponsiveContainer></div>
                <div className="chart-legend">{data.slice(0,5).map((metric,i)=><button key={metric.key} className={filters[key]?.includes(metric.label)?'selected':''} aria-pressed={!!filters[key]?.includes(metric.label)} onClick={()=>toggleFilter(key,metric.label)} title={`${metric.count} вакансий`}><span className="legend-dot" style={{background:colors[i]}}/><span className="legend-label">{metric.label}</span><strong>{number(metric.percent)}<small>%</small></strong></button>)}{data.length>5&&<button onClick={()=>setExploration({...context,expanded:true})}><span className="legend-label">Все категории ({data.length})</span></button>}</div>
              </div>}
              <button className="card-source" onClick={()=>setExploration(context)}><Database size={13}/>Исходные данные</button>
            </article>;
          })}</div>

          <article className="chart-card vacancy-series-card" data-testid="response-chart"><div className="card-heading"><h3>Отклики</h3>{r.responseCoverage<r.total&&<span className="chart-meta">{number(r.responseCoverage)} / {number(r.total)}</span>}<button className="icon-button" aria-label="Развернуть график откликов" onClick={()=>openResponses(true)}><Expand size={15}/></button></div>
            {r.responses.length?<ResponsePlot points={r.responses} mean={r.responseMean} onChoose={vacancyId=>setExploration({title:'Отклики',dimension:'responses',points:r.responses,vacancyId})}/>:<div className="empty-state compact">Нет данных об откликах</div>}
            <button className="card-source" onClick={()=>openResponses()}><Database size={13}/>Исходные данные</button>
          </article>

          <article className="chart-card vacancy-series-card" data-testid="salary-chart"><div className="card-heading"><h3>Зарплаты</h3>{salaryGroup&&<>{salaries.length>1?<select className="salary-unit-select" aria-label="Валюта, период и налоги" value={salaryGroup.key} onChange={e=>setSalaryKey(e.target.value)}>{salaries.map(group=><option value={group.key} key={group.key}>{group.label} ({group.points.length})</option>)}</select>:<span className="chart-meta">{salaryGroup.label}</span>}<span className="chart-meta">{number(salaryGroup.points.length)} / {number(r.total)}</span></>}<button className="icon-button" disabled={!salaryGroup} aria-label="Развернуть график зарплат" onClick={()=>openSalary(true)}><Expand size={15}/></button></div>
            {salaryGroup?<SalaryPlot points={salaryGroup.points} onChoose={vacancyId=>setExploration({title:'Зарплаты',dimension:'salary',salaries:salaryGroup.points,salaryLabel:salaryGroup.label,vacancyId})}/>:<div className="empty-state compact">Зарплаты не указаны</div>}
            {salaryGroup&&<button className="card-source" onClick={()=>openSalary()}><Database size={13}/>Исходные данные</button>}
          </article>

          <div className="rankings-grid"><Ranking title="Ключевые навыки" metrics={r.skills} coverage={r.skillsCoverage<r.total?`${r.skillsCoverage} / ${r.total}`:undefined} onOpen={metric=>setExploration({title:'Ключевые навыки',metrics:r.skills,metric})} onAll={()=>setExploration({title:'Ключевые навыки',metrics:r.skills})} color="purple"/>
            <Ranking title="Требования" metrics={requirements} coverage={r.requirementsCoverage<r.total?`${r.requirementsCoverage} / ${r.total}`:undefined} onOpen={metric=>setExploration({title:'Требования',metrics:r.requirements,metric})} onAll={()=>setExploration({title:'Требования',metrics:r.requirements})} color="mint"><div className="requirement-tabs"><button className={reqKind==='Обязательно'?'selected':''} onClick={()=>setReqKind('Обязательно')}>Обязательно</button><button className={reqKind==='Будет плюсом'?'selected':''} onClick={()=>setReqKind('Будет плюсом')}>Будет плюсом</button></div></Ranking>
          </div>
        </div>:<div className="empty-state large"><h2>{filtered?'Нет вакансий по выбранным фильтрам':a.collected?'Нет загруженных вакансий':'Вакансии не найдены'}</h2>{filtered&&<button className="button secondary" onClick={()=>setFilters({})}>Сбросить фильтры</button>}</div>}
        <div className="all-vacancies-cta"><button className="button primary" onClick={()=>setExploration({title:filtered?'Вакансии по фильтрам':'Все вакансии',all:true})}>Посмотреть найденные вакансии ({number(sourceVacancies.length)})</button></div>
      </>}
    </>}
    <Explorer context={exploration} vacancies={sourceVacancies} onClose={()=>setExploration(null)} onFilter={toggleFilter}/>
  </>;
}

function otherMetric(data:Metric[]):Metric {return {key:'other',label:'Другие',count:data.reduce((sum,x)=>sum+x.count,0),percent:data.reduce((sum,x)=>sum+x.percent,0),vacancyIds:data.flatMap(x=>x.vacancyIds),evidence:data.flatMap(x=>x.evidence)}}
function Ranking({title,metrics,coverage,onOpen,onAll,color,children}:{title:string;metrics:Metric[];coverage?:string;onOpen:(m:Metric)=>void;onAll:()=>void;color:string;children?:React.ReactNode}) {return <article className="chart-card ranking-card"><div className="card-heading"><h3>{title}</h3>{coverage&&<span className="chart-meta">{coverage}</span>}<button className="icon-button" aria-label={`Развернуть: ${title}`} onClick={onAll}><Expand size={15}/></button></div>{children}<div className="ranking-list">{metrics.slice(0,8).map(metric=><button className="ranking-row" key={metric.key} onClick={()=>onOpen(metric)}><div><div className="rank-label"><strong>{metric.label}</strong><span>{number(metric.percent)}<small>%</small></span></div><div className="rank-track"><span className={`rank-fill ${color}`} style={{width:`${metric.percent}%`}}/></div></div><span className="rank-count">{number(metric.count)}<small>вак.</small></span></button>)}{!metrics.length&&<div className="empty-state compact"><p>Для выбранного фильтра нет показателей.</p></div>}</div><button className="card-source" onClick={onAll}><Database size={13}/>Все данные<span className="nav-count">{metrics.length}</span></button></article>}
function Progress({analysis:a,onCancel,loading}:{analysis:Analysis;onCancel:()=>void;loading:boolean}) {return <section className="progress-card"><div className="progress-intro"><h2>Анализ</h2><p aria-live="polite"><LoaderCircle size={15} className="spin"/>{a.message}</p></div><div className="progress-stats"><div><strong>{number(a.collected)}</strong><span>Ссылки</span></div><div><strong>{number(a.processed)}</strong><span>Загружено</span></div><div><strong>{a.found?number(a.found):'Нет данных'}</strong><span>Найдено</span></div></div><div className="progress-bottom"><button className="button secondary" disabled={loading} onClick={onCancel}>{loading?<LoaderCircle className="spin" size={14}/>:<Pause size={14}/>}Остановить</button></div></section>}
