import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveReport,employmentForms,filterVacancies,netFromGross,normalizeSalary,normalizedSalaryLabel,parseSalary,salaryAxis,salaryGroups,workFormats} from './analytics.ts';
import {analysisSnapshotAt,marketIndex} from './marketIndex.ts';
import type {Report,Vacancy} from './types.ts';

const vacancy=(id:string,values:Partial<Vacancy>={}):Vacancy=>({id,url:`https://hh.ru/vacancy/${id}`,title:`Job ${id}`,company:'Example',salary:'',city:'Москва',address:'Москва',experience:'1–3 года',workFormats:['на месте работодателя, удалённо или гибрид'],format:'Офис / Гибрид / Удалённо',grade:'Middle',employment:'',workSchedule:'',workingHours:'',description:'',keySkills:[],responseCount:null,publishedAt:'',collectedAt:'2026-11-01T09:00:00Z',loaded:true,requirements:[],...values});
const base:Report={total:0,dimensions:{},skills:[{key:'go',label:'Go',count:2,percent:100,vacancyIds:['1','2'],evidence:[{vacancyId:'1',field:'keySkills',quote:'Golang'},{vacancyId:'2',field:'keySkills',quote:'Go'}]}],requirements:[],responses:[],responseMean:null,responseCoverage:0,skillsCoverage:0,requirementsCoverage:0,version:'test'};

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

test('salary axis uses one unit and a linear scale covering every salary bound',()=>{
 for(const maximum of [0,1,20,999,1000,59682,456758,900000,999999,1000000,1200000,9000000,30000000]){
  const axis=salaryAxis(maximum);
  assert.equal(axis.domain[0],0);
  assert.ok(axis.domain[1]>=maximum);
  assert.equal(axis.ticks[0],0);
  assert.equal(axis.ticks.at(-1),axis.domain[1]);
  assert.ok(axis.ticks.length>=2&&axis.ticks.length<=5);
  const step=axis.ticks[1];
  assert.ok(axis.ticks.every((value,index)=>Math.abs(value-index*step)<.000001));
  const labels=axis.ticks.map(axis.formatTick);
  assert.equal(new Set(labels).size,labels.length);
  assert.ok(labels.every(label=>!/[а-я]/i.test(label)));
 }
 const thousands=salaryAxis(456758);
 assert.equal(thousands.caption,'тыс. ₽ в месяц, на руки');
 assert.deepEqual(thousands.ticks.map(thousands.formatTick),['0','150','300','450','600']);
 const millions=salaryAxis(1200000);
 assert.equal(millions.caption,'млн ₽ в месяц, на руки');
 assert.deepEqual(millions.ticks.map(millions.formatTick),['0','0,5','1','1,5']);
 assert.deepEqual(salaryAxis(900000).ticks.map(salaryAxis(900000).formatTick),['0','0,25','0,5','0,75','1']);
 assert.deepEqual(salaryAxis(9000000).ticks.map(salaryAxis(9000000).formatTick),['0','2,5','5','7,5','10']);
 assert.ok(Number.isFinite(salaryAxis(Infinity).domain[1]));
});
