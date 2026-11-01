import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ isTauri: true }));
const fs = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));
const probe = vi.hoisted(() => ({ status: vi.fn() }));
/** Every native command the open makes, in order, so a test can see what ran before the refusal. */
const native = vi.hoisted(() => ({
  calls: [] as string[],
  /** Answers `check_space_filesystem`; a test overrides it per case. */
  classify: vi.fn(),
  /** Answers `ensure_space_access` (the runtime grant). */
  grant: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri.isTauri,
  invoke: async (command: string, args: unknown) => {
    native.calls.push(command);
    if (command === 'check_space_filesystem') return native.classify(args);
    if (command === 'ensure_space_access') return native.grant(args);
    return undefined;
  },
}));
vi.mock('@tauri-apps/plugin-fs', () => fs);
vi.mock('../vault/providers/probeSpaceFolder', () => ({
  probeSpaceFolder: (...args: unknown[]) => probe.status(...args),
  isFolderConfirmedMissing: async () => false,
  isNotFoundError: () => false,
}));

import { Application } from './Application';
import { VaultRootMissingError } from '../vault/providers/VaultRootMissingError';
import {
  SpaceFilesystemRefusedError,
  UNCHECKED_OPENED_SPACE_MESSAGE,
} from '../vault/providers/spaceFolders';

const ROOT = '/Volumes/Drive/Notes';

const apfs = { status: 'supported', filesystem: 'apfs' };
const exfat = { status: 'unsupported', filesystem: 'exfat' };

/** Nothing the app could write or build from a Space: reached only after the classification passed. */
function expectNothingWrittenOrScanned() {
  expect(fs.mkdir).not.toHaveBeenCalled();
  expect(fs.writeTextFile).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
  expect(fs.readDir).not.toHaveBeenCalled();
  expect(fs.readTextFile).not.toHaveBeenCalled();
}

beforeEach(() => {
  tauri.isTauri = true;
  Object.values(fs).forEach((mock) => mock.mockReset());
  probe.status.mockReset().mockResolvedValue('available');
  native.calls.length = 0;
  native.classify.mockReset().mockResolvedValue(apfs);
  native.grant.mockReset().mockResolvedValue(true);
  // Only the Space folder itself exists; every state file inside it is absent, as in a new Space.
  fs.exists.mockImplementation(async (path: string) => path === ROOT || path === `${ROOT}/`);
  fs.readDir.mockResolvedValue([]);
  fs.readTextFile.mockRejectedValue('No such file (os error 2)');
  fs.stat.mockRejectedValue('No such file (os error 2)');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const open = (root = ROOT) =>
  Application.bootstrap(root, undefined, { parsedNoteCacheBackend: null });

describe('Application.bootstrap: the Space’s filesystem is classified on every open', () => {
  it('opens a Space on APFS, as before', async () => {
    const application = await open();

    expect(application.vault.root).toBe(ROOT);
    expect(native.classify).toHaveBeenCalledWith({ path: ROOT });
    expect(fs.readDir).toHaveBeenCalled();
  });

  it('refuses a Space on a volume that is not APFS, before it is scanned or written', async () => {
    native.classify.mockResolvedValue(exfat);

    const error = await open().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
    expect((error as SpaceFilesystemRefusedError).kind).toBe('unsupported');
    expect((error as Error).message).toMatch(/can only save safely to APFS/);
    expectNothingWrittenOrScanned();
  });

  it.each([
    ['the native check rejects', () => native.classify.mockRejectedValue('command not found')],
    ['the answer is not one the app knows', () => native.classify.mockResolvedValue({ status: 'weird' })],
    ['the answer is empty', () => native.classify.mockResolvedValue(undefined)],
    [
      'the answer carries no volume name',
      () => native.classify.mockResolvedValue({ status: 'supported' }),
    ],
  ])('refuses a Space that cannot be classified (%s), never opening it by default', async (_name, arrange) => {
    arrange();

    const error = await open().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
    expect((error as SpaceFilesystemRefusedError).kind).toBe('unchecked');
    expect((error as Error).message).toBe(UNCHECKED_OPENED_SPACE_MESSAGE);
    expectNothingWrittenOrScanned();
  });

  it('classifies again on a reopen: a registered Space whose drive changed is refused the second time', async () => {
    native.classify.mockResolvedValueOnce(apfs).mockResolvedValueOnce(exfat);

    const first = await open();
    expect(first.vault.root).toBe(ROOT);
    fs.readDir.mockClear();

    const error = await open().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
    expect(native.classify).toHaveBeenCalledTimes(2);
    expect(fs.readDir).not.toHaveBeenCalled();
  });

  it('reports a missing folder as missing, not as an unsupported filesystem, and never classifies it', async () => {
    probe.status.mockResolvedValue('missing');
    native.classify.mockResolvedValue(exfat);

    const error = await open().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VaultRootMissingError);
    expect(error).not.toBeInstanceOf(SpaceFilesystemRefusedError);
    expect(native.classify).not.toHaveBeenCalled();
    expectNothingWrittenOrScanned();
  });

  it('grants runtime access before classifying, and classifies before anything else touches the folder', async () => {
    await open();

    const grant = native.calls.indexOf('ensure_space_access');
    const classify = native.calls.indexOf('check_space_filesystem');
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(classify).toBeGreaterThan(grant);
    // The probe (existence) comes first; the first read of the folder’s contents only after the classification.
    expect(probe.status.mock.invocationCallOrder[0]).toBeLessThan(
      native.classify.mock.invocationCallOrder[0]!
    );
    expect(fs.readDir.mock.invocationCallOrder[0]).toBeGreaterThan(
      native.classify.mock.invocationCallOrder[0]!
    );
  });

  describe('when the runtime access grant fails', () => {
    it('does not bypass the classification: an unsupported volume is still refused', async () => {
      native.grant.mockRejectedValue('not allowed');
      native.classify.mockResolvedValue(exfat);

      const error = await open().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
      expect(native.classify).toHaveBeenCalledOnce();
      expectNothingWrittenOrScanned();
    });

    it('does not bypass it: a folder outside the scope that therefore cannot be classified is refused', async () => {
      native.grant.mockRejectedValue('not allowed');
      native.classify.mockRejectedValue('path not allowed by the filesystem scope');

      const error = await open().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SpaceFilesystemRefusedError);
      expect((error as SpaceFilesystemRefusedError).kind).toBe('unchecked');
      expectNothingWrittenOrScanned();
    });

    it('still opens an APFS Space whose grant was simply not needed, as before', async () => {
      native.grant.mockRejectedValue('not a Documents child');

      const application = await open();

      expect(application.vault.root).toBe(ROOT);
    });
  });

  it('does not classify in the web runtime, which has no native volume', async () => {
    tauri.isTauri = false;
    native.classify.mockResolvedValue(exfat);

    const application = await open('/web-dev-vault');

    expect(application.vault.root).toBe('/web-dev-vault');
    expect(native.calls).toEqual([]);
  });
});
