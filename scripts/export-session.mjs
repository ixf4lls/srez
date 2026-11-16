// Run on the host: only its api-anything installation can unlock its session.
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const { loadSession } = await import(pathToFileURL(join(root, 'api-anything/dist/session.js')));
  let session = loadSession('hh');
  if (process.argv.includes('--browser-profile')) {
    const { openBrowser, closeBrowser } = await import(pathToFileURL(join(root, 'api-anything/dist/browser.js')));
    const { profileDir } = await import(pathToFileURL(join(root, 'api-anything/dist/heal.js')));
    try {
      const context = await openBrowser({ profileDir: profileDir(), headless: true });
      const cookies = (await context.cookies()).filter(c => c.domain === 'hh.ru' || c.domain.endsWith('.hh.ru'));
      session = { cookies, values: {} };
    } finally { await closeBrowser(); }
  }
  if (!session.cookies?.length) throw new Error('Сессия пуста. Завершите api-anything login hh --window (закройте окно).');
  delete session.source;
  delete session.imports;
  const dir = resolve('.runtime/host-sessions');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, 'hh.json');
  writeFileSync(`${target}.tmp`, JSON.stringify(session), { mode: 0o600 });
  renameSync(`${target}.tmp`, target);
  console.log('Сессия экспортирована для runner (локальный JSON с правами 0600).');
} catch (error) {
  console.error(`Не удалось экспортировать сессию: ${error.message}`);
  process.exitCode = 1;
}
