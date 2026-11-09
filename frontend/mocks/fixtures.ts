import { deriveReport } from '../src/analytics.ts';
import type { Analysis, FilterGroup, Metric, Report, Vacancy } from '../src/types.ts';

const day = 86_400_000;
const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург', 'Нижний Новгород', 'Самара'];
const grades = ['Junior', 'Middle', 'Senior', 'Lead', 'Не указан'];
const experiences = ['Нет опыта', 'От 1 года до 3 лет', 'От 3 до 6 лет', 'Более 6 лет'];
const formats = [['Удалённо'], ['Офис'], ['Гибрид'], ['Офис', 'Удалённо', 'Гибрид']];
const salaries = [
  'от 180 000 до 260 000 ₽ за месяц, на руки', 'от 250 000 ₽ за месяц, до вычета налогов',
  'до 350 000 ₽ за месяц, на руки', '220 000 ₽ за месяц, на руки',
  'от 3 000 до 5 000 USD за месяц, на руки', '4 000 EUR за месяц, до вычета налогов',
  '', '1 500 ₽ за час, на руки',
];
const stacks = [['React', 'TypeScript', 'JavaScript', 'CSS'], ['Go', 'PostgreSQL', 'Docker', 'Kubernetes'], ['Python', 'SQL', 'Git', 'Linux']];

export type MockEntry = { analysis: Analysis; vacancies: Vacancy[]; deleted: boolean; jobStartedAt?: number };

export function makeVacancies(snapshot: number, query = 'React', count = 48): Vacancy[] {
  return Array.from({ length: count }, (_, index) => {
    const skills = [...stacks[index % stacks.length], ...(index % 2 === 0 ? ['Git', 'Английский язык'] : ['CI/CD'])];
    const city = cities[index % cities.length];
    const workFormats = formats[index % formats.length];
    const grade = grades[index % grades.length];
    return {
      id: String(90000000 + index),
      url: `https://hh.ru/search/vacancy?text=${encodeURIComponent(query)}`,
      title: `[Тест] ${grade === 'Не указан' ? '' : grade + ' '}${query} разработчик ${index + 1}`,
      company: `Тестовая компания ${index % 9 + 1}`,
      salary: salaries[index % salaries.length], city, address: city,
      experience: experiences[index % experiences.length], workFormats, format: workFormats.join(' / '), grade,
      employmentForm: ['ТК РФ', 'ГПХ', 'Самозанятость', 'ИП'][index % 4],
      employment: 'Полная занятость', workSchedule: '5/2', workingHours: '8 часов',
      description: `Тестовая вакансия для проверки интерфейса, не реальное предложение работы. Ссылка открывает поиск hh.ru.\n\nОбязательно: опыт разработки, ${skills.join(', ')}.\nБудет плюсом: настройка CI/CD, работа с Docker.\nОформление по ТК РФ или ГПХ. Команда работает в формате ${workFormats.join(' / ')}.`,
      keySkills: [...new Set(skills)], responseCount: index % 11 === 0 ? null : index === 1 ? 0 : (index * 37 + 13) % 280,
      publishedAt: new Date(snapshot - (index % 38) * day).toISOString(),
      collectedAt: new Date(snapshot).toISOString(), loaded: index % 23 !== 22,
      ...(index % 23 === 22 ? { error: 'Тестовая ошибка: описание недоступно' } : {}),
      requirements: [
        { key: 'development', label: 'Опыт разработки', kind: 'Обязательно', quote: `Обязательно: опыт разработки, ${skills.join(', ')}.` },
        { key: index % 2 ? 'docker' : 'cicd', label: index % 2 ? 'Docker' : 'CI/CD', kind: 'Будет плюсом', quote: 'Будет плюсом: настройка CI/CD, работа с Docker.' },
      ],
    };
  });
}

export function makeReport(vacancies: Vacancy[]): Report {
  const skills = new Map<string, Metric>();
  const requirements = new Map<string, Metric>();
  for (const vacancy of vacancies.filter(v => v.loaded)) {
    for (const label of vacancy.keySkills) {
      const metric = skills.get(label) ?? { key: label, label, count: 0, percent: 0, vacancyIds: [], evidence: [] };
      metric.vacancyIds.push(vacancy.id);
      metric.evidence.push({ vacancyId: vacancy.id, field: 'keySkills', quote: label });
      skills.set(label, metric);
    }
    for (const item of vacancy.requirements) {
      const key = `${item.kind}:${item.key}`;
      const metric = requirements.get(key) ?? { key: item.key, label: item.label, kind: item.kind, count: 0, percent: 0, vacancyIds: [], evidence: [] };
      metric.vacancyIds.push(vacancy.id);
      metric.evidence.push({ vacancyId: vacancy.id, field: 'description', quote: item.quote });
      requirements.set(key, metric);
    }
  }
  const base: Report = {
    total: 0, dimensions: {}, skills: [...skills.values()], requirements: [...requirements.values()], responses: [],
    responseMean: null, responseCoverage: 0, skillsCoverage: 0, requirementsCoverage: 0, version: 'mock-1',
  };
  return deriveReport(base, vacancies);
}

export function makeEntry(id: string, snapshot: number, query: string, status = 'completed', count = 48): MockEntry {
  const vacancies = makeVacancies(snapshot, query, count);
  const report = makeReport(vacancies);
  const active = status === 'queued' || status === 'running';
  const timestamp = new Date(snapshot).toISOString();
  return {
    deleted: false, vacancies,
    analysis: {
      id, title: `[Тест] ${query}`, query, expression: `NAME:(${query})`, mode: 'roles',
      filters: {}, filterLabels: {}, status, stage: active ? status : 'done',
      message: active ? 'Тестовый сбор: пример состояния выполнения' : 'Тестовый анализ готов',
      createdAt: timestamp, updatedAt: timestamp, ...(!active ? { completedAt: timestamp } : {}),
      found: count, collected: active ? Math.floor(count / 2) : count,
      processed: active ? Math.floor(count / 3) : report.total, failed: count - report.total, nextPage: 1,
      warnings: ['Тестовые данные для проверки интерфейса. Вакансии и показатели вымышлены.'],
      ...(!active ? { report } : {}),
    },
  };
}

export function makeEntries(now: number): MockEntry[] {
  const scenarios: [number, string, string, number][] = [
    [0, 'React и TypeScript', 'completed', 48], [1, 'Go', 'completed', 36],
    [3, 'Python', 'partial', 27], [5, 'Frontend', 'cancelled', 18],
    [9, 'Backend', 'attention', 24], [36, 'Аналитик данных', 'interrupted', 12],
    [65, 'DevOps', 'completed', 32], [0, 'Сбор вакансий', 'running', 48],
    [0, 'Очередь сбора', 'queued', 24], [100, 'Пустой результат', 'completed', 0],
  ];
  return scenarios.map(([days, query, status, count], index) => makeEntry((index + 1).toString(16).padStart(24, '0'), now - days * day, query, status, count));
}

export const filterGroups: FilterGroup[] = [
  { key: 'area', label: 'Регион', options: cities.map((label, index) => ({ value: String(index + 1), label, count: 48 - index * 4 })) },
  { key: 'experience', label: 'Опыт работы', options: experiences.map((label, index) => ({ value: ['noExperience', 'between1And3', 'between3And6', 'moreThan6'][index], label, count: 12 })) },
  { key: 'work_format', label: 'Формат работы', options: ['Удалённо', 'Офис', 'Гибрид'].map((label, index) => ({ value: ['REMOTE', 'ON_SITE', 'HYBRID'][index], label, count: 20 })) },
  { key: 'employment_form', label: 'Тип оформления', options: ['ТК РФ', 'ГПХ', 'Самозанятость', 'ИП'].map((label, index) => ({ value: ['LABOUR', 'CIVIL', 'SELF_EMPLOYED', 'IP'][index], label, count: 12 })) },
  { key: 'education', label: 'Образование', options: [{ value: 'higher', label: 'Высшее', count: 32 }, { value: 'not_required_or_not_specified', label: 'Не требуется или не указано', count: 16 }] },
  { key: 'professional_role', label: 'Специализация', options: [{ value: '96', label: 'Программист, разработчик', count: 36 }, { value: '10', label: 'Аналитик', count: 12 }] },
  { key: 'work_schedule_by_days', label: 'График работы', options: [{ value: 'FIVE_ON_TWO_OFF', label: '5/2', count: 36 }, { value: 'TWO_ON_TWO_OFF', label: '2/2', count: 12 }] },
  { key: 'working_hours', label: 'Рабочие часы', options: [{ value: 'HOURS_8', label: '8 часов', count: 36 }, { value: 'HOURS_4', label: '4 часа', count: 12 }] },
];
