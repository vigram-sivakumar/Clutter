// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from './markdownLanguage';
import { tagDecorations } from './tag/tagDecorations';
import { tagKeymap } from './tag/tagKeymap';
import { handleTagClick } from './tag/tagMouseHandlers';
import type { ResolveTag } from './tag/tagResolution';
import { wikiLinkDecorations } from './wikilink/wikiLinkDecorations';
import { wikiLinkKeymap } from './wikilink/wikiLinkKeymap';
import { handleWikiLinkClick } from './wikilink/wikiLinkMouseHandlers';
import type { ResolveWikiLink } from './wikilink/wikiLinkResolution';

/**
 * Explicit cross-kind proof: Tag and WikiLink are two independent
 * consumers of the same generic `semanticToken/*` mechanism
 * (docs/editor-architecture-decisions.md §11's "one shared interaction
 * mechanism for every inline semantic construct"). Nothing in either
 * adapter references the other, but both bind the same keys
 * (`ArrowLeft`/`ArrowRight`) via `tokenKeymap`, registered in the same
 * order the real `MarkdownEditor.tsx` extension array uses (WikiLink
 * before Tag) — this file mounts both together and verifies neither
 * construct's keyboard or mouse handling ever fires for the other's node,
 * confirming the fallthrough-chain design generalizes to a second kind
 * rather than merely assuming it does.
 *
 * Document throughout: 'x #project [[Projects/Page]] y'
 *   - "x " = [0, 2)
 *   - Tag "#project" = [2, 10)
 *   - " " = [10, 11)
 *   - WikiLink "[[Projects/Page]]" = [11, 28)
 *   - " y" = [28, 30)
 */
const DOC = 'x #project [[Projects/Page]] y';
const TAG_FROM = 2;
const TAG_TO = 10;
const WIKILINK_FROM = 11;
const WIKILINK_TO = 28;

function mountView(
  cursorPos: number,
  tagResolver: ResolveTag,
  wikiLinkResolver: ResolveWikiLink
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: DOC,
    selection: { anchor: cursorPos },
    extensions: [
      markdownLanguageExtension(),
      wikiLinkDecorations(() => wikiLinkResolver),
      wikiLinkKeymap(() => wikiLinkResolver),
      tagDecorations(() => tagResolver),
      tagKeymap(() => tagResolver),
      keymap.of([]), // matches the trailing defaultKeymap slot MarkdownEditor.tsx always has, without pulling in the whole default set
    ],
  });
  return new EditorView({ state, parent });
}

function pressKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
}

describe('Tag + WikiLink — cross-kind keyboard interaction', () => {
  it('ArrowRight one position before the Tag hops into the Tag, never touches the WikiLink', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: vi.fn(),
    });
    const view = mountView(TAG_FROM - 1, tagResolver, wikiLinkResolver);

    pressKey(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(TAG_FROM);
    view.destroy();
  });

  it('ArrowRight one position before the WikiLink hops into the WikiLink, never touches the Tag', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: vi.fn(),
    });
    const view = mountView(WIKILINK_FROM - 1, tagResolver, wikiLinkResolver);

    pressKey(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(WIKILINK_FROM);
    view.destroy();
  });

  it('ArrowLeft one position after the Tag hops back into the Tag, never touches the WikiLink', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: vi.fn(),
    });
    const view = mountView(TAG_TO + 1, tagResolver, wikiLinkResolver);

    pressKey(view, 'ArrowLeft');

    expect(view.state.selection.main.head).toBe(TAG_TO);
    view.destroy();
  });

  it('ArrowLeft one position after the WikiLink hops back into the WikiLink, never touches the Tag', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: vi.fn(),
    });
    const view = mountView(WIKILINK_TO + 1, tagResolver, wikiLinkResolver);

    pressKey(view, 'ArrowLeft');

    expect(view.state.selection.main.head).toBe(WIKILINK_TO);
    view.destroy();
  });
});

describe('Tag + WikiLink — cross-kind mouse interaction', () => {
  it('clicking the Tag activates only the Tag resolver, never the WikiLink resolver', () => {
    const tagActivate = vi.fn();
    const wikiLinkActivate = vi.fn();
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: tagActivate });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: wikiLinkActivate,
    });
    const view = mountView(0, tagResolver, wikiLinkResolver);

    const handled = handleTagClick(view, TAG_FROM + 2, false, () => tagResolver);

    expect(handled).toBe(true);
    expect(tagActivate).toHaveBeenCalledTimes(1);
    expect(wikiLinkActivate).not.toHaveBeenCalled();
    view.destroy();
  });

  it('clicking the WikiLink activates only the WikiLink resolver, never the Tag resolver', () => {
    const tagActivate = vi.fn();
    const wikiLinkActivate = vi.fn();
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: tagActivate });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: wikiLinkActivate,
    });
    const view = mountView(0, tagResolver, wikiLinkResolver);

    const handled = handleWikiLinkClick(view, WIKILINK_FROM + 2, false, () => wikiLinkResolver);

    expect(handled).toBe(true);
    expect(wikiLinkActivate).toHaveBeenCalledTimes(1);
    expect(tagActivate).not.toHaveBeenCalled();
    view.destroy();
  });

  it('a click on the Tag is never handled by handleWikiLinkClick, and vice versa', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'X',
      activate: vi.fn(),
    });
    const view = mountView(0, tagResolver, wikiLinkResolver);

    expect(handleWikiLinkClick(view, TAG_FROM + 2, false, () => wikiLinkResolver)).toBe(false);
    expect(handleTagClick(view, WIKILINK_FROM + 2, false, () => tagResolver)).toBe(false);
    view.destroy();
  });
});

describe('Tag + WikiLink — adjacent with no separating whitespace', () => {
  const ADJACENT_DOC = '#tag[[Page]]';
  // Tag "#tag" = [0, 4); WikiLink "[[Page]]" = [4, 12).

  it('both a Tag and a WikiLink render as distinct at-rest widgets with no separator', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'tag', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'Page',
      activate: vi.fn(),
    });
    // Leading text so the default caret position (0) sits outside both
    // nodes — otherwise position 0 would coincide with the Tag's own
    // start boundary and count as already-engaged (docs/editor-architecture-
    // decisions.md's inclusive-boundary engagement rule).
    const p = document.createElement('div');
    document.body.appendChild(p);
    const s = EditorState.create({
      doc: `x ${ADJACENT_DOC}`,
      extensions: [
        markdownLanguageExtension(),
        wikiLinkDecorations(() => wikiLinkResolver),
        tagDecorations(() => tagResolver),
      ],
    });
    const view = new EditorView({ state: s, parent: p });

    expect(view.dom.querySelector('[data-tag-status="resolved"]')?.textContent).toBe('#tag');
    expect(view.dom.querySelector('[data-wikilink-status="resolved"]')?.textContent).toBe('Page');
    view.destroy();
  });

  it('ArrowRight approaching the Tag from before it engages the Tag, not the adjacent WikiLink', () => {
    const tagResolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const wikiLinkResolver: ResolveWikiLink = () => ({
      status: 'resolved',
      displayLabel: 'Page',
      activate: vi.fn(),
    });
    const p = document.createElement('div');
    document.body.appendChild(p);
    const s = EditorState.create({
      doc: `x ${ADJACENT_DOC}`, // Tag now at [2, 6)
      selection: { anchor: 1 },
      extensions: [
        markdownLanguageExtension(),
        wikiLinkDecorations(() => wikiLinkResolver),
        wikiLinkKeymap(() => wikiLinkResolver),
        tagDecorations(() => tagResolver),
        tagKeymap(() => tagResolver),
      ],
    });
    const view = new EditorView({ state: s, parent: p });

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );

    expect(view.state.selection.main.head).toBe(2);
    view.destroy();
  });
});
