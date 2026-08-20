import { describe, expect, it } from 'vitest';
import { formatTaskTitle } from './formatTaskTitle';

describe('formatTaskTitle', () => {
  it('hides the single due date, with no leftover whitespace', () => {
    expect(formatTaskTitle('Clean the Trash @2026-08-20', '2026-08-20')).toBe(
      'Clean the Trash'
    );
  });

  it('hides the due date when it is at the start of the text', () => {
    expect(formatTaskTitle('@2026-08-20 Clean the trash', '2026-08-20')).toBe(
      'Clean the trash'
    );
  });

  it('hides the due date when it is in the middle of the text', () => {
    expect(
      formatTaskTitle('Complete @2026-08-20 the mockup', '2026-08-20')
    ).toBe('Complete the mockup');
  });

  it('hides the due date immediately followed by punctuation cleanly', () => {
    expect(formatTaskTitle('Clean the Trash @2026-08-20!', '2026-08-20')).toBe(
      'Clean the Trash!'
    );
  });

  it('hides only the due date, leaving every other bare date in the text raw and untouched', () => {
    // Reformatting a surviving date (e.g. @2026-08-20 -> @Today) is now
    // renderCompactMarkdown's job, not formatTaskTitle's — this function
    // only ever decides which occurrence is *the* due date and removes it.
    expect(
      formatTaskTitle(
        'Complete @2026-08-20 the mockup @2026-08-22',
        '2026-08-20'
      )
    ).toBe('Complete the mockup @2026-08-22');
  });

  it('hides only the due date among three dates, leaving the other two raw', () => {
    expect(
      formatTaskTitle(
        'Review @2026-08-20 and compare with @2026-08-22 and @2026-09-01',
        '2026-08-20'
      )
    ).toBe('Review and compare with @2026-08-22 and @2026-09-01');
  });

  it('only hides the first occurrence matching dueDate, leaving a later identical date raw', () => {
    expect(
      formatTaskTitle('Due @2026-08-20, reminder again @2026-08-20', '2026-08-20')
    ).toBe('Due, reminder again @2026-08-20');
  });

  it('leaves text with no bare date unchanged, e.g. dueDate came from @due: metadata (already stripped from text at extraction)', () => {
    expect(formatTaskTitle('Clean the Trash', '2026-08-20')).toBe(
      'Clean the Trash'
    );
  });

  it('leaves text completely unchanged when dueDate is undefined, bare dates included', () => {
    expect(formatTaskTitle('Clean the Trash', undefined)).toBe(
      'Clean the Trash'
    );
    expect(formatTaskTitle('Follow up @2026-08-22', undefined)).toBe(
      'Follow up @2026-08-22'
    );
  });

  it('leaves a shape-valid but calendar-invalid due date candidate unmatched, returning text unchanged', () => {
    // BARE_DATE_PATTERN is shape-only (TaskExtractor.ts's own documented
    // parse-vs-validate split) — a dueDate value that never matches any
    // bare-date occurrence in the text (e.g. it came from @due:, or the
    // text has no matching date at all) falls through unchanged, exactly
    // as before.
    expect(formatTaskTitle('Clean the Trash', '2026-13-45')).toBe(
      'Clean the Trash'
    );
  });

  it('returns independently correct results across consecutive calls with different texts/dates — guards against a hoisted, stateful RegExp leaking lastIndex between calls', () => {
    const first = formatTaskTitle(
      'Review @2026-08-20 and compare with @2026-08-22',
      '2026-08-20'
    );
    const second = formatTaskTitle('Follow up @2026-09-01', '2026-08-20');

    expect(first).toBe('Review and compare with @2026-08-22');
    expect(second).toBe('Follow up @2026-09-01');
  });
});
