// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dateDecorations } from './dateDecorations';
import { handleDateClick } from './dateMouseHandlers';
import type { ResolveDate } from './dateResolution';

function mountView(doc: string, resolver?: ResolveDate): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), dateDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

describe('handleDateClick', () => {
  it('a plain click on an at-rest Date activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest Date engages it instead of activating', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleDateClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(view.dom.querySelector('[data-date-status]')).toBeNull();
    expect(view.dom.textContent).toContain('@2026-08-20');
  });

  it('a click that is not on any Date is not handled', () => {
    const resolver: ResolveDate = () => ({ activate: vi.fn() });
    const view = mountView('Text before @2026-08-20', resolver);

    const handled = handleDateClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged Date is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeFrom + 3 } });
    const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to a no-op activate when no resolver is provided, does not throw', () => {
    const view = mountView('Text before @2026-08-20');
    const nodeFrom = 'Text before '.length;

    expect(() => handleDateClick(view, nodeFrom + 2, false, () => undefined)).not.toThrow();
  });
});
