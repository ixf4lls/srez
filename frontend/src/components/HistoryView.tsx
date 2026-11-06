import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,LoaderCircle,Plus,Search,Trash2,Undo2,X} from '../kitIcons';
import {api,date,isActive,number,statusLabel} from '../types';
import type {Analysis} from '../types';

export function HistoryView({analyses,loading,error,navigate,refresh,onNew}:{analyses:Analysis[];loading:boolean;error:string;navigate:(s:string)=>void;refresh:()=>Promise<void>;onNew:()=>void}) {
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const [undo,setUndo]=useState<string[]>([]);
  const allCheckbox=useRef<HTMLInputElement>(null);
  const filtered=analyses.filter(a=>`${a.title} ${a.expression}`.toLowerCase().includes(query.toLowerCase()));
  const allSelected=filtered.length>0&&filtered.every(a=>selected.has(a.id));
  useEffect(()=>{if(allCheckbox.current)allCheckbox.current.indeterminate=!allSelected&&selected.size>0},[allSelected,selected]);
  useEffect(()=>{const ids=new Set(analyses.map(a=>a.id));setSelected(prev=>new Set([...prev].filter(id=>ids.has(id))))},[analyses]);
  function toggle(id:string){setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next})}
  async function remove(ids:string[]) {
    if(!ids.length)return;
    setBusy(true);setActionError('');
    try {
      const result=await api<{deleted:string[]}>('/analyses/delete',{ids});
      setUndo(result.deleted);setSelected(new Set());await refresh();
    }catch(e){setActionError((e as Error).message)}finally{setBusy(false)}
  }
  async function restore(){
    setBusy(true);setActionError('');
    try{await api('/analyses/restore',{ids:undo});setUndo([]);await refresh()}
    catch(e){setActionError((e as Error).message)}finally{setBusy(false)}
  }
  return <>
    <div className="page-heading"><h1>History</h1><button className="button primary" onClick={onNew}><Plus size={17}/>New analysis</button></div>
    {(error||actionError)&&<div className="notice error" role="alert"><AlertCircle size={17}/>{actionError||error}{error&&<button onClick={()=>void refresh()}>Retry</button>}</div>}
    {analyses.length>0&&<div className="history-controls">
      <label className="select-all"><input ref={allCheckbox} type="checkbox" aria-label="Select all matching analyses" checked={allSelected} disabled={busy||!filtered.length} onChange={()=>setSelected(allSelected?new Set():new Set(filtered.map(a=>a.id)))}/><span>{selected.size?`Selected: ${number(selected.size)}`:'Select all'}</span></label>
      {selected.size>0&&<button className="button danger subtle" disabled={busy} onClick={()=>void remove([...selected])}><Trash2 size={15}/>Delete ({number(selected.size)})</button>}
      <label className="small-search"><Search size={16}/><input aria-label="Search analyses" placeholder="Search" value={query} onChange={e=>{setQuery(e.target.value);setSelected(new Set())}}/></label>
    </div>}
    <div className="history-list">{loading?<div className="empty-state"><LoaderCircle className="spin"/>Loading history…</div>:filtered.length?filtered.map(a=><article className={`history-item history-selectable ${selected.has(a.id)?'is-selected':''}`} key={a.id}>
      <input type="checkbox" className="row-checkbox" aria-label={`Select ${a.title}, ${date(a.createdAt)}`} checked={selected.has(a.id)} disabled={busy} onChange={()=>toggle(a.id)}/>
      <a className="history-open" href={`/analyses/${a.id}`} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(`/analyses/${a.id}`)}}><div className="history-main"><h2>{a.title}</h2><span>{date(a.createdAt)} · {a.mode==='roles'?'Job titles':'Full vacancy text'}</span></div><div className="history-info"><strong>{number(a.processed)}</strong><span>{a.processed===1?'vacancy':'vacancies'}</span></div><span className={`status-badge status-${a.status}`}>{isActive(a)&&<LoaderCircle size={12} className="spin"/>}{statusLabel[a.status]||a.status}</span></a>
      <button className="icon-button delete-row" aria-label={`Delete ${a.title}, ${date(a.createdAt)}`} title="Delete" disabled={busy} onClick={()=>void remove([a.id])}><Trash2 size={16}/></button>
    </article>):<div className="empty-state large"><h2>{query?'No matching analyses':'No analyses yet'}</h2><p>{query?'Try another search term or clear the search.':'Run a search to save your first market snapshot here.'}</p>{query?<button className="button secondary" onClick={()=>setQuery('')}>Clear search</button>:<button className="button primary" onClick={onNew}>New analysis<ArrowRight size={16}/></button>}</div>}</div>
    {undo.length>0&&<div className="undo-toast" role="status"><span>Deleted: {number(undo.length)}</span><button className="text-button" disabled={busy} onClick={()=>void restore()}><Undo2 size={14}/>Undo</button><button className="icon-button" aria-label="Dismiss notification" onClick={()=>setUndo([])}><X size={15}/></button></div>}
  </>
}
