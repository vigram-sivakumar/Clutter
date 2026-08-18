// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import type { ResolveWikiLink } from './wikiLinkResolution';

function mountView(doc: string, resolver?: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), wikiLinkDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

/**
 * CM6's default selection on a freshly-constructed view is a zero-width
 * caret at position 0. Engagement is (correctly, per the locked contract)
 * "selection strictly within the node's range, including exactly at
 * either boundary" — so a WikiLink placed at the very start of the
 * document is, by that same rule, already "engaged" the instant the view
 * mounts, purely because position 0 happens to coincide with the node's
 * own start boundary. That's not a bug in the decoration logic; it's the
 * containment rule doing exactly what it's defined to do. It's a real trap
 * for *tests* that want to assert at-rest rendering, though — every
 * document below prefixes the WikiLink with leading text specifically so
 * the default mount position sits safely outside the node, and the one
 * test that actually wants position-0 behavior (the boundary test further
 * down) documents that choice explicitly rather than hitting this by
 * accident.
 */
function mountAtRest(wikiLinkText: string, resolver?: ResolveWikiLink): EditorView {
  return mountView(`Text before ${wikiLinkText}`, resolver);
}

const resolvedAs = (displayLabel: string): ResolveWikiLink => () => ({
  status: 'resolved',
  displayLabel,
  activate: vi.fn(),
});

describe('wikiLinkDecorations — at-rest rendering', () => {
  it('renders an at-rest WikiLink as a widget showing the resolved display label, not the raw syntax', () => {
    const view = mountAtRest('[[Projects/Page]]', resolvedAs('My Page'));

    const widget = view.dom.querySelector('[data-wikilink-status="resolved"]');
    expect(widget?.textContent).toBe('My Page');
    expect(view.dom.textContent).not.toContain('[[Projects/Page]]');
  });

  it('falls back to the raw path as the display label when no resolver is provided', () => {
    const view = mountAtRest('[[Projects/Page]]');

    const widget = view.dom.querySelector('[data-wikilink-status="unresolved"]');
    expect(widget?.textContent).toBe('Projects/Page');
  });

  it('calls the resolver with the parsed path and local alias', () => {
    const resolver = vi.fn(() => ({
      status: 'resolved' as const,
      displayLabel: 'x',
      activate: vi.fn(),
    }));
    mountAtRest('[[Projects/Page|Alias]]', resolver);

    expect(resolver).toHaveBeenCalledWith('Projects/Page', 'Alias');
  });

  it('passes null as the local alias for a bare reference', () => {
    const resolver = vi.fn(() => ({
      status: 'resolved' as const,
      displayLabel: 'x',
      activate: vi.fn(),
    }));
    mountAtRest('[[Projects/Page]]', resolver);

    expect(resolver).toHaveBeenCalledWith('Projects/Page', null);
  });

  it('renders unresolved and ambiguous statuses on their own distinct data-wikilink-status hook', () => {
    const unresolvedView = mountAtRest('[[Missing]]', () => ({
      status: 'unresolved',
      displayLabel: 'Missing',
      activate: vi.fn(),
    }));
    expect(unresolvedView.dom.querySelector('[data-wikilink-status="unresolved"]')).not.toBeNull();

    const ambiguousView = mountAtRest('[[Alpha]]', () => ({
      status: 'ambiguous',
      displayLabel: 'Alpha',
      activate: vi.fn(),
    }));
    expect(ambiguousView.dom.querySelector('[data-wikilink-status="ambiguous"]')).not.toBeNull();
  });
});

describe('wikiLinkDecorations — engagement derived from selection, never stored', () => {
  it('does not decorate a WikiLink when the selection is contained within it — raw text renders instead', () => {
    const view = mountAtRest('[[Projects/Page]]', resolvedAs('My Page'));
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Projects/Page]]');
  });

  it('a zero-width caret exactly at either boundary counts as engaged — including at document position 0, deliberately', () => {
    // Unlike every other test in this file, this one intentionally does
    // NOT prefix with leading text: it exists specifically to pin down
    // the position-0-coincidence behavior documented on mountAtRest above,
    // not to test ordinary at-rest rendering.
    const text = '[[Projects/Page]]';
    const viewAtStart = mountView(text, resolvedAs('My Page'));
    expect(viewAtStart.dom.querySelector('[data-wikilink-status]')).toBeNull();

    const viewAtEnd = mountView(text, resolvedAs('My Page'));
    viewAtEnd.dispatch({ selection: { anchor: text.length } });
    expect(viewAtEnd.dom.querySelector('[data-wikilink-status]')).toBeNull();
  });

  it('re-decorates back to the widget once the selection leaves the range', () => {
    const view = mountView('Before [[Projects/Page]] after', resolvedAs('My Page'));

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.querySelector('[data-wikilink-status]')).not.toBeNull();
  });

  it('a selection spanning from outside into the node keeps it collapsed (not partially revealed)', () => {
    const view = mountView('x [[Projects/Page]]', resolvedAs('My Page'));

    // Selection starts before the node and ends inside it.
    view.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(view.dom.querySelector('[data-wikilink-status]')).not.toBeNull();
  });
});

describe('wikiLinkDecorations — atomic-range wiring', () => {
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

  it('includes the at-rest WikiLink range in EditorView.atomicRanges', () => {
    const view = mountAtRest('[[Projects/Page]]', resolvedAs('My Page'));
    expect(isCovered(view)).toBe(true);
  });

  it('does not mark an engaged (raw-text) WikiLink range as atomic', () => {
    const view = mountAtRest('[[Projects/Page]]', resolvedAs('My Page'));
    const nodeStart = 'Text before '.length;
    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(isCovered(view)).toBe(false);
  });
});
