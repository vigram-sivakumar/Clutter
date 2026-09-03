// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { renderEmbedCompletion, type EmbedCompletion } from './embedCompletionRenderer';
import type { EmbedSuggestion } from './embedSuggestion';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create(), parent });
}

function render(suggestion: EmbedSuggestion): HTMLElement {
  const completion: EmbedCompletion = { label: 'unused', suggestion } as EmbedCompletion;
  const view = mountView();
  const row = renderEmbedCompletion(completion as Completion, view.state, view);
  if (!(row instanceof HTMLElement)) {
    throw new Error('Expected renderEmbedCompletion to render a genuine EmbedCompletion');
  }
  return row;
}

function titleText(row: HTMLElement): string | null {
  return row.querySelector('.wikilink-completion__title')?.textContent ?? null;
}

function pathText(row: HTMLElement): string | null {
  return row.querySelector('.wikilink-completion__path')?.textContent ?? null;
}

function iconHtml(row: HTMLElement): string | undefined {
  return row.querySelector('.wikilink-completion__icon')?.innerHTML;
}

describe('renderEmbedCompletion', () => {
  it('renders the resource title and no breadcrumb row for a root-level resource', () => {
    const row = render({
      kind: 'resource',
      path: 'hero.png',
      title: 'hero',
      breadcrumb: null,
      resourceKind: 'image',
    });

    expect(titleText(row)).toBe('hero');
    expect(pathText(row)).toBeNull();
  });

  it('renders the breadcrumb for a nested resource, dot-joined like WikiLink\'s own breadcrumb rendering', () => {
    const row = render({
      kind: 'resource',
      path: 'Projects/A/hero.png',
      title: 'hero',
      breadcrumb: 'Projects/A',
      resourceKind: 'image',
    });

    expect(titleText(row)).toBe('hero');
    expect(pathText(row)).toBe('Projects / A');
  });

  it('shows a different icon for an image resource than a pdf resource', () => {
    const imageRow = render({
      kind: 'resource',
      path: 'hero.png',
      title: 'hero',
      breadcrumb: null,
      resourceKind: 'image',
    });
    const pdfRow = render({
      kind: 'resource',
      path: 'spec.pdf',
      title: 'spec',
      breadcrumb: null,
      resourceKind: 'pdf',
    });

    expect(iconHtml(imageRow)).toBeTruthy();
    expect(iconHtml(pdfRow)).toBeTruthy();
    expect(iconHtml(imageRow)).not.toBe(iconHtml(pdfRow));
  });

  it('returns null for a completion that is not an EmbedCompletion — coexistence guard for the shared addToOptions array', () => {
    const view = mountView();
    const plainCompletion: Completion = { label: 'plain' };

    expect(renderEmbedCompletion(plainCompletion, view.state, view)).toBeNull();
  });
});
