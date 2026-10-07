import { beforeEach, describe, expect, it, vi } from 'vitest';

const revealInFinder = vi.fn();
const copyTextToClipboard = vi.fn();

vi.mock('@shared/helpers/revealInFinder', () => ({ revealInFinder: (p: string) => revealInFinder(p) }));
vi.mock('@shared/helpers/copyTextToClipboard', () => ({
  copyTextToClipboard: (t: string) => copyTextToClipboard(t),
}));

import { createLocationActions } from './createLocationActions';

beforeEach(() => {
  revealInFinder.mockClear();
  copyTextToClipboard.mockClear();
});

describe('createLocationActions', () => {
  const location = createLocationActions('/vault');

  it('reveals an entity path, and ignores a missing entity', () => {
    location.reveal('/vault/A.md');
    location.reveal(undefined);
    expect(revealInFinder).toHaveBeenCalledTimes(1);
    expect(revealInFinder).toHaveBeenCalledWith('/vault/A.md');
  });

  it('copies the chosen representation of a page', () => {
    location.copyPath({ path: '/vault/Notes/A.md' }, 'page', 'at-vault');
    location.copyPath({ path: '/vault/Notes/A.md' }, 'page', 'full-path');
    location.copyPath({ path: '/vault/Notes/A.md' }, 'page', 'as-markdown');
    expect(copyTextToClipboard.mock.calls.map((call) => call[0])).toEqual([
      'Notes/A.md',
      '/vault/Notes/A.md',
      '[[Notes/A]]',
    ]);
  });

  it('copies nothing for a missing entity or a folder\'s absent Markdown form', () => {
    location.copyPath(undefined, 'page', 'full-path');
    location.copyPath({ path: '/vault/F' }, 'folder', 'as-markdown');
    expect(copyTextToClipboard).not.toHaveBeenCalled();
  });
});
