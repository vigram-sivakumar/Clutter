// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { renderTagCompletion } from './tagCompletionRenderer';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create(), parent });
}

describe('renderTagCompletion', () => {
  it('renders a Tag completion\'s label (#testing) visibly', () => {
    const completion: Completion = { label: '#testing' };
    const view = mountView();

    const row = renderTagCompletion(completion, view.state, view);

    expect(row).toBeInstanceOf(HTMLElement);
    const element = row as HTMLElement;
    expect(element.className).toBe('tag-completion');
    expect(element.textContent).toBe('#testing');
  });

  it('returns null for a non-Tag completion (no leading "#" in the label), so it cannot interfere with WikiLink or Date rows', () => {
    const view = mountView();

    expect(renderTagCompletion({ label: 'Alpha' }, view.state, view)).toBeNull();
    expect(renderTagCompletion({ label: 'Today' }, view.state, view)).toBeNull();
    expect(renderTagCompletion({ label: 'Create "New Note"' }, view.state, view)).toBeNull();
  });
});
