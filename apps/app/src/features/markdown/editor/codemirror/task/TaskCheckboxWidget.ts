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
      // Checked state: filled circle with checkmark — matches
      // shared/icon/svg/checkbox-checked.svg exactly (that file's own
      // square/rounded-rect path is commented out there, superseded by
      // this circle; this widget's inline SVG must track that same
      // change since it can't `import` the `.svg?react` asset directly).
      button.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M5 8.42857L6.8 11L11 5" stroke="var(--icon-on-accent, #FFF)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } else {
      // Unchecked state: circle outline — matches
      // shared/icon/svg/checkbox-unchecked.svg exactly (same
      // square-to-circle supersession as the checked state above).
      button.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7.5" stroke="currentColor"/></svg>';
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
