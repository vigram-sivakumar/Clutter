import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { server } from '../serve.mjs';
const app = await server(0),
  results = [];
let browser;
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
  const page = await browser.newPage(),
    pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const select = (id, text, from = 0, to = from) =>
    page.evaluate(
      ({ id, text, from, to }) => originLab.select(id, text, from, to),
      { id, text, from, to }
    );
  const boundary = (id) => page.evaluate((id) => originLab.boundary(id), id);
  const snap = () => page.evaluate(() => originLab.snapshot());
  const insert = async (id, needle, text) => {
    await select(id, needle);
    await boundary(id);
    await page.keyboard.insertText(text);
    await boundary(id);
  };
  const check = async (id, title, body) => {
    await page.goto(`http://127.0.0.1:${app.address().port}/origin`);
    await page.waitForFunction(() => window.originLab);
    await page.evaluate(() => originLab.reset());
    const errorsBefore = pageErrors.length;
    try {
      const detail = await body();
      const s = await snap();
      assert.deepEqual(s.contexts.A.doc, s.doc);
      assert.deepEqual(s.contexts.B.doc, s.doc);
      assert.equal(pageErrors.length, errorsBefore);
      results.push({ id, title, status: 'pass', ...detail, snapshot: s });
    } catch (e) {
      results.push({
        id,
        title,
        status: 'fail',
        reason: e.message,
        snapshot: await snap(),
        pageErrors: pageErrors.slice(errorsBefore),
      });
    }
  };
  await check(
    'LC-01',
    'repeated destruction/remount keeps both contexts undo, redo and new edits',
    async () => {
      await insert('A', 'Alpha', 'A0-');
      await insert('B', 'Gamma', 'B0-');
      for (let round = 0; round < 3; round++)
        for (const [id, needle] of [
          ['A', 'Alpha'],
          ['B', 'Gamma'],
        ]) {
          const before = await snap();
          const lifecycle = await page.evaluate((id) => {
            const previous = originLab.view(id),
              next = originLab.recreateView(id);
            return {
              destroyed: previous.isDestroyed,
              replaced: next !== previous,
            };
          }, id);
          assert.deepEqual(lifecycle, { destroyed: true, replaced: true });
          await select(id, needle);
          await page.keyboard.press('ControlOrMeta+z');
          assert.notDeepEqual((await snap()).doc, before.doc);
          await page.keyboard.press('ControlOrMeta+Shift+z');
          assert.deepEqual((await snap()).doc, before.doc);
          await insert(id, needle, `${id}${round}-`);
          const edited = await snap();
          await page.keyboard.press('ControlOrMeta+z');
          assert.deepEqual((await snap()).doc, before.doc);
          await page.keyboard.press('ControlOrMeta+Shift+z');
          assert.deepEqual((await snap()).doc, edited.doc);
        }
    }
  );
  await check(
    'LC-02',
    'foreign edits while A is destroyed reconcile before A history runs',
    async () => {
      await insert('A', 'Alpha', 'AOWN-');
      await page.evaluate(() => originLab.detachView('A'));
      await insert('B', 'Gamma', 'BWHILE-CLOSED-');
      await page.evaluate(() => originLab.attachView('A'));
      await select('A', 'Alpha');
      await page.keyboard.press('ControlOrMeta+z');
      let s = await snap();
      assert.ok(!JSON.stringify(s.doc).includes('AOWN-'));
      assert.ok(JSON.stringify(s.doc).includes('BWHILE-CLOSED-'));
      await page.keyboard.press('ControlOrMeta+Shift+z');
      s = await snap();
      assert.ok(JSON.stringify(s.doc).includes('AOWN-'));
      assert.ok(JSON.stringify(s.doc).includes('BWHILE-CLOSED-'));
    }
  );
  await check(
    'LC-03',
    'paused provisional own edits retain history while the view is destroyed',
    async () => {
      await page.evaluate(() => originLab.pause('A'));
      await insert('A', 'Alpha', 'PENDING-A-');
      await page.evaluate(() => originLab.detachView('A'));
      await insert('B', 'Gamma', 'ACCEPTED-B-');
      await page.evaluate(() => {
        originLab.resume('A');
        originLab.attachView('A');
      });
      await select('A', 'Alpha');
      await page.keyboard.press('ControlOrMeta+z');
      let s = await snap();
      assert.ok(!JSON.stringify(s.doc).includes('PENDING-A-'));
      assert.ok(JSON.stringify(s.doc).includes('ACCEPTED-B-'));
      await page.keyboard.press('ControlOrMeta+Shift+z');
      s = await snap();
      assert.ok(JSON.stringify(s.doc).includes('PENDING-A-'));
      assert.ok(JSON.stringify(s.doc).includes('ACCEPTED-B-'));
    }
  );
  for (const axis of ['row', 'column'])
    await check(
      'LC-04-' + axis,
      'structural undo/redo maps its guard past disjoint foreign edits, then blocks overlap',
      async () => {
        await select('A', 'Four', 2);
        await page
          .locator(`#origin-a button[data-table-handle="${axis}"]`)
          .click();
        await insert('B', 'Alpha', 'DISJOINT1-');
        await select('A', 'Four');
        await page.keyboard.press('ControlOrMeta+z');
        assert.equal(await page.locator('#origin-a td').count(), 4);
        assert.ok(JSON.stringify((await snap()).doc).includes('DISJOINT1-'));
        await insert('B', 'Gamma', 'DISJOINT2-');
        await select('A', 'Four');
        await page.keyboard.press('ControlOrMeta+Shift+z');
        assert.equal(await page.locator('#origin-a td').count(), 6);
        assert.ok(JSON.stringify((await snap()).doc).includes('DISJOINT2-'));
        const index = axis === 'row' ? 4 : 2;
        await page.locator('#origin-b td').nth(index).click();
        await page.keyboard.insertText('PROTECTED-CELL');
        const before = await snap();
        await select('A', 'Four');
        await page.keyboard.press('ControlOrMeta+z');
        assert.deepEqual((await snap()).doc, before.doc);
        assert.match(
          await page.locator('#origin-status').innerText(),
          /UNDO_BLOCKED_FOREIGN_TABLE_EDIT/
        );
      }
    );
  await check(
    'LC-05',
    'overlap guard still refuses a foreign format within the affected table',
    async () => {
      await select('A', 'Four', 2);
      await page.locator('#origin-a button[data-table-handle="row"]').click();
      await select('B', 'One', 0, 3);
      await page.keyboard.press('ControlOrMeta+b');
      const before = await snap();
      await select('A', 'Four');
      await page.keyboard.press('ControlOrMeta+z');
      assert.deepEqual((await snap()).doc, before.doc);
      assert.match(
        await page.locator('#origin-status').innerText(),
        /UNDO_BLOCKED_FOREIGN_TABLE_EDIT/
      );
    }
  );

  await check(
    'LC-06',
    'handle undo/redo restores selected-cell mode without a caret',
    async () => {
      await select('A', 'Four', 2);
      await page.keyboard.press('Escape');
      await page.locator('#origin-a button[data-table-handle="row"]').click();
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(await page.locator('#origin-a tr').count(), 2);
      assert.equal(
        await page
          .locator('#origin-a .ProseMirror')
          .getAttribute('data-table-mode'),
        'selection'
      );
      assert.ok(
        (
          await page.locator('#origin-a td').nth(3).getAttribute('class')
        ).includes('selectedCell')
      );
      await page.keyboard.press('ControlOrMeta+Shift+z');
      assert.equal(await page.locator('#origin-a tr').count(), 3);
      assert.equal(
        await page
          .locator('#origin-a .ProseMirror')
          .getAttribute('data-table-mode'),
        'selection'
      );
      assert.ok(
        (
          await page.locator('#origin-a td').nth(3).getAttribute('class')
        ).includes('selectedCell')
      );
    }
  );
  // Frozen raw integration: verify the new ownership bridge did not silently
  // replace the old failing lifecycle control or turn it into an acceptance pass.
  await page.goto(`http://127.0.0.1:${app.address().port}/origin?history=raw`);
  await page.waitForFunction(() => window.originLab);
  await insert('A', 'Alpha', 'RAW-');
  await page.evaluate(() => originLab.recreateView('A'));
  await select('A', 'Alpha');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  const raw = await snap();
  const rawRedoLost = !JSON.stringify(raw.doc).includes('RAW-');
  assert.ok(
    rawRedoLost,
    'Raw lifecycle control unexpectedly changed; review baseline'
  );
  results.push({
    id: 'LC-RAW',
    title: 'old view-owned integration loses redo after remount',
    status: 'diagnostic-gap',
    role: 'preserved-raw-control',
    redoLost: true,
    snapshot: raw,
  });
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/history-lifecycle-results.json',
    JSON.stringify(
      { runtime: await browser.version(), os: process.platform, results },
      null,
      2
    ) + '\n'
  );
  for (const r of results)
    console.log(
      `${r.status}: ${r.id} ${r.title}${r.reason ? ' — ' + r.reason : ''}`
    );
  if (results.some((r) => r.status === 'fail')) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
