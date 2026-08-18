// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import { wikiLinkMouseHandlers } from './wikiLinkMouseHandlers';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * `wikiLinkMouseHandlers.test.ts` exercises `handleWikiLinkClick` as a
 * plain function with an explicit position — deliberately, since jsdom
 * has no `posAtCoords` geometry. But that means it never goes through
 * CM6's actual DOM event dispatch, and dispatch has its own gate:
 * `WidgetType.ignoreEvent()` decides, per `@codemirror/view`'s own doc
 * comment ("the default is to ignore all events"), whether an event
 * bubbling up from a widget's DOM reaches the editor's `handleEvent` at
 * all — including every `EditorView.domEventHandlers` extension. This
 * file exercises exactly that gate, with a real bubbling `mousedown`
 * dispatched at the widget's own DOM node (`posAtCoords` stubbed, since
 * jsdom can't compute it — the fix under test is the event-reachability
 * gate, not coordinate math).
 */
function mountView(doc: string, resolver: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      wikiLinkDecorations(() => resolver),
      wikiLinkMouseHandlers(() => resolver),
    ],
  });
  return new EditorView({ state, parent });
}

describe('WikiLink click activation — real DOM event path', () => {
  it('a real mousedown dispatched on the rendered widget reaches wikiLinkMouseHandlers and activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const widget = view.dom.querySelector('[data-wikilink-status]');
    expect(widget).not.toBeNull();

    // jsdom has no text-layout geometry, so posAtCoords is stubbed to the
    // known node position — the thing under test is whether the event
    // reaches the handler at all, not coordinate resolution.
    view.posAtCoords = () => nodeFrom + 3;

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    widget!.dispatchEvent(event);

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('a real Alt-click mousedown engages (reveals raw text) instead of activating', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const widget = view.dom.querySelector('[data-wikilink-status]');
    view.posAtCoords = () => nodeFrom + 3;

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      altKey: true,
    });
    widget!.dispatchEvent(event);

    expect(activate).not.toHaveBeenCalled();
    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Projects/Page]]');
  });
});
