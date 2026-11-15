import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const apiURL = 'http://127.0.0.1:18081';
const blockedRequests = new WeakMap<Page, string[]>();
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page, request }) => {
  await request.post(`${apiURL}/__test/reset`);
  blockedRequests.set(page, []);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5174') return route.continue();
    blockedRequests.get(page)!.push(url.href);
    return route.abort('blockedbyclient');
  });
});

test.afterEach(async ({ page, request }) => {
  expect(blockedRequests.get(page)).toEqual([]);
  expect((await (await request.get(`${apiURL}/__test/state`)).json()).unexpected).toEqual([]);
});

async function expectFittingFilterWindow(page: Page) {
  const popover = page.locator('.search-filters-popover');
  const body = page.locator('.search-filters-body');
  await expect(page.locator('.form-filter-grid select')).toHaveCount(8);
  await expect.poll(() => popover.evaluate(element => {
    const windowRect = element.getBoundingClientRect();
    const header = element.querySelector('[data-slot="popover-header"]')!.getBoundingClientRect();
    const content = element.querySelector('.search-filters-body')!;
    const contentRect = content.getBoundingClientRect();
    const footer = element.querySelector('.popover-actions')!.getBoundingClientRect();
    const naturalHeight = windowRect.height - contentRect.height + content.scrollHeight;
    const cap = innerHeight - 32;
    const correctHeight = naturalHeight <= cap + 1
      ? content.scrollHeight <= content.clientHeight + 1
      : windowRect.height >= cap - 1;
    return {
      windowFits: windowRect.top >= 15 && windowRect.bottom <= innerHeight - 15,
      sectionsFit: header.top >= windowRect.top && footer.bottom <= windowRect.bottom
        && header.bottom <= contentRect.top + 1 && contentRect.bottom <= footer.top + 1,
      bodyUsable: contentRect.height >= Math.min(96, cap - header.height - footer.height - 2),
      correctHeight,
      geometry: { top: windowRect.top, bottom: windowRect.bottom, height: windowRect.height, naturalHeight, cap, body: contentRect.height },
    };
  })).toMatchObject({ windowFits: true, sectionsFit: true, bodyUsable: true, correctHeight: true });
  await body.hover();
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  const last = page.locator('.form-filter-grid select').last();
  const lastRect = await last.boundingBox();
  const bodyRect = await body.boundingBox();
  expect(lastRect!.y).toBeGreaterThanOrEqual(bodyRect!.y - 1);
  expect(lastRect!.y + lastRect!.height).toBeLessThanOrEqual(bodyRect!.y + bodyRect!.height + 1);
  await last.selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Готово', exact: true })).toBeInViewport({ ratio: 1 });
}

test('fits natural filter content and keeps every field reachable at short viewport heights', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 }, { width: 1280, height: 400 },
    { width: 390, height: 600 }, { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: /^Фильтры/ }).click();
    await expectFittingFilterWindow(page);
  }
});

test('recalculates filter height after resize and reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  await expectFittingFilterWindow(page);
  await page.setViewportSize({ width: 390, height: 600 });
  await expectFittingFilterWindow(page);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  await expectFittingFilterWindow(page);
});
