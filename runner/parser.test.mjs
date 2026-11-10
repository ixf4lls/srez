import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, filtersFromHTML, detailFromHTML, searchPage, employmentFormFromText, vacancyID } from './parser.mjs';
const state={searchClusters:{experience:{groups:{noExperience:{id:'noExperience',title:'Нет опыта',count:12,order:1}}}},vacancySearchResult:{vacanciesFound:123}};
const template=`<template id="HH-Lux-InitialState" style="display:none">${JSON.stringify(state).replaceAll('"','&#34;')}</template>`;
test('reads only the filter groups, preserves source options',()=>{assert.equal(initialState(template).vacancySearchResult.vacanciesFound,123);assert.deepEqual(filtersFromHTML(template),[{key:'experience',label:'Опыт работы',options:[{value:'noExperience',label:'Нет опыта',count:12}]}]);assert.deepEqual(filtersFromHTML('<body/>'),[])});
test('keeps paragraph evidence and distinguishes missing responses from zero',()=>{const html='<div data-qa="vacancy-description"><p>Требования</p><ul><li>Знание PostgreSQL</li></ul></div>vacancyResponsesCount&#34;:0';const v=detailFromHTML(html,{description:'fallback'},'vacancyResponsesCount&#34;:(\\d+)');assert.equal(v.responseCount,0);assert.equal(v.description,'Требования\n\nЗнание PostgreSQL');assert.equal(detailFromHTML('',{},'vacancyResponsesCount&#34;:(\\d+)').responseCount,null)});
test('search total comes from state, not visible pagination buttons',()=>{const page=searchPage(template+'<a data-qa="pager-page">5</a>',[]);assert.equal(page.total,123);assert.equal(page.visibleLastPage,5)});
test('collects all same-page results even when most cards are not server rendered',()=>{
 const state={vacancySearchResult:{totalResults:74,vacancies:Array.from({length:50},(_,i)=>({vacancyId:1000+i,name:`Job ${i}`,company:{name:'Example'},area:{name:'Москва'}})),paging:{next:{page:1,disabled:false},lastPage:{page:1}}}};
 const html=`<template id="HH-Lux-InitialState">${JSON.stringify(state).replaceAll('"','&#34;')}</template>`;
 const page=searchPage(html,[]);assert.equal(page.items.length,50);assert.equal(page.total,74);assert.equal(page.nextPage,1);assert.equal(page.hasMore,true);
});
test('extracts legal engagement forms from vacancy text',()=>{
 assert.equal(employmentFormFromText('Оформление по ТК РФ',''), 'ТК РФ');
 assert.equal(employmentFormFromText('','Возможна работа по договору ГПХ или как самозанятый'), 'ГПХ / Самозанятость');
 assert.equal(employmentFormFromText('Полная занятость','Условия обсуждаются'), '');
});

const withState = state => `<template id="HH-Lux-InitialState">${JSON.stringify(state).replaceAll('"', '&#34;')}</template>`;

test('unions state, visible cards and extracted links without blanking listing fields', () => {
 const html = withState({vacancySearchResult:{totalResults:4,vacancies:[{vacancyId:1,name:'State title',company:{name:'State company'}},{id:2,name:'State only'}]}}) +
  '<div data-qa="vacancy-serp__vacancy"><a data-qa="serp-item__title" href="/vacancy/1?from=search"><span data-qa="serp-item__title-text"></span></a><span data-qa="vacancy-serp__compensation">100 000 ₽</span></div>' +
  '<a data-qa="serp-item__title" href="https://spb.hh.ru/vacancy/3">Card with new wrapper</a>';
 const page = searchPage(html, [{url:'https://hh.ru/vacancy/4',title:'Extracted only'}, {url:'https://hh.ru/vacancy/1?tracking=1',title:''}]);
 assert.deepEqual(page.items.map(x => vacancyID(x.url)).sort(), ['1','2','3','4']);
 const merged = page.items.find(x => vacancyID(x.url) === '1');
 assert.equal(merged.title, 'State title');
 assert.equal(merged.employer, 'State company');
 assert.equal(merged.compensation, '100 000 ₽');
 assert.equal(merged.url, 'https://hh.ru/vacancy/1');
});

test('rejects unrelated, malformed and executable vacancy links', () => {
 for (const url of ['https://example.org/vacancy/1', 'https://hh.ru.evil.org/vacancy/1', 'javascript:/vacancy/1', 'https://hh.ru/vacancy/1/extra', '/vacancy/not-an-id']) assert.equal(vacancyID(url), '', url);
 assert.equal(vacancyID('/vacancy/123?from=search'), '123');
 assert.deepEqual(searchPage('', [{url:'https://example.org/vacancy/1'}]).items, []);
});

test('distinguishes a verified zero from an unrecognized page and reads array search parameters', () => {
 assert.equal(searchPage('<body>Temporary failure</body>').recognized, false);
 assert.equal(searchPage('<body/>').totalKnown, false);
 const page = searchPage(withState({vacancySearchResult:{totalResults:0,vacancies:[]},searchParameterMap:{page:['2'],items_on_page:['50']}}));
 assert.equal(page.recognized, true);
 assert.equal(page.totalKnown, true);
 assert.equal(page.total, 0);
 assert.equal(page.currentPage, 2);
 assert.equal(page.pageSize, 50);
 assert.equal(searchPage('<body/>', [], 50).pageSize, 50);
});

test('preserves description text outside paragraphs and in nested lists', () => {
 const html = '<h1 data-qa="vacancy-title">Developer</h1><div data-qa="vacancy-description">Вступление<p>Требования <b>SQL</b></p><ul><li>Опыт<ul><li>Go</li></ul></li></ul>Конец</div>';
 const detail = detailFromHTML(html);
 assert.equal(detail.title, 'Developer');
 assert.equal(detail.description, 'Вступление\n\nТребования SQL\n\nОпыт\n\nGo\n\nКонец');
});

test('recovers public detail fields and zero responses from initial state', () => {
 const html = withState({vacancyView:{vacancy:{vacancyId:123,name:'State title',description:'<p>First</p><p>Second</p>',area:{name:'Москва'}},vacancyResponsesCount:0}});
 const detail = detailFromHTML(html, null);
 assert.equal(detail.title, 'State title');
 assert.equal(detail.description, 'First\n\nSecond');
 assert.equal(detail.sourceId, 123);
 assert.equal(detail.city, 'Москва');
 assert.equal(detail.responseCount, 0);
});
