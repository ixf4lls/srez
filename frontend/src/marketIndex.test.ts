import test from 'node:test';
import assert from 'node:assert/strict';
import {filterVacancies} from './analytics.ts';
import {analysisSnapshotAt,marketIndex} from './marketIndex.ts';
import type {Vacancy} from './types.ts';

const vacancy=(id:string,values:Partial<Vacancy>={}):Vacancy=>({id,url:`https://hh.ru/vacancy/${id}`,title:`Job ${id}`,company:'Example',salary:'',city:'Москва',address:'Москва',experience:'1–3 года',workFormats:[],format:'Офис',grade:'Middle',employment:'',workSchedule:'',workingHours:'',description:'',keySkills:[],responseCount:null,publishedAt:'',collectedAt:'2026-11-01T09:00:00Z',loaded:true,requirements:[],...values});

test('market index keeps the mean/count and sum/count variants distinct',()=>{
 const index=marketIndex([vacancy('1',{publishedAt:'2026-11-01T09:00:00Z',responseCount:10}),vacancy('2',{publishedAt:'2026-11-08T09:00:00Z',responseCount:30})],'2026-11-09T09:00:00Z');
 assert.equal(index.vacancyCount,2);assert.equal(index.responseCoverage,2);
 assert.equal(index.responseTotal,40);assert.equal(index.responseMean,20);
 assert.equal(index.meanPerVacancy,10);assert.equal(index.totalPerVacancy,20);
});
test('market index uses the fixed publication window including its exact boundaries',()=>{
 const dates=['2026-10-10T08:59:59.999Z','2026-10-10T09:00:00Z','2026-11-09T12:00:00+0300','2026-11-09T09:00:00.001Z','2026-02-30T09:00:00Z','not-a-date','', '2026-11-01T25:00:00Z'];
 const vs=dates.map((publishedAt,i)=>vacancy(String(i),{publishedAt,responseCount:10}));
 vs.push(vacancy('unloaded',{publishedAt:'2026-11-01T09:00:00Z',responseCount:10,loaded:false}));
 const index=marketIndex(vs,'2026-11-09T09:00:00Z');
 assert.equal(index.periodStart,'2026-10-10T09:00:00.000Z');assert.equal(index.periodEnd,'2026-11-09T09:00:00.000Z');
 assert.equal(index.vacancyCount,2);assert.equal(index.responseTotal,20);
});
test('market index excludes unknown and invalid responses from the mean but retains all period vacancies',()=>{
 const vs=[10,0,null,-1,NaN,Infinity].map((responseCount,i)=>vacancy(String(i),{publishedAt:'2026-11-01',responseCount}));
 const index=marketIndex(vs,'2026-11-09T09:00:00Z');
 assert.equal(index.vacancyCount,6);assert.equal(index.responseCoverage,2);
 assert.equal(index.responseMean,5);assert.equal(index.meanPerVacancy,5/6);assert.equal(index.totalPerVacancy,10/6);
 const zero=marketIndex([vacancy('zero',{publishedAt:'2026-11-01',responseCount:0})],'2026-11-09T09:00:00Z');
 assert.equal(zero.meanPerVacancy,0);assert.equal(zero.totalPerVacancy,0);
});
test('market index has no value for an empty period, unknown responses or invalid snapshot',()=>{
 for(const vs of [[],[vacancy('unknown',{publishedAt:'2026-11-01'})],[vacancy('old',{publishedAt:'2025-11-01',responseCount:10})]]){
  const index=marketIndex(vs,'2026-11-09T09:00:00Z');assert.equal(index.meanPerVacancy,null);assert.equal(index.totalPerVacancy,null);
 }
 assert.equal(marketIndex([vacancy('1')],'invalid').periodEnd,null);
});
test('market index filters the cohort while keeping the saved analysis snapshot fixed',()=>{
 const snapshot=analysisSnapshotAt({completedAt:'2026-11-09T09:00:00Z',updatedAt:'2026-12-09T09:00:00Z'});
 assert.equal(snapshot,'2026-11-09T09:00:00Z');
 assert.equal(analysisSnapshotAt({updatedAt:'2026-11-09T09:00:00Z'}),snapshot);
 assert.equal(analysisSnapshotAt({completedAt:'invalid',updatedAt:snapshot}),snapshot);
 const vs=[vacancy('1',{publishedAt:'2026-11-01',responseCount:10}),vacancy('2',{publishedAt:'2026-11-01',city:'Казань',responseCount:30})];
 const index=marketIndex(filterVacancies(vs,{city:['Казань']}),snapshot);
 assert.equal(index.vacancyCount,1);assert.equal(index.meanPerVacancy,30);assert.equal(index.totalPerVacancy,30);assert.equal(index.periodEnd,'2026-11-09T09:00:00.000Z');
});
