// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dedentListItem, indentListItem } from './listIndentKeymap';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

/**
 * Freshly reparses `text` from scratch (independent of any live view's
 * incrementally-updated tree) and returns how many `ListItem` ancestors
 * contain the line that has `needle` in it. This is what proves the
 * *Markdown source itself* is correctly nested — per requirement 9, a
 * fix here must hold up even in a completely different Markdown reader,
 * not just against this app's own live-view tree/decorations.
 */
function nestingDepthOf(text: string, needle: string): number {
  const language = markdownLanguageExtension().language;
  const tree = language.parser.parse(text);
  const targetLine = text.slice(0, text.indexOf(needle)).split('\n').length; // 1-based line number
  let depth = -1;
  let cursor = tree.cursor();
  function lineNumberAt(pos: number): number {
    return text.slice(0, pos).split('\n').length;
  }
  function visit(ancestorListItems: number) {
    if (cursor.name === 'ListItem' && lineNumberAt(cursor.from) === targetLine) {
      depth = ancestorListItems;
    }
    const nextAncestors = cursor.name === 'ListItem' ? ancestorListItems + 1 : ancestorListItems;
    if (cursor.firstChild()) {
      do {
        visit(nextAncestors);
      } while (cursor.nextSibling());
      cursor.parent();
    }
  }
  visit(0);
  return depth;
}

describe('indentListItem', () => {
  it('indents a list item, nesting it under the preceding item', () => {
    const doc = '- item1\n- item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = indentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2');
  });

  it('does nothing outside a list — plain paragraph', () => {
    const doc = 'plain paragraph';
    const view = mountView(doc, 3);

    const handled = indentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing when the selection spans a line outside any list', () => {
    // A blank line breaks lazy continuation, so "plain paragraph" is a
    // genuinely separate block here, not part of the list item's own
    // paragraph content.
    const doc = '- item1\n\nplain paragraph';
    const view = mountView(doc, 0);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });

    const handled = indentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('indents every list line spanned by a multi-line selection', () => {
    const doc = '- item1\n- item2\n- item3';
    const view = mountView(doc, 0);
    const from = doc.indexOf('item2');
    const to = doc.indexOf('item3') + 'item3'.length;
    view.dispatch({ selection: { anchor: from, head: to } });

    indentListItem(view);

    expect(view.state.doc.toString()).toBe('- item1\n  - item2\n  - item3');
  });

  describe('one Tab always moves exactly one nesting level, regardless of marker kind/width', () => {
    it('bullet: one Tab nests the child at the bullet\'s own 2-column content start', () => {
      const doc = '- Parent\n- Child';
      const view = mountView(doc, doc.indexOf('Child'));

      indentListItem(view);

      const result = view.state.doc.toString();
      expect(result).toBe('- Parent\n  - Child');
      expect(nestingDepthOf(result, 'Child')).toBe(1);
    });

    it('ordered "1.": one Tab nests the child at the 3-column content start — 2 spaces alone (the global indentUnit) would NOT be enough', () => {
      const doc = '1. Parent\n1. Child';
      const view = mountView(doc, doc.indexOf('Child'));

      indentListItem(view);

      const result = view.state.doc.toString();
      expect(result).toBe('1. Parent\n   1. Child');
      expect(nestingDepthOf(result, 'Child')).toBe(1);
    });

    it('ordered "10.": one Tab nests the child at the 4-column content start', () => {
      const doc = '10. Parent\n1. Child';
      const view = mountView(doc, doc.indexOf('Child'));

      indentListItem(view);

      const result = view.state.doc.toString();
      expect(result).toBe('10. Parent\n    1. Child');
      expect(nestingDepthOf(result, 'Child')).toBe(1);
    });

    it('task: one Tab nests the child under a task-owned ListItem, same as a plain bullet', () => {
      const doc = '- [ ] Parent\n- [ ] Child';
      const view = mountView(doc, doc.indexOf('Child'));

      indentListItem(view);

      const result = view.state.doc.toString();
      expect(result).toBe('- [ ] Parent\n  - [ ] Child');
      expect(nestingDepthOf(result, 'Child')).toBe(1);
    });

    it('emoji list: one Tab nests the child at the emoji marker\'s own content start', () => {
      const doc = '🍒 Parent\n🍒 Child';
      const view = mountView(doc, doc.indexOf('Child'));

      indentListItem(view);

      const result = view.state.doc.toString();
      expect(nestingDepthOf(result, 'Child')).toBe(1);
      // Content column derived from the actual marker width in the
      // document (🍒 + its separating space), not a hardcoded "2".
      expect(result.split('\n')[1]?.match(/^ */)?.[0].length).toBe(
        '🍒 '.length
      );
    });
  });

  it('repeated Tab, applied to progressively later items, builds a genuine multi-level staircase — not arbitrary over-indentation of one item', () => {
    // Indenting item2 once nests it under item1. Indenting item3 makes it
    // a sibling of item2 first (item3's immediate predecessor is item1,
    // not item2, once item2 has left the top-level list) — a second Tab
    // on item3 is what then nests it specifically under item2. This is
    // the only way to reach real depth-2 for item3: CommonMark has no
    // notion of a lone item skipping straight to depth 2 with nothing
    // between it and its depth-0 ancestor.
    const doc = '- item1\n- item2\n- item3';
    const view = mountView(doc, doc.indexOf('item2'));

    indentListItem(view);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2\n- item3');

    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('item3') } });
    indentListItem(view);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2\n  - item3');
    expect(nestingDepthOf(view.state.doc.toString(), 'item3')).toBe(1);

    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('item3') } });
    indentListItem(view);
    const final = view.state.doc.toString();
    expect(final).toBe('- item1\n  - item2\n    - item3');
    expect(nestingDepthOf(final, 'item2')).toBe(1);
    expect(nestingDepthOf(final, 'item3')).toBe(2);
  });
});

describe('dedentListItem', () => {
  it('removes one level of indentation from a nested list item', () => {
    const doc = '- item1\n  - item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = dedentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n- item2');
  });

  it('correctly moves a Tab-nested item back out to top level — Shift-Tab is unchanged by the Tab fix above', () => {
    const doc = '- Parent\n- Child';
    const view = mountView(doc, doc.indexOf('Child'));

    indentListItem(view);
    const nested = view.state.doc.toString();
    expect(nestingDepthOf(nested, 'Child')).toBe(1);

    view.dispatch({ selection: { anchor: nested.indexOf('Child') } });
    const handled = dedentListItem(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(result).toBe('- Parent\n- Child');
    expect(nestingDepthOf(result, 'Child')).toBe(0);
  });

  it('does nothing on a top-level item with no indentation left to remove', () => {
    const doc = '- item1';
    const view = mountView(doc, doc.indexOf('item1'));

    const handled = dedentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing outside a list', () => {
    const doc = '  plain paragraph';
    const view = mountView(doc, 5);

    const handled = dedentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
