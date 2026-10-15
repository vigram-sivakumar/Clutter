import { describe, expect, it } from 'vitest';

import { findCoverCredit } from './coverCredit';
import { newCoverPatch } from './coverPatch';
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
