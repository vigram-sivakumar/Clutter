import { selectedCompletionIndex, setSelectedCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionSection } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import './completionRow.css';

/**
 * What every completion popup row shows, whatever kind of suggestion it is. A kind only maps its
 * own data to this shape; it never builds row DOM or styles of its own — so the rows of `[[`,
 * `![[`, `#`, `@` and `![[Page#` all look, space and select the same way as `PickerList`'s rows.
 */
export interface CompletionRowSpec {
  /** Raw `<svg>` markup, drawn in `currentColor`. `Completion.render` is synchronous DOM, outside React. */
  readonly iconSvg?: string;
  /** A note's own emoji, shown in place of the icon. */
  readonly emoji?: string | null;
  /**
   * A loadable image URL shown in place of the icon, filling the row's height (an asset row, as in
   * PickerList). May be a promise (a PDF's first page takes a moment to render): the row shows its
   * icon until the image arrives, and keeps it if there is none (`null`).
   */
  readonly thumbnail?: string | Promise<string | null>;
  readonly title: string;
  /** Secondary text right after the title (a page's matched alias). */
  readonly titleSuffix?: string;
  /** The row's location (`Projects / Work`), on its own line below the title. */
  readonly path?: string | null;
  /** Muted text pinned to the row's right edge. */
  readonly trailing?: string;
  /**
   * A short, single-line row (a tag's name): a popup made only of these is the small dialog width
   * (`completionPopupTheme`) instead of the note picker's.
   */
  readonly compact?: boolean;
  /** A secondary row (the Show more / Show less toggle): tertiary foreground for its text and icon. */
  readonly muted?: boolean;
}

/**
 * The shared popup row: plain DOM carrying `PickerList`'s row layout (`.picker-list__item` +
 * `Entry`) — see `completionRow.css`. Not the React `Entry`: CM6 owns this popup's click, keyboard
 * and selection entirely, and a second owner of those would conflict.
 *
 * Hover moves CM6's own selection (the same `activeId` rule `PickerList` follows) instead of
 * adding a CSS-only highlight that could disagree with the keyboard's. The `<li>` id is
 * `<tooltipId>-<index>`, the convention CM6's own click handler parses.
 */
export function buildCompletionRow(spec: CompletionRowSpec, view: EditorView): HTMLElement {
  const row = document.createElement('div');
  row.className = 'completion-row';
  if (spec.compact) {
    row.classList.add('completion-row--compact');
  }
  if (spec.muted) {
    row.classList.add('completion-row--muted');
  }
  row.addEventListener('mouseenter', () => {
    const index = Number(row.parentElement?.id.split('-').pop());
    if (Number.isNaN(index) || selectedCompletionIndex(view.state) === index) {
      return;
    }
    view.dispatch({ effects: setSelectedCompletion(index) });
  });

  if (spec.thumbnail) {
    row.classList.add('completion-row--asset');
    const box = document.createElement('span');
    box.className = 'completion-row__thumbnail';
    const showIcon = () => {
      if (spec.iconSvg) {
        box.classList.add('completion-row__thumbnail--icon');
        box.innerHTML = spec.iconSvg;
      }
    };
    const showImage = (src: string) => {
      const image = document.createElement('img');
      image.src = src;
      image.alt = '';
      image.draggable = false;
      box.replaceChildren(image);
    };
    if (typeof spec.thumbnail === 'string') {
      showImage(spec.thumbnail);
    } else {
      // Until it resolves the box is an empty, tinted square the size of the finished image.
      void spec.thumbnail.then((src) => (src ? showImage(src) : showIcon()), showIcon);
    }
    row.appendChild(box);
  } else if (spec.emoji) {
    const emoji = document.createElement('span');
    emoji.className = 'completion-row__icon completion-row__emoji';
    emoji.textContent = spec.emoji;
    row.appendChild(emoji);
  } else if (spec.iconSvg) {
    const icon = document.createElement('span');
    icon.className = 'completion-row__icon';
    icon.innerHTML = spec.iconSvg;
    row.appendChild(icon);
  }

  const content = document.createElement('div');
  content.className = 'completion-row__content';

  const titleRow = document.createElement('div');
  titleRow.className = 'completion-row__title-row';
  const title = document.createElement('span');
  title.className = 'completion-row__title';
  title.textContent = spec.title;
  titleRow.appendChild(title);
  if (spec.titleSuffix) {
    const suffix = document.createElement('span');
    suffix.className = 'completion-row__suffix';
    suffix.textContent = spec.titleSuffix;
    titleRow.appendChild(suffix);
  }
  content.appendChild(titleRow);

  // Like PickerList: the trailing text and a path line are alternatives, never both.
  if (spec.path && !spec.trailing) {
    const path = document.createElement('span');
    path.className = 'completion-row__path';
    path.textContent = spec.path.split('/').join(' / ');
    content.appendChild(path);
  }
  row.appendChild(content);

  if (spec.trailing) {
    const trailing = document.createElement('span');
    trailing.className = 'completion-row__trailing';
    trailing.textContent = spec.trailing;
    row.appendChild(trailing);
  }

  return row;
}

/**
 * How a popup lays its list out, whichever trigger it is. Generic: a trigger picks its own values.
 */
export interface CompletionListLayout {
  /** List the rows under their titled sections. Off: one continuous list, no section headers or caps. */
  readonly grouped: boolean;
  /** Show each row's location line under its title. Off: the icon and title alone. */
  readonly showPath: boolean;
}

/** The layout every popup had before it became configurable: sectioned, with paths. */
export const GROUPED_LAYOUT: CompletionListLayout = { grouped: true, showPath: true };

/**
 * How a trigger's popup is configured — the one shape `[[` and `![[` (and any later consumer) both take. The
 * defaults are the plain experience: one continuous list, paths only once something is typed.
 */
export interface CompletionListConfig {
  /** List the rows under their titled sections. Default: off — one continuous list. */
  readonly grouped?: boolean;
  /** Ungrouped, but split a result holding both notes/folders and files into two groups. Default: on. */
  readonly splitMixed?: boolean;
  /** Show the location line when the query is empty too. Default: off — a bare trigger is just icons and titles. */
  readonly pathsWhenEmpty?: boolean;
}

/** The layout one result is drawn with: the config, and whether anything has been typed. */
export function layoutFor(query: string, config: CompletionListConfig = {}): CompletionListLayout {
  return { grouped: config.grouped ?? false, showPath: query.trim() !== '' || (config.pathsWhenEmpty ?? false) };
}

/** The cap key shared by every row of an ungrouped list. */
const UNGROUPED_LIMIT_KEY = 'list';

/** Applies `layout` to a row and its section: no section when ungrouped, no path when hidden. */
export function applyListLayout<T extends { readonly row: CompletionRowSpec; readonly section?: CompletionSection }>(
  entry: T,
  layout: CompletionListLayout
): Pick<T, 'row'> & { readonly section?: CompletionSection; readonly limitKey?: string } {
  const { section, row } = entry;

  return {
    row: layout.showPath ? row : { ...row, path: null },
    ...(layout.grouped ? section && { section } : { limitKey: UNGROUPED_LIMIT_KEY }),
  };
}

/**
 * A completion that carries its popup row. Every kind's source builds one of these (mapping its
 * own suggestion to a `CompletionRowSpec`); the single `renderCompletionRow` draws them all.
 */
export interface RowCompletion extends Completion {
  readonly row: CompletionRowSpec;
  /** The titled section the row is listed under, when its popup is sectioned. */
  readonly section?: CompletionSection;
  /**
   * Caps and "Show N more" apply per section; an ungrouped list has none, so its rows share this key and
   * are capped as one list (`completionSectionLimit.ts`). Never shown.
   */
  readonly limitKey?: string;
}

/**
 * `autocompletion()`'s `addToOptions[].render` hook — the only one. CM6 has no per-completion
 * render field in this version, only this config-level callback, run for every visible option;
 * a completion with no `row` (none in this editor) is left to CM6's own label.
 */
export function renderCompletionRow(completion: Completion, _state: EditorState, view: EditorView): HTMLElement | null {
  return 'row' in completion ? buildCompletionRow((completion as RowCompletion).row, view) : null;
}

/**
 * A section title row (`MenuGroupTitle`'s look) for `Completion.section.header`, with a divider
 * above it. The divider is hidden for the first section by CSS (`completionRow.css`) — CM6 gives
 * a header no way to know whether it leads the list.
 */
export function buildCompletionSectionHeader(name: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'completion-section';
  const divider = document.createElement('div');
  divider.className = 'completion-section__divider';
  divider.setAttribute('role', 'separator');
  const title = document.createElement('div');
  title.className = 'completion-section__title';
  title.textContent = name;
  header.append(divider, title);
  return header;
}
