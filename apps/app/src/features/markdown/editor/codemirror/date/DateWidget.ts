import { WidgetType } from '@codemirror/view';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

import type { DateResolution } from './dateResolution';

/**
 * The at-rest rendered form of a Date. Unlike `WikiLinkWidget`, the label
 * is computed purely from `isoDate` (no injected resolver involved — see
 * `dateResolution.ts`'s own comment for why) via `formatDateDisplay`'s
 * `'compact'` mode — the single shared rendered-date-label formatter also
 * used by `formatTaskDueDate.ts` (a sibling feature) and Daily Note titles
 * (`'full'` mode there), so all three stay in sync by construction instead
 * of each keeping its own copy of the relative-label-else-date logic.
 *
 * A calendar-invalid-but-shape-valid date (`2026-13-45`) still renders —
 * as its own raw text, un-formatted, with `data-date-status="invalid"` —
 * rather than throwing or silently guessing; still a real `WidgetType`
 * (not a `null`/no-decoration skip) so it still participates in the same
 * `semanticTokenDecorations`/`EditorView.atomicRanges` coupling every
 * other at-rest semantic token does (the lesson already learned building
 * `TagWidget`).
 *
 * The `@` is part of this widget's own Markdown *presentation*, not the
 * shared formatter's output — `formatDateDisplay` only ever returns the
 * date label (`"Today"`, `"12 August"`, ...), and `toDOM()` prepends `@`
 * itself. Daily Note titles use the exact same `formatDateDisplay` calls
 * without ever adding an `@`, which is exactly why the prefix has to live
 * here and not inside the shared formatter — two different presentations
 * of the same underlying label, not two different labels.
 */
export class DateWidget extends WidgetType {
  constructor(
    readonly isoDate: string,
    readonly resolution: DateResolution
  ) {
    super();
  }

  private get valid(): boolean {
    return isValidCalendarDate(this.isoDate);
  }

  private get label(): string {
    if (!this.valid) {
      return this.isoDate;
    }

    return formatDateDisplay(this.isoDate, 'compact');
  }

  override eq(other: DateWidget): boolean {
    return this.isoDate === other.isoDate;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.classList.add('tok-date');
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `date: @${this.label}`);
    span.dataset.dateStatus = this.valid ? 'valid' : 'invalid';

    const prefix = document.createElement('span');
    prefix.classList.add('tok-date-prefix');
    prefix.textContent = '@';
    span.append(prefix, document.createTextNode(this.label));

    return span;
  }

  /**
   * Same fix `WikiLinkWidget.ignoreEvent`/`TagWidget.ignoreEvent` document
   * on themselves: a `WidgetType`'s default is to ignore every event,
   * which would silently discard `mousedown` before `tokenMouseHandlers.ts`'s
   * `EditorView.domEventHandlers` listener ever saw it.
   */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}
