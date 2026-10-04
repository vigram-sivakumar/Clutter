import { describe, expect, it } from 'vitest';

import { embedHeadingRow, embedResourceRow } from './embedCompletionRow';
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
