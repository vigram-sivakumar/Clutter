// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import { renderDateCompletion, type DateCompletion } from './dateCompletionRenderer';
import type { DateSuggestion } from './dateSuggestion';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create(), parent });
}

function render(dateSuggestion: DateSuggestion): HTMLElement {
  const completion: DateCompletion = { label: 'unused', dateSuggestion };
  const view = mountView();
  const row = renderDateCompletion(completion as Completion, view.state, view);
  if (!(row instanceof HTMLElement)) {
    throw new Error('Expected renderDateCompletion to render a genuine DateCompletion');
  }
  return row;
}

/**
 * Regression coverage: the popup used to show the raw `YYYY-MM-DD` value
 * a second time alongside the human-readable label — redundant, since the
 * label now always spells out the full calendar date via
 * `formatDateDisplay(isoDate, 'shortWeekday')`, the same Daily-Note-title
 * format (toResourcePageModel.ts) but with an abbreviated weekday, since
 * this popup row has less room than a page title.
 */
describe('renderDateCompletion — single human-readable date, no separate ISO value', () => {
  it('shows only formatDateDisplay(isoDate, "shortWeekday") — no raw ISO date anywhere in the row', () => {
    const row = render({ label: 'Tomorrow', isoDate: '2026-09-13' });

    expect(row.textContent).toBe(formatDateDisplay('2026-09-13', 'shortWeekday'));
    expect(row.textContent).not.toContain('2026-09-13');
  });

  it('does not render a .date-completion__iso element at all', () => {
    const row = render({ label: 'Today', isoDate: '2026-09-12' });

    expect(row.querySelector('.date-completion__iso')).toBeNull();
  });

  it('the relative-keyword case ("Today") still shows the full calendar date, not the bare keyword alone', () => {
    const row = render({ label: 'Today', isoDate: '2026-09-12' });

    const label = row.querySelector('.date-completion__label');
    expect(label?.textContent).toBe(formatDateDisplay('2026-09-12', 'shortWeekday'));
    expect(label?.textContent).toContain('2026');
  });

  it('a resolved-query suggestion (already a full date-shaped label) renders identically via the shared formatter, not its own pre-existing label text', () => {
    const row = render({ label: 'September 12, 2026', isoDate: '2026-09-12' });

    // formatDateDisplay('shortWeekday') orders as "<day identity>, <day
    // month year>" (e.g. "Sat, 12 September 2026"), not "September 12,
    // 2026" — the row must reflect the shared formatter's own output, not
    // the suggestion's own (differently-ordered) label text.
    expect(row.textContent).toBe(formatDateDisplay('2026-09-12', 'shortWeekday'));
  });

  it('returns null for a completion that is not a DateCompletion at all — coexistence with WikiLink/other sources in one addToOptions array', () => {
    const view = mountView();
    const notADateCompletion = { label: 'unrelated' } as Completion;

    expect(renderDateCompletion(notADateCompletion, view.state, view)).toBeNull();
  });
});
