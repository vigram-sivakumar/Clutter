// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from './completion';
import { markdownLanguageExtension } from './markdownLanguage';
import type { GetTagSuggestions } from './tag/tagSuggestion';
import { WIKILINK_TOOLTIP_CLASS } from './wikilink/wikiLinkAutocomplete';
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

describe('semanticCompletion — popup min-width class', () => {
  it('marks the popup while it lists [[ suggestions, so only that one gets the wider minimum', async () => {
    const tooltip = await openCompletionAt('x [[Gui');
    expect(tooltip?.classList.contains(WIKILINK_TOOLTIP_CLASS)).toBe(true);
  });

  it('leaves other sources’ popups (e.g. #tags) at CM6’s own sizing', async () => {
    const tooltip = await openCompletionAt('x #des');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.classList.contains(WIKILINK_TOOLTIP_CLASS)).toBe(false);
  });
});
