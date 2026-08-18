// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { semanticTokenDecorations, type RenderToken } from './tokenDecorations';

const isFixtureToken = (name: string): boolean => name === 'WikiLink';

class FixtureWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.textContent = this.label;
    span.dataset.fixtureToken = 'true';
    return span;
  }
}

function mountView(doc: string, renderToken: RenderToken): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), semanticTokenDecorations(isFixtureToken, renderToken)],
  });
  return new EditorView({ state, parent });
}

describe('semanticTokenDecorations — generic, predicate/renderer-driven', () => {
  it('renders an at-rest token via the supplied renderToken callback', () => {
    const view = mountView('x [[Projects/Page]] y', (_view, _node, raw) => new FixtureWidget(raw));

    const widget = view.dom.querySelector('[data-fixture-token]');
    expect(widget?.textContent).toBe('[[Projects/Page]]');
  });

  it('skips decorating when renderToken returns null', () => {
    const view = mountView('x [[Projects/Page]] y', () => null);

    expect(view.dom.querySelector('[data-fixture-token]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Projects/Page]]');
  });

  it('does not decorate an engaged node — raw text renders instead', () => {
    const view = mountView('x [[Projects/Page]] y', (_view, _node, raw) => new FixtureWidget(raw));

    view.dispatch({ selection: { anchor: 5 } }); // inside the node

    expect(view.dom.querySelector('[data-fixture-token]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Projects/Page]]');
  });

  it('marks the at-rest range atomic, and stops once engaged', () => {
    function isCovered(view: EditorView): boolean {
      const providers = view.state.facet(EditorView.atomicRanges);
      return providers.some((provider) => {
        let found = false;
        provider(view).between(0, view.state.doc.length, () => {
          found = true;
        });
        return found;
      });
    }

    const view = mountView('x [[Projects/Page]] y', (_view, _node, raw) => new FixtureWidget(raw));
    expect(isCovered(view)).toBe(true);

    view.dispatch({ selection: { anchor: 5 } });
    expect(isCovered(view)).toBe(false);
  });
});
