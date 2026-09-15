// @vitest-environment jsdom
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { isRiskyRenumberRewrite } from './orderedListRenumbering';

/** The first `ListMark` node's digit-run `[from, to)` — excluding the trailing `.`/`)` — the exact shape `isRiskyRenumberRewrite` expects. */
function firstMarkerDigitRun(doc: string): { from: number; to: number } {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  let marker: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (!marker && node.name === 'ListMark') {
        marker = node.node;
      }
    },
  });
  if (!marker) {
    throw new Error(`no ListMark found in ${JSON.stringify(doc)}`);
  }
  const m: SyntaxNode = marker;
  return { from: m.from, to: m.to - 1 };
}

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

/**
 * Regression coverage for the 2026-09-15 ownership consolidation:
 * `isRiskyRenumberRewrite` used to derive its own "is this item multi-line"
 * check directly from the raw `ListItem` node's `.to`
 * (`state.doc.lineAt(node.to).number > state.doc.lineAt(node.from).number`),
 * which CommonMark lazy continuation can inflate past the item's genuine
 * content — the same boundary problem already found and fixed for folding
 * in `listItemFoldService.ts`. A single-physical-line item followed by an
 * unrelated, zero-indent sibling line with no blank line before it used to
 * be misclassified as "multi-line," over-cautiously declining a digit-width
 * rewrite (`9.`→`10.`) that was actually perfectly safe — the item has no
 * genuine descendant content whose own indentation could ever fall out of
 * alignment. Fixed by delegating to `computeListItemFold` instead, which
 * already correctly distinguishes a lazy-continuation sibling (returns
 * `null` — no genuine descendant) from real nested content.
 */
describe('isRiskyRenumberRewrite — lazy-continuation false positive (2026-09-15 regression)', () => {
  it('a genuinely single-line item is never risky, regardless of width growth (control case, pre-existing correct behavior)', () => {
    const doc = '9. Item';
    const { from, to } = firstMarkerDigitRun(doc);
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 2)).toBe(false); // "9" (1 char) -> "10" (2 chars)
  });

  it('an unrelated, zero-indent sibling line with no blank line before it (lazy continuation) no longer makes a single-line item look multi-line', () => {
    const doc = '9. Item\nUnrelated top-level line';
    const { from, to } = firstMarkerDigitRun(doc);
    // Growth (9 -> 10) would have been unconditionally flagged risky by the
    // old raw-.to multiLine check, since the ListItem node's own .to
    // absorbed the second line via lazy continuation.
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 2)).toBe(false);
  });

  it('genuinely nested content (indented past the marker column) still correctly makes growth risky', () => {
    const doc = '9. Item\n   Nested continuation at the old content column';
    const { from, to } = firstMarkerDigitRun(doc);
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 2)).toBe(true);
  });

  it('genuinely nested content still correctly makes an over-large shrink risky', () => {
    const doc = '00010. Item\n       Nested continuation at the old content column';
    const { from, to } = firstMarkerDigitRun(doc);
    // "00010" (5 chars) -> "9" (1 char): a 4-column shrink exceeds
    // MAX_SAFE_SHRINK_COLUMNS (3).
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 1)).toBe(true);
  });

  it('a sibling ordered item immediately below (a real ListItem, not lazy-continued content) never makes the first item look multi-line', () => {
    const doc = '9. Item\n10. Sibling';
    const { from, to } = firstMarkerDigitRun(doc);
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 2)).toBe(false);
  });

  it('a nested bullet list under a bullet item is still genuinely multi-line and risky on growth', () => {
    const doc = '9. Item\n   - nested bullet';
    const { from, to } = firstMarkerDigitRun(doc);
    expect(isRiskyRenumberRewrite(stateFor(doc), from, to, 2)).toBe(true);
  });
});
