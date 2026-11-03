// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { redo, undo, history } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { fencedCodeFenceAutoClose } from './fencedCodeFenceAutoClose';

function mountView(doc: string, cursor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdownLanguageExtension(), history(), fencedCodeFenceAutoClose()],
  });
  return new EditorView({ state, parent });
}

/**
 * `markdownLanguageExtension()` registers its own unrelated `inputHandler`
 * too, so — matching CM6's own `.some(h => h(...))` combination — every
 * registered handler must be tried, not just the first.
 */
function typeBacktick(view: EditorView, pos: number): boolean {
  const handlers = view.state.facet(EditorView.inputHandler);
  return handlers.some((h) =>
    h(view, pos, pos, '`', () => {
      throw new Error('not used by fencedCodeFenceAutoClose');
    })
  );
}

describe('fencedCodeFenceAutoClose — core behavior', () => {
  it('a bare opening fence auto-inserts the closing fence, cursor staying right after the opening fence', () => {
    const view = mountView('``', 2);
    const handled = typeBacktick(view, 2);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('```\n```');
    expect(view.state.selection.main.head).toBe(3);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('a language identifier can be typed immediately afterward', () => {
    const view = mountView('``', 2);
    typeBacktick(view, 2);

    view.dispatch({
      changes: { from: 3, to: 3, insert: 'css' },
      selection: EditorSelection.cursor(6),
    });

    expect(view.state.doc.toString()).toBe('```css\n```');
    expect(view.state.selection.main.head).toBe(6);
  });

  it('does not insert a blank code-content line', () => {
    const view = mountView('``', 2);
    typeBacktick(view, 2);

    expect(view.state.doc.lines).toBe(2);
  });

  it('is a single transaction — one Undo/Redo round-trips the whole scaffold', () => {
    const view = mountView('``', 2);
    typeBacktick(view, 2);
    expect(view.state.doc.toString()).toBe('```\n```');

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('``');

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('```\n```');
  });

  it('does not trigger for an inline backtick pair mid-paragraph', () => {
    const view = mountView('some `code` here', 6);
    expect(typeBacktick(view, 6)).toBe(false);
  });

  it('does not trigger for backticks appearing mid-line after other text', () => {
    const view = mountView('abc``', 5);
    expect(typeBacktick(view, 5)).toBe(false);
    expect(view.state.doc.toString()).toBe('abc``');
  });

  it('does not trigger when typing the closing fence of an already-open block', () => {
    const doc = ['```js', 'const a = 1;', '``'].join('\n');
    const view = mountView(doc, doc.length);

    expect(typeBacktick(view, doc.length)).toBe(false);
  });

  it('does not trigger for a fourth backtick (standard three-backtick fences only)', () => {
    const view = mountView('```', 3);
    expect(typeBacktick(view, 3)).toBe(false);
  });

  it('does not trigger when an info string is already present on the line', () => {
    const view = mountView('``js', 2);
    expect(typeBacktick(view, 2)).toBe(false);
  });

  it('a plain-indented opening fence keeps that same indentation on the closing line', () => {
    const view = mountView('   ``', 5);
    const handled = typeBacktick(view, 5);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('   ```\n```');
  });

  it('four or more spaces is an indented code block, not a fence, so no closing fence is added', () => {
    const view = mountView('    ``', 6);
    const handled = typeBacktick(view, 6);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('    ``');
  });
});

describe('fencedCodeFenceAutoClose — container contexts (separate investigation)', () => {
  it('blockquote: closing fence is NOT prefixed with ">", so it falls outside the blockquote', () => {
    const view = mountView('> ``', 4);
    const handled = typeBacktick(view, 4);

    expect(handled).toBe(true);
    // Confirmed via the syntax tree: without a "> " prefix, the second
    // line no longer parses as part of the blockquote at all.
    expect(view.state.doc.toString()).toBe('> ```\n```');
    const secondLineIsInBlockquote = (() => {
      const line2 = view.state.doc.line(2);
      let node: import('@lezer/common').SyntaxNode | null = syntaxTree(view.state).resolveInner(
        line2.from,
        1
      );
      for (; node; node = node.parent) {
        if (node.name === 'Blockquote') return true;
      }
      return false;
    })();
    expect(secondLineIsInBlockquote).toBe(false);
  });

  it("list item: closing fence is NOT indented to the marker's content column, so it falls outside the list item", () => {
    const view = mountView('- ``', 4);
    const handled = typeBacktick(view, 4);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- ```\n```');
    const secondLineIsInListItem = (() => {
      const line2 = view.state.doc.line(2);
      let node: import('@lezer/common').SyntaxNode | null = syntaxTree(view.state).resolveInner(
        line2.from,
        1
      );
      for (; node; node = node.parent) {
        if (node.name === 'ListItem') return true;
      }
      return false;
    })();
    expect(secondLineIsInListItem).toBe(false);
  });
});
