import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveReport,filterVacancies,parseSalary,salaryGroups,workFormats} from './analytics.ts';
import type {Report,Vacancy} from './types.ts';

const vacancy=(id:string,values:Partial<Vacancy>={}):Vacancy=>({id,url:`https://hh.ru/vacancy/${id}`,title:`Job ${id}`,company:'Example',salary:'',city:'Москва',address:'Москва',experience:'1–3 года',workFormats:['на месте работодателя, удалённо или гибрид'],format:'Офис / Гибрид / Удалённо',grade:'Middle',employment:'',workSchedule:'',workingHours:'',description:'',keySkills:[],responseCount:null,publishedAt:'',collectedAt:'2026-11-01T09:00:00Z',loaded:true,requirements:[],...values});
const base:Report={total:0,dimensions:{},skills:[{key:'go',label:'Go',count:2,percent:100,vacancyIds:['1','2'],evidence:[{vacancyId:'1',field:'keySkills',quote:'Golang'},{vacancyId:'2',field:'keySkills',quote:'Go'}]}],requirements:[],responses:[],responseMean:null,responseCoverage:0,skillsCoverage:0,requirementsCoverage:0,version:'test'};

test('three overlapping work formats count each vacancy once per format',()=>{
 const vs=[vacancy('1'),vacancy('2',{workFormats:['удалённо'],format:'Удалённо'}),vacancy('3',{workFormats:['разъездной'],format:'Разъездной'})];
 const r=deriveReport(base,vs);const formats=Object.fromEntries(r.dimensions.format.map(m=>[m.label,m]));
 assert.deepEqual(workFormats(vs[0]),['Офис','Удалённо','Гибрид']);assert.equal(r.total,3);
 assert.equal(formats['Удалённо'].count,2);assert.equal(formats['Удалённо'].percent,66.7);assert.equal(formats['Офис'].count,1);assert.equal(r.dimensions.format.length,3);
});
test('OR within a dimension, AND across dimensions; unloaded vacancies excluded',()=>{
 const vs=[vacancy('1'),vacancy('2',{city:'Казань',format:'Удалённо',workFormats:['удалённо']}),vacancy('3',{city:'Казань',format:'Офис',workFormats:['на месте работодателя']}),vacancy('4',{loaded:false})];
 assert.deepEqual(filterVacancies(vs,{city:['Москва','Казань'],format:['Удалённо']}).map(v=>v.id),['1','2']);
 assert.deepEqual(filterVacancies(vs,{city:['Москва'],grade:['Senior']}).map(v=>v.id),[]);
});
test('whole-report filtering recomputes percentages, source IDs and the response mean',()=>{
 const vs=[vacancy('1',{responseCount:0,keySkills:['Golang']}),vacancy('2',{city:'Казань',responseCount:10}),vacancy('3')];
 const r=deriveReport(base,filterVacancies(vs,{city:['Москва']}));
 assert.equal(r.total,2);assert.equal(r.responseMean,0);assert.equal(r.responseCoverage,1);
 assert.equal(r.skills[0].percent,50);assert.deepEqual(r.skills[0].vacancyIds,['1']);assert.equal(r.skills[0].evidence.length,1);
 assert.equal(r.dimensions.city[0].percent,100);assert.equal(r.responses[0].id,'1');
 assert.equal(deriveReport(base,[]).responseMean,null);
});
test('salary ranges and one-sided bounds retain original units and tax treatment',()=>{
 assert.deepEqual(parseSalary('от 230 000 до 366 000 ₽ за месяц, на руки'),{from:230000,to:366000,currency:'RUB',period:'месяц',tax:'на руки',raw:'от 230 000 до 366 000 ₽ за месяц, на руки'});
 assert.equal(parseSalary('до 5 000 $ за месяц, до вычета налогов')?.from,null);
 assert.equal(parseSalary('до 5 000 $ за месяц, до вычета налогов')?.to,5000);
 assert.equal(parseSalary('100 000 ₽ за месяц, на руки')?.from,100000);
 assert.equal(parseSalary('от 1 500 ₽ за час')?.period,'час');
 assert.equal(parseSalary('от 100 тыс. ₽ за месяц')?.from,100000);
 assert.equal(parseSalary(''),null);assert.equal(parseSalary('Доход не указан'),null);
 assert.equal(parseSalary('от 300 000 до 200 000 ₽ за месяц'),null);
});
test('salary groups do not mix currencies, periods or net and gross',()=>{
 const groups=salaryGroups([vacancy('1',{salary:'от 300 000 ₽ за месяц, до вычета налогов'}),vacancy('2',{salary:'от 230 000 до 366 000 ₽ за месяц, на руки'}),vacancy('3',{salary:'до 5 000 $ за месяц, на руки'}),vacancy('4',{salary:'1 500 ₽ за час, на руки'}),vacancy('5')]);
 assert.equal(groups.length,4);assert.equal(groups.reduce((s,g)=>s+g.points.length,0),4);
 assert.deepEqual(groups.flatMap(g=>g.points).find(p=>p.id==='2')?.range,[230000,366000]);
});
