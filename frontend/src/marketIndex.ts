import type {Vacancy} from './types.ts';

export type MarketIndex = {
  vacancyCount:number;
  responseCoverage:number;
  responseTotal:number|null;
  responsesPerVacancy:number|null;
};

export function marketIndex(vacancies:Vacancy[]):MarketIndex {
  const loaded=vacancies.filter(v=>v.loaded);
  const responses=loaded.flatMap(v=>Number.isInteger(v.responseCount)&&v.responseCount!>=0?[v.responseCount!]:[]);
  const responseTotal=responses.length?responses.reduce((sum,count)=>sum+count,0):null;
  return {
    vacancyCount:loaded.length,responseCoverage:responses.length,responseTotal,
    responsesPerVacancy:responseTotal===null?null:responseTotal/loaded.length,
  };
}
