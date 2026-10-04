import { selectedCompletionIndex, setSelectedCompletion } from '@codemirror/autocomplete';
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
  row.addEventListener('mouseenter', () => {
    const index = Number(row.parentElement?.id.split('-').pop());
    if (Number.isNaN(index) || selectedCompletionIndex(view.state) === index) {
      return;
    }
    view.dispatch({ effects: setSelectedCompletion(index) });
  });

  if (spec.thumbnail) {
    row.classList.add('completion-row--asset');
    const thumbnail = document.createElement('span');
    thumbnail.className = 'completion-row__thumbnail';
    const showIcon = () => {
      if (spec.iconSvg) {
        thumbnail.classList.add('completion-row__thumbnail--icon');
        thumbnail.innerHTML = spec.iconSvg;
      }
    };
    const showImage = (src: string) => {
      const image = document.createElement('img');
      image.src = src;
      image.alt = '';
      image.draggable = false;
      thumbnail.replaceChildren(image);
    };
    if (typeof spec.thumbnail === 'string') {
      showImage(spec.thumbnail);
    } else {
      // Until it resolves the box is an empty, tinted square the size of the finished image.
      void spec.thumbnail.then((src) => (src ? showImage(src) : showIcon()), showIcon);
    }
    row.appendChild(thumbnail);
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
 * A section title row (`MenuGroupTitle`'s look) for `Completion.section.header`. Every section
 * after the first is set off by a divider above its title, as in `PickerList`.
 */
export function buildCompletionSectionHeader(name: string, divided = false): HTMLElement {
  const header = document.createElement('div');
  header.className = 'completion-section';
  if (divided) {
    const divider = document.createElement('div');
    divider.className = 'completion-section__divider';
    divider.setAttribute('role', 'separator');
    header.appendChild(divider);
  }
  const title = document.createElement('div');
  title.className = 'completion-section__title';
  title.textContent = name;
  header.appendChild(title);
  return header;
}
