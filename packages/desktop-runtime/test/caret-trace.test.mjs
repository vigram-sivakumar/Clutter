import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { caretTraceSource } from '../../../apps/desktop/host/caret-trace.mjs';
import { bootstrap } from '../../../apps/desktop/host/bootstrap.mjs';
const config = {
  url: 'http://127.0.0.1:4999/',
  bootNonce: 'test_nonce',
  windowId: 'test_window',
  spaceId: 'test_space',
  token: 'PRIVATE_TEST_CREDENTIAL',
};
const make = (url = config.url) =>
  new JSDOM(
    '<!doctype html><body><div class="ProseMirror" contenteditable="true"><p>SECRET NOTE https://private.example</p></div></body>',
    { url, runScripts: 'outside-only', pretendToBeVisual: true }
  );
const mounted = async (dom) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dom.window.document.querySelector('[data-caret-diagnostics]');
};
test('73 host trace is opt-in, origin guarded and injected independently of immutable browser bundle', async () => {
  for (const [enabled, url, expected] of [
    [false, config.url, false],
    [true, config.url, true],
    [true, 'https://unrelated.example/', false],
  ]) {
    const dom = make(url);
    try {
      dom.window.eval(bootstrap(config, { caretTrace: enabled }));
      await mounted(dom);
      assert.equal(!!dom.window.__clutterCaretDiagnostics, expected);
    } finally {
      dom.window.__clutterCaretDiagnostics?.stop();
      dom.window.close();
    }
  }
});
test('73 trace records focus/selection metadata without note text, key characters or credentials and restores methods', async () => {
  const dom = make(),
    w = dom.window;
  const focus = Object.getOwnPropertyDescriptor(
      w.HTMLElement.prototype,
      'focus'
    ),
    collapse = Object.getOwnPropertyDescriptor(
      w.Selection.prototype,
      'collapse'
    );
  try {
    w.eval(caretTraceSource());
    assert(await mounted(dom));
    const editor = w.document.querySelector('.ProseMirror'),
      text = editor.querySelector('p').firstChild;
    const before = editor.innerHTML;
    w.__clutterCaretDiagnostics.start();
    editor.focus();
    w.getSelection().collapse(text, 2);
    editor.dispatchEvent(
      new w.KeyboardEvent('keydown', { key: 'Q', bubbles: true })
    );
    editor.dispatchEvent(
      new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    );
    const report = w.__clutterCaretDiagnostics.stop(),
      encoded = JSON.stringify(report);
    assert(report.rows.some((row) => row.event === 'element.focus.before'));
    assert(report.rows.some((row) => row.event === 'selection.collapse.after'));
    assert(report.rows.some((row) => row.key === 'character'));
    assert(!report.rows.some((row) => row.key === 'Q'));
    assert(!encoded.includes('SECRET NOTE'));
    assert(!encoded.includes('private.example'));
    assert(!encoded.includes(config.token));
    assert.equal(editor.innerHTML, before, 'trace does not change document');
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'focus'),
      focus
    );
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(w.Selection.prototype, 'collapse'),
      collapse
    );
    const count = report.events;
    w.getSelection().collapse(text, 3);
    assert.equal(w.__clutterCaretDiagnostics.report().events, count);
  } finally {
    w.__clutterCaretDiagnostics?.stop();
    w.close();
  }
});
test('73 trace is bounded and cap shutdown restores native selection methods without recursion', async () => {
  const dom = make(),
    w = dom.window,
    original = w.Selection.prototype.collapse;
  try {
    w.eval(caretTraceSource());
    await mounted(dom);
    w.__clutterCaretDiagnostics.start();
    const text = w.document.querySelector('p').firstChild;
    for (let n = 0; n < 500; n++) w.getSelection().collapse(text, n % 4);
    const report = w.__clutterCaretDiagnostics.report();
    assert(report.events <= 400);
    assert.equal(report.dropped, 1);
    assert.equal(w.Selection.prototype.collapse, original);
    assert(
      w.document
        .querySelector('textarea[aria-label="Caret trace JSON"]')
        .value.includes('clutter-caret-trace73')
    );
  } finally {
    w.__clutterCaretDiagnostics?.stop();
    w.close();
  }
});
