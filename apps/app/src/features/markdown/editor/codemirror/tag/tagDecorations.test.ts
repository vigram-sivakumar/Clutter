// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tagDecorations } from './tagDecorations';
import type { ResolveTag } from './tagResolution';

function mountView(doc: string, resolver?: ResolveTag): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tagDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

/** Same "position 0 is already engaged" trap wikiLinkDecorations.test.ts documents — leading text keeps the default mount position outside the node. */
function mountAtRest(tagText: string, resolver?: ResolveTag): EditorView {
  return mountView(`Text before ${tagText}`, resolver);
}

const resolvedTag = (): ResolveTag => (name) => ({ status: 'resolved', displayLabel: name, activate: vi.fn() });
const unresolvedTag = (): ResolveTag => (name) => ({ status: 'unresolved', displayLabel: name, activate: vi.fn() });

describe('tagDecorations — at-rest rendering', () => {
  it('renders an at-rest Tag as a widget showing the resolution\'s displayLabel — identical to the raw text when the tag has no separator', () => {
    const view = mountAtRest('#project', resolvedTag());

    const widget = view.dom.querySelector('[data-tag-status="resolved"]');
    expect(widget?.textContent).toBe('#project');
  });

  it('renders the injected resolution\'s displayLabel, not the raw matched text, when they differ (separator normalization)', () => {
    const resolver: ResolveTag = () => ({
      status: 'resolved',
      displayLabel: 'Product design',
      activate: vi.fn(),
    });
    const view = mountAtRest('#Product-design', resolver);

    const widget = view.dom.querySelector('[data-tag-status="resolved"]');
    expect(widget?.textContent).toBe('#Product design');
  });

  it('falls back to unresolved when no resolver is provided, with a locally-formatted (separator-to-space) display label', () => {
    const view = mountAtRest('#project');

    const widget = view.dom.querySelector('[data-tag-status="unresolved"]');
    expect(widget?.textContent).toBe('#project');
  });

  it('falls back to a separator-normalized display label with no resolver injected at all', () => {
    const view = mountAtRest('#Product_design');

    const widget = view.dom.querySelector('[data-tag-status="unresolved"]');
    expect(widget?.textContent).toBe('#Product design');
  });

  it('calls the resolver with the identifier only, without the leading #', () => {
    const resolver = vi.fn(() => ({ status: 'resolved' as const, displayLabel: 'project', activate: vi.fn() }));
    mountAtRest('#project', resolver);

    expect(resolver).toHaveBeenCalledWith('project');
  });

  it('renders resolved and unresolved statuses on their own distinct data-tag-status hook', () => {
    const resolvedView = mountAtRest('#project', resolvedTag());
    expect(resolvedView.dom.querySelector('[data-tag-status="resolved"]')).not.toBeNull();

    const unresolvedView = mountAtRest('#newtag', unresolvedTag());
    expect(unresolvedView.dom.querySelector('[data-tag-status="unresolved"]')).not.toBeNull();
  });
});

describe('tagDecorations — engagement derived from selection, never stored', () => {
  it('does not decorate a Tag when the selection is contained within it — raw text renders instead', () => {
    const view = mountAtRest('#project', resolvedTag());
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.querySelector('[data-tag-status]')).toBeNull();
    expect(view.dom.textContent).toContain('#project');
  });

  it('re-decorates back to the widget once the selection leaves the range', () => {
    const view = mountView('Before #project after', resolvedTag());

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.querySelector('[data-tag-status]')).toBeNull();

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.querySelector('[data-tag-status]')).not.toBeNull();
  });

  it('a selection spanning from outside into the node keeps it collapsed (not partially revealed)', () => {
    const view = mountView('x #project', resolvedTag());

    view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(view.dom.querySelector('[data-tag-status]')).not.toBeNull();
  });
});

describe('tagDecorations — atomic-range wiring', () => {
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

  it('includes the at-rest Tag range in EditorView.atomicRanges — the widget-based render, not a null skip, is what makes this possible', () => {
    const view = mountAtRest('#project', resolvedTag());
    expect(isCovered(view)).toBe(true);
  });

  it('does not mark an engaged (raw-text) Tag range as atomic', () => {
    const view = mountAtRest('#project', resolvedTag());
    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(isCovered(view)).toBe(false);
  });
});

describe('tagDecorations — document invariance', () => {
  it('the stored document text never changes as the Tag collapses/reveals', () => {
    const text = 'Before #project after';
    const view = mountView(text, resolvedTag());

    expect(view.state.doc.toString()).toBe(text);
    view.dispatch({ selection: { anchor: 10 } });
    expect(view.state.doc.toString()).toBe(text);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.doc.toString()).toBe(text);
  });
});
