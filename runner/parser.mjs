import { parse } from 'node-html-parser';

export function initialState(html) {
  const node = parse(html).querySelector('#HH-Lux-InitialState');
  if (!node) return {};
  try { return JSON.parse(node.text); } catch { return {}; }
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

export function searchPage(html, extracted) {
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
  const result = state.vacancySearchResult ?? {};
  const heading = clean(doc.querySelector('[data-qa="vacancies-search-header"]')?.text);
  const total = result.totalResults ?? result.vacanciesFound ?? result.total ?? Number(heading.match(/[\d\s\u00a0]+/)?.[0]?.replace(/\s/g, ''));
  const next = doc.querySelector('[data-qa="pager-next"]')?.getAttribute('href');
  const pages = doc.querySelectorAll('[data-qa="pager-page"]').map(n => Number(clean(n.text))).filter(Number.isFinite);
  // hh.ru renders only the first 20 cards; its same-page initial state contains all 50 results.
  // Whitelist public listing fields, never forward account/user state to the application.
  const byId = new Map(items.map(v=>[v.url.match(/\/vacancy\/(\d+)/)?.[1],v]));
  const stateItems = (Array.isArray(result.vacancies)?result.vacancies:[]).filter(v=>/^\d+$/.test(String(v.vacancyId))).map(v=>({
    title:clean(v.name), url:`https://hh.ru/vacancy/${v.vacancyId}`,
    employer:clean(v.company?.visibleName||v.company?.name), address:clean(v.area?.name||v.address?.displayName),
    compensation:'', ...byId.get(String(v.vacancyId)),
  }));
  const allItems = stateItems.length?stateItems:items.length?items:extracted;
  const paging=result.paging;
  const nextPage=paging?.next&&!paging.next.disabled?Number(paging.next.page):undefined;
  const hasMore=paging?.next? !paging.next.disabled:undefined;
  const pageSize = result.resultsPerPage ?? result.perPage ?? state.searchParameterMap?.items_on_page;
  return { items:allItems, total: Number(total) || 0, nextUrl: next ?? '', nextPage, hasMore,
    visibleLastPage: Math.max(0, ...pages, paging?.lastPage?.page!=null?Number(paging.lastPage.page)+1:0), pageSize: Number(pageSize) || allItems?.length||0, heading };
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

export function detailFromHTML(html, value, countRecipe) {
  const doc = parse(html);
  const desc = doc.querySelector('[data-qa="vacancy-description"]');
  // Plain text with source paragraph boundaries, never untrusted executable markup.
  const paragraphs = desc?.querySelectorAll('p, li, h2, h3, h4')
    .filter(n => !n.querySelector('p, li, h2, h3, h4')).map(n => clean(n.text)).filter(Boolean) ?? [];
  const state = initialState(html);
  const vacancy = state.vacancyView ?? {};
  const found = new RegExp(countRecipe).exec(html);
  const responses = found ? Number(found[1]) : null;
  const city = vacancy.area?.name ?? vacancy.vacancy?.area?.name ?? '';
  const description = paragraphs.length ? paragraphs.join('\n\n') : value.description;
  return { ...value, description,
    employmentForm: employmentFormFromText(value.employment, value.employmentForm, description),
    city, responseCount: Number.isFinite(responses) ? responses : null };
}
