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

/**
 * Whether `text` still contains a marker node of the given name anywhere
 * in a fresh parse — the strongest possible regression guard for the
 * "repeated Tab eventually reinterprets the item as plain paragraph text"
 * failure mode: a leading-space count alone can't distinguish genuine
 * nesting from a line that has merely accumulated whitespace after its
 * list-ness was already destroyed.
 */
function hasMarkerNode(text: string, markerName: string): boolean {
  const tree = markdownLanguageExtension().language.parser.parse(text);
  let found = false;
  tree.iterate({
    enter(node) {
      if (node.name === markerName) {
        found = true;
      }
    },
  });
  return found;
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

  describe('regression: listItemStartingAt must resolve an already-nested item, not just a top-level one', () => {
    /**
     * Before the fix, `listItemStartingAt` probed the tree at the raw
     * line start (column 0), which only ever lands inside a node for a
     * top-level (unindented) item — any already-nested item's own
     * `ListItem` begins at its marker, past the leading indentation, so
     * the probe silently fell through to the "continuation line" fallback
     * on every Tab after the first. That fallback blindly inserts the
     * flat `indentUnit`, unbounded, eventually exceeding the real content
     * column and causing the parser to reinterpret the line as ordinary
     * paragraph text, destroying the marker entirely.
     */

    it.each([
      { label: 'bullet', doc: '- Parent\n- Child', markerName: 'ListMark' },
      { label: 'ordered "1."', doc: '1. Parent\n1. Child', markerName: 'ListMark' },
      { label: 'ordered "10."', doc: '10. Parent\n1. Child', markerName: 'ListMark' },
      { label: 'task', doc: '- [ ] Parent\n- [ ] Child', markerName: 'TaskMarker' },
      { label: 'emoji', doc: '🍒 Parent\n🍒 Child', markerName: 'EmojiListMark' },
    ])('$label: sole nested child — first Tab nests, repeated Tab is a stable no-op, marker survives', ({ doc, markerName }) => {
      const view = mountView(doc, doc.indexOf('Child'));

      // First Tab: genuinely nests Child under Parent.
      const firstHandled = indentListItem(view);
      expect(firstHandled).toBe(true);
      const afterFirst = view.state.doc.toString();
      expect(nestingDepthOf(afterFirst, 'Child')).toBe(1);
      expect(hasMarkerNode(afterFirst, markerName)).toBe(true);

      // Every subsequent Tab: Child is now the sole item of its own
      // nested list — there is nothing valid to nest it under, so this
      // must be a true no-op, not a blind indentation increase.
      for (let press = 0; press < 10; press++) {
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Child') } });
        const handled = indentListItem(view);
        expect(handled).toBe(false);
      }

      const final = view.state.doc.toString();
      expect(final).toBe(afterFirst);
      expect(nestingDepthOf(final, 'Child')).toBe(1);
      expect(hasMarkerNode(final, markerName)).toBe(true);
    });

    it('ordered list: re-Tabbing a genuine nested sibling computes the real content column, not a coincidentally-matching flat indentUnit', () => {
      // Deliberately chosen so the correct sibling-derived column (6) and
      // the old flat-fallback amount (3 + indentUnit = 5) differ — the
      // bullet-only staircase case above can't distinguish "computed
      // correctly" from "happened to match indentUnit by coincidence."
      const doc = '1. item1\n   1. item2\n   1. item3';
      const view = mountView(doc, doc.lastIndexOf('item3'));

      const handled = indentListItem(view);

      expect(handled).toBe(true);
      const result = view.state.doc.toString();
      expect(result).toBe('1. item1\n   1. item2\n      1. item3');
      expect(nestingDepthOf(result, 'item2')).toBe(1);
      expect(nestingDepthOf(result, 'item3')).toBe(2);
      expect(hasMarkerNode(result, 'ListMark')).toBe(true);
    });

    it('emoji list: re-Tabbing a genuine nested sibling reaches real depth 2 via the marker\'s own content column', () => {
      const doc = '🍒 item1\n   🍒 item2\n   🍒 item3';
      const view = mountView(doc, doc.lastIndexOf('item3'));

      const handled = indentListItem(view);

      expect(handled).toBe(true);
      const result = view.state.doc.toString();
      expect(nestingDepthOf(result, 'item2')).toBe(1);
      expect(nestingDepthOf(result, 'item3')).toBe(2);
      expect(hasMarkerNode(result, 'EmojiListMark')).toBe(true);
    });

    it('deeply nested sole child: many repeated Tab presses never accumulate indentation or destroy the list', () => {
      const doc = '🍒 a\n🍒 b';
      const view = mountView(doc, 0);

      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('b') } });
      indentListItem(view);
      const afterNest = view.state.doc.toString();
      expect(nestingDepthOf(afterNest, 'b')).toBe(1);

      for (let press = 0; press < 25; press++) {
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('b') } });
        const handled = indentListItem(view);
        expect(handled).toBe(false);
        expect(view.state.doc.toString()).toBe(afterNest);
      }

      expect(hasMarkerNode(view.state.doc.toString(), 'EmojiListMark')).toBe(true);
    });

    it('Shift-Tab is unaffected by the fix: dedenting an already-nested sibling still works exactly as before', () => {
      const doc = '- item1\n  - item2\n    - item3';
      const view = mountView(doc, doc.indexOf('item3'));
      expect(nestingDepthOf(doc, 'item3')).toBe(2);

      const handled = dedentListItem(view);

      expect(handled).toBe(true);
      const result = view.state.doc.toString();
      expect(result).toBe('- item1\n  - item2\n  - item3');
      expect(nestingDepthOf(result, 'item3')).toBe(1);
    });
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
