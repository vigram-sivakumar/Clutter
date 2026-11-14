import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { server } from '../serve.mjs';
const app = await server(0);
let browser;
const results = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args:
      process.platform === 'linux'
        ? ['--no-sandbox', '--no-zygote', '--single-process']
        : [],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of ['/', '/origin', '/control']) {
    await page.goto(`http://127.0.0.1:${app.address().port}${route}`);
    await page.waitForFunction(
      () => window.lab || window.originLab || window.controlTrace
    );
    await page.evaluate(readFileSync('native-macos/capture.js', 'utf8'));
    const before = await page.evaluate(() => r07Native.capture());
    assert.ok(before.userAgent);
    assert.equal(before.ready, route !== '/control');
    const quick = await page.evaluate(() => r07Native.quick());
    if (route === '/control') assert.equal(quick.results[0].status, 'blocked');
    else {
      assert.equal(quick.results.length, 4);
      assert.ok(
        quick.results.every((r) => r.status === 'pass'),
        JSON.stringify(quick)
      );
    }
    const field = page.locator('.ProseMirror').first();
    await field.click();
    await page.keyboard.type('synthetic');
    await page.evaluate(() => {
      for (let i = 0; i < 300; i++)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });
    const capture = await page.evaluate(() => r07Native.capture());
    assert.ok(capture.events.length > 0);
    assert.ok(!capture.events.some((e) => 'data' in e));
    assert.ok(capture.events.every((e) => e.key !== 's' && e.key !== 'x'));
    assert.equal(capture.events.length, 256);
    assert.ok(
      capture.candidateTrace.every((e) => !('nativeText' in e) && e.key !== 's')
    );
    results.push({
      route,
      quick,
      ready: capture.ready,
      eventCount: capture.events.length,
      status: 'pass',
      scope:
        'Chromium helper validation only; no Swift/WKWebView/native acceptance',
    });
  }
  assert.deepEqual(errors, []);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/native-helper-results.json',
    JSON.stringify(
      { runtime: await browser.version(), results, nativeMacOS: 'not-run' },
      null,
      2
    ) + '\n'
  );
  console.log(
    '3 routes passed capture/fixture helper validation; native Mac remains not-run.'
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
