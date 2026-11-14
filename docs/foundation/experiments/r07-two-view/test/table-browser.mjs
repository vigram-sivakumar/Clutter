import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { server } from '../serve.mjs';
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
        ? ['--no-sandbox', '--no-zygote', '--single-process']
        : [],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [candidate, route, global, prefix] of [
    ['step', '/', 'lab', '#view-'],
    ['origin', '/origin', 'originLab', '#origin-'],
  ]) {
    await page.goto(`http://127.0.0.1:${app.address().port}${route}`);
    await page.waitForFunction((g) => window[g], global);
    const snap = () => page.evaluate((g) => window[g].snapshot(), global);
    const select = (text, offset = 0, to = offset, id = 'A') =>
      page.evaluate(
        ({ g, text, offset, to, id }) => window[g].select(id, text, offset, to),
        { g: global, text, offset, to, id }
      );
    const check = async (id, title, body) => {
      await page.evaluate((g) => window[g].reset(), global);
      try {
        await body();
        const s = await snap();
        assert.deepEqual(s.contexts.A.doc, s.doc);
        assert.deepEqual(s.contexts.B.doc, s.doc);
        results.push({ id, candidate, title, status: 'pass' });
      } catch (e) {
        results.push({
          id,
          candidate,
          title,
          status: 'fail',
          reason: e.message,
          snapshot: await snap(),
        });
      }
    };
    const cell = (i, id = 'A') =>
      page.locator(prefix + id.toLowerCase() + ' td').nth(i);
    const button = (axis, id = 'A') =>
      page.locator(
        prefix + id.toLowerCase() + ` button[data-table-handle="${axis}"]`
      );
    const shape = async () => ({
      rows: await page.locator(prefix + 'a tr').count(),
      cells: await page.locator(prefix + 'a td').count(),
    });
    await check(
      'TB-01',
      'Tab appends at destination end, without selecting its text',
      async () => {
        await select('One', 1);
        await page.keyboard.press('Tab');
        await page.keyboard.insertText('X');
        assert.equal(await cell(1).innerText(), 'TwoX');
        assert.equal(await cell(0).innerText(), 'One');
        assert.equal(
          (await snap()).contexts.A.anchor,
          (await snap()).contexts.A.head
        );
      }
    );
    await check('TB-02', 'Shift-Tab appends at previous cell end', async () => {
      await select('Four', 1);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.insertText('X');
      assert.equal(await cell(2).innerText(), 'ThreeX');
    });
    await check('TB-03', 'Tab wraps into the next existing row', async () => {
      await select('Two', 1);
      await page.keyboard.press('Tab');
      await page.keyboard.insertText('X');
      assert.equal(await cell(2).innerText(), 'ThreeX');
      assert.deepEqual(await shape(), { rows: 2, cells: 4 });
    });
    await check(
      'TB-04',
      'final Tab preserves current caret and table',
      async () => {
        await select('Four', 2);
        const before = await snap();
        await page.keyboard.press('Tab');
        const after = await snap();
        assert.equal(after.version, before.version);
        assert.deepEqual(after.doc, before.doc);
        assert.equal(after.contexts.A.anchor, before.contexts.A.anchor);
        await page.keyboard.insertText('X');
        assert.equal(await cell(3).innerText(), 'FoXur');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    for (const [id, source, index] of [
      ['TB-05', 'One', 2],
      ['TB-06', 'Two', 3],
    ])
      await check(id, 'Enter stays in the same column', async () => {
        await select(source, 1);
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('X');
        assert.equal(
          await cell(index).innerText(),
          index === 2 ? 'ThreeX' : 'FourX'
        );
      });
    for (const [id, source] of [
      ['TB-07', 'Three'],
      ['TB-08', 'Four'],
    ])
      await check(
        id,
        'bottom-row Enter has no content, caret or revision effect',
        async () => {
          await select(source, 2);
          const before = await snap();
          await page.keyboard.press('Enter');
          const after = await snap();
          assert.equal(after.version, before.version);
          assert.deepEqual(after.doc, before.doc);
          assert.equal(after.contexts.A.anchor, before.contexts.A.anchor);
        }
      );
    await check(
      'TB-09',
      'Shift-Enter creates a hard line break in one cell, undoable',
      async () => {
        await select('Four', 2);
        await page.keyboard.press('Shift+Enter');
        assert.equal(await cell(3).locator('p').count(), 1);
        assert.equal(await cell(3).locator('br').count(), 1);
        assert.match(await cell(3).innerText(), /Fo\nur/);
        await page.keyboard.press('ControlOrMeta+z');
        assert.equal(await cell(3).innerText(), 'Four');
      }
    );
    await check(
      'TB-10',
      'bottom handle adds one row, shared and undoable',
      async () => {
        await button('row').click();
        assert.deepEqual(await shape(), { rows: 3, cells: 6 });
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute('aria-label')
          ),
          candidate === 'step' ? 'Editor view A' : 'Origin editor A'
        );
        await page.keyboard.press('ControlOrMeta+z');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-11',
      'right handle adds one column, shared and undoable',
      async () => {
        await button('column').click();
        assert.deepEqual(await shape(), { rows: 2, cells: 6 });
        await page.keyboard.press('ControlOrMeta+z');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-12',
      'handle in B targets B and typing enters the new cell',
      async () => {
        await button('row', 'B').click();
        await page.keyboard.insertText('B-CELL');
        assert.equal(await cell(4, 'B').innerText(), 'B-CELL');
        assert.equal(await cell(4).innerText(), 'B-CELL');
      }
    );
    await check(
      'TB-13',
      'Escape exposes keyboard-reachable handles',
      async () => {
        await select('Four');
        await page.keyboard.press('Escape');
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute('aria-label')
          ),
          'Add row'
        );
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute('aria-label')
          ),
          'Add column'
        );
        await page.keyboard.press('Enter');
        assert.deepEqual(await shape(), { rows: 2, cells: 6 });
      }
    );
    await check(
      'TB-14',
      'Enter and Tab remain no-ops in newly added empty final cell',
      async () => {
        await button('row').click();
        await cell(5).click();
        const before = await snap();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        assert.deepEqual((await snap()).doc, before.doc);
        assert.equal((await snap()).version, before.version);
        assert.deepEqual(await shape(), { rows: 3, cells: 6 });
      }
    );
    await check(
      'TB-15',
      'adding a row does not undo previous independent typing',
      async () => {
        await select('Alpha');
        await page.keyboard.insertText('KEEP-');
        await button('row').click();
        await page.keyboard.press('ControlOrMeta+z');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
        assert.match(JSON.stringify((await snap()).doc), /KEEP-Alpha/);
      }
    );
    for (const [id, axis, index] of [
      ['TB-16', 'row', 4],
      ['TB-17', 'column', 2],
    ])
      await check(
        id,
        'undo of own added ' + axis + ' preserves foreign cell content',
        async () => {
          await button(axis).click();
          await cell(index, 'B').click();
          await page.keyboard.insertText('FOREIGN-CELL');
          await select('Alpha', 0, 0, 'A');
          await page.keyboard.press('ControlOrMeta+z');
          assert.match(JSON.stringify((await snap()).doc), /FOREIGN-CELL/);
        }
      );
  }
  for (const [axis, index] of [
    ['row', 4],
    ['column', 2],
  ]) {
    await page.goto(
      `http://127.0.0.1:${app.address().port}/origin?history=raw`
    );
    await page.waitForFunction(() => window.originLab);
    await page.evaluate(() => originLab.reset());
    await page.locator(`#origin-a button[data-table-handle="${axis}"]`).click();
    await page.locator('#origin-b td').nth(index).click();
    await page.keyboard.insertText('FOREIGN-CELL');
    await page.evaluate(() => originLab.select('A', 'Alpha'));
    await page.keyboard.press('ControlOrMeta+z');
    const snapshot = await page.evaluate(() => originLab.snapshot());
    const kept = JSON.stringify(snapshot.doc).includes('FOREIGN-CELL');
    results.push({
      id: 'TC-RAW-' + axis,
      candidate: 'origin-unguarded',
      role: 'known-raw-history-control',
      title: 'unguarded structural undo must preserve foreign text',
      status: kept ? 'pass' : 'fail',
      foreignPreserved: kept,
      snapshot,
      meaning:
        'Raw failure preserved as diagnostic; never a passing product acceptance case.',
    });
  }
  assert.deepEqual(errors, []);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/table-results.json',
    JSON.stringify(
      {
        contract: 'table-policy-2026-11-14',
        runtime: await browser.version(),
        os: process.platform,
        input: 'Playwright browser keys/pointer; not native Mac',
        results,
        errors,
      },
      null,
      2
    ) + '\n'
  );
  for (const r of results)
    console.log(
      `${r.status}: ${r.candidate} ${r.id} ${r.title}${r.reason ? '\n' + r.reason : ''}`
    );
  if (
    results.some(
      (r) => r.status === 'fail' && r.role !== 'known-raw-history-control'
    )
  )
    process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
