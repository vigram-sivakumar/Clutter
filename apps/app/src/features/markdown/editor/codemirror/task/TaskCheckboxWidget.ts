import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of a `TaskMarker` — the visual checkbox
 * (`☐`/`☑`) standing in for the raw `[ ]`/`[x]`/`[X]` source, same shape
 * as `TagWidget`/`WikiLinkWidget`'s own at-rest widgets. `checked` is
 * read directly off the real `TaskMarker` text by the decoration that
 * constructs this widget (`isTaskMarkerChecked`, `taskEngagement.ts`) —
 * this class carries no state of its own and never diverges from the
 * document.
 *
 * Unlike Tag/Date/WikiLink, there is no "engaged" (revealed-raw-text)
 * state for this construct at all — the checkbox always renders,
 * regardless of caret position (explicit product decision, task
 * visual-rendering slice: "do not invent a reveal Markdown mode"). So
 * this widget is the *only* rendered form `taskCheckboxDecoration.ts`
 * ever produces for a `TaskMarker`, not one branch of a reveal/conceal
 * pair.
 *
 * `role="checkbox"`/`aria-checked` (not `role="button"`, unlike
 * `TagWidget`) — this construct's own accessibility semantics are a real
 * binary toggle state, not a filter/open action.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    // `cm-list-marker`: the shared tint/box-alignment class every marker
    // kind but bullets opts into (`MarkdownEditor.css`); `cm-task-checkbox`
    // carries this construct's own geometry/cursor affordance.
    span.classList.add('cm-list-marker', 'cm-task-checkbox');
    span.setAttribute('role', 'checkbox');
    span.setAttribute('aria-checked', String(this.checked));
    span.textContent = this.checked ? '☑' : '☐';
    return span;
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
