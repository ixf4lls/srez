import test from 'node:test';
import assert from 'node:assert/strict';
import { date, relativeDate } from './dates.ts';

const now = new Date('2026-11-09T10:00:00Z');

test('relative history dates include time today and yesterday, and inflect recent days', () => {
  assert.equal(relativeDate('2026-11-09T07:55:00Z', now), 'Сегодня, 10:55');
  assert.equal(relativeDate('2026-11-08T07:55:00Z', now), 'Вчера, 10:55');
  for (const [day, expected] of [[7, '2 дня назад'], [6, '3 дня назад'], [5, '4 дня назад'], [4, '5 дней назад'], [3, '6 дней назад']] as const) {
    assert.equal(relativeDate(`2026-11-0${day}T07:55:00Z`, now), expected);
  }
});

test('weeks start on Monday; last month uses calendar months including a year boundary', () => {
  assert.equal(relativeDate('2026-11-02T07:55:00Z', now), 'на прошлой неделе');
  assert.equal(relativeDate('2026-11-01T07:55:00Z', now), date('2026-11-01T07:55:00Z'));
  assert.equal(relativeDate('2026-10-15T07:55:00Z', now), 'в прошлом месяце');
  assert.equal(relativeDate('2025-12-10T07:55:00Z', new Date('2026-01-10T10:00:00Z')), 'в прошлом месяце');
  assert.equal(relativeDate('2025-12-31T07:55:00Z', new Date('2026-01-10T10:00:00Z')), 'на прошлой неделе');
});

test('calendar days follow Moscow midnight rather than elapsed 24-hour intervals or host timezone', () => {
  const afterMidnight = new Date('2026-11-08T21:30:00Z');
  assert.equal(relativeDate('2026-11-08T20:55:00Z', afterMidnight), 'Вчера, 23:55');
  assert.equal(relativeDate('2026-11-08T21:05:00Z', afterMidnight), 'Сегодня, 00:05');
  assert.equal(relativeDate('2026-11-07T20:55:00Z', afterMidnight), '2 дня назад');
});

test('older and future dates retain full precision; invalid dates have an explicit fallback', () => {
  assert.equal(relativeDate('2026-09-15T07:55:00Z', now), date('2026-09-15T07:55:00Z'));
  assert.equal(relativeDate('2026-11-10T07:55:00Z', now), date('2026-11-10T07:55:00Z'));
  assert.equal(relativeDate('invalid', now), 'Дата неизвестна');
  assert.equal(relativeDate('2026-11-08T07:55:00Z', new Date('invalid')), date('2026-11-08T07:55:00Z'));
  assert.match(date('2026-11-08T07:55:00Z'), /10:55/);
});
