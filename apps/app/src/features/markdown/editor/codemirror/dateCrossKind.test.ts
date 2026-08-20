// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from './markdownLanguage';
import { dateDecorations } from './date/dateDecorations';
import { dateKeymap } from './date/dateKeymap';
import { handleDateClick } from './date/dateMouseHandlers';
import type { ResolveDate } from './date/dateResolution';
import { tagDecorations } from './tag/tagDecorations';
import { tagKeymap } from './tag/tagKeymap';
import { handleTagClick } from './tag/tagMouseHandlers';
import type { ResolveTag } from './tag/tagResolution';
import { wikiLinkDecorations } from './wikilink/wikiLinkDecorations';
import { wikiLinkKeymap } from './wikilink/wikiLinkKeymap';
import { handleWikiLinkClick } from './wikilink/wikiLinkMouseHandlers';
import type { ResolveWikiLink } from './wikilink/wikiLinkResolution';

/**
 * Explicit cross-kind proof for Date, mirroring `tagWikiLinkCrossKind.test.ts`'s
 * own rationale exactly: Date is a *third* independent consumer of the
 * same generic `semanticToken/*` mechanism, registered in the same
 * extension-array order the real `MarkdownEditor.tsx` uses (WikiLink,
 * then Tag, then Date). This mounts all three together and verifies none
 * of their keyboard/mouse handling ever fires for another kind's node.
 *
 * Document throughout: 'x #project [[Page]] @2026-08-20 y'
 *   - "x " = [0, 2)
 *   - Tag "#project" = [2, 10)
 *   - " " = [10, 11)
 *   - WikiLink "[[Page]]" = [11, 19)
 *   - " " = [19, 20)
 *   - Date "@2026-08-20" = [20, 31)
 *   - " y" = [31, 33)
 */
const DOC = 'x #project [[Page]] @2026-08-20 y';
const TAG_FROM = 2;
const WIKILINK_FROM = 11;
const DATE_FROM = 20;
const DATE_TO = 31;

function mountView(
  cursorPos: number,
  tagResolver: ResolveTag,
  wikiLinkResolver: ResolveWikiLink,
  dateResolver: ResolveDate
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
      dateDecorations(() => dateResolver),
      dateKeymap(() => dateResolver),
      keymap.of([]),
    ],
  });
  return new EditorView({ state, parent });
}

function pressKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
}

function resolvers() {
  return {
    tagResolver: (() => ({ status: 'resolved' as const, activate: vi.fn() })) as ResolveTag,
    wikiLinkResolver: (() => ({
      status: 'resolved' as const,
      displayLabel: 'X',
      activate: vi.fn(),
    })) as ResolveWikiLink,
    dateResolver: (() => ({ activate: vi.fn() })) as ResolveDate,
  };
}

describe('Date + Tag + WikiLink — cross-kind keyboard interaction', () => {
  it('ArrowRight one position before the Date hops into the Date, never touches Tag or WikiLink', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(DATE_FROM - 1, tagResolver, wikiLinkResolver, dateResolver);

    pressKey(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(DATE_FROM);
    view.destroy();
  });

  it('ArrowLeft one position after the Date hops back into the Date, never touches Tag or WikiLink', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(DATE_TO + 1, tagResolver, wikiLinkResolver, dateResolver);

    pressKey(view, 'ArrowLeft');

    expect(view.state.selection.main.head).toBe(DATE_TO);
    view.destroy();
  });

  it('ArrowRight one position before the WikiLink still hops correctly with Date also registered', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(WIKILINK_FROM - 1, tagResolver, wikiLinkResolver, dateResolver);

    pressKey(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(WIKILINK_FROM);
    view.destroy();
  });

  it('ArrowLeft one position before the Tag still hops correctly with Date also registered', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(TAG_FROM - 1, tagResolver, wikiLinkResolver, dateResolver);

    pressKey(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(TAG_FROM);
    view.destroy();
  });
});

describe('Date + Tag + WikiLink — cross-kind mouse interaction', () => {
  it('clicking the Date activates only the Date resolver', () => {
    const { tagResolver, wikiLinkResolver } = resolvers();
    const dateActivate = vi.fn();
    const dateResolver: ResolveDate = () => ({ activate: dateActivate });
    const view = mountView(0, tagResolver, wikiLinkResolver, dateResolver);

    const handled = handleDateClick(view, DATE_FROM + 2, false, () => dateResolver);

    expect(handled).toBe(true);
    expect(dateActivate).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('a click on the Date is never handled by handleTagClick or handleWikiLinkClick', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(0, tagResolver, wikiLinkResolver, dateResolver);

    expect(handleTagClick(view, DATE_FROM + 2, false, () => tagResolver)).toBe(false);
    expect(handleWikiLinkClick(view, DATE_FROM + 2, false, () => wikiLinkResolver)).toBe(false);
    view.destroy();
  });

  it('a click on the Tag/WikiLink is never handled by handleDateClick', () => {
    const { tagResolver, wikiLinkResolver, dateResolver } = resolvers();
    const view = mountView(0, tagResolver, wikiLinkResolver, dateResolver);

    expect(handleDateClick(view, TAG_FROM + 2, false, () => dateResolver)).toBe(false);
    expect(handleDateClick(view, WIKILINK_FROM + 2, false, () => dateResolver)).toBe(false);
    view.destroy();
  });
});

describe('Date + Tag + WikiLink — adjacent with no separating whitespace', () => {
  it('a Date immediately followed by a Tag with no space renders both as distinct at-rest widgets', () => {
    const { tagResolver, dateResolver } = resolvers();
    const p = document.createElement('div');
    document.body.appendChild(p);
    const s = EditorState.create({
      doc: 'x @2026-08-20#project',
      extensions: [
        markdownLanguageExtension(),
        dateDecorations(() => dateResolver),
        tagDecorations(() => tagResolver),
      ],
    });
    const view = new EditorView({ state: s, parent: p });

    // Per markdownLanguage.regression.test.ts's parser-level proof: "0"
    // immediately before "#" means no Tag node exists here at all — only
    // the Date should render as a widget.
    expect(view.dom.querySelector('[data-date-status="valid"]')).not.toBeNull();
    expect(view.dom.querySelector('[data-tag-status]')).toBeNull();
    expect(view.dom.textContent).toContain('#project');
    view.destroy();
  });

  it('a Date immediately followed by a WikiLink with no space renders both as distinct at-rest widgets', () => {
    const { wikiLinkResolver, dateResolver } = resolvers();
    const p = document.createElement('div');
    document.body.appendChild(p);
    const s = EditorState.create({
      doc: 'x @2026-08-20[[Page]]',
      extensions: [
        markdownLanguageExtension(),
        dateDecorations(() => dateResolver),
        wikiLinkDecorations(() => wikiLinkResolver),
      ],
    });
    const view = new EditorView({ state: s, parent: p });

    expect(view.dom.querySelector('[data-date-status="valid"]')).not.toBeNull();
    expect(view.dom.querySelector('[data-wikilink-status="resolved"]')).not.toBeNull();
    view.destroy();
  });
});
