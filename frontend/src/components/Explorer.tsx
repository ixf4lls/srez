import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,BriefcaseBusiness,CalendarDays,ChevronRight,Database,ExternalLink,FileText,MapPin,Search,Users,X} from '../kitIcons';
import {Modal} from './Modal';
import {Cell,Pie,PieChart,ResponsiveContainer,Tooltip} from 'recharts';
import {ResponsePlot,SalaryPlot} from './VacancyCharts';
import {date,number} from '../types';
import type {Metric,ResponsePoint,Vacancy} from '../types';
import type {Dimension,SalaryPoint} from '../analytics';
import {chartColors} from '../designTokens';
import {displayAppMessage,displayLabel} from '../copy';

export type Exploration = {title:string;dimension?:string;filterDimension?:Dimension;metrics?:Metric[];metric?:Metric;points?:ResponsePoint[];salaries?:SalaryPoint[];salaryLabel?:string;vacancyId?:string;all?:boolean;expanded?:boolean;mean?:number|null};
export function Explorer({context,vacancies,onClose,onFilter}:{context:Exploration|null;vacancies:Vacancy[];onClose:()=>void;onFilter?:(dimension:Dimension,value:string)=>void}) {
  const [tab,setTab]=useState<'chart'|'data'|'vacancies'>('data');
  const [selected,setSelected]=useState<string|null>(null);
  const [metric,setMetric]=useState<Metric|undefined>();
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState('title');
  useEffect(()=>{if(context){setTab(context.metric||context.all||context.vacancyId?'vacancies':context.expanded?'chart':'data');setMetric(context.metric);setSelected(context.vacancyId||null);setSearch('');setSort('title')}},[context]);
  const sourceIds=metric?.vacancyIds??(context?.points?context.points.map(p=>p.id):context?.salaries?context.salaries.map(p=>p.id):context?.metrics?[...new Set(context.metrics.flatMap(m=>m.vacancyIds))]:undefined);
  const items=useMemo(()=>{
    const ids=metric?.vacancyIds??(context?.points?context.points.map(p=>p.id):context?.salaries?context.salaries.map(p=>p.id):context?.metrics?[...new Set(context.metrics.flatMap(m=>m.vacancyIds))]:undefined);
    const list=vacancies.filter(v=>(!ids||ids.includes(v.id))&&`${v.title} ${v.company} ${v.city}`.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b)=>sort==='responses'?(b.responseCount??-1)-(a.responseCount??-1):sort==='date'?Date.parse(b.publishedAt||b.collectedAt)-Date.parse(a.publishedAt||a.collectedAt):a.title.localeCompare(b.title,'ru'));
  },[vacancies,metric,search,sort,context]);
  useEffect(()=>{if(!selected||!metric)return;const frame=requestAnimationFrame(()=>document.querySelector('.vacancy-detail mark, .vacancy-detail .highlight-field')?.scrollIntoView({behavior:'smooth',block:'center'}));return()=>cancelAnimationFrame(frame)},[selected,metric]);
  const vacancy=vacancies.find(v=>v.id===selected);
  const evidence=metric?.evidence.filter(x=>x.vacancyId===selected)??[];
  const choose=(m:Metric)=>{setMetric(m);setSelected(null);setTab('vacancies')};
  const selectMetric=(m:Metric)=>{if(context?.filterDimension&&onFilter)onFilter(context.filterDimension,m.label);else choose(m)};
  const chooseVacancy=(id:string)=>{setSelected(id);setTab('vacancies')};
  const count=sourceIds?sourceIds.length:vacancies.length;
  return <Modal open={!!context} onClose={onClose} title={displayLabel(context?.title||'Source data')} wide>
    <div className="explorer-tabs"><div className="mode-switch">
      {context?.expanded&&<button className={tab==='chart'?'selected':''} onClick={()=>setTab('chart')}>Chart</button>}
      {(context?.metrics||context?.points||context?.salaries)&&<button className={tab==='data'?'selected':''} onClick={()=>{setTab('data');setSelected(null)}}><Database size={15}/>Source data</button>}
      <button className={tab==='vacancies'?'selected':''} onClick={()=>setTab('vacancies')}><BriefcaseBusiness size={15}/>Vacancies<span className="tab-count">{number(count)}</span></button>
    </div>{metric&&<button className="tag selected-tag" onClick={()=>{setMetric(undefined);setSelected(null)}}>{displayLabel(metric.label)}<X size={12}/></button>}{context?.salaryLabel&&<span className="chart-meta">{displayLabel(context.salaryLabel)}</span>}</div>
    {tab==='chart'?<div className="expanded-chart-wrap">
      {context?.points?<ResponsePlot points={context.points} mean={context.mean??null} onChoose={chooseVacancy} expanded/>:
       context?.salaries?<SalaryPlot points={context.salaries} onChoose={chooseVacancy} expanded/>:
       context?.filterDimension==='format'?<div className="format-summary expanded-format">{context.metrics?.map((m,i)=><button className="format-row" key={m.key} disabled={!m.count} onClick={()=>selectMetric(m)}><span className="format-row-heading"><span>{displayLabel(m.label)}</span><small>{m.count}</small><strong>{number(m.percent)}%</strong></span><span className="format-track"><span style={{width:`${m.percent}%`,background:chartColors[i%chartColors.length]}}/></span></button>)}</div>:
      <div className="expanded-pie"><div><ResponsiveContainer width="100%" height={330}><PieChart><Pie data={(context?.metrics||[]).map(m=>({...m,label:displayLabel(m.label)}))} dataKey="count" nameKey="label" innerRadius={82} outerRadius={137} paddingAngle={2} stroke="none" isAnimationActive={false} onClick={(_,i)=>{const m=context?.metrics?.[i];if(m)selectMetric(m)}}>{context?.metrics?.map((m,i)=><Cell key={m.key} fill={chartColors[i%chartColors.length]} className="chart-segment"/>)}</Pie><Tooltip formatter={v=>[number(Number(v)),'Vacancies']}/></PieChart></ResponsiveContainer></div><div className="expanded-legend">{context?.metrics?.map((m,i)=><button key={m.key} onClick={()=>selectMetric(m)}><span className="legend-dot" style={{background:chartColors[i%chartColors.length]}}/><span>{displayLabel(m.label)}</span><strong>{number(m.count)}</strong><small>{number(m.percent)}%</small></button>)}</div></div>}
    </div>:tab==='data'?<div className="source-table-wrap">
      {context?.points?<table className="data-table"><thead><tr><th>Vacancy</th><th>Applications</th></tr></thead><tbody>{context.points.map(p=><tr key={p.id}><td><button onClick={()=>chooseVacancy(p.id)}>{p.title}</button></td><td className="numeric">{number(p.count)}</td></tr>)}</tbody></table>:
       context?.salaries?<table className="data-table"><thead><tr><th>Vacancy</th><th>Salary</th></tr></thead><tbody>{context.salaries.map(p=><tr key={p.id}><td><button onClick={()=>chooseVacancy(p.id)}>{p.title}</button></td><td>{p.raw}</td></tr>)}</tbody></table>:
       context?.metrics?<table className="data-table"><thead><tr><th>Metric</th><th>Vacancies</th><th title={`Share of ${number(vacancies.filter(v=>v.loaded).length)} loaded vacancies`}>Share</th></tr></thead><tbody>{context.metrics.map(m=><tr key={m.key}><td><button onClick={()=>selectMetric(m)}>{displayLabel(m.label)}{m.kind&&<small>{displayLabel(m.kind)}</small>}</button></td><td className="numeric">{number(m.count)}</td><td className="numeric">{number(m.percent)}%</td></tr>)}</tbody></table>:
       <div className="empty-state"><button className="button secondary" onClick={()=>setTab('vacancies')}>Open list</button></div>}
      {context?.metrics?.length===0&&<div className="empty-state"><p>No metrics are available for this filter.</p><button className="button secondary" onClick={()=>setTab('vacancies')}>Open vacancy list</button></div>}
    </div>:<>
      {vacancy?<div className="vacancy-detail"><button className="text-button back-button" onClick={()=>setSelected(null)}><ArrowLeft size={15}/>Back to vacancies</button>
        <div className="vacancy-title-row"><div><span className="vacancy-company">{vacancy.company}</span><h2>{vacancy.title}</h2>{vacancy.salary&&<p className={`vacancy-salary ${context?.dimension==='salary'?'highlight-field':''}`}>{vacancy.salary}</p>}</div><span className="hh-mark large-hh">hh</span></div>
        {!vacancy.loaded&&<div className="notice warning">{vacancy.error?displayAppMessage(vacancy.error):'Description could not be loaded'}</div>}
        <div className="vacancy-meta">{[
          ['Location',vacancy.city||vacancy.address,'city',MapPin],['Experience',vacancy.experience,'experience',BriefcaseBusiness],['Work format',vacancy.format,'workFormats',FileText],['Seniority',vacancy.grade,'grade',Users],['Applications',vacancy.responseCount==null?'Not available':number(vacancy.responseCount),'responses',Users],
        ].map(([label,value,key,Icon])=>{const I=Icon as typeof MapPin;return <div className={context?.dimension===key?'highlight-field':''} key={key as string}><span><I size={14}/>{label as string}</span><strong>{displayLabel(value as string||'Not specified')}</strong></div>})}</div>

        {vacancy.keySkills?.length>0&&<section className="vacancy-section"><h3>Key skills</h3><div className="skills-tags">{vacancy.keySkills.map((s,i)=><span key={`${s}-${i}`} className={`skill-tag ${evidence.some(e=>e.field==='keySkills'&&e.quote.toLowerCase()===s.toLowerCase())?'highlight-field':''}`}>{s}</span>)}</div></section>}
        <section className="vacancy-section vacancy-description"><h3>Vacancy description</h3>{vacancy.description?vacancy.description.split(/\n\s*\n/).map((p,i)=><p key={i}><Highlight text={p} terms={evidence.filter(e=>e.field==='description').map(e=>e.quote)}/></p>):<p className="text-muted">Description is unavailable.</p>}</section>
        <div className="vacancy-bottom"><div><CalendarDays size={14}/><span>Saved {date(vacancy.collectedAt)}{vacancy.publishedAt&&<> · published {date(vacancy.publishedAt)}</>}</span></div><a href={vacancy.url} target="_blank" rel="noopener noreferrer">Open original on hh.ru<ExternalLink size={14}/></a></div>
      </div>:<><div className="vacancy-toolbar"><label className="small-search"><Search size={16}/><input aria-label="Search vacancies" placeholder="Role, company, city" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Sort vacancies" value={sort} onChange={e=>setSort(e.target.value)}><option value="title">By title</option><option value="responses">By applications</option><option value="date">By date</option></select></div><div className="vacancy-list">{items.map(v=><button className="vacancy-list-item" key={v.id} onClick={()=>setSelected(v.id)}><div className="company-initial">{v.company?.slice(0,1)||'·'}</div><div><h3>{v.title}</h3><p>{v.company} <span>·</span> {v.city||v.address||'City not specified'}</p>{v.salary&&<strong>{v.salary}</strong>}</div><div className="vacancy-list-meta"><span>{displayLabel(v.experience||'Experience not specified')}</span>{v.responseCount!==null&&<span><Users size={13}/>{number(v.responseCount)} applications</span>}{!v.loaded&&<small>Description not loaded</small>}</div></button>)}{!items.length&&<div className="empty-state"><Search size={25}/><p>No vacancies match the current filters.</p><button className="button secondary" onClick={()=>setSearch('')}>Clear search</button></div>}</div><div className="list-count">{number(items.length)} vacancies</div></>}
    </>}
  </Modal>
}

function Highlight({text,terms}:{text:string;terms:string[]}){
  const ranges:{start:number;end:number}[]=[];
  for(const term of [...new Set(terms)].sort((a,b)=>b.length-a.length)){
    if(!term)continue;let index=0;const lower=text.toLowerCase();
    while((index=lower.indexOf(term.toLowerCase(),index))!==-1){const end=index+term.length;if(!ranges.some(r=>index<r.end&&end>r.start))ranges.push({start:index,end});index=end}
  }
  ranges.sort((a,b)=>a.start-b.start);
  let offset=0;const parts:React.ReactNode[]=[];
  ranges.forEach((r,i)=>{parts.push(text.slice(offset,r.start));parts.push(<mark key={i}>{text.slice(r.start,r.end)}</mark>);offset=r.end});parts.push(text.slice(offset));
  return <>{parts}</>
}
