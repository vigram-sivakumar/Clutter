import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownIndentMore } from '../indent/markdownIndentKeymap';
import { deleteBulletMarkerSeparator } from './markdownEnterKeymap';

/**
 * Same `|`-marker fixture convention as `markdownEnterKeymap.test.ts`:
 * `|` marks the cursor, `_` stands for a trailing space that would
 * otherwise be invisible/stripped in a fixture literal.
 */
function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

function render(state: EditorState): string {
  const pos = state.selection.main.head;
  const text = state.doc.toString();
  return (text.slice(0, pos) + '|' + text.slice(pos)).replace(/ (?=\n|$)/g, '_');
}

type Handler = 'clutter' | 'cm6' | 'none';

/**
 * One Backspace press through the real chain, exactly as wired in
 * `markdownEnterKeymap()`: `deleteBulletMarkerSeparator` first, then CM6's
 * own `deleteMarkupBackward`.
 */
function pressBackspace(state: EditorState): { state: EditorState; handledBy: Handler } {
  let dispatched: Transaction | null = null;
  const target = {
    state,
    dispatch: (transaction: Transaction) => {
      dispatched = transaction;
    },
  };

  let handledBy: Handler;
  if (deleteBulletMarkerSeparator(target)) {
    handledBy = 'clutter';
  } else if (deleteMarkupBackward(target)) {
    handledBy = 'cm6';
  } else {
    handledBy = 'none';
  }

  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return { state: next, handledBy };
}

function backspace(source: string): { rendered: string; handledBy: Handler } {
  const result = pressBackspace(parse(source));
  return { rendered: render(result.state), handledBy: result.handledBy };
}

function topLevelNodeNames(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const names: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      names.push(node.name);
    },
  });
  return names;
}

describe('deleteBulletMarkerSeparator: source-local marker/separator boundary policy', () => {
  describe('basic — the four required scenarios', () => {
    it('first/only item: "- |Text" -> "-|Text"', () => {
      expect(backspace('- |Text')).toEqual({ rendered: '-|Text', handledBy: 'clutter' });
    });

    it('second item: "- One\\n- |Two" -> "- One\\n-|Two"', () => {
      expect(backspace('- One\n- |Two')).toEqual({
        rendered: '- One\n-|Two',
        handledBy: 'clutter',
      });
    });

    it('nested item: "- Parent\\n  - |Child" -> "- Parent\\n  -|Child"', () => {
      expect(backspace('- Parent\n  - |Child')).toEqual({
        rendered: '- Parent\n  -|Child',
        handledBy: 'clutter',
      });
    });

    it('grandchild: deep nesting behaves identically', () => {
      expect(backspace('- Parent\n  - Child\n    - |Grandchild')).toEqual({
        rendered: '- Parent\n  - Child\n    -|Grandchild',
        handledBy: 'clutter',
      });
    });
  });

  describe('the same rule applies regardless of first/non-first position (no CM6 asymmetry leaks through)', () => {
    it('first item and a later item produce the identical marker-preserving transformation', () => {
      expect(backspace('- |Only')).toEqual({ rendered: '-|Only', handledBy: 'clutter' });
      expect(backspace('- A\n- B\n- |C')).toEqual({
        rendered: '- A\n- B\n-|C',
        handledBy: 'clutter',
      });
    });

    it('sibling lines are never touched by a boundary Backspace on one of them', () => {
      const before = parse('- A\n- |B\n- C');
      const after = pressBackspace(before);
      const lines = after.state.doc.toString().split('\n');
      expect(lines[0]).toBe('- A');
      expect(lines[1]).toBe('-B');
      expect(lines[2]).toBe('- C');
    });
  });

  describe('separator width — collapses in exactly one press, regardless of width', () => {
    it('single space: "- |Text" -> "-|Text"', () => {
      expect(backspace('- |Text')).toEqual({ rendered: '-|Text', handledBy: 'clutter' });
    });

    it('two spaces: "-  |Text" -> "-|Text"', () => {
      expect(backspace('-_ |Text')).toEqual({ rendered: '-|Text', handledBy: 'clutter' });
    });

    it('three spaces: "-   |Text" -> "-|Text"', () => {
      expect(backspace('-__ |Text')).toEqual({ rendered: '-|Text', handledBy: 'clutter' });
    });

    it('four spaces: "-    |Text" -> "-|Text" (one press, not several)', () => {
      expect(backspace('-___ |Text')).toEqual({ rendered: '-|Text', handledBy: 'clutter' });
    });
  });

  describe('non-boundary positions decline (return false, handled by CM6 or nothing)', () => {
    it('caret before the marker: "|- Text" is unaffected by our override', () => {
      const result = backspace('|- Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('caret immediately after the marker, before any separator: "-| Text"', () => {
      const result = backspace('-| Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('caret mid-separator (three spaces, caret after the first): "- | _Text"', () => {
      const result = backspace('-_|__Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('caret inside content: "- Te|xt" declines (generic character deletion, not this override or deleteMarkupBackward)', () => {
      const result = backspace('- Te|xt');
      expect(result.handledBy).toBe('none'); // neither override fires; a lower-precedence generic delete would handle it in the real keymap
    });

    it('caret at end of content: "- Text|"', () => {
      const result = backspace('- Text|');
      expect(result.handledBy).not.toBe('clutter');
    });
  });

  describe('selections never trigger the override', () => {
    it('a non-empty selection overlapping the marker falls through to CM6', () => {
      const state = EditorState.create({
        doc: '- Text',
        selection: EditorSelection.range(0, 2),
        extensions: [markdownLanguageExtension()],
      });
      const target = { state, dispatch: () => {} };
      expect(deleteBulletMarkerSeparator(target)).toBe(false);
    });

    it('a non-empty selection overlapping content falls through to CM6', () => {
      const state = EditorState.create({
        doc: '- Text',
        selection: EditorSelection.range(2, 4),
        extensions: [markdownLanguageExtension()],
      });
      const target = { state, dispatch: () => {} };
      expect(deleteBulletMarkerSeparator(target)).toBe(false);
    });

    it('a selection spanning marker and content falls through to CM6', () => {
      const state = EditorState.create({
        doc: '- Text',
        selection: EditorSelection.range(0, 6),
        extensions: [markdownLanguageExtension()],
      });
      const target = { state, dispatch: () => {} };
      expect(deleteBulletMarkerSeparator(target)).toBe(false);
    });
  });

  describe('scope: ordered lists are explicitly excluded (a separate, not-yet-made decision)', () => {
    it('"1. |Text" is not touched by the bullet override', () => {
      const result = backspace('1. |Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('"10. |Text" is not touched', () => {
      const result = backspace('10. |Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('"1) |Text" (paren style) is not touched', () => {
      const result = backspace('1) |Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('ordered-list Backspace keeps its existing (unmodified) CM6 behavior', () => {
      // Documents current CM6 behavior as a regression guard — not a new
      // Clutter policy. If this ever changes, it means lang-markdown
      // changed underneath us, not that this task touched ordered lists.
      expect(backspace('1. |Text')).toEqual({ rendered: '|Text', handledBy: 'cm6' });
    });
  });

  describe('scope: empty list items keep CM6\'s native full-delete behavior (explicit product decision)', () => {
    it('an empty first item is not touched by the bullet override', () => {
      const result = backspace('- |');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('an empty non-first item is not touched by the bullet override', () => {
      const result = backspace('- One\n- |');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('documents current (unmodified) CM6 behavior for empty items as a regression guard', () => {
      expect(backspace('- |')).toEqual({ rendered: '|', handledBy: 'cm6' });
      // Non-first empty item: CM6 blanks the marker to spaces (its own
      // pre-existing asymmetry, untouched by this task — an explicit
      // product decision to keep CM6's native behavior here, not an
      // oversight). The cursor marker sits directly after the two spaces
      // here, which breaks the render helper's end-of-line lookahead, so
      // the spaces render literally.
      expect(backspace('- One\n- |')).toEqual({ rendered: '- One\n  |', handledBy: 'cm6' });
    });
  });

  describe('scope: task-list checkboxes are in scope (still a bullet marker boundary)', () => {
    it('"- [ ] |Text" — caret after the checkbox is NOT the marker boundary, declines', () => {
      const result = backspace('- [ ] |Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('"- |[ ] Text" — caret at the marker/content boundary fires, checkbox included in "content"', () => {
      expect(backspace('- |[ ] Text')).toEqual({
        rendered: '-|[ ] Text',
        handledBy: 'clutter',
      });
    });
  });

  describe('other constructs are untouched by the override', () => {
    it('ordinary paragraph: Backspace behaves exactly as CM6 default (character deletion, not "clutter")', () => {
      const result = backspace('Te|xt');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('blockquote: not touched by the bullet override', () => {
      const result = backspace('> |Text');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('fenced code content: not touched by the bullet override', () => {
      const result = backspace('```\nco|de\n```');
      expect(result.handledBy).not.toBe('clutter');
    });

    it('a blank line: not touched by the bullet override', () => {
      const result = backspace('Text\n|\nmore');
      expect(result.handledBy).not.toBe('clutter');
    });
  });

  describe('parser verification: the resulting document no longer parses as a list at that position', () => {
    it('"- Text" backspaced to "-Text" has no ListMark/ListItem at all — plain Paragraph', () => {
      const { rendered } = backspace('- |Text');
      const doc = rendered.replace('|', '');
      expect(doc).toBe('-Text');
      expect(topLevelNodeNames(doc)).toEqual(['Document', 'Paragraph']);
    });

    it('a non-first item collapses into lazy-continuation text of the previous paragraph', () => {
      const { rendered } = backspace('- One\n- |Two');
      const doc = rendered.replace('|', '');
      expect(doc).toBe('- One\n-Two');
      const names = topLevelNodeNames(doc);
      expect(names).toContain('ListItem');
      expect(names).toContain('Paragraph');
      // Exactly one Paragraph — "One\n-Two" merged as one lazy-continuation
      // paragraph, not two separate list items.
      expect(names.filter((n) => n === 'Paragraph')).toHaveLength(1);
      expect(names.filter((n) => n === 'ListItem')).toHaveLength(1);
    });

    it('a nested item fully collapses into the parent\'s own lazy-continuation paragraph', () => {
      const { rendered } = backspace('- Parent\n  - |Child');
      const doc = rendered.replace('|', '');
      expect(doc).toBe('- Parent\n  -Child');
      const names = topLevelNodeNames(doc);
      // "  -Child" is no longer recognized as any kind of list construct at
      // all — it merges as literal continuation text of Parent's own
      // Paragraph, so there is exactly one ListItem/BulletList (Parent's).
      expect(names.filter((n) => n === 'ListItem')).toHaveLength(1);
      expect(names.filter((n) => n === 'BulletList')).toHaveLength(1);
      expect(names.filter((n) => n === 'Paragraph')).toHaveLength(1);
    });
  });

  describe('Tab interaction: Backspace reads the CURRENT tree, independent of Tab history', () => {
    it('"- Text", Tab, then Backspace at the (now-shifted) boundary still applies the same rule', () => {
      let state = parse('- |Text');
      const tab1 = { state, dispatch: (tr: Transaction) => (state = tr.state) };
      expect(markdownIndentMore(tab1)).toBe(true);
      expect(state.doc.toString()).toBe('  - Text');

      // Re-place the cursor at the new marker/content boundary (position 4)
      // and press Backspace — the command must see today's tree, not a
      // pre-Tab one.
      state = state.update({ selection: EditorSelection.cursor(4) }).state;
      const result = pressBackspace(state);
      expect(result.handledBy).toBe('clutter');
      expect(result.state.doc.toString()).toBe('  -Text');
    });

    it('"- Parent\\n  - Child", Tab on Parent, then Backspace at Child boundary is unaffected by Parent\'s Tab', () => {
      let state = parse('- |Parent\n  - Child');
      const tab1 = { state, dispatch: (tr: Transaction) => (state = tr.state) };
      expect(markdownIndentMore(tab1)).toBe(true);
      expect(state.doc.toString()).toBe('  - Parent\n  - Child');

      const childBoundary = state.doc.toString().indexOf('Child');
      state = state.update({ selection: EditorSelection.cursor(childBoundary) }).state;
      const result = pressBackspace(state);
      expect(result.handledBy).toBe('clutter');
      const lines = result.state.doc.toString().split('\n');
      expect(lines[0]).toBe('  - Parent'); // untouched by Backspace on Child
      expect(lines[1]).toBe('  -Child');
    });
  });
});
