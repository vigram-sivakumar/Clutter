// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { renderWikiLinkCompletion, type WikiLinkCompletion } from './wikiLinkCompletionRenderer';
import type { WikiLinkSuggestion } from './wikiLinkSuggestion';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create(), parent });
}

function render(suggestion: WikiLinkSuggestion): HTMLElement {
  const completion: WikiLinkCompletion = { label: 'unused', suggestion } as WikiLinkCompletion;
  const view = mountView();
  return renderWikiLinkCompletion(completion as Completion, view.state, view);
}

function titleText(row: HTMLElement): string | null {
  return row.querySelector('.wikilink-completion__title')?.textContent ?? null;
}

function pathText(row: HTMLElement): string | null {
  return row.querySelector('.wikilink-completion__path')?.textContent ?? null;
}

describe('renderWikiLinkCompletion — create suggestion title/breadcrumb split', () => {
  it('shows the whole path as the title and no breadcrumb row when there is no "/"', () => {
    const row = render({ kind: 'create', path: 'Note', create: () => {} });

    expect(titleText(row)).toBe('Create "Note"');
    expect(pathText(row)).toBeNull();
  });

  it('splits a single-segment path into name + breadcrumb', () => {
    const row = render({ kind: 'create', path: 'Projects/Note', create: () => {} });

    expect(titleText(row)).toBe('Create "Note"');
    expect(pathText(row)).toBe('Projects');
  });

  it('splits a multi-segment path on the LAST "/" only', () => {
    const row = render({ kind: 'create', path: 'Projects/Project A/Note', create: () => {} });

    expect(titleText(row)).toBe('Create "Note"');
    expect(pathText(row)).toBe('Projects / Project A');
  });

  it('splits a deeply nested path, keeping every intermediate segment in the breadcrumb', () => {
    const row = render({ kind: 'create', path: 'Projects/Project A/Design/Note', create: () => {} });

    expect(titleText(row)).toBe('Create "Note"');
    expect(pathText(row)).toBe('Projects / Project A / Design');
  });

  it('leaves an existing "page" suggestion — title and breadcrumb — unchanged', () => {
    const row = render({
      kind: 'page',
      path: 'Projects/Project A/Note',
      title: 'Note',
      breadcrumb: 'Projects/Project A',
    });

    expect(titleText(row)).toBe('Note');
    expect(pathText(row)).toBe('Projects / Project A');
  });
});
