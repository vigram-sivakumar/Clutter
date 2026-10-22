import { beforeEach, describe, expect, it, vi } from 'vitest';

const mkdir = vi.fn();
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: (...args: unknown[]) => mkdir(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/someone-else/Documents/',
  homeDir: async () => '/Users/someone-else/',
}));

import {
  createSpaceFolder,
  isTooBroadForSpace,
  renameSpaceFolder,
  resolveSpaceParent,
} from './spaceFolders';

beforeEach(() => {
  invoke.mockReset();
  mkdir.mockReset();
  mkdir.mockResolvedValue(undefined);
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
  it('creates a direct child of Documents, trimmed, without creating parents', async () => {
    expect(await createSpaceFolder('  Personal ')).toEqual({
      path: '/Users/someone-else/Documents/Personal',
    });
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledWith(
      '/Users/someone-else/Documents/Personal',
      { recursive: false }
    );
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
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('reports a taken name instead of adopting or overwriting it', async () => {
    mkdir.mockRejectedValue('File exists (os error 17)');
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
    mkdir.mockRejectedValue(reason);
    expect(await createSpaceFolder('Personal')).toEqual({
      error: expect.stringContaining(expected),
    });
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
