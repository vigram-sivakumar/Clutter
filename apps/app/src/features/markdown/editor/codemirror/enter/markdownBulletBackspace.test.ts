import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownIndentMore } from '../indent/markdownIndentKeymap';
import { deleteBulletMarkerSeparator, markdownEnterCommand } from './markdownEnterKeymap';

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

  describe('ordered lists (2026-08-29): symmetric with bullets, no longer excluded', () => {
    // Extends the same two-shape rule to ordered markers — see
    // deleteBulletMarkerSeparator's own doc comment for why this was
    // previously a "not-yet-made" decision and why nothing in the
    // reasoning turned out to be bullet-specific.
    it('non-empty, first item: "1. |Text" -> "1.|Text"', () => {
      expect(backspace('1. |Text')).toEqual({ rendered: '1.|Text', handledBy: 'clutter' });
    });

    it('non-empty, wider marker: "10. |Text" -> "10.|Text"', () => {
      expect(backspace('10. |Text')).toEqual({ rendered: '10.|Text', handledBy: 'clutter' });
    });

    it('paren-style marker: "1) |Text" -> "1)|Text"', () => {
      expect(backspace('1) |Text')).toEqual({ rendered: '1)|Text', handledBy: 'clutter' });
    });

    it('non-empty, later item: "1. A\\n2. |B" -> "1. A\\n2.|B"', () => {
      expect(backspace('1. A\n2. |B')).toEqual({
        rendered: '1. A\n2.|B',
        handledBy: 'clutter',
      });
    });

    it('empty item: "1. |" -> "|" (marker and separator removed together)', () => {
      expect(backspace('1. |')).toEqual({ rendered: '|', handledBy: 'clutter' });
    });

    it('separator width: "1.   |Text" (3 spaces) collapses in one press', () => {
      expect(backspace('1.   |Text')).toEqual({ rendered: '1.|Text', handledBy: 'clutter' });
    });
  });

  /**
   * Locked product rule (2026-08-28): Backspace never introduces spaces
   * that were not already in the source. Empty list items are NOT
   * excluded from this rule — they follow the identical marker-preserving
   * boundary logic as non-empty items, replacing CM6's own two divergent
   * empty-item branches (full delete for a first item, blank-to-spaces
   * for a later one) with the same one uniform rule used everywhere else
   * in this file.
   */
  /**
   * Locked product rule (2026-08-28, superseding the prior "bare marker
   * kept" rule from the same day): a bare marker is visually
   * indistinguishable from a not-yet-backspaced marker (both collapse to
   * the identical `Decoration.replace` widget), so the empty-item case
   * removes the marker AND its separator together in one press, rather
   * than leaving a bare marker on screen that looks like nothing
   * happened. Non-empty items are unchanged: separator only.
   */
  describe('empty list items: marker + separator removed together in one press (locked 2026-08-28)', () => {
    it('empty first/only item: "- |" -> "|" (whole item removed, truly empty line)', () => {
      expect(backspace('- |')).toEqual({ rendered: '|', handledBy: 'clutter' });
    });

    it('empty non-first item: "- One\\n- |" -> "- One\\n|" — this is the regression case that used to become two spaces', () => {
      expect(backspace('- One\n- |')).toEqual({
        rendered: '- One\n|',
        handledBy: 'clutter',
      });
    });

    it('nested empty item: "- Parent\\n  - |" -> "- Parent\\n  |" — leading indentation untouched, only marker+separator removed', () => {
      expect(backspace('- Parent\n  - |')).toEqual({
        rendered: '- Parent\n  |',
        handledBy: 'clutter',
      });
    });

    it('multi-space separator on an empty item is removed together with the marker in one press: "-   |" -> "|"', () => {
      expect(backspace('-__ |')).toEqual({ rendered: '|', handledBy: 'clutter' });
    });

    it('deep leading indentation survives exactly as it was — not altered, not normalized', () => {
      // The cursor marker sits directly after the 4 spaces here, which
      // breaks the render helper's end-of-line lookahead (same reason
      // noted elsewhere in this file), so the spaces render literally.
      expect(backspace('____- |')).toEqual({ rendered: '    |', handledBy: 'clutter' });
    });

    it('the resulting blank line is no longer any kind of list construct', () => {
      const { rendered } = backspace('- |');
      const doc = rendered.replace('|', '');
      expect(doc).toBe('');
    });

    it('nested case: only the second line loses its ListItem/BulletList — Parent is untouched', () => {
      const { rendered } = backspace('- Parent\n  - |');
      const doc = rendered.replace('|', '');
      expect(doc).toBe('- Parent\n  ');
      const names = topLevelNodeNames(doc);
      expect(names.filter((n) => n === 'ListItem')).toHaveLength(1); // Parent only
      expect(names.filter((n) => n === 'BulletList')).toHaveLength(1);
    });

    it('list-marker decoration would not render a bullet for "*Text" (no ListMark at all) — parser-driven, no rendering change needed', () => {
      // Not a rendering test (out of scope) — a parser-level guard that
      // the *precondition* the decoration relies on (a ListMark node)
      // really is absent, since listMarkerDecoration.ts's tree walk can
      // only ever decorate a ListItem whose firstChild is ListMark.
      expect(topLevelNodeNames('*Text')).toEqual(['Document', 'Paragraph']);
    });
  });

  describe('all bullet marker characters follow the identical rule', () => {
    it.each([
      ['dash', '-'],
      ['plus', '+'],
      ['star', '*'],
    ])('%s: non-empty "%s |Text" -> "%s|Text"', (_label, marker) => {
      expect(backspace(`${marker} |Text`)).toEqual({
        rendered: `${marker}|Text`,
        handledBy: 'clutter',
      });
    });

    it.each([
      ['dash', '-'],
      ['plus', '+'],
      ['star', '*'],
    ])('%s: empty non-first "%s One\\n%s |" -> "%s One\\n|"', (_label, marker) => {
      expect(backspace(`${marker} One\n${marker} |`)).toEqual({
        rendered: `${marker} One\n|`,
        handledBy: 'clutter',
      });
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

  /**
   * Key regression test (2026-08-28): Enter creates the marker/separator
   * for a new list item; ONE Backspace on that freshly-created empty item
   * must remove it entirely and return exactly to the pre-Enter text —
   * a clean, one-press, source-level inverse. No hidden "did Enter just
   * run" state makes this work — both commands independently re-derive
   * everything from the current tree/cursor position every time.
   */
  describe('Enter interaction: ONE Backspace on a freshly-created empty item removes exactly what Enter added', () => {
    it('"* Text", Enter, then ONE Backspace: marker+separator gone, the line break Enter inserted is untouched', () => {
      let state = parse('* Text|');
      const enter = {
        state,
        dispatch: (tr: Transaction) => (state = tr.state),
      };
      expect(markdownEnterCommand(enter)).toBe(true);
      expect(state.doc.toString()).toBe('* Text\n* '); // Enter's own insertion, unmodified

      const result = pressBackspace(state);
      expect(result.handledBy).toBe('clutter');
      // Backspace removes only the marker/separator it's scoped to — never
      // the newline before it, which belongs to a different line entirely.
      // This matches the diagrammed result exactly: "* Text" followed by
      // a blank second line with the cursor on it, not a full collapse
      // back to the single pre-Enter line.
      expect(result.state.doc.toString()).toBe('* Text\n');
      expect(result.state.selection.main.head).toBe(7); // start of the now-blank second line
    });

    it('the same result is reached whether the empty item was typed by hand or created by Enter — no hidden "was this created by Enter" state exists', () => {
      const viaEnter = (() => {
        let state = parse('* Text|');
        const enter = { state, dispatch: (tr: Transaction) => (state = tr.state) };
        markdownEnterCommand(enter);
        return pressBackspace(state).state.doc.toString();
      })();
      const viaHandTyping = backspace('* Text\n* |').rendered.replace('|', '');
      expect(viaEnter).toBe(viaHandTyping);
      expect(viaEnter).toBe('* Text\n');
    });
  });
});

/** `{ marker text, depth }` for every `ListItem`, in document order — asserts exact tree shape, not just resulting source. */
function listShape(state: EditorState): Array<{ marker: string; depth: number }> {
  const doc = state.doc;
  const shape: Array<{ marker: string; depth: number }> = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'ListItem') return;
      let depth = 0;
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === 'ListItem') depth++;
      }
      const marker = node.node.firstChild;
      const markerText =
        marker && marker.name === 'ListMark' ? doc.sliceString(marker.from, marker.to) : '(swallowed)';
      shape.push({ marker: markerText, depth });
    },
  });
  return shape;
}

/**
 * Backspace deleting an empty ordered-list item closes the numbering gap
 * (2026-08-30) — matching Enter's own symmetric behavior on the same
 * empty item (CM6's upstream `renumberList(inner.item, doc, changes, -2)`
 * in its own "exit an empty list item" branch, confirmed by direct
 * source inspection of `@codemirror/lang-markdown@6.5.2`). Reported by
 * the user directly: `1. Text / 2. Text` → Enter after `1. Text` → `1.
 * Text / 2. / 3. Text` → Enter on the empty `2.` renumbers `3.` to `2.`,
 * but Backspace on the same empty `2.` left `3.` unchanged. This
 * describe block is the permanent regression coverage for the fix
 * (`renumberAfterEmptyItemDeletion` in `markdownEnterKeymap.ts`), which
 * reimplements upstream's exact walk using only public tree APIs and
 * filters every rewrite through the same `isRiskyRenumberRewrite` guard
 * §15 built for Enter — see that function's own doc comment for the
 * full reasoning.
 */
describe('renumberAfterEmptyItemDeletion: Backspace on an empty ordered-list item closes the numbering gap, matching Enter', () => {
  it('REGRESSION (the exact reported scenario): 1. Text / 2. / 3. Text, Backspace on empty 2 -> 1. Text / 2. Text', () => {
    const { rendered } = backspace('1. Text\n2. |\n3. Text');
    expect(rendered.replace('|', '')).toBe('1. Text\n\n2. Text');
  });

  it('matches Enter exactly on the same input (byte-for-byte, not just "similar")', () => {
    let enterState = parse('1. Text|\n2. Text');
    markdownEnterCommand({ state: enterState, dispatch: (tr) => (enterState = tr.state) });
    expect(enterState.doc.toString()).toBe('1. Text\n2. \n3. Text'); // reproduces the setup

    let enterAgainState = enterState;
    markdownEnterCommand({ state: enterAgainState, dispatch: (tr) => (enterAgainState = tr.state) });

    const backspaceResult = pressBackspace(enterState);

    expect(backspaceResult.state.doc.toString()).toBe(enterAgainState.doc.toString());
  });

  it('8. / 9. / 10. -> delete empty 9 -> 8. / 9. (single-digit-width shrink, safe)', () => {
    const { rendered } = backspace('8. A\n9. |\n10. C');
    expect(rendered.replace('|', '')).toBe('8. A\n\n9. C');
  });

  it('99. / 100. / 101. -> delete empty 100 -> 99. / 100.', () => {
    const { rendered } = backspace('99. A\n100. |\n101. C');
    expect(rendered.replace('|', '')).toBe('99. A\n\n100. C');
  });

  it('paren delimiter: 1) / 2) / 3) -> delete empty 2) -> 1) / 2)', () => {
    const { rendered } = backspace('1) A\n2) |\n3) C');
    expect(rendered.replace('|', '')).toBe('1) A\n\n2) C');
  });

  it('nested ordered list: renumbering is scoped to the deleted item\'s own container, never crosses into the outer list', () => {
    const doc = '1. A\n   1. X\n   2. |\n   3. Z\n2. B';
    const { rendered } = backspace(doc);
    expect(rendered.replace('|', '')).toBe('1. A\n   1. X\n   \n   2. Z\n2. B');
    // Outer "2. B" is untouched — confirms the walk never leaves the
    // container the deleted item actually belongs to.
  });

  it('irregular numbering (1. / 5. / 9.) is preserved, never normalized: delete empty 5 -> 9 stays 9', () => {
    const { rendered } = backspace('1. A\n5. |\n9. C');
    expect(rendered.replace('|', '')).toBe('1. A\n\n9. C');
  });

  it('a long sequential run: every item after the deleted one shifts down by exactly one', () => {
    const { rendered } = backspace('1. A\n2. |\n3. C\n4. D\n5. E\n6. F');
    expect(rendered.replace('|', '')).toBe('1. A\n\n2. C\n3. D\n4. E\n5. F');
  });

  it('width-boundary shrink does not corrupt a nested child re-parented onto the renamed item', () => {
    const doc = '8. A\n9. |\n10. C\n    1. NestedChild';
    const { state } = pressBackspace(parse(doc));
    expect(state.doc.toString()).toBe('8. A\n\n9. C\n    1. NestedChild');
    expect(listShape(state)).toEqual([
      { marker: '8.', depth: 0 },
      { marker: '9.', depth: 0 },
      { marker: '1.', depth: 1 }, // still validly nested, not swallowed
    ]);
  });

  it('leading-zero padding is lost on renumbering, matching Enter\'s own already-documented lossy behavior (not a new inconsistency)', () => {
    const { rendered } = backspace('007. A\n008. |\n009. C');
    expect(rendered.replace('|', '')).toBe('007. A\n\n8. C');
  });

  it('GUARD PROOF: a large-magnitude padded shrink on a multi-line item is declined, protecting its own descendant content', () => {
    // "000003." (7 chars) has numeric value 3 — genuinely sequential
    // after deleting "2." (2, 2+1=3), so the walk does attempt to rename
    // it (unlike the irregular-numbering case, where the walk stops
    // before ever reaching this item). Target "2" (1 char) is magnitude
    // 6, unsafe (> 3). NestedChild is indented to col 8, "000003."'s own
    // real content column (0 + 7 + 1) — genuinely, validly nested
    // beforehand.
    const doc = '1. A\n2. |\n000003. C\n        1. NestedChild';
    const { state } = pressBackspace(parse(doc));
    // The risky rewrite is declined — "000003." stays exactly as it was.
    expect(state.doc.toString()).toBe('1. A\n\n000003. C\n        1. NestedChild');
    expect(listShape(state)).toEqual([
      { marker: '1.', depth: 0 },
      { marker: '000003.', depth: 0 },
      { marker: '1.', depth: 1 }, // still validly nested — the decline protected it
    ]);
  });

  it('control: the identical large-magnitude padded shrink on a single-line item (no descendant) is allowed', () => {
    const { rendered } = backspace('1. A\n2. |\n000003. C');
    expect(rendered.replace('|', '')).toBe('1. A\n\n2. C');
  });

  it('bullet lists never attempt renumbering (no digits to renumber)', () => {
    const { rendered } = backspace('- A\n- |\n- C');
    expect(rendered.replace('|', '')).toBe('- A\n\n- C');
  });

  it('scope check: the non-empty (separator-only) Backspace branch is unaffected — only deleting an item can leave a gap to close', () => {
    const { rendered } = backspace('1. A\n2. |Text\n3. C');
    expect(rendered.replace('|', '')).toBe('1. A\n2.Text\n3. C');
  });

  it('deleting the LAST item in a sequence needs no renumbering (nothing follows)', () => {
    const { rendered } = backspace('1. A\n2. |');
    expect(rendered.replace('|', '')).toBe('1. A\n');
  });

  it('deleting the FIRST item in a sequence renumbers everything after it down by one', () => {
    const { rendered } = backspace('1. |\n2. B\n3. C');
    expect(rendered.replace('|', '')).toBe('\n1. B\n2. C');
  });
});
