import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, filtersFromHTML, detailFromHTML, searchPage, employmentFormFromText } from './parser.mjs';
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
