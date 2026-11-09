import test from 'node:test';
import assert from 'node:assert/strict';
import {filterVacancies} from './analytics.ts';
import {marketIndex} from './marketIndex.ts';
import type {Vacancy} from './types.ts';

const vacancy=(id:string,values:Partial<Vacancy>={}):Vacancy=>({id,url:`https://hh.ru/vacancy/${id}`,title:`Job ${id}`,company:'Example',salary:'',city:'Москва',address:'Москва',experience:'1–3 года',workFormats:[],format:'Офис',grade:'Middle',employment:'',workSchedule:'',workingHours:'',description:'',keySkills:[],responseCount:null,publishedAt:'',collectedAt:'2026-11-01T09:00:00Z',loaded:true,requirements:[],...values});

test('market index divides the sum of selected responses by the selected vacancy count once',()=>{
 const index=marketIndex([vacancy('1',{responseCount:10}),vacancy('2',{responseCount:30})]);
 assert.equal(index.vacancyCount,2);assert.equal(index.responseCoverage,2);
 assert.equal(index.responseTotal,40);assert.equal(index.responsesPerVacancy,20);
});

test('changing filters recomputes the response sum even when the vacancy count stays the same',()=>{
 const vs=[vacancy('1',{responseCount:10}),vacancy('2',{responseCount:30}),vacancy('3',{city:'Казань',responseCount:100}),vacancy('4',{city:'Казань',responseCount:200})];
 const moscow=marketIndex(filterVacancies(vs,{city:['Москва']}));
 const kazan=marketIndex(filterVacancies(vs,{city:['Казань']}));
 assert.equal(moscow.vacancyCount,2);assert.equal(kazan.vacancyCount,2);
 assert.equal(moscow.responseTotal,40);assert.equal(moscow.responsesPerVacancy,20);
 assert.equal(kazan.responseTotal,300);assert.equal(kazan.responsesPerVacancy,150);
 const combined=marketIndex(filterVacancies(vs,{city:['Москва','Казань']}));
 assert.equal(combined.responseTotal,340);assert.equal(combined.responsesPerVacancy,85);
});

test('the whole loaded selection is counted regardless of publication date',()=>{
 const dates=['2025-01-01','2026-11-09','', 'not-a-date', '2030-01-01'];
 const vs=dates.map((publishedAt,index)=>vacancy(String(index),{publishedAt,responseCount:10}));
 vs.push(vacancy('unloaded',{responseCount:999,loaded:false}));
 const index=marketIndex(vs);
 assert.equal(index.vacancyCount,5);assert.equal(index.responseTotal,50);assert.equal(index.responsesPerVacancy,10);
});

test('unknown and invalid responses do not enter the sum, while their loaded vacancies stay in the denominator',()=>{
 const vs=[10,0,null,-1,NaN,Infinity,1.5].map((responseCount,index)=>vacancy(String(index),{responseCount}));
 const index=marketIndex(vs);
 assert.equal(index.vacancyCount,7);assert.equal(index.responseCoverage,2);
 assert.equal(index.responseTotal,10);assert.equal(index.responsesPerVacancy,10/7);
 const zero=marketIndex([vacancy('zero',{responseCount:0})]);
 assert.equal(zero.responseTotal,0);assert.equal(zero.responsesPerVacancy,0);
});

test('empty selections and selections without known responses have no numeric index',()=>{
 for(const vs of [[],[vacancy('unknown')],[vacancy('unloaded',{responseCount:10,loaded:false})]]){
  const index=marketIndex(vs);assert.equal(index.responseTotal,null);assert.equal(index.responsesPerVacancy,null);
 }
});

test('combined category and company filters use only matching vacancies for both numerator and denominator',()=>{
 const vs=[vacancy('1',{company:'A',responseCount:10}),vacancy('2',{company:'B',responseCount:30}),vacancy('3',{company:'A',city:'Казань',responseCount:100})];
 const index=marketIndex(filterVacancies(vs,{city:['Москва'],company:['A']}));
 assert.equal(index.vacancyCount,1);assert.equal(index.responseTotal,10);assert.equal(index.responsesPerVacancy,10);
 assert.equal(marketIndex(filterVacancies(vs,{city:['Нет такого города']})).responsesPerVacancy,null);
});
