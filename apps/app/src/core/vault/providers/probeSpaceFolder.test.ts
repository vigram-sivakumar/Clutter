import { beforeEach, describe, expect, it, vi } from 'vitest';

const isTauri = vi.fn();
const stat = vi.fn();
const readDir = vi.fn();
/** The native side: `check_space_filesystem` (and `ensure_space_access`, which only restores a grant). */
const native = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauri(),
  invoke: (command: string, args: unknown) => native(command, args),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: (...args: unknown[]) => stat(...args),
  readDir: (...args: unknown[]) => readDir(...args),
}));

import { isFolderConfirmedMissing, probeSpaceFolder } from './probeSpaceFolder';

beforeEach(() => {
  isTauri.mockReturnValue(true);
  stat.mockReset();
  readDir.mockReset();
  // By default the native side accepts what the plugin accepted, as it does for a folder in the granted scope.
  native.mockReset().mockImplementation(async (command: string) =>
    command === 'check_space_filesystem' ? { status: 'supported', filesystem: 'apfs' } : false
  );
});

describe('probeSpaceFolder', () => {
  it('accepts a readable directory', async () => {
    stat.mockResolvedValue({ isDirectory: true });
    readDir.mockResolvedValue([]);
    expect(await probeSpaceFolder('/a')).toBe('available');
  });

  describe('a folder the plugin can read but the native scope does not grant', () => {
    const outOfScope = { code: 'outOfScope', detail: 'the folder is not inside the approved filesystem scope' };
    const refuseNatively = () =>
      native.mockImplementation(async (command: string) => {
        if (command === 'check_space_filesystem') throw outOfScope;
        return false;
      });

    it('is not available: the open would refuse it, so the probe says its folder has to be selected again', async () => {
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockResolvedValue([]);
      refuseNatively();

      expect(await probeSpaceFolder('/Users/me/Projects/Notes')).toBe('missing');
    });

    it('restores a recoverable grant first, then asks the native check', async () => {
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockResolvedValue([]);
      refuseNatively();

      await probeSpaceFolder('/Users/me/Projects/Notes');

      expect(native.mock.calls.map(([command]) => command)).toEqual(['ensure_space_access', 'check_space_filesystem']);
    });

    it('is available once the grant restored it', async () => {
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockResolvedValue([]);
      let granted = false;
      native.mockImplementation(async (command: string) => {
        if (command === 'ensure_space_access') {
          granted = true;
          return true;
        }
        if (!granted) throw outOfScope;
        return { status: 'supported', filesystem: 'apfs' };
      });

      expect(await probeSpaceFolder('/Users/me/Documents/Legacy')).toBe('available');
    });

    it.each([
      ['an unsupported volume (its own message is given when it is opened)', { status: 'unsupported', filesystem: 'exfat' }],
      ['a check that could not run', undefined],
    ])('stays available for %s: only a missing grant changes what the probe says', async (_name, answer) => {
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockResolvedValue([]);
      native.mockImplementation(async (command: string) => (command === 'check_space_filesystem' ? answer : false));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await probeSpaceFolder('/Volumes/Stick/Notes')).toBe('available');
    });

    it('is not asked for a folder that is absent, a file or unreadable', async () => {
      stat.mockRejectedValue('No such file or directory (os error 2)');
      expect(await probeSpaceFolder('/gone')).toBe('missing');
      stat.mockResolvedValue({ isDirectory: false });
      expect(await probeSpaceFolder('/a.md')).toBe('unavailable');
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockRejectedValue(new Error('denied'));
      expect(await probeSpaceFolder('/locked')).toBe('unavailable');

      expect(native).not.toHaveBeenCalled();
    });

    it('is not asked when only the name is wanted (a rename destination), and the folder exists', async () => {
      stat.mockResolvedValue({ isDirectory: true });
      readDir.mockResolvedValue([]);
      refuseNatively();

      expect(await probeSpaceFolder('/Users/me/Projects/Taken', { requireAccess: false })).toBe('available');
      expect(native).not.toHaveBeenCalled();
    });
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

