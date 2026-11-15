import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const apiURL = 'http://127.0.0.1:18081';
const exclusions = 'стажёр, продажи, руководитель проекта, СТАЖЁР';
const exclusionsLabel = '«стажёр» · «продажи» · «руководитель проекта»';
const exclusionClause = 'NOT (NAME:"стажёр" OR DESCRIPTION:"стажёр" OR NAME:"продажи" OR DESCRIPTION:"продажи" OR NAME:"руководитель проекта" OR DESCRIPTION:"руководитель проекта")';
type State = { analyses: { id: string; query: string; excludeWords: string; expression: string }[]; searches: Record<string, string>[]; unexpected: string[] };
const externalRequests = new WeakMap<Page, string[]>();
const state = async (request: APIRequestContext): Promise<State> => (await request.get(`${apiURL}/__test/state`)).json();

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  return page.getByLabel('Исключить слова', { exact: true });
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${apiURL}/__test/reset`);
  externalRequests.set(page, []);
  // Unmocked network dependencies fail instead of using real services.
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5174') return route.continue();
    externalRequests.get(page)!.push(url.href);
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
});

test.afterEach(async ({ page, request }) => {
  expect(externalRequests.get(page)).toEqual([]);
  expect((await state(request)).unexpected).toEqual([]);
});

test('optimizes, confirms, saves and restores exclusions through the real API', async ({ page, request }, testInfo) => {
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python PostgreSQL');
  await (await openFilters(page)).fill(exclusions);
  const region = page.locator('.form-filter-grid select').first();
  await expect(region).toBeVisible();
  await region.selectOption({ index: 1 });
  const fieldBounds = await page.getByLabel('Исключить слова', { exact: true }).boundingBox();
  expect(fieldBounds!.x).toBeGreaterThanOrEqual(0);
  expect(fieldBounds!.x + fieldBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('search-filters.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Фильтры/ })).toHaveText('Фильтры2');
  await expect(page.getByRole('button', { name: 'Убрать фильтр Исключить слова', exact: true })).toHaveText(`Исключить: ${exclusionsLabel}`);
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  const expression = page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true });
  await expect(expression).toHaveValue(new RegExp(`^\\(NAME:\\(python OR питон\\) AND \\(postgresql OR postgres\\)\\) AND NOT`));
  const prepared = await expression.inputValue();
  expect(prepared).toContain(exclusionClause);
  expect(prepared.match(/"стажёр"/g)).toHaveLength(2);
  await expect(page.getByRole('dialog')).toContainText(exclusionsLabel);
  await page.getByRole('button', { name: 'Подтвердить и запустить', exact: true }).click();
  await expect(page).toHaveURL(/\/analyses\/[a-f0-9]{24}$/);
  await expect.poll(async () => (await state(request)).searches.map(args => args.text)).toContain(prepared);
  const saved = (await state(request)).analyses[0];
  expect(saved.excludeWords).toBe(exclusions);
  expect(saved.expression).toBe(prepared);
  await page.getByRole('button', { name: 'Изменить запрос', exact: true }).click();
  await expect(page.getByLabel('Какую должность или технологию исследуем?')).toHaveValue('Python PostgreSQL');
  await expect(await openFilters(page)).toHaveValue(exclusions);
});

test('applies exclusions to every OR branch after manual editing', async ({ page, request }) => {
  await page.getByRole('tab', { name: 'Во всём тексте', exact: true }).click();
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python OR Java');
  await (await openFilters(page)).fill('junior, холодные звонки');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  const expression = page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true });
  await expect(expression).toHaveValue(/^\(Python OR Java\) AND NOT /);
  await expression.fill('NAME:python OR NAME:java');
  await page.getByRole('button', { name: 'Подтвердить и запустить', exact: true }).click();
  await expect(page).toHaveURL(/\/analyses\/[a-f0-9]{24}$/);
  const expected = '(NAME:python OR NAME:java) AND NOT (NAME:"junior" OR DESCRIPTION:"junior" OR NAME:"холодные звонки" OR DESCRIPTION:"холодные звонки")';
  await expect.poll(async () => (await state(request)).searches.map(args => args.text)).toContain(expected);
  expect((await state(request)).analyses[0].expression).toBe(expected);
});

test('removes and resets exclusions without changing the query', async ({ page, request }) => {
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Go');
  await (await openFilters(page)).fill('junior');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Убрать фильтр Исключить слова', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Фильтры/ })).toHaveText('Фильтры');
  await expect(await openFilters(page)).toHaveValue('');
  await page.getByLabel('Исключить слова', { exact: true }).fill('стажёр');
  await page.locator('.form-filter-grid select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.getByLabel('Исключить слова', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Сбросить', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true })).not.toHaveValue(/NOT/);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByLabel('Какую должность или технологию исследуем?')).toHaveValue('Go');
  expect((await state(request)).analyses).toHaveLength(0);
});

test('keeps exclusions available when HH filters fail to load', async ({ page, request }) => {
  await request.post(`${apiURL}/__test/scenario`, { data: { filterError: true } });
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python');
  const field = await openFilters(page);
  await expect(page.getByText('Could not load hh.ru filters.', { exact: false })).toBeVisible();
  await field.fill('junior');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true })).toHaveValue(/NOT \(NAME:"junior" OR DESCRIPTION:"junior"\)/);
});

test('retains the expression and exclusions when saving fails', async ({ page, request }) => {
  await request.post(`${apiURL}/__test/scenario`, { data: { failSave: true } });
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python');
  await (await openFilters(page)).fill('junior');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  const expression = page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true });
  await expect(expression).toHaveValue(/NOT \(NAME:"junior" OR DESCRIPTION:"junior"\)/);
  const prepared = await expression.inputValue();
  await page.getByRole('button', { name: 'Подтвердить и запустить', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Could not save the analysis.');
  await expect(expression).toHaveValue(prepared);
  expect((await state(request)).analyses).toHaveLength(0);
  expect((await state(request)).searches).toHaveLength(0);
  await request.post(`${apiURL}/__test/scenario`, { data: { failSave: false } });
  await page.getByRole('button', { name: 'Подтвердить и запустить', exact: true }).click();
  await expect(page).toHaveURL(/\/analyses\/[a-f0-9]{24}$/);
  expect((await state(request)).analyses[0].excludeWords).toBe('junior');
});

test('shows an error for an oversized generated expression and preserves the field', async ({ page, request }) => {
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python');
  await (await openFilters(page)).fill('я'.repeat(800));
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The query must contain 1 to 3,000 characters.');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(await openFilters(page)).toHaveValue('я'.repeat(800));
  expect((await state(request)).analyses).toHaveLength(0);
  expect((await state(request)).searches).toHaveLength(0);
});

test('applies normalized exclusion items only after Done and discards unconfirmed edits', async ({ page, request }) => {
  const chip = page.getByRole('button', { name: 'Убрать фильтр Исключить слова', exact: true });
  const filterButton = page.getByRole('button', { name: /^Фильтры/ });
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python');
  await (await openFilters(page)).fill('стажёр; "холодные   звонки", СТАЖЁР');
  await expect(chip).toHaveCount(0);
  await expect(filterButton).toHaveText('Фильтры');
  await page.keyboard.press('Escape');
  await expect(chip).toHaveCount(0);
  await expect(await openFilters(page)).toHaveValue('');
  await page.getByLabel('Исключить слова', { exact: true }).fill('стажёр; "холодные   звонки", СТАЖЁР');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(chip).toHaveText('Исключить: «стажёр» · «холодные звонки»');
  await expect(filterButton).toHaveText('Фильтры1');
  await (await openFilters(page)).fill('продажи');
  await expect(chip).toHaveText('Исключить: «стажёр» · «холодные звонки»');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  const expression = page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true });
  await expect(expression).toHaveValue(/NAME:"стажёр" OR DESCRIPTION:"стажёр" OR NAME:"холодные звонки"/);
  await expect(expression).not.toHaveValue(/продажи/);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(await openFilters(page)).toHaveValue('стажёр; "холодные   звонки", СТАЖЁР');
  await page.getByLabel('Исключить слова', { exact: true }).fill('продажи, junior');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(chip).toHaveText('Исключить: «продажи» · «junior»');
  await openFilters(page);
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(chip).toHaveText('Исключить: «продажи» · «junior»');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(chip).toHaveCount(0);
  expect((await state(request)).analyses).toHaveLength(0);
});

test('keeps all eight HH filters accessible in a window that fits the viewport', async ({ page, request }, testInfo) => {
  await page.getByLabel('Какую должность или технологию исследуем?').fill('Python');
  await (await openFilters(page)).fill('junior');
  const groups = page.locator('.form-filter-grid select');
  await expect(groups).toHaveCount(8);
  for (const label of ['Регион', 'Опыт работы', 'Формат работы', 'Тип оформления', 'Образование', 'Специализация', 'График работы', 'Рабочие часы']) {
    await expect(page.locator('.form-filter-grid .form-field').filter({ hasText: label })).toHaveCount(1);
  }
  const body = page.locator('.search-filters-body');
  const dimensions = await body.evaluate(element => ({
    height: element.clientHeight, contentHeight: element.scrollHeight, overflow: getComputedStyle(element).overflowY,
  }));
  expect(dimensions.overflow).toBe('auto');
  expect(dimensions.height).toBeLessThanOrEqual(page.viewportSize()!.height - 32);
  const hours = groups.last();
  await hours.scrollIntoViewIfNeeded();
  await hours.selectOption({ index: 1 });
  if (dimensions.contentHeight > dimensions.height) {
    await body.hover();
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  }
  const lastFieldBounds = await hours.boundingBox();
  const bodyBounds = await body.boundingBox();
  expect(lastFieldBounds!.y + lastFieldBounds!.height).toBeLessThanOrEqual(bodyBounds!.y + bodyBounds!.height);
  await expect(page.getByRole('button', { name: 'Готово', exact: true })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Фильтры поиска', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('all-filters-scrolled.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Выражение для hh.ru', exact: true })).toHaveValue(/NOT/);
  await page.getByRole('button', { name: 'Подтвердить и запустить', exact: true }).click();
  await expect(page).toHaveURL(/\/analyses\/[a-f0-9]{24}$/);
  await expect.poll(async () => (await state(request)).searches.map(args => args.working_hours)).toContain('HOURS_8');
});
