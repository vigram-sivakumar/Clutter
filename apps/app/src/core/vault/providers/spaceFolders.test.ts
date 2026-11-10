import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/someone-else/Documents/',
  homeDir: async () => '/Users/someone-else/',
}));

import {
  assertSpaceFilesystemSupported,
  createSpaceFolder,
  folderNeedsReselect,
  isOutsideApprovedScope,
  needsReselectOpenedSpaceMessage,
  SpaceFilesystemRefusedError,
  isTooBroadForSpace,
  ensureSpaceAccess,
  isReachedThroughLink,
  checkSpaceFilesystem,
  describeFilesystem,
  ensureRenameParentAccess,
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
    ['Permission denied (os error 13)', 'Allow access in Settings → Privacy & Security → Files and Folders and try again'],
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

describe('createSpaceFolder: a create macOS refuses for permission', () => {
  // `sandboxInfo` caches its answer for the process, so it is reset between builds.
  async function createAs(sandboxed: boolean, reason: string) {
    const { resetSandboxAccessForTests } = await import('./sandboxAccess');
    resetSandboxAccessForTests();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'sandbox_info') return { sandboxed, realHome: null, documents: '/Users/someone-else/Documents' };
      throw reason;
    });
    return createSpaceFolder('Personal');
  }

  it.each(['Permission denied (os error 13)', 'Operation not permitted (os error 1)'])(
    'tells a sandboxed user to try again (%s): pressing Create asks for Documents again',
    async (reason) => {
      expect(await createAs(true, reason)).toEqual({ error: 'Unable to create folder. Try again' });
    }
  );

  it('tells an unsandboxed user to allow access in Settings: macOS asks only once', async () => {
    expect(await createAs(false, 'Permission denied (os error 13)')).toEqual({
      error: 'Unable to create folder. Allow access in Settings → Privacy & Security → Files and Folders and try again',
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

describe('ensureRenameParentAccess', () => {
  it('returns notNeeded when the sandbox is off', async () => {
    invoke.mockResolvedValueOnce({ status: 'notSandboxed' });
    expect(await ensureRenameParentAccess('/Volumes/Drive/notes')).toBe('notNeeded');
    expect(invoke).toHaveBeenCalledWith('check_rename_parent_access', { path: '/Volumes/Drive/notes' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('returns granted when parent access is already active', async () => {
    invoke.mockResolvedValueOnce({ status: 'granted' });
    expect(await ensureRenameParentAccess('/Volumes/Drive/notes')).toBe('granted');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('asks for parent access when needed and returns cancelled without renaming', async () => {
    invoke.mockResolvedValueOnce({ status: 'needed' });
    invoke.mockResolvedValueOnce({ status: 'cancelled' });
    expect(await ensureRenameParentAccess('/Volumes/Drive/notes')).toBe('cancelled');
    expect(invoke).toHaveBeenNthCalledWith(2, 'request_rename_parent_access', {
      path: '/Volumes/Drive/notes',
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
      error: 'Folder already exists',
    });
  });

  it("reports the operating system's own permission refusal, outside the home directory too", async () => {
    invoke.mockRejectedValue('Permission denied (os error 13)');

    const result = await renameSpaceFolder('/Volumes/Drive/notes', 'Journal');

    expect(result).toEqual({
      error: expect.stringContaining(
        'Unable to rename. Rename it in Finder instead'
      ),
    });
    expect('path' in result).toBe(false);
  });

  it.each(['Permission denied (os error 13)', 'Operation not permitted (os error 1)'])(
    'points a refused rename (%s) at Finder, not at System Settings',
    async (reason) => {
      invoke.mockRejectedValue(reason);

      expect(await renameSpaceFolder('/Volumes/Drive/notes', 'Journal')).toEqual({
        error:
          'Unable to rename. Rename it in Finder instead',
      });
    }
  );

  it('keeps its own message for a rename failure that is not a permission refusal', async () => {
    invoke.mockRejectedValue('Disk quota exceeded (os error 122)');

    expect(await renameSpaceFolder('/Volumes/Drive/notes', 'Journal')).toEqual({
      error: 'Couldn’t rename the folder: Disk quota exceeded (os error 122)',
    });
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

describe('checkSpaceFilesystem', () => {
  it('asks the native writer\'s own volume check about the folder', async () => {
    invoke.mockResolvedValue({ status: 'supported', filesystem: 'apfs' });

    expect(await checkSpaceFilesystem('/Users/me/Notes')).toEqual({ status: 'supported', filesystem: 'apfs' });
    expect(invoke).toHaveBeenCalledWith('check_space_filesystem', { path: '/Users/me/Notes' });
  });

  it('reports a volume that is not supported, with the system\'s name for it', async () => {
    invoke.mockResolvedValue({ status: 'unsupported', filesystem: 'exfat' });

    expect(await checkSpaceFilesystem('/Volumes/Stick/Notes')).toEqual({ status: 'unsupported', filesystem: 'exfat' });
  });

  it.each([
    ['the command fails', () => invoke.mockRejectedValue({ code: 'volumeUnreadable', detail: 'Input/output error' })],
    ['the command is not there', () => invoke.mockRejectedValue('Command check_space_filesystem not found')],
    ['there is no answer', () => invoke.mockResolvedValue(undefined)],
    ['the answer is not an object', () => invoke.mockResolvedValue('supported')],
    ['the status is not one it knows', () => invoke.mockResolvedValue({ status: 'maybe', filesystem: 'apfs' })],
    ['the volume is missing from the answer', () => invoke.mockResolvedValue({ status: 'supported' })],
  ])('is unknown, never supported, when %s — and never throws', async (_name, arrange) => {
    arrange();

    expect(await checkSpaceFilesystem('/Volumes/Stick/Notes')).toEqual({ status: 'unknown' });
  });
});

describe('checkSpaceFilesystem: a folder outside the granted scope', () => {
  const OUT_OF_SCOPE = { code: 'outOfScope', detail: 'the folder is not inside the approved filesystem scope' };

  it('is reported as its own answer, not as unknown: it is the one refusal the user can recover from', async () => {
    invoke.mockRejectedValue(OUT_OF_SCOPE);

    expect(await checkSpaceFilesystem('/Users/me/Projects/Notes')).toEqual({ status: 'outOfScope' });
  });

  it('is not guessed from other refusals or from a message that merely mentions the scope', async () => {
    for (const rejection of [
      { code: 'invalidPath', detail: 'the folder cannot be resolved' },
      { code: 'unauthorizedWindow', detail: 'x' },
      'the folder is not inside the approved filesystem scope',
      new Error('outOfScope'),
    ]) {
      invoke.mockRejectedValue(rejection);
      expect(await checkSpaceFilesystem('/x')).toEqual({ status: 'unknown' });
    }
  });
});

describe('assertSpaceFilesystemSupported: access that is gone', () => {
  it('throws the distinct needsReselect refusal, with a message that tells the user what to do', async () => {
    invoke.mockRejectedValue({ code: 'outOfScope', detail: 'd' });

    const error = await assertSpaceFilesystemSupported('/Users/me/Projects/Notes/').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
    expect((error as SpaceFilesystemRefusedError).kind).toBe('needsReselect');
    expect((error as Error).message).toBe(needsReselectOpenedSpaceMessage('/Users/me/Projects/Notes/'));
    expect((error as Error).message).toBe('Couldn’t open “Notes”: select its folder again');
  });
});

describe('isOutsideApprovedScope and folderNeedsReselect', () => {
  const OUT_OF_SCOPE = { code: 'outOfScope', detail: 'd' };
  const commands = (check: () => unknown, grant: () => unknown = () => false) =>
    invoke.mockImplementation(async (command: string) => {
      if (command === 'ensure_space_access') return grant();
      if (command === 'check_space_filesystem') return check();
      return undefined;
    });

  it('restores what can be restored first, then asks the native check, in that order', async () => {
    const order: string[] = [];
    commands(
      () => {
        order.push('check');
        throw OUT_OF_SCOPE;
      },
      () => {
        order.push('grant');
        return false;
      }
    );

    expect(await isOutsideApprovedScope('/Users/me/Notes')).toBe(true);
    expect(order).toEqual(['grant', 'check']);
  });

  it('is false once the grant made the folder reachable, and for a folder on any supported or unsupported volume', async () => {
    commands(() => ({ status: 'supported', filesystem: 'apfs' }), () => true);
    expect(await isOutsideApprovedScope('/Users/me/Documents/Notes')).toBe(false);
    commands(() => ({ status: 'unsupported', filesystem: 'exfat' }));
    expect(await isOutsideApprovedScope('/Volumes/Stick/Notes')).toBe(false);
  });

  it('is still true after a failed grant: a grant that failed is never taken for permission', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'ensure_space_access') throw 'denied';
      throw { code: 'outOfScope', detail: 'd' };
    });

    expect(await isOutsideApprovedScope('/Users/me/Notes')).toBe(true);
  });

  it.each([
    ['the folder cannot be resolved', { code: 'invalidPath', detail: 'd' }],
    ['the volume cannot be read', { code: 'volumeUnreadable', detail: 'd' }],
    ['the command is missing', 'Command check_space_filesystem not found'],
  ])('is false when %s: only an outOfScope refusal is a missing grant', async (_name, rejection) => {
    commands(() => {
      throw rejection;
    });

    expect(await isOutsideApprovedScope('/Users/me/Notes')).toBe(false);
    expect(await folderNeedsReselect('/Users/me/Notes')).toBe(false);
  });

  it('folderNeedsReselect is true for a folder the sandbox could not restore, without asking the native side', async () => {
    const { restoreSpaceAccess, resetSandboxAccessForTests } = await import('./sandboxAccess');
    resetSandboxAccessForTests();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'restore_space_access') return [{ path: '/Volumes/Work/Notes', status: 'needsReselect' }];
      throw new Error(`unexpected command ${command}`);
    });
    await restoreSpaceAccess();
    invoke.mockClear();

    expect(await folderNeedsReselect('/Volumes/Work/Notes')).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    resetSandboxAccessForTests();
  });
});

describe('describeFilesystem', () => {
  it.each([
    ['exfat', 'an exFAT drive'],
    ['msdos', 'a FAT drive'],
    ['hfs', 'a Mac OS Extended (HFS+) drive'],
    ['smbfs', 'a network share (SMB)'],
    ['', 'a drive in an unrecognized format'],
    ['zfs', 'a drive formatted as zfs'],
  ])('names %j as %j', (filesystem, expected) => {
    expect(describeFilesystem(filesystem)).toBe(expected);
  });
});

describe('in the App Sandbox', () => {
  const SANDBOX = { sandboxed: true, realHome: '/Users/real', documents: '/Users/real/Documents' };

  beforeEach(async () => {
    const { resetSandboxAccessForTests } = await import('./sandboxAccess');
    resetSandboxAccessForTests();
  });

  function answer(commands: Record<string, (args: unknown) => unknown>) {
    invoke.mockImplementation(async (command: string, args: unknown) => {
      const handler = commands[command];
      if (!handler) throw new Error(`unexpected command ${command}`);
      return handler(args);
    });
  }

  it("names the user's real Documents and home, not the container's", async () => {
    answer({ sandbox_info: () => SANDBOX });
    expect(await resolveSpaceParent()).toEqual({ path: '/Users/real/Documents', name: 'Documents' });
    expect(await isTooBroadForSpace('/Users/real')).toBe(true);
    expect(await isTooBroadForSpace('/Users/real/Documents')).toBe(false);
  });

  it('asks once for Documents at the first Create, then creates the folder', async () => {
    let authorized = false;
    answer({
      sandbox_info: () => SANDBOX,
      create_space_folder: () => {
        if (!authorized) throw 'documentsAccessNeeded';
        return '/Users/real/Documents/Personal';
      },
      request_documents_access: () => {
        authorized = true;
        return { status: 'granted' };
      },
    });

    expect(await createSpaceFolder('Personal')).toEqual({ path: '/Users/real/Documents/Personal' });
    expect(invoke.mock.calls.filter(([command]) => command === 'request_documents_access')).toHaveLength(1);

    // Later creations need no prompt.
    invoke.mockClear();
    await createSpaceFolder('Work');
    expect(invoke.mock.calls.filter(([command]) => command === 'request_documents_access')).toHaveLength(0);
  });

  it.each([
    ['cancelled', { status: 'cancelled' }, { cancelled: true }],
    // Another folder (a subfolder of Documents included) is the user's own choice: handed back to be opened, not
    // rejected, and nothing is created in it.
    ['another folder', { status: 'otherFolder', path: '/Users/real/Documents/Notes' }, { openFolder: '/Users/real/Documents/Notes' }],
    ['a folder elsewhere', { status: 'otherFolder', path: '/Volumes/Drive/notes' }, { openFolder: '/Volumes/Drive/notes' }],
  ])('creates nothing when the authorization ends as %s', async (_name, result, outcome) => {
    answer({
      sandbox_info: () => SANDBOX,
      create_space_folder: () => {
        throw 'documentsAccessNeeded';
      },
      request_documents_access: () => result,
    });

    expect(await createSpaceFolder('Personal')).toEqual(outcome);
    // The folder was asked for once, before the prompt, and never again.
    expect(invoke.mock.calls.filter(([command]) => command === 'create_space_folder')).toHaveLength(1);
  });
});
