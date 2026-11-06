import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { Metric, Vacancy } from '../types';
import { date, number } from '../types';
import { EmptyState } from './AppUI';

export function VacancyBrowser({ vacancies, initialId, metric, dimension }: { vacancies: Vacancy[]; initialId?: string; metric?: Metric; dimension?: string }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('title');
  const [selected, setSelected] = useState<string | null>(initialId || null);
  const items = useMemo(() => vacancies.filter(v => `${v.title} ${v.company} ${v.city}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'responses' ? (b.responseCount ?? -1) - (a.responseCount ?? -1) : sort === 'date' ? Date.parse(b.publishedAt || b.collectedAt) - Date.parse(a.publishedAt || a.collectedAt) : a.title.localeCompare(b.title, 'ru')), [vacancies, search, sort]);
  useEffect(() => { if (selected && !items.some(v => v.id === selected)) setSelected(null); }, [items, selected]);
  useEffect(() => { setSelected(initialId || null); }, [initialId]);
  const vacancy = items.find(v => v.id === selected);
  return <div className={`vacancy-browser ${vacancy ? 'has-selection' : ''}`}>
    <div className="vacancy-browser-list"><div className="vacancy-list-toolbar"><label className="form-field"><span>Поиск вакансий</span><div className="input-with-icon"><Search size={15} aria-hidden="true" /><Input placeholder="Должность, компания, город" value={search} onChange={e => setSearch(e.target.value)} /></div></label><label className="form-field"><span>Сортировка вакансий</span><NativeSelect value={sort} onChange={e => setSort(e.target.value)}><option value="title">По названию</option><option value="responses">По откликам</option><option value="date">По дате</option></NativeSelect></label></div>
      <div className="vacancy-list-count">Вакансии <span>{number(items.length)}</span></div>
      <div className="vacancy-list">{items.map(v => <button key={v.id} className="vacancy-list-row" aria-pressed={v.id === selected} onClick={() => setSelected(v.id)}><span className="vacancy-row-company">{v.company || 'Компания не указана'}</span><strong>{v.title}</strong>{v.salary && <span className="vacancy-row-salary">{v.salary}</span>}<span className="vacancy-row-location">{v.city || v.address || 'Город не указан'}<span>·</span>{v.experience || 'Опыт не указан'}</span>{v.responseCount != null && <span className="vacancy-row-responses">{number(v.responseCount)} откликов</span>}{!v.loaded && <Badge variant="outline">Описание не загружено</Badge>}</button>)}</div>
      {!items.length && <EmptyState title="Вакансии не найдены" description="Попробуйте другое название, компанию или город." action={search ? <Button variant="outline" onClick={() => setSearch('')}>Сбросить поиск</Button> : undefined} />}
    </div>
    <div className="vacancy-browser-detail">{vacancy ? <VacancyDetail vacancy={vacancy} metric={metric} dimension={dimension} onBack={() => setSelected(null)} /> : <EmptyState title="Выберите вакансию" description="Здесь появится сохранённое описание, условия и исходные фрагменты для проверки метрик." />}</div>
  </div>;
}

export function VacancyDetail({ vacancy: v, metric, dimension, onBack }: { vacancy: Vacancy; metric?: Metric; dimension?: string; onBack: () => void }) {
  const evidence = metric?.evidence.filter(e => e.vacancyId === v.id) || [];
  return <article className="vacancy-detail"><Button variant="ghost" size="sm" className="vacancy-back" onClick={onBack}><ArrowLeft data-icon="inline-start" />К списку</Button><p className="vacancy-detail-company">{v.company || 'Компания не указана'}</p><h2>{v.title}</h2>{v.salary && <p className={`vacancy-detail-salary ${dimension === 'salary' ? 'highlight-field' : ''}`}>{v.salary}</p>}
    {!v.loaded && <div className="data-notice">{v.error || 'Полное описание не загружено. Показаны данные поисковой выдачи.'}</div>}
    <dl className="vacancy-facts">{[['Город', v.city || v.address, 'city'], ['Опыт', v.experience, 'experience'], ['Формат', v.workFormats?.join(', ') || v.format, 'workFormats'], ['Грейд', v.grade, 'grade'], ['Отклики', v.responseCount == null ? 'Нет данных' : number(v.responseCount), 'responses']].map(([label, value, key]) => <div className={dimension === key ? 'highlight-field' : ''} key={key}><dt>{label}</dt><dd>{value || 'Не указан'}</dd></div>)}</dl>
    {evidence.length > 0 && <section className="vacancy-evidence"><h3>Почему вакансия учтена</h3>{evidence.map((e, i) => <blockquote key={i}><span>{e.field === 'keySkills' ? 'Ключевые навыки' : e.field === 'description' ? 'Описание вакансии' : 'Поле вакансии'}</span><p>{e.quote}</p></blockquote>)}</section>}
    {!!v.keySkills?.length && <section><h3>Ключевые навыки</h3><div className="skill-tags">{v.keySkills.map((skill, i) => <Badge key={`${skill}-${i}`} variant="secondary" className={evidence.some(e => e.field === 'keySkills' && e.quote.toLowerCase() === skill.toLowerCase()) ? 'highlight-field' : ''}>{skill}</Badge>)}</div></section>}
    <section><h3>Описание вакансии</h3><div className="vacancy-description">{v.description ? v.description.split(/\n\s*\n/).map((p, i) => <p key={i}><Highlight text={p} terms={evidence.filter(e => e.field === 'description').map(e => e.quote)} /></p>) : <p>Описание недоступно.</p>}</div></section>
    <footer className="vacancy-detail-footer"><span>Сохранено {date(v.collectedAt)}{v.publishedAt && <><br />Опубликовано {date(v.publishedAt)}</>}</span><Button asChild variant="outline" size="sm"><a href={v.url} target="_blank" rel="noopener noreferrer">Оригинал на hh.ru<ArrowUpRight data-icon="inline-end" /></a></Button></footer>
  </article>;
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ranges: { start: number; end: number }[] = [];
  for (const term of [...new Set(terms)].sort((a, b) => b.length - a.length)) {
    if (!term) continue;
    let index = 0;
    while ((index = text.toLowerCase().indexOf(term.toLowerCase(), index)) !== -1) {
      const end = index + term.length;
      if (!ranges.some(r => index < r.end && end > r.start)) ranges.push({ start: index, end });
      index = end;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let offset = 0;
  const parts: React.ReactNode[] = [];
  ranges.forEach((r, i) => { parts.push(text.slice(offset, r.start), <mark key={i}>{text.slice(r.start, r.end)}</mark>); offset = r.end; });
  return <>{parts}{text.slice(offset)}</>;
}
