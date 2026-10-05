// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkHoverPreview, type WikiLinkHoverHandlers } from './wikiLinkHoverPreview';
import { wikiLinkLivePreview } from './wikiLinkLivePreview';
import { handleWikiLinkClick, wikiLinkMouseHandlers } from './wikiLinkMouseHandlers';
import type { ResolveWikiLink } from './wikiLinkResolution';

const activate = vi.fn();
const resolver: ResolveWikiLink = (path) => {
  if (path === 'Existing' || path === 'Other') {
    return { status: 'resolved', pageId: `id:${path}`, displayLabel: path, activate, icon: 'note', emoji: null };
  }
  if (path === 'Ambiguous') {
    return { status: 'ambiguous', displayLabel: path, activate };
  }
  return { status: 'unresolved', displayLabel: path, activate };
};

const views: EditorView[] = [];
function mount(doc: string, handlers: WikiLinkHoverHandlers | undefined) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [
        markdownLanguageExtension(),
        wikiLinkLivePreview(() => resolver),
        wikiLinkMouseHandlers(() => resolver),
        wikiLinkHoverPreview(() => handlers),
      ],
    }),
    parent,
  });
  views.push(view);
  return view;
}
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

const DOC = 'x [[Existing]] [[Other]] [[Missing]] [[Ambiguous]]';
const link = (view: EditorView, label: string) =>
  [...view.dom.querySelectorAll<HTMLElement>('.tok-wikilink')].find((el) => el.textContent === label)!;
const over = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ...init }));
const out = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, ...init }));

describe('wikiLinkHoverPreview', () => {
  it('reports a resolved link with its page id and the rendered element as anchor', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Existing'));

    expect(handlers.enter).toHaveBeenCalledWith({
      kind: 'resolved',
      element: link(view, 'Existing'),
      pageId: 'id:Existing',
    });
  });

  it('reports an unresolved link with its own title and no page id', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Missing'));

    expect(handlers.enter).toHaveBeenCalledWith({ kind: 'unresolved', element: link(view, 'Missing'), title: 'Missing' });
  });

  it('does not report an ambiguous link', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Ambiguous'));

    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('keeps each link independent: hovering another link reports that link', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Existing'));
    out(link(view, 'Existing'));
    over(link(view, 'Other'));

    expect(handlers.enter.mock.calls.map(([t]) => t.pageId)).toEqual(['id:Existing', 'id:Other']);
    expect(handlers.leave).toHaveBeenCalledTimes(1);
  });

  it('moving between a link\'s own children is not a leave or a second enter', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);
    const el = link(view, 'Existing');
    const title = el.querySelector('.tok-wikilink__title')!;

    over(el);
    over(title, { relatedTarget: el });
    out(title, { relatedTarget: el });
    out(el, { relatedTarget: title });

    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.leave).not.toHaveBeenCalled();
  });

  it('reports a leave when the pointer leaves the link', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Existing'));
    out(link(view, 'Existing'), { relatedTarget: document.body });

    expect(handlers.leave).toHaveBeenCalledTimes(1);
  });

  it('ignores links passed over with a button held (a drag-selection)', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    over(link(view, 'Existing'), { buttons: 1 });

    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('drops the hover on mousedown and on a document change', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);

    view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handlers.leave).toHaveBeenCalledTimes(1);

    view.dispatch({ changes: { from: 0, insert: 'y' } });
    expect(handlers.leave).toHaveBeenCalledTimes(2);
  });

  it('is a passive observer: never changes the document or selection, never cancels the event', () => {
    const view = mount(DOC, { enter: vi.fn(), leave: vi.fn() });
    const event = new MouseEvent('mouseover', { bubbles: true, cancelable: true });

    link(view, 'Existing').dispatchEvent(event);
    out(link(view, 'Existing'));

    expect(event.defaultPrevented).toBe(false);
    expect(view.state.doc.toString()).toBe(DOC);
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);
  });

  it('does nothing without handlers (a nested read-only view)', () => {
    const view = mount(DOC, undefined);

    expect(() => over(link(view, 'Existing'))).not.toThrow();
  });

  it('leaves WikiLink click activation unchanged — hovering first changes nothing about it', () => {
    activate.mockClear();
    const view = mount(DOC, { enter: vi.fn(), leave: vi.fn() });
    // jsdom has no layout (`posAtCoords`), so exercise the click decision directly, as the existing click tests do.
    const pos = DOC.indexOf('[[Existing]]') + 2;

    over(link(view, 'Existing'));
    const handled = handleWikiLinkClick(view, pos, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on destroy', () => {
    const handlers = { enter: vi.fn(), leave: vi.fn() };
    const view = mount(DOC, handlers);
    const el = link(view, 'Existing');
    const root = view.dom;
    view.destroy();
    views.length = 0;
    handlers.leave.mockClear();

    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handlers.leave).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
  });
});
