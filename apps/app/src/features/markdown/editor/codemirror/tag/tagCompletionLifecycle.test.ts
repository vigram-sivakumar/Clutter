// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { acceptCompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';

import { markdownLanguageExtension } from '../markdownLanguage';
import { semanticCompletion } from '../completion';
import { renderTagCompletion } from './tagCompletionRenderer';
import type { GetTagSuggestions } from './tagSuggestion';
import type { GetWikiLinkSuggestions } from '../wikilink/wikiLinkSuggestion';

/**
 * Integration-level coverage for Tag autocomplete, mirroring
 * `dateCompletionLifecycle.test.ts`'s approach: drives the *actual*
 * `semanticCompletion()` extension (the exact wiring `MarkdownEditor.tsx`
 * mounts) with real `input.type`-tagged keystrokes and CM6's own
 * `acceptCompletion`/`completionStatus`/`currentCompletions` APIs, rather
 * than hand-building a `CompletionContext` — proving the real CM6
 * completion machinery actually calls `tagCompletionSource` at the right
 * moments, not just that the source itself returns the right value for a
 * given position (that unit-level coverage already lives in
 * `tagCompletionSource.test.ts`).
 */

function mount(
  getTagSuggestions: () => GetTagSuggestions | undefined,
  getWikiLinkSuggestions: () => GetWikiLinkSuggestions | undefined = () => undefined
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        markdownLanguageExtension(),
        semanticCompletion(getWikiLinkSuggestions, getTagSuggestions),
      ],
    }),
    parent,
  });
}

async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function type(view: EditorView, text: string): Promise<void> {
  for (const char of text) {
    view.dispatch({
      changes: { from: view.state.selection.main.head, insert: char },
      selection: { anchor: view.state.selection.main.head + 1 },
      userEvent: 'input.type',
    });
    await settle();
  }
}

function accept(view: EditorView): void {
  const accepted = acceptCompletion(view);
  expect(accepted).toBe(true);
}

function labels(view: EditorView): string[] {
  return currentCompletions(view.state).map((completion) => completion.label);
}

describe('Tag autocomplete — real CM6 lifecycle, wired through semanticCompletion()', () => {
  it('typing #pro opens the popup with matching vault tags, and Enter accepts the full #tag', async () => {
    const getSuggestions: GetTagSuggestions = (query) =>
      ['project', 'projector'].filter((name) => name.includes(query));
    const view = mount(() => getSuggestions);

    await type(view, '#pro');
    expect(labels(view)).toEqual(['#project', '#projector']);

    await settle();
    accept(view);

    expect(view.state.doc.toString()).toBe('#project');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('no injected suggester means no popup ever opens for #', async () => {
    const view = mount(() => undefined);

    await type(view, '#project');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('a query matching nothing keeps the popup closed', async () => {
    const getSuggestions: GetTagSuggestions = () => [];
    const view = mount(() => getSuggestions);

    await type(view, '#zzz');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('does not interfere with WikiLink completion active in the same editor', async () => {
    const getTagSuggestions: GetTagSuggestions = () => ['project'];
    const getWikiLinkSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page', path: 'Projects/Alpha', title: 'Alpha', breadcrumb: 'Projects' },
    ];
    const view = mount(() => getTagSuggestions, () => getWikiLinkSuggestions);

    await type(view, '[[Proj');
    expect(labels(view)).toEqual(['Alpha']);

    view.destroy();
  });

  it('Tag completion still works normally alongside an injected WikiLink suggester', async () => {
    const getTagSuggestions: GetTagSuggestions = () => ['project'];
    const getWikiLinkSuggestions: GetWikiLinkSuggestions = () => [];
    const view = mount(() => getTagSuggestions, () => getWikiLinkSuggestions);

    await type(view, '#pro');
    expect(labels(view)).toEqual(['#project']);

    view.destroy();
  });

  /**
   * Regression for the actual reported bug: the popup opened with correctly-
   * populated options, but every row was visually empty because the shared
   * `wikiLinkAutocompleteTheme()` CSS hides CM6's default label for every
   * source, and Tag had no `addToOptions` renderer to fill the gap.
   * Verified end-to-end here — not by hand-building a Completion, but by
   * feeding `renderTagCompletion` the actual option objects the real
   * `semanticCompletion()` pipeline produced (`currentCompletions`), so this
   * fails again if either the source's label shape or the renderer's guard
   * ever drift apart from each other.
   */
  it('every option the real pipeline produces for a Tag query renders as a visible row via renderTagCompletion', async () => {
    const getSuggestions: GetTagSuggestions = () => ['project', 'projector'];
    const view = mount(() => getSuggestions);

    await type(view, '#pro');
    const completions = currentCompletions(view.state);
    expect(completions).toHaveLength(2);

    const rendered = completions.map((completion) =>
      renderTagCompletion(completion, view.state, view)
    );

    expect(rendered.every((row) => row instanceof HTMLElement)).toBe(true);
    expect((rendered as HTMLElement[]).map((row) => row.textContent)).toEqual([
      '#project',
      '#projector',
    ]);

    view.destroy();
  });
});
