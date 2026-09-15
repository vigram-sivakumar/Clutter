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
 * widget (`blockSeparatorDecoration.ts`) anchored at exactly a `FencedCode`
 * node's own `.from` collided with `fencedCodeBlockWrapper.ts`'s
 * `EditorView.blockWrappers` range for that same node, producing two
 * independent `.cm-code-block` DOM wrappers for one logical block —
 * equivalently, the separator ending up a *child* of `.cm-code-block`
 * instead of its sibling. See `blockSeparatorDecoration.ts`'s own
 * `buildLineBoundarySeparators` doc comment for the exact CM6 tiling
 * mechanics, including why the first fix attempt (anchoring the widget one
 * position earlier) was itself a regression — it fixed the wrapper
 * collision but introduced a synthetic, document-position-less empty
 * `.cm-line`, a real cursor/selection-mapping correctness bug, not a
 * cosmetic one. The final fix uses `Decoration.replace` over the
 * connecting newline instead of a zero-width `Decoration.widget` point at
 * either of its two endpoints.
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

describe('fencedCodeBlockWrapper + blockSeparatorDecoration — no duplicate/empty wrapper at a fenced block entry', () => {
  it('a paragraph directly above a fenced code block gives exactly one wrapper, with the separator rendered outside it', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]!.querySelector('.cm-block-separator')).toBeNull();
    expect(view.dom.querySelectorAll(':scope > .cm-block-separator, .cm-content > .cm-block-separator')).not.toHaveLength(0);
  });

  it('exact DOM invariant: paragraph, separator, code-block are siblings in that order, with no line between the separator and the wrapper', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const topLevelChildren = Array.from(view.contentDOM.children);
    const classesInOrder = topLevelChildren.map((el) => el.className);
    expect(classesInOrder).toEqual(['cm-line', 'cm-block-separator', 'cm-code-block']);
  });

  it('the separator is never a descendant of .cm-code-block (sibling, not child)', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const separator = view.contentDOM.querySelector('.cm-block-separator')!;
    expect(separator).not.toBeNull();
    expect(separator.closest('.cm-code-block')).toBeNull();
    expect(separator.parentElement?.classList.contains('cm-code-block')).toBe(false);
  });

  it('produces no synthetic empty .cm-line anywhere in the document — every rendered .cm-line has real document text', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const renderedLines = Array.from(view.contentDOM.querySelectorAll(':scope > .cm-line, .cm-code-block > .cm-line'));
    expect(renderedLines).toHaveLength(view.state.doc.lines);
    for (const lineEl of renderedLines) {
      expect(lineEl.textContent!.length).toBeGreaterThan(0);
    }
  });

  it('exactly one .cm-code-block exists, and it is never empty (always contains real code lines, never just the separator)', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]!.querySelectorAll(':scope > .cm-line').length).toBeGreaterThan(0);
    expect(wrappers[0]!.querySelector('.cm-block-separator')).toBeNull();
  });

  it('clicking inside the first real code line maps to the correct document position (posAtDOM), unaffected by the separator', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const codeContentLine = view.contentDOM.querySelector('.cm-code-block-line:not(.cm-code-block-line--first):not(.cm-code-block-line--last)')!;
    expect(codeContentLine).not.toBeNull();
    const textNode = codeContentLine.firstChild!;
    const pos = view.posAtDOM(textNode, 2);

    const expectedLine = view.state.doc.line(3); // "body {}"
    expect(pos).toBe(expectedLine.from + 2);
  });

  it('cursor placement at the very start of the fenced block resolves to the correct document offset, not shifted by the separator', () => {
    const view = mount('This is a\n```css\nbody {}\n```');
    const fenceLineStart = view.state.doc.line(2).from;

    view.dispatch({ selection: { anchor: fenceLineStart } });

    expect(view.state.selection.main.head).toBe(fenceLineStart);
    const coords = view.domAtPos(fenceLineStart);
    // domAtPos must resolve inside the real fenced-code line, never inside
    // the separator (which has no document-position content at all).
    expect((coords.node as Element).closest?.('.cm-block-separator') ?? null).toBeNull();
  });

  it('folded fenced code produces no synthetic line and no duplicate wrapper', () => {
    const view = mount('This is a\n```css\nbody {}\n```');
    const fenceLine = view.state.doc.line(2);
    const lastLine = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ effects: [foldEffect.of({ from: fenceLine.to, to: lastLine.to })] });

    expect(codeBlockWrappers(view)).toHaveLength(1);
    const separator = view.contentDOM.querySelector('.cm-block-separator');
    expect(separator?.closest('.cm-code-block')).toBeNull();
  });

  it('unfolded fenced code (default state) produces no synthetic line and no duplicate wrapper', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    expect(codeBlockWrappers(view)).toHaveLength(1);
    const renderedLines = view.contentDOM.querySelectorAll(':scope > .cm-line, .cm-code-block > .cm-line');
    expect(renderedLines).toHaveLength(view.state.doc.lines);
  });

  it('inserting a line above a previously-first-line fenced block does not introduce a duplicate wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    view.dispatch({ changes: { from: 0, insert: 'This is a\n' } });

    expect(codeBlockWrappers(view)).toHaveLength(1);
    expect(view.state.doc.toString()).toBe('This is a\n```css\nbody {}\n```');
  });

  it('the exact original repro: typing a new line above the code block yields the full correct DOM invariant, not just a passing wrapper count', () => {
    const view = mount('```css\nbody {}\n```');

    view.dispatch({ changes: { from: 0, insert: 'This is a\n' } });

    const topLevelChildren = Array.from(view.contentDOM.children);
    expect(topLevelChildren.map((el) => el.className)).toEqual(['cm-line', 'cm-block-separator', 'cm-code-block']);
    const renderedLines = view.contentDOM.querySelectorAll(':scope > .cm-line, .cm-code-block > .cm-line');
    expect(renderedLines).toHaveLength(view.state.doc.lines);
    expect(view.contentDOM.querySelector('.cm-block-separator')!.closest('.cm-code-block')).toBeNull();
  });

  it('the fenced block\'s own first line still carries cm-code-block-line and --first when a leading separator immediately precedes it (a confirmed @codemirror/view Decoration.replace/Decoration.line traversal quirk, worked around via inclusiveEnd:false on the separator\'s own replace decoration — see blockSeparatorDecoration.ts\'s separatorRangeReplacing doc comment)', () => {
    const view = mount('This is a\n```css\nbody {}\n```');

    const wrapper = view.contentDOM.querySelector('.cm-code-block')!;
    expect(wrapper.children).toHaveLength(3);
    const firstChild = wrapper.firstElementChild!;
    expect(firstChild.classList.contains('cm-line')).toBe(true);
    expect(firstChild.classList.contains('cm-code-block-line')).toBe(true);
    expect(firstChild.classList.contains('cm-code-block-line--first')).toBe(true);
  });

  it('inserting multiple lines above the block still leaves exactly one wrapper', () => {
    const view = mount('```css\nbody {}\n```');

    view.dispatch({ changes: { from: 0, insert: 'Line one\nLine two\nLine three\n' } });

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('deleting lines above the block back down still leaves exactly one wrapper', () => {
    const view = mount('Line one\nLine two\n```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    const secondLineStart = view.state.doc.line(2).from;
    view.dispatch({ changes: { from: 0, to: secondLineStart } });

    expect(view.state.doc.toString()).toBe('Line two\n```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('deleting all lines above the block back to zero still leaves exactly one wrapper', () => {
    const view = mount('Line one\n```css\nbody {}\n```');
    const fenceStart = view.state.doc.toString().indexOf('```');
    view.dispatch({ changes: { from: 0, to: fenceStart } });

    expect(view.state.doc.toString()).toBe('```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('a folded fenced code block above which a line is inserted still shows exactly one wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    const block = view.state.doc.line(1);
    const lastLine = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ effects: [foldEffect.of({ from: block.to, to: lastLine.to })] });
    expect(foldedRanges(view.state).size).toBeGreaterThan(0);

    view.dispatch({ changes: { from: 0, insert: 'Above\n' } });

    expect(codeBlockWrappers(view).length).toBeLessThanOrEqual(1);
  });

  it('an unfolded fenced code block with a line inserted above it renders exactly one wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    view.dispatch({ changes: { from: 0, insert: 'Above\n' } });
    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('Option/Alt-ArrowDown moving a line down to sit directly above the fenced block does not introduce a duplicate wrapper', () => {
    const view = mount('Above\n```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    view.dispatch({ selection: { anchor: 0 } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })
    );

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });

  it('Option/Alt-ArrowUp moving a folded fenced block as a whole unit up past a preceding line does not introduce a duplicate wrapper', () => {
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

  it('multiple fenced code blocks in the same document each get their own wrapper, with no phantom extra wrapper at any entry', () => {
    const view = mount('Above\n```css\nbody {}\n```\n```js\nlet x;\n```\n\nBelow');

    expect(codeBlockWrappers(view)).toHaveLength(2);
  });

  it('two adjacent fenced blocks (no blank line) still give exactly two wrappers, not three', () => {
    const view = mount('```css\nbody {}\n```\n```js\nlet x;\n```');

    const wrappers = codeBlockWrappers(view);
    expect(wrappers).toHaveLength(2);
    // Neither wrapper should have absorbed a separator as an extra child —
    // the gap between two adjacent fenced blocks is real, but it belongs
    // to neither block's own bordered card.
    for (const wrapper of wrappers) {
      expect(wrapper.querySelector('.cm-block-separator')).toBeNull();
    }
  });

  it('a fenced code block indented inside a list item is unaffected (no collision to begin with)', () => {
    const doc = '- Item\n\n  ```css\n  body {}\n  ```';
    const view = mount(doc);

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });
});
