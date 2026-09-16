// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldEffect, foldedRanges } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';
import { fencedCodeBlockWrapper } from './fencedCodeBlockWrapper';
import { fencedCodeBlockLineDecoration } from './fencedCodeBlockLineDecoration';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';

/**
 * Regression coverage for the reported bug: a leading `.cm-block-separator`
 * widget, anchored (like every other separator in this system) at exactly
 * `state.doc.line(n).from`, coincided with a `FencedCode` node's own
 * `.from` when line `n` opens an unindented fenced block — the same
 * position `fencedCodeBlockWrapper.ts`'s `EditorView.blockWrappers` range
 * starts at for that node. CM6's own block-tiling activates that wrapper
 * the moment its builder-position counter reaches `.from`, inclusively; a
 * zero-width widget never advances that counter, so the widget was
 * absorbed as a spurious extra `.cm-code-block` containing nothing but the
 * separator, immediately followed by the *real* wrapper for the actual
 * fence content. See `blockSeparatorDecoration.ts`'s own
 * `separatorPointAfterPreviousLine` doc comment for the exact mechanism and fix.
 *
 * Deliberately mounts through `createEditorView` (the real production
 * factory) with the real fenced-code + separator + fold extensions
 * together, rather than a hand-picked minimal extension list —
 * `fencedCodeBlockWrapper.test.ts`'s own minimal harness (no
 * `blockSeparatorDecoration`) is exactly why this cross-extension
 * interaction bug went uncaught originally.
 */
function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditorView({
    doc,
    parent,
    extensions: [markdownLanguageExtension(), fencedCodeBlockWrapper(), fencedCodeBlockLineDecoration(), blockSeparatorDecoration()],
  });
}

function codeBlockWrappers(view: EditorView) {
  return Array.from(view.dom.querySelectorAll('.cm-code-block'));
}

describe('fencedCodeBlockWrapper + blockSeparatorDecoration — no extra .cm-code-block wrapper around the separator', () => {
  it('the exact reported case: paragraph, then a fenced code block — exactly one .cm-code-block, separator is its own top-level sibling, never a descendant', () => {
    const view = mount('paragraph\n```css\ncode\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(1);

    const topLevelChildren = Array.from(view.contentDOM.children);
    expect(topLevelChildren.map((el) => el.className)).toEqual(['cm-line', 'cm-block-separator', 'cm-code-block']);

    const separator = view.contentDOM.querySelector('.cm-block-separator')!;
    expect(separator.closest('.cm-code-block')).toBeNull();
    expect(wrappers[0]!.querySelector('.cm-block-separator')).toBeNull();
  });

  it('the real fenced-code wrapper is unaffected: still contains every real line, with correct --first/--last classes', () => {
    const view = mount('paragraph\n```css\ncode\n```');

    const wrapper = view.dom.querySelector('.cm-code-block')!;
    const lines = Array.from(wrapper.querySelectorAll(':scope > .cm-line'));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.classList.contains('cm-code-block-line')).toBe(true);
    expect(lines[0]!.classList.contains('cm-code-block-line--first')).toBe(true);
    expect(lines[2]!.classList.contains('cm-code-block-line--last')).toBe(true);
  });

  it('produces no synthetic empty .cm-line anywhere — every rendered line has real document text', () => {
    const view = mount('paragraph\n```css\ncode\n```');

    const renderedLines = view.contentDOM.querySelectorAll(':scope > .cm-line, .cm-code-block > .cm-line');
    expect(renderedLines).toHaveLength(view.state.doc.lines);
  });

  it('clicking inside the fenced block maps to the correct document position (posAtDOM), unaffected by the separator', () => {
    const view = mount('paragraph\n```css\ncode\n```');

    const codeContentLine = view.contentDOM.querySelector(
      '.cm-code-block-line:not(.cm-code-block-line--first):not(.cm-code-block-line--last)'
    )!;
    const textNode = codeContentLine.firstChild!;
    const pos = view.posAtDOM(textNode, 2);

    const expectedLine = view.state.doc.line(3); // "code"
    expect(pos).toBe(expectedLine.from + 2);
  });

  it('inserting a line above a previously-first-line fenced block does not introduce an extra wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    view.dispatch({ changes: { from: 0, insert: 'This is a\n' } });

    expect(codeBlockWrappers(view)).toHaveLength(1);
    expect(view.contentDOM.querySelector('.cm-block-separator')!.closest('.cm-code-block')).toBeNull();
  });

  it('deleting lines above the block back down still leaves exactly one wrapper', () => {
    const view = mount('Line one\nLine two\n```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    const secondLineStart = view.state.doc.line(2).from;
    view.dispatch({ changes: { from: 0, to: secondLineStart } });

    expect(view.state.doc.toString()).toBe('Line two\n```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('a folded fenced code block above which a line is inserted still shows exactly one wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    const block = view.state.doc.line(1);
    const lastLine = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ effects: [foldEffect.of({ from: block.to, to: lastLine.to })] });
    expect(foldedRanges(view.state).size).toBeGreaterThan(0);

    view.dispatch({ changes: { from: 0, insert: 'Above\n' } });

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('Option/Alt-ArrowUp moving a folded fenced block as a whole unit up past a preceding line does not introduce an extra wrapper', () => {
    const view = mount('Above\n```css\nbody {}\n```');
    const fenceLine = view.state.doc.line(2);
    const lastLine = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ effects: [foldEffect.of({ from: fenceLine.to, to: lastLine.to })] });
    expect(codeBlockWrappers(view)).toHaveLength(1);

    view.dispatch({ selection: { anchor: fenceLine.from } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })
    );

    expect(view.state.doc.toString()).toBe('```css\nbody {}\n```\nAbove');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('multiple fenced code blocks (blank-line-separated) each get their own wrapper, with no phantom extra wrapper at either entry', () => {
    const view = mount('Above\n```css\nbody {}\n```\n\n```js\nlet x;\n```\n\nBelow');

    expect(codeBlockWrappers(view)).toHaveLength(2);
  });

  it('a fenced code block indented inside a list item is unaffected (no collision to begin with)', () => {
    const doc = '- Item\n\n  ```css\n  body {}\n  ```';
    const view = mount(doc);

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });
});

/**
 * Two directly-adjacent `FencedCode` blocks (no blank line between them —
 * legal CommonMark) previously had no document position outside *both*
 * wrappers' inclusive `[from, to]` ranges for a separator to occupy: the
 * connecting newline sat at the first block's own `.to`, which
 * `TileBuilder.updateBlockWrappers`'s coverage check (`cur.to >= this.pos`)
 * treated as still "inside" that wrapper. `fencedCodeBlockWrapper.ts` now
 * gives each wrapper the range `[node.from, node.to - 1)` — the range its
 * own `BlockWrapper` type declaration already documents (`[from, to)`,
 * explicitly not including `to`) — which frees exactly that one
 * character for every boundary uniformly, including this one. No
 * adjacent-block special case exists anywhere in `blockSeparatorDecoration.ts`
 * — the same `separatorPointAfterPreviousLine` path used for every other
 * fenced-code entry now works here too, unconditionally.
 */
describe('fencedCodeBlockWrapper + blockSeparatorDecoration — directly adjacent fenced blocks (no blank line)', () => {
  it('two adjacent fenced blocks: exactly two wrappers, with a genuine 12px separator between them', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(2);

    const topLevelChildren = Array.from(view.contentDOM.children);
    expect(topLevelChildren.map((el) => el.className)).toEqual(['cm-code-block', 'cm-block-separator', 'cm-code-block']);

    const separator = view.contentDOM.querySelector('.cm-block-separator') as HTMLElement;
    expect(separator).not.toBeNull();
    expect(separator.style.height).toBe('12px');
  });

  it('the separator is inside neither wrapper', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');

    const wrappers = codeBlockWrappers(view);
    for (const wrapper of wrappers) {
      expect(wrapper.querySelector('.cm-block-separator')).toBeNull();
    }
    const separator = view.contentDOM.querySelector('.cm-block-separator')!;
    expect(separator.closest('.cm-code-block')).toBeNull();
  });

  it('each wrapper still has exactly its own 3 real lines, with correct --first/--last classes on both blocks', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');

    const wrappers = codeBlockWrappers(view);
    for (const wrapper of wrappers) {
      const lines = Array.from(wrapper.querySelectorAll(':scope > .cm-line'));
      expect(lines).toHaveLength(3);
      expect(lines[0]!.classList.contains('cm-code-block-line--first')).toBe(true);
      expect(lines[1]!.classList.contains('cm-code-block-line--first')).toBe(false);
      expect(lines[1]!.classList.contains('cm-code-block-line--last')).toBe(false);
      expect(lines[2]!.classList.contains('cm-code-block-line--last')).toBe(true);
    }
  });

  it('no synthetic empty .cm-line — every rendered line still has real document text', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');

    const renderedLines = view.contentDOM.querySelectorAll(':scope > .cm-line, .cm-code-block > .cm-line');
    expect(renderedLines).toHaveLength(view.state.doc.lines);
  });

  it('cursor placed at the closing fence\'s own last character resolves to the correct document offset', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');
    const closingFenceLine = view.state.doc.line(3); // "```"
    const lastCharPos = closingFenceLine.to - 1;

    view.dispatch({ selection: { anchor: lastCharPos } });

    expect(view.state.selection.main.head).toBe(lastCharPos);
  });

  it('posAtDOM into the second block\'s own first line maps to the correct document position', () => {
    const view = mount('```css\ncode1\n```\n```js\ncode2\n```');

    const wrappers = codeBlockWrappers(view);
    const secondBlockContentLine = wrappers[1]!.querySelector(
      '.cm-code-block-line:not(.cm-code-block-line--first):not(.cm-code-block-line--last)'
    )!;
    const textNode = secondBlockContentLine.firstChild!;
    const pos = view.posAtDOM(textNode, 2);

    const expectedLine = view.state.doc.line(5); // "code2"
    expect(pos).toBe(expectedLine.from + 2);
  });

  it('folding the first block still works and leaves the second block\'s own wrapper untouched', () => {
    const view = mount('```css\ncode1\nmore\n```\n```js\ncode2\n```');
    const fenceLine = view.state.doc.line(1);
    const closeLine = view.state.doc.line(4);

    view.dispatch({ effects: [foldEffect.of({ from: fenceLine.to, to: closeLine.to })] });

    expect(foldedRanges(view.state).size).toBe(1);
    expect(codeBlockWrappers(view)).toHaveLength(2);
  });

  it('three directly-adjacent fenced blocks each get their own wrapper, with a separator between every pair, none absorbed into any wrapper', () => {
    const view = mount('```\na\n```\n```\nb\n```\n```\nc\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(3);

    const separators = view.contentDOM.querySelectorAll('.cm-block-separator');
    expect(separators).toHaveLength(2);
    for (const separator of Array.from(separators)) {
      expect(separator.closest('.cm-code-block')).toBeNull();
    }
    for (const wrapper of wrappers) {
      expect(wrapper.querySelector('.cm-block-separator')).toBeNull();
    }
  });
});

describe('fencedCodeBlockWrapper + blockSeparatorDecoration — the other three boundary shapes stay exactly as before', () => {
  it('normal block -> fenced code: 12px separator, one wrapper', () => {
    const view = mount('paragraph\n```css\ncode\n```');

    const separator = view.contentDOM.querySelector('.cm-block-separator') as HTMLElement;
    expect(separator.style.height).toBe('12px');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('fenced code -> normal block: 12px separator, one wrapper', () => {
    const view = mount('```css\ncode\n```\nparagraph');

    const topLevelChildren = Array.from(view.contentDOM.children);
    expect(topLevelChildren.map((el) => el.tagName === 'DIV' && el.className.split(' ')[0])).toEqual([
      'cm-code-block',
      'cm-block-separator',
      'cm-line',
    ]);
    const separator = view.contentDOM.querySelector('.cm-block-separator') as HTMLElement;
    expect(separator.style.height).toBe('12px');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('fenced code -> blank line -> fenced code: two 12px separators, two wrappers', () => {
    const view = mount('```css\ncode1\n```\n\n```js\ncode2\n```');

    const separators = Array.from(view.contentDOM.querySelectorAll('.cm-block-separator')) as HTMLElement[];
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.style.height).toBe('12px');
      expect(separator.closest('.cm-code-block')).toBeNull();
    }
    expect(codeBlockWrappers(view)).toHaveLength(2);
  });
});
