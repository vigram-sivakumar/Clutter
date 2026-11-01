import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../../core/application/Application';
import { DailyNoteService } from '../../core/application/daily-notes/DailyNoteService';
import { PageCreator } from '../../core/application/page/PageCreator';
import { PageFactory } from '../../core/application/page/PageFactory';
import { WelcomeContentService } from '../../core/application/welcome-content/WelcomeContentService';
import { readWelcomeInstallLedger } from '../../core/application/welcome-content/WelcomeInstallLedger';
import {
  makeWelcomeRig,
  nodeShippedManifest,
  shippedFiles,
  SHIPPED_SOURCE_ROOT,
  SPACE_ROOT,
  type WelcomeRig,
} from '../../core/application/welcome-content/welcomeContentTestRig';
import { UuidGenerator } from '../../core/shared/identity/UuidGenerator';
import { AtomicWriteFileSystem } from '../../core/vault/atomicWrite/AtomicWriteFileSystem';
import { AtomicNotCommittedError } from '../../core/vault/atomicWrite/atomicWriteErrors';
import { FrontmatterParser } from '../../core/vault/ingest/FrontmatterParser';
import { VaultBuilder } from '../../core/vault/ingest/VaultBuilder';
import { VaultScanner } from '../../core/vault/ingest/VaultScanner';
import type { VaultFileSystem } from '../../core/vault/providers/VaultFileSystem';
import { SelfWriteRegistry } from '../../core/vault/providers/SelfWriteRegistry';
import { FakeIdGenerator } from '../../core/vault/testing/FakeIdGenerator';
import { InMemoryAtomicVaultWriter } from '../../core/vault/testing/InMemoryAtomicVaultWriter';
import type { InMemoryVaultFileSystem } from '../../core/vault/testing/InMemoryVaultFileSystem';
import {
  WELCOME_GATE_ABANDONED_MESSAGE,
  WELCOME_GATE_RETRY_MESSAGE,
  prepareWelcomeSpace,
} from './runWelcomeContent';
import { readWelcomeContentRecord } from './welcomeContentRecord';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

// ADR-067: the first-run gate against the real Gate, Vault and Sync (production write stack over the in-memory
// writer). Every scenario is one Welcome open: the Space is created, content installed, and only then may it be shown.
// These are automated results; none of this is the real app.

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const parser = new FrontmatterParser();
const idOf = (text: string) => String(parser.parse(text).frontmatter.id);
const abs = (rel: string) => `${SPACE_ROOT}/${rel}`;
const NOTES = shippedFiles().filter(({ rel }) => rel.endsWith('.md') && !rel.endsWith('/.folder.md'));
const noSpace = new AtomicNotCommittedError('insufficientSpace', 'injected');

const atomicStack = (disk: InMemoryVaultFileSystem) => {
  const writer = new InMemoryAtomicVaultWriter(disk);

  return { fileSystem: new AtomicWriteFileSystem(disk, writer), writer };
};

function memoryStorage() {
  const data = new Map<string, string>();

  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

/** What AppShell does between discarding an Application and opening the Space again: a fresh scan and a fresh Application. */
async function reopen(rig: WelcomeRig): Promise<Application> {
  const scan = await new VaultScanner(rig.fileSystem).scan(SPACE_ROOT);
  const { vault } = new VaultBuilder(new FakeIdGenerator()).build(scan);
  const application = new Application(vault, rig.fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return application;
}

/** Makes `application`'s installer fail once at each path ending in one of `endings`. */
function failOnce(application: Application, rig: WelcomeRig, endings: readonly string[], error: unknown = noSpace): void {
  const left = new Set(endings);
  application.welcomeContentService = new WelcomeContentService({
    vault: application.vault,
    fileSystem: rig.fileSystem,
    rootPath: SPACE_ROOT,
    pageOperations: {
      createFromSource: (source) => {
        const hit = [...left].find((ending) => source.path.endsWith(ending));
        if (hit) {
          left.delete(hit);

          return Promise.reject(error);
        }

        return application.pageOperations.createFromSource(source);
      },
    },
    folderOperations: application.folderOperations,
    reconcileKnownPath: (path) => application.vaultSyncService.reconcileKnownPath(path),
    manifest: nodeShippedManifest(),
  });
}

/** Replaces the installer's bundled manifest with the shipped files read from disk (the app's image fetch is not available here). */
function useShippedManifest(application: Application, rig: WelcomeRig): void {
  application.welcomeContentService = new WelcomeContentService({
    vault: application.vault,
    fileSystem: rig.fileSystem,
    rootPath: SPACE_ROOT,
    pageOperations: application.pageOperations,
    folderOperations: application.folderOperations,
    reconcileKnownPath: (path) => application.vaultSyncService.reconcileKnownPath(path),
    manifest: nodeShippedManifest(),
  });
}

const everythingIsThere = async (rig: WelcomeRig, application: Application) => {
  for (const { rel, abs: source } of NOTES) {
    expect(application.vault.getPageByPath(abs(rel))?.id, rel).toBe(idOf(fs.readFileSync(source, 'utf8')));
  }
  for (const rel of ['Welcome to Clutter', 'Welcome to Clutter/Markdown essentials']) {
    expect(application.vault.getFolderByPath(abs(rel))?.id, rel).toBe(idOf(fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${rel}/.folder.md`, 'utf8')));
  }
  expect(rig.disk.hasFileSync(abs('Assets/Typewritter.jpg'))).toBe(true);
};

describe('the first-run gate: nothing is shown until the install is complete and verified', () => {
  it('Create: installs everything, verifies all 27 entries, records `done`, marks the Space shown, then opens', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);
    const storage = memoryStorage();

    const outcome = await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });

    expect(outcome).toEqual({ open: true });
    expect(readWelcomeContentRecord(storage)).toBe('done');
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed', completed: 27, total: 27, shown: true });
    await everythingIsThere(rig, rig.application);
  });

  it('a failure stops the gate: the Space is not opened, the record stays `started`, and the ledger holds the unfinished install', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);
    const storage = memoryStorage();

    const outcome = await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });

    expect(outcome).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(readWelcomeContentRecord(storage)).toBe('started');
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'installing', inFlight: true, shown: false });
  });

  it('the retry resumes from the ledger on a fresh Application, completes all 27 entries, and only then opens', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);
    const storage = memoryStorage();
    await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });
    const callsBefore = rig.writer.calls.length;

    // The failed attempt's Application was discarded; the retry opens the Space again.
    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const outcome = await prepareWelcomeSpace(reopened, { storage, createdByWelcome: true });

    expect(outcome).toEqual({ open: true });
    expect(readWelcomeContentRecord(storage)).toBe('done');
    await everythingIsThere(rig, reopened);
    expect(rig.writer.calls.slice(callsBefore).filter((call) => !call.includes('/.clutter/') && !call.startsWith('write:create:'))).toEqual([]);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed', attempts: 2, shown: true });
  });

  it('the retry never overwrites a file already there, and never restores a deleted one once the Space has been shown', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);
    const storage = memoryStorage();
    await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });
    await rig.disk.writeFile(abs('Templates/Idea.md'), 'SOMETHING ELSE');

    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const outcome = await prepareWelcomeSpace(reopened, { storage, createdByWelcome: true });

    // Something else is at that path, so the content there is not as shipped: the Space is not shown as complete.
    expect(await rig.disk.readFile(abs('Templates/Idea.md'))).toBe('SOMETHING ELSE');
    expect(outcome.open).toBe(false);
  });

  it('three failed attempts in total: the third says no more retries will happen, and the next try opens the Space as it is', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    const storage = memoryStorage();
    const attempt = async (endings: string[]) => {
      const application = await reopen(rig);
      failOnce(application, rig, endings);

      return prepareWelcomeSpace(application, { storage, createdByWelcome: true });
    };

    const first = await attempt(['Templates/Idea.md']);
    const second = await attempt(['Templates/Project.md']);
    const third = await attempt(['Templates/Trip.md']);
    const next = await reopen(rig);
    useShippedManifest(next, rig);
    const fourth = await prepareWelcomeSpace(next, { storage, createdByWelcome: true });

    expect(first).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(second).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(third).toEqual({ open: false, message: WELCOME_GATE_ABANDONED_MESSAGE });
    expect(fourth).toEqual({ open: true });
  });

  it('the watcher race inside the Gate closes the gate, and the retry opens with both folders under their shipped ids', async () => {
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
    useShippedManifest(rig.application, rig);
    beforeMarker = () => rig.application.vaultSyncService.reconcileKnownPath(abs('Welcome to Clutter'));
    const storage = memoryStorage();

    const first = await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });
    beforeMarker = null;
    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const retry = await prepareWelcomeSpace(reopened, { storage, createdByWelcome: true });

    expect(first).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(retry).toEqual({ open: true });
    await everythingIsThere(rig, reopened);
  });

  it('a ledger that could not be created leaves the Space untouched, and the retry installs from the start', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    const storage = memoryStorage();
    const flaky = Object.create(rig.fileSystem) as VaultFileSystem;
    flaky.writeFile = (path, contents, intent) =>
      path.endsWith('workspace.json') ? Promise.reject(new Error('disk full')) : rig.fileSystem.writeFile(path, contents, intent);
    const broken = new WelcomeContentService({
      vault: rig.vault,
      fileSystem: flaky,
      rootPath: SPACE_ROOT,
      pageOperations: rig.application.pageOperations,
      folderOperations: rig.application.folderOperations,
      reconcileKnownPath: (path) => rig.application.vaultSyncService.reconcileKnownPath(path),
      manifest: nodeShippedManifest(),
    });
    rig.application.welcomeContentService = broken;

    const first = await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: true });
    expect(first.open).toBe(false);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/.folder.md'))).toBe(false);

    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    expect(await prepareWelcomeSpace(reopened, { storage, createdByWelcome: true })).toEqual({ open: true });
    await everythingIsThere(rig, reopened);
  });

  it('selecting an existing folder opens it at once with nothing installed, even if it holds files', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    await rig.disk.writeFile(abs('mine.md'), 'user note');
    useShippedManifest(rig.application, rig);
    const storage = memoryStorage();
    const callsBefore = rig.writer.calls.length;

    const outcome = await prepareWelcomeSpace(rig.application, { storage, createdByWelcome: false });

    expect(outcome).toEqual({ open: true });
    expect(readWelcomeContentRecord(storage)).toBe('skipped-existing-folder');
    expect(rig.writer.calls).toHaveLength(callsBefore);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toBeNull();
    expect(await rig.disk.readFile(abs('mine.md'))).toBe('user note');
  });
});
