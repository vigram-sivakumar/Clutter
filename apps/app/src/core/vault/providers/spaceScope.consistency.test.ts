import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The folder probe (what the Space list and a switch ask first) and the native filesystem check (what
 * `Application.bootstrap` asks next) must give one answer about a Space's access. The probe's `stat`/`readDir` reach
 * everything under the static `$HOME/**` capability; the native commands answer only for the runtime scope the user's
 * own choices built. These tests run the real probe and the real open-time check against a small model of the native
 * side, so a Space can never look available to the first and be refused by the second.
 *
 * The model mirrors the Rust it stands for: `check_space_filesystem` resolves the folder and refuses one outside the
 * granted scope (`outOfScope`); `ensure_space_access` grants only a real (not linked) direct child of Documents that
 * holds a `.clutter` marker, and nothing else (`space_folder::ensure_space_access_in`). Those two are tested in Rust.
 */
const tauri = vi.hoisted(() => ({ isTauri: true }));
const DOCUMENTS = '/Users/me/Documents';

interface NativeWorld {
  /** Folders that exist (the plugin's `stat` sees all of them: `$HOME/**` is static scope). */
  existing: Set<string>;
  /** The runtime scope: every folder granted recursively by a picker, Create, rename, a restored bookmark… */
  granted: Set<string>;
  /** Folders holding a `.clutter` marker. */
  marked: Set<string>;
  /** A symbolic link's spelling mapped to the real folder it leads to. */
  links: Map<string, string>;
}
const world = vi.hoisted(
  (): NativeWorld => ({ existing: new Set(), granted: new Set(), marked: new Set(), links: new Map() })
);

const canonical = (path: string) => world.links.get(path) ?? path;
const covered = (path: string) =>
  [...world.granted].some((folder) => path === folder || path.startsWith(`${folder}/`));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri.isTauri,
  invoke: async (command: string, args: { path: string }) => {
    if (command === 'check_space_filesystem') {
      if (!world.existing.has(args.path)) throw { code: 'invalidPath', detail: 'the folder cannot be resolved' };
      if (!covered(canonical(args.path))) {
        throw { code: 'outOfScope', detail: 'the folder is not inside the approved filesystem scope' };
      }
      return { status: 'supported', filesystem: 'apfs' };
    }
    if (command === 'ensure_space_access') {
      const real = canonical(args.path);
      const isLink = world.links.has(args.path);
      const directChildOfDocuments = args.path.startsWith(`${DOCUMENTS}/`) && !args.path.slice(DOCUMENTS.length + 1).includes('/');
      if (covered(real) || isLink || !directChildOfDocuments || !world.marked.has(args.path)) return false;
      world.granted.add(args.path);
      return true;
    }
    return undefined;
  },
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: async (path: string) => {
    if (!world.existing.has(path)) throw 'No such file or directory (os error 2)';
    return { isDirectory: true };
  },
  readDir: async () => [],
}));

import { probeSpaceFolder } from './probeSpaceFolder';
import { resetSandboxAccessForTests } from './sandboxAccess';
import {
  assertSpaceFilesystemSupported,
  folderNeedsReselect,
  SpaceFilesystemRefusedError,
} from './spaceFolders';

function space(path: string, options: { marker?: boolean; grant?: boolean } = {}) {
  world.existing.add(path);
  if (options.marker ?? true) world.marked.add(path);
  if (options.grant) world.granted.add(path);
  return path;
}

/** The open-time check, as `Application.bootstrap` runs it: `null` when it passes, else the refusal's kind. */
async function openCheck(path: string): Promise<string | null> {
  try {
    await assertSpaceFilesystemSupported(path);
    return null;
  } catch (error) {
    if (error instanceof SpaceFilesystemRefusedError) return error.kind;
    throw error;
  }
}

beforeEach(() => {
  tauri.isTauri = true;
  world.existing.clear();
  world.granted.clear();
  world.marked.clear();
  world.links.clear();
  world.existing.add(DOCUMENTS);
  resetSandboxAccessForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the folder probe and the native check agree about a Space’s access', () => {
  it('a Space nested inside a folder the user authorised is available to both', async () => {
    world.granted.add(`${DOCUMENTS}/Work`); // the picker's recursive grant, restored by the persisted scope
    const nested = space(`${DOCUMENTS}/Work/Clients/Acme`);

    expect(await probeSpaceFolder(nested)).toBe('available');
    expect(await openCheck(nested)).toBeNull();
  });

  it('a Space with a missing runtime grant that is recoverable is restored before either answers', async () => {
    const legacy = space(`${DOCUMENTS}/Legacy`); // made before Create granted: only a marked direct child recovers

    expect(world.granted.has(legacy)).toBe(false);
    expect(await probeSpaceFolder(legacy)).toBe('available');
    expect(await openCheck(legacy)).toBeNull();
    expect([...world.granted]).toEqual([legacy]); // exactly that folder, nothing wider
  });

  it.each([
    ['inside $HOME, never granted', '/Users/me/Projects/Notes', {}],
    ['nested under Documents, never granted (not a direct child)', `${DOCUMENTS}/Personal/Vault`, {}],
    ['a direct child of Documents with no .clutter marker', `${DOCUMENTS}/Unmarked`, { marker: false }],
    ['outside the authorised scope', '/Volumes/Other/Notes', {}],
  ])('a Space %s needs its folder selected again, to both, and nothing is granted for it', async (_name, path, options) => {
    space(path, options);

    expect(await probeSpaceFolder(path)).toBe('missing');
    expect(await openCheck(path)).toBe('needsReselect');
    expect(await folderNeedsReselect(path)).toBe(true);
    expect(world.granted.size).toBe(0);
  });

  it('a symlinked folder is judged by where it leads, and is never granted because of where it is spelt', async () => {
    const target = space('/Users/me/Elsewhere/Real');
    const link = `${DOCUMENTS}/Link`;
    world.existing.add(link);
    world.marked.add(link);
    world.links.set(link, target);

    expect(await probeSpaceFolder(link)).toBe('missing');
    expect(await openCheck(link)).toBe('needsReselect');
    expect(world.granted.size).toBe(0);

    // A link into a folder the user did authorise is judged by that target: authorised through its real place.
    world.granted.add(target);
    expect(await probeSpaceFolder(link)).toBe('available');
    expect(await openCheck(link)).toBeNull();
  });

  it('a link whose spelling lies inside a granted folder but leads outside it is refused by both', async () => {
    world.granted.add(`${DOCUMENTS}/Work`);
    const outside = space('/Users/me/Elsewhere/Secret');
    const link = `${DOCUMENTS}/Work/Shortcut`;
    world.existing.add(link);
    world.links.set(link, outside);

    expect(await probeSpaceFolder(link)).toBe('missing');
    expect(await openCheck(link)).toBe('needsReselect');
  });

  it('a stale grant does not follow a folder that was renamed or moved outside the app', async () => {
    // The persisted-scope record still names the old path…
    const old = space(`${DOCUMENTS}/Work/Old`, { grant: true });
    // …but the folder was renamed in Finder: the old path is gone and the new one was never granted.
    world.existing.delete(old);
    const renamed = space(`${DOCUMENTS}/Work/Renamed`);

    expect(await probeSpaceFolder(old)).toBe('missing'); // confirmed gone: the existing "not found" flow
    expect(await folderNeedsReselect(old)).toBe(false); // …and never mistaken for a reselect
    expect(await probeSpaceFolder(renamed)).toBe('missing');
    expect(await openCheck(renamed)).toBe('needsReselect');

    // The user selects the folder again: the picker grants exactly that folder, and both agree.
    world.granted.add(renamed);
    expect(await probeSpaceFolder(renamed)).toBe('available');
    expect(await openCheck(renamed)).toBeNull();
  });

  it('answers the same across a switch from Space A to Space B: B’s refusal says why and A is unaffected', async () => {
    const a = space(`${DOCUMENTS}/A`, { grant: true });
    const b = space('/Users/me/Projects/B');

    expect(await probeSpaceFolder(a)).toBe('available');
    expect(await probeSpaceFolder(b)).toBe('missing');
    expect(await openCheck(b)).toBe('needsReselect');
    // Refusing B changed nothing about A.
    expect(await probeSpaceFolder(a)).toBe('available');
    expect(await openCheck(a)).toBeNull();
  });

  it('a name check never needs access: a rename’s destination is "taken" whether or not it is granted', async () => {
    const taken = space('/Users/me/Projects/Taken');

    expect(await probeSpaceFolder(taken, { requireAccess: false })).toBe('available');
    expect(await probeSpaceFolder(taken)).toBe('missing');
  });

  it('answers a Space the probe finds unreadable or absent as it always did, without asking the native side', async () => {
    expect(await probeSpaceFolder('/Users/me/Gone')).toBe('missing');
    expect(await folderNeedsReselect('/Users/me/Gone')).toBe(false); // invalidPath is not a missing grant
  });

  it('in the web runtime nothing is checked and everything is available', async () => {
    tauri.isTauri = false;
    expect(await probeSpaceFolder('/web-dev-vault')).toBe('available');
  });
});
