const timeZone = 'Europe/Moscow';
const day = 86_400_000;
const absoluteFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone });
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone });
const calendarFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
const relativeFormatter = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'always' });

export const date = (value: string) => absoluteFormatter.format(new Date(value));

function calendarDate(value: Date): Date {
  const parts = calendarFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)!.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

export function relativeDate(value: string, now = new Date()): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return 'Дата неизвестна';
  if (!Number.isFinite(now.getTime())) return date(value);
  const currentDay = calendarDate(now);
  const savedDay = calendarDate(timestamp);
  const days = (currentDay.getTime() - savedDay.getTime()) / day;
  if (days < 0) return date(value);
  if (days === 0) return `Сегодня, ${timeFormatter.format(timestamp)}`;
  if (days === 1) return `Вчера, ${timeFormatter.format(timestamp)}`;
  if (days < 7) return relativeFormatter.format(-days, 'day');

  const weekStart = currentDay.getTime() - (currentDay.getUTCDay() + 6) % 7 * day;
  if (savedDay.getTime() >= weekStart - 7 * day) return 'на прошлой неделе';
  const monthStart = Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), 1);
  const previousMonthStart = Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth() - 1, 1);
  if (savedDay.getTime() >= previousMonthStart && savedDay.getTime() < monthStart) return 'в прошлом месяце';
  return date(value);
}
