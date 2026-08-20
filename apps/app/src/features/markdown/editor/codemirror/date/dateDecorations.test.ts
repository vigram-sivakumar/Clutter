// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dateDecorations } from './dateDecorations';
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

/** Same "position 0 is already engaged" trap wikiLinkDecorations.test.ts/tagDecorations.test.ts document. */
function mountAtRest(dateText: string, resolver?: ResolveDate): EditorView {
  return mountView(`Text before ${dateText}`, resolver);
}

const resolved = (): ResolveDate => () => ({ activate: vi.fn() });

describe('dateDecorations — at-rest rendering', () => {
  it('renders an at-rest Date as a widget showing a computed label, not the raw @YYYY-MM-DD text', () => {
    const view = mountAtRest('@2026-08-20', resolved());

    const widget = view.dom.querySelector('[data-date-status="valid"]');
    expect(widget).not.toBeNull();
    expect(view.dom.textContent).not.toContain('@2026-08-20');
  });

  it('the rendered label always keeps the @ prefix as part of the widget\'s own Markdown presentation', () => {
    const view = mountAtRest('@2026-08-20', resolved());

    const widget = view.dom.querySelector('[data-date-status="valid"]');
    expect(widget?.textContent?.startsWith('@')).toBe(true);
  });

  it('falls back to activate-as-no-op when no resolver is provided, still renders a valid-looking widget', () => {
    const view = mountAtRest('@2026-08-20');

    expect(view.dom.querySelector('[data-date-status="valid"]')).not.toBeNull();
  });

  it('calls the resolver with the matched ISO date', () => {
    const resolver = vi.fn(() => ({ activate: vi.fn() }));
    mountAtRest('@2026-08-20', resolver);

    expect(resolver).toHaveBeenCalledWith('2026-08-20');
  });

  it('renders a calendar-invalid-but-shape-valid date with data-date-status="invalid" and its raw text as the label', () => {
    const view = mountAtRest('@2026-13-45', resolved());

    const widget = view.dom.querySelector('[data-date-status="invalid"]');
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toBe('@2026-13-45');
  });
});

describe('dateDecorations — engagement derived from selection, never stored', () => {
  it('does not decorate a Date when the selection is contained within it — raw text renders instead', () => {
    const view = mountAtRest('@2026-08-20', resolved());
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.querySelector('[data-date-status]')).toBeNull();
    expect(view.dom.textContent).toContain('@2026-08-20');
  });

  it('re-decorates back to the widget once the selection leaves the range', () => {
    const view = mountView('Before @2026-08-20 after', resolved());

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.querySelector('[data-date-status]')).toBeNull();

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.querySelector('[data-date-status]')).not.toBeNull();
  });
});

describe('dateDecorations — atomic-range wiring', () => {
  function isCovered(view: EditorView): boolean {
    const atomicProviders = view.state.facet(EditorView.atomicRanges);
    return atomicProviders.some((provider) => {
      const rangeSet = provider(view);
      let found = false;
      rangeSet.between(0, view.state.doc.length, () => {
        found = true;
      });
      return found;
    });
  }

  it('includes the at-rest Date range in EditorView.atomicRanges — the widget-based render, not a null skip, is what makes this possible', () => {
    const view = mountAtRest('@2026-08-20', resolved());
    expect(isCovered(view)).toBe(true);
  });

  it('does not mark an engaged (raw-text) Date range as atomic', () => {
    const view = mountAtRest('@2026-08-20', resolved());
    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(isCovered(view)).toBe(false);
  });
});

describe('dateDecorations — document invariance', () => {
  it('the stored document text never changes as the Date collapses/reveals', () => {
    const text = 'Before @2026-08-20 after';
    const view = mountView(text, resolved());

    expect(view.state.doc.toString()).toBe(text);
    view.dispatch({ selection: { anchor: 10 } });
    expect(view.state.doc.toString()).toBe(text);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.doc.toString()).toBe(text);
  });
});
