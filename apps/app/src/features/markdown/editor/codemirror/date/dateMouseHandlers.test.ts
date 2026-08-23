// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getDateActivation } from './dateActivation';
import { dateDecorations } from './dateDecorations';
import { findAtRestDateAt } from './dateEngagement';
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

/** No `dateDecorations` — isolates `getDateActivation` from the widget-rendering resolver call `dateDecorations` triggers on mount. */
function mountViewWithoutDecorations(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
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

  it('Alt-click on an at-rest Date activates it the same as a plain click — no special engage behavior', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleDateClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
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

  describe('invalid (shape-valid, calendar-invalid) Date — non-interactive, not a clickable token', () => {
    it('a plain click is not handled and never activates — treated as no token at that position', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('Text before @2026-13-45', resolver);
      const nodeFrom = 'Text before '.length;

      const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

      // `handled === false` is exactly the signal `tokenMouseHandlers.ts`'s
      // real `mousedown` DOM handler uses to decide whether to call
      // `event.preventDefault()` — false here means the click is left
      // alone for the browser's own default behavior (ordinary caret
      // placement), not swallowed for a no-op navigation.
      expect(handled).toBe(false);
      expect(activate).not.toHaveBeenCalled();
    });

    it('Alt-click is also not handled — no special engage-at-end behavior, but the position is still inside the node so native caret placement leaves it editable', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('Text before @2026-13-45', resolver);
      const nodeFrom = 'Text before '.length;

      const handled = handleDateClick(view, nodeFrom + 3, true, () => resolver);

      expect(handled).toBe(false);
      expect(activate).not.toHaveBeenCalled();
    });

    it('getDateActivation itself returns null and never invokes the resolver', () => {
      const resolverFactory = vi.fn(() => ({ activate: vi.fn() }));
      const view = mountViewWithoutDecorations('Text before @2026-13-45');
      const nodeFrom = 'Text before '.length;
      const node = findAtRestDateAt(view.state, nodeFrom + 3);
      expect(node).not.toBeNull();

      const activation = getDateActivation(view, node!, () => resolverFactory);

      expect(activation).toBeNull();
      expect(resolverFactory).not.toHaveBeenCalled();
    });

    it('a valid Date immediately after an invalid one is unaffected — still activates normally', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('@2026-13-45 @2026-08-20', resolver);
      const validNodeFrom = '@2026-13-45 '.length;

      const handled = handleDateClick(view, validNodeFrom + 3, false, () => resolver);

      expect(handled).toBe(true);
      expect(activate).toHaveBeenCalledTimes(1);
    });
  });
});
