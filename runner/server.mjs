import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { call, getResult, saveSite } from 'api-anything';
import { searchPage, filtersFromHTML, detailFromHTML } from './parser.mjs';

const base = JSON.parse(readFileSync(new URL('./operations/hh.json', import.meta.url)));
const home = process.env.API_ANYTHING_HOME || join(process.cwd(), '.runtime');
process.env.API_ANYTHING_HOME = home;
const source = process.env.SESSION_SOURCE || `${process.env.HOME}/.api-anything/sessions/hh.json`;
let stamp = 0;
function syncSession() {
  try {
    const m = statSync(source).mtimeMs;
    if (m <= stamp) return true;
    const session = JSON.parse(readFileSync(source, 'utf8'));
    // Never attempt to open a host browser/keychain from the container.
    delete session.source;
    const dest = join(home, 'sessions/hh.json');
    mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
    writeFileSync(dest, JSON.stringify(session), { mode: 0o600 });
    stamp = m;
    return true;
  } catch { return false; }
}

function installSearch(args) {
  const site = structuredClone(base);
  for (const op of site.operations.filter(x => ['searchVacancies','listVacancyLinks'].includes(x.name))) {
    const url = new URL(op.request.url);
    // Remove truly unselected filters rather than sending an empty enum or hidden default.
    for (const key of ['area','experience','employment_form','work_format']) {
      if (!args[key]) {
        url.searchParams.delete(key);
        op.slots = op.slots.filter(s => s.param !== key);
        op.params = op.params.filter(p => p.name !== key);
      }
    }
    for (const key of ['education','professional_role','work_schedule_by_days','working_hours']) {
      if (!args[key]) continue;
      url.searchParams.set(key, `{${key}}`);
      op.slots.push({ param: key, at: [`query:${key}`] });
      op.params.push({ name:key, type:'string', required:true });
    }
    // Search snippets are unnecessary: complete descriptions are fetched separately.
    url.searchParams.set('enable_snippets', 'false');
    url.searchParams.set('items_on_page', '50');
    op.request.url = url.href;
    op.trigger.url = decodeURIComponent(url.href);
    delete op.checks;
  }
  saveSite(site);
}

async function complete(result) {
  if (!result.more) return result;
  let text = '', offset = 0;
  for (;;) {
    const part = getResult({ resultId:result.resultId, format:'json', offset, maxChars:200000 });
    if (!part.ok) throw new Error('Не удалось восстановить полный ответ api-anything');
    text += part.data;
    if (!part.more) break;
    offset = part.more.offset;
  }
  return { ...result, data:JSON.parse(text), truncated:undefined, more:undefined };
}

async function execute(kind, input = {}) {
  if (!syncSession()) return { ok:false, class:'auth', reason:'Сессия hh.ru не найдена. Выполните на компьютере: api-anything login hh --window', next:'Завершите вход и повторите действие.' };
  const args = Object.fromEntries(Object.entries(input).filter(([,v]) => v !== '' && v != null));
  const search = kind !== 'vacancy';
  if (search) { args.text ||= 'разработчик'; args.page = String(args.page ?? '0'); }
  installSearch(search ? args : {});
  const op = kind === 'vacancy' ? 'getVacancy' : kind === 'filters' ? 'searchVacancies' : 'listVacancyLinks';
  let html = '';
  const fetchImpl = async (...params) => {
    const res = await fetch(...params);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) html = await res.clone().text();
    return res;
  };
  let result = await complete(await call('hh', op, args, {
    maxTier:1, minIntervalMs:1200, timeoutMs:45000, view:{ maxChars:200000 }, fetchImpl,
  }));
  if (!result.ok && (result.class !== 'drift' || !html)) return result;
  if (kind === 'filters') {
    const groups = filtersFromHTML(html);
    if (!groups.length) return { ok:false, class:'drift', reason:'hh.ru не вернул список фильтров. Доступные варианты не будут подменены вымышленными.' };
    return { ok:true, data:groups, fetchedAt:new Date().toISOString(), source:'hh.ru / api-anything', tier:result.tier };
  }
  if (kind === 'search') {
    const data = searchPage(html, result.data, 50);
    if (!data.recognized) return { ok:false, class:'drift', reason:'hh.ru не вернул распознаваемую страницу выдачи.' };
    return { ...result, ok:true, class:'ok', data };
  }
  const value = Array.isArray(result.data) ? result.data[0] : result.data;
  const recipe = base.operations.find(x => x.name === 'getVacancyResponseCount').response.embedded.regex;
  const data = detailFromHTML(html, value, recipe);
  if (!data.title || !data.description || (data.sourceId != null && String(data.sourceId) !== String(args.vacancyId))) {
    return { ok:false, class:'drift', reason:'hh.ru не вернул полное описание запрошенной вакансии.' };
  }
  return { ...result, ok:true, class:'ok', data };
}

// API retries join this same queue and retain api-anything's request spacing and cooldown.
let queue = Promise.resolve();
const send = (res, status, data) => { res.writeHead(status, { 'content-type':'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
http.createServer(async (req,res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res,200,{ ok:true, session:syncSession(), provider:'api-anything', version:'0.3.2' });
  const kind = req.url?.slice(1);
  if (req.method !== 'POST' || !['search','vacancy','filters'].includes(kind)) return send(res,404,{error:'Not found'});
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 16384) return send(res,413,{error:'Request too large'}); }
    const args = JSON.parse(body || '{}');
    if (kind === 'vacancy' && !/^\d+$/.test(args.vacancyId)) return send(res,400,{error:'Invalid vacancy ID'});
    const job = queue.then(() => execute(kind,args));
    queue = job.catch(() => {});
    send(res,200,await job);
  } catch (err) { console.error('Runner request failed:', err.name); send(res,500,{ok:false,class:'error',reason:'Ошибка интеграции api-anything. Проверьте журнал runner.'}); }
}).listen(Number(process.env.PORT || 8091), '0.0.0.0', () => console.log('api-anything runner is ready'));
