import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveReport,filterVacancies,netFromGross,normalizeSalary,normalizedSalaryLabel,parseSalary,salaryGroups,workFormats} from './analytics.ts';
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
test('employment forms are grouped and can be combined within one filter category',()=>{
 const vs=[vacancy('1',{employment:'Оформление по ТК РФ'}),vacancy('2',{description:'Можно работать как самозанятый или по ГПХ'}),vacancy('3')];
 const r=deriveReport(base,vs);const forms=Object.fromEntries(r.dimensions.employmentForm.map(m=>[m.label,m]));
 assert.deepEqual(employmentForms(vs[1]),['ГПХ','Самозанятость']);assert.equal(forms['ТК РФ'].count,1);assert.equal(forms['ГПХ'].count,1);assert.equal(forms['Самозанятость'].count,1);
 assert.deepEqual(filterVacancies(vs,{employmentForm:['ТК РФ','ГПХ']}).map(v=>v.id),['1','2']);
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
test('salary chart compares actual rates, net amounts and periods on one monthly RUB scale',()=>{
 const groups=salaryGroups([vacancy('1',{salary:'от 300 000 ₽ за месяц, до вычета налогов'}),vacancy('2',{salary:'от 230 000 до 366 000 ₽ за месяц, на руки'}),vacancy('3',{salary:'до 5 000 $ за месяц, на руки'}),vacancy('4',{salary:'1 500 ₽ за час, на руки'}),vacancy('5')],{RUB:1,USD:100});
 assert.equal(groups.length,1);assert.equal(groups[0].points.length,4);
 const point=(id:string)=>groups[0].points.find(p=>p.id===id)!;
 assert.equal(point('1').normalizedFrom,259000);assert.equal(point('1').normalizedTo,null);
 assert.deepEqual(point('2').normalizedRange,[230000,366000]);
 assert.equal(point('3').normalizedTo,500000);assert.equal(point('3').normalizedFrom,null);
 assert.equal(point('4').normalizedFrom,264000);
 assert.equal(point('3').raw,'до 5 000 $ за месяц, на руки');
 assert.equal(normalizedSalaryLabel(point('1')),'от 259 000 ₽/мес. на руки');
});
test('progressive NDFL applies marginal bands rather than a flat rate',()=>{
 assert.equal(netFromGross(100000),87000);assert.equal(netFromGross(200000),174000);
 assert.equal(netFromGross(300000),259000);assert.equal(netFromGross(1000000),836500);
 assert.ok(Math.abs(netFromGross(5000000/12)-(5000000-702000)/12)<.001);
 assert.ok(Math.abs(netFromGross(20000000/12)-(20000000-3402000)/12)<.001);
 assert.ok(Math.abs(netFromGross(50000000/12)-(50000000-9402000)/12)<.001);
 assert.equal(netFromGross(0),0);
});
test('unavailable currencies and unknown tax or period are never treated as known net RUB',()=>{
 const salary=parseSalary('1000 USD за месяц, на руки')!;
 assert.equal(normalizeSalary(salary,{RUB:1}),null);
 assert.equal(normalizeSalary(salary,{USD:Infinity}),null);
 assert.equal(normalizeSalary(salary,{USD:-1}),null);
 assert.equal(normalizeSalary(parseSalary('100 000 ₽ за месяц')!,{RUB:1}),null);
 assert.equal(normalizeSalary(parseSalary('100 000 ₽, на руки')!,{RUB:1}),null);
 assert.equal(salaryGroups([vacancy('1',{salary:'1000 USD за месяц, на руки'}),vacancy('2',{salary:'100 000 ₽ за месяц, на руки'})])[0].points.length,1);
});
test('additional currencies and annual amounts preserve original bounds while converting',()=>{
 assert.equal(parseSalary("от 10 000 000 до 20 000 000 so'm за месяц, до вычета налогов")?.currency,'UZS');
 assert.equal(parseSalary('1000 CAD за месяц, на руки')?.currency,'CAD');
 assert.equal(parseSalary('1000 R$ за месяц, на руки')?.currency,'BRL');
 assert.deepEqual(normalizeSalary(parseSalary('1 200 000 ₽ за год, на руки')!,{RUB:1}),[100000,100000]);
 assert.deepEqual(normalizeSalary(parseSalary('от 100 до 200 KZT за месяц, на руки')!,{KZT:.2}),[20,40]);
});
