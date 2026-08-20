import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTaskTitle } from './formatTaskTitle';

describe('formatTaskTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Thursday, 2026-08-20.
    vi.setSystemTime(new Date(2026, 7, 20));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('hides only the due date and renders every other bare date semantically', () => {
    expect(
      formatTaskTitle(
        'Complete @2026-08-20 the mockup @2026-08-22',
        '2026-08-20'
      )
    ).toBe('Complete the mockup @Saturday');
  });

  it('hides only the due date among three dates, formatting the other two', () => {
    expect(
      formatTaskTitle(
        'Review @2026-08-20 and compare with @2026-08-22 and @2026-09-01',
        '2026-08-20'
      )
    ).toBe('Review and compare with @Saturday and @1 September');
  });

  it('only hides the first occurrence matching dueDate, formatting a later identical date', () => {
    expect(
      formatTaskTitle('Due @2026-08-20, reminder again @2026-08-20', '2026-08-20')
    ).toBe('Due, reminder again @Today');
  });

  it('renders a remaining bare date as @Today/@Tomorrow/@Yesterday', () => {
    expect(formatTaskTitle('Follow up @2026-08-20', undefined)).toBe(
      'Follow up @Today'
    );
    expect(formatTaskTitle('Follow up @2026-08-21', undefined)).toBe(
      'Follow up @Tomorrow'
    );
    expect(formatTaskTitle('Follow up @2026-08-19', undefined)).toBe(
      'Follow up @Yesterday'
    );
  });

  it('renders a remaining bare date within the current week as its weekday name', () => {
    expect(formatTaskTitle('Follow up @2026-08-22', undefined)).toBe(
      'Follow up @Saturday'
    );
  });

  it('renders a remaining bare date in the same year, outside the current week, as day + full month', () => {
    expect(formatTaskTitle('Follow up @2026-09-01', undefined)).toBe(
      'Follow up @1 September'
    );
  });

  it('renders a remaining bare date in a different year as day + full month + year', () => {
    expect(formatTaskTitle('Follow up @2027-08-21', undefined)).toBe(
      'Follow up @21 August 2027'
    );
  });

  it('leaves text with no bare date unchanged, e.g. dueDate came from @due: metadata (already stripped from text at extraction)', () => {
    expect(formatTaskTitle('Clean the Trash', '2026-08-20')).toBe(
      'Clean the Trash'
    );
  });

  it('leaves text unchanged when dueDate is undefined and there is no bare date', () => {
    expect(formatTaskTitle('Clean the Trash', undefined)).toBe(
      'Clean the Trash'
    );
  });

  it('returns independently correct results across consecutive calls with different texts/dates — guards against a hoisted, stateful RegExp leaking lastIndex between calls', () => {
    const first = formatTaskTitle(
      'Review @2026-08-20 and compare with @2026-08-22',
      '2026-08-20'
    );
    const second = formatTaskTitle('Follow up @2026-09-01', undefined);

    expect(first).toBe('Review and compare with @Saturday');
    expect(second).toBe('Follow up @1 September');
  });
});
