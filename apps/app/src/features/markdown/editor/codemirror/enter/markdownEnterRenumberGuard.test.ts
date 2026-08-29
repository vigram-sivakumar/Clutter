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

    it('leading-zero marker whose numeric renumber also changes width: nested child survives', () => {
      // "008." (4 chars, content column 5) renumbering to a plain "9." (2
      // chars) is a width change even though 8->9 doesn't cross a
      // power-of-10 boundary numerically — renumberList converts through a
      // bare Number and never reproduces zero-padding (confirmed in the
      // ODR investigation). Child indented at exactly 5 spaces to match
      // "008."'s own real content column, so it is genuinely nested
      // *before* the edit (verified directly against the pre-edit tree) —
      // not merely lazy-continuation-absorbed text, which a 4-space
      // fixture would produce regardless of any renumbering and wouldn't
      // exercise this guard at all.
      const before = parse('007. A|\n008. B\n     1. Child');
      const after = pressEnter(before);

      expect(after.doc.toString()).toBe('007. A\n8. \n008. B\n     1. Child');
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

    it('multiple following siblings after the boundary still renumber correctly once the risky one is declined', () => {
      const before = parse('8. A|\n9. B\n   1. Child\n10. C\n11. D');
      const after = pressEnter(before);

      // 9 is declined (stays "9.", preserving B's own child), but C and D
      // — same-width renumbers, no descendants — are unaffected by the
      // guard and keep upstream's own renumbering exactly.
      expect(after.doc.toString()).toBe('8. A\n9. \n9. B\n   1. Child\n10. C\n11. D');
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

  // NOT COVERED HERE, recorded honestly rather than papered over with an
  // inconclusive test (see docs/list-item-architecture-odr.md §15):
  // `renumberList` (@codemirror/lang-markdown) has two other internal call
  // sites beyond the ordinary continuation case exercised above, both
  // inside the "empty item unwinds one level" branch — one of them passes
  // `offset: -2`, a shrink-direction rewrite. `continueMarkupPreservingStructure`
  // wraps the *entire* `continueMarkup` command and inspects only the
  // final, already-computed `ChangeSet`, cross-referenced against the
  // pre-edit tree — it has no branch, condition, or code path that
  // inspects which of continueMarkup's internal decisions produced a
  // given change, so by construction it protects all three call sites
  // identically, not just the one exercised above. A clean, minimal,
  // independently-confirmed *shrink-specific* corruption repro proved
  // fiddly to construct this session (every attempted construction either
  // didn't cross a digit-width boundary or hit upstream's own pre-existing
  // "stop at first non-sequential number" guard for an unrelated reason)
  // — a genuine investigation gap, not a claim of coverage this file
  // doesn't have.
});
