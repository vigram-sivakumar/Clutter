// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { emojiListKeymap } from '../emoji-list/emojiListKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { deleteMarkupBackwardSubtreeAware, listDeleteKeymap } from './listDeleteKeymap';
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

/** Same full extension stack the live editor registers this command with, for precedence tests dispatching a real `KeyboardEvent`. */
function mountFullView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [listDeleteKeymap(), markdownLanguageExtension(), emojiListKeymap()],
  });
  return new EditorView({ state, parent });
}

function pressBackspace(view: EditorView): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
}

/** Fresh reparse of `text`, independent of any live view's tree — how many `ListItem` ancestors contain the line with `needle`. */
function nestingDepthOf(text: string, needle: string): number {
  const language = markdownLanguageExtension().language;
  const tree = language.parser.parse(text);
  const targetLine = text.slice(0, text.indexOf(needle)).split('\n').length;
  let depth = -1;
  const cursor = tree.cursor();
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

/** Whether `text` still contains a marker node of the given name anywhere in a fresh parse. */
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

/**
 * How many `ListItem` children the nearest enclosing `BulletList`/
 * `OrderedList` of the line containing `needle` has — the direct proof
 * that a subtree did or did not flatten into an unrelated following list
 * (Bug #2's exact failure mode): a merge shows up as extra siblings in
 * this count, not just as a text difference.
 */
function siblingCountOfListContaining(text: string, needle: string): number {
  const tree = markdownLanguageExtension().language.parser.parse(text);
  const targetPos = text.indexOf(needle);
  let node = tree.resolveInner(targetPos, 1);
  for (; node; node = node.parent!) {
    if (node.name === 'BulletList' || node.name === 'OrderedList') {
      let count = 0;
      let child = node.firstChild;
      while (child) {
        if (child.name === 'ListItem') {
          count += 1;
        }
        child = child.nextSibling;
      }
      return count;
    }
  }
  return -1;
}

describe('deleteMarkupBackwardSubtreeAware — subtree-owning nested item (Bug #1)', () => {
  it('dedents the first nested item, promoting it out — a later sibling stays attached to the original parent, not re-parented under the promoted item', () => {
    const doc = '- alpha\n  - nested one\n  - nested two';
    const view = mountView(doc, doc.indexOf('nested one'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(result).toBe('- alpha\n- nested one\n  - nested two');
    expect(nestingDepthOf(result, 'alpha')).toBe(0);
    expect(nestingDepthOf(result, 'nested one')).toBe(0);
    // The core Bug #1 assertion: "nested two" must remain a child of
    // "alpha" (depth 1), never re-parented under the now-promoted
    // "nested one".
    expect(nestingDepthOf(result, 'nested two')).toBe(1);
  });

  it('carries a deeper grandchild subtree along when dedenting the middle of a chain', () => {
    const doc = '- alpha\n  - one\n    - grandchild';
    const view = mountView(doc, doc.indexOf('one'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(nestingDepthOf(result, 'one')).toBe(0);
    expect(nestingDepthOf(result, 'grandchild')).toBe(1);
    expect(hasMarkerNode(result, 'ListMark')).toBe(true);
  });

  it('is a no-op deferral (returns false) for a nested item that owns no subtree — deleteMarkupBackward already handles this safely', () => {
    const doc = '- alpha\n  - one\n  - two';
    const view = mountView(doc, doc.indexOf('two'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('deleteMarkupBackwardSubtreeAware — parent/child reparenting (Bug #2)', () => {
  it('a NESTED parent with children dedents its whole subtree together, preserving every child as its child — the common, realistic case', () => {
    // "one" is itself nested (parentItem = alpha), so the dedent branch
    // applies and moves one's entire subtree (including "grandchild") as
    // one unit — this is the actual fix for Bug #2 in every case where
    // the reparenting parent is itself nested, which is the overwhelming
    // majority of real multi-level lists.
    const doc = '- alpha\n  - one\n    - grandchild\n  - two';
    const view = mountView(doc, doc.indexOf('one'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(nestingDepthOf(result, 'alpha')).toBe(0);
    expect(nestingDepthOf(result, 'one')).toBe(0);
    expect(nestingDepthOf(result, 'grandchild')).toBe(1);
    // "two" is unaffected — still a child of "alpha", never re-parented
    // under the promoted "one" (Bug #1's own core assertion, reconfirmed
    // here in the "parent-with-children" shape specifically).
    expect(nestingDepthOf(result, 'two')).toBe(1);
  });

  it('a TOP-LEVEL parent with children and nothing following defers to deleteMarkupBackward — no shallower level exists to dedent to, and no merge risk exists either', () => {
    const doc = '- alpha\n  - child one\n  - child two';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    // No enclosing parent to dedent to, not an OrderedList — nothing this
    // module can add here. deleteMarkupBackward's own identical edit
    // still fires via the normal keymap chain.
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('B11: a TOP-LEVEL parent with children, followed by a same-marker list, refuses the operation entirely rather than merging them', () => {
    // The resolved B11 case (previously a pinned known limitation): no
    // shallower level exists to dedent "alpha" to, and demoting it would
    // merge "child one"/"child two" into "beta" (same bullet family, "-")
    // as flat siblings — confirmed unsafe, so the keystroke is consumed
    // with zero document change, per Option 2 (refuse rather than rewrite
    // unrelated content or attempt an ineffective blank-line separator).
    const doc = '- alpha\n  - child one\n  - child two\n- beta';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    // 1. Backspace is handled.
    expect(handled).toBe(true);
    // 2. The document text is unchanged.
    expect(view.state.doc.toString()).toBe(doc);
    // 3. The nested children remain intact — still a clean 2-item list,
    //    nested under "alpha", exactly as before.
    expect(siblingCountOfListContaining(view.state.doc.toString(), 'child one')).toBe(2);
    expect(nestingDepthOf(view.state.doc.toString(), 'child one')).toBe(1);
    expect(nestingDepthOf(view.state.doc.toString(), 'child two')).toBe(1);
    // 4. The following list remains intact — "beta" is still "alpha"'s
    //    own top-level sibling, not absorbed into the children's list.
    expect(nestingDepthOf(view.state.doc.toString(), 'beta')).toBe(0);
    expect(siblingCountOfListContaining(view.state.doc.toString(), 'alpha')).toBe(2);
  });

  it('B11 refusal does not fire when the following list uses a different marker family — no merge risk, nothing this module needs to protect', () => {
    const doc = '- alpha\n  - child one\n  - child two\n* beta';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    // Different marker family already forms a separate List node on its
    // own — no merge risk, so this defers to deleteMarkupBackward exactly
    // as the childless/no-subtree cases do.
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a childless top-level item is unaffected — ordinary single-item removal, no subtree concern', () => {
    const doc = '- alpha\n- beta';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('deleteMarkupBackwardSubtreeAware — nested task-marker compound case (Bug §1 item 5)', () => {
  it('dedents a nested checked task item rather than destroying its checkbox and its list-ness in one keystroke', () => {
    const doc = '- alpha\n  - [ ] nested task';
    const view = mountView(doc, doc.indexOf('[ ]'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(result).toBe('- alpha\n- [ ] nested task');
    expect(nestingDepthOf(result, 'nested task')).toBe(0);
    expect(hasMarkerNode(result, 'TaskMarker')).toBe(true);
    expect(hasMarkerNode(result, 'ListMark')).toBe(true);
  });

  it('preserves a checked nested task marker\'s checked state across the dedent', () => {
    const doc = '- alpha\n  - [x] nested task';
    const view = mountView(doc, doc.indexOf('[x]'));

    deleteMarkupBackwardSubtreeAware(view);

    expect(view.state.doc.toString()).toBe('- alpha\n- [x] nested task');
  });
});

describe('deleteMarkupBackwardSubtreeAware — ordered-list renumbering (Bug #4)', () => {
  it('renumbers the remaining items after removing the first item\'s marker', () => {
    const doc = '1. alpha\n2. beta\n3. gamma';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('alpha\n1. beta\n2. gamma');
  });

  it('renumbers correctly when a middle item\'s marker is removed, keeping the preceding item\'s number as the anchor', () => {
    const doc = '1. alpha\n2. beta\n3. gamma\n4. delta';
    // "beta" is not the first item, so this is the safe "replace with
    // blank" upstream branch, intercepted here only for renumbering.
    const view = mountView(doc, doc.indexOf('beta'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    // "beta"'s marker is blanked (same width, per the safe branch);
    // gamma/delta renumber down to 2/3.
    expect(result).toBe('1. alpha\n   beta\n2. gamma\n3. delta');
  });

  it('is a no-op deferral for the last item — nothing follows to renumber, no subtree either', () => {
    const doc = '1. alpha\n2. beta';
    const view = mountView(doc, doc.indexOf('beta'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    // Still intercepted (isOrdered is true), but renumberFollowing is a
    // no-op with nothing after "beta" — falls through to the plain
    // blank-replace edit, textually identical to upstream's own.
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('1. alpha\n   beta');
  });

  it('dedents a nested ordered item without renumbering the list it is leaving — dedent relocates the item, it does not remove it from a sequence', () => {
    // Deliberately out of this milestone's renumbering scope (see the
    // command's own doc comment on the dedent branch): "one" keeps its
    // own literal number after promotion. What becomes of "two" — the
    // sole remaining item of the list "one" is leaving — is genuinely
    // sibling-fate territory this milestone does not resolve: freshly
    // reparsing the result shows "two" (still at its original 2-column
    // indent, untouched by this edit) ends up column-tolerant top-level
    // content immediately following "1. one", not re-nested under
    // "alpha" — a real, out-of-scope-for-Milestone-1 nested-ordered-list
    // edge case, pinned here as a known, unexamined result rather than
    // silently assumed correct.
    const doc = '- alpha\n  1. one\n  2. two';
    const view = mountView(doc, doc.indexOf('one'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(true);
    const result = view.state.doc.toString();
    expect(result).toBe('- alpha\n1. one\n  2. two');
    expect(nestingDepthOf(result, 'one')).toBe(0);
  });
});

describe('deleteMarkupBackwardSubtreeAware — must not claim contexts it does not own', () => {
  it('defers (returns false) for a plain top-level bullet item with no subtree, no ordered list', () => {
    const doc = '- alpha';
    const view = mountView(doc, doc.indexOf('alpha'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers for a continuation line, never touching lazy-continuation Backspace', () => {
    const doc = '- alpha\n  continuation text';
    const view = mountView(doc, doc.indexOf('continuation'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers for a cursor position mid-item-text, not at the marker-removal boundary', () => {
    const doc = '- alpha\n  - nested one';
    const view = mountView(doc, doc.indexOf('one'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers for a non-empty selection', () => {
    const doc = '- alpha\n  - nested one\n  - nested two';
    const view = mountView(doc, 0);
    view.dispatch({ selection: { anchor: doc.indexOf('nested one'), head: doc.indexOf('nested one') + 4 } });

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers for a plain paragraph entirely outside any list', () => {
    const doc = 'Hello world';
    const view = mountView(doc, 5);

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('precedence — coexists correctly with markdownLanguageExtension() and emojiListKeymap() via real keydown dispatch', () => {
  it('a real Backspace keypress reaches this command first for a subtree-owning nested item', () => {
    const doc = '- alpha\n  - nested one\n  - nested two';
    const view = mountFullView(doc, doc.indexOf('nested one'));

    pressBackspace(view);

    expect(view.state.doc.toString()).toBe('- alpha\n- nested one\n  - nested two');
    view.destroy();
  });

  it('yields to deleteMarkupBackward for an ordinary top-level item with no subtree', () => {
    const doc = '- alpha';
    const view = mountFullView(doc, doc.indexOf('alpha'));

    pressBackspace(view);

    // deleteMarkupBackward's own single-press full-marker removal still
    // fires — unaffected by this milestone's supplement.
    expect(view.state.doc.toString()).toBe('alpha');
    view.destroy();
  });

  it('yields to emojiListKeymap() for EmojiList context — this milestone does not touch EmojiList', () => {
    const doc = '🍒 alpha\n🍒 beta';
    const view = mountFullView(doc, doc.indexOf('beta'));

    pressBackspace(view);

    // emojiListKeymap()'s own single-level marker handling fires
    // unaffected — "beta"'s own marker is removed, "alpha" untouched.
    expect(view.state.doc.toString()).toBe('🍒 alpha\nbeta');
    view.destroy();
  });
});

describe('regression — unaffected existing Backspace/Tab/Shift-Tab/Enter/EmojiList behavior', () => {
  it('a top-level task item marker is still removed in a single press (no subtree, no ordered list)', () => {
    const doc = '- [ ] alpha';
    const view = mountView(doc, doc.indexOf('[ ]'));

    const handled = deleteMarkupBackwardSubtreeAware(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Tab/Shift-Tab subtree movement is unaffected — listIndentKeymap.ts itself was not modified in behavior', () => {
    const doc = '- item1\n- item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = indentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2');
  });

  it('Shift-Tab dedent is unaffected', () => {
    const doc = '- item1\n  - item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = dedentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n- item2');
  });

  it('continuation-line Backspace still behaves as ordinary lazy continuation, unaffected', () => {
    const doc = '- alpha\n  continuation text';
    const view = mountFullView(doc, doc.indexOf('continuation'));

    pressBackspace(view);

    expect(view.state.doc.toString()).toBe('- alpha\ncontinuation text');
    view.destroy();
  });
});
