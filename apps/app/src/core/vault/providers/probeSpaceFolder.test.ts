import { beforeEach, describe, expect, it, vi } from 'vitest';

const isTauri = vi.fn();
const stat = vi.fn();
const readDir = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: (...args: unknown[]) => stat(...args),
  readDir: (...args: unknown[]) => readDir(...args),
}));

import { isFolderConfirmedMissing, probeSpaceFolder } from './probeSpaceFolder';

beforeEach(() => {
  isTauri.mockReturnValue(true);
  stat.mockReset();
  readDir.mockReset();
});

describe('probeSpaceFolder', () => {
  it('accepts a readable directory', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    readDir.mockResolvedValue([]);
    expect(await probeSpaceFolder('/a')).toBe('available');
  });

  it('rejects a file', async () => {
    stat.mockResolvedValue({ isDirectory: false });
    expect(await probeSpaceFolder('/a.md')).toBe('unavailable');
  });

  it('reports a confirmed missing folder (the plugin rejects with a plain string)', async () => {
    stat.mockRejectedValue('No such file or directory (os error 2)');
    expect(await probeSpaceFolder('/nope')).toBe('missing');
  });

  it('does not call an out-of-scope path missing', async () => {
    stat.mockRejectedValue('forbidden path: /Users/someone/else');
    expect(await probeSpaceFolder('/Users/someone/else')).toBe('unavailable');
  });

  it('does not call a permission error missing', async () => {
    stat.mockRejectedValue('Permission denied (os error 13)');
    expect(await probeSpaceFolder('/locked')).toBe('unavailable');
  });

  it('rejects an unreadable directory', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    readDir.mockRejectedValue(new Error('denied'));
    expect(await probeSpaceFolder('/locked')).toBe('unavailable');
  });

  it('accepts anything in the web runtime, which has no real folders', async () => {
    isTauri.mockReturnValue(false);
    expect(await probeSpaceFolder('/web-dev-vault')).toBe('available');
    expect(stat).not.toHaveBeenCalled();
  });
});

describe('isFolderConfirmedMissing', () => {
  it('is true only for a confirmed absence', async () => {
    stat.mockRejectedValue('No such file or directory (os error 2)');
    expect(await isFolderConfirmedMissing('/gone')).toBe(true);
  });

  it('is false while the folder exists', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    expect(await isFolderConfirmedMissing('/here')).toBe(false);
    expect(readDir).not.toHaveBeenCalled();
  });

  it.each([
    ['a permission error', 'Permission denied (os error 13)'],
    ['a filesystem scope error', 'forbidden path: /Users/someone/else'],
    ['another I/O failure', 'Input/output error (os error 5)'],
  ])('is false for %s', async (_name, reason) => {
    stat.mockRejectedValue(reason);
    expect(await isFolderConfirmedMissing('/x')).toBe(false);
  });

  it('is false in the web runtime, which has no real folders', async () => {
    isTauri.mockReturnValue(false);
    expect(await isFolderConfirmedMissing('/web-dev-vault')).toBe(false);
    expect(stat).not.toHaveBeenCalled();
  });
});

