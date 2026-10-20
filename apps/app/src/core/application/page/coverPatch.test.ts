import { describe, expect, it } from 'vitest';

import { findCoverCredit } from './coverCredit';
import { initialCoverLayoutPatch, newCoverPatch } from './coverPatch';
import type { Folder, Page } from '../../vault/models';

const CREDIT = { name: 'Alex Doe', url: 'https://unsplash.com/@alex' };
const URL_A = 'https://images.unsplash.com/photo-a?ixid=1';

describe('newCoverPatch', () => {
  it('sets the credit alongside the cover', () => {
    expect(newCoverPatch(URL_A, CREDIT)).toEqual({
      cover: URL_A,
      coverCredit: CREDIT,
      coverHidden: false,
      coverPositionAbove: 50,
      coverPositionSide: 50,
    });
  });

  it('always clears a previous credit when no credit is given (link, upload, vault asset)', () => {
    expect(newCoverPatch('Assets/x.png').coverCredit).toBeNull();
    expect(newCoverPatch('https://example.com/c.png').coverCredit).toBeNull();
  });
});

describe('initialCoverLayoutPatch', () => {
  const note = (cover: string | null, coverLayout: 'side' | 'above') => ({ cover, coverLayout });

  it('gives a note with no cover and no saved Top the default Top', () => {
    expect(initialCoverLayoutPatch(note(null, 'side'), 'above')).toEqual({ coverLayout: 'above' });
  });

  it('gives a note that does not exist yet (a draft) the default Top', () => {
    expect(initialCoverLayoutPatch(undefined, 'above')).toEqual({ coverLayout: 'above' });
  });

  it('writes nothing for the default Right: it is what an absent position already is', () => {
    expect(initialCoverLayoutPatch(note(null, 'side'), 'side')).toEqual({});
    expect(initialCoverLayoutPatch(undefined, 'side')).toEqual({});
  });

  it("never overrides a note's saved Top, whatever the default is", () => {
    expect(initialCoverLayoutPatch(note(null, 'above'), 'above')).toEqual({});
    expect(initialCoverLayoutPatch(note(null, 'above'), 'side')).toEqual({});
  });

  it('never changes the position of a note that already has a cover (a replacement keeps its position)', () => {
    expect(initialCoverLayoutPatch(note('Assets/a.png', 'side'), 'above')).toEqual({});
    expect(initialCoverLayoutPatch(note('Assets/a.png', 'above'), 'side')).toEqual({});
  });
});

describe('findCoverCredit', () => {
  const page = (cover: string | null, coverCredit: typeof CREDIT | null) =>
    ({ metadata: { cover, coverCredit } }) as unknown as Page;
  const folder = (cover: string | null, coverCredit: typeof CREDIT | null) =>
    ({ metadata: { cover, coverCredit } }) as unknown as Folder;

  it('returns the credit already recorded for the exact URL on a page or a folder', () => {
    expect(findCoverCredit([page(URL_A, CREDIT)], [], URL_A)).toEqual(CREDIT);
    expect(findCoverCredit([], [folder(URL_A, CREDIT)], ` ${URL_A} `)).toEqual(CREDIT);
  });

  it('returns null — never a guess — for a URL nobody holds, or one held without a credit', () => {
    expect(findCoverCredit([page(URL_A, null)], [], URL_A)).toBeNull();
    expect(findCoverCredit([page('https://images.unsplash.com/photo-b', CREDIT)], [], URL_A)).toBeNull();
    expect(findCoverCredit([], [], URL_A)).toBeNull();
  });
});
