// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { completionStatus, currentCompletions } from '@codemirror/autocomplete';

vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { semanticCompletion } from '../completion';
import { dateMouseHandlers } from '../date/dateMouseHandlers';
import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { linkMouseHandlers } from '../link/linkMouseHandlers';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tagMouseHandlers } from '../tag/tagMouseHandlers';
import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { wikiLinkMouseHandlers } from '../wikilink/wikiLinkMouseHandlers';
import type { ResolveDate } from '../date/dateResolution';
import type { ResolveTag } from '../tag/tagResolution';
import type { ResolveWikiLink } from '../wikilink/wikiLinkResolution';

/**
 * ⌘-click on a wiki link, date, date-time or tag reveals its raw source with the caret inside it, and activates
 * nothing; a plain click activates as it always did. A real bubbling `mousedown` is dispatched at the rendered
 * widget, with `posAtCoords` stubbed (jsdom has no text-layout geometry — the thing under test is the handler, not
 * coordinate math).
 */
const activations = { wiki: vi.fn(), tag: vi.fn(), date: vi.fn() };

function mount(doc: string, extra: { readOnly?: boolean } = {}): EditorView {
  const resolveWikiLink: ResolveWikiLink = () => ({
    status: 'resolved',
    pageId: 'p',
    icon: 'note',
    emoji: null,
    displayLabel: 'X',
    activate: activations.wiki,
  });
  const resolveTag: ResolveTag = () => ({ status: 'unresolved', displayLabel: 'x', activate: activations.tag });
  const resolveDate: ResolveDate = () => ({ activate: activations.date });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguageExtension(),
        wikiLinkLivePreview(() => resolveWikiLink),
        inlineLivePreviewRegion(createInlineLivePreviewParticipants({ resolveWikiLink: () => resolveWikiLink, resolveTag: () => resolveTag, resolveDate: () => resolveDate })),
        wikiLinkMouseHandlers(() => resolveWikiLink),
        tagMouseHandlers(() => resolveTag),
        dateMouseHandlers(() => resolveDate),
        linkMouseHandlers(),
        semanticCompletion(() => undefined),
        EditorState.readOnly.of(extra.readOnly ?? false),
      ],
    }),
    parent,
  });
}

function press(view: EditorView, target: Element, pos: number, init: MouseEventInit = {}): MouseEvent {
  view.posAtCoords = () => pos;
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(event);
  return event;
}

async function settle(ms = 150) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  Object.values(activations).forEach((fn) => fn.mockClear());
  vi.mocked(openExternalUrl).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('⌘-click edits a reference instead of activating it', () => {
  it('a wiki link: raw [[…]] is revealed and the caret is before the closing ]]', () => {
    const doc = 'Text [[My note]] after';
    const view = mount(doc);
    const from = doc.indexOf('[[');
    const to = from + '[[My note]]'.length;

    const widget = view.dom.querySelector('[data-wikilink-status]')!;
    const event = press(view, widget, from + 4, { metaKey: true });

    expect(activations.wiki).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.main).toMatchObject({ anchor: to - 2, head: to - 2 });
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
  });

  it('a wiki link with an alias puts the caret at the end of the alias', () => {
    const doc = 'Go [[My note|the alias]]';
    const view = mount(doc);
    press(view, view.dom.querySelector('[data-wikilink-status]')!, 6, { metaKey: true });
    expect(view.state.selection.main.head).toBe(doc.length - 2);
  });

  it.each(['@2026-10-23', '@2026-10-23T16:00'])('a date reference %s: raw source is revealed and the caret is at its end', (date) => {
    const doc = `Due ${date} ok`;
    const view = mount(doc);
    const from = doc.indexOf('@');

    const widget = view.dom.querySelector('.tok-date')!;
    expect(widget).not.toBeNull();
    const event = press(view, widget, from + 3, { metaKey: true });

    expect(activations.date).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(from + date.length);
    expect(view.dom.querySelector('.tok-date')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a tag: raw #tag is revealed and the caret is at its end', () => {
    const doc = 'Filed under #project today';
    const view = mount(doc);
    const from = doc.indexOf('#');

    const widget = view.dom.querySelector('.tok-tag')!;
    expect(widget).not.toBeNull();
    const event = press(view, widget, from + 3, { metaKey: true });

    expect(activations.tag).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(from + '#project'.length);
    expect(view.dom.querySelector('.tok-tag')).toBeNull();
  });

  it('the revealed date is edited with the existing completion: replace it and @to offers Today', async () => {
    const doc = 'Go @2026-10-23';
    const view = mount(doc);
    press(view, view.dom.querySelector('.tok-date')!, 6, { metaKey: true });

    view.dispatch({ changes: { from: 4, to: doc.length, insert: '' }, userEvent: 'delete.selection' });
    for (const char of 'to') {
      const head = view.state.selection.main.head;
      view.dispatch({ changes: { from: head, insert: char }, selection: { anchor: head + 1 }, userEvent: 'input.type' });
      await settle();
    }
    expect(completionStatus(view.state)).toBe('active');
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual(['Today']);
  });
});

describe('a plain click is unchanged', () => {
  it('activates a wiki link, a date and a tag, and leaves the selection alone', () => {
    const doc = 'Go [[Note]] @2026-10-23 #tag';
    const view = mount(doc);
    const before = view.state.selection.main.head;

    press(view, view.dom.querySelector('[data-wikilink-status]')!, 6);
    press(view, view.dom.querySelector('.tok-date')!, doc.indexOf('@') + 3);
    press(view, view.dom.querySelector('.tok-tag')!, doc.indexOf('#') + 2);

    expect(activations.wiki).toHaveBeenCalledTimes(1);
    expect(activations.date).toHaveBeenCalledTimes(1);
    expect(activations.tag).toHaveBeenCalledTimes(1);
    expect(view.state.selection.main.head).toBe(before);
  });

  it('other modifiers (Alt, Shift, Ctrl on a Mac) still activate', () => {
    const view = mount('Go @2026-10-23');
    const widget = view.dom.querySelector('.tok-date')!;
    press(view, widget, 6, { altKey: true });
    press(view, widget, 6, { shiftKey: true });
    press(view, widget, 6, { ctrlKey: true });
    expect(activations.date).toHaveBeenCalledTimes(3);
  });

  it('a read-only view has nothing to edit, so ⌘-click still activates', () => {
    const view = mount('Go @2026-10-23', { readOnly: true });
    press(view, view.dom.querySelector('.tok-date')!, 6, { metaKey: true });
    expect(activations.date).toHaveBeenCalledTimes(1);
  });
});

describe('⌘-click elsewhere is left to CodeMirror', () => {
  it('on plain text the handlers decline: nothing is activated or revealed', () => {
    const view = mount('plain text here @2026-10-23');
    press(view, view.contentDOM, 3, { metaKey: true });
    expect(activations.date).not.toHaveBeenCalled();
    expect(view.dom.querySelector('.tok-date')).not.toBeNull();
  });

  it('no extension overrides CM6’s own rule for a click that adds a cursor', () => {
    const view = mount('text');
    expect(view.state.facet(EditorView.clickAddsSelectionRange)).toEqual([]);
  });

  it('an already-revealed reference is ordinary text: ⌘-click on it is neither activated nor re-revealed', () => {
    const view = mount('Go @2026-10-23');
    view.dispatch({ selection: { anchor: 8 } });
    expect(view.dom.querySelector('.tok-date')).toBeNull();
    press(view, view.contentDOM, 10, { metaKey: true });
    expect(activations.date).not.toHaveBeenCalled();
  });

  it('off macOS the modifier is Ctrl, and ⌘ (Meta) is not it', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const view = mount('Go @2026-10-23');
    const widget = view.dom.querySelector('.tok-date')!;
    press(view, widget, 6, { metaKey: true });
    expect(activations.date).toHaveBeenCalledTimes(1);
    expect(view.state.selection.main.head).toBe(0);
    press(view, widget, 6, { ctrlKey: true });
    expect(activations.date).toHaveBeenCalledTimes(1);
    expect(view.state.selection.main.head).toBe('Go @2026-10-23'.length);
  });
});

describe('links, URLs and embeds are untouched', () => {
  it('⌘-click on a Markdown link still opens its URL, with no caret moved', () => {
    const doc = 'before [Google](https://google.com) after';
    const view = mount(doc);
    const event = press(view, view.contentDOM, doc.indexOf('Google') + 2, { metaKey: true });
    expect(openExternalUrl).toHaveBeenCalledWith('https://google.com');
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe(0);
  });

  it('a plain click on it does the same', () => {
    const doc = 'before [Google](https://google.com) after';
    const view = mount(doc);
    press(view, view.contentDOM, doc.indexOf('Google') + 2);
    expect(openExternalUrl).toHaveBeenCalledWith('https://google.com');
  });
});
