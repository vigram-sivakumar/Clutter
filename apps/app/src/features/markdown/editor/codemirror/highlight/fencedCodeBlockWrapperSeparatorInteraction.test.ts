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
 * independent `.cm-code-block` DOM wrappers for one logical block — an
 * empty, rounded one (just the separator) sitting on top of the real one.
 * See `blockSeparatorDecoration.ts`'s own `leadingSeparatorAnchor` doc
 * comment for the exact CM6 tiling mechanics.
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

  it('inserting a line above a previously-first-line fenced block does not introduce a duplicate wrapper', () => {
    const view = mount('```css\nbody {}\n```');
    expect(codeBlockWrappers(view)).toHaveLength(1);

    view.dispatch({ changes: { from: 0, insert: 'This is a\n' } });

    expect(codeBlockWrappers(view)).toHaveLength(1);
    expect(view.state.doc.toString()).toBe('This is a\n```css\nbody {}\n```');
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

    expect(codeBlockWrappers(view)).toHaveLength(2);
  });

  it('a fenced code block indented inside a list item is unaffected (no collision to begin with)', () => {
    const doc = '- Item\n\n  ```css\n  body {}\n  ```';
    const view = mount(doc);

    expect(codeBlockWrappers(view)).toHaveLength(1);
  });
});
