import type {Metric,Report,Vacancy} from './types.ts';

export const dimensions = [
  {key:'city', title:'Location'},
  {key:'format', title:'Work format'},
  {key:'employmentForm', title:'Engagement type'},
  {key:'experience', title:'Experience'},
  {key:'grade', title:'Seniority'},
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

export function employmentForms(v:Vacancy):string[] {
  const text=[v.employmentForm||'',v.employment||'',v.description||''].join(' ').toLowerCase();
  const result:string[]=[];
  const add=(label:string)=>{if(!result.includes(label))result.push(label)};
  if(/(?:^|[^\p{L}\p{N}_])тк\s*рф(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:трудов\p{L}*\s+договор|официальн\p{L}*\s+оформ)/u.test(text))add('ТК РФ');
  if(/(?:^|[^\p{L}\p{N}_])гпх(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:гражданск\p{L}*[- ]правов\p{L}*\s+договор|договор\p{L}*\s+подряда|оказани\p{L}*\s+услуг)/u.test(text))add('ГПХ');
  if(/самозанят\p{L}*/u.test(text))add('Самозанятость');
  if(/(?:^|[^\p{L}\p{N}_])ип(?:$|[^\p{L}\p{N}_])|индивидуальн\p{L}*\s+предпринимател\p{L}*/u.test(text))add('ИП');
  return result.length?result:['Не указан'];
}

export function matches(v:Vacancy, filters:ViewFilters):boolean {
  return dimensions.every(({key})=>{
    const selected=filters[key];
    if(!selected?.length)return true;
    if(key==='format')return selected.some(value=>workFormats(v).includes(value));
    if(key==='employmentForm')return selected.some(value=>employmentForms(v).includes(value));
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
    const values=key==='format'?workFormats(v):key==='employmentForm'?employmentForms(v):[v[key]||'Не указан'];
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
export type SalaryRates = Record<string, number>;
export type SalaryPoint = Salary & {id:string;title:string;range:[number,number];normalizedRange:[number,number];normalizedFrom:number|null;normalizedTo:number|null};
export type SalaryGroup = {key:string;label:string;points:SalaryPoint[]};

export function netFromGross(monthly:number):number {
  if(!Number.isFinite(monthly)||monthly<=0)return 0;
  const annual=monthly*12;
  const bands:[number,number][]=[[2_400_000,.13],[5_000_000,.15],[20_000_000,.18],[50_000_000,.20],[Infinity,.22]];
  let tax=0,previous=0;
  for(const [limit,rate] of bands){
    tax+=Math.max(0,Math.min(annual,limit)-previous)*rate;
    previous=limit;
    if(annual<=limit)break;
  }
  return (annual-tax)/12;
}

export function normalizeSalary(salary:Salary,rates:SalaryRates):[number|null,number|null]|null {
  const rate=salary.currency==='RUB'?1:rates[salary.currency];
  const factor:Record<string,number>={'месяц':1,'год':1/12,'неделя':52/12,'день':22,'час':176};
  if(!Number.isFinite(rate)||rate<=0||!factor[salary.period]||salary.tax==='налоги не указаны')return null;
  const convert=(value:number|null)=>{
    if(value==null)return null;
    const monthly=value*rate*factor[salary.period];
    return Math.round(salary.tax==='до вычета налогов'?netFromGross(monthly):monthly);
  };
  return [convert(salary.from),convert(salary.to)];
}

export function parseSalary(raw:string):Salary|null {
  if(!raw?.trim())return null;
  const text=raw.replace(/[\u00a0\u202f]/g,' ').trim();
  const currencyRules:[RegExp,string][]=[
    [/₽|руб|\bRUB\b|\bRUR\b/i,'RUB'],[/\bCAD\b|C\$/i,'CAD'],[/\bAUD\b|A\$/i,'AUD'],[/\bHKD\b|HK\$/i,'HKD'],[/\bSGD\b|S\$/i,'SGD'],[/\bNZD\b|NZ\$/i,'NZD'],[/R\$|\bBRL\b/i,'BRL'],
    [/\$|\bUSD\b/i,'USD'],[/€|\bEUR\b/i,'EUR'],[/£|\bGBP\b/i,'GBP'],[/\bJPY\b|円|иен/i,'JPY'],[/¥|￥|\bCNY\b|юан/i,'CNY'],[/₣|\bCHF\b|франк/i,'CHF'],
    [/₸|\bKZT\b|тенге/i,'KZT'],[/\bBYN\b|\bBr\b/i,'BYN'],[/\bUZS\b|сум|so['‘’ʻʼ`]?m/i,'UZS'],[/\bKGS\b|сом/i,'KGS'],[/₼|\bAZN\b/i,'AZN'],
    [/֏|\bAMD\b|драм/i,'AMD'],[/₾|\bGEL\b|лари/i,'GEL'],[/د.?إ|\bAED\b|дирхам/i,'AED'],[/₺|\bTRY\b|лир/i,'TRY'],[/₹|\bINR\b|рупи/i,'INR'],
  ];
  const code=text.match(/\b[A-Z]{3}\b/)?.[0];
  if(code&&!currencyRules.some(([re])=>re.test(text)))currencyRules.push([new RegExp(`\\b${code}\\b`),code]);
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

export function salaryGroups(vacancies:Vacancy[],rates:SalaryRates={RUB:1}):SalaryGroup[] {
  const group:SalaryGroup={key:'normalized-rub-net',label:'₽ в месяц, на руки',points:[]};
  for(const v of vacancies){
    if(!v.loaded)continue;
    const salary=parseSalary(v.salary);if(!salary)continue;
    const normalized=normalizeSalary(salary,rates);if(!normalized)continue;
    const from=salary.from,to=salary.to;
    const range:[number,number]=from!=null&&to!=null&&from!==to?[from,to]:[0,to??from??0];
    const [normalizedFrom,normalizedTo]=normalized;
    const normalizedRange:[number,number]=normalizedFrom!=null&&normalizedTo!=null&&normalizedFrom!==normalizedTo?[normalizedFrom,normalizedTo]:[0,normalizedTo??normalizedFrom??0];
    group.points.push({...salary,id:v.id,title:v.title,range,normalizedRange,normalizedFrom,normalizedTo});
  }
  return group.points.length?[group]:[];
}

export function normalizedSalaryLabel(point:SalaryPoint):string {
  const format=(value:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value);
  const from=point.normalizedFrom,to=point.normalizedTo;
  const amount=from!=null&&to!=null?(from===to?format(from):`${format(from)}–${format(to)}`):from!=null?`от ${format(from)}`:`до ${format(to??0)}`;
  return `${amount} ₽/мес. на руки`;
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
