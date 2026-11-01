import type {Metric,Report,Vacancy} from './types.ts';

export const dimensions = [
  {key:'city', title:'География'},
  {key:'format', title:'Формат работы'},
  {key:'experience', title:'Опыт работы'},
  {key:'grade', title:'Грейд'},
] as const;
export type Dimension = typeof dimensions[number]['key'];
export type ViewFilters = Partial<Record<Dimension,string[]>>;
export const formats = ['Офис','Удалённо','Гибрид'] as const;

export function workFormats(v:Vacancy):string[] {
  const text=[...(v.workFormats||[]),v.format||''].join(' ').toLowerCase();
  return formats.filter(label=>({
    'Офис':/на месте|офис|on.?site/.test(text),
    'Удалённо':/удал|remote/.test(text),
    'Гибрид':/гибрид|hybrid/.test(text),
  })[label]);
}

export function matches(v:Vacancy, filters:ViewFilters):boolean {
  return dimensions.every(({key})=>{
    const selected=filters[key];
    if(!selected?.length)return true;
    if(key==='format')return selected.some(value=>workFormats(v).includes(value));
    return selected.includes(v[key]||'Не указан');
  });
}

export function filterVacancies(vacancies:Vacancy[], filters:ViewFilters):Vacancy[] {
  return vacancies.filter(v=>v.loaded&&matches(v,filters));
}

const percent=(count:number,total:number)=>total?Math.round(count*1000/total)/10:0;
function group(vacancies:Vacancy[],key:Dimension):Metric[] {
  const groups=new Map<string,Metric>();
  if(key==='format')for(const label of formats)groups.set(label,{key:label,label,count:0,percent:0,vacancyIds:[],evidence:[]});
  for(const v of vacancies){
    const values=key==='format'?workFormats(v):[v[key]||'Не указан'];
    for(const label of values){
      const m=groups.get(label)??{key:label,label,count:0,percent:0,vacancyIds:[],evidence:[]};
      m.count++;m.vacancyIds.push(v.id);
      m.evidence.push({vacancyId:v.id,field:key==='format'?'workFormats':key,quote:label});
      groups.set(label,m);
    }
  }
  const result=[...groups.values()].map(m=>({...m,percent:percent(m.count,vacancies.length)}));
  return key==='format'?result:result.sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ru'));
}

export function deriveReport(base:Report, vacancies:Vacancy[]):Report {
  const loaded=vacancies.filter(v=>v.loaded);
  const ids=new Set(loaded.map(v=>v.id));
  const scope=(metrics:Metric[])=>metrics.map(m=>{
    const vacancyIds=[...new Set(m.vacancyIds)].filter(id=>ids.has(id));
    return {...m,vacancyIds,count:vacancyIds.length,percent:percent(vacancyIds.length,loaded.length),evidence:m.evidence.filter(e=>ids.has(e.vacancyId))};
  }).filter(m=>m.count>0).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ru'));
  // A stable vacancy order; the connecting line does not rank results by response count.
  const responses=loaded.filter(v=>v.responseCount!=null).map(v=>({id:v.id,title:v.title,count:v.responseCount!}));
  return {...base,total:loaded.length,
    dimensions:Object.fromEntries(dimensions.map(({key})=>[key,group(loaded,key)])),
    skills:scope(base.skills),requirements:scope(base.requirements),responses,
    responseCoverage:responses.length,
    responseMean:responses.length?responses.reduce((s,v)=>s+v.count,0)/responses.length:null,
    skillsCoverage:loaded.filter(v=>v.keySkills?.length).length,
    requirementsCoverage:loaded.filter(v=>v.requirements?.length).length,
  };
}

export type Salary = {from:number|null;to:number|null;currency:string;period:string;tax:string;raw:string};
export type SalaryPoint = Salary & {id:string;title:string;range:[number,number]};
export type SalaryGroup = {key:string;label:string;points:SalaryPoint[]};

export function parseSalary(raw:string):Salary|null {
  if(!raw?.trim())return null;
  const text=raw.replace(/[\u00a0\u202f]/g,' ').trim();
  const currencyRules:[RegExp,string][]=[[/₽|руб|\bRUB\b|\bRUR\b/i,'RUB'],[/\$|\bUSD\b/i,'USD'],[/€|\bEUR\b/i,'EUR'],[/₸|\bKZT\b|тенге/i,'KZT'],[/\bBYN\b|\bBr\b/i,'BYN'],[/\bUZS\b|сум/i,'UZS'],[/\bKGS\b|сом/i,'KGS'],[/₼|\bAZN\b/i,'AZN']];
  const currencyRule=currencyRules.find(([re])=>re.test(text));
  if(!currencyRule)return null;
  const currencyIndex=text.search(currencyRule[0]);
  const salaryText=text.slice(0,currencyIndex);
  const parts=salaryText.match(/\d[\d ]*(?:[.,]\d+)?/g);
  if(!parts?.length)return null;
  const multiplier=/тыс|\bk\b/i.test(salaryText)?1000:1;
  const values=parts.map(s=>Number(s.replace(/ /g,'').replace(',','.'))*multiplier);
  if(values.some(n=>!Number.isFinite(n)||n<0))return null;
  let from:number|null=null,to:number|null=null;
  if(values.length>=2){[from,to]=values;if(from>to)return null}
  else if(/(?:^|\s)до\s/i.test(salaryText)){to=values[0]}
  else if(/(?:^|\s)от\s/i.test(salaryText)){from=values[0]}
  else {from=to=values[0]}
  const period=/месяц|\/мес|per month|monthly/i.test(text)?'месяц':/час|per hour|hourly/i.test(text)?'час':/недел|weekly/i.test(text)?'неделя':/год|year|annual/i.test(text)?'год':/за день|в день|per day|daily/i.test(text)?'день':'период не указан';
  const tax=/на руки|net\b/i.test(text)?'на руки':/до вычета|gross\b/i.test(text)?'до вычета налогов':'налоги не указаны';
  return {from,to,currency:currencyRule[1],period,tax,raw};
}

export function salaryGroups(vacancies:Vacancy[]):SalaryGroup[] {
  const groups=new Map<string,SalaryGroup>();
  for(const v of vacancies){
    if(!v.loaded)continue;
    const salary=parseSalary(v.salary);if(!salary)continue;
    const key=[salary.currency,salary.period,salary.tax].join('|');
    const symbol:Record<string,string>={RUB:'₽',USD:'$',EUR:'€',KZT:'₸'};
    const label=`${symbol[salary.currency]||salary.currency} · ${salary.period} · ${salary.tax}`;
    const group=groups.get(key)??{key,label,points:[]};
    const from=salary.from,to=salary.to;
    const range:[number,number]=from!=null&&to!=null&&from!==to?[from,to]:[0,to??from??0];
    group.points.push({...salary,id:v.id,title:v.title,range});groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>b.points.length-a.points.length||a.label.localeCompare(b.label,'ru'));
}

export function readViewFilters():ViewFilters {
  try {
    const value=JSON.parse(new URLSearchParams(location.search).get('view')||'{}');
    return Object.fromEntries(dimensions.flatMap(({key})=>{
      const values=Array.isArray(value?.[key])?value[key]:typeof value?.[key]==='string'?[value[key]]:[];
      const valid=[...new Set(values.filter((v:unknown)=>typeof v==='string'&&v.length<=200))].slice(0,100);
      return valid.length?[[key,valid]]:[];
    }));
  }catch{return {}}
}
