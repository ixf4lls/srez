import type {Metric,Report,Vacancy} from './types.ts';

export const dimensions = [
  {key:'city', title:'География'},
  {key:'format', title:'Формат работы'},
  {key:'employmentForm', title:'Формат оформления'},
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
export type SalaryPoint = Salary & {
  id:string;
  title:string;
  range:[number,number];
  normalizedRange:[number,number];
  normalizedFrom:number;
  normalizedTo:number;
  normalizedSpan:number;
  original:string;
};
export type SalaryGroup = {key:string;label:string;points:SalaryPoint[]};

export type SalaryRates = Record<string,number>;

// Used until the API returns a fresh rate table. Values are only a rendering fallback.
export const fallbackSalaryRates:SalaryRates={RUB:1,USD:92,EUR:99,GBP:116,CNY:13,JPY:.62,CHF:105,CAD:67,AUD:60,HKD:12,SGD:69,NZD:55,INR:1.1,TRY:2.8,PLN:23,CZK:4.1,SEK:8.7,NOK:8.5,DKK:13.3,ILS:25,BRL:18,ZAR:5,THB:2.6,KRW:.065,VND:.0037,AED:25,AMD:.23,GEL:34,MDL:5.1,UAH:2.3,KZT:0.2,BYN:29,UZS:0.0074,KGS:1.05,AZN:54};

const monthlyFactor=(period:string)=>period==='год'?1/12:period==='неделя'?52/12:period==='день'?22:period==='час'?176:1;

export function netFromGross(monthly:number):number {
  if(monthly<=0)return 0;
  const annual=monthly*12;
  const bands:[[number,number],...[number,number][]]=[[2_400_000,.13],[5_000_000,.15],[20_000_000,.18],[50_000_000,.20],[Infinity,.22]];
  let tax=0,previous=0;
  for(const [limit,rate] of bands){
    const taxable=Math.max(0,Math.min(annual,limit)-previous);
    tax+=taxable*rate; previous=limit;
    if(annual<=limit)break;
  }
  return Math.max(0,(annual-tax)/12);
}

export const grossToNet=netFromGross;

export function normalizeSalary(salary:Salary,rates:SalaryRates=fallbackSalaryRates):[number,number] {
  const rate=rates[salary.currency]??1;
  const factor=monthlyFactor(salary.period);
  const convert=(value:number|null)=>{
    if(value==null)return null;
    const monthly=value*rate*factor;
    return salary.tax==='до вычета налогов'?netFromGross(monthly):monthly;
  };
  const from=convert(salary.from)??0;
  const to=convert(salary.to)??from;
  return [Math.round(Math.min(from,to)),Math.round(Math.max(from,to))];
}

export function parseSalary(raw:string):Salary|null {
  if(!raw?.trim())return null;
  const text=raw.replace(/[\u00a0\u202f]/g,' ').trim();
  const currencyRules:[RegExp,string][]=[
    [/₽|руб|\bRUB\b|\bRUR\b/i,'RUB'],[/\$|\bUSD\b/i,'USD'],[/€|\bEUR\b/i,'EUR'],[/£|\bGBP\b/i,'GBP'],
    [/¥|￥|\bCNY\b|юан/i,'CNY'],[/円|\bJPY\b|иен/i,'JPY'],[/₣|\bCHF\b|франк/i,'CHF'],[/\bCAD\b|канадск/i,'CAD'],[/\bAUD\b|австрал/i,'AUD'],[/\bHKD\b|гонконгск/i,'HKD'],[/\bSGD\b|сингапурск/i,'SGD'],[/\bNZD\b|новозеландск/i,'NZD'],
    [/₹|\bINR\b|рупи/i,'INR'],[/₺|\bTRY\b|лир/i,'TRY'],[/zł|\bPLN\b|злот/i,'PLN'],[/\bCZK\b|чешск/i,'CZK'],[/\bSEK\b|шведск/i,'SEK'],[/\bNOK\b|норвежск/i,'NOK'],[/\bDKK\b|датск/i,'DKK'],[/₪|\bILS\b|шекел/i,'ILS'],[/R\$|\bBRL\b|бразильск/i,'BRL'],[/\bZAR\b|южноафриканск/i,'ZAR'],[/฿|\bTHB\b|бат/i,'THB'],[/₩|\bKRW\b|вон/i,'KRW'],[/₫|\bVND\b|донг/i,'VND'],[/د.?إ|\bAED\b|дирхам/i,'AED'],[/֏|\bAMD\b|драм/i,'AMD'],[/₾|\bGEL\b|лари/i,'GEL'],[/\bMDL\b|ле[йи]/i,'MDL'],[/₴|\bUAH\b|гривн/i,'UAH'],
    [/₸|\bKZT\b|тенге/i,'KZT'],[/\bBYN\b|\bBr\b/i,'BYN'],[/\bUZS\b|сум/i,'UZS'],[/\bKGS\b|сом/i,'KGS'],[/₼|\bAZN\b/i,'AZN'],
  ];
  let currencyRule=currencyRules.find(([re])=>re.test(text));
  if(!currencyRule){
    const code=text.match(/\b[A-Z]{3}\b/i)?.[0];
    if(code)currencyRule=[new RegExp(`\\b${code}\\b`,'i'),code.toUpperCase()];
  }
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

export function salaryGroups(vacancies:Vacancy[],rates:SalaryRates=fallbackSalaryRates):SalaryGroup[] {
  const group:SalaryGroup={key:'normalized-rub-monthly',label:'₽ · в месяц · на руки (нормализовано)',points:[]};
  for(const v of vacancies){
    if(!v.loaded)continue;
    const salary=parseSalary(v.salary);if(!salary)continue;
    const from=salary.from,to=salary.to;
    const range:[number,number]=from!=null&&to!=null&&from!==to?[from,to]:[0,to??from??0];
    const normalized=normalizeSalary(salary,rates);
    const normalizedFrom=from!=null&&to==null?normalized[0]:from!=null&&to!=null&&from!==to?normalized[0]:0;
    const normalizedTo=normalized[1];
    const normalizedSpan=Math.max(normalizedTo-normalizedFrom,from!=null&&to==null?Math.round(Math.max(normalizedFrom,1)*.01):1);
    group.points.push({...salary,id:v.id,title:v.title,range,normalizedRange:[normalizedFrom,normalizedTo],normalizedFrom,normalizedTo,normalizedSpan,original:salary.raw});
  }
  return group.points.length?[group]:[];
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
