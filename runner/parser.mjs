import { parse, TextNode } from 'node-html-parser';

export function initialState(html) {
  const node = parse(html).querySelector('#HH-Lux-InitialState');
  if (!node) return {};
  for (const text of [node.innerHTML, new TextNode(node.innerHTML).text]) {
    try {
      const state = JSON.parse(text);
      if (state && typeof state === 'object' && !Array.isArray(state)) return state;
    } catch {}
  }
  return {};
}

const clean = s => String(s ?? '').replace(/\\xa0/g, ' ').replace(/\s+/g, ' ').trim();

export function employmentFormFromText(...parts) {
  const text = parts.map(clean).join(' ').toLowerCase();
  const labels = [];
  const add = label => { if (!labels.includes(label)) labels.push(label); };
  if (/(?:^|[^\p{L}\p{N}_])тк\s*рф(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:трудов\p{L}*\s+договор|официальн\p{L}*\s+оформ)/iu.test(text)) add('ТК РФ');
  if (/(?:^|[^\p{L}\p{N}_])гпх(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:гражданск\p{L}*[- ]правов\p{L}*\s+договор|договор\p{L}*\s+подряда|оказани\p{L}*\s+услуг)/iu.test(text)) add('ГПХ');
  if (/самозанят\p{L}*/iu.test(text)) add('Самозанятость');
  if (/(?:^|[^\p{L}\p{N}_])ип(?:$|[^\p{L}\p{N}_])|индивидуальн\p{L}*\s+предпринимател\p{L}*/iu.test(text)) add('ИП');
  return labels.join(' / ');
}

export function vacancyID(value) {
  try {
    const url = new URL(value, 'https://hh.ru');
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)hh\.ru$/.test(url.hostname)) return '';
    return url.pathname.match(/^\/vacancy\/(\d+)\/?$/)?.[1] ?? '';
  } catch { return ''; }
}

export function searchPage(html, extracted = [], requestedPageSize = 0) {
  const state = initialState(html);
  const doc = parse(html);
  const rows = doc.querySelectorAll('[data-qa="vacancy-serp__vacancy"]');
  const get = (n, q) => clean(n.querySelector(`[data-qa="${q}"]`)?.text);
  const items = rows.map(n => ({
    title: get(n, 'serp-item__title-text'),
    url: n.querySelector('[data-qa="serp-item__title"]')?.getAttribute('href'),
    employer: get(n, 'vacancy-serp__vacancy-employer-text'),
    address: get(n, 'vacancy-serp__vacancy-address'),
    compensation: get(n, 'vacancy-serp__compensation'),
  })).filter(n => /\/vacancy\/\d+/.test(n.url ?? ''));
  const links = doc.querySelectorAll('[data-qa="serp-item__title"], [data-qa="vacancy-serp__results"] a[href]')
    .map(n => ({ url: n.getAttribute('href'), title: clean(n.text) }));
  const result = state.vacancySearchResult ?? {};
  const heading = clean(doc.querySelector('[data-qa="vacancies-search-header"]')?.text);
  const headingTotal = heading.match(/\d[\d\s\u00a0]*/)?.[0]?.replace(/\s/g, '');
  const total = result.totalResults ?? result.vacanciesFound ?? result.total ?? headingTotal;
  const next = doc.querySelector('[data-qa="pager-next"]')?.getAttribute('href');
  const pages = doc.querySelectorAll('[data-qa="pager-page"]').map(n => Number(clean(n.text))).filter(Number.isFinite);
  // hh.ru renders only the first 20 cards; its same-page initial state contains all 50 results.
  // Whitelist public listing fields, never forward account/user state to the application.
  const stateItems = (Array.isArray(result.vacancies)?result.vacancies:[]).filter(v=>/^\d+$/.test(String(v.vacancyId ?? v.id))).map(v=>({
    title:clean(v.name), url:`https://hh.ru/vacancy/${v.vacancyId ?? v.id}`,
    employer:clean(v.company?.visibleName||v.company?.name), address:clean(v.area?.name||v.address?.displayName),
    compensation:'',
  }));
  const byId = new Map();
  for (const item of [...links, ...stateItems, ...items, ...(Array.isArray(extracted) ? extracted : [])]) {
    const id = vacancyID(item?.url);
    if (!id) continue;
    const merged = byId.get(id) ?? {};
    for (const key of ['title', 'employer', 'address', 'compensation']) {
      if (clean(item[key])) merged[key] = clean(item[key]);
    }
    byId.set(id, { ...merged, url: `https://hh.ru/vacancy/${id}` });
  }
  const allItems = [...byId.values()];
  const paging=result.paging;
  const nextPage=paging?.next&&!paging.next.disabled?Number(paging.next.page):undefined;
  const hasMore=paging?.next? !paging.next.disabled:undefined;
  const scalar = value => Array.isArray(value) ? value[0] : value;
  const pageSize = result.resultsPerPage ?? result.perPage ?? scalar(state.searchParameterMap?.items_on_page);
  const currentPage = result.page ?? scalar(state.searchParameterMap?.page);
  const selectedPage = doc.querySelector('[data-qa="pager-page"][aria-current="true"]');
  const pageNumber = currentPage ?? (selectedPage ? Number(clean(selectedPage.text)) - 1 : undefined);
  return { items:allItems, total: Number(total) || 0, totalKnown: total != null && total !== '' && Number.isFinite(Number(total)),
    nextUrl: next ?? '', nextPage: Number.isInteger(nextPage) ? nextPage : undefined, hasMore,
    currentPage: pageNumber != null && Number.isInteger(Number(pageNumber)) ? Number(pageNumber) : undefined,
    recognized: Array.isArray(result.vacancies) || total != null || allItems.length > 0 || !!doc.querySelector('[data-qa="vacancy-serp__results"]'),
    visibleLastPage: Math.max(0, ...pages, paging?.lastPage?.page!=null?Number(paging.lastPage.page)+1:0), pageSize: Number(pageSize) || requestedPageSize, heading };
}

export function filtersFromHTML(html) {
  const state = initialState(html);
  const names = { area: 'Регион', experience: 'Опыт работы', work_format: 'Формат работы',
    employment_form: 'Занятость', education: 'Образование', professional_role: 'Специализация',
    work_schedule_by_days: 'График работы', working_hours: 'Рабочие часы' };
  const groups = Object.entries(names).flatMap(([key, label]) => {
    const cluster = state.searchClusters?.[key];
    const options = Object.values(cluster?.groups ?? {}).sort((a,b) => (a.order ?? 0)-(b.order ?? 0))
      .map(x => ({ value: String(x.id), label: clean(x.title), count: x.count ?? 0 }));
    return options.length ? [{ key, label, options }] : [];
  });
  return groups;
}

export function detailFromHTML(html, value = {}, countRecipe) {
  value ||= {};
  const doc = parse(html);
  const desc = doc.querySelector('[data-qa="vacancy-description"]');
  // Plain text with source paragraph boundaries, never untrusted executable markup.
  const state = initialState(html);
  const view = state.vacancyView ?? {};
  const vacancy = view.vacancy ?? view;
  const found = countRecipe ? new RegExp(countRecipe).exec(html) : null;
  const responses = view.vacancyResponsesCount ?? vacancy.vacancyResponsesCount ?? (found ? Number(found[1]) : null);
  const city = vacancy.area?.name ?? view.area?.name ?? '';
  const sourceDescription = desc ?? (vacancy.description ? parse(vacancy.description) : undefined);
  const description = sourceDescription?.structuredText.split('\n').map(clean).filter(Boolean).join('\n\n') || clean(value.description);
  const title = clean(value.title || doc.querySelector('[data-qa="vacancy-title"]')?.text || vacancy.name);
  const field = (key, qa, fallback = '') => clean(value[key] || doc.querySelector(`[data-qa="${qa}"]`)?.text || fallback);
  const list = (key, qa, fallback = []) => {
    const values = Array.isArray(value[key]) && value[key].length ? value[key] : doc.querySelectorAll(`[data-qa="${qa}"]`).map(n => n.text);
    return (values.length ? values : fallback).map(item => clean(typeof item === 'string' ? item : item?.name)).filter(Boolean);
  };
  const employment = field('employment', 'common-employment-text');
  return { title, description,
    company: field('company', 'vacancy-company-name', vacancy.company?.visibleName || vacancy.company?.name),
    salary: field('salary', 'vacancy-salary'),
    experience: field('experience', 'vacancy-experience'),
    employment,
    workSchedule: field('workSchedule', 'work-schedule-by-days-text'),
    workingHours: field('workingHours', 'working-hours-text'),
    address: field('address', 'vacancy-view-raw-address', vacancy.address?.displayName),
    workFormats: list('workFormats', 'work-formats-text'),
    keySkills: list('keySkills', 'skills-element', Array.isArray(vacancy.keySkills) ? vacancy.keySkills : []),
    publishedAt: clean(value.publishedAt || doc.querySelector('time')?.getAttribute('datetime') || vacancy.publishedAt),
    sourceId: vacancy.vacancyId ?? vacancy.id,
    employmentForm: employmentFormFromText(employment, value.employmentForm, description),
    city, responseCount: Number.isFinite(responses) ? responses : null };
}
