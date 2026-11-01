import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowUpRight,BriefcaseBusiness,CalendarDays,ChevronRight,Database,ExternalLink,FileText,MapPin,Search,Users,X} from 'lucide-react';
import {Modal} from './Modal';
import {Cell,Pie,PieChart,ResponsiveContainer,Tooltip} from 'recharts';
import {ResponsePlot,SalaryPlot} from './VacancyCharts';
import {date,number} from '../types';
import type {Metric,ResponsePoint,Vacancy} from '../types';
import type {Dimension,SalaryPoint} from '../analytics';

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
  return <Modal open={!!context} onClose={onClose} title={context?.title||'Исходные данные'} wide>
    <div className="explorer-tabs"><div className="mode-switch">
      {context?.expanded&&<button className={tab==='chart'?'selected':''} onClick={()=>setTab('chart')}>График</button>}
      {(context?.metrics||context?.points||context?.salaries)&&<button className={tab==='data'?'selected':''} onClick={()=>{setTab('data');setSelected(null)}}><Database size={15}/>Исходные данные</button>}
      <button className={tab==='vacancies'?'selected':''} onClick={()=>setTab('vacancies')}><BriefcaseBusiness size={15}/>Вакансии<span className="tab-count">{number(count)}</span></button>
    </div>{metric&&<button className="tag selected-tag" onClick={()=>{setMetric(undefined);setSelected(null)}}>{metric.label}<X size={12}/></button>}{context?.salaryLabel&&<span className="chart-meta">{context.salaryLabel}</span>}</div>
    {tab==='chart'?<div className="expanded-chart-wrap">
      {context?.points?<ResponsePlot points={context.points} mean={context.mean??null} onChoose={chooseVacancy} expanded/>:
       context?.salaries?<SalaryPlot points={context.salaries} onChoose={chooseVacancy} expanded/>:
       context?.filterDimension==='format'?<div className="format-summary expanded-format">{context.metrics?.map((m,i)=><button className="format-row" key={m.key} disabled={!m.count} onClick={()=>selectMetric(m)}><span className="format-row-heading"><span>{m.label}</span><small>{m.count}</small><strong>{number(m.percent)}%</strong></span><span className="format-track"><span style={{width:`${m.percent}%`,background:['#8470ed','#242428','#a9cbb6'][i]}}/></span></button>)}</div>:
       <div className="expanded-pie"><div><ResponsiveContainer width="100%" height={330}><PieChart><Pie data={context?.metrics||[]} dataKey="count" nameKey="label" innerRadius={82} outerRadius={137} paddingAngle={2} stroke="none" isAnimationActive={false} onClick={(_,i)=>{const m=context?.metrics?.[i];if(m)selectMetric(m)}}>{context?.metrics?.map((m,i)=><Cell key={m.key} fill={['#8470ed','#242428','#a9cbb6','#e8bf79','#b3b9c9','#d5c4eb','#93b8cd'][i%7]} className="chart-segment"/>)}</Pie><Tooltip formatter={v=>[number(Number(v)),'Вакансий']}/></PieChart></ResponsiveContainer></div><div className="expanded-legend">{context?.metrics?.map((m,i)=><button key={m.key} onClick={()=>selectMetric(m)}><span className="legend-dot" style={{background:['#8470ed','#242428','#a9cbb6','#e8bf79','#b3b9c9','#d5c4eb','#93b8cd'][i%7]}}/><span>{m.label}</span><strong>{number(m.count)}</strong><small>{number(m.percent)}%</small><ArrowUpRight size={13}/></button>)}</div></div>}
    </div>:tab==='data'?<div className="source-table-wrap">
      {context?.points?<table className="data-table"><thead><tr><th>Вакансия</th><th>Отклики</th><th/></tr></thead><tbody>{context.points.map(p=><tr key={p.id}><td><button onClick={()=>chooseVacancy(p.id)}>{p.title}</button></td><td className="numeric">{number(p.count)}</td><td><ArrowUpRight size={15}/></td></tr>)}</tbody></table>:
       context?.salaries?<table className="data-table"><thead><tr><th>Вакансия</th><th>Зарплата</th><th/></tr></thead><tbody>{context.salaries.map(p=><tr key={p.id}><td><button onClick={()=>chooseVacancy(p.id)}>{p.title}</button></td><td>{p.raw}</td><td><button className="icon-button" aria-label={`Открыть ${p.title}`} onClick={()=>chooseVacancy(p.id)}><ArrowUpRight size={15}/></button></td></tr>)}</tbody></table>:
       context?.metrics?<table className="data-table"><thead><tr><th>Показатель</th><th>Вакансии</th><th title={`Доля от ${number(vacancies.filter(v=>v.loaded).length)} загруженных вакансий`}>Доля</th><th/></tr></thead><tbody>{context.metrics.map(m=><tr key={m.key}><td><button onClick={()=>selectMetric(m)}>{m.label}{m.kind&&<small>{m.kind}</small>}</button></td><td className="numeric">{number(m.count)}</td><td className="numeric">{number(m.percent)}%</td><td><button className="icon-button" aria-label={`Вакансии: ${m.label}`} onClick={()=>choose(m)}><ArrowUpRight size={15}/></button></td></tr>)}</tbody></table>:
       <div className="empty-state"><button className="button secondary" onClick={()=>setTab('vacancies')}>Открыть список<ArrowUpRight size={15}/></button></div>}
      {context?.metrics?.length===0&&<div className="empty-state">Нет данных</div>}
    </div>:<>
      {vacancy?<div className="vacancy-detail"><button className="text-button back-button" onClick={()=>setSelected(null)}><ArrowLeft size={15}/>К списку вакансий</button>
        <div className="vacancy-title-row"><div><span className="vacancy-company">{vacancy.company}</span><h2>{vacancy.title}</h2>{vacancy.salary&&<p className={`vacancy-salary ${context?.dimension==='salary'?'highlight-field':''}`}>{vacancy.salary}</p>}</div><span className="hh-mark large-hh">hh</span></div>
        {!vacancy.loaded&&<div className="notice warning">{vacancy.error||'Описание не загружено'}</div>}
        <div className="vacancy-meta">{[
          ['Город',vacancy.city||vacancy.address,'city',MapPin],['Опыт',vacancy.experience,'experience',BriefcaseBusiness],['Формат',vacancy.format,'workFormats',FileText],['Грейд',vacancy.grade,'grade',Users],['Отклики',vacancy.responseCount==null?'Нет данных':number(vacancy.responseCount),'responses',Users],
        ].map(([label,value,key,Icon])=>{const I=Icon as typeof MapPin;return <div className={context?.dimension===key?'highlight-field':''} key={key as string}><span><I size={14}/>{label as string}</span><strong>{value as string||'Не указан'}</strong></div>})}</div>

        {vacancy.keySkills?.length>0&&<section className="vacancy-section"><h3>Ключевые навыки</h3><div className="skills-tags">{vacancy.keySkills.map((s,i)=><span key={`${s}-${i}`} className={`skill-tag ${evidence.some(e=>e.field==='keySkills'&&e.quote.toLowerCase()===s.toLowerCase())?'highlight-field':''}`}>{s}</span>)}</div></section>}
        <section className="vacancy-section vacancy-description"><h3>Описание вакансии</h3>{vacancy.description?vacancy.description.split(/\n\s*\n/).map((p,i)=><p key={i}><Highlight text={p} terms={evidence.filter(e=>e.field==='description').map(e=>e.quote)}/></p>):<p className="text-muted">Описание недоступно.</p>}</section>
        <div className="vacancy-bottom"><div><CalendarDays size={14}/><span>Сохранено {date(vacancy.collectedAt)}{vacancy.publishedAt&&<> · опубликовано {date(vacancy.publishedAt)}</>}</span></div><a href={vacancy.url} target="_blank" rel="noopener noreferrer">Оригинал на hh.ru<ExternalLink size={14}/></a></div>
      </div>:<><div className="vacancy-toolbar"><label className="small-search"><Search size={16}/><input aria-label="Поиск по вакансиям" placeholder="Должность, компания, город" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Сортировка вакансий" value={sort} onChange={e=>setSort(e.target.value)}><option value="title">По названию</option><option value="responses">По числу откликов</option><option value="date">По дате</option></select></div><div className="vacancy-list">{items.map(v=><button className="vacancy-list-item" key={v.id} onClick={()=>setSelected(v.id)}><div className="company-initial">{v.company?.slice(0,1)||'·'}</div><div><h3>{v.title}</h3><p>{v.company} <span>·</span> {v.city||v.address||'Город не указан'}</p>{v.salary&&<strong>{v.salary}</strong>}</div><div className="vacancy-list-meta"><span>{v.experience||'Опыт не указан'}</span>{v.responseCount!==null&&<span><Users size={13}/>{number(v.responseCount)} откликов</span>}{!v.loaded&&<small>Описание не загружено</small>}</div><ChevronRight size={17}/></button>)}{!items.length&&<div className="empty-state"><Search size={25}/><p>Вакансии не найдены</p></div>}</div><div className="list-count">{number(items.length)} вакансий</div></>}
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
