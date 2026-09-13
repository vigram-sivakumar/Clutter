// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeFolding, forceParsing } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { foldToggleDecoration } from '../fold/foldToggleDecoration';
import { fencedCodeBlockLineDecoration } from './fencedCodeBlockLineDecoration';
import { fencedCodeBlockWrapper } from './fencedCodeBlockWrapper';

function mountView(doc: string, extraExtensions: readonly Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      fencedCodeBlockWrapper(),
      fencedCodeBlockLineDecoration(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

type EdgeMark = 'first' | 'last' | 'both' | 'middle' | 'plain';

function edgeMarks(view: EditorView): EdgeMark[] {
  return Array.from(view.dom.querySelectorAll('.cm-line')).map((line) => {
    if (!line.classList.contains('cm-code-block-line')) {
      return 'plain';
    }
    const first = line.classList.contains('cm-code-block-line--first');
    const last = line.classList.contains('cm-code-block-line--last');
    if (first && last) return 'both';
    if (first) return 'first';
    if (last) return 'last';
    return 'middle';
  });
}

describe('fencedCodeBlockLineDecoration (composed with fencedCodeBlockWrapper)', () => {
  it('applies the visual-card class to every line, and no others', () => {
    const view = mountView(
      ['before', '```js', 'const a = 1;', 'const b = 2;', '```', 'after'].join('\n')
    );

    const marks = edgeMarks(view);
    expect(marks).toEqual(['plain', 'first', 'middle', 'middle', 'last', 'plain']);
  });

  it('a single-line-body block marks its one line both --first and --last', () => {
    const view = mountView(['```js', 'x', '```'].join('\n'));
    expect(edgeMarks(view)).toEqual(['first', 'middle', 'last']);
  });

  it('two back-to-back blocks (no blank line, already two independent blockWrappers) each get their own correct --first/--last pair', () => {
    const view = mountView(['```js', 'one', '```', '```py', 'two', '```'].join('\n'));
    expect(edgeMarks(view)).toEqual(['first', 'middle', 'last', 'first', 'middle', 'last']);
  });

  it('every visually-carded line is a real DOM child of its own .cm-code-block wrapper, never a sibling', () => {
    const view = mountView(['```js', 'one', '```', '```py', 'two', '```'].join('\n'));
    const wrappers = view.dom.querySelectorAll('.cm-code-block');
    expect(wrappers).toHaveLength(2);

    wrappers.forEach((wrapper) => {
      const cardLines = wrapper.querySelectorAll(':scope > .cm-code-block-line');
      expect(cardLines).toHaveLength(3);
    });
  });

  it('includes a genuinely blank interior line as part of the card', () => {
    const view = mountView(['```', 'line one', '', 'line two', '```'].join('\n'));
    expect(edgeMarks(view)).toEqual(['first', 'middle', 'middle', 'middle', 'last']);
  });

  it('does not throw for an unclosed fence at document end', () => {
    expect(() => mountView(['before', '```js', 'const x = 1;'].join('\n'))).not.toThrow();
  });

  it('an unclosed fence with only the opening/info line marks that line both --first and --last', () => {
    const view = mountView('```css');
    expect(edgeMarks(view)).toEqual(['both']);
  });

  it('an unclosed opening-only fence followed by the document\'s own trailing newline still marks its one real line both --first and --last', () => {
    const view = mountView('```css\n');
    expect(edgeMarks(view)).toEqual(['both', 'plain']);
  });
});

function activeLineTexts(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.cm-code-block-line--active')).map(
    (line) => line.textContent ?? ''
  );
}

describe('fencedCodeBlockLineDecoration — active line', () => {
  const doc = ['before', '```js', 'const a = 1;', 'const b = 2;', '```', 'after'].join('\n');

  it('marks no line active when the caret is outside any fenced block', () => {
    const view = mountView(doc);
    view.dispatch({ selection: { anchor: 0 } }); // "before"
    expect(activeLineTexts(view)).toEqual([]);
  });

  it('marks exactly the line containing the caret when it is inside a fenced block', () => {
    const view = mountView(doc);
    const secondLineFrom = view.state.doc.line(3).from; // "const a = 1;"
    view.dispatch({ selection: { anchor: secondLineFrom + 2 } });
    expect(activeLineTexts(view)).toEqual(['const a = 1;']);
  });

  it('moves the active line as the caret moves between lines within the same block', () => {
    const view = mountView(doc);
    view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
    expect(activeLineTexts(view)).toEqual(['const a = 1;']);

    view.dispatch({ selection: { anchor: view.state.doc.line(4).from } });
    expect(activeLineTexts(view)).toEqual(['const b = 2;']);
  });

  it('clears the active line once the caret leaves the block', () => {
    const view = mountView(doc);
    view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
    expect(activeLineTexts(view)).toEqual(['const a = 1;']);

    view.dispatch({ selection: { anchor: view.state.doc.line(6).from } }); // "after"
    expect(activeLineTexts(view)).toEqual([]);
  });

  it('only marks the block the caret is actually in when multiple blocks are present', () => {
    const twoBlocks = ['```js', 'one', '```', '```py', 'two', '```'].join('\n');
    const view = mountView(twoBlocks);
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } }); // "two"
    expect(activeLineTexts(view)).toEqual(['two']);
  });

  it('does not mark every line of a multi-line selection — head-only, not range-wide', () => {
    const view = mountView(doc);
    const from = view.state.doc.line(3).from; // "const a = 1;"
    const to = view.state.doc.line(4).to; // "const b = 2;"
    view.dispatch({ selection: { anchor: from, head: to } });
    expect(activeLineTexts(view)).toEqual(['const b = 2;']);
  });

  it('never marks the opening fence line active, even with the caret on it', () => {
    const view = mountView(doc);
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } }); // "```js"
    expect(activeLineTexts(view)).toEqual([]);
  });

  it('never marks the closing fence line active, even with the caret on it', () => {
    const view = mountView(doc);
    view.dispatch({ selection: { anchor: view.state.doc.line(5).from } }); // "```"
    expect(activeLineTexts(view)).toEqual([]);
  });

  it('never marks a single-line/empty fence (both --first and --last) active', () => {
    const view = mountView('```css');
    view.dispatch({ selection: { anchor: view.state.doc.line(1).from } }); // "```css"
    expect(activeLineTexts(view)).toEqual([]);
  });
});

/**
 * Coverage for folding composed with this decoration: once a fenced code
 * block's body/closing-fence is folded (`codemirror/fold/
 * foldToggleDecoration.ts`), the opening fence line is the *only* line CM6
 * still renders for that block, so it correctly keeps just `--first` (never
 * gaining `--last`, since it isn't the block's structural last line) —
 * `.cm-code-block`'s own border/radius (`MarkdownEditor.css`) are painted
 * unconditionally on the always-present wrapper, independent of how many
 * child lines are currently visible, so no per-line `--last` workaround is
 * needed to keep the card's border/radius intact while collapsed. This
 * composes `fencedCodeBlockLineDecoration()` with the real `codeFolding()` +
 * `foldToggleDecoration()` extensions (not a hand-rolled fold effect) so the
 * test exercises the exact same path a real click does.
 */
describe('fencedCodeBlockLineDecoration — composed with folding: the visible line keeps only --first while collapsed', () => {
  function mountFoldable(doc: string): EditorView {
    const view = mountView(doc, [codeFolding(), foldToggleDecoration()]);
    forceParsing(view);
    return view;
  }

  it('a multi-line block\'s opening line stays --first-only once its body is folded, and unfolding restores the full --first/middle/middle/--last set', () => {
    const view = mountFoldable('```ts\nconst x = 1\nconst y = 2\n```');

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(edgeMarks(view)).toEqual(['first', 'middle', 'middle', 'last']);

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const collapsedLine = view.dom.querySelector('.cm-code-block-line') as HTMLElement;
    expect(collapsedLine.classList.contains('cm-code-block-line--first')).toBe(true);
    expect(collapsedLine.classList.contains('cm-code-block-line--last')).toBe(false);

    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    collapsedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(edgeMarks(view)).toEqual(['first', 'middle', 'middle', 'last']);
  });
});
