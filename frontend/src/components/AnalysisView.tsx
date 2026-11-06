import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowLeft,ChevronRight,Clock3,Database,Expand,LoaderCircle,Pause,Play,RefreshCw,Search,ShieldCheck,X} from '../kitIcons';
import {Cell,Pie,PieChart,ResponsiveContainer,Tooltip} from 'recharts';
import {api,date,isActive,number,statusLabel} from '../types';
import type {Analysis,Metric,Vacancy} from '../types';
import {deriveReport,dimensions,filterVacancies,fallbackSalaryRates,readViewFilters,salaryGroups} from '../analytics';
import type {Dimension,SalaryRates,ViewFilters} from '../analytics';
import {Explorer} from './Explorer';
import type {Exploration} from './Explorer';
import {ResponsePlot,SalaryPlot} from './VacancyCharts';
import {chartColors,kitColors} from '../designTokens';
import {displayAppMessage,displayLabel} from '../copy';

export function AnalysisView({id,navigate,onRepeat}:{id:string;navigate:(s:string)=>void;onRepeat:(a:Analysis)=>void}) {
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [error,setError]=useState('');
  const [vacancies,setVacancies]=useState<Vacancy[]>([]);
  const [vacanciesLoaded,setVacanciesLoaded]=useState(false);
  const [vacancyError,setVacancyError]=useState('');
  const [exploration,setExploration]=useState<Exploration|null>(null);
  const [actionLoading,setActionLoading]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [reqKind,setReqKind]=useState('Обязательно');
  const [showQuery,setShowQuery]=useState(false);
  const [filters,setFilters]=useState<ViewFilters>(readViewFilters);
  const [salaryRates,setSalaryRates]=useState<SalaryRates>(fallbackSalaryRates);
  const [salaryRateState,setSalaryRateState]=useState<'loading'|'fresh'|'fallback'>('loading');
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
    let cancelled=false;
    setSalaryRateState('loading');
    api<{rates:SalaryRates}>('/rates').then(value=>{if(cancelled)return;setSalaryRates({...fallbackSalaryRates,...value.rates});setSalaryRateState('fresh')}).catch(()=>{if(!cancelled)setSalaryRateState('fallback')});
    return()=>{cancelled=true};
  },[id]);
  useEffect(()=>{
    const url=new URL(location.href);
    if(Object.keys(filters).length)url.searchParams.set('view',JSON.stringify(filters));else url.searchParams.delete('view');
    history.replaceState({},'',url.pathname+url.search);
  },[filters]);

  const scoped=useMemo(()=>filterVacancies(vacancies,filters),[vacancies,filters]);
  const loadedTotal=vacancies.filter(v=>v.loaded).length;
  const filtered=Object.values(filters).some(values=>values?.length);
  const unfilteredReport=useMemo(()=>analysis?.report&&vacanciesLoaded?deriveReport(analysis.report,vacancies):null,[analysis?.report,vacancies,vacanciesLoaded]);
  const r=useMemo(()=>analysis?.report&&vacanciesLoaded?deriveReport(analysis.report,scoped):null,[analysis?.report,scoped,vacanciesLoaded]);
  const salaries=useMemo(()=>salaryGroups(scoped,salaryRates),[scoped,salaryRates]);
  const salaryGroup=salaries[0];
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
  async function refreshData() {
    setRefreshing(true);setError('');setVacancyError('');
    try {
      const next=await api<Analysis>(`/analyses/${id}/refresh`,{});
      setAnalysis(next);setVacancies([]);setVacanciesLoaded(false);setExploration(null);
      if(!isActive(next))await loadVacancies();
    } catch(e) {setError((e as Error).message)} finally {setRefreshing(false)}
  }
  function openResponses(expanded=false) {
    if(r)setExploration({title:'Applications',dimension:'responses',points:r.responses,expanded,mean:r.responseMean});
  }
  function openSalary(expanded=false) {
    if(salaryGroup)setExploration({title:'Salaries',dimension:'salary',salaries:salaryGroup.points,salaryLabel:salaryGroup.label,expanded});
  }

  if(!analysis)return <div className="empty-state large">{error?<><AlertCircle/><p>{error}</p><button className="button secondary" onClick={()=>void refresh()}>Retry</button></>:<><LoaderCircle className="spin"/><p>Loading analysis…</p></>}</div>;
  const a=analysis;
  const canResume=!active&&(['cancelled','attention','interrupted'].includes(a.status)||(a.status==='partial'&&(a.failed>0||(a.found>a.collected&&a.nextPage<40))));
  const requirements=r?.requirements.filter(m=>m.kind===reqKind)||[];

  return <>
    <section className="analysis-heading">
      <div className="report-topline"><button className="text-button" onClick={()=>navigate('/history')}><ArrowLeft size={15}/>History</button><span className={`status-badge status-${a.status}`}>{active&&<LoaderCircle size={12} className="spin"/>}{statusLabel[a.status]}</span></div>
      <div className="report-heading"><div><h1>{a.title}</h1><div className="report-subtitle"><span><Clock3 size={14}/>{date(a.createdAt)} MSK</span><span>{a.mode==='roles'?'Job titles':'Full vacancy text'}</span></div></div>
        <div className="report-actions">{canResume&&<button className="button primary" disabled={actionLoading||refreshing} onClick={()=>void action('resume')}>{actionLoading?<LoaderCircle size={15} className="spin"/>:<Play size={15}/>}Resume collection</button>}{!active&&<button className="button secondary" disabled={refreshing} onClick={()=>void refreshData()}>{refreshing?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}Refresh data</button>}<button className="button secondary" disabled={refreshing} onClick={()=>onRepeat(a)}><Search size={15}/>Repeat search</button></div>
      </div>
      <div className="report-query"><button onClick={()=>setShowQuery(!showQuery)} aria-expanded={showQuery}><Search size={14}/><span>Query</span><ChevronRight size={13} className={showQuery?'rotate-90':''}/></button><div className="report-filter-tags">{Object.entries(a.filters).filter(([,v])=>v).map(([key,value])=><span className="tag" key={key}>{displayLabel(a.filterLabels?.[key]||value)}</span>)}{a.excludeWords&&<span className="tag">Exclude: {a.excludeWords}</span>}</div>{showQuery&&<code>{a.expression}</code>}</div>
    </section>

    {error&&<div className="notice error" role="alert"><AlertCircle size={17}/>{error}</div>}
    {!active&&a.error&&<div className="notice warning"><AlertCircle size={18}/><div><strong>{displayAppMessage(a.message)}</strong><p>{displayAppMessage(a.error)}</p>{/auth|blocked/.test(a.error)&&<p><code>api-anything login hh --window</code></p>}</div></div>}
    {active?<Progress analysis={a} onCancel={()=>void action('cancel')} loading={actionLoading}/>:<>
      {vacancyError?<div className="notice error" role="alert">{vacancyError}<button onClick={()=>void loadVacancies()}>Retry loading</button></div>:!vacanciesLoaded?<div className="empty-state"><LoaderCircle size={20} className="spin"/>Loading vacancies…</div>:null}
      {r&&<>
        {(a.warnings?.length>0||(a.skipped??0)>0)&&<details className="coverage-notice"><summary><ShieldCheck size={15}/>Loaded: {number(a.processed)} of {number(a.found||a.collected)}{a.skipped?` · already processed: ${number(a.skipped)}`:''}<ChevronRight size={14}/></summary><ul>{(a.skipped??0)>0&&<li>Previously analyzed vacancies were skipped during link collection.</li>}{[...new Set(a.warnings||[])].map((warning,i)=><li key={i}>{displayAppMessage(warning)}</li>)}</ul></details>}
        <section className="analysis-filterbar" aria-label="Report filters">
          <div className="vacancy-count"><strong data-testid="vacancy-count">{number(r.total)}</strong><span>{filtered?`of ${number(loadedTotal)} ${loadedTotal===1?'vacancy':'vacancies'}`:r.total===1?'vacancy':'vacancies'}</span>{!filtered&&a.found>loadedTotal&&<small>of {number(a.found)} found</small>}</div>
          <div className="view-filter-chips">{dimensions.flatMap(({key,title})=>(filters[key]||[]).map(value=><button className="view-filter-chip" key={`${key}:${value}`} onClick={()=>removeFilter(key,value)} aria-label={`Remove filter ${displayLabel(title)}: ${displayLabel(value)}`}><span>{displayLabel(title)}:</span>{displayLabel(value)}<X size={13}/></button>))}</div>
          {filtered&&<button className="text-button reset-filters" onClick={()=>setFilters({})}>Reset<RefreshCw size={13}/></button>}
        </section>

        {r.total>0?<div className="report-panels">
          <EmploymentFormatStats report={r} availableMetrics={unfilteredReport?.dimensions.employmentForm} selected={filters.employmentForm||[]} onToggle={value=>toggleFilter('employmentForm',value)} />
          <div className="dimensions-grid">{dimensions.filter(({key})=>key!=='employmentForm').map(({key,title})=>{
            const data=scopedMetrics(r.dimensions[key]||[],unfilteredReport?.dimensions[key]||[]);
            const context={title,dimension:key==='format'?'workFormats':key,metrics:data,filterDimension:key};
            return <article className="chart-card" key={key} data-testid={`dimension-${key}`}>
              <div className="card-heading"><h2>{displayLabel(title)}</h2>{key==='format'&&<span className="chart-meta" title="A vacancy can belong to multiple work formats, so percentages may exceed 100%.">Overlapping categories</span>}<button className="icon-button" aria-label={`Expand: ${displayLabel(title)}`} onClick={()=>setExploration({...context,expanded:true})}><Expand size={15}/></button></div>
              {key==='format'?<div className="format-summary">{data.map((metric,i)=><button key={metric.key} className={`format-row ${filters.format?.includes(metric.label)?'selected':''}`} aria-pressed={!!filters.format?.includes(metric.label)} disabled={!metric.count} onClick={()=>toggleFilter('format',metric.label)}><span className="format-row-heading"><span className="legend-dot" style={{background:chartColors[i%chartColors.length]}}/><span>{displayLabel(metric.label)}</span><small>{number(metric.count)}</small><strong>{number(metric.percent)}%</strong></span><span className="format-track"><span style={{width:`${metric.percent}%`,background:chartColors[i%chartColors.length]}}/></span></button>)}</div>:<div className="donut-content">
                <div className="donut-chart"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={data.slice(0,7).concat(data.length>7?[otherMetric(data.slice(7))]:[]).map(metric=>({...metric,label:displayLabel(metric.label)}))} dataKey="count" nameKey="label" innerRadius={58} outerRadius={80} paddingAngle={3} cornerRadius={5} stroke="none" isAnimationActive={false} onClick={(_,i)=>toggleFilter(key,i<7?data[i].label:data.slice(7).map(m=>m.label))}>{data.slice(0,8).map((metric,i)=><Cell key={metric.key} fill={chartColors[i%chartColors.length]} className="chart-segment"/>)}</Pie><Tooltip formatter={value=>[`${number(Number(value))} ${Number(value)===1?'vacancy':'vacancies'}`,'Count']} contentStyle={{borderRadius:10,border:`1px solid ${kitColors.violet[1]}`,fontSize:12}}/></PieChart></ResponsiveContainer></div>
                <div className="chart-legend">{data.slice(0,5).map((metric,i)=><button key={metric.key} className={filters[key]?.includes(metric.label)?'selected':''} aria-pressed={!!filters[key]?.includes(metric.label)} onClick={()=>toggleFilter(key,metric.label)} title={`${metric.count} ${metric.count===1?'vacancy':'vacancies'}: ${displayLabel(metric.label)}`}><span className="legend-dot" style={{background:chartColors[i%chartColors.length]}}/><span className="legend-label">{displayLabel(metric.label)}</span><strong>{number(metric.percent)}<small>%</small></strong></button>)}{data.length>5&&<button onClick={()=>setExploration({...context,expanded:true})}><span className="legend-label">All categories ({data.length})</span></button>}</div>
              </div>}
              <button className="card-source" onClick={()=>setExploration(context)}><Database size={13}/>Source data</button>
            </article>;
          })}</div>

          <article className="chart-card vacancy-series-card" data-testid="response-chart"><div className="card-heading"><h2>Applications</h2>{r.responseCoverage<r.total&&<span className="chart-meta">{number(r.responseCoverage)} / {number(r.total)}</span>}<button className="icon-button" aria-label="Expand applications chart" onClick={()=>openResponses(true)}><Expand size={15}/></button></div>
            {r.responses.length?<ResponsePlot points={r.responses} mean={r.responseMean} onChoose={vacancyId=>setExploration({title:'Applications',dimension:'responses',points:r.responses,vacancyId})}/>:<div className="empty-state compact">Application counts are unavailable for this selection.</div>}
            <button className="card-source" onClick={()=>openResponses()}><Database size={13}/>Source data</button>
          </article>

          <article className="chart-card vacancy-series-card" data-testid="salary-chart"><div className="card-heading"><h2>Salaries</h2>{salaryGroup&&<><span className="chart-meta">{displayLabel(salaryGroup.label)}</span><span className="chart-meta">{number(salaryGroup.points.length)} / {number(r.total)}</span>{salaryRateState==='fallback'&&<span className="chart-meta" title="The current Central Bank of Russia rate is unavailable; a fallback rate is shown.">Fallback rate</span>}</>}<button className="icon-button" disabled={!salaryGroup} aria-label="Expand salary chart" onClick={()=>openSalary(true)}><Expand size={15}/></button></div>
            {salaryGroup?<SalaryPlot points={salaryGroup.points} onChoose={vacancyId=>setExploration({title:'Salaries',dimension:'salary',salaries:salaryGroup.points,salaryLabel:salaryGroup.label,vacancyId})}/>:<div className="empty-state compact">No salaries are listed for this selection.</div>}
            {salaryGroup&&<button className="card-source" onClick={()=>openSalary()}><Database size={13}/>Source data</button>}
          </article>

          <div className="rankings-grid"><Ranking title="Key skills" metrics={r.skills} coverage={r.skillsCoverage<r.total?`${r.skillsCoverage} / ${r.total}`:undefined} onOpen={metric=>setExploration({title:'Key skills',metrics:r.skills,metric})} onAll={()=>setExploration({title:'Key skills',metrics:r.skills})} fillColor={kitColors.violet[6]}/>
            <Ranking title="Requirements" metrics={requirements} coverage={r.requirementsCoverage<r.total?`${r.requirementsCoverage} / ${r.total}`:undefined} onOpen={metric=>setExploration({title:'Requirements',metrics:r.requirements,metric})} onAll={()=>setExploration({title:'Requirements',metrics:r.requirements})} fillColor={kitColors.green[9]}><div className="requirement-tabs"><button className={reqKind==='Обязательно'?'selected':''} onClick={()=>setReqKind('Обязательно')}>Required</button><button className={reqKind==='Будет плюсом'?'selected':''} onClick={()=>setReqKind('Будет плюсом')}>Nice to have</button></div></Ranking>
          </div>
        </div>:<><EmploymentFormatStats report={r} availableMetrics={unfilteredReport?.dimensions.employmentForm} selected={filters.employmentForm||[]} onToggle={value=>toggleFilter('employmentForm',value)} /><div className="empty-state large"><h2>{filtered?'No vacancies match these filters':(a.skipped??0)>0?'All found vacancies were analyzed in other reports':a.collected?'No vacancies could be loaded':'No vacancies found'}</h2>{filtered&&<button className="button secondary" onClick={()=>setFilters({})}>Clear filters</button>}</div></>}
        <div className="all-vacancies-cta"><button className="button primary" onClick={()=>setExploration({title:filtered?'Filtered vacancies':'All vacancies',all:true})}>View vacancies ({number(sourceVacancies.length)})</button></div>
      </>}
    </>}
    <Explorer context={exploration} vacancies={sourceVacancies} onClose={()=>setExploration(null)} onFilter={toggleFilter}/>
  </>;
}

function otherMetric(data:Metric[]):Metric {return {key:'other',label:'Other',count:data.reduce((sum,x)=>sum+x.count,0),percent:data.reduce((sum,x)=>sum+x.percent,0),vacancyIds:data.flatMap(x=>x.vacancyIds),evidence:data.flatMap(x=>x.evidence)}}
function Ranking({title,metrics,coverage,onOpen,onAll,fillColor,children}:{title:string;metrics:Metric[];coverage?:string;onOpen:(m:Metric)=>void;onAll:()=>void;fillColor:string;children?:React.ReactNode}) {return <article className="chart-card ranking-card"><div className="card-heading"><h2>{displayLabel(title)}</h2>{coverage&&<span className="chart-meta">{coverage}</span>}<button className="icon-button" aria-label={`Expand: ${displayLabel(title)}`} onClick={onAll}><Expand size={15}/></button></div>{children}<div className="ranking-list">{metrics.slice(0,8).map(metric=><button className="ranking-row" key={metric.key} onClick={()=>onOpen(metric)}><div><div className="rank-label"><strong>{displayLabel(metric.label)}</strong><span>{number(metric.percent)}<small>%</small></span></div><div className="rank-track"><span className="rank-fill" style={{width:`${metric.percent}%`,background:fillColor}}/></div></div><span className="rank-count">{number(metric.count)}<small>{metric.count===1?'job':'jobs'}</small></span></button>)}{!metrics.length&&<div className="empty-state compact"><p>No metrics are available for this filter.</p></div>}</div><button className="card-source" onClick={onAll}><Database size={13}/>All data<span className="nav-count">{metrics.length}</span></button></article>}
function scopedMetrics(current:Metric[],available:Metric[]):Metric[] {
  if(!available.length)return current;
  const currentByLabel=new Map(current.map(metric=>[metric.label,metric]));
  return available.map(metric=>currentByLabel.get(metric.label)||{...metric,count:0,percent:0,vacancyIds:[],evidence:[]});
}

function EmploymentFormatStats({report,availableMetrics,selected,onToggle}:{report:NonNullable<Analysis['report']>;availableMetrics?:Metric[];selected:string[];onToggle:(value:string)=>void}) {
  const current=report.dimensions.employmentForm?.length?report.dimensions.employmentForm:report.dimensions.employment||[];
  const metrics=scopedMetrics(current,availableMetrics||[]);
  const available=new Map((availableMetrics||metrics).map(metric=>[metric.label,metric.count]));
  if(!metrics.length)return null;
  const labels=['ТК РФ','ИП','Самозанятость','ГПХ'];
  const known=labels.map(label=>metrics.find(metric=>metric.label.toLowerCase()===label.toLowerCase())||{key:label,label,count:0,percent:0,vacancyIds:[],evidence:[]});
  const extras=metrics.filter(metric=>!labels.some(label=>label.toLowerCase()===metric.label.toLowerCase()));
  return <section className="employment-format-card" aria-labelledby="employment-format-heading"><div className="employment-format-heading"><div><h2 id="employment-format-heading">Employment type</h2><p>Contract types specified in the vacancies</p></div><div className="employment-format-meta"><span className="chart-meta" title="A vacancy may list several contract types.">Overlapping categories</span><span className="chart-meta">{number(report.total)} {report.total===1?'vacancy':'vacancies'}</span></div></div><div className="employment-format-grid">{[...known,...extras].map(metric=><button type="button" className={`employment-format-stat ${selected.includes(metric.label)?'selected':''}`} key={metric.key} disabled={!metric.count&&!available.get(metric.label)} aria-pressed={selected.includes(metric.label)} onClick={()=>onToggle(metric.label)}><div><strong>{displayLabel(metric.label)}</strong><span>{number(metric.count)}</span></div><div className="employment-format-track"><span style={{width:`${Math.min(metric.percent,100)}%`}}/></div><small>{number(metric.percent)}%</small></button>)}</div></section>;
}

function Progress({analysis:a,onCancel,loading}:{analysis:Analysis;onCancel:()=>void;loading:boolean}) {
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!loading)onCancel()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[onCancel,loading]);
  return <div className="progress-overlay" role="dialog" aria-modal="true" aria-labelledby="progress-title"><section className="progress-modal"><div className="progress-ring" aria-hidden="true"><LoaderCircle size={44} className="spin"/></div><h2 id="progress-title">Collecting vacancies</h2><p className="progress-operation" aria-live="polite">{displayAppMessage(a.message)}</p><div className="progress-stats"><div><strong>{number(a.collected)}</strong><span>Links</span></div><div><strong>{number(a.processed)}</strong><span>Loaded</span></div><div><strong>{a.skipped?number(a.skipped):'0'}</strong><span>Previously analyzed</span></div><div><strong>{a.found?number(a.found):'Not reported'}</strong><span>Found</span></div></div><button className="button secondary" disabled={loading} onClick={onCancel}>{loading?<LoaderCircle className="spin" size={14}/>:<Pause size={14}/>}Stop collection</button></section></div>
}
