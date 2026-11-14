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
  await page.goto(`http://127.0.0.1:${app.address().port}`);
  await page.waitForFunction(() => window.lab);
  const snap = () => page.evaluate(() => lab.snapshot());
  const first = (s) =>
    s.doc.content[0].content?.map((n) => n.text ?? '').join('') ?? '';
  const run = async (id, title, body) => {
    if (process.env.BROWSER_CASE && process.env.BROWSER_CASE !== id) return;
    await page.evaluate(() => lab.reset());
    try {
      await body();
      results.push({ id, title, role: 'candidate', status: 'pass' });
    } catch (e) {
      results.push({
        id,
        title,
        status: 'fail',
        error: e.message,
        snapshot: await snap(),
        trace: await page.evaluate(() => lab.trace()),
      });
      await page.screenshot({
        path: `artifacts/${id}-failure.png`,
        fullPage: true,
      });
    }
  };
  await run(
    'BR-01',
    'pointer focus, End and immediate keyboard input converge',
    async () => {
      await page.locator('#view-a .ProseMirror > p').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type('X');
      const s = await snap();
      assert.equal(first(s), 'Alpha betaX');
      assert.deepEqual(s.contexts.A.doc, s.contexts.B.doc);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute('aria-label')
        ),
        'Editor view A'
      );
    }
  );
  await run(
    'BR-02',
    'backward selection replacement followed by keyboard undo',
    async () => {
      await page.evaluate(() => lab.select('A', 'beta', 4, 0));
      await page.keyboard.type('new');
      assert.equal(first(await snap()), 'Alpha new');
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(first(await snap()), 'Alpha beta');
    }
  );
  await run(
    'BR-03',
    'alternating views and focused undo preserve foreign edits',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('A-');
      await page.evaluate(() => lab.select('B', 'Gamma'));
      await page.keyboard.type('B-');
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.press('ControlOrMeta+z');
      const s = await snap();
      assert.equal(first(s), 'Alpha beta');
      assert.match(JSON.stringify(s.doc), /B-Gamma/);
    }
  );
  await run(
    'BR-04',
    'granular keyboard history removes only own text around a foreign insertion',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('abcd');
      await page.evaluate(() => lab.select('B', 'abcd', 2));
      await page.keyboard.type('FOREIGN');
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(first(await snap()), 'FOREIGNAlpha beta');
    }
  );
  await run(
    'BR-05',
    'table cell click and immediate input targets only that cell',
    async () => {
      const cell = page.locator('#view-a td').first();
      await cell.click();
      await page.keyboard.press('End');
      await page.keyboard.type('X');
      assert.equal(await cell.innerText(), 'OneX');
      assert.equal(
        await page.locator('#view-b td').first().innerText(),
        'OneX'
      );
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(await cell.innerText(), 'One');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      assert.equal(await cell.innerText(), 'OneX');
    }
  );
  await run(
    'BR-06',
    'toolbar bold acts on captured selection without changing focus owner',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha', 0, 5));
      await page.locator('#bold').click();
      assert.equal(await page.locator('#view-a strong').innerText(), 'Alpha');
      assert.equal(await page.locator('#view-b strong').innerText(), 'Alpha');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute('aria-label')
        ),
        'Editor view A'
      );
    }
  );
  await run(
    'BR-07',
    'external shared-API edit preserves focused selection mapping',
    async () => {
      await page.evaluate(() => lab.select('B', 'Gamma', 2));
      const old = (await snap()).contexts.B.anchor;
      await page.evaluate(() =>
        lab.command({
          method: 'insert',
          id: 'browser-external',
          version: lab.snapshot().version,
          target: 'Alpha',
          text: 'REMOTE-',
        })
      );
      const s = await snap();
      assert.equal(s.contexts.B.anchor, old + 7);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute('aria-label')
        ),
        'Editor view B'
      );
      await page.keyboard.type('X');
      assert.match(JSON.stringify((await snap()).doc), /GaXmma/);
    }
  );
  await run(
    'BR-08',
    'close/reopen a view keeps the other live and retains its context history',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('A-');
      await page.locator('#close-a').click();
      assert.equal(await page.locator('#view-a .ProseMirror').count(), 0);
      await page.evaluate(() => lab.select('B', 'Gamma'));
      await page.keyboard.type('B-');
      await page.locator('#close-a').click();
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.press('ControlOrMeta+z');
      const s = await snap();
      assert.equal(first(s), 'Alpha beta');
      assert.match(JSON.stringify(s.doc), /B-Gamma/);
    }
  );
  await run(
    'BR-09',
    'failed save uses recovery and restores accepted state after restart',
    async () => {
      await page.locator('#fail-save').check();
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('RECOVER-');
      assert.match(await page.locator('#status').innerText(), /pending|failed/);
      await page.locator('#restart').click();
      assert.equal(first(await snap()), 'RECOVER-Alpha beta');
      await page.locator('#fail-save').uncheck();
    }
  );
  await run(
    'BR-10',
    'failure of save and recovery blocks closing the view',
    async () => {
      await page.locator('#fail-save').check();
      await page.locator('#fail-protect').check();
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('KEEP-');
      await page.locator('#close-a').click();
      assert.equal(await page.locator('#view-a .ProseMirror').count(), 1);
      assert.equal(first(await snap()), 'KEEP-Alpha beta');
      assert.match(await page.locator('#status').innerText(), /CLOSE_BLOCKED/);
      await page.locator('#fail-save').uncheck();
      await page.locator('#fail-protect').uncheck();
    }
  );
  await run(
    'BR-11',
    'read-only embed rejects text insertion into its content',
    async () => {
      const before = (await snap()).doc.content.find((n) => n.type === 'embed');
      await page.locator('#view-a .embed').click();
      await page.keyboard.type('attempt');
      const after = (await snap()).doc.content.find((n) => n.type === 'embed');
      assert.deepEqual(after, before);
    }
  );
  await run(
    'BR-12',
    'paused delivery catches up and maps queued text without resetting the view',
    async () => {
      await page.evaluate(() => {
        lab.pause('B');
        lab.select('B', 'Gamma');
      });
      await page.keyboard.type('B-');
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.type('A-');
      await page.evaluate(() => lab.resume('B'));
      const s = await snap();
      assert.equal(first(s), 'A-Alpha beta');
      assert.match(JSON.stringify(s.doc), /B-Gamma/);
      assert.deepEqual(s.contexts.A.doc, s.contexts.B.doc);
    }
  );
  await run(
    'BR-13',
    'batched text input uses the conservative unsafe-undo refusal',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.insertText('abcd');
      await page.evaluate(() => lab.select('B', 'abcd', 2));
      await page.keyboard.insertText('FOREIGN');
      await page.evaluate(() => lab.select('A', 'Alpha'));
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(first(await snap()), 'abFOREIGNcdAlpha beta');
      assert.match(
        await page.locator('#status').innerText(),
        /UNDO_BLOCKED_FOREIGN_CONTENT/
      );
    }
  );
  await run(
    'BR-14',
    'confirmed final-cell Tab stays put and adds no row',
    async () => {
      await page.locator('#view-a td').last().click();
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await page.keyboard.type('NEW');
      assert.equal(await page.locator('#view-a tr').count(), 2);
      assert.equal(
        await page
          .locator('#view-a tr')
          .last()
          .locator('td')
          .first()
          .innerText(),
        'Three'
      );
      assert.equal(
        await page.locator('#view-a td').last().innerText(),
        'FourNEW'
      );
      assert.deepEqual(
        (await snap()).contexts.A.doc,
        (await snap()).contexts.B.doc
      );
    }
  );
  await run(
    'BR-15',
    'empty last cell immediate Tab stays without adding a row',
    async () => {
      await page.evaluate(() => lab.select('A', 'Four', 0, 4));
      await page.keyboard.press('Backspace');
      await page.locator('#view-a td').first().click();
      await page.locator('#view-a td').last().click();
      await page.keyboard.press('Tab');
      await page.keyboard.insertText('EMPTY');
      assert.equal(await page.locator('#view-a tr').count(), 2);
      assert.equal(
        await page
          .locator('#view-a tr')
          .last()
          .locator('td')
          .first()
          .innerText(),
        'Three'
      );
      assert.equal(
        await page.locator('#view-a td').last().innerText(),
        'EMPTY'
      );
    }
  );
  await run(
    'BR-16',
    'immediate Shift-Tab moves within the clicked table',
    async () => {
      await page.locator('#view-a td').last().click();
      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.insertText('PREVIOUS');
      assert.equal(
        await page
          .locator('#view-a tr')
          .last()
          .locator('td')
          .first()
          .innerText(),
        'ThreePREVIOUS'
      );
      assert.equal(await page.locator('#view-a td').last().innerText(), 'Four');
    }
  );
  await run(
    'BR-17',
    'native backward range is reconciled before destructive key command',
    async () => {
      await page.locator('#view-a .ProseMirror > p').first().click();
      await page.evaluate(() => {
        const text = document.querySelector(
          '#view-a .ProseMirror > p'
        ).firstChild;
        window.getSelection().setBaseAndExtent(text, 10, text, 6);
      });
      await page.keyboard.press('Backspace');
      assert.equal(first(await snap()), 'Alpha ');
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(first(await snap()), 'Alpha beta');
    }
  );
  await run(
    'BR-18',
    'selection adapter does not act for an unfocused editor',
    async () => {
      await page.evaluate(() => lab.select('B', 'Gamma', 2));
      const before = await snap();
      const result = await page.evaluate(() =>
        lab.selectionPreflight('A', { key: 'Tab' })
      );
      assert.equal(result.changed, false);
      assert.equal(result.reason, 'not-focused-editor');
      assert.deepEqual((await snap()).contexts.A, before.contexts.A);
    }
  );
  await run(
    'BR-19',
    'synthetic composition flag bypasses reconciliation (not native IME evidence)',
    async () => {
      await page.evaluate(() => lab.select('A', 'Alpha'));
      const before = await snap();
      const result = await page.evaluate(() => {
        const text = document.querySelector(
          '#view-a .ProseMirror > p'
        ).firstChild;
        window.getSelection().setBaseAndExtent(text, 4, text, 4);
        const before = lab.snapshot().contexts.A.anchor;
        const decision = lab.selectionPreflight('A', {
          key: 'Tab',
          isComposing: true,
        });
        return { ...decision, before, after: lab.snapshot().contexts.A.anchor };
      });
      assert.equal(result.reason, 'composition-or-handled');
      assert.equal(result.after, result.before);
    }
  );
  await run(
    'BR-20',
    'node and cell-range model selections are never coerced into text',
    async () => {
      for (const kind of ['embed', 'cells']) {
        await page.evaluate((kind) => lab.selectKind('A', kind), kind);
        const before = (await snap()).contexts.A;
        const result = await page.evaluate(() =>
          lab.selectionPreflight('A', { key: 'Tab' })
        );
        assert.equal(result.reason, 'non-text-model-selection');
        assert.deepEqual((await snap()).contexts.A, before);
      }
    }
  );
  await run(
    'BR-21',
    'nested read-only button focus cannot be stolen by adapter',
    async () => {
      await page.locator('#view-a .embed button').click();
      const before = (await snap()).contexts.A;
      const result = await page.evaluate(() =>
        lab.selectionPreflight('A', { key: 'Backspace' })
      );
      assert.equal(result.changed, false);
      assert.deepEqual((await snap()).contexts.A, before);
      assert.equal(
        await page.evaluate(() => document.activeElement.tagName),
        'BUTTON'
      );
    }
  );
  if (!process.env.BROWSER_CASE || process.env.BROWSER_CASE === 'CT-01') {
    await page.goto(`http://127.0.0.1:${app.address().port}/control`);
    await page.waitForFunction(() => window.controlTrace);
    await page.locator('#control td').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.keyboard.type('NEW');
    const rows = await page.locator('#control tr').count();
    results.push({
      id: 'CT-01',
      title: 'raw editor control: immediate final-cell Tab',
      status: rows === 3 ? 'pass' : 'fail',
      rows,
      trace: await page.evaluate(() => controlTrace()),
      role: 'known-raw-control',
      meaning:
        'Same Q-04 table command without authority/collab/backup; not a native or full upstream diagnosis.',
    });
    await page.goto(`http://127.0.0.1:${app.address().port}`);
    await page.waitForFunction(() => window.lab);
  }
  if (!process.env.BROWSER_CASE || process.env.BROWSER_CASE === 'CT-02') {
    await page.goto(
      `http://127.0.0.1:${app.address().port}/control?selection=public`
    );
    await page.waitForFunction(() => window.controlTrace);
    await page.locator('#control td').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('NEW');
    const rows = await page.locator('#control tr').count(),
      trace = await page.evaluate(() => controlTrace());
    results.push({
      id: 'CT-02',
      title: 'same minimal control with public selection adapter',
      role: 'adapted-control',
      status: rows === 3 ? 'pass' : 'fail',
      rows,
      trace,
    });
    await page.goto(`http://127.0.0.1:${app.address().port}`);
    await page.waitForFunction(() => window.lab);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.evaluate(() => lab.reset());
  await page.screenshot({ path: 'artifacts/two-view.png', fullPage: true });
  writeFileSync(
    'artifacts/browser-results.json',
    JSON.stringify(
      {
        runtime: await browser.version(),
        os: process.platform,
        input: 'Playwright browser key/pointer events; not native macOS input',
        results,
        errors,
        trace: await page.evaluate(() => lab.trace()),
      },
      null,
      2
    )
  );
  for (const r of results)
    console.log(
      `${r.status}: ${r.id} ${r.title}${r.error ? '\n' + r.error : ''}`
    );
  if (results.some((r) => r.status === 'fail' && r.id !== 'CT-01'))
    process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
