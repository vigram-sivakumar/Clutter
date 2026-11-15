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
      'handle in focused B keeps its original active cell and caret',
      async () => {
        await select('Four', 2, 2, 'B');
        await button('row', 'B').click();
        await page.keyboard.insertText('B-CELL');
        assert.equal(await cell(3, 'B').innerText(), 'FoB-CELLur');
        assert.equal(await cell(3).innerText(), 'FoB-CELLur');
      }
    );
    await check(
      'TB-13',
      'Escape selects the active cell without moving focus to a handle',
      async () => {
        await select('Four', 2);
        const before = await snap();
        await page.keyboard.press('Escape');
        assert.equal(
          await cell(3)
            .getAttribute('class')
            .then((c) => c.includes('selectedCell')),
          true
        );
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'selection'
        );
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute('aria-label')
          ),
          candidate === 'step' ? 'Editor view A' : 'Origin editor A'
        );
        assert.equal((await snap()).version, before.version);
        assert.deepEqual((await snap()).doc, before.doc);
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
    for (const [id, axis] of [
      ['TB-18', 'row'],
      ['TB-19', 'column'],
    ])
      await check(
        id,
        'row 2 cell 2 caret/focus survives ' + axis + ' handle',
        async () => {
          await select('Four', 2);
          await button(axis).click();
          const s = await snap();
          assert.equal(s.contexts.A.anchor, s.contexts.A.head);
          assert.equal(
            await page.evaluate(() =>
              document.activeElement.getAttribute('aria-label')
            ),
            candidate === 'step' ? 'Editor view A' : 'Origin editor A'
          );
          await page.keyboard.insertText('X');
          const table = page.locator(prefix + 'a table');
          assert.equal(
            await table.locator('tr').nth(1).locator('td').nth(1).innerText(),
            'FoXur'
          );
          assert.deepEqual(
            await shape(),
            axis === 'row' ? { rows: 3, cells: 6 } : { rows: 2, cells: 6 }
          );
        }
      );
    await check(
      'TB-20',
      'immediate pointer cell placement survives handle click',
      async () => {
        await cell(3)
          .locator('p')
          .click({ position: { x: 8, y: 10 } });
        await page.keyboard.press('End');
        await button('column').click();
        await page.keyboard.insertText('X');
        assert.equal(
          await page
            .locator(prefix + 'a tr')
            .nth(1)
            .locator('td')
            .nth(1)
            .innerText(),
          'FourX'
        );
      }
    );
    await check(
      'TB-21',
      'Enter returns from selected cell to editing that same cell',
      async () => {
        await select('Four', 2);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        await page.keyboard.insertText('X');
        assert.equal(await cell(3).innerText(), 'FourX');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-22',
      'background handle does not steal the other view focus',
      async () => {
        await select('Four', 2, 2, 'A');
        await button('row', 'B').click();
        assert.equal(
          await page.evaluate(() =>
            document.activeElement.getAttribute('aria-label')
          ),
          candidate === 'step' ? 'Editor view A' : 'Origin editor A'
        );
        await page.keyboard.insertText('X');
        assert.equal(await cell(3, 'A').innerText(), 'FoXur');
      }
    );
    await check(
      'TB-23',
      'handle preserves backward text range instead of selecting a new cell',
      async () => {
        await select('Four', 4, 1);
        await button('column').click();
        const c = (await snap()).contexts.A;
        assert.ok(c.anchor > c.head);
        await page.keyboard.insertText('X');
        assert.equal(
          await page
            .locator(prefix + 'a tr')
            .nth(1)
            .locator('td')
            .nth(1)
            .innerText(),
          'FX'
        );
      }
    );
    await check(
      'TB-24',
      'selected-cell Tab and Shift-Tab navigate without a caret',
      async () => {
        await select('One', 1);
        await page.keyboard.press('Escape');
        for (const [key, index] of [
          ['Tab', 1],
          ['Tab', 2],
          ['Shift+Tab', 1],
        ]) {
          await page.keyboard.press(key);
          assert.ok(
            (await cell(index).getAttribute('class')).includes('selectedCell')
          );
          assert.equal(
            await page
              .locator(prefix + 'a .ProseMirror')
              .getAttribute('data-table-mode'),
            'selection'
          );
          assert.equal(
            await page
              .locator(prefix + 'a .ProseMirror')
              .evaluate((e) => getComputedStyle(e).caretColor),
            'rgba(0, 0, 0, 0)'
          );
        }
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('X');
        assert.equal(await cell(1).innerText(), 'TwoX');
      }
    );
    await check(
      'TB-25',
      'selected-cell Tab boundaries do not grow the table or enter editing',
      async () => {
        for (const [text, key, index] of [
          ['Four', 'Tab', 3],
          ['One', 'Shift+Tab', 0],
        ]) {
          await select(text, 1);
          await page.keyboard.press('Escape');
          await page.keyboard.press(key);
          assert.ok(
            (await cell(index).getAttribute('class')).includes('selectedCell')
          );
          assert.equal(
            await page
              .locator(prefix + 'a .ProseMirror')
              .getAttribute('data-table-mode'),
            'selection'
          );
        }
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-26',
      'clicking a cell highlights it and restores a text caret',
      async () => {
        await select('Four', 2);
        await page.keyboard.press('Escape');
        await cell(0).locator('p').click();
        await page.keyboard.press('End');
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        assert.ok(
          (await cell(0).getAttribute('class')).includes('active-table-cell')
        );
        await page.keyboard.insertText('X');
        assert.equal(await cell(0).innerText(), 'OneX');
      }
    );
    await check(
      'TB-26-padding',
      'repeated whitespace clicks in different cells keep typing in the clicked cell',
      async () => {
        for (const id of ['A', 'B']) {
          for (const index of [0, 3, 1, 2, 0, 1]) {
            const target = cell(index, id);
            const before = await Promise.all(
              [0, 1, 2, 3].map((i) => cell(i, id).innerText())
            );
            const box = await target.boundingBox();
            await page.mouse.click(
              box.x + box.width - 12,
              box.y + box.height / 2
            );
            assert.ok(
              (await target.getAttribute('class')).includes('active-table-cell')
            );
            await page.keyboard.insertText('X');
            const expected = [...before];
            expected[index] += 'X';
            assert.deepEqual(
              await Promise.all(
                [0, 1, 2, 3].map((i) => cell(i, id).innerText())
              ),
              expected
            );
          }
        }
      }
    );
    await check(
      'TB-26-mapped',
      'adjacent-cell coordinate result cannot override the actual clicked DOM cell',
      async () => {
        for (const id of ['A', 'B']) {
          for (const padding of [false, true]) {
            const result = await page.evaluate(
              ({ g, id, prefix, padding }) => {
                const view = window[g].view(id);
                const cells = document.querySelectorAll(
                  prefix + id.toLowerCase() + ' td'
                );
                const plugin = view.state.plugins.find(
                  (p) =>
                    p.props.handleClick &&
                    p.props.decorations &&
                    p.props.attributes
                );
                const pos = view.posAtDOM(cells[1].querySelector('p'), 0);
                const handled = plugin.props.handleClick(view, pos, {
                  button: 0,
                  target: padding ? cells[0] : cells[0].querySelector('p'),
                });
                const native = document.getSelection();
                const el =
                  native.focusNode?.nodeType === 1
                    ? native.focusNode
                    : native.focusNode?.parentElement;
                return { handled, clicked: el?.closest('td') === cells[0] };
              },
              { g: global, id, prefix, padding }
            );
            assert.deepEqual(result, { handled: true, clicked: true });
          }
        }
      }
    );
    await check(
      'TB-27',
      'selected-cell mode remains local when the other view edits',
      async () => {
        await select('Four', 2, 2, 'A');
        await page.keyboard.press('Escape');
        await select('One', 1, 1, 'B');
        await page.keyboard.insertText('X');
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'selection'
        );
        assert.equal(
          await page
            .locator(prefix + 'b .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        assert.ok(
          (await cell(3).getAttribute('class')).includes('selectedCell')
        );
      }
    );
    for (const axis of ['row', 'column'])
      await check(
        'TB-28-' + axis,
        'handle preserves selected-cell mode when adding ' + axis,
        async () => {
          await select('Four', 2);
          await page.keyboard.press('Escape');
          await button(axis).click();
          const target = page
            .locator(prefix + 'a tr')
            .nth(1)
            .locator('td')
            .nth(1);
          assert.ok(
            (await target.getAttribute('class')).includes('selectedCell')
          );
          assert.equal(
            await page
              .locator(prefix + 'a .ProseMirror')
              .getAttribute('data-table-mode'),
            'selection'
          );
          await page.keyboard.press('Enter');
          await page.keyboard.insertText('X');
          assert.equal(await target.innerText(), 'FourX');
        }
      );
    await check(
      'TB-29',
      'triple-click selects cell text, replacement and undo retain the cell structure',
      async () => {
        const before = await snap();
        await cell(3).locator('p').click({ clickCount: 3 });
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        assert.ok(
          !((await cell(3).getAttribute('class')) ?? '').includes(
            'selectedCell'
          )
        );
        assert.equal(
          await page.evaluate(() => getSelection().toString()),
          'Four'
        );
        assert.equal((await snap()).version, before.version);
        await page.keyboard.insertText('X');
        assert.equal(await cell(3).innerText(), 'X');
        assert.equal(await cell(0).innerText(), 'One');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
        await page.keyboard.press('ControlOrMeta+z');
        assert.equal(await cell(3).innerText(), 'Four');
      }
    );
    await check(
      'TB-30',
      'triple-click selects all paragraphs in this cell only',
      async () => {
        await page.evaluate(
          ({ g, prefix }) => {
            const v = window[g].view('A');
            const td = document.querySelector(prefix + 'a td:last-child');
            const start = v.posAtDOM(td, 0),
              node = v.state.doc.resolve(start).parent;
            const { schema } = v.state;
            v.dispatch(
              v.state.tr.replaceWith(start, start + node.content.size, [
                schema.nodes.paragraph.create(null, schema.text('First line')),
                schema.nodes.paragraph.create(null, schema.text('Second line')),
              ])
            );
          },
          { g: global, prefix }
        );
        // The public setup targets the first row's second cell.
        const target = cell(1);
        const before = await snap();
        await target.locator('p').first().click({ clickCount: 3 });
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        const selected = await page.evaluate((g) => {
          const v = window[g].view('A'),
            s = v.state.selection;
          return v.state.doc.textBetween(s.from, s.to, '|');
        }, global);
        assert.equal(selected, 'First line|Second line');
        assert.equal((await snap()).version, before.version);
        await page.keyboard.insertText('X');
        assert.equal(await target.innerText(), 'X');
        assert.equal(await cell(0).innerText(), 'One');
        assert.equal(await cell(3).innerText(), 'Four');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-31',
      'triple-click in an empty cell stays a text selection',
      async () => {
        await select('Four', 0, 4);
        await page.keyboard.press('Backspace');
        await cell(3).locator('p').click({ clickCount: 3 });
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
        assert.ok(
          !((await cell(3).getAttribute('class')) ?? '').includes(
            'selectedCell'
          )
        );
        await page.keyboard.insertText('X');
        assert.equal(await cell(3).innerText(), 'X');
        assert.deepEqual(await shape(), { rows: 2, cells: 4 });
      }
    );
    await check(
      'TB-32',
      'double-click remains word selection within an editing cell',
      async () => {
        await cell(3)
          .locator('p')
          .click({ clickCount: 2, position: { x: 16, y: 10 } });
        assert.equal(
          await page.evaluate(() => getSelection().toString()),
          'Four'
        );
        assert.equal(
          await page
            .locator(prefix + 'a .ProseMirror')
            .getAttribute('data-table-mode'),
          'editing'
        );
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
        contract: 'table-text-selection-2026-11-14',
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
