import type {Analysis,Vacancy} from './types.ts';

const day=24*60*60*1000;

export type MarketIndex = {
  periodStart:string|null;
  periodEnd:string|null;
  vacancyCount:number;
  responseCoverage:number;
  responseTotal:number|null;
  responseMean:number|null;
  meanPerVacancy:number|null;
  totalPerVacancy:number|null;
};

function timestamp(value:string):number|null {
  const match=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):?(\d{2})))?$/.exec(value);
  if(!match)return null;
  const [,year,month,date,hour,minute,second,offsetHour,offsetMinute]=match;
  const daysInMonth=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
  if(Number(month)<1||Number(month)>12||Number(date)<1||Number(date)>daysInMonth||Number(hour)>23||Number(minute)>59||Number(second)>59||Number(offsetHour)>23||Number(offsetMinute)>59)return null;
  const result=Date.parse(value);
  return Number.isFinite(result)?result:null;
}

export function analysisSnapshotAt(analysis:Pick<Analysis,'completedAt'|'updatedAt'>):string {
  return analysis.completedAt&&timestamp(analysis.completedAt)!==null?analysis.completedAt:analysis.updatedAt;
}

export function marketIndex(vacancies:Vacancy[],snapshotAt:string):MarketIndex {
  const end=timestamp(snapshotAt);
  if(end===null)return {periodStart:null,periodEnd:null,vacancyCount:0,responseCoverage:0,responseTotal:null,responseMean:null,meanPerVacancy:null,totalPerVacancy:null};
  const start=end-30*day;
  const recent=vacancies.filter(v=>{
    const published=timestamp(v.publishedAt||'');
    return v.loaded&&published!==null&&published>=start&&published<=end;
  });
  const responses=recent.flatMap(v=>Number.isInteger(v.responseCount)&&v.responseCount!>=0?[v.responseCount!]:[]);
  const responseTotal=responses.length?responses.reduce((sum,count)=>sum+count,0):null;
  const responseMean=responseTotal===null?null:responseTotal/responses.length;
  return {
    periodStart:new Date(start).toISOString(),periodEnd:new Date(end).toISOString(),
    vacancyCount:recent.length,responseCoverage:responses.length,responseTotal,responseMean,
    meanPerVacancy:responseMean===null?null:responseMean/recent.length,
    totalPerVacancy:responseTotal===null?null:responseTotal/recent.length,
  };
}
