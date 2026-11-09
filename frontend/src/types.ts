import {displayAppMessage} from './copy';

export type Filters = Record<string,string>;
export type FilterGroup = { key:string;label:string;options:{value:string;label:string;count:number}[] };
export type Evidence = {vacancyId:string;field:string;quote:string};
export type Metric = {key:string;label:string;kind?:string;count:number;percent:number;vacancyIds:string[];evidence:Evidence[]};
export type Requirement = {key:string;label:string;kind:string;quote:string};
export type Vacancy = {id:string;url:string;title:string;company:string;salary:string;city:string;address:string;experience:string;workFormats:string[];format:string;employmentForm?:string;grade:string;employment:string;workSchedule:string;workingHours:string;description:string;keySkills:string[];responseCount:number|null;publishedAt:string;collectedAt:string;loaded:boolean;error?:string;requirements:Requirement[]};
export type ResponsePoint = {id:string;title:string;count:number};
export type Report = {total:number;dimensions:Record<string,Metric[]>;skills:Metric[];requirements:Metric[];responses:ResponsePoint[];responseMean:number|null;responseCoverage:number;skillsCoverage:number;requirementsCoverage:number;version:string};
export type Analysis = {id:string;title:string;query:string;excludeWords?:string;expression:string;mode:'roles'|'stack';filters:Filters;filterLabels?:Filters;status:string;stage:string;message:string;createdAt:string;updatedAt:string;completedAt?:string;found:number;collected:number;skipped?:number;processed:number;failed:number;nextPage:number;warnings:string[];error?:string;report?:Report};
export type Proposal = {expression:string;explanations:string[];technologies:string[]};
export const isActive = (a:Analysis) => ['queued','running'].includes(a.status);
export const number = (n:number) => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
export const date = (s:string) => new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(s));
export const statusLabel:Record<string,string> = {completed:'Готов',partial:'Частичные данные',running:'Выполняется',queued:'В очереди',attention:'Требует внимания',cancelled:'Остановлен',interrupted:'Прерван'};
export async function api<T>(path:string,body?:unknown):Promise<T> {
  const res=await fetch(`/api${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await res.text();
  let json:{error?:string;reason?:string};
  try{json=JSON.parse(text)}catch{throw new Error('The analysis service is unavailable.')}
  if(!res.ok)throw new Error([json.error,json.reason].filter(Boolean).map(part=>displayAppMessage(part!)).join(' ')||'The request failed.');
  return json as T;
}
