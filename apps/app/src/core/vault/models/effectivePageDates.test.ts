import { describe, expect, it } from 'vitest';
import { resolveEffectivePageDates } from './effectivePageDates';
import type { PageFileTimes } from './effectivePageDates';

const page = (fileTimes?: PageFileTimes) => ({ ...(fileTimes && { fileTimes }) });

describe('resolveEffectivePageDates — the file’s own times, nothing else (ADR-057)', () => {
  it('Created is the file’s birth time and Last edited its modification time', () => {
    expect(
      resolveEffectivePageDates(page({ createdAt: '2026-03-01T10:00:00.000Z', modifiedAt: '2026-03-05T12:00:00.000Z' }))
    ).toEqual({ createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-05T12:00:00.000Z' });
  });

  it('resolves each property independently', () => {
    expect(resolveEffectivePageDates(page({ createdAt: null, modifiedAt: '2026-03-05T12:00:00.000Z' }))).toEqual({
      createdAt: null,
      updatedAt: '2026-03-05T12:00:00.000Z',
    });
  });

  it('normalizes to UTC ISO, so results sort lexicographically', () => {
    expect(resolveEffectivePageDates(page({ createdAt: '2026-03-01T10:00:00+02:00', modifiedAt: null })).createdAt).toBe(
      '2026-03-01T08:00:00.000Z'
    );
  });

  it('is null — never a fabricated date — when the file times are missing, null or invalid', () => {
    expect(resolveEffectivePageDates(page())).toEqual({ createdAt: null, updatedAt: null });
    expect(resolveEffectivePageDates(page({ createdAt: null, modifiedAt: null }))).toEqual({ createdAt: null, updatedAt: null });
    expect(resolveEffectivePageDates(page({ createdAt: 'garbage', modifiedAt: '' }))).toEqual({ createdAt: null, updatedAt: null });
  });

  it('has no other source: a page’s frontmatter cannot supply a date', () => {
    const withFrontmatterLookingFields = { metadata: { createdAt: '2020-01-01T00:00:00.000Z' }, fileTimes: undefined };

    expect(resolveEffectivePageDates(withFrontmatterLookingFields as never)).toEqual({ createdAt: null, updatedAt: null });
  });
});
