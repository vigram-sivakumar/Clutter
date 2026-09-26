// @vitest-environment jsdom
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { isDelimitedMarkConstruct } from '../semanticToken/tokenEngagement';
import { collectActiveInlineClasses } from './inlineLivePreviewParticipants';

/**
 * Direct unit coverage for `collectActiveInlineClasses` — the mechanism
 * docs/editor-architecture-decisions.md's "Inline formatting composition at
 * the token level" entry describes, since 2026-09-27 corrected (see that
 * document's "active-parent-formatting fix" entry) to also consult each
 * ancestor's own engagement state, not just tree containment. Exercised
 * here against a real `EditorState` (selection included) rather than the
 * syntax tree alone, since the function now genuinely depends on both.
 * Integration-level proof that a real widget's `classList` ends up composed
 * correctly lives in `inlineLivePreviewRegion.test.ts` (Tag/Date) and
 * `wikilink/wikiLinkLivePreview.test.ts` (WikiLink); this file is about the
 * shared function in isolation.
 */
function stateAndNode(doc: string, nodeName: string, selectionAnchor: number) {
  const state = EditorState.create({
    doc,
    selection: { anchor: selectionAnchor },
    extensions: [markdownLanguageExtension()],
  });
  const tree = ensureSyntaxTree(state, doc.length) ?? syntaxTree(state);
  let found: ReturnType<typeof tree.resolve> | null = null;
  tree.iterate({
    enter: (node) => {
      if (!found && node.name === nodeName) {
        found = node.node;
      }
    },
  });
  if (!found) {
    throw new Error(`no ${nodeName} node found in ${JSON.stringify(doc)}`);
  }
  return { state, node: found as NonNullable<typeof found> };
}

/**
 * Every construct under test is padded with leading/trailing plain text
 * ("x " / " y") and the selection is anchored at position 0 (inside "x",
 * safely outside every construct) — so every ancestor in the walk resolves
 * as inactive, matching this suite's pre-existing (pre-2026-09-27)
 * expectations without a padded doc breaking any construct's own shape.
 */
function nodeAt(doc: string, nodeName: string) {
  return stateAndNode(`x ${doc} y`, nodeName, 0);
}

describe('collectActiveInlineClasses', () => {
  it('no enclosing delimited-mark construct: empty', () => {
    const { state, node } = nodeAt('plain text', 'Paragraph');
    expect(collectActiveInlineClasses(node, state)).toEqual([]);
  });

  it('one enclosing construct: its content class alone', () => {
    // The Tag-like leaf here is irrelevant to this function — it walks
    // ancestors of *any* node, so an ordinary Emphasis child stands in.
    const { state, node } = nodeAt('~~struck~~', 'StrikethroughMark');
    expect(collectActiveInlineClasses(node, state)).toEqual(['tok-strike']);
  });

  it('two levels deep, innermost first: **~~x~~** and ~~**x**~~ both compose the same two classes regardless of order', () => {
    const innerFirst = nodeAt('~~**x**~~', 'EmphasisMark');
    expect(collectActiveInlineClasses(innerFirst.node, innerFirst.state)).toEqual(['tok-strong', 'tok-strike']);

    const outerFirst = nodeAt('**~~x~~**', 'StrikethroughMark');
    expect(collectActiveInlineClasses(outerFirst.node, outerFirst.state)).toEqual(['tok-strike', 'tok-strong']);
  });

  it('three levels deep: ~~==**x**==~~ composes all three, innermost first', () => {
    const { state, node } = nodeAt('~~==**x**==~~', 'EmphasisMark');
    expect(collectActiveInlineClasses(node, state)).toEqual(['tok-strong', 'tok-highlight', 'tok-strike']);
  });

  it('stops at a non-qualifying ancestor (Paragraph) rather than walking to the document root', () => {
    const { state, node } = nodeAt('before ~~struck~~ after', 'StrikethroughMark');
    // Only Strikethrough itself qualifies; Paragraph/Document above it do not.
    expect(collectActiveInlineClasses(node, state)).toEqual(['tok-strike']);
  });

  it('a sibling formatted region does not leak into an unrelated node\'s ancestry', () => {
    const { state, node } = nodeAt('**bold** plain #tag', 'StrongEmphasis');
    // StrongEmphasis's own parent is Paragraph, not itself a delimited-mark
    // construct — nothing should be collected for the StrongEmphasis node
    // itself (its own ancestors, not its own class).
    expect(collectActiveInlineClasses(node, state)).toEqual([]);
  });

  // =================================================================
  // "Inside X" vs. "X is active" — 2026-09-27 correction. An ancestor
  // that is itself currently engaged (the caret sits within it, or it is
  // flush-widened into an engaged outer construct) contributes no content
  // class at all here, since `inlineLivePreviewRegion.ts` never emits that
  // ancestor's own content-mark decoration while it's engaged — there is no
  // real DOM wrapper for this composed class to mirror in that state.
  // Walking continues past a skipped ancestor, so a further-out *inactive*
  // ancestor's class still composes normally.
  // =================================================================
  describe('an active (engaged) ancestor contributes no class, but walking continues past it', () => {
    it('~~x #tag~~ (Tag is a sibling of Strikethrough\'s own plain text, not flush): caret in the plain text suppresses tok-strike for the Tag', () => {
      const doc = '~~x #tag~~';
      const caret = doc.indexOf('x') + 1; // inside Strikethrough's own plain text, nowhere near Tag
      const { state, node } = stateAndNode(doc, 'Tag', caret);
      expect(collectActiveInlineClasses(node, state)).toEqual([]);
    });

    it('~~x #tag~~ with the caret elsewhere entirely: tok-strike composes normally (Strikethrough is inactive)', () => {
      const doc = '~~x #tag~~ after';
      const { state, node } = stateAndNode(doc, 'Tag', doc.indexOf('after') + 1);
      expect(collectActiveInlineClasses(node, state)).toEqual(['tok-strike']);
    });

    it('~~a **x** b~~ with the caret in the outer Strikethrough\'s own plain text: tok-strike is suppressed for a node nested in the inactive inner Bold', () => {
      const doc = '~~a **x** b~~';
      const caret = doc.indexOf('a') + 1; // inside the outer Strikethrough's own plain text, outside StrongEmphasis entirely
      const { state, node } = stateAndNode(doc, 'EmphasisMark', caret);
      // node's ancestors are StrongEmphasis (inactive: caret is not inside
      // "x") then Strikethrough (active: caret is inside its own plain
      // text) — StrongEmphasis's own tok-strong still composes, tok-strike
      // does not.
      expect(collectActiveInlineClasses(node, state)).toEqual(['tok-strong']);
    });

    it('~~**x**~~ with the caret inside the inner Bold\'s own content: both ancestors are active (Bold directly, Strikethrough via flush-widening) — neither class composes', () => {
      const doc = '~~**x**~~';
      const caret = doc.indexOf('x'); // inside StrongEmphasis's own content
      const { state, node } = stateAndNode(doc, 'EmphasisMark', caret);
      expect(collectActiveInlineClasses(node, state)).toEqual([]);
    });
  });
});

describe('isDelimitedMarkConstruct', () => {
  it('true for a construct with two identically-named *Mark-suffixed children', () => {
    const { node } = nodeAt('~~struck~~', 'Strikethrough');
    expect(isDelimitedMarkConstruct(node)).toBe(true);
  });

  it('false for an ordinary block container', () => {
    const { node } = nodeAt('plain text', 'Paragraph');
    expect(isDelimitedMarkConstruct(node)).toBe(false);
  });

  it('false for a leaf node with no children at all', () => {
    const { node } = nodeAt('~~struck~~', 'StrikethroughMark');
    expect(isDelimitedMarkConstruct(node)).toBe(false);
  });
});
