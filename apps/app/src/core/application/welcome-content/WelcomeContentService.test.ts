import fs from 'node:fs';
import { AtomicWriteFileSystem } from '../../vault/atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../../vault/testing/InMemoryAtomicVaultWriter';
import type { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtomicNotCommittedError } from '../../vault/atomicWrite/atomicWriteErrors';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { WelcomeContentService, type WelcomeContentServiceDeps } from './WelcomeContentService';
import { MAX_INSTALL_ATTEMPTS, readWelcomeInstallLedger, writeWelcomeInstallLedger } from './WelcomeInstallLedger';
import type { WelcomeManifest } from './welcomeContentManifest';
import { welcomeInstallNotice } from './welcomeInstallNotice';
import {
  makeWelcomeRig,
  nodeShippedManifest,
  shippedFiles,
  SHIPPED_SOURCE_ROOT,
  SPACE_ROOT,
  type WelcomeRig,
} from './welcomeContentTestRig';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

/** The production write stack over the in-memory writer, which enforces create-only intent like the native one. */
const atomicStack = (disk: InMemoryVaultFileSystem) => {
  const writer = new InMemoryAtomicVaultWriter(disk);

  return { fileSystem: new AtomicWriteFileSystem(disk, writer), writer };
};
const makeRig = () => makeWelcomeRig(atomicStack);

beforeEach(() => {
  // The service reports each stop to the console on purpose; the tests assert the results, not the noise.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ADR-067: the install and its recovery contract (G1 to G6), against the real Gate, Vault and Sync over the
// production write stack, installing the actual shipped files.

const parser = new FrontmatterParser();
const idOf = (text: string) => String(parser.parse(text).frontmatter.id);
const abs = (rel: string) => `${SPACE_ROOT}/${rel}`;
const SHIPPED_NOTES = shippedFiles().filter(({ rel }) => rel.endsWith('.md') && !rel.endsWith('/.folder.md'));
const TOTAL_ENTRIES = nodeShippedManifest().entries.length;

function serviceFor(rig: WelcomeRig, overrides: Partial<WelcomeContentServiceDeps> = {}): WelcomeContentService {
  return new WelcomeContentService({
    vault: rig.vault,
    fileSystem: rig.fileSystem,
    rootPath: SPACE_ROOT,
    pageOperations: rig.application.pageOperations,
    folderOperations: rig.application.folderOperations,
    reconcileKnownPath: (path) => rig.application.vaultSyncService.reconcileKnownPath(path),
    manifest: nodeShippedManifest(),
    ...overrides,
  });
}

/** Pages whose create throws `error` the first `times` times a path ending in one of `endings` is created. */
function failingPages(rig: WelcomeRig, endings: readonly string[], error: unknown, times = 1) {
  const remaining = new Map(endings.map((ending) => [ending, times]));

  return {
    createFromSource: (source: Parameters<WelcomeRig['application']['pageOperations']['createFromSource']>[0]) => {
      for (const [ending, left] of remaining) {
        if (source.path.endsWith(ending) && left > 0) {
          remaining.set(ending, left - 1);

          return Promise.reject(error);
        }
      }

      return rig.application.pageOperations.createFromSource(source);
    },
  };
}

const writesOutsideClutterThatAreNotCreateOnly = (rig: WelcomeRig) =>
  rig.writer.calls.filter((call) => !call.includes('/.clutter/') && !call.startsWith('write:create:'));

/** What a user does to delete a note: archive it, then delete it permanently. */
async function userDeletesPage(rig: WelcomeRig, id: string): Promise<void> {
  await rig.application.pageOperations.archive(id);
  await rig.application.pageOperations.delete(id);
}

const ledgerOf = (rig: WelcomeRig) => readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT);
const noSpace = new AtomicNotCommittedError('insufficientSpace', 'injected');

describe('WelcomeContentService.install', () => {
  it('installs every shipped file with its own id and byte-identical content, and records the finished install', async () => {
    const rig = await makeRig();

    const result = await serviceFor(rig).install();

    expect(result).toEqual({ status: 'installed' });
    expect(SHIPPED_NOTES).toHaveLength(22);
    for (const { rel, abs: source } of shippedFiles().filter(({ rel }) => rel.endsWith('.md'))) {
      expect(Buffer.compare(Buffer.from(await rig.disk.readFile(abs(rel)), 'utf8'), fs.readFileSync(source)), rel).toBe(0);
    }
    for (const { rel, abs: source } of SHIPPED_NOTES) {
      const id = idOf(fs.readFileSync(source, 'utf8'));

      expect(rig.vault.getPage(id)?.path, rel).toBe(abs(rel));
    }
    expect(Buffer.compare(Buffer.from(await rig.disk.readBinaryFile(abs('Assets/Typewritter.jpg'))), fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/Assets/Typewritter.jpg`))).toBe(0);
    expect(rig.disk.hasFileSync(abs('Templates/.folder.md'))).toBe(false);
    expect(rig.vault.getReservedFolder('templates')).toBeDefined();
    expect(rig.vault.getFolderByPath(abs('Welcome to Clutter/Markdown essentials'))?.parentId).toBe(
      rig.vault.getFolderByPath(abs('Welcome to Clutter'))?.id
    );
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'installed', completed: TOTAL_ENTRIES, total: TOTAL_ENTRIES, attempts: 1, inFlight: false });
  });

  it('G1: nothing is ever written except create-only (apart from the ledger itself)', async () => {
    const rig = await makeRig();

    await serviceFor(rig).install();

    expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
  });

  it('the shipped wiki links resolve in the installed layout (no extra outer folder)', async () => {
    const rig = await makeRig();
    await serviceFor(rig).install();
    const targets = new Set<string>();
    for (const { abs: source } of SHIPPED_NOTES) {
      for (const match of fs.readFileSync(source, 'utf8').matchAll(/(?<!`)\[\[(Welcome to Clutter\/[^\]|#]+)/g)) targets.add(match[1]!);
    }

    expect(targets.size).toBeGreaterThan(0);
    for (const target of targets) expect(rig.vault.getPageByPath(abs(`${target}.md`)), target).toBeDefined();
  });

  it('does not start in a Space that already has content, and writes nothing', async () => {
    const rig = await makeRig();
    await rig.application.folderOperations.create('Mine', null);
    const writesBefore = rig.writer.calls.length;

    expect(await serviceFor(rig).install()).toEqual({ status: 'skipped', reason: 'not-empty' });

    expect(rig.writer.calls).toHaveLength(writesBefore);
    expect(await ledgerOf(rig)).toBeNull();
  });

  it('G3: a second install never runs: it is skipped, writes nothing, and a deleted note stays deleted', async () => {
    const rig = await makeRig();
    await serviceFor(rig).install();
    const decision = SHIPPED_NOTES.find(({ rel }) => rel === 'Templates/Decision.md')!;
    await userDeletesPage(rig, idOf(fs.readFileSync(decision.abs, 'utf8')));
    expect(rig.disk.hasFileSync(abs('Templates/Decision.md'))).toBe(false);
    const writesBefore = rig.writer.calls.length;
    // An empty Vault again is not enough to start over: a ledger exists.
    const second = serviceFor(rig);

    expect(await second.resumeIfNeeded()).toBeNull();
    const emptied = await makeRig();
    await writeWelcomeInstallLedger(emptied.fileSystem, SPACE_ROOT, (await ledgerOf(rig))!);
    expect(await serviceFor(emptied).install()).toEqual({ status: 'skipped', reason: 'already-started' });

    expect(rig.writer.calls).toHaveLength(writesBefore);
    expect(rig.disk.hasFileSync(abs('Templates/Decision.md'))).toBe(false);
  });

  it('G1: a file already on disk is never overwritten; it ends only that entry and the rest installs', async () => {
    const rig = await makeRig();
    await rig.disk.createDirectory(abs('Templates'));
    await rig.disk.writeFile(abs('Templates/Idea.md'), 'USER CONTENT');

    const result = await serviceFor(rig).install();

    expect(result).toEqual({ status: 'installed' });
    expect(await rig.disk.readFile(abs('Templates/Idea.md'))).toBe('USER CONTENT');
    expect(rig.disk.hasFileSync(abs('Templates/Decision.md'))).toBe(true);
    expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
  });

  it('G1: an existing directory is never entered: it and everything shipped inside it are skipped, its files and marker untouched', async () => {
    const rig = await makeRig();
    await rig.disk.createDirectory(abs('Welcome to Clutter'));
    await rig.disk.writeFile(abs('Welcome to Clutter/keep.md'), 'user note');

    const result = await serviceFor(rig).install();

    expect(result).toEqual({ status: 'installed' });
    expect(await rig.disk.readFile(abs('Welcome to Clutter/keep.md'))).toBe('user note');
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/.folder.md'))).toBe(false);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/Get started.md'))).toBe(false);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/Markdown essentials/Lists.md'))).toBe(false);
    expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(true);
  });

  it('an existing image is never replaced', async () => {
    const rig = await makeRig();
    await rig.disk.createDirectory(abs('Assets'));
    await rig.disk.writeBinaryFile(abs('Assets/Typewritter.jpg'), Uint8Array.of(1, 2, 3));

    expect(await serviceFor(rig).install()).toEqual({ status: 'installed' });

    expect([...(await rig.disk.readBinaryFile(abs('Assets/Typewritter.jpg')))]).toEqual([1, 2, 3]);
  });
});

describe('recovery: G2 to G6', () => {
  /**
   * An install that stopped, in a Space the user HAS seen (the contract's strict case): `markShown` is what the
   * first-run gate does when it opens the Space. `shown: false` keeps it as the gate leaves it while it is hidden.
   */
  async function interrupted(options: { failAt?: readonly string[]; times?: number; error?: unknown; shown?: boolean } = {}) {
    const rig = await makeRig();
    const first = await serviceFor(rig, {
      pageOperations: failingPages(rig, options.failAt ?? ['Templates/Idea.md'], options.error ?? noSpace, options.times ?? 1),
    }).install();
    if (options.shown ?? true) await serviceFor(rig).markShown();

    return { rig, first };
  }

  it('a retryable failure records the retry and says so: the ledger holds the entry in flight and is still installing', async () => {
    const { rig, first } = await interrupted();

    expect(first).toEqual({ status: 'failed', retry: 'scheduled' });
    expect(await ledgerOf(rig)).toMatchObject({ state: 'installing', inFlight: true, attempts: 1 });
    expect(welcomeInstallNotice(first)).toBe('Some welcome notes couldn’t be added yet. Clutter will try again next time you open this space');
  });

  it('G5/G6: resume finishes the install, never writes the in-flight file, and never writes anything but create-only', async () => {
    const { rig } = await interrupted();
    expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);

    const resumed = await serviceFor(rig).resumeIfNeeded();

    expect(resumed).toEqual({ status: 'installed' });
    // The one note that was in flight stays missing: absent could mean never written or deleted since.
    expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);
    for (const { rel } of SHIPPED_NOTES.filter(({ rel }) => rel !== 'Templates/Idea.md')) {
      expect(rig.disk.hasFileSync(abs(rel)), rel).toBe(true);
    }
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'installed', attempts: 2 });
    expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
  });

  describe('a Space the user has never seen (the first-run gate keeps it hidden until the install is verified)', () => {
    it('the file that was in flight is attempted again, create-only: nobody could have deleted it', async () => {
      const { rig } = await interrupted({ shown: false });
      expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);

      const resumed = await serviceFor(rig).resumeIfNeeded();

      expect(resumed).toEqual({ status: 'installed' });
      expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(true);
      expect(await serviceFor(rig).verifyInstall()).toEqual({ ok: true, checked: TOTAL_ENTRIES });
      expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
    });

    it('a file already at the in-flight path is left exactly as it is, never overwritten', async () => {
      const { rig } = await interrupted({ shown: false });
      await rig.disk.writeFile(abs('Templates/Idea.md'), 'SOMETHING ELSE');

      await serviceFor(rig).resumeIfNeeded();

      expect(await rig.disk.readFile(abs('Templates/Idea.md'))).toBe('SOMETHING ELSE');
      expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
    });

    it('once the Space has been shown the rule is strict again: the in-flight file is never written', async () => {
      const { rig } = await interrupted({ shown: false });
      await serviceFor(rig).markShown();

      await serviceFor(rig).resumeIfNeeded();

      expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);
    });

    it('a ledger from a build that did not record `shown` is treated as shown', async () => {
      const { rig } = await interrupted({ shown: false });
      const { shown: _shown, ...legacy } = (await ledgerOf(rig))!;
      await writeWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT, legacy);

      await serviceFor(rig).resumeIfNeeded();

      expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);
    });
  });

  it('G2: a note the user deleted after it was installed is not recreated by the resume', async () => {
    const { rig } = await interrupted();
    const decision = SHIPPED_NOTES.find(({ rel }) => rel === 'Templates/Decision.md')!;
    await userDeletesPage(rig, idOf(fs.readFileSync(decision.abs, 'utf8')));

    await serviceFor(rig).resumeIfNeeded();

    expect(rig.disk.hasFileSync(abs('Templates/Decision.md'))).toBe(false);
    expect(rig.vault.getPageByPath(abs('Templates/Decision.md'))).toBeUndefined();
  });

  it('G2: a folder the user deleted is not recreated, and what was still to be installed inside it is skipped', async () => {
    const { rig } = await interrupted({ failAt: ['Welcome to Clutter/Get started.md'] });
    const essentials = rig.vault.getFolderByPath(abs('Welcome to Clutter'))!;
    await rig.application.folderOperations.archive(essentials.id);
    await rig.application.folderOperations.delete(essentials.id);

    await serviceFor(rig).resumeIfNeeded();

    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/.folder.md'))).toBe(false);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/Markdown essentials/Lists.md'))).toBe(false);
    expect(rig.vault.getFolderByPath(abs('Welcome to Clutter'))).toBeUndefined();
  });

  it('G6: an in-flight file that is on disk is left exactly as it is and registered, never rewritten', async () => {
    const { rig } = await interrupted();
    const idea = SHIPPED_NOTES.find(({ rel }) => rel === 'Templates/Idea.md')!;
    const text = fs.readFileSync(idea.abs, 'utf8');
    await rig.disk.writeFile(abs('Templates/Idea.md'), text);
    const callsBefore = rig.writer.calls.length;

    await serviceFor(rig).resumeIfNeeded();

    expect(await rig.disk.readFile(abs('Templates/Idea.md'))).toBe(text);
    expect(rig.writer.calls.slice(callsBefore).filter((call) => call.includes('Templates/Idea.md'))).toEqual([]);
    expect(rig.vault.getPageByPath(abs('Templates/Idea.md'))?.id).toBe(idOf(text));
  });

  it('G4: a resume against different bundled content abandons the install and writes nothing', async () => {
    const { rig } = await interrupted();
    const callsBefore = rig.writer.calls.length;
    const changed: WelcomeManifest = nodeShippedManifest((rel, text) => (rel === 'Templates/Goals.md' ? `${text}\nchanged` : text));

    const result = await serviceFor(rig, { manifest: changed }).resumeIfNeeded();

    expect(result).toEqual({ status: 'failed', retry: 'none' });
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'abandoned' });
    expect(rig.writer.calls.slice(callsBefore).filter((call) => !call.includes('/.clutter/'))).toEqual([]);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/Get started.md'))).toBe(false);
  });

  it('G4: a changed path list is a different plan too', async () => {
    const { rig } = await interrupted();
    const fewer = nodeShippedManifest();
    const smaller: WelcomeManifest = { entries: fewer.entries.slice(0, -1), plan: fewer.plan };

    expect(await serviceFor(rig, { manifest: smaller }).resumeIfNeeded()).toEqual({ status: 'failed', retry: 'none' });
    expect(await ledgerOf(rig)).toMatchObject({ outcome: 'abandoned' });
  });

  it('three attempts in total: the third failure records no retry and says so, and a fourth resume does nothing', async () => {
    const rig = await makeRig();
    const failures = ['Templates/Idea.md', 'Templates/Project.md', 'Templates/Trip.md'];
    const run = (endings: string[]) => serviceFor(rig, { pageOperations: failingPages(rig, endings, noSpace) });

    const first = await run([failures[0]!]).install();
    await serviceFor(rig).markShown();
    const second = await run([failures[1]!]).resumeIfNeeded();
    const third = await run([failures[2]!]).resumeIfNeeded();
    const fourth = await serviceFor(rig).resumeIfNeeded();

    expect(first).toEqual({ status: 'failed', retry: 'scheduled' });
    expect(second).toEqual({ status: 'failed', retry: 'scheduled' });
    expect(third).toEqual({ status: 'failed', retry: 'none' });
    expect(welcomeInstallNotice(third)).toBe('Some welcome notes couldn’t be added. Your space is ready to use');
    expect(fourth).toBeNull();
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'abandoned', attempts: MAX_INSTALL_ATTEMPTS });
    for (const failed of failures) expect(rig.disk.hasFileSync(abs(failed)), failed).toBe(false);
  });

  it('a crash loop is bounded: a ledger already at the attempt limit is abandoned on resume without running', async () => {
    const { rig } = await interrupted();
    await writeWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT, { ...(await ledgerOf(rig))!, attempts: MAX_INSTALL_ATTEMPTS });
    const callsBefore = rig.writer.calls.length;

    expect(await serviceFor(rig).resumeIfNeeded()).toEqual({ status: 'failed', retry: 'none' });
    expect(rig.writer.calls.slice(callsBefore).filter((call) => !call.includes('/.clutter/'))).toEqual([]);
  });

  it('a permanent failure records no retry', async () => {
    const { rig, first } = await interrupted({ error: new AtomicNotCommittedError('unsupportedFilesystem', 'injected') });

    expect(first).toEqual({ status: 'failed', retry: 'none' });
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'abandoned' });
    expect(await serviceFor(rig).resumeIfNeeded()).toBeNull();
  });

  it('a failed uncertain write is retryable, and the file in doubt is not written again', async () => {
    const { rig, first } = await interrupted({ error: Object.assign(new Error('may or may not have been written'), { name: 'AtomicUncertainError' }) });

    expect(first).toEqual({ status: 'failed', retry: 'scheduled' });
    expect(await serviceFor(rig).resumeIfNeeded()).toEqual({ status: 'installed' });
  });

  it('a corrupt or malformed ledger resumes nothing', async () => {
    const rig = await makeRig();
    await rig.disk.createDirectory(abs('.clutter'));
    await rig.disk.writeFile(abs('.clutter/workspace.json'), '{ not json');

    expect(await serviceFor(rig).resumeIfNeeded()).toBeNull();
    await rig.disk.writeFile(abs('.clutter/workspace.json'), JSON.stringify({ welcomeInstall: { version: 1, state: 'installing' } }));
    expect(await serviceFor(rig).resumeIfNeeded()).toBeNull();
  });
});

describe('verifyInstall: the first-run gate opens only a complete Space', () => {
  it('has nothing to verify without a ledger, or while the install is unfinished', async () => {
    const rig = await makeRig();
    expect(await serviceFor(rig).verifyInstall()).toBeNull();

    await serviceFor(rig, { pageOperations: failingPages(rig, ['Templates/Idea.md'], noSpace) }).install();
    expect(await serviceFor(rig).verifyInstall()).toBeNull();
  });

  it('confirms all 27 entries after a complete install: 4 directories, 22 notes, both markers, the image', async () => {
    const rig = await makeRig();
    await serviceFor(rig).install();

    expect(await serviceFor(rig).verifyInstall()).toEqual({ ok: true, checked: 27 });
    expect(TOTAL_ENTRIES).toBe(27);
  });

  it('reports what is missing, and records the install as abandoned (nothing a resume could write) instead of hiding it', async () => {
    const rig = await makeRig();
    await serviceFor(rig).install();
    const lists = SHIPPED_NOTES.find(({ rel }) => rel.endsWith('Markdown essentials/Lists.md'))!;
    await userDeletesPage(rig, idOf(fs.readFileSync(lists.abs, 'utf8')));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await serviceFor(rig).verifyInstall();

    expect(result).toEqual({ ok: false, checked: 27, missing: ['Welcome to Clutter/Markdown essentials/Lists.md'] });
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'abandoned' });
  });

  it('fails a marker folder the Vault holds under a different id than its .folder.md carries (the watcher race)', async () => {
    let beforeMarker: (() => Promise<void>) | null = null;
    const rig = await makeWelcomeRig((disk) => {
      const stack = atomicStack(disk);
      const hooked = Object.create(stack.fileSystem) as VaultFileSystem;
      hooked.writeFile = async (path, contents, intent) => {
        if (path === abs('Welcome to Clutter/.folder.md')) await beforeMarker?.();

        return stack.fileSystem.writeFile(path, contents, intent);
      };

      return { fileSystem: hooked, writer: stack.writer };
    });
    beforeMarker = () => rig.application.vaultSyncService.reconcileKnownPath(abs('Welcome to Clutter'));
    await serviceFor(rig).install();
    beforeMarker = null;
    // The retry of an unshown Space finishes the install against this same (stale) Vault.
    await serviceFor(rig).resumeIfNeeded();

    const result = await serviceFor(rig).verifyInstall();

    expect(result).toMatchObject({ ok: false });
    expect(result && !result.ok && result.missing).toContain('Welcome to Clutter');
  });
});

describe('ledger persistence failures: the notice never promises more than is recorded', () => {
  function flakyFileSystem(rig: WelcomeRig) {
    const state = { broken: false };
    const flaky = Object.create(rig.fileSystem) as VaultFileSystem;
    flaky.writeFile = (path, contents, intent) => {
      if (state.broken && path.endsWith('workspace.json')) return Promise.reject(new Error('disk full'));

      return rig.fileSystem.writeFile(path, contents, intent);
    };

    return { flaky, state };
  }

  it('a ledger that cannot be created means nothing is written at all', async () => {
    const rig = await makeRig();
    const { flaky, state } = flakyFileSystem(rig);
    state.broken = true;

    const result = await serviceFor(rig, { fileSystem: flaky }).install();

    expect(result).toEqual({ status: 'failed', retry: 'none' });
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/Get started.md'))).toBe(false);
    expect(rig.vault.getReservedFolder('templates')).toBeUndefined();
  });

  it('a failure whose retry cannot be recorded reports an uncertain state, not a scheduled or a cancelled retry', async () => {
    const rig = await makeRig();
    const { flaky, state } = flakyFileSystem(rig);
    const pages = failingPages(rig, ['Templates/Idea.md'], noSpace);

    const result = await serviceFor(rig, {
      fileSystem: flaky,
      pageOperations: {
        createFromSource: (source) => {
          if (source.path.endsWith('Templates/Idea.md')) state.broken = true;

          return pages.createFromSource(source);
        },
      },
    }).install();

    expect(result).toEqual({ status: 'failed', retry: 'unknown' });
    expect(welcomeInstallNotice(result)).toBe('Some welcome notes couldn’t be added. Clutter may try again next time you open this space');
    state.broken = false;
    // What the ledger says is what the next open does: it was last written as installing, so it resumes.
    expect(await serviceFor(rig).resumeIfNeeded()).toEqual({ status: 'installed' });
  });

  it('a resume whose attempt cannot be counted does not run', async () => {
    const { rig } = await (async () => {
      const r = await makeRig();
      await serviceFor(r, { pageOperations: failingPages(r, ['Templates/Idea.md'], noSpace) }).install();

      return { rig: r };
    })();
    const { flaky, state } = flakyFileSystem(rig);
    state.broken = true;
    const callsBefore = rig.writer.calls.length;

    expect(await serviceFor(rig, { fileSystem: flaky }).resumeIfNeeded()).toEqual({ status: 'failed', retry: 'unknown' });
    expect(rig.writer.calls).toHaveLength(callsBefore);
  });
});

describe('Sync watcher interleaving (the first real-app failure)', () => {
  /**
   * What the OS watcher does in the real app: it reports the directory the installer just created, and Sync
   * reconciles it a moment later (a macrotask here). Directory creation is not self-write suppressed, so that
   * reconcile is not ignored. `markerLoadDelayMs` models the lazy chunk the real app fetches for a marker's text.
   */
  function watcherRig(rig: WelcomeRig, markerLoadDelayMs: number) {
    const base = nodeShippedManifest();
    const manifest: WelcomeManifest = {
      plan: base.plan,
      entries: base.entries.map((entry) =>
        entry.kind === 'directory' && entry.loadMarker
          ? {
              ...entry,
              loadMarker: async () => {
                await new Promise((resolve) => setTimeout(resolve, markerLoadDelayMs));

                return entry.loadMarker!();
              },
            }
          : entry
      ),
    };
    const watched = Object.create(rig.fileSystem) as VaultFileSystem;
    watched.createDirectory = async (path, options) => {
      await rig.fileSystem.createDirectory(path, options);
      if (options?.exclusive) setTimeout(() => void rig.application.vaultSyncService.reconcileKnownPath(path), 0);
    };

    return { manifest, watched };
  }

  const markerId = (rel: string) => idOf(fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${rel}/.folder.md`, 'utf8'));

  it('REGRESSION: a marker that loads slowly after the directory exists no longer lets Sync register the folder first', async () => {
    const rig = await makeRig();
    const { manifest, watched } = watcherRig(rig, 10);

    const result = await serviceFor(rig, { fileSystem: watched, manifest }).install();
    // Let every watcher reaction that is still pending run, then look at the Vault.
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(result).toEqual({ status: 'installed' });
    expect(await ledgerOf(rig)).toMatchObject({ state: 'complete', outcome: 'installed', completed: TOTAL_ENTRIES, total: TOTAL_ENTRIES });
    // Both folders keep the ids their shipped .folder.md files carry, and both markers are on disk as shipped.
    for (const rel of ['Welcome to Clutter', 'Welcome to Clutter/Markdown essentials']) {
      expect(rig.vault.getFolderByPath(abs(rel))?.id, rel).toBe(markerId(rel));
      expect(Buffer.compare(Buffer.from(await rig.disk.readFile(abs(`${rel}/.folder.md`)), 'utf8'), fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${rel}/.folder.md`)), rel).toBe(0);
    }
    // All 27 entries: 4 directories, 22 notes (each a Vault page with its shipped id, in its folder) and the image.
    expect(rig.vault.getFolderByPath(abs('Assets'))).toBeDefined();
    expect(rig.vault.getReservedFolder('templates')).toBeDefined();
    for (const { rel, abs: source } of SHIPPED_NOTES) {
      const page = rig.vault.getPageByPath(abs(rel));

      expect(page?.id, rel).toBe(idOf(fs.readFileSync(source, 'utf8')));
      expect(page?.parentId, rel).toBe(rig.vault.getFolderByPath(abs(rel.slice(0, rel.lastIndexOf('/'))))?.id);
    }
    expect(rig.disk.hasFileSync(abs('Assets/Typewritter.jpg'))).toBe(true);
    expect(writesOutsideClutterThatAreNotCreateOnly(rig)).toEqual([]);
  });

  it('RESIDUAL RACE (documented, not fixed here): Sync reacting during the Gate write still beats the folder into the Vault, and is reported as its own cause', async () => {
    // The watcher's reaction lands exactly between the marker's directory and the marker's write, inside the Gate.
    let beforeMarker: (() => Promise<void>) | null = null;
    const rig = await makeWelcomeRig((disk) => {
      const stack = atomicStack(disk);
      const hooked = Object.create(stack.fileSystem) as VaultFileSystem;
      hooked.writeFile = async (path, contents, intent) => {
        if (path === abs('Welcome to Clutter/.folder.md')) await beforeMarker?.();

        return stack.fileSystem.writeFile(path, contents, intent);
      };

      return { fileSystem: hooked, writer: stack.writer };
    });
    beforeMarker = () => rig.application.vaultSyncService.reconcileKnownPath(abs('Welcome to Clutter'));
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args));

    const result = await serviceFor(rig).install();

    expect(result).toEqual({ status: 'failed', retry: 'scheduled' });
    const reported = errors.map((call) => call[1]).find((value) => value instanceof Error && value.name === 'WrittenButNotRegisteredError') as
      | (Error & { path: string; sourceKind: string; gateReason: string })
      | undefined;
    // The cause, the path and the Gate's own words are all kept.
    expect(reported?.path).toBe(abs('Welcome to Clutter'));
    expect(reported?.sourceKind).toBe('folder');
    expect(reported?.gateReason).toMatch(/Folder path already in use/);
    expect(reported?.message).toMatch(/written/i);
    // The marker really is on disk as shipped; the Vault holds the folder under a path-derived id for this session.
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/.folder.md'))).toBe(true);
    expect(rig.vault.getFolderByPath(abs('Welcome to Clutter'))?.id).not.toBe(markerId('Welcome to Clutter'));
  });
});

describe('welcomeInstallNotice', () => {
  it('says nothing for a success, a skip, or no result', () => {
    expect(welcomeInstallNotice(null)).toBeNull();
    expect(welcomeInstallNotice({ status: 'installed' })).toBeNull();
    expect(welcomeInstallNotice({ status: 'skipped', reason: 'not-empty' })).toBeNull();
    expect(welcomeInstallNotice({ status: 'skipped', reason: 'already-started' })).toBeNull();
  });

  it('follows the writing principles: sentence case, typographic apostrophe, no ending period, no alarm', () => {
    for (const retry of ['scheduled', 'none', 'unknown'] as const) {
      const text = welcomeInstallNotice({ status: 'failed', retry })!;

      expect(text).not.toMatch(/\.$/);
      expect(text).not.toMatch(/!|'/);
      expect(text).toMatch(/couldn’t/);
      expect(text).not.toMatch(/damage|corrupt|lost|error/i);
    }
  });
});
