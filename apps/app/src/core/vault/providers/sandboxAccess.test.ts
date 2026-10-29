import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const isTauri = vi.fn(() => true);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => isTauri(),
}));

import {
  needsFolderReselected,
  rememberSpaceAccess,
  requestDocumentsAccess,
  resetSandboxAccessForTests,
  restoreSpaceAccess,
  sandboxInfo,
} from './sandboxAccess';

beforeEach(() => {
  invoke.mockReset();
  isTauri.mockReturnValue(true);
  resetSandboxAccessForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sandboxInfo', () => {
  it('is null in the web runtime and when the native side cannot answer', async () => {
    isTauri.mockReturnValue(false);
    expect(await sandboxInfo()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();

    isTauri.mockReturnValue(true);
    resetSandboxAccessForTests();
    invoke.mockRejectedValue('boom');
    expect(await sandboxInfo()).toBeNull();
    resetSandboxAccessForTests();
    invoke.mockResolvedValue(undefined);
    expect(await sandboxInfo()).toBeNull();
  });

  it('is read once', async () => {
    invoke.mockResolvedValue({ sandboxed: true, realHome: '/Users/me', documents: '/Users/me/Documents' });
    await sandboxInfo();
    await sandboxInfo();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('restoreSpaceAccess', () => {
  it('remembers which folders need to be selected again, and never throws', async () => {
    invoke.mockResolvedValue([
      { path: '/Users/me/Documents', status: 'restored' },
      { path: '/Volumes/Work/Notes/', status: 'needsReselect' },
    ]);
    await restoreSpaceAccess();
    expect(needsFolderReselected('/Volumes/Work/Notes')).toBe(true);
    expect(needsFolderReselected('/Users/me/Documents')).toBe(false);

    invoke.mockRejectedValue('native failure');
    await expect(restoreSpaceAccess()).resolves.toEqual([]);
  });

  it('also covers a Space that lives inside a folder whose access could not be restored', async () => {
    invoke.mockResolvedValue([{ path: '/Users/me/Documents', status: 'needsReselect' }]);
    await restoreSpaceAccess();
    expect(needsFolderReselected('/Users/me/Documents/Personal')).toBe(true);
    expect(needsFolderReselected('/Users/me/Documents-old/Personal')).toBe(false);
    expect(needsFolderReselected('/Users/me/Desktop/Personal')).toBe(false);
  });

  it('does nothing in the web runtime', async () => {
    isTauri.mockReturnValue(false);
    expect(await restoreSpaceAccess()).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('rememberSpaceAccess', () => {
  it('rejects when the access could not be saved, so the folder is not accepted', async () => {
    invoke.mockRejectedValue('cannot save access');
    await expect(rememberSpaceAccess('/Users/me/Notes')).rejects.toBe('cannot save access');
  });

  it('clears a folder that needed selecting once it has been chosen again', async () => {
    invoke.mockResolvedValueOnce([{ path: '/Users/me/Notes', status: 'needsReselect' }]);
    await restoreSpaceAccess();
    expect(needsFolderReselected('/Users/me/Notes')).toBe(true);

    invoke.mockResolvedValueOnce(true);
    await rememberSpaceAccess('/Users/me/Notes');
    expect(invoke).toHaveBeenLastCalledWith('remember_space_access', { path: '/Users/me/Notes' });
    expect(needsFolderReselected('/Users/me/Notes')).toBe(false);
  });
});

describe('requestDocumentsAccess', () => {
  it('passes the native answer through', async () => {
    invoke.mockResolvedValue('cancelled');
    expect(await requestDocumentsAccess()).toBe('cancelled');
  });
});
