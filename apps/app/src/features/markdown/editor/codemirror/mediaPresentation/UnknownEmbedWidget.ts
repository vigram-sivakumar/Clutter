import { markBlockRange } from '../blockRangeSelection';
import { EditorSelection } from '@codemirror/state';
import { WidgetType, type EditorView } from '@codemirror/view';

import { setImageUiState, type ImageUiState } from '../image/imageUiState';
import { computeEmbedRemovalRange } from './embedRemovalRange';
import { renderInvalidEmbedCard } from './invalidEmbedCard';
import { selectEmbedObject } from '../embed/embedObjectSelection';

// Hand-copied from `shared/icon/svg/question.svg` — same reason
// `ImageWidget.ts`'s `IMAGE_ICON`/`PdfEmbedWidget.ts`'s
// `BROKEN_PDF_ICON`/`NoteEmbedWidget.ts`'s `NOTE_ICON` are
// hand-copied rather than imported: the real icon system
// (`shared/icon/iconRegistry.ts`) emits React components, which cannot
// mount inside a `WidgetType`'s plain DOM. A question mark, not a
// crossed-out/broken glyph — this state isn't "we tried to load this and
// failed," it's "we don't know what this is at all."
const UNKNOWN_FILE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/><path d="M6.5 6.25C6.5 5.42157 7.17157 4.75 8 4.75C8.82843 4.75 9.5 5.42157 9.5 6.25C9.5 6.81448 9.18841 7.30618 8.72855 7.5625C8.28249 7.81114 8 8.22273 8 8.75V9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * The generic "unrecognized embed target" card — `![[target]]` names
 * something whose own file extension isn't a recognized image or PDF
 * type, and (having an extension at all) isn't presumed to name a page
 * either. See `embedTargetKind.ts`'s own doc comment for the full
 * classification rule and the misclassification bug this exists to fix
 * (`![[statue.pngs]]` used to silently render as "Note not found").
 *
 * Always broken, by construction — there is no "working" state for a
 * target this editor has no renderer for at all, so unlike
 * `ImageWidget`/`PdfEmbedWidget`/`NoteEmbedWidget` this widget has no
 * `renderWorking()` and never carries any type-specific container class,
 * only the two genuinely generic ones (`cm-media-block`, and
 * `.cm-invalid-embed` added by the shared `renderInvalidEmbedCard`
 * component itself — see that module's own doc comment for why). Reuses
 * that exact same shared component every other broken-embed card uses,
 * configured with a distinct icon/title so this state reads as "unknown
 * file type," never confusable with a genuine image/PDF load failure or a
 * missing note.
 */
export class UnknownEmbedWidget extends WidgetType {
  constructor(
    readonly path: string,
    readonly ui: ImageUiState,
    readonly pos: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: UnknownEmbedWidget): boolean {
    return (
      this.path === other.path &&
      this.pos === other.pos &&
      this.to === other.to &&
      this.ui.revealed === other.ui.revealed
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    // `cm-media-block` — see `ImageWidget.ts`'s own `toDOM` doc comment
    // and `mediaPresentation/embedLayout.css`'s own doc comment for the
    // shared global media/embed block-flow contract this class enforces.
    // The only class added here — `renderInvalidEmbedCard` below adds its
    // own `.cm-invalid-embed`; nothing else, on purpose.
    container.classList.add('cm-media-block');
    markBlockRange(container, view, this.pos, this.to);
    if (!this.ui.revealed) container.dataset.embedFrom = String(this.pos);

    renderInvalidEmbedCard(container, {
      icon: UNKNOWN_FILE_ICON,
      title: 'Unsupported file',
      source: this.path,
      removeLabel: 'Remove embed',
      onRemove: () => {
        const { from, to } = computeEmbedRemovalRange(view.state, this.pos);
        view.dispatch({ changes: { from, to, insert: '' } });
      },
      editLabel: this.ui.revealed ? 'Hide source' : 'Edit source',
      onEdit: () => {
        const revealing = !this.ui.revealed;
        view.dispatch({
          effects: setImageUiState.of({ pos: this.pos, to: this.to, state: { ...this.ui, revealed: revealing } }),
          selection: revealing ? EditorSelection.cursor(this.to) : undefined,
          scrollIntoView: revealing,
        });
      },
    });

    container.addEventListener('mousedown', (event) => {
      if (event.target instanceof Element && event.target.closest('button') === null) {
        event.preventDefault();
      }
    });
    container.addEventListener('click', (event) => {
      if (!(event.target instanceof Element) || event.defaultPrevented || event.target.closest('button')) return;
      event.preventDefault();
      event.stopPropagation();
      selectEmbedObject(view, this.pos, this.to);
    });

    return container;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
