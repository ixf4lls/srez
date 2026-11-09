import {specializationLabels} from './specializationLabels';

// Display translations leave source vacancy text and submitted filter IDs intact.
const labels: Record<string, string> = {
  'География': 'Location',
  'Регион': 'Region',
  'Формат работы': 'Work format',
  'Способ оформления': 'Engagement type',
  'Занятость': 'Employment',
  'Опыт работы': 'Experience',
  'Образование': 'Education',
  'Специализация': 'Specialization',
  'График работы': 'Work schedule',
  'Рабочие часы': 'Working hours',
  'Грейд': 'Seniority',
  'Офис': 'On-site',
  'Удалённо': 'Remote',
  'Гибрид': 'Hybrid',
  'Разъездной': 'Field-based',
  'ТК РФ': 'Employment contract',
  'ИП': 'Sole proprietor',
  'Самозанятость': 'Self-employed',
  'ГПХ': 'Civil contract',
  'Не указан': 'Not specified',
  'Обязательно': 'Required',
  'Будет плюсом': 'Nice to have',
  'Микросервисная архитектура': 'Microservice architecture',
  'Распределённые системы': 'Distributed systems',
  'Алгоритмы и структуры данных': 'Algorithms and data structures',
  'Автоматизированное тестирование': 'Automated testing',
  'Английский язык': 'English',
  'Работа в команде': 'Teamwork',
  'Коммуникация': 'Communication',
  'Высоконагруженные системы': 'High-load systems',
  'ООП и принципы проектирования': 'OOP and design principles',
  'Многопоточность и конкурентность': 'Concurrency',
  'Работа с базами данных': 'Database experience',
  'Профильное образование': 'Relevant degree',
  '₽ · в месяц · на руки (нормализовано)': 'RUB per month, net (normalized)',
  'Россия': 'Russia',
  'Москва': 'Moscow',
  'Санкт-Петербург': 'Saint Petersburg',
  'Казахстан': 'Kazakhstan',
  'Московская область': 'Moscow Oblast',
  'Узбекистан': 'Uzbekistan',
  'Алматы': 'Almaty',
  'Ташкент': 'Tashkent',
  'Беларусь': 'Belarus',
  'Минск': 'Minsk',
  'Свердловская область': 'Sverdlovsk Oblast',
  'Краснодарский край': 'Krasnodar Krai',
  'Республика Татарстан': 'Republic of Tatarstan',
  'Новосибирская область': 'Novosibirsk Oblast',
  'Астана': 'Astana',
  'Нижегородская область': 'Nizhny Novgorod Oblast',
  'Другие регионы': 'Other regions',
  'Ростовская область': 'Rostov Oblast',
  'Республика Башкортостан': 'Republic of Bashkortostan',
  'Пермский край': 'Perm Krai',
  'Славгород (Алтайский край)': 'Slavgorod (Altai Krai)',
  'От 3 до 6 лет': '3–6 years',
  'От 1 года до 3 лет': '1–3 years',
  'Более 6 лет': 'Over 6 years',
  'Нет опыта': 'No experience',
  '3–6 лет': '3–6 years',
  '1–3 года': '1–3 years',
  'более 6 лет': 'Over 6 years',
  'Без опыта': 'No experience',
  'без опыта': 'No experience',
  'На месте работодателя': 'On-site',
  'Полная занятость': 'Full-time',
  'Подработка': 'Part-time project work',
  'Частичная занятость': 'Part-time',
  'Вахта': 'Rotational shift',
  'Не требуется или не указано': 'Not required or unspecified',
  'Высшее': 'Higher education',
  'Среднее профессиональное': 'Vocational education',
  'Свободный': 'Flexible',
  'По выходным': 'Weekends',
  'По договорённости': 'By agreement',
  'По договоренности': 'By agreement',
  ...specializationLabels,
};

export function displayLabel(value: string): string {
  const normalized = value.trim();
  const exact = labels[normalized];
  if (exact) return exact;
  const hours = normalized.match(/^(\d+)\s+(?:час|часа|часов)$/);
  if (hours) return `${hours[1]} hours`;
  const parts = normalized.split(' / ');
  if (parts.length > 1 && parts.every(part => labels[part])) {
    return parts.map(part => labels[part]).join(' / ');
  }
  return value;
}

const messages: Record<string, string> = {
  'Сбор остановлен. Собранные данные сохранены.': 'Collection stopped. Collected data was saved.',
  'Сбор остановлен. Можно продолжить позже.': 'Collection stopped. You can resume later.',
  'Источник временно недоступен. Данные сохранены.': 'The source is temporarily unavailable. Your data was saved.',
  'Нужно восстановить доступ к hh.ru.': 'Reconnect to hh.ru to continue.',
  'hh.ru ограничил частоту запросов. Повторите позже.': 'hh.ru has limited requests. Try again later.',
  'Сбор прерван. Сохранённые данные доступны.': 'Collection was interrupted. Saved data remains available.',
  'Собираем ссылки на вакансии': 'Collecting vacancy links',
  'Загружаем описания вакансий': 'Loading vacancy descriptions',
  'Анализируем навыки, требования и конкуренцию': 'Analyzing skills, requirements and competition',
  'Анализ готов': 'Analysis complete',
  'Все найденные вакансии уже разобраны в других анализах': 'All found vacancies were already processed in other analyses',
  'Анализ готов по доступным данным': 'Analysis complete with available data',
  'Ожидаем начала сбора': 'Waiting to start collection',
  'Продолжаем сбор сохранённого анализа': 'Resuming the saved analysis',
  'Ожидаем актуализации данных вакансий': 'Waiting to refresh vacancy data',
  'Приложение перезапущено. Можно продолжить сбор.': 'The app restarted. You can resume collection.',
  'Сбор остановлен при удалении': 'Collection stopped when the analysis was deleted',
  'Вакансия удалена или недоступна': 'The vacancy was removed or is unavailable',
  'hh.ru не вернул полное описание': 'hh.ru did not return the full description',
  'hh.ru повторил страницу выдачи. Анализ охватывает только собранные уникальные вакансии.': 'hh.ru repeated a results page. This analysis covers only unique vacancies collected.',
  'Достигнуто ограничение известной операции hh.ru: 40 страниц. Для полного охвата сузьте запрос или фильтры.': 'The hh.ru operation reached its 40-page limit. Narrow the query or filters for better coverage.',
  'Проверьте формат запроса': 'Check the request format.',
  'Ожидался один JSON-объект': 'The request must contain one JSON object.',
  'Недопустимый источник запроса': 'The request origin is not allowed.',
  'База данных недоступна': 'The database is unavailable.',
  'Не удалось загрузить фильтры hh.ru': 'Could not load hh.ru filters.',
  'Не удалось прочитать историю': 'Could not load analysis history.',
  'Выберите от 1 до 1000 анализов': 'Select between 1 and 1,000 analyses.',
  'Некорректный идентификатор анализа': 'Invalid analysis ID.',
  'Не удалось удалить анализы': 'Could not delete the analyses.',
  'Не удалось восстановить анализы': 'Could not restore the analyses.',
  'Сначала подтвердите поисковый запрос': 'Confirm the search query first.',
  'Исключения слишком длинные': 'The excluded terms are too long.',
  'Недопустимый фильтр': 'Invalid filter.',
  'Не удалось создать анализ': 'Could not create the analysis.',
  'Название поиска должно быть не длиннее 180 символов': 'The search title must be 180 characters or fewer.',
  'Не удалось сохранить анализ': 'Could not save the analysis.',
  'Анализ не найден': 'Analysis not found.',
  'Не удалось прочитать анализ': 'Could not load the analysis.',
  'Не удалось прочитать вакансии': 'Could not load vacancies.',
  'Анализ уже выполняется': 'This analysis is already running.',
  'Анализ уже завершён. Запустите новый поиск для обновления.': 'This analysis is complete. Start a new search to update it.',
  'Не удалось продолжить анализ': 'Could not resume the analysis.',
  'Не удалось подготовить обновление вакансий': 'Could not prepare the vacancy refresh.',
  'Не удалось сохранить обновление': 'Could not save the refresh.',
  'Не удалось подготовить запрос текущих курсов': 'Could not prepare the current exchange-rate request.',
  'Текущий курс валют недоступен': 'The current exchange rate is unavailable.',
  'Введите запрос длиной от 1 до 1500 символов': 'Enter a query of 1 to 1,500 characters.',
  'Неизвестный режим релевантности': 'Unknown relevance mode.',
  'Запрос должен содержать от 1 до 3000 символов': 'The query must contain 1 to 3,000 characters.',
  'Проверьте закрывающие скобки запроса': 'Check the closing parentheses in the query.',
  'Проверьте парность скобок и кавычек': 'Check matching parentheses and quotes.',
  'Сессия hh.ru не найдена. Выполните на компьютере: api-anything login hh --window': 'No hh.ru session was found. Run api-anything login hh --window on this computer.',
  'Завершите вход и повторите действие.': 'Finish signing in, then try again.',
  'hh.ru не вернул список фильтров. Доступные варианты не будут подменены вымышленными.': 'hh.ru did not return its filters. No substitute options are shown.',
  'Ошибка интеграции api-anything. Проверьте журнал runner.': 'The api-anything integration failed. Check the runner log.',
  'Не удалось восстановить полный ответ api-anything': 'Could not restore the full api-anything response.',
  'анализ удалён': 'The analysis was deleted.',
};

const dynamicMessages: [RegExp, (...parts: string[]) => string][] = [
  [/^Собираем ссылки · (\d+) вакансий · страница (\d+)$/, (_, count, page) => `Collecting links · ${count} vacancies · page ${page}`],
  [/^Загружаем описания · (\d+) из (\d+)$/, (_, count, total) => `Loading descriptions · ${count} of ${total}`],
  [/^Выдача hh\.ru: (\d+), собрано уникальных: (\d+)\. Статистика рассчитана по загруженным вакансиям\.$/, (_, found, collected) => `hh.ru results: ${found}; unique vacancies collected: ${collected}. Statistics use loaded vacancies.`],
  [/^api-anything обновил операцию: (.+)$/, (_, changes) => `api-anything refreshed the operation: ${changes}`],
];

export function displayAppMessage(value: string): string {
  const source = value.trim().replace(/^\w+Error:\s*/, '');
  if (!source) return '';
  if (messages[source]) return messages[source];
  for (const [pattern, translate] of dynamicMessages) {
    const match = source.match(pattern);
    if (match) return translate(...match);
  }
  return /[А-Яа-яЁё]/.test(source)
    ? 'The source returned an error. Check the connection and try again.'
    : source;
}
