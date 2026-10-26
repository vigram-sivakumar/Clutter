import { describe, expect, it } from 'vitest';

import { assetCompletionRow } from './assetCompletionRow';
import { COMPLETION_ICONS } from './completionIcons';
import { COMPLETION_SECTIONS } from './completionSections';

const sections = { images: COMPLETION_SECTIONS.images, pdfs: COMPLETION_SECTIONS.pdfs };

describe('assetCompletionRow', () => {
  it('an image shows its own picture over its folder, in the trigger’s Images section', () => {
    const { row, section } = assetCompletionRow(
      { assetKind: 'image', title: 'hero', breadcrumb: 'Assets', previewUrl: 'app:///hero.png' },
      sections
    );

    expect(row).toEqual({ iconSvg: COMPLETION_ICONS.image, thumbnail: 'app:///hero.png', title: 'hero', path: 'Assets' });
    expect(section).toBe(COMPLETION_SECTIONS.images);
  });

  it('a PDF shows its first page (pending, the icon meanwhile) in the trigger’s PDFs section', () => {
    const { row, section } = assetCompletionRow({ assetKind: 'pdf', title: 'plan', breadcrumb: null, previewUrl: 'blob:none' }, sections);

    expect(row.thumbnail).toBeInstanceOf(Promise);
    expect(row.iconSvg).toBe(COMPLETION_ICONS.pdf);
    expect(section).toBe(COMPLETION_SECTIONS.pdfs);
  });

  it('without a preview URL, only the icon; and the trigger picks the sections', () => {
    const own = { images: COMPLETION_SECTIONS.linkImages, pdfs: COMPLETION_SECTIONS.linkPdfs };
    const { row, section } = assetCompletionRow({ assetKind: 'image', title: 'a', breadcrumb: null }, own);

    expect(row.thumbnail).toBeUndefined();
    expect(section).toBe(COMPLETION_SECTIONS.linkImages);
  });
});
