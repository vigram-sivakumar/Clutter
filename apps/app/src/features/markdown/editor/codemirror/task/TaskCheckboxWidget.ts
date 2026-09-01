import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of a `TaskMarker` — the visual checkbox
 * matching the project's `Checkbox` component (`apps/app/src/components/checkbox/Checkbox.tsx`),
 * standing in for the raw `[ ]`/`[x]`/`[X]` source. Same shape as
 * `TagWidget`/`WikiLinkWidget`'s own at-rest widgets. `checked` is read
 * directly off the real `TaskMarker` text by the decoration that constructs
 * this widget (`isTaskMarkerChecked`, `taskEngagement.ts`) — this class
 * carries no state of its own and never diverges from the document.
 *
 * Unlike Tag/Date/WikiLink, there is no "engaged" (revealed-raw-text)
 * state for this construct at all — the checkbox always renders, regardless
 * of caret position (explicit product decision, task visual-rendering slice:
 * "do not invent a reveal Markdown mode"). So this widget is the *only*
 * rendered form `taskCheckboxDecoration.ts` ever produces for a `TaskMarker`,
 * not one branch of a reveal/conceal pair.
 *
 * **SVG Reuse**: Since CodeMirror widgets must create DOM directly (not React),
 * the SVG and CSS design tokens are reused from the project's `Checkbox`
 * component to ensure the visual checkbox in the Markdown editor looks and
 * behaves exactly like the rest of the application's checkboxes:
 * - SVG icons: `checkbox-checked.svg` and `checkbox-unchecked.svg`
 * - CSS styling: same variables and layout as `Checkbox.css`
 * - Dimensions and theme variables: `--height-xs`, `--checkbox-accent`, etc.
 *
 * `role="checkbox"`/`aria-checked` (not `role="button"`, unlike `TagWidget`)
 * — this construct's own accessibility semantics are a real binary toggle
 * state, not a filter/open action.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked;
  }

  override toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'checkbox');
    button.setAttribute('aria-checked', String(this.checked));
    button.classList.add('cm-list-marker', 'cm-task-checkbox');

    if (this.checked) {
      // Checked state: filled square with checkmark
      button.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.4 0H10.6C13.582 0 16 2.982 16 5.4V10.6C16 13.018 13.582 16 10.6 16H5.4C2.982 16 0 13.018 0 10.6V5.4C0 2.982 2.982 0 5.4 0Z" fill="currentColor"/><path d="M5 8.42857L6.8 11L11 5" stroke="var(--icon-on-accent, #FFF)" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } else {
      // Unchecked state: empty square outline
      button.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 0.6H10C12.982 0.6 15.4 3.582 15.4 6V10C15.4 12.418 12.982 15.4 10 15.4H6C3.582 15.4 0.6 12.418 0.6 10V6C0.6 3.582 3.582 0.6 6 0.6Z" stroke="currentColor"/></svg>';
    }

    return button;
  }

  /**
   * Same fix `TagWidget.ignoreEvent`/`WikiLinkWidget.ignoreEvent` document
   * on themselves: a `WidgetType`'s default is to ignore every event,
   * which would silently discard `mousedown` before
   * `tokenMouseHandlers.ts`'s `EditorView.domEventHandlers` listener ever
   * saw it. Only `mousedown` needs to pass through — that's the only
   * event type the checkbox's own click-to-toggle mechanism
   * (`taskCheckboxMouseHandlers.ts`) listens for.
   */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}
