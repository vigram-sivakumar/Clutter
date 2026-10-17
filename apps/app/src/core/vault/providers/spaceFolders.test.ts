import { beforeEach, describe, expect, it, vi } from 'vitest';

const mkdir = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ mkdir: (...args: unknown[]) => mkdir(...args) }));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/someone-else/Documents/',
  homeDir: async () => '/Users/someone-else/',
}));

import { createSpaceFolder, isTooBroadForSpace, resolveSpaceParent } from './spaceFolders';

beforeEach(() => {
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
  it.each(['/', '/Users', '/Users/', '/Users/someone-else', '/Users/someone-else/'])(
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
  ])('allows %j — ordinary folders anywhere, inside home or not', async (path) => {
    expect(await isTooBroadForSpace(path)).toBe(false);
  });
});

describe('createSpaceFolder', () => {
  it('creates a direct child of Documents, trimmed, without creating parents', async () => {
    expect(await createSpaceFolder('  Personal ')).toEqual({
      path: '/Users/someone-else/Documents/Personal',
    });
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledWith('/Users/someone-else/Documents/Personal', { recursive: false });
  });

  it.each(['', '   ', '.', '..', '../escape', '../../etc', 'a/b', '/abs', 'a\\b', 'a:b', 'a\u0000b', 'x'.repeat(256)])(
    'refuses the name %j and touches nothing',
    async (name) => {
      expect(await createSpaceFolder(name)).toEqual({ error: expect.stringContaining('Enter a name') });
      expect(mkdir).not.toHaveBeenCalled();
    }
  );

  it('reports a taken name instead of adopting or overwriting it', async () => {
    mkdir.mockRejectedValue('File exists (os error 17)');
    expect(await createSpaceFolder('Personal')).toEqual({ error: expect.stringContaining('already exists') });
  });

  it.each([
    ['Permission denied (os error 13)', "doesn't have permission"],
    ['forbidden path: /Users/someone-else/Documents/Personal', "isn't allowed"],
    ['No such file or directory (os error 2)', 'could not be found'],
    ['Disk quota exceeded (os error 122)', "Couldn't create the folder"],
  ])('describes the failure %j', async (reason, expected) => {
    mkdir.mockRejectedValue(reason);
    expect(await createSpaceFolder('Personal')).toEqual({ error: expect.stringContaining(expected) });
  });
});
