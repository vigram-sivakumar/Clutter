import { describe, expect, it } from 'vitest';

import { embedHeadingRow, embedPageRow, embedResourceRow } from './embedCompletionRow';
import type { EmbedResourceSuggestion } from './embedSuggestion';

const resource = (overrides: Partial<EmbedResourceSuggestion> = {}): EmbedResourceSuggestion => ({
  kind: 'resource',
  path: 'Images/hero.png',
  title: 'hero.png',
  breadcrumb: 'Images',
  resourceKind: 'image',
  ...overrides,
});

describe('embedResourceRow', () => {
  it('shows an image as its own picture, over its folder, in the Images section', () => {
    const { row, section } = embedResourceRow(resource({ previewUrl: 'app:///vault/Images/hero.png' }));

    expect(row).toMatchObject({ title: 'hero.png', path: 'Images', thumbnail: 'app:///vault/Images/hero.png' });
    expect(section?.name).toBe('Images');
  });

  it('shows a PDF in the PDFs section, its first page pending (a promise, the icon meanwhile)', () => {
    const { row, section } = embedResourceRow(resource({ resourceKind: 'pdf', title: 'plan.pdf', previewUrl: 'blob:none' }));

    expect(row.thumbnail).toBeInstanceOf(Promise);
    expect(section?.name).toBe('PDFs');
  });

  it('has no thumbnail, only the icon, without a preview URL', () => {
    const { row } = embedResourceRow(resource());

    expect(row.thumbnail).toBeUndefined();
    expect(row.iconSvg).toBeTruthy();
  });
});

describe('embedHeadingRow', () => {
  it('shows the heading\'s text with its level on the right, and no section', () => {
    const result = embedHeadingRow({ kind: 'heading', heading: 'Billing', level: 2 });

    expect(result.row).toMatchObject({ title: 'Billing', trailing: 'H2' });
    expect(result).not.toHaveProperty('section');
  });
});

describe('embedPageRow', () => {
  it('shows a note as it reads after [[ — its name over its folder, in the Notes section', () => {
    const { row, section } = embedPageRow({ kind: 'page', path: 'Projects/Roadmap', title: 'Roadmap', breadcrumb: 'Projects' });

    expect(row).toMatchObject({ title: 'Roadmap', path: 'Projects' });
    expect(section?.name).toBe('Notes');
  });

  it('shows a Daily Note by its short date, with no path, in the Daily notes section', () => {
    const { row, section } = embedPageRow({ kind: 'page', path: '2026-08-24', title: '2026-08-24', breadcrumb: null, dailyNote: true });

    expect(row.title).toBe('24 Aug');
    expect(row.path).toBeUndefined();
    expect(section?.name).toBe('Daily notes');
  });

  it('orders the sections Images, PDFs, Notes, Daily notes', () => {
    const rank = (s?: { rank?: number | string }) => Number(s?.rank);
    const sections = [
      embedResourceRow(resource()).section,
      embedResourceRow(resource({ resourceKind: 'pdf' })).section,
      embedPageRow({ kind: 'page', path: 'N', title: 'N', breadcrumb: null }).section,
      embedPageRow({ kind: 'page', path: 'D', title: 'D', breadcrumb: null, dailyNote: true }).section,
    ];

    expect(sections.map((s) => s?.name)).toEqual(['Images', 'PDFs', 'Notes', 'Daily notes']);
    expect(sections.map(rank)).toEqual([...sections.map(rank)].sort((a, b) => a - b));
    expect(new Set(sections.map(rank)).size).toBe(4);
  });
});
