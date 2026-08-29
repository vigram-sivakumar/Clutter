import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from './markdownEnterKeymap';

/**
 * Regression coverage for `continueMarkupPreservingStructure`
 * (`markdownEnterKeymap.ts`) — the guard against a confirmed
 * `@codemirror/lang-markdown`/`renumberList` structural-corruption
 * defect, recorded in full in docs/list-item-architecture-odr.md §15.
 *
 * `|` marks the cursor, same convention as `markdownEnterKeymap.test.ts`.
 */
function parse(source: string): EditorState {
  const pos = source.indexOf('|');
  const text = source.slice(0, pos) + source.slice(pos + 1);
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

function pressEnter(state: EditorState): EditorState {
  let dispatched: Transaction | null = null;
  const target = {
    state,
    dispatch: (transaction: Transaction) => {
      dispatched = transaction;
    },
  };
  markdownEnterCommand(target);
  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return next;
}

/** Every node name in document order, with enough of its own text to identify it. */
function treeShape(state: EditorState): string[] {
  const out: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      out.push(`${node.name}:${JSON.stringify(state.sliceDoc(node.from, node.to).slice(0, 20))}`);
    },
  });
  return out;
}

describe('continueMarkupPreservingStructure: guards Enter-triggered renumbering against structural corruption', () => {
  describe('confirmed corruption boundaries — structure must survive', () => {
    it('9 -> 10: nested child under the renumbered item survives', () => {
      const before = parse('8. A|\n9. B\n   1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('8. A\n9. \n9. B\n   1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      // Exactly one ListItem containing "Child" text, and it sits inside a
      // nested OrderedList (two OrderedList nodes total: outer + inner).
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
      expect(treeShape(after).some((e) => e.startsWith('ListMark:') && e.includes('"1."'))).toBe(true);
    });

    it('99 -> 100: nested child under the renumbered item survives', () => {
      const before = parse('98. A|\n99. B\n    1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('98. A\n99. \n99. B\n    1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('999 -> 1000: nested child under the renumbered item survives', () => {
      const before = parse('998. A|\n999. B\n     1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('998. A\n999. \n999. B\n     1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('paren-style marker (9) -> 10)): nested child survives, delimiter preserved', () => {
      const before = parse('8) A|\n9) B\n   1) Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('8) A\n9) \n9) B\n   1) Child');
      expect(after.doc.toString()).not.toContain('.'); // delimiter never flips to "."
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('leading-zero marker: a small padding-driven shrink (magnitude <= 3) is safe and still renumbers', () => {
      // "008." (3-digit run) renumbering to a plain "9." (1-digit run) is
      // a 2-column *shrink* (padding stripped), even though 8->9 doesn't
      // cross a power-of-10 boundary numerically — renumberList converts
      // through a bare Number and never reproduces zero-padding (confirmed
      // in the ODR investigation). Magnitude 2 is within the established
      // ±3 safe-shrink tolerance (§15), so this renumbers correctly,
      // matching upstream, and the child (placed at "008."'s own correct
      // 5-space content column, genuinely nested in the pre-edit tree)
      // survives regardless.
      const before = parse('007. A|\n008. B\n     1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('007. A\n8. \n9. B\n     1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('leading-zero marker: a large padding-driven shrink (magnitude > 3) is declined', () => {
      // "00010." (5-digit run, content column 7) shrinking to "9." (1
      // digit) is a 4-column shrink — past the safe tolerance — with the
      // child at "00010."'s own correct 7-space content column, genuinely
      // nested pre-edit. Same corruption class as the numeric-boundary
      // cases above, just reached via padding instead of crossing a
      // power-of-10.
      const before = parse('9. |\n00010. Y\n       1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n00010. Y\n       1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('multiple descendants under the renumbered item all survive', () => {
      const before = parse('8. A|\n9. B\n   1. Child1\n   2. Child2');
      const after = pressEnter(before);

      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
      expect(treeShape(after).some((e) => e.includes('"Child1"'))).toBe(true);
      expect(treeShape(after).some((e) => e.includes('"Child2"'))).toBe(true);
    });

    it('deeper nesting (child + grandchild) under the renumbered item all survives', () => {
      const before = parse('8. A|\n9. B\n   1. Child\n      1. Grandchild');
      const after = pressEnter(before);

      const names = treeShape(after).map((e) => e.split(':')[0]);
      // outer list + child's own list + grandchild's own list = 3
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(3);
    });

    it('multiple following siblings after the boundary still get their own correct renumber, even though the earlier sibling is declined', () => {
      const before = parse('8. A|\n9. B\n   1. Child\n10. C\n11. D');
      const after = pressEnter(before);

      // Only B's own rewrite (9->10) is declined, since only B owns
      // descendant content that width change would break. C and D have no
      // descendants — their own renumbers (10->11, 11->12) are
      // independently safe and are kept exactly as upstream computed them,
      // not dropped merely for coming after a declined change in the same
      // transaction. This is the "not more aggressive than necessary"
      // guarantee (docs/list-item-architecture-odr.md §15): the guard
      // declines only the specific edits it must, never a whole tail.
      expect(after.doc.toString()).toBe('8. A\n9. \n9. B\n   1. Child\n11. C\n12. D');
    });
  });

  describe('safe cases — byte-identical to unmodified continueMarkup', () => {
    it('normal renumber with no digit-width change is untouched', () => {
      const before = parse('1. A|\n2. B');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('1. A\n2. \n3. B');
    });

    it('9 -> 10 with NO descendant content still renumbers (nothing to protect)', () => {
      const before = parse('8. A|\n9. B');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('8. A\n9. \n10. B');
    });

    it('bullet lists are entirely unaffected (no renumbering exists for them)', () => {
      const before = parse('- A|\n- B');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('- A\n- \n- B');
    });

    it('plain end-of-list Enter (no following sibling) is unaffected', () => {
      const before = parse('8. A|');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('8. A\n9. ');
    });
  });

  describe('shrink direction: safe (magnitude <= 3) renumbers, unsafe (magnitude >= 4) declines', () => {
    // These exercise `renumberList`'s *other* two internal call sites (the
    // `offset: -2` branch inside "empty item unwinds one level" —
    // Clutter's `nonTightLists: false` means this branch always fires on
    // an empty-item Enter) — not the ordinary continuation case the tests
    // above exercise. `continueMarkupPreservingStructure` needed no
    // special-casing for this: it inspects only the final `ChangeSet`,
    // with no branch that inspects which internal decision produced a
    // given change, so the same guard protects both call sites.
    //
    // The exact boundary (magnitude <= 3 safe, magnitude >= 4 unsafe) was
    // confirmed by a programmatic sweep (content columns 4 through 9,
    // descendants placed at each item's own correct pre-edit column) —
    // see docs/list-item-architecture-odr.md §15 for the full swept
    // matrix; these are the representative boundary cases.

    it('plain numeric shrink 10 -> 9 (magnitude 1): safe, renumbers, child survives', () => {
      const before = parse('9. |\n10. Y\n    1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n9. Y\n    1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('plain numeric shrink 100 -> 99 (magnitude 1): safe, renumbers, child survives', () => {
      const before = parse('99. |\n100. Y\n     1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n99. Y\n     1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('plain numeric shrink 1000 -> 999 (magnitude 1): safe, renumbers, child survives', () => {
      const before = parse('999. |\n1000. Y\n      1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n999. Y\n      1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('boundary: magnitude exactly 3 is safe and renumbers', () => {
      // Deleted "0009." (itemNumber 9), following "0010." (content column
      // 6) -> renumbers to "9." (content column 3) -- magnitude 3.
      const before = parse('0009. |\n0010. Y\n     1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n9. Y\n     1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('boundary: magnitude exactly 4 is unsafe and declines', () => {
      // Deleted "00009." (itemNumber 9), following "00010." (content
      // column 7) -> would renumber to "9." (content column 3) --
      // magnitude 4, one past the safe boundary.
      const before = parse('00009. |\n00010. Y\n       1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n00010. Y\n       1. Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('paren-style delimiter: safe shrink renumbers, delimiter preserved', () => {
      const before = parse('9) |\n10) Y\n    1) Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n9) Y\n    1) Child');
      expect(after.doc.toString()).not.toContain('.');
    });

    it('paren-style delimiter: unsafe shrink declines, delimiter preserved', () => {
      const before = parse('00009) |\n00010) Y\n       1) Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n00010) Y\n       1) Child');
      const names = treeShape(after).map((e) => e.split(':')[0]);
      expect(names.filter((n) => n === 'OrderedList')).toHaveLength(2);
    });

    it('unsafe shrink with no descendant content still renumbers (nothing to protect)', () => {
      const before = parse('00009. |\n00010. Y');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('\n9. Y');
    });
  });

  // NOT COVERED HERE, recorded honestly (see docs/list-item-architecture-odr.md
  // §15): the exact safe/unsafe boundary was confirmed via a *single*
  // representative family (deleting a "9."-shaped item, following item
  // shifting down through a "10."-shaped one) swept across padding widths
  // — not independently re-verified for every other possible old/new
  // content-column combination (e.g. a shrink that doesn't bottom out at a
  // single digit). The general tolerance-window formula this boundary
  // relies on (§14.9) was established independently for a different,
  // Tab-driven case, so this is corroborating evidence for the same
  // constant, not a from-scratch re-derivation for every possible
  // magnitude — treated as sufficient given the swept family already
  // covers content columns 4 through 9.
});
