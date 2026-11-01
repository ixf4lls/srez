import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,ArrowUpRight,LoaderCircle,Plus,Search,Trash2,Undo2,X} from 'lucide-react';
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
    <div className="page-heading"><h1>История</h1><button className="button primary" onClick={onNew}><Plus size={17}/>Новый анализ</button></div>
    {(error||actionError)&&<div className="notice error" role="alert"><AlertCircle size={17}/>{actionError||error}{error&&<button onClick={()=>void refresh()}>Повторить</button>}</div>}
    {analyses.length>0&&<div className="history-controls">
      <label className="select-all"><input ref={allCheckbox} type="checkbox" aria-label="Выбрать все найденные анализы" checked={allSelected} disabled={busy||!filtered.length} onChange={()=>setSelected(allSelected?new Set():new Set(filtered.map(a=>a.id)))}/><span>{selected.size?`Выбрано: ${number(selected.size)}`:'Выбрать все'}</span></label>
      {selected.size>0&&<button className="button danger subtle" disabled={busy} onClick={()=>void remove([...selected])}><Trash2 size={15}/>Удалить ({number(selected.size)})</button>}
      <label className="small-search"><Search size={16}/><input aria-label="Найти анализ" placeholder="Поиск" value={query} onChange={e=>{setQuery(e.target.value);setSelected(new Set())}}/></label>
    </div>}
    <div className="history-list">{loading?<div className="empty-state"><LoaderCircle className="spin"/>Загрузка…</div>:filtered.length?filtered.map(a=><article className={`history-item history-selectable ${selected.has(a.id)?'is-selected':''}`} key={a.id}>
      <input type="checkbox" className="row-checkbox" aria-label={`Выбрать ${a.title}, ${date(a.createdAt)}`} checked={selected.has(a.id)} disabled={busy} onChange={()=>toggle(a.id)}/>
      <button className="history-open" onClick={()=>navigate(`/analyses/${a.id}`)}><div className="history-main"><h3>{a.title}</h3><span>{date(a.createdAt)} · {a.mode==='roles'?'В названии':'Во всём тексте'}</span></div><div className="history-info"><strong>{number(a.processed)}</strong><span>вакансий</span></div><span className={`status-badge status-${a.status}`}>{isActive(a)&&<LoaderCircle size={12} className="spin"/>}{statusLabel[a.status]||a.status}</span><ArrowUpRight size={17}/></button>
      <button className="icon-button delete-row" aria-label={`Удалить ${a.title}, ${date(a.createdAt)}`} title="Удалить" disabled={busy} onClick={()=>void remove([a.id])}><Trash2 size={16}/></button>
    </article>):<div className="empty-state large"><h2>{query?'Ничего не найдено':'Нет анализов'}</h2>{!query&&<button className="button primary" onClick={onNew}>Новый анализ<ArrowRight size={16}/></button>}</div>}</div>
    {undo.length>0&&<div className="undo-toast" role="status"><span>Удалено: {number(undo.length)}</span><button className="text-button" disabled={busy} onClick={()=>void restore()}><Undo2 size={14}/>Отменить</button><button className="icon-button" aria-label="Скрыть уведомление" onClick={()=>setUndo([])}><X size={15}/></button></div>}
  </>
}
