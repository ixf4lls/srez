import {useState} from 'react';
import {Search,SlidersHorizontal,ChevronDown,Check,LoaderCircle,BriefcaseBusiness,Layers3,RotateCcw,AlertCircle,X} from '../kitIcons';
import {Modal} from './Modal';
import {api} from '../types';
import type {Analysis,FilterGroup,Filters,Proposal} from '../types';
import {displayLabel} from '../copy';

export function SearchForm({initial,onCreated}:{initial:Analysis|null;onCreated:(a:Analysis)=>void}){
  const [query,setQuery]=useState(initial?.query||'');
  const [title,setTitle]=useState(initial?.title||initial?.query||'');
  const [titleTouched,setTitleTouched]=useState(Boolean(initial?.title&&initial.title!==initial.query));
  const [excludeWords,setExcludeWords]=useState(initial?.excludeWords||'');
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
  function updateQuery(value:string){setQuery(value);if(!titleTouched)setTitle(value)}
  async function prepare(e:React.FormEvent){e.preventDefault();setError('');setPreparing(true);
    try{const p=await api<Proposal>('/prepare',{query,mode,excludeWords});setProposal(p);setExpression(p.expression);setProposalError('')}catch(e){setError((e as Error).message)}finally{setPreparing(false)}
  }
  async function start(){setStarting(true);setProposalError('');try{
    const filterLabels=Object.fromEntries(Object.entries(filters).filter(([,v])=>v).map(([k,v])=>[k,groups.find(g=>g.key===k)?.options.find(o=>o.value===v)?.label||initial?.filterLabels?.[k]||v]));
    const a=await api<Analysis>('/analyses',{query,title:title.trim()||query.trim(),excludeWords,mode,expression,filters,filterLabels,confirmed:true});setProposal(null);onCreated(a);
  }catch(e){setProposalError((e as Error).message)}finally{setStarting(false)}}
  const selected=Object.entries(filters).filter(([,v])=>v);
  return <>
    <form className="search-card" onSubmit={prepare}>
      <label className="search-card-label" htmlFor="market-query">Search query</label>
      <div className="query-row"><Search size={23} className="query-icon"/><input id="market-query" autoComplete="off" maxLength={1500} value={query} onChange={e=>updateQuery(e.target.value)} placeholder="Role or tech stack" required/><button className="button primary analyze-button" disabled={preparing||!query.trim()}>{preparing?<LoaderCircle size={18} className="spin"/>:null}{preparing?'Preparing search':'Analyze'}</button></div>
      <div className="search-meta-fields">
        <label className="search-field" htmlFor="analysis-title"><span>Analysis name</span><input id="analysis-title" autoComplete="off" maxLength={180} value={title} onChange={e=>{setTitleTouched(true);setTitle(e.target.value)}} placeholder="Defaults to your query"/></label>
        <label className="search-field" htmlFor="exclude-words"><span>Exclude words</span><input id="exclude-words" autoComplete="off" maxLength={500} value={excludeWords} onChange={e=>setExcludeWords(e.target.value)} placeholder="For example: intern, sales"/><small>Separate words with commas. They will be added to the hh.ru query.</small></label>
      </div>
      {error&&<div role="alert" className="inline-error">{error}</div>}
      <div className="search-options"><div className="mode-switch" role="group" aria-label="Relevance mode"><button type="button" aria-pressed={mode==='roles'} className={mode==='roles'?'selected':''} onClick={()=>setMode('roles')}><BriefcaseBusiness size={15}/>Job titles</button><button type="button" aria-pressed={mode==='stack'} className={mode==='stack'?'selected':''} onClick={()=>setMode('stack')}><Layers3 size={15}/>Full vacancy text</button></div><button className={`filter-button ${showFilters?'selected':''}`} type="button" onClick={toggleFilters} aria-expanded={showFilters}><SlidersHorizontal size={16}/>Filters{selected.length>0&&<span className="filter-count">{selected.length}</span>}<ChevronDown size={14} className={showFilters?'rotate':''}/></button></div>
      {showFilters&&<div className="filter-panel">{filtersLoading?<div className="loading-row"><LoaderCircle size={17} className="spin"/>Loading filters…</div>:filterError?<div className="notice error"><AlertCircle size={18}/><span>{filterError}</span><button type="button" onClick={()=>void loadFilters()}>Retry</button></div>:<><div className="filter-grid">{groups.map(g=><label className="filter-field" key={g.key}><span>{displayLabel(g.label)}</span><select value={filters[g.key]||''} onChange={e=>setFilters({...filters,[g.key]:e.target.value})}><option value="">Any</option>{g.options.map(o=><option key={o.value} value={o.value}>{displayLabel(o.label)}</option>)}</select></label>)}</div><div className="filter-bottom"><button className="text-button" type="button" onClick={()=>setFilters({})}><RotateCcw size={13}/>Reset</button></div></>}</div>}
      {selected.length>0&&!showFilters&&<div className="selected-filters">{selected.map(([k,v])=><span className="tag" key={k}>{displayLabel(groups.find(g=>g.key===k)?.options.find(o=>o.value===v)?.label||initial?.filterLabels?.[k]||v)}<button type="button" aria-label="Remove filter" onClick={()=>setFilters({...filters,[k]:''})}><X size={12}/></button></span>)}</div>}
    </form>
    <Modal open={!!proposal} onClose={()=>{if(!starting)setProposal(null)}} title="Confirm search">
      <div className="proposal-original"><span>Original query</span><strong>{query}</strong></div>
      <label className="expression-label" htmlFor="expression">hh.ru search expression</label><textarea id="expression" className="expression-input" value={expression} onChange={e=>setExpression(e.target.value)} rows={5} maxLength={3000}/>
      {proposalError&&<div className="notice error" role="alert"><AlertCircle size={17}/>{proposalError}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={starting} onClick={()=>setProposal(null)}>Cancel</button><button className="button primary" disabled={starting||!expression.trim()} onClick={()=>void start()}>{starting?<LoaderCircle size={16} className="spin"/>:<Check size={17}/>}Confirm and search</button></div>
    </Modal>
  </>
}
