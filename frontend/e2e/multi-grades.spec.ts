import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.skip(process.env.SREZ_GRADES_E2E !== '1', 'Run with playwright.grades.config.ts and its synthetic report API');

const origin = 'http://127.0.0.1:5187';
const analysisURL = '/analyses/000000000000000000000123';
const externalRequests = new WeakMap<Page, string[]>();
const browserErrors = new WeakMap<Page, string[]>();
const point = (chart: Locator, id: string, grade: string) => chart.locator(`[role="button"][data-vacancy-id="${id}"][data-grade="${grade}"]`);

async function choose(point: Locator) {
  await point.focus();
  await point.press('Enter');
}

async function closeSheet(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  externalRequests.set(page, []);
  browserErrors.set(page, []);
  page.on('pageerror', error => browserErrors.get(page)!.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /same key|unique.*key/i.test(message.text())) browserErrors.get(page)!.push(message.text());
  });
  await page.context().route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.get(page)!.push(route.request().url());
    return route.abort('blockedbyclient');
  });
});

test.afterEach(async ({ page, request }) => {
  expect(externalRequests.get(page)).toEqual([]);
  expect(browserErrors.get(page)).toEqual([]);
  const state = await (await request.get('http://127.0.0.1:18087/__test/state')).json();
  expect(state.unexpected).toEqual([]);
  expect(state.searches).toEqual([]);
});

test('renders each compound vacancy once in every member grade in both charts and expanded views', async ({ page }, testInfo) => {
  await page.goto(analysisURL);
  await expect(page.getByTestId('vacancy-count')).toHaveText('6');
  const salary = page.getByTestId('salary-chart');
  const responses = page.getByTestId('response-chart');
  for (const chart of [salary, responses]) {
    await expect(chart.locator('[role="button"][data-vacancy-id]')).toHaveCount(9);
    expect(await chart.locator('.grade-band').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-grade')))).toEqual(['Junior', 'Middle', 'Senior']);
    for (const [id, grades] of [['1', ['Middle', 'Senior']], ['4', ['Junior', 'Middle', 'Senior']], ['5', ['Middle', 'Senior']]] as const) {
      for (const grade of grades) await expect(point(chart, id, grade)).toHaveCount(1);
    }
    await expect(chart.locator('[data-grade*="/"]')).toHaveCount(0);
  }
  await expect(responses.locator('.chart-stat strong')).toHaveText('20');
  await expect(salary.locator('.chart-footer')).toContainText('Сопоставимы 5 из 6 вакансий');
  await expect(responses.locator('.chart-footer')).toContainText('Данные по 5 из 6 вакансий');

  const breakdown = page.getByTestId('dimension-grade');
  for (const [grade, count, percent] of [['Junior', '1', '16,7%'], ['Middle', '4', '66,7%'], ['Senior', '4', '66,7%'], ['Не указан', '1', '16,7%']]) {
    const row = breakdown.locator('.breakdown-row').filter({ has: page.locator('.breakdown-label', { hasText: new RegExp(`^${grade}$`) }) });
    await expect(row.locator('.breakdown-values > span')).toHaveText(count);
    await expect(row.locator('.breakdown-values strong')).toHaveText(percent);
  }
  await expect(breakdown).not.toContainText('/');

  for (const chart of [salary, responses]) {
    for (const grade of ['Middle', 'Senior']) {
      await choose(point(chart, '1', grade));
      await expect(page.getByRole('dialog').locator('.vacancy-detail h2')).toHaveText('[Тест] Два грейда');
      await expect(page.getByRole('dialog').locator('.vacancy-detail-footer a')).toHaveAttribute('href', 'https://example.invalid/vacancy/synthetic');
      await closeSheet(page);
    }
  }

  for (const name of ['зарплат', 'откликов']) {
    await page.getByRole('button', { name: `Развернуть график ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[role="button"][data-vacancy-id]')).toHaveCount(9);
    for (const grade of ['Middle', 'Senior']) await expect(point(dialog, '1', grade)).toHaveCount(1);
    await expect(dialog.locator('[data-grade*="/"]')).toHaveCount(0);
    await dialog.getByRole('tab', { name: 'Данные', exact: true }).click();
    await expect(dialog.locator('tbody tr')).toHaveCount(5);
    await expect(dialog.getByRole('tab', { name: 'Вакансии · 5', exact: true })).toBeVisible();
    await closeSheet(page);
  }
  await page.screenshot({ path: testInfo.outputPath('multi-grade-charts.png'), fullPage: true, animations: 'disabled' });
});

test('filters by member grades with OR and other dimensions with AND, preserving unique source vacancies', async ({ page }) => {
  await page.goto(analysisURL);
  await page.getByRole('button', { name: 'Источники: Грейд', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Middle', exact: true }).click();
  await expect(dialog.locator('.vacancy-list-row')).toHaveCount(4);
  await expect(dialog.locator('.vacancy-list-row').filter({ hasText: '[Тест] Два грейда' })).toHaveCount(1);
  await closeSheet(page);

  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  const filter = page.getByRole('dialog');
  const grades = filter.getByTestId('dimension-grade');
  await grades.getByRole('button', { name: /^Middle/ }).click();
  await grades.getByRole('button', { name: /^Senior/ }).click();
  await closeSheet(page);
  await expect(page.getByTestId('vacancy-count')).toHaveText('5');
  await page.reload();
  await expect(page.getByTestId('vacancy-count')).toHaveText('5');
  await expect(page.getByRole('button', { name: 'Убрать фильтр Грейд: Middle', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать фильтр Грейд: Senior', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('dialog').getByTestId('dimension-city').getByRole('button', { name: /^Москва/ }).click();
  await closeSheet(page);
  await expect(page.getByTestId('vacancy-count')).toHaveText('3');
  await expect(page.getByTestId('salary-chart').locator('[role="button"][data-vacancy-id]')).toHaveCount(5);
  await expect(page.getByTestId('response-chart').locator('[role="button"][data-vacancy-id]')).toHaveCount(5);
  await page.getByRole('tab', { name: /^Вакансии(?:\s*3)?$/ }).click();
  await expect(page.locator('.vacancy-list-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.getByTestId('vacancy-count')).toHaveText('6');
});

test('shows unknown grades once and recovers a failed vacancy load without real services', async ({ page }) => {
  let fail = true;
  await page.route('**/api/analyses/*/vacancies', route => fail
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Тест: вакансии временно недоступны' }) })
    : route.continue());
  await page.goto(analysisURL);
  await expect(page.getByRole('alert')).toContainText('The source returned an error. Check the connection and try again.');
  await expect(page.getByTestId('salary-chart')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByTestId('vacancy-count')).toHaveText('6');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('dialog').getByTestId('dimension-grade').getByRole('button', { name: /^Не указан/ }).click();
  await closeSheet(page);
  await expect(page.getByTestId('vacancy-count')).toHaveText('1');
  await expect(page.getByText('Нет данных об откликах', { exact: true })).toBeVisible();
  await expect(page.getByText('Нет сопоставимых зарплат', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /^Вакансии(?:\s*1)?$/ }).click();
  await expect(page.locator('.vacancy-list-row')).toHaveCount(1);
  await expect(page.locator('.vacancy-list-row')).toContainText('[Тест] Без грейда');
});

test('restores legacy combined grade view links as individual grade selections', async ({ page }) => {
  const view = encodeURIComponent(JSON.stringify({ grade: ['Middle / Senior'] }));
  await page.goto(`${analysisURL}?view=${view}`);
  for (let load = 0; load < 2; load++) {
    await expect(page.getByTestId('vacancy-count')).toHaveText('5');
    for (const grade of ['Middle', 'Senior']) {
      await expect(page.getByRole('button', { name: `Убрать фильтр Грейд: ${grade}`, exact: true })).toBeVisible();
    }
    expect(JSON.parse(new URL(page.url()).searchParams.get('view')!)).toEqual({ grade: ['Middle', 'Senior'] });
    if (load === 0) await page.reload();
  }
});
