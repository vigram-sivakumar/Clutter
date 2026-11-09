import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opening an ordinary folder as a Space (desktop). A small fake disk stands in for the file system, and a fake native
 * side enforces the same rule the Rust writer does: no atomic write to a root that has no `.clutter` directory.
 */
const world = vi.hoisted(() => {
  const state = {
    isTauri: true,
    files: new Map<string, string>(),
    dirs: new Set<string>(),
    /** Every `atomic_write_file` request that reached the fake native writer, as `{path}`. */
    writes: [] as { path: string; contents: string }[],
    /** Every refusal the fake native writer gave. */
    refusals: [] as string[],
    commands: [] as string[],
    initialize: undefined as unknown as (args: { path: string }) => unknown,
  };
  return state;
});

const ROOT = '/Users/me/Existing';
const MARKER = `${ROOT}/.clutter`;

function children(dir: string): { name: string; isDirectory: boolean }[] {
  const out = new Map<string, boolean>();
  for (const path of world.dirs) {
    if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) out.set(path.slice(dir.length + 1), true);
  }
  for (const path of world.files.keys()) {
    if (path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')) out.set(path.slice(dir.length + 1), false);
  }
  return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
}

const notFound = 'No such file (os error 2)';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => world.isTauri,
  invoke: async (command: string, args: Record<string, any>) => {
    world.commands.push(command);
    switch (command) {
      case 'check_space_filesystem':
        return { status: 'supported', filesystem: 'apfs' };
      case 'ensure_space_access':
        return true;
      case 'restore_space_access':
        return [];
      case 'initialize_space':
        return world.initialize(args as { path: string });
      case 'create_directory':
        world.dirs.add(args.path as string);
        return undefined;
      case 'atomic_inspect_write': {
        if (!world.dirs.has(`${args.request.vaultRoot}/.clutter`)) {
          throw { code: 'invalidVaultRoot', detail: 'the vault root has no `.clutter` directory' };
        }
        return { status: 'inspected', target: 'missing', temps: [] };
      }
      case 'atomic_write_file': {
        const { vaultRoot, path, contents } = args.request as { vaultRoot: string; path: string; contents: string };
        if (!world.dirs.has(`${vaultRoot}/.clutter`)) {
          world.refusals.push(path);
          throw { code: 'invalidVaultRoot', detail: 'the vault root has no `.clutter` directory' };
        }
        const replaced = world.files.has(path) ? 'existing' : 'created';
        world.writes.push({ path, contents });
        world.files.set(path, contents);
        return { status: 'committed', replaced, durability: { status: 'confirmed' }, confirmedByInspection: false, metadataNotes: [], leftovers: [] };
      }
      default:
        return undefined;
    }
  },
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => world.files.has(path) || world.dirs.has(path),
  readDir: async (path: string) => {
    if (!world.dirs.has(path)) throw notFound;
    return children(path).map((entry) => ({ ...entry, isFile: !entry.isDirectory, isSymlink: false }));
  },
  readTextFile: async (path: string) => {
    const contents = world.files.get(path);
    if (contents === undefined) throw notFound;
    return contents;
  },
  readFile: async (path: string) => {
    const contents = world.files.get(path);
    if (contents === undefined) throw notFound;
    return new TextEncoder().encode(contents);
  },
  stat: async (path: string) => {
    if (!world.files.has(path) && !world.dirs.has(path)) throw notFound;
    return { size: world.files.get(path)?.length ?? 0, birthtime: new Date(0), mtime: new Date(0), isDirectory: world.dirs.has(path) };
  },
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('../vault/providers/probeSpaceFolder', () => ({
  probeSpaceFolder: async () => 'available',
  isFolderConfirmedMissing: async () => false,
  isNotFoundError: (error: unknown) => typeof error === 'string' && /No such file/.test(error),
}));

import { Application } from './Application';
import { serializeTagMetadataFile } from '../vault/persistence/tagMetadataFile';
import { SpaceInitializationError } from '../vault/initialize/initializeSpace';
import { resetSandboxAccessForTests } from '../vault/providers/sandboxAccess';

/** What a real `initialize_space` does, on the fake disk (the Rust side is tested in `atomic_commands.rs`). */
function nativeInitialize({ path }: { path: string }) {
  if (world.dirs.has(`${path}/.clutter`)) return { status: 'existing' };
  world.dirs.add(`${path}/.clutter`);
  return { status: 'initialized' };
}

const ARCHIVED_NOTE = '---\nstatus: archived\n---\nA note from another app that happens to say archived.\n';
const PLAIN_NOTE = '# Plain\n\nNo frontmatter at all.\n';

function ordinaryFolder() {
  world.dirs.add('/Users/me');
  world.dirs.add(ROOT);
  world.dirs.add(`${ROOT}/Nested`);
  world.dirs.add(`${ROOT}/Archive`);
  world.files.set(`${ROOT}/foreign.md`, ARCHIVED_NOTE);
  world.files.set(`${ROOT}/Nested/plain.md`, PLAIN_NOTE);
  world.files.set(`${ROOT}/Nested/data.bin`, 'binary-ish');
  world.files.set(`${ROOT}/.hidden`, 'hidden');
}

const open = () => Application.bootstrap(ROOT, undefined, { parsedNoteCacheBackend: null, recoveryStorage: null });

function snapshot() {
  return {
    files: new Map(world.files),
    dirs: new Set(world.dirs),
  };
}

beforeEach(() => {
  world.isTauri = true;
  world.files.clear();
  world.dirs.clear();
  world.writes.length = 0;
  world.refusals.length = 0;
  world.commands.length = 0;
  world.initialize = nativeInitialize;
  resetSandboxAccessForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Application.bootstrap: an ordinary folder becomes a Space', () => {
  it('initializes first, then opens it, changing nothing in the folder except creating .clutter', async () => {
    ordinaryFolder();
    const before = snapshot();

    const application = await open();

    // Every file is byte for byte as it was, nothing was written through the atomic writer, and nothing was refused.
    expect(world.files).toEqual(before.files);
    expect(world.writes).toEqual([]);
    expect(world.refusals).toEqual([]);
    // The only new entry on the disk is the `.clutter` directory, and it is empty.
    expect([...world.dirs].filter((dir) => !before.dirs.has(dir))).toEqual([MARKER]);
    expect([...world.files.keys()].filter((file) => file.startsWith(MARKER))).toEqual([]);
    // Nothing was removed or renamed.
    for (const dir of before.dirs) expect(world.dirs.has(dir)).toBe(true);

    expect(application.vault.root).toBe(ROOT);
  });

  it('initializes after authorization and before anything is scanned', async () => {
    ordinaryFolder();

    await open();

    const calls = world.commands;
    expect(calls.indexOf('ensure_space_access')).toBeLessThan(calls.indexOf('initialize_space'));
    expect(calls.indexOf('check_space_filesystem')).toBeLessThan(calls.indexOf('initialize_space'));
    expect(calls.filter((command) => command === 'initialize_space')).toHaveLength(1);
  });

  it('still does everything else a bootstrap does on the first open: the folder is scanned and fully built', async () => {
    ordinaryFolder();

    const application = await open();

    // Every note is in the Vault (the foreign note keeps the status it was written with), and the folder tree is built.
    expect(application.vault.getPageByPath(`${ROOT}/foreign.md`)).toBeDefined();
    expect(application.vault.getPageByPath(`${ROOT}/Nested/plain.md`)).toBeDefined();
    expect(application.vault.getFolderByPath(`${ROOT}/Nested`)).toBeDefined();
    // The Application is wired to the atomic provider, not left half built: a later write succeeds because `.clutter` is there.
    expect(world.dirs.has(MARKER)).toBe(true);
  });

  it('runs the startup repairs on later opens, once the folder is already a Space (nothing was skipped for good)', async () => {
    ordinaryFolder();
    await open();
    expect(world.writes).toEqual([]);

    await open();

    // The foreign note carries `status: archived` outside Archive/: the normal repair now runs, as for any Space.
    expect(world.writes.map((write) => write.path)).toContain(`${ROOT}/foreign.md`);
    expect(world.refusals).toEqual([]);
  });

  it('reuses an existing Space without re-initializing or touching anything inside .clutter', async () => {
    ordinaryFolder();
    world.dirs.add(MARKER);
    world.dirs.add(`${MARKER}/sub`);
    world.files.set(`${MARKER}/workspace.json`, '{"space":{"id":"keep-me"},"custom":[1,2,3]}');
    const tags = serializeTagMetadataFile(new Map([['work', { favorite: true }]]));
    world.files.set(`${MARKER}/tags.json`, tags);
    world.files.set(`${MARKER}/sub/state`, 'state');
    const clutterBefore = [...world.files].filter(([path]) => path.startsWith(MARKER));

    await open();
    await open();

    expect([...world.files].filter(([path]) => path.startsWith(MARKER))).toEqual(clutterBefore);
    expect(world.files.get(`${MARKER}/workspace.json`)).toBe('{"space":{"id":"keep-me"},"custom":[1,2,3]}');
    expect(world.files.get(`${MARKER}/tags.json`)).toBe(tags);
    expect(world.files.get(`${MARKER}/sub/state`)).toBe('state');
  });

  it('opens an empty folder', async () => {
    world.dirs.add('/Users/me');
    world.dirs.add(ROOT);

    const application = await open();

    expect(application.vault.root).toBe(ROOT);
    expect([...world.dirs].sort()).toEqual(['/Users/me', ROOT, MARKER].sort());
    expect(world.files.size).toBe(0);
  });
});

describe('Application.bootstrap: an unsuccessful initialization is never a Space', () => {
  it.each([
    ['the native command refuses', () => { throw { code: 'outOfScope', detail: 'not in scope' }; }],
    ['the native command rejects with text', () => { throw 'boom'; }],
    ['the answer is empty', () => undefined],
    ['the answer is unknown', () => ({ status: 'maybe' })],
    ['the answer is not an object', () => 'initialized'],
  ])('stops the open when %s, before anything is scanned or written', async (_name, answer) => {
    ordinaryFolder();
    world.initialize = answer as typeof world.initialize;
    const before = snapshot();

    const error = await open().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpaceInitializationError);
    expect(world.files).toEqual(before.files);
    expect(world.dirs).toEqual(before.dirs);
    expect(world.writes).toEqual([]);
  });

  it('puts the native refusal in the error detail, not in the user-facing message', async () => {
    ordinaryFolder();
    world.initialize = () => {
      throw { code: 'invalidVaultRoot', detail: '`.clutter` is a file' };
    };

    const error = (await open().catch((e: unknown) => e)) as SpaceInitializationError;

    expect(error.detail).toBe('invalidVaultRoot: `.clutter` is a file');
    expect(error.message).not.toContain('invalidVaultRoot');
  });
});

describe('Application.bootstrap: the web runtime', () => {
  it('never calls initialize_space', async () => {
    world.isTauri = false;

    await Application.bootstrap('/vault', undefined, { parsedNoteCacheBackend: null, recoveryStorage: null });

    expect(world.commands).not.toContain('initialize_space');
  });
});
