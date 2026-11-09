import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveReport,filterVacancies,readViewFilters} from './analytics.ts';
import type {Report,Vacancy} from './types.ts';

const vacancy=(id:string,values:Partial<Vacancy>={}):Vacancy=>({id,url:`https://hh.ru/vacancy/${id}`,title:`Job ${id}`,company:'Example',salary:'',city:'Москва',address:'Москва',experience:'1–3 года',workFormats:['удалённо'],format:'Удалённо',grade:'Middle',employment:'',workSchedule:'',workingHours:'',description:'',keySkills:[],responseCount:null,publishedAt:'',collectedAt:'2026-11-01T09:00:00Z',loaded:true,requirements:[],...values});
const base:Report={total:0,dimensions:{},skills:[{key:'go',label:'Go',count:2,percent:100,vacancyIds:['1','2'],evidence:[{vacancyId:'1',field:'keySkills',quote:'Golang'},{vacancyId:'2',field:'keySkills',quote:'Go'}]}],requirements:[],responses:[],responseMean:null,responseCoverage:0,skillsCoverage:0,requirementsCoverage:0,version:'test'};

test('company filter combines companies with OR and other categories with AND',()=>{
 const vs=[vacancy('1',{company:'Alpha',responseCount:0}),vacancy('2',{company:'Beta',city:'Казань',responseCount:10}),vacancy('3',{company:'Gamma'}),vacancy('4',{company:'Alpha',loaded:false})];
 assert.deepEqual(filterVacancies(vs,{company:['Alpha','Beta']}).map(v=>v.id),['1','2']);
 const scoped=filterVacancies(vs,{company:['Alpha','Beta'],city:['Москва']});
 assert.deepEqual(scoped.map(v=>v.id),['1']);
 const r=deriveReport(base,scoped);
 assert.equal(r.total,1);assert.equal(r.responseMean,0);assert.equal(r.skills[0].percent,100);
 assert.deepEqual(r.dimensions.company.map(m=>[m.label,m.count,m.percent,m.vacancyIds]),[['Alpha',1,100,['1']]]);
 assert.deepEqual(filterVacancies(vs,{}).map(v=>v.id),['1','2','3']);
 assert.deepEqual(filterVacancies(vs,{company:['Missing']}).map(v=>v.id),[]);
});
test('company categories normalize surrounding whitespace and retain unknown employers',()=>{
 const vs=[vacancy('1',{company:' Alpha '}),vacancy('2',{company:'Alpha'}),vacancy('3',{company:''}),vacancy('4',{company:'  '})];
 const companies=Object.fromEntries(deriveReport(base,vs).dimensions.company.map(m=>[m.label,m]));
 assert.equal(Object.keys(companies).length,2);
 assert.equal(companies.Alpha.count,2);assert.equal(companies.Alpha.percent,50);
 assert.equal(companies['Компания не указана'].count,2);assert.equal(companies['Компания не указана'].percent,50);
 assert.deepEqual(companies.Alpha.vacancyIds,['1','2']);
 assert.equal(companies.Alpha.evidence[0].field,'company');
 assert.deepEqual(filterVacancies(vs,{company:['Alpha']}).map(v=>v.id),['1','2']);
 assert.deepEqual(filterVacancies(vs,{company:['Компания не указана']}).map(v=>v.id),['3','4']);
});
test('company filters round-trip through the existing URL view parameter',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'location');
 try {
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search:`?view=${encodeURIComponent(JSON.stringify({company:['Alpha','Beta','Alpha'],city:['Москва'],unknown:['ignored']}))}`}});
  assert.deepEqual(readViewFilters(),{city:['Москва'],company:['Alpha','Beta']});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search:`?view=${encodeURIComponent(JSON.stringify({company:'Alpha'}))}`}});
  assert.deepEqual(readViewFilters(),{company:['Alpha']});
 } finally {
  if(original)Object.defineProperty(globalThis,'location',original);else Reflect.deleteProperty(globalThis,'location');
 }
});
