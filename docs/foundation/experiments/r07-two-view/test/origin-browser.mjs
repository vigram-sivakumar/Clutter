import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { server } from '../serve.mjs';
mkdirSync('artifacts', { recursive: true });
const app = await server(0);
let browser;
const results = [],
  errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args:
      process.platform === 'linux'
        ? [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--single-process',
          ]
        : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${app.address().port}/origin`);
  await page.waitForFunction(() => window.originLab);
  const snap = () => page.evaluate(() => originLab.snapshot());
  const first = (s) =>
    s.doc.content[0].content?.map((n) => n.text ?? '').join('') ?? '';
  const select = async (id, text, from = 0, to = from) =>
    page.evaluate(
      ({ id, text, from, to }) => originLab.select(id, text, from, to),
      { id, text, from, to }
    );
  const key = (chord) => page.keyboard.press(chord);
  const check = async (id, title, body) => {
    await page.evaluate(() => originLab.reset());
    try {
      await body();
      const s = await snap();
      assert.deepEqual(s.contexts.A.doc, s.doc);
      assert.deepEqual(s.contexts.B.doc, s.doc);
      results.push({ id, title, status: 'pass', first: first(s) });
    } catch (e) {
      results.push({
        id,
        title,
        status: 'fail',
        error: e.message,
        snapshot: await snap(),
      });
      await page.screenshot({
        path: `artifacts/${id}-failure.png`,
        fullPage: true,
      });
    }
  };
  await check(
    'OH-01',
    'batched own insertion undo preserves nested foreign text and redo restores own text',
    async () => {
      await select('A', 'Alpha');
      await page.keyboard.insertText('abcd');
      await select('B', 'abcd', 2);
      await page.keyboard.insertText('FOREIGN');
      assert.equal(first(await snap()), 'abFOREIGNcdAlpha beta');
      await select('A', 'Alpha');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'FOREIGNAlpha beta');
      await key('ControlOrMeta+Shift+z');
      assert.equal(first(await snap()), 'abFOREIGNcdAlpha beta');
      await select('B', 'FOREIGN');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'abcdAlpha beta');
    }
  );
  await check(
    'OH-02',
    'granular typing has equivalent origin-safe undo',
    async () => {
      await select('A', 'Alpha');
      await page.keyboard.type('abcd');
      await select('B', 'abcd', 2);
      await page.keyboard.type('FOREIGN');
      await select('A', 'Alpha');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'FOREIGNAlpha beta');
    }
  );
  await check('OH-03', 'disjoint edits and independent undo/redo', async () => {
    await select('A', 'Alpha');
    await page.keyboard.insertText('A-');
    await select('B', 'Gamma');
    await page.keyboard.insertText('B-');
    await select('A', 'Alpha');
    await key('ControlOrMeta+z');
    assert.equal(first(await snap()), 'Alpha beta');
    assert.match(JSON.stringify((await snap()).doc), /B-Gamma/);
    await key('ControlOrMeta+Shift+z');
    assert.equal(first(await snap()), 'A-Alpha beta');
  });
  await check(
    'OH-04',
    'foreign formatting is not overwritten by another origin undo',
    async () => {
      await select('A', 'Alpha');
      await page.keyboard.insertText('own');
      await select('B', 'beta', 0, 4);
      await key('ControlOrMeta+b');
      await select('A', 'Alpha');
      await key('ControlOrMeta+z');
      const s = await snap();
      assert.equal(first(s), 'Alpha beta');
      assert.deepEqual(
        s.doc.content[0].content.find((n) => n.text === 'beta').marks,
        [{ type: 'strong' }]
      );
    }
  );
  await check(
    'OH-05',
    'same-position paused edits converge without duplicate text',
    async () => {
      await page.evaluate(() => originLab.pause('B'));
      await select('B', 'Alpha');
      await page.keyboard.insertText('B-');
      await select('A', 'Alpha');
      await page.keyboard.insertText('A-');
      await page.evaluate(() => originLab.resume('B'));
      assert.ok(
        ['A-B-Alpha beta', 'B-A-Alpha beta'].includes(first(await snap()))
      );
      await select('A', 'Alpha');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'B-Alpha beta');
    }
  );
  await check(
    'OH-06',
    'backward text selection replacement is undoable',
    async () => {
      await select('A', 'beta', 4, 0);
      await page.keyboard.insertText('new');
      assert.equal(first(await snap()), 'Alpha new');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'Alpha beta');
    }
  );
  await check(
    'OH-07',
    'table foreign cell edit survives local undo',
    async () => {
      await select('A', 'One');
      await page.keyboard.insertText('A-');
      await select('B', 'Four');
      await page.keyboard.insertText('B-');
      await select('A', 'One');
      await key('ControlOrMeta+z');
      assert.equal(
        await page.locator('#origin-a td').first().innerText(),
        'One'
      );
      assert.equal(
        await page.locator('#origin-b td').last().innerText(),
        'B-Four'
      );
    }
  );
  await check(
    'OH-08',
    'immediate click End Tab follows the same selection adapter',
    async () => {
      await page.locator('#origin-a td').last().click();
      await key('End');
      await key('Tab');
      await page.keyboard.insertText('NEW');
      assert.equal(await page.locator('#origin-a tr').count(), 3);
      assert.equal(
        await page
          .locator('#origin-a tr')
          .last()
          .locator('td')
          .first()
          .innerText(),
        'NEW'
      );
    }
  );
  await check(
    'OH-09',
    'explicit grouping boundary preserves earlier own edit',
    async () => {
      await select('A', 'Alpha');
      await page.keyboard.insertText('first');
      await page.evaluate(() => originLab.boundary('A'));
      await select('A', 'Alpha');
      await page.keyboard.insertText('second');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), 'firstAlpha beta');
    }
  );
  await check(
    'OH-10',
    'Unicode foreign insertion survives undo of the surrounding batched text',
    async () => {
      await select('A', 'Alpha');
      await page.keyboard.insertText('abcd');
      await select('B', 'abcd', 2);
      await page.keyboard.insertText('👩🏽‍💻');
      await select('A', 'Alpha');
      await key('ControlOrMeta+z');
      assert.equal(first(await snap()), '👩🏽‍💻Alpha beta');
      await key('ControlOrMeta+Shift+z');
      assert.equal(first(await snap()), 'ab👩🏽‍💻cdAlpha beta');
    }
  );
  await check(
    'OH-11',
    'redo of replacement preserves foreign input added after undo',
    async () => {
      await select('A', 'beta', 0, 4);
      await page.keyboard.insertText('own');
      await key('ControlOrMeta+z');
      await select('B', 'beta', 2);
      await page.keyboard.insertText('FOREIGN');
      await select('A', 'Alpha');
      await key('ControlOrMeta+Shift+z');
      const text = first(await snap());
      assert.ok(text.includes('FOREIGN'));
      assert.ok(text.includes('own'));
      assert.ok(!text.includes('beta'));
      assert.equal(text.split('FOREIGN').length, 2);
    }
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    'artifacts/origin-results.json',
    JSON.stringify(
      {
        candidate: 'R07-PM-ORIGIN-02',
        runtime: await browser.version(),
        os: process.platform,
        input: 'Playwright browser text/key events; not native IME/clipboard',
        results,
        errors,
      },
      null,
      2
    ) + '\n'
  );
  results.forEach((r) =>
    console.log(
      r.status + ': ' + r.id + ' ' + r.title + (r.error ? '\n' + r.error : '')
    )
  );
  if (results.some((r) => r.status === 'fail')) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
