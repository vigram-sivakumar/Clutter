// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkCompletionSource } from './wikiLinkCompletionSource';
import { wikiLinkLivePreview } from './wikiLinkLivePreview';
import type { ResolveWikiLink } from './wikiLinkResolution';
import type { GetWikiLinkSuggestions } from './wikiLinkSuggestion';

/**
 * WikiLink's standalone engaged-state mechanism (`wikiLinkLivePreview.ts`).
 * The at-rest widget/atomic behavior is unchanged from Phase 3 — those
 * facts stay covered generically wherever they already were; this file
 * focuses on the new engaged-state representation and the boundary facts
 * the investigation identified as load-bearing (no atomic range while
 * engaged, no document mutation, surrounding formatting unaffected,
 * autocomplete untouched).
 */
function mountView(doc: string, resolver?: ResolveWikiLink, includeFormatting = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  // Order matters here and is deliberately production-matching: MarkdownEditor.tsx registers
  // inlineLivePreviewRegion before wikiLinkLivePreview, so any test that
  // relies on nesting/precedence correctness must too — otherwise it would
  // only prove the fix works in an order production doesn't actually use.
  // wikiLinkLivePreview must correct for this via its own Prec.high, not
  // via array position, since MarkdownEditor.tsx's order is what this
  // mirrors.
  const extensions: Extension[] = [markdownLanguageExtension()];
  if (includeFormatting) {
    extensions.push(
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({ resolveTag: () => undefined, resolveDate: () => undefined })
      )
    );
  }
  extensions.push(wikiLinkLivePreview(() => resolver));
  const state = EditorState.create({ doc, extensions });
  return new EditorView({ state, parent });
}

function mountViewWithSelection(
  doc: string,
  anchor: number,
  resolver?: ResolveWikiLink,
  includeFormatting = false
): EditorView {
  const view = mountView(doc, resolver, includeFormatting);
  view.dispatch({ selection: { anchor } });
  return view;
}

function isAtomicAnywhere(view: EditorView): boolean {
  const atomicProviders = view.state.facet(EditorView.atomicRanges);
  return atomicProviders.some((provider) => {
    const rangeSet = provider(view);
    let found = false;
    rangeSet.between(0, view.state.doc.length, () => {
      found = true;
    });
    return found;
  });
}

const resolvedAs = (displayLabel: string): ResolveWikiLink => () => ({
  status: 'resolved',
  displayLabel,
  activate: () => {},
});

describe('wikiLinkLivePreview', () => {
  describe('at rest', () => {
    it('renders the compact widget, not the raw syntax', () => {
      const view = mountView('before [[Projects/Project A]] after', resolvedAs('Project A'));

      expect(view.dom.textContent).toBe('before Project A after');
      expect(view.dom.textContent).not.toContain('Projects/');
      expect(view.dom.textContent).not.toContain('[[');
    });

    it('resolved path: shows the resolver-supplied display label', () => {
      // Leading text, not a bare doc: CM6's default selection is (0,0),
      // and a WikiLink starting at position 0 would otherwise load
      // "engaged" by that same default caret — the pre-existing,
      // documented whole-document initial-caret case
      // (inlineLivePreviewRegion.ts's own doc comment), not something this
      // file introduces.
      const view = mountView('before [[Projects/Project A]] after', resolvedAs('Project A'));
      expect(view.dom.querySelector('[data-wikilink-status="resolved"]')?.textContent).toBe('Project A');
    });

    it('unresolved path: falls back through the injected resolver, never the raw folder path, when one is supplied', () => {
      const view = mountView('before [[Projects/Missing]] after', () => ({
        status: 'unresolved',
        displayLabel: 'Missing',
        activate: () => {},
      }));
      const widget = view.dom.querySelector('[data-wikilink-status="unresolved"]');
      expect(widget?.textContent).toBe('Missing');
    });

    it('with an alias: shows the alias as the display label', () => {
      const view = mountView('before [[Projects/Project A|Display name]] after', () => ({
        status: 'resolved',
        displayLabel: 'Display name',
        activate: () => {},
      }));
      expect(view.dom.textContent).toBe('before Display name after');
    });

    it('is registered in EditorView.atomicRanges', () => {
      const view = mountView('before [[Projects/Project A]] after', resolvedAs('Project A'));
      expect(isAtomicAnywhere(view)).toBe(true);
    });
  });

  // ===================================================================
  // Regression: an empty or whitespace-only path resolves through every
  // resolution branch (a real resolver's unresolved case,
  // fallbackWikiLinkResolution) to an empty displayLabel — an at-rest
  // widget with no visible content, present in the DOM but
  // indistinguishable from nothing. renderWikiLink declines to decorate
  // these at all, so they stay ordinary raw, editable text instead.
  // ===================================================================
  describe('empty/whitespace-only reference stays raw and editable, never an invisible widget', () => {
    it('[[]] is not replaced by a widget at rest — no data-wikilink-status element at all', () => {
      const view = mountView('before [[]] after', resolvedAs('should never render'));

      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
      expect(view.dom.textContent).toBe('before [[]] after');
    });

    it('[[ ]] (a literal space) is treated the same as truly empty — not replaced by a widget', () => {
      const view = mountView('before [[ ]] after', resolvedAs('should never render'));

      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
      expect(view.dom.textContent).toBe('before [[ ]] after');
    });

    it('[[]] is not atomic — ordinary cursor motion applies, since it is plain text, not a widget', () => {
      const view = mountView('before [[]] after', resolvedAs('should never render'));

      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it('an empty reference stays raw with no resolver injected at all (the fallback-resolution path)', () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({
        doc: 'before [[]] after',
        extensions: [markdownLanguageExtension(), wikiLinkLivePreview(() => undefined)],
      });
      const view = new EditorView({ state, parent });

      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
      expect(view.dom.textContent).toBe('before [[]] after');
    });

    it('typing a real path into a previously-empty [[]] resumes normal at-rest widget rendering — nothing is permanently stuck raw', () => {
      const doc = 'before [[]] after';
      const view = mountView(doc, resolvedAs('Project A'));
      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();

      const insertAt = 'before [['.length;
      view.dispatch({ changes: { from: insertAt, insert: 'Projects/Project A' } });

      expect(view.dom.querySelector('[data-wikilink-status="resolved"]')?.textContent).toBe('Project A');
    });

    it('a normal, non-empty [[Page]] continues to render exactly as before — the guard only affects the empty/whitespace-only case', () => {
      const view = mountView('before [[Projects/Project A]] after', resolvedAs('Project A'));

      expect(view.dom.querySelector('[data-wikilink-status="resolved"]')?.textContent).toBe('Project A');
      expect(view.dom.textContent).toBe('before Project A after');
      expect(isAtomicAnywhere(view)).toBe(true);
    });
  });

  describe('engaged', () => {
    it('reveals [[, the filename, and ]] — the folder prefix stays concealed', () => {
      const doc = 'before [[Projects/Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountViewWithSelection(doc, nodeFrom + 3, resolvedAs('Project A'));

      expect(view.dom.textContent).toBe('before [[Project A]] after');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('with an alias: reveals [[filename|alias]] — the folder prefix stays concealed, the alias stays visible', () => {
      const doc = 'before [[Projects/Project A|Display name]] after';
      const nodeFrom = 'before '.length;
      const view = mountViewWithSelection(doc, nodeFrom + 3, resolvedAs('Display name'));

      expect(view.dom.textContent).toBe('before [[Project A|Display name]] after');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('no folder component: the whole reference was already just the filename, nothing to conceal', () => {
      const doc = 'before [[Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountViewWithSelection(doc, nodeFrom + 3, resolvedAs('Project A'));

      expect(view.dom.textContent).toBe(doc);
    });

    it('has no atomic range while engaged', () => {
      const doc = 'before [[Projects/Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountViewWithSelection(doc, nodeFrom + 3, resolvedAs('Project A'));

      expect(isAtomicAnywhere(view)).toBe(false);
    });

    it('re-collapses to the compact widget once the caret leaves', () => {
      const doc = 'before [[Projects/Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountView(doc, resolvedAs('Project A'));

      view.dispatch({ selection: { anchor: nodeFrom + 3 } });
      expect(view.dom.textContent).toContain('[[Project A]]');

      view.dispatch({ selection: { anchor: 0 } });
      expect(view.dom.textContent).toBe('before Project A after');
    });
  });

  describe('nested formatting', () => {
    it('**[[Projects/Project A]]**: outside the link, the bold formatting still collapses to the plain compact label', () => {
      const view = mountView('before **[[Projects/Project A]]** after', resolvedAs('Project A'), true);
      expect(view.dom.textContent).toBe('before Project A after');
    });

    it('**[[Projects/Project A]]**: cursor inside the link reveals the bold marks (StrongEmphasis is genuinely engaged) alongside the compact reference', () => {
      const doc = '**[[Projects/Project A]]**';
      const insideWikiLink = doc.indexOf('Project A') + 1;
      const view = mountViewWithSelection(doc, insideWikiLink, resolvedAs('Project A'), true);

      expect(view.dom.textContent).toBe('**[[Project A]]**');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('**[[Projects/Project A|Display name]]**: cursor inside reveals the alias alongside the compact reference', () => {
      const doc = '**[[Projects/Project A|Display name]]**';
      const insideWikiLink = doc.indexOf('Project A') + 1;
      const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'Display name', activate: () => {} });
      const view = mountViewWithSelection(doc, insideWikiLink, resolver, true);

      expect(view.dom.textContent).toBe('**[[Project A|Display name]]**');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('~~[[Projects/Project A]]~~: cursor inside the link reveals the strikethrough marks alongside the compact reference', () => {
      const doc = '~~[[Projects/Project A]]~~';
      const insideWikiLink = doc.indexOf('Project A') + 1;
      const view = mountViewWithSelection(doc, insideWikiLink, resolvedAs('Project A'), true);

      expect(view.dom.textContent).toBe('~~[[Project A]]~~');
    });

    it('**~~[[Projects/Project A]]~~**: nested combination — both outer marks reveal, the reference stays folder-free', () => {
      const doc = '**~~[[Projects/Project A]]~~**';
      const insideWikiLink = doc.indexOf('Project A') + 1;
      const view = mountViewWithSelection(doc, insideWikiLink, resolvedAs('Project A'), true);

      expect(view.dom.textContent).toBe('**~~[[Project A]]~~**');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('does not introduce construct-pair logic: StrongEmphasis with no WikiLink inside behaves exactly as it does without wikiLinkLivePreview registered', () => {
      const view = mountViewWithSelection('**bold text**', 5, undefined, true);
      // Genuinely engaged StrongEmphasis with no WikiLink inside — must
      // stay fully raw, exactly as inlineLivePreviewRegion.test.ts already
      // proves for this construct on its own.
      expect(view.dom.textContent).toBe('**bold text**');
    });
  });

  describe('document and cursor behavior', () => {
    it('the underlying document never changes as the WikiLink collapses/reveals', () => {
      const text = 'before [[Projects/Project A]] after';
      const view = mountView(text, resolvedAs('Project A'));

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 10 } });
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('Backspace-equivalent deletion at a position inside the concealed folder prefix removes one real character, with no new cursor/keymap logic involved', () => {
      const doc = 'before [[Projects/Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountView(doc, resolvedAs('Project A'));

      // Engage first so the reference is genuinely raw/editable text, then
      // delete the character right after the opening `[[` (the "P" of
      // "Projects") — an ordinary single-character document edit, exactly
      // what CM6's own default Backspace already does with no interception.
      view.dispatch({ selection: { anchor: nodeFrom + 3 } });
      view.dispatch({ changes: { from: nodeFrom + 2, to: nodeFrom + 3 } });

      expect(view.state.doc.toString()).toBe('before [[rojects/Project A]] after');
    });

    it('a selection placed inside an at-rest widget is not atomic-adjusted by any Clutter-authored logic beyond native atomicRanges — no custom keymap involved', () => {
      const doc = 'before [[Projects/Project A]] after';
      const view = mountView(doc, resolvedAs('Project A'));

      // Native CM6 atomicRanges handling (registered by wikiLinkLivePreview
      // itself) governs this — no wikiLinkSelectionSnap or keymap is wired
      // into this test's extensions at all.
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.selection.main.head).toBe(0);
    });
  });

  describe('autocomplete continues operating against the canonical full path', () => {
    it('a fresh, not-yet-closed [[query replaces from the opening [[ itself, with the full raw query (no WikiLink node exists yet to scope against)', () => {
      const doc = 'x [[Projects/Proj';
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
      const view = new EditorView({ state, parent });

      const getSuggestions: GetWikiLinkSuggestions = () => [
        { kind: 'page' as const, path: 'Projects/Project A', title: 'Project A', breadcrumb: 'Projects' },
      ];
      const source: CompletionSource = wikiLinkCompletionSource(() => getSuggestions);
      const context = new CompletionContext(view.state, doc.length, false);
      const result = source(context) as CompletionResult | null;

      expect(result?.options[0]?.label).toBe('Project A');
      // Replace range starts at the `[[` itself — accepting inserts a
      // brand-new, full `[[path]]`, unaffected by anything this
      // investigation changed.
      expect(result?.from).toBe('x '.length);
    });

    it('reactivates against an already-closed reference: queries the whole visible (post-folder) segment regardless of cursor position within it, and replaces the whole canonical reference on accept — established, unmodified wikiLinkCompletionSource.ts behavior, unaffected by the engaged-state display change', () => {
      const doc = 'x [[Projects/Project A]] y';
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
      const view = new EditorView({ state, parent });

      let queried: string | null = null;
      const getSuggestions: GetWikiLinkSuggestions = (query) => {
        queried = query;
        return [];
      };
      const source: CompletionSource = wikiLinkCompletionSource(() => getSuggestions);
      const refFrom = 'x [['.length;
      // Mid-reference cursor position — the query is still the whole
      // visible segment ("Project A"), not a cursor-scoped prefix; this is
      // the existing, deliberate design (see wikiLinkCompletionSource.ts's
      // own doc comment on why cursor position must not determine the
      // query for an already-closed reference).
      const context = new CompletionContext(view.state, refFrom + 'Projects/Proj'.length, false);
      source(context);

      expect(queried).toBe('Project A');
    });
  });

  // ===================================================================
  // Regression: WikiLink widget must nest inside enclosing formatting
  // marks (tok-strong > tok-wikilink etc.), not render as a bare sibling.
  // Root cause: CM6 nests mark/widget decorations by facet precedence,
  // not range containment alone — a mark gets split at the boundary of a
  // lower-precedence decoration instead of wrapping it. wikiLinkLivePreview
  // must stay higher-precedence than inlineLivePreviewRegion.
  // ===================================================================
  describe('regression: WikiLink widget nests inside enclosing formatting marks', () => {
    /** Walks up from the widget through successive .closest() calls, asserting each expected ancestor class wraps the one before it, outermost last. */
    function expectNestedAncestry(view: EditorView, widgetSelector: string, ...classesInnerToOuter: string[]) {
      const widget = view.dom.querySelector(widgetSelector);
      expect(widget, `expected to find widget matching ${widgetSelector}`).not.toBeNull();
      let current: Element = widget!;
      for (const cls of classesInnerToOuter) {
        const ancestor = current.closest(`.${cls}`);
        expect(ancestor, `expected an ancestor with class ${cls}`).not.toBeNull();
        current = ancestor!;
      }
    }

    it('**[[Page]]**: tok-strong wraps the WikiLink widget', () => {
      const view = mountView('before **[[Page]]** after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-strong');
    });

    it('~~[[Page]]~~: tok-strike wraps the WikiLink widget', () => {
      const view = mountView('before ~~[[Page]]~~ after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-strike');
    });

    it('==[[Page]]==: tok-highlight wraps the WikiLink widget', () => {
      const view = mountView('before ==[[Page]]== after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-highlight');
    });

    it('*[[Page]]* / _[[Page]]_: tok-emphasis wraps the WikiLink widget', () => {
      expectNestedAncestry(mountView('before *[[Page]]* after', resolvedAs('Page'), true), '[data-wikilink-status]', 'tok-emphasis');
      expectNestedAncestry(mountView('before _[[Page]]_ after', resolvedAs('Page'), true), '[data-wikilink-status]', 'tok-emphasis');
    });

    it('__[[Page]]__: tok-strong wraps the WikiLink widget (underscore delimiter)', () => {
      expectNestedAncestry(mountView('before __[[Page]]__ after', resolvedAs('Page'), true), '[data-wikilink-status]', 'tok-strong');
    });

    it('**~~[[Page]]~~**: tok-strong > tok-strike > tok-wikilink, nested correctly', () => {
      const view = mountView('before **~~[[Page]]~~** after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-strike', 'tok-strong');
    });

    it('~~**[[Page]]**~~: tok-strike > tok-strong > tok-wikilink, the reverse nesting order', () => {
      const view = mountView('before ~~**[[Page]]**~~ after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-strong', 'tok-strike');
    });

    it('with an alias, nesting is unaffected: **[[Page|Alias]]** still wraps tok-strong > tok-wikilink', () => {
      const view = mountView('before **[[Page|Alias]]** after', () => ({
        status: 'resolved',
        displayLabel: 'Alias',
        activate: () => {},
      }), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-strong');
      expect(view.dom.textContent).toBe('before Alias after');
    });

    it('[See [[Page]]](url): tok-link wraps the WikiLink widget — same mechanism as Strong/Strike/Highlight/Emphasis, since Link stays inside the shared inlineLivePreviewRegion traversal', () => {
      const view = mountView('before [See [[Page]]](https://example.com) after', resolvedAs('Page'), true);
      expectNestedAncestry(view, '[data-wikilink-status]', 'tok-link');
      expect(view.dom.textContent).toBe('before See Page after');
    });
  });

  // ===================================================================
  // Known, not-yet-fixed side effect of wikiLinkLivePreview.ts's generic
  // ancestor-widening (isDelimitedMarkConstruct), discovered while
  // investigating Link (docs/editor-architecture-decisions.md, "A live,
  // already-shipped side effect discovered while investigating Link").
  // Link's own two LinkMark children (opening "[" and closing ")")
  // structurally match the "two identically-named children ending in
  // Mark" check even though Link is not a registered delimited-inline
  // participant — so a caret at the Link's OWN bracket, nowhere near a
  // nested WikiLink, incorrectly widens WikiLink's engagement boundary to
  // include the whole Link. Pinned here as documented-but-unfixed current
  // behavior, per this file's own convention for known limitations (see
  // the "known, deferred limitation" block below), not silently untested.
  // ===================================================================
  describe('KNOWN LIMITATION: a WikiLink nested in a Link label is falsely widened by the Link\'s own LinkMark pair', () => {
    it('caret at the Link\'s own opening bracket (nowhere near the WikiLink) incorrectly reveals the nested WikiLink — documents current behavior, not desired behavior', () => {
      const doc = 'x [See [[Page]]](https://example.com) y';
      const linkOpenBracket = doc.indexOf('[See') + 1;
      const view = mountViewWithSelection(doc, linkOpenBracket, resolvedAs('Page'), true);

      // Desired behavior would be "See Page" (WikiLink stays compact,
      // since the caret isn't inside it) — current behavior incorrectly
      // reveals it. This assertion documents the bug, not an endorsement.
      expect(view.dom.textContent).toContain('[[Page]]');
    });
  });

  // ===================================================================
  // Regression: a two-character gap at each edge of an enclosing
  // formatting construct (**[[X]]** positions 0-1 and (len-2)-(len-1))
  // let the enclosing mark reveal raw while WikiLink stayed compact,
  // producing an impossible **X** state. WikiLink's own engagement must
  // track the outermost enclosing delimited-inline-formatting ancestor,
  // computed structurally (no construct names).
  // ===================================================================
  describe('regression: engagement boundary matches the enclosing formatting region, no gap', () => {
    it('every caret position inside **[[Display text]]** yields either the fully-collapsed or fully-engaged state — never the impossible **Display text** mix', () => {
      // Padded ("x " / " y"): CM6's default selection is (0,0), and the
      // construct here starts at 0, so an unpadded doc's own "at rest"
      // baseline (computed with no selection dispatched) would itself
      // already be sitting on the pre-existing "whole-document initial
      // caret" boundary case — silently matching the very mixed state
      // this test exists to catch, rather than the genuine collapsed form.
      const construct = '**[[Display text]]**';
      const doc = `x ${construct} y`;
      const constructFrom = doc.indexOf(construct);
      const constructTo = constructFrom + construct.length;

      // Baseline established with the caret far outside the construct —
      // not the default (0,0) selection.
      const atRest = mountViewWithSelection(doc, 0, resolvedAs('Display text'), true).dom.textContent;
      expect(atRest).toBe('x Display text y'); // sanity: guards against a vacuous baseline

      for (let pos = constructFrom; pos <= constructTo; pos++) {
        const swept = mountViewWithSelection(doc, pos, resolvedAs('Display text'), true);
        const text = swept.dom.textContent ?? '';
        const isFullyEngaged = text === doc;
        const isFullyAtRest = text === atRest;
        expect(
          isFullyEngaged || isFullyAtRest,
          `caret at ${pos}: got "${text}", neither fully engaged ("${doc}") nor at rest ("${atRest}")`
        ).toBe(true);
      }
    });

    it('caret exactly at the outer ** boundary (before WikiLink itself starts) already shows the fully engaged form', () => {
      const doc = '**[[Display text]]**';
      const view = mountViewWithSelection(doc, 0, resolvedAs('Display text'), true);

      expect(view.dom.textContent).toBe('**[[Display text]]**');
    });

    it('caret exactly at the outer closing ** boundary (after WikiLink itself ends) still shows the fully engaged form', () => {
      const doc = '**[[Display text]]**';
      const view = mountViewWithSelection(doc, doc.length, resolvedAs('Display text'), true);

      expect(view.dom.textContent).toBe('**[[Display text]]**');
    });

    it('deeper nesting (**~~[[Display text]]~~**) also has no gap at the outermost boundary', () => {
      const doc = '**~~[[Display text]]~~**';
      const view = mountViewWithSelection(doc, 0, resolvedAs('Display text'), true);

      expect(view.dom.textContent).toBe(doc);
    });

    it('a caret just outside the whole formatting construct stays fully at rest — the widening does not overreach', () => {
      const doc = 'x **[[Display text]]** y';
      const constructStart = doc.indexOf('**');
      const view = mountViewWithSelection(doc, constructStart - 1, resolvedAs('Display text'), true);

      expect(view.dom.textContent).toBe('x Display text y');
    });

    it('with an alias: the same boundary positions engage fully, never an intermediate **Display text** (alias case)', () => {
      const doc = '**[[Projects/Project A|Display name]]**';
      const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'Display name', activate: () => {} });
      const view = mountViewWithSelection(doc, 0, resolver, true);

      expect(view.dom.textContent).toBe('**[[Project A|Display name]]**');
      expect(view.dom.textContent).not.toContain('Projects/');
    });

    it('a bare WikiLink with no enclosing formatting is unaffected: engagement boundary equals its own node range', () => {
      const doc = 'before [[Projects/Project A]] after';
      const nodeFrom = 'before '.length;
      const view = mountViewWithSelection(doc, nodeFrom, resolvedAs('Project A'), true);

      expect(view.dom.textContent).toBe('before [[Project A]] after');

      // One position before the node: must NOT be engaged (no formatting
      // ancestor to widen into) — the fix must not accidentally widen a
      // bare WikiLink's own boundary.
      const before = mountViewWithSelection(doc, nodeFrom - 1, resolvedAs('Project A'), true);
      expect(before.dom.textContent).toBe('before Project A after');
    });
  });
});

// =====================================================================
// Regression: a WikiLink whose `[[`/`]]` land on different physical lines
// of the same lazy-continuation paragraph must never produce a decoration
// that crosses the line break. wikiLinkLivePreview renders WikiLink via a
// ViewPlugin, and CM6 throws "Decorations that replace line breaks may
// not be specified via plugins" for any ViewPlugin-sourced
// Decoration.replace() whose range crosses a line — see
// docs/editor-architecture-decisions.md and the investigation that traced
// this crash. Mounting a real EditorView here (not just checking the
// syntax tree) is deliberate: it's the actual code path that threw.
// =====================================================================
// CM6 renders each document line as its own DOM block (`.cm-line`); the
// browser's `textContent` does not insert a `\n` between them, so
// multi-line assertions here compare per-line text rather than the whole
// `view.dom.textContent` blob. A leading/trailing word around a WikiLink
// keeps its node away from doc position 0, where CM6's default (0,0)
// selection would otherwise engage it (see the existing "bare WikiLink"
// tests above), so the widget-rendering assertions reflect the at-rest
// case they intend to test.
function lineTexts(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line')).map((line) => line.textContent ?? '');
}

describe('wikiLinkLivePreview — cross-line WikiLink never crashes the view', () => {
  it('a single-line WikiLink still renders as a widget', () => {
    const view = mountView('before [[Some Page]] after', resolvedAs('Some Page'));
    expect(view.dom.textContent).toBe('before Some Page after');
  });

  it('a single-line WikiLink with spaces in the path still renders as a widget', () => {
    const view = mountView('before [[Some Page Name]] after', resolvedAs('Some Page Name'));
    expect(view.dom.textContent).toBe('before Some Page Name after');
  });

  it('a WikiLink split across a physical newline does not mount as a widget — it stays raw text', () => {
    expect(() => {
      const view = mountView('See [[Some Page\nName]] for details.', resolvedAs('should never render'));
      expect(lineTexts(view)).toEqual(['See [[Some Page', 'Name]] for details.']);
      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
    }).not.toThrow();
  });

  it('text after the newline following an unclosed [[ is not incorrectly claimed across the line break', () => {
    expect(() => {
      const view = mountView('[[Unclosed\nSecond line stays plain text.', resolvedAs('should never render'));
      expect(lineTexts(view)).toEqual(['[[Unclosed', 'Second line stays plain text.']);
      expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
    }).not.toThrow();
  });

  it('two independent single-line WikiLinks on separate lines both still render', () => {
    const doc = 'a [[Page One]]\nb [[Page Two]]';
    // Selection at position 0, away from either node's boundary, so
    // neither engages — the default (0,0) caret only matters when a
    // WikiLink node itself starts at position 0 (see the "bare WikiLink"
    // test above), which isn't the case here.
    const view = mountView(doc, (path) => ({
      status: 'resolved',
      displayLabel: path,
      activate: () => {},
    }));
    expect(lineTexts(view)).toEqual(['a Page One', 'b Page Two']);
  });

  it('an ordinary multiline paragraph with unrelated text and no WikiLink parses normally', () => {
    const doc = 'This is a normal\nmultiline paragraph with no\nwikilinks at all.';
    const view = mountView(doc, resolvedAs('should never render'));
    expect(lineTexts(view)).toEqual(doc.split('\n'));
    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
  });

  it('the originally crashing note (a cross-line WikiLink among other content) opens without throwing', () => {
    const doc = 'Intro paragraph.\n\nSee [[Some Page\nName]] for details.\n\nTrailing paragraph.';
    expect(() => mountView(doc, resolvedAs('should never render'))).not.toThrow();
  });
});
