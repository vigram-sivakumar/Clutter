import { describe, expect, it } from 'vitest';

import { inverseMetadataPatch, pickTemplateMetadataToMerge } from './applyTemplateToNote';
import { pickInheritedTemplateMetadata } from './createNoteFromTemplate';

const CREDIT = { name: 'Alex Doe', url: 'https://unsplash.com/@alex' };
const COVER = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';
const TEMPLATE = {
  icon: null,
  cover: COVER,
  coverCredit: CREDIT,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
};

describe('template cover credit (ADR-054)', () => {
  it('is inherited with the cover, and only with a cover', () => {
    expect(pickInheritedTemplateMetadata(TEMPLATE)).toMatchObject({ cover: COVER, coverCredit: CREDIT });
    expect(pickInheritedTemplateMetadata({ ...TEMPLATE, cover: null })).toEqual({});
  });

  it('is not part of the patch when the template cover has no credit', () => {
    const { coverCredit: _unused, ...withoutCredit } = TEMPLATE;

    expect(pickInheritedTemplateMetadata(withoutCredit)).not.toHaveProperty('coverCredit');
  });

  it('applying to a note without a cover gives it the cover and the credit', () => {
    expect(pickTemplateMetadataToMerge({}, TEMPLATE, 'note')).toMatchObject({ cover: COVER, coverCredit: CREDIT });
  });

  it('never replaces a note’s own cover — nor its credit', () => {
    const patch = pickTemplateMetadataToMerge(
      { cover: 'https://images.unsplash.com/photo-own?ixid=9', coverCredit: { name: 'Own', url: 'https://unsplash.com/@own' } },
      TEMPLATE,
      'note'
    );

    expect(patch).not.toHaveProperty('cover');
    expect(patch).not.toHaveProperty('coverCredit');
  });

  it('undo restores the note’s credit-less state (the blank default is null)', () => {
    const patch = pickTemplateMetadataToMerge({}, TEMPLATE, 'note');

    expect(inverseMetadataPatch({}, patch)).toMatchObject({ cover: null, coverCredit: null });
  });
});
