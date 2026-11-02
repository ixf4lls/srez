import {useState} from 'react';
import {Search,SlidersHorizontal,ChevronDown,Check,LoaderCircle,BriefcaseBusiness,Layers3,RotateCcw,AlertCircle} from 'lucide-react';
import {Modal} from './Modal';
import {api} from '../types';
import type {Analysis,FilterGroup,Filters,Proposal} from '../types';

export function SearchForm({initial,onCreated}:{initial:Analysis|null;onCreated:(a:Analysis)=>void}){
  const [query,setQuery]=useState(initial?.query||'');
  const [mode,setMode]=useState<'roles'|'stack'>(initial?.mode||'roles');
  const [filters,setFilters]=useState<Filters>(initial?.filters||{});
  const [groups,setGroups]=useState<FilterGroup[]>([]);
  const [showFilters,setShowFilters]=useState(false);
  const [filtersLoading,setFiltersLoading]=useState(false);
  const [filterError,setFilterError]=useState('');
  const [error,setError]=useState('');
  const [preparing,setPreparing]=useState(false);
  const [starting,setStarting]=useState(false);
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [expression,setExpression]=useState('');
  const [proposalError,setProposalError]=useState('');
  async function loadFilters(){
    setFiltersLoading(true);setFilterError('');
    try{const x=await api<{groups:FilterGroup[]}>('/filters');setGroups(x.groups)}catch(e){setFilterError((e as Error).message)}finally{setFiltersLoading(false)}
  }
  function toggleFilters(){setShowFilters(!showFilters);if(!showFilters&&!groups.length&&!filtersLoading)void loadFilters()}
  async function prepare(e:React.FormEvent){e.preventDefault();setError('');setPreparing(true);
    try{const p=await api<Proposal>('/prepare',{query,mode});setProposal(p);setExpression(p.expression);setProposalError('')}catch(e){setError((e as Error).message)}finally{setPreparing(false)}
  }
  async function start(){setStarting(true);setProposalError('');try{
    const filterLabels=Object.fromEntries(Object.entries(filters).filter(([,v])=>v).map(([k,v])=>[k,groups.find(g=>g.key===k)?.options.find(o=>o.value===v)?.label||initial?.filterLabels?.[k]||v]));
    const a=await api<Analysis>('/analyses',{query,mode,expression,filters,filterLabels,confirmed:true});setProposal(null);onCreated(a);
  }catch(e){setProposalError((e as Error).message)}finally{setStarting(false)}}
  const selected=Object.entries(filters).filter(([,v])=>v);
  return <>
    <form className="search-card" onSubmit={prepare}>
      <label className="sr-only" htmlFor="market-query">Поисковый запрос</label>
      <div className="query-row"><Search size={23} className="query-icon"/><input id="market-query" autoComplete="off" maxLength={1500} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Стек или должность" required/><button className="button primary analyze-button" disabled={preparing||!query.trim()}>{preparing?<LoaderCircle size={18} className="spin"/>:null}{preparing?'Уточняем запрос':'Анализ'}</button></div>
      {error&&<div role="alert" className="inline-error">{error}</div>}
      <div className="search-options"><div className="mode-switch" role="group" aria-label="Режим релевантности"><button type="button" aria-pressed={mode==='roles'} className={mode==='roles'?'selected':''} onClick={()=>setMode('roles')}><BriefcaseBusiness size={15}/>В названии</button><button type="button" aria-pressed={mode==='stack'} className={mode==='stack'?'selected':''} onClick={()=>setMode('stack')}><Layers3 size={15}/>Во всём тексте</button></div><button className={`filter-button ${showFilters?'selected':''}`} type="button" onClick={toggleFilters} aria-expanded={showFilters}><SlidersHorizontal size={16}/>Фильтры{selected.length>0&&<span className="filter-count">{selected.length}</span>}<ChevronDown size={14} className={showFilters?'rotate':''}/></button></div>
      {showFilters&&<div className="filter-panel">{filtersLoading?<div className="loading-row"><LoaderCircle size={17} className="spin"/>Загрузка…</div>:filterError?<div className="notice error"><AlertCircle size={18}/><span>{filterError}</span><button type="button" onClick={()=>void loadFilters()}>Повторить</button></div>:<><div className="filter-grid">{groups.map(g=><label className="filter-field" key={g.key}><span>{g.label}</span><select value={filters[g.key]||''} onChange={e=>setFilters({...filters,[g.key]:e.target.value})}><option value="">Без ограничений</option>{g.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}</div><div className="filter-bottom"><button className="text-button" type="button" onClick={()=>setFilters({})}><RotateCcw size={13}/>Сбросить</button></div></>}</div>}
      {selected.length>0&&!showFilters&&<div className="selected-filters">{selected.map(([k,v])=><span className="tag" key={k}>{groups.find(g=>g.key===k)?.options.find(o=>o.value===v)?.label||initial?.filterLabels?.[k]||v}<button type="button" aria-label="Убрать фильтр" onClick={()=>setFilters({...filters,[k]:''})}>×</button></span>)}</div>}
    </form>
    <Modal open={!!proposal} onClose={()=>{if(!starting)setProposal(null)}} title="Подтвердите запрос">
      <div className="proposal-original"><span>Исходный запрос</span><strong>{query}</strong></div>
      <label className="expression-label" htmlFor="expression">Запрос hh.ru</label><textarea id="expression" className="expression-input" value={expression} onChange={e=>setExpression(e.target.value)} rows={5} maxLength={3000}/>
      {proposalError&&<div className="notice error" role="alert"><AlertCircle size={17}/>{proposalError}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={starting} onClick={()=>setProposal(null)}>Отмена</button><button className="button primary" disabled={starting||!expression.trim()} onClick={()=>void start()}>{starting?<LoaderCircle size={16} className="spin"/>:<Check size={17}/>}Подтвердить и искать</button></div>
    </Modal>
  </>
}
