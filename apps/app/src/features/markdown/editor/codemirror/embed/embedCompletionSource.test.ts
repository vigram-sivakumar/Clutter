// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedCompletionSource } from './embedCompletionSource';
import { wikiLinkCompletionSource } from '../wikilink/wikiLinkCompletionSource';
import type { GetEmbedHeadingSuggestions, GetEmbedSuggestions } from './embedSuggestion';
import type { GetWikiLinkSuggestions } from '../wikilink/wikiLinkSuggestion';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  return new EditorView({ state, parent });
}

function contextAt(view: EditorView, pos: number): CompletionContext {
  return new CompletionContext(view.state, pos, false);
}

/** embedCompletionSource/wikiLinkCompletionSource are always synchronous. */
function call(source: CompletionSource, context: CompletionContext): CompletionResult | null {
  return source(context) as CompletionResult | null;
}

describe('embedCompletionSource — fresh, not-yet-closed ![[query', () => {
  it('returns null when the cursor is not inside an in-progress ![[...', () => {
    const view = mountView('hello world');
    const getSuggestions = vi.fn();
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('queries suggestions with the text typed after ![[, and returns them as options', () => {
    const view = mountView('x ![[hero');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => [
      { kind: 'resource' as const, path: 'Projects/hero.png', title: 'hero.png', breadcrumb: 'Projects', resourceKind: 'image' as const },
    ]);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 9));

    expect(getSuggestions).toHaveBeenCalledWith('hero');
    expect(result?.from).toBe(2);
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0]?.label).toBe('hero.png');
  });

  it('supports a folder-qualified query (![[Projects/hero)', () => {
    const view = mountView('x ![[Projects/hero');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => [
      { kind: 'resource' as const, path: 'Projects/hero.png', title: 'hero.png', breadcrumb: 'Projects', resourceKind: 'image' as const },
    ]);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 18));

    expect(getSuggestions).toHaveBeenCalledWith('Projects/hero');
    expect(result?.options).toHaveLength(1);
  });

  it('supports a bare folder-prefix query (![[Projects/) showing everything under that folder', () => {
    const view = mountView('x ![[Projects/');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => [
      { kind: 'resource' as const, path: 'Projects/hero.png', title: 'hero.png', breadcrumb: 'Projects', resourceKind: 'image' as const },
      { kind: 'resource' as const, path: 'Projects/plan.pdf', title: 'plan.pdf', breadcrumb: 'Projects', resourceKind: 'pdf' as const },
    ]);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 14));

    expect(getSuggestions).toHaveBeenCalledWith('Projects/');
    expect(result?.options).toHaveLength(2);
  });

  it('returns null when the query contains an alias separator — same rule WikiLink already applies', () => {
    const view = mountView('x ![[hero.png|Caption');
    const getSuggestions = vi.fn();
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 21));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('returns null when no suggester is injected', () => {
    const view = mountView('x ![[hero');
    const source = embedCompletionSource(() => undefined);

    expect(call(source, contextAt(view, 9))).toBeNull();
  });

  it("a resource option's apply() replaces the whole ![[query with the canonical Embed text", () => {
    const view = mountView('x ![[hero y');
    const getSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'Projects/hero.png', title: 'hero.png', breadcrumb: 'Projects', resourceKind: 'image' as const },
    ];
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 9));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 9);
    }

    expect(view.state.doc.toString()).toBe('x ![[Projects/hero.png]]\n y');
  });

  it("apply() places the cursor immediately after the closing ']]' it just inserted", () => {
    const view = mountView('![[hero');
    const getSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
    ];
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7));
    const option = result?.options[0];

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 7);
    }

    expect(view.state.doc.toString()).toBe('![[hero.png]]\n');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });
});

describe('embedCompletionSource — reactivating inside an already-closed Embed', () => {
  it('offers completions when the cursor sits inside the reference portion, queried by the FULL current reference text', () => {
    // "x ![[hero.png]] y" — reference "hero.png" occupies indices 5..13.
    const view = mountView('x ![[hero.png]] y');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => [
      { kind: 'resource' as const, path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
    ]);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8)); // mid-reference

    expect(getSuggestions).toHaveBeenCalledWith('hero.png');
    expect(result).not.toBeNull();
    expect(result?.from).toBe(5);
    expect(result?.to).toBe(13);
  });

  it('still offers completions for a folder-qualified at-rest embed, querying only the visible filename segment', () => {
    // "x ![[Projects/hero.png]] y" — reference zone is "Projects/hero.png"
    // (indices 5..22); the visible (post-folder) segment is "hero.png".
    const view = mountView('x ![[Projects/hero.png]] y');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => [
      { kind: 'resource' as const, path: 'Projects/hero.png', title: 'hero.png', breadcrumb: 'Projects', resourceKind: 'image' as const },
    ]);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7)); // inside "Projects"

    expect(getSuggestions).toHaveBeenCalledWith('hero.png');
    expect(result?.to).toBe(22); // right before the closing "]]", folder included
  });

  it('returns null when the cursor is inside the alias portion, if the syntax happens to carry one', () => {
    const view = mountView('x ![[hero.png|Caption]] y');
    const getSuggestions = vi.fn();
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 18)); // well past the "|"

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it("apply() places the cursor after the full closed construct — including a pre-existing '|alias' — mirroring WikiLink's identical fix", () => {
    const view = mountView('![[hero.png|Caption]]');
    const getSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
    ];
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8)); // mid-reference, inside "hero.png"
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('![[hero.png|Caption]]\n');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
  });

  it('accepting a reactivated reference completion replaces only the reference zone, leaving surrounding brackets untouched', () => {
    const view = mountView('x ![[her]] y');
    const getSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
    ];
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('x ![[hero.png]]\n y');
  });

  it(
    "regression: accepting a reactivated reference completion on an ALREADY-CLOSED Embed places the cursor " +
      "after the pre-existing ']]', not before it — mirrors wikiLinkCompletionSource.test.ts's identical regression",
    () => {
      const view = mountView('x ![[her]] y');
      const getSuggestions: GetEmbedSuggestions = () => [
        { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
      ];
      const source = embedCompletionSource(() => getSuggestions);

      const result = call(source, contextAt(view, 8));
      const option = result?.options[0];
      expect(option).toBeDefined();

      if (typeof option?.apply === 'function') {
        option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
      }

      expect(view.state.doc.toString()).toBe('x ![[hero.png]]\n y');
      // Right after the "]]" (index 5 + "![[".length... computed directly:
      // "x ![[hero.png]] y" — "]]" ends at index 15.
      // ...and one line break later: the cursor sits at the start of the new line.
      expect(view.state.selection.main.head).toBe(16);
    }
  );

  it('a fully-emptied reference (![[]]) still lets the source attempt to query', () => {
    const view = mountView('x ![[]] y');
    const getSuggestions: GetEmbedSuggestions = vi.fn(() => []);
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5)); // right after "![["

    expect(getSuggestions).toHaveBeenCalledWith('');
    expect(result).toBeNull(); // legitimately null — the injected suggester returned []
  });
});

describe('embedCompletionSource / wikiLinkCompletionSource — no trigger collision', () => {
  it('a bare [[ never activates the Embed completion source', () => {
    const view = mountView('x [[hero');
    const getSuggestions = vi.fn();
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('an in-progress ![[hero never activates the WikiLink completion source', () => {
    const view = mountView('x ![[hero');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 9));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('only the Embed source activates for ![[hero, WikiLink stays silent — both sources checked against the exact same document/position', () => {
    const view = mountView('x ![[hero');
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const },
    ];
    const getWikiLinkSuggestions = vi.fn();

    const embedResult = call(embedCompletionSource(() => getEmbedSuggestions), contextAt(view, 9));
    const wikiLinkResult = call(wikiLinkCompletionSource(() => getWikiLinkSuggestions), contextAt(view, 9));

    expect(embedResult?.options).toHaveLength(1);
    expect(wikiLinkResult).toBeNull();
    expect(getWikiLinkSuggestions).not.toHaveBeenCalled();
  });

  it('only the WikiLink source activates for a bare [[hero, Embed stays silent', () => {
    const view = mountView('x [[hero');
    const getWikiLinkSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page', path: 'hero', title: 'hero', breadcrumb: null },
    ];
    const getEmbedSuggestions = vi.fn();

    const wikiLinkResult = call(wikiLinkCompletionSource(() => getWikiLinkSuggestions), contextAt(view, 8));
    const embedResult = call(embedCompletionSource(() => getEmbedSuggestions), contextAt(view, 8));

    expect(wikiLinkResult?.options).toHaveLength(1);
    expect(embedResult).toBeNull();
    expect(getEmbedSuggestions).not.toHaveBeenCalled();
  });
});

describe('embedCompletionSource — heading suggestions (![[Page#, ADR-032)', () => {
  it('switches to heading suggestions once the query contains #, scoped to the page portion', () => {
    const view = mountView('x ![[Note B#');
    const getSuggestions = vi.fn();
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = vi.fn(() => [
      { kind: 'heading' as const, heading: 'Setup', level: 2 },
      { kind: 'heading' as const, heading: 'Appendix', level: 1 },
    ]);
    const source = embedCompletionSource(() => getSuggestions, () => getHeadingSuggestions);

    const result = call(source, contextAt(view, 12));

    expect(getSuggestions).not.toHaveBeenCalled();
    expect(getHeadingSuggestions).toHaveBeenCalledWith('Note B', '');
    expect(result?.options).toHaveLength(2);
    expect(result?.options[0]?.label).toBe('Setup');
  });

  it('filters heading suggestions as more of the heading query is typed', () => {
    const view = mountView('x ![[Note B#Roo');
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = vi.fn(() => [{ kind: 'heading' as const, heading: 'Root causes', level: 1 }]);
    const source = embedCompletionSource(
      () => vi.fn(),
      () => getHeadingSuggestions
    );

    const result = call(source, contextAt(view, view.state.doc.length));

    expect(getHeadingSuggestions).toHaveBeenCalledWith('Note B', 'Roo');
    expect(result?.options).toHaveLength(1);
  });

  it('preserves a folder-qualified page portion when splitting on #', () => {
    const view = mountView('x ![[Notes/Note B#Set');
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = vi.fn(() => []);
    const source = embedCompletionSource(
      () => vi.fn(),
      () => getHeadingSuggestions
    );

    call(source, contextAt(view, view.state.doc.length));

    expect(getHeadingSuggestions).toHaveBeenCalledWith('Notes/Note B', 'Set');
  });

  it('returns null for a # query when no heading suggester is injected', () => {
    const view = mountView('x ![[Note B#');
    const getSuggestions = vi.fn();
    const source = embedCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 12));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it("a heading option's apply() inserts the full page#heading target", () => {
    const view = mountView('x ![[Note B#Set y');
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = () => [{ kind: 'heading', heading: 'Setup', level: 2 }];
    const source = embedCompletionSource(
      () => vi.fn(),
      () => getHeadingSuggestions
    );

    const result = call(source, contextAt(view, 15));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 15);
    }

    expect(view.state.doc.toString()).toBe('x ![[Note B#Setup]]\n y');
  });

  it('reactivating inside an already-closed ![[Page#Heading]] offers heading suggestions again, scoped to the page portion', () => {
    const view = mountView('x ![[Note B#Setup]] y');
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = vi.fn(() => [{ kind: 'heading' as const, heading: 'Setup', level: 2 }]);
    const source = embedCompletionSource(
      () => vi.fn(),
      () => getHeadingSuggestions
    );

    const result = call(source, contextAt(view, 15)); // inside "Setup"

    expect(getHeadingSuggestions).toHaveBeenCalledWith('Note B', 'Setup');
    expect(result?.from).toBe(5);
    expect(result?.to).toBe(17); // right before the closing "]]"
  });

  it('a reactivated heading completion replaces the entire reference zone with the full page#heading text', () => {
    const view = mountView('x ![[Note B#Set]] y');
    const getHeadingSuggestions: GetEmbedHeadingSuggestions = () => [{ kind: 'heading', heading: 'Setup', level: 2 }];
    const source = embedCompletionSource(
      () => vi.fn(),
      () => getHeadingSuggestions
    );

    const result = call(source, contextAt(view, 14));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('x ![[Note B#Setup]]\n y');
  });
});

describe('embedCompletionSource — every embed moves the cursor to a fresh line below', () => {
  const image = { kind: 'resource' as const, path: 'hero.png', title: 'hero.png', breadcrumb: null, resourceKind: 'image' as const };
  const pdf = { kind: 'resource' as const, path: 'plan.pdf', title: 'plan.pdf', breadcrumb: null, resourceKind: 'pdf' as const };

  /** Mounts `doc` (with history), applies the first option at the end of the `![[...` before `cursorAt`. */
  function accept(doc: string, cursorAt: number, suggestion: typeof image | typeof pdf = image) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] });
    const view = new EditorView({ state, parent });
    const source = embedCompletionSource(() => () => [suggestion]);
    const result = call(source, contextAt(view, cursorAt));
    const option = result?.options[0];
    expect(option).toBeDefined();
    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? cursorAt);
    }
    return view;
  }

  it('creates exactly one new line below the embed and puts the cursor at its start', () => {
    const view = accept('![[her', 6);

    expect(view.state.doc.toString()).toBe('![[hero.png]]\n');
    expect(view.state.doc.lines).toBe(2);
    const head = view.state.selection.main.head;
    expect(head).toBe(view.state.doc.line(2).from);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('preserves text before the embed on its line', () => {
    const view = accept('Some text ![[her', 16);

    expect(view.state.doc.toString()).toBe('Some text ![[hero.png]]\n');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it('does not stack a second blank line when one already follows', () => {
    const view = accept('![[her\n\nnext', 6);

    expect(view.state.doc.toString()).toBe('![[hero.png]]\n\nnext');
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('inserts a single break before a following content line, which stays intact', () => {
    const view = accept('![[her\nnext', 6);

    expect(view.state.doc.toString()).toBe('![[hero.png]]\n\nnext');
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('moves text after the completion range onto the new line, after the cursor', () => {
    const view = accept('x ![[her tail', 8);

    expect(view.state.doc.toString()).toBe('x ![[hero.png]]\n tail');
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('reactivating inside a closed embed: replaces the reference, then breaks after the construct (alias kept)', () => {
    const view = accept('x ![[her|Cap]] y', 8);

    expect(view.state.doc.toString()).toBe('x ![[hero.png|Cap]]\n y');
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('reactivating a closed embed that already ends its line followed by a blank line adds no break', () => {
    const view = accept('![[her]]\n\nz', 6);

    expect(view.state.doc.toString()).toBe('![[hero.png]]\n\nz');
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);
  });

  it('a PDF embed behaves the same as an image embed', () => {
    const image_ = accept('Some text ![[her', 16, image);
    const pdf_ = accept('Some text ![[pla', 16, pdf);

    expect(pdf_.state.doc.toString()).toBe('Some text ![[plan.pdf]]\n');
    expect(pdf_.state.selection.main.head).toBe(pdf_.state.doc.length);
    expect(image_.state.doc.lines).toBe(pdf_.state.doc.lines);
  });

  it('undo removes the insertion and the line break together, and redo restores both', () => {
    const view = accept('x ![[her tail', 8);
    expect(view.state.doc.toString()).toBe('x ![[hero.png]]\n tail');

    undo(view);
    expect(view.state.doc.toString()).toBe('x ![[her tail');

    redo(view);
    expect(view.state.doc.toString()).toBe('x ![[hero.png]]\n tail');
  });

  it('a heading embed (a section of a note, rendered as a block) breaks the line too', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: 'x ![[Note B#Set', extensions: [markdownLanguageExtension()] }),
      parent,
    });
    const source = embedCompletionSource(
      () => vi.fn(),
      () => () => [{ kind: 'heading' as const, heading: 'Setup', level: 2 }]
    );
    const result = call(source, contextAt(view, 15));
    const option = result?.options[0];
    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 15);
    }

    expect(view.state.doc.toString()).toBe('x ![[Note B#Setup]]\n');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it.each([
    ['a note', { kind: 'page' as const, path: 'Projects/My Notes', title: 'My Notes', breadcrumb: 'Projects' }, '![[Projects/My Notes]]'],
    [
      'a Daily Note',
      { kind: 'page' as const, path: '2026-08-24', title: '2026-08-24', breadcrumb: null, dailyNote: true },
      '![[2026-08-24]]',
    ],
  ])('%s inserts its canonical path and breaks the line like an asset does', (_label, suggestion, embed) => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ doc: 'Intro ![[Aug', extensions: [markdownLanguageExtension(), history()] });
    const view = new EditorView({ state, parent });
    const source = embedCompletionSource(() => () => [suggestion]);
    const result = call(source, contextAt(view, 12));
    const option = result?.options[0];
    expect(option).toBeDefined();
    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 12);
    }

    expect(view.state.doc.toString()).toBe(`Intro ${embed}\n`);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from);

    undo(view);
    expect(view.state.doc.toString()).toBe('Intro ![[Aug');
  });

  it('a [[Page]] completion never breaks the line', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: 'x [[Pa', extensions: [markdownLanguageExtension()] }),
      parent,
    });
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page', id: 'p1', path: 'Page', title: 'Page', breadcrumb: null } as never,
    ];
    const source = wikiLinkCompletionSource(() => getSuggestions);
    const result = call(source, contextAt(view, 6));
    const option = result?.options[0];
    expect(option).toBeDefined();
    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 6);
    }

    expect(view.state.doc.toString()).not.toContain('\n');
    expect(view.state.doc.toString()).toMatch(/^x \[\[Page\]\]/);
  });
});
