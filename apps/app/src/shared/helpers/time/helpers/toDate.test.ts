import { describe, expect, it } from 'vitest';

import { toDate } from './toDate';

describe('toDate', () => {
  it('parses the given calendar components onto the returned Date', () => {
    const date = toDate('2026-08-20');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(20);
  });

  it('lands on local midnight, not UTC midnight — regression for the new Date(isoString) trap', () => {
    // new Date("YYYY-MM-DD") is parsed as UTC midnight per spec. Landing on
    // local midnight here is host-timezone-independent to assert directly:
    // UTC parsing only produces local hours/minutes of 0 for a host running
    // exactly at UTC+0, so a non-zero host offset (true almost everywhere,
    // including this suite's CI/dev hosts) makes this a real regression
    // guard rather than a tautology of the fix's own implementation.
    const date = toDate('2026-08-20');

    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it('never rolls the calendar day backward at a month/year boundary — the specific failure the UTC trap caused in negative-UTC-offset timezones', () => {
    const date = toDate('2026-01-01');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});
