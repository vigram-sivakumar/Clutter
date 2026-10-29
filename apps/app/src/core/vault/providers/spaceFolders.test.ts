import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/someone-else/Documents/',
  homeDir: async () => '/Users/someone-else/',
}));

import {
  createSpaceFolder,
  isTooBroadForSpace,
  ensureSpaceAccess,
  isReachedThroughLink,
  renameSpaceFolder,
  resolveSpaceParent,
} from './spaceFolders';

beforeEach(() => {
  invoke.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveSpaceParent', () => {
  it("is the current user's Documents folder, from the platform — not a hardcoded path", async () => {
    expect(await resolveSpaceParent()).toEqual({
      path: '/Users/someone-else/Documents',
      name: 'Documents',
    });
  });
});

describe('isTooBroadForSpace', () => {
  it.each([
    '/',
    '/Users',
    '/Users/',
    '/Users/someone-else',
    '/Users/someone-else/',
  ])(
    'refuses %j: the disk root, the home folder, or a folder containing it',
    async (path) => {
      expect(await isTooBroadForSpace(path)).toBe(true);
    }
  );

  it.each([
    '/Users/someone-else/Documents',
    '/Users/someone-else/Documents/Notes',
    '/Users/someone-else/Projects/notes',
    '/Users/someone-else/Desktop',
    '/Volumes/Drive',
    '/Volumes/Drive/Notes',
    '/Users/someone-else-2',
    '/Users/other/Notes',
    '/opt/shared/vault',
  ])(
    'allows %j — ordinary folders anywhere, inside home or not',
    async (path) => {
      expect(await isTooBroadForSpace(path)).toBe(false);
    }
  );
});

describe('createSpaceFolder', () => {
  it('asks the backend to create the trimmed name, and uses the path it answers with', async () => {
    invoke.mockResolvedValue('/Users/someone-else/Documents/Personal');

    expect(await createSpaceFolder('  Personal ')).toEqual({
      path: '/Users/someone-else/Documents/Personal',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('create_space_folder', {
      name: 'Personal',
    });
  });

  it.each([
    '',
    '   ',
    '.',
    '..',
    '../escape',
    '../../etc',
    'a/b',
    '/abs',
    'a\\b',
    'a:b',
    'a\u0000b',
    'x'.repeat(256),
  ])('refuses the name %j and touches nothing', async (name) => {
    expect(await createSpaceFolder(name)).toEqual({
      error: expect.stringContaining('Enter a name'),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports a taken name instead of adopting or overwriting it', async () => {
    invoke.mockRejectedValue('File exists (os error 17)');
    expect(await createSpaceFolder('Personal')).toEqual({
      error: expect.stringContaining('already exists'),
    });
  });

  it.each([
    ['Permission denied (os error 13)', "doesn’t have permission"],
    ['forbidden path: /Users/someone-else/Documents/Personal', "isn’t allowed"],
    ['No such file or directory (os error 2)', 'could not be found'],
    ['Disk quota exceeded (os error 122)', "Couldn’t create the folder"],
  ])('describes the failure %j', async (reason, expected) => {
    invoke.mockRejectedValue(reason);
    expect(await createSpaceFolder('Personal')).toEqual({
      error: expect.stringContaining(expected),
    });
  });
});

describe('ensureSpaceAccess', () => {
  it('asks the backend to restore the access of the opened Space', async () => {
    invoke.mockResolvedValue(true);

    await ensureSpaceAccess('/Users/someone-else/Documents/Notes');

    expect(invoke).toHaveBeenCalledWith('ensure_space_access', {
      path: '/Users/someone-else/Documents/Notes',
    });
  });

  it('never throws: a Space that cannot be granted opens exactly as it did', async () => {
    invoke.mockRejectedValue('denied');

    await expect(
      ensureSpaceAccess('/Users/someone-else/Documents/Notes')
    ).resolves.toBeUndefined();
  });
});

describe('renameSpaceFolder', () => {
  it.each([
    [
      'inside the home directory',
      '/Users/someone-else/Projects/notes',
      '/Users/someone-else/Projects/Journal',
    ],
    [
      'inside Documents',
      '/Users/someone-else/Documents/notes',
      '/Users/someone-else/Documents/Journal',
    ],
    ['on an external drive', '/Volumes/Drive/notes', '/Volumes/Drive/Journal'],
    [
      'elsewhere outside the home directory',
      '/opt/shared/notes',
      '/opt/shared/Journal',
    ],
  ])(
    'renames a folder %s through the one command, with no location rule',
    async (_where, path, renamed) => {
      invoke.mockResolvedValue(renamed);

      expect(await renameSpaceFolder(path, '  Journal ')).toEqual({
        path: renamed,
      });

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('rename_space_folder', {
        path,
        newName: 'Journal',
      });
    }
  );

  it.each([
    '',
    '   ',
    '.',
    '..',
    '../escape',
    'a/b',
    'a\\b',
    'a:b',
    'a\u0000b',
    'x'.repeat(256),
  ])('refuses the name %j without calling the command', async (name) => {
    expect(
      await renameSpaceFolder('/Users/someone-else/Projects/notes', name)
    ).toEqual({
      error: 'Enter a name without slashes or colons',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('says a taken name is taken, whatever the folder is called, and returns no path', async () => {
    invoke.mockRejectedValue('File exists (os error 17)');

    expect(await renameSpaceFolder('/Volumes/Drive/notes', 'Taken')).toEqual({
      error: 'A folder with that name already exists. Choose another name',
    });
  });

  it("reports the operating system's own permission refusal, outside the home directory too", async () => {
    invoke.mockRejectedValue('Permission denied (os error 13)');

    const result = await renameSpaceFolder('/Volumes/Drive/notes', 'Journal');

    expect(result).toEqual({
      error: expect.stringContaining(
        'doesn’t have permission to rename a folder in Drive'
      ),
    });
    expect('path' in result).toBe(false);
  });

  it('reports a folder with no grant as one Clutter is not allowed to rename', async () => {
    invoke.mockRejectedValue('forbidden path: /private/elsewhere/notes');

    expect(
      await renameSpaceFolder('/private/elsewhere/notes', 'Journal')
    ).toEqual({
      error: 'Clutter isn’t allowed to rename that folder',
    });
  });

  it('reports a folder that is gone, and any other failure with its own message', async () => {
    invoke.mockRejectedValueOnce('No such file or directory (os error 2)');
    expect(await renameSpaceFolder('/Volumes/Drive/notes', 'Journal')).toEqual({
      error: 'That folder could not be found',
    });

    invoke.mockRejectedValueOnce(
      new Error('Read-only file system (os error 30)')
    );
    expect(await renameSpaceFolder('/Volumes/Drive/notes', 'Journal')).toEqual({
      error: 'Couldn’t rename the folder: Read-only file system (os error 30)',
    });
  });
});

describe('isReachedThroughLink', () => {
  it('is true when the real path differs from the one given (a link in the way)', async () => {
    invoke.mockResolvedValue('/private/tmp/Notes');

    expect(await isReachedThroughLink('/tmp/Notes')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('canonical_space_path', { path: '/tmp/Notes' });
  });

  it.each([
    ['the same path', '/Users/me/Notes', '/Users/me/Notes'],
    ['a trailing slash', '/Users/me/Notes/', '/Users/me/Notes'],
    ['only letter case differing, on a case-insensitive volume', '/Users/me/notes', '/Users/me/Notes'],
  ])('is false for %s', async (_name, given, resolved) => {
    invoke.mockResolvedValue(resolved);

    expect(await isReachedThroughLink(given)).toBe(false);
  });

  it('is false when the path cannot be resolved or the answer is not a path: opening reports its own problem', async () => {
    invoke.mockRejectedValue('No such file or directory (os error 2)');
    expect(await isReachedThroughLink('/Users/me/Missing')).toBe(false);

    invoke.mockResolvedValue(undefined);
    expect(await isReachedThroughLink('/Users/me/Notes')).toBe(false);
  });
});
