// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeFolding, forceParsing } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { BlockType, type BlockInfo } from '@codemirror/view';
import { markdownLanguageExtension } from '../markdownLanguage';
import { foldToggleDecoration } from '../fold/foldToggleDecoration';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';
import { fencedCodeBackgroundLayer } from './fencedCodeBackgroundLayer';

/** Test-side mirror of the production `textBlock()` resolution, used only
 * to compute the *expected* value independently — comparing the layer's
 * output against a raw, unresolved `lineBlockAt()` would make this test
 * blind to exactly the regression it exists to catch. */
function realLineBounds(block: BlockInfo): BlockInfo {
  return Array.isArray(block.type) ? (block.type.find((b) => b.type === BlockType.Text) ?? block) : block;
}

/**
 * `layer()`'s own initial `markers()` measurement is scheduled via
 * `requestMeasure` (confirmed against the installed
 * `@codemirror/view@6.43.9` source: `LayerView`'s constructor calls
 * `view.requestMeasure(this.measureReq)` rather than measuring
 * synchronously), which resolves on the next animation frame — not
 * something a plain `new EditorView(...)` construction flushes on its
 * own. Waiting one real `requestAnimationFrame` tick is the public,
 * standard-API way to let that resolve, deliberately preferred here over
 * `EditorView`'s own `measure()` method, which exists at runtime but is
 * explicitly marked `@internal` in the installed source (absent from the
 * public `.d.ts`, which is why `tsc --noEmit` rejects calling it) — the
 * same "public API only" discipline this codebase already applies
 * elsewhere (e.g. rejecting CM6's private `isBlockGap` flag).
 */
function flushMeasure(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function mountView(doc: string): Promise<EditorView> {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      fencedCodeBackgroundLayer(),
      codeFolding(),
      foldToggleDecoration(),
      blockSeparatorDecoration(),
    ],
  });
  const view = new EditorView({ state, parent });
  forceParsing(view);
  await flushMeasure();
  return view;
}

function markerRects(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-fenced-code-bg'));
}

describe('fencedCodeBackgroundLayer', () => {
  it('renders exactly one rectangle for a single fenced code block', async () => {
    const view = await mountView('```js\nconst a = 1;\nconst b = 2;\n```');
    expect(markerRects(view)).toHaveLength(1);
  });

  it('renders nothing for a document with no fenced code', async () => {
    const view = await mountView('just a paragraph, no code here');
    expect(markerRects(view)).toHaveLength(0);
  });

  it('renders one independent rectangle per block for two back-to-back blocks (no blank line)', async () => {
    const view = await mountView('```js\none();\n```\n```css\ntwo{}\n```');
    expect(markerRects(view)).toHaveLength(2);
  });

  it('renders one independent rectangle per block around an unrelated construct in between', async () => {
    const view = await mountView('```js\none();\n```\n\n![[NoSuchNote]]\n\n```css\ntwo{}\n```');
    expect(markerRects(view)).toHaveLength(2);
  });

  it('a taller rectangle spans a taller block: an 8-line block is taller than a 1-line block', async () => {
    const manyLines = Array.from({ length: 8 }, (_, i) => `x${i};`).join('\n');
    const view = await mountView('```js\n' + manyLines + '\n```\n```css\none{}\n```');
    const [tall, short] = markerRects(view);
    const tallHeight = parseFloat(tall!.style.height);
    const shortHeight = parseFloat(short!.style.height);
    expect(tallHeight).toBeGreaterThan(shortHeight);
  });

  it('the rectangle exactly matches [firstLine.top, lastLine.bottom] — never wider', async () => {
    const view = await mountView('before\n\n```js\nconst x = 1\nconst y = 2\n```\n\nafter');
    const doc = view.state.doc.toString();
    const from = doc.indexOf('```js');
    const to = doc.indexOf('```', from + 5) + 3;
    const firstLine = realLineBounds(view.lineBlockAt(from));
    const lastLine = realLineBounds(view.lineBlockAt(to - 1));

    const rect = markerRects(view)[0]!;
    expect(parseFloat(rect.style.top)).toBe(firstLine.top);
    expect(parseFloat(rect.style.height)).toBe(lastLine.bottom - firstLine.top);
    // Explicitly not exceeding the boundary: rectangle's own bottom edge
    // (top + height) must equal the last line's bottom exactly, not
    // extend past it.
    expect(parseFloat(rect.style.top) + parseFloat(rect.style.height)).toBe(lastLine.bottom);
  });

  /**
   * Regression test for a real bug found live (not just reasoned about):
   * a leading `blockSeparatorDecoration.ts` block widget, anchored at the
   * exact position the following fence line starts at, gets merged by
   * CM6's own height-map into one composite `BlockInfo` with that line —
   * the naive `.top` read from it is the *separator's* own top, 12px
   * above the real fence line's own top. This only reproduces when a
   * separator genuinely renders immediately before the block (content on
   * the line directly above, no intervening blank line reducing it to
   * zero height) — the previous test's `'before\n\n```js...'` shape (a
   * blank line before the fence) does not exercise this, since a 0-height
   * separator never gets composited the same way.
   */
  it('does not include a leading separator widget\'s own height in the rectangle\'s top (regression)', async () => {
    const view = await mountView('before\n```js\nconst x = 1\n```');
    const doc = view.state.doc.toString();
    const from = doc.indexOf('```js');
    const rawBlock = view.lineBlockAt(from);
    const resolvedTop = realLineBounds(rawBlock).top;

    // The bug's own precondition: confirm the raw block really is
    // composite here (otherwise this test would pass trivially, for the
    // wrong reason, on a document shape that doesn't actually trigger it).
    expect(Array.isArray(rawBlock.type)).toBe(true);
    expect(rawBlock.top).toBeLessThan(resolvedTop);

    const rect = markerRects(view)[0]!;
    expect(parseFloat(rect.style.top)).toBe(resolvedTop);
    expect(parseFloat(rect.style.top)).toBeGreaterThan(rawBlock.top);
  });

  it('does not throw and still renders for an unclosed fence at document end', async () => {
    const view = await mountView('before\n```js\nconst x = 1;');
    expect(markerRects(view)).toHaveLength(1);
  });

  it('does not throw for an empty fenced block', async () => {
    const view = await mountView('```js\n```');
    expect(markerRects(view)).toHaveLength(1);
  });

  it('shrinks to the single visible line once the block is folded, and restores its full height on unfold', async () => {
    const view = await mountView('```ts\nconst x = 1\nconst y = 2\n```');
    const beforeHeight = parseFloat(markerRects(view)[0]!.style.height);

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();

    const foldedHeight = parseFloat(markerRects(view)[0]!.style.height);
    expect(foldedHeight).toBeLessThan(beforeHeight);

    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    collapsedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();

    const restoredHeight = parseFloat(markerRects(view)[0]!.style.height);
    expect(restoredHeight).toBe(beforeHeight);
  });

  it('folding one of two adjacent blocks leaves the other block\'s rectangle untouched', async () => {
    const view = await mountView('```js\none();\ntwo();\n```\n```css\nthree{}\nfour{}\n```');
    const beforeSecond = markerRects(view)[1]!.style.height;

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();

    expect(markerRects(view)).toHaveLength(2);
    expect(markerRects(view)[1]!.style.height).toBe(beforeSecond);
  });

  it('the marker carries no --folded modifier while expanded, gains it on fold, and loses it again on unfold', async () => {
    const view = await mountView('```ts\nconst x = 1\nconst y = 2\n```');
    expect(markerRects(view)[0]!.classList.contains('cm-fenced-code-bg--folded')).toBe(false);

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();
    expect(markerRects(view)[0]!.classList.contains('cm-fenced-code-bg--folded')).toBe(true);

    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    collapsedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();
    expect(markerRects(view)[0]!.classList.contains('cm-fenced-code-bg--folded')).toBe(false);
  });

  it('folding one of two adjacent blocks only marks the folded one --folded', async () => {
    const view = await mountView('```js\none();\ntwo();\n```\n```css\nthree{}\nfour{}\n```');

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMeasure();

    expect(markerRects(view)[0]!.classList.contains('cm-fenced-code-bg--folded')).toBe(true);
    expect(markerRects(view)[1]!.classList.contains('cm-fenced-code-bg--folded')).toBe(false);
  });

  it('removes the rectangle when its fenced block is deleted, and adds a new one when a block is typed', async () => {
    const view = await mountView('```js\none();\n```');
    expect(markerRects(view)).toHaveLength(1);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'no code anymore' } });
    forceParsing(view);
    await flushMeasure();
    expect(markerRects(view)).toHaveLength(0);

    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n```py\nx = 1\n```' } });
    forceParsing(view);
    await flushMeasure();
    expect(markerRects(view)).toHaveLength(1);
  });
});
