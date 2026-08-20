// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tagDecorations } from './tagDecorations';
import { handleTagClick } from './tagMouseHandlers';
import type { ResolveTag } from './tagResolution';

/** Exercises handleTagClick directly with an explicit position — jsdom has no posAtCoords geometry, same rationale as wikiLinkMouseHandlers.test.ts. */
function mountView(doc: string, resolver?: ResolveTag): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tagDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

describe('handleTagClick', () => {
  it('a plain click on an at-rest Tag activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleTagClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest Tag engages it instead of activating', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleTagClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(view.dom.querySelector('[data-tag-status]')).toBeNull();
    expect(view.dom.textContent).toContain('#project');
  });

  it('a click that is not on any Tag is not handled, letting CM6 fall through to default behavior', () => {
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate: vi.fn() });
    const view = mountView('Text before #project', resolver);

    const handled = handleTagClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged Tag is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeFrom + 3 } }); // engage it first
    const handled = handleTagClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to unresolved when no resolver is provided, still activates without throwing', () => {
    const view = mountView('Text before #project');
    const nodeFrom = 'Text before '.length;

    expect(() => handleTagClick(view, nodeFrom + 2, false, () => undefined)).not.toThrow();
  });
});
