// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from './completion';
import { markdownLanguageExtension } from './markdownLanguage';
import type { GetTagSuggestions } from './tag/tagSuggestion';
import type { GetWikiLinkSuggestions } from './wikilink/wikiLinkSuggestion';

const getWikiLinkSuggestions: GetWikiLinkSuggestions = () => [
  { kind: 'page', path: 'Design/Guidelines', title: 'Guidelines', breadcrumb: 'Design' },
];
const getTagSuggestions: GetTagSuggestions = () => ['design'];

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

async function openCompletionAt(doc: string): Promise<HTMLElement | null> {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdownLanguageExtension(),
        semanticCompletion(
          () => getWikiLinkSuggestions,
          () => getTagSuggestions
        ),
      ],
    }),
    parent,
  });

  startCompletion(view);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(completionStatus(view.state)).toBe('active');

  return parent.querySelector<HTMLElement>('.cm-tooltip-autocomplete');
}

describe('semanticCompletion — one popup, one row shape', () => {
  it('draws a [[ suggestion and a # suggestion with the same shared row', async () => {
    const wiki = await openCompletionAt('x [[Gui');
    expect(wiki?.querySelectorAll('.completion-row')).toHaveLength(1);
    view?.destroy();

    const tag = await openCompletionAt('x #des');
    expect(tag?.querySelectorAll('.completion-row')).toHaveLength(1);
  });

  it('lists a [[ suggestion under its Notes section title', async () => {
    const tooltip = await openCompletionAt('x [[Gui');
    expect(tooltip?.querySelector('.completion-section__title')?.textContent).toBe('Notes');
  });

  it('leaves no row in the popup without the shared row class — the default label is hidden, so a bare option would be blank', async () => {
    const tooltip = await openCompletionAt('x #des');
    const options = tooltip?.querySelectorAll('li[role="option"]') ?? [];
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.querySelector('.completion-row')).not.toBeNull();
    }
  });
});
