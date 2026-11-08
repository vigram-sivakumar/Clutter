import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../../core/application/Application';
import { DailyNoteService } from '../../core/application/daily-notes/DailyNoteService';
import { PageCreator } from '../../core/application/page/PageCreator';
import { PageFactory } from '../../core/application/page/PageFactory';
import { collectionViewKeyForFolder } from '../../core/application/collection/collectionViewKey';
import { WELCOME_GUIDE_ORDER } from '../../core/application/welcome-content/welcomeContentManifest';
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
  openWelcomeFolder,
  prepareWelcomeSpace,
} from './runWelcomeContent';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

// ADR-067/070: the Welcome Screen gate against the real Gate, Vault and Sync (production write stack over the in-memory
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

/** What AppShell does between discarding an Application and opening the Space again: a fresh scan and a fresh Application. */
async function reopen(rig: WelcomeRig): Promise<Application> {
  const scan = await new VaultScanner(rig.fileSystem).scan(SPACE_ROOT);
  const { vault } = new VaultBuilder(new FakeIdGenerator()).build(scan);
  const application = new Application(vault, rig.fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return application;
}

/** Makes `application`'s installer fail once at each path ending in one of `endings`. */
function failOnce(application: Application, _rig: WelcomeRig, endings: readonly string[], error: unknown = noSpace): void {
  const left = new Set(endings);
  application.welcomeContentService = application.createWelcomeContentService({
    manifest: nodeShippedManifest(),
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
  });
}

/** Replaces the installer's bundled manifest with the shipped files read from disk (the app's image fetch is not available here). */
function useShippedManifest(application: Application, _rig: WelcomeRig): void {
  application.welcomeContentService = application.createWelcomeContentService({ manifest: nodeShippedManifest() });
}

const everythingIsThere = async (_rig: WelcomeRig, application: Application) => {
  for (const { rel, abs: source } of NOTES) {
    expect(application.vault.getPageByPath(abs(rel))?.id, rel).toBe(idOf(fs.readFileSync(source, 'utf8')));
  }
  for (const rel of ['Welcome to Clutter']) {
    expect(application.vault.getFolderByPath(abs(rel))?.id, rel).toBe(idOf(fs.readFileSync(`${SHIPPED_SOURCE_ROOT}/${rel}/.folder.md`, 'utf8')));
  }
};

describe('the first-run gate: nothing is shown until the install is complete and verified', () => {
  it('Create: installs everything, verifies all 24 entries, marks the Space shown, then opens', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);

    const outcome = await prepareWelcomeSpace(rig.application);

    expect(outcome).toEqual({ open: true, installed: true });
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed', completed: 24, total: 24, shown: true });
    await everythingIsThere(rig, rig.application);
  });

  it('Create: the guide folder gets a manual order with Get started first, and a later retry never overwrites a chosen order', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);

    await prepareWelcomeSpace(rig.application);

    const folder = rig.application.vault.getFolderByPath(abs('Welcome to Clutter'))!;
    const key = collectionViewKeyForFolder(folder.id);
    const config = rig.application.collectionViewConfigStore.get(key);
    const expected = WELCOME_GUIDE_ORDER.map((name) => `n:${rig.application.vault.getPageByPath(abs(`Welcome to Clutter/${name}.md`))!.id}`);

    expect(config?.sidebarSort?.key).toBe('manual');
    expect(config?.sidebarOrder).toEqual(expected);
    expect(expected).toHaveLength(11);

    rig.application.collectionViewConfigStore.update(key, { sidebarOrder: ['n:other'] });
    await prepareWelcomeSpace(rig.application);

    expect(rig.application.collectionViewConfigStore.get(key)?.sidebarOrder).toEqual(['n:other']);
  });

  it('openWelcomeFolder opens the guide folder without a history entry, and does nothing when it is not there', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);
    await prepareWelcomeSpace(rig.application);
    const folder = rig.application.vault.getFolderByPath(abs('Welcome to Clutter'))!;

    await openWelcomeFolder(rig.application, SPACE_ROOT);

    expect(rig.application.workspace.activeView).toEqual({ type: 'folder', id: folder.id });
    expect(rig.application.workspace.canNavigateBack).toBe(false);

    const empty = await makeWelcomeRig(atomicStack);
    await openWelcomeFolder(empty.application, SPACE_ROOT);
    expect(empty.application.workspace.activeView).not.toMatchObject({ type: 'folder' });
  });

  it('a failure stops the gate: the Space is not opened and the ledger holds the unfinished install', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);

    const outcome = await prepareWelcomeSpace(rig.application);

    expect(outcome).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'installing', inFlight: true, shown: false });
  });

  it('the retry resumes from the ledger on a fresh Application, completes all 24 entries, and only then opens', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);
    await prepareWelcomeSpace(rig.application);
    const callsBefore = rig.writer.calls.length;

    // The failed attempt's Application was discarded; the retry opens the Space again.
    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const outcome = await prepareWelcomeSpace(reopened);

    expect(outcome).toEqual({ open: true, installed: true });
    await everythingIsThere(rig, reopened);
    expect(rig.writer.calls.slice(callsBefore).filter((call) => !call.includes('/.clutter/') && !call.startsWith('write:create:'))).toEqual([]);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed', attempts: 2, shown: true });
  });

  it('the retry never overwrites a file already there, and never restores a deleted one once the Space has been shown', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    failOnce(rig.application, rig, ['Templates/Idea.md']);
    await prepareWelcomeSpace(rig.application);
    await rig.disk.writeFile(abs('Templates/Idea.md'), 'SOMETHING ELSE');

    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const outcome = await prepareWelcomeSpace(reopened);

    // Something else is at that path, so the content there is not as shipped: the Space is not shown as complete.
    expect(await rig.disk.readFile(abs('Templates/Idea.md'))).toBe('SOMETHING ELSE');
    expect(outcome.open).toBe(false);
  });

  it('three failed attempts in total: the third says no more retries will happen, and the next try opens the Space as it is', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    const attempt = async (endings: string[]) => {
      const application = await reopen(rig);
      failOnce(application, rig, endings);

      return prepareWelcomeSpace(application);
    };

    const first = await attempt(['Templates/Idea.md']);
    const second = await attempt(['Templates/Project.md']);
    const third = await attempt(['Templates/Trip.md']);
    const next = await reopen(rig);
    useShippedManifest(next, rig);
    const fourth = await prepareWelcomeSpace(next);

    expect(first).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(second).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(third).toEqual({ open: false, message: WELCOME_GATE_ABANDONED_MESSAGE });
    expect(fourth).toEqual({ open: true, installed: false });
  });

  it('Sync registering the folder first, inside the Gate write, no longer closes the gate: the Space opens with both folders under their shipped ids', async () => {
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

    const outcome = await prepareWelcomeSpace(rig.application);
    beforeMarker = null;

    expect(outcome).toEqual({ open: true, installed: true });
    await everythingIsThere(rig, rig.application);
    // The Space reopens correctly: a fresh scan finds the same folders and notes, none twice, and the content verifies.
    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    await everythingIsThere(rig, reopened);
    expect(await reopened.welcomeContentService.verifyInstall()).toEqual({ ok: true, checked: 24 });
    const ids = [...reopened.vault.pages()].map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = [...reopened.vault.folders()].map((folder) => folder.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('a ledger that could not be created leaves the Space untouched, and the retry installs from the start', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    const flaky = Object.create(rig.fileSystem) as VaultFileSystem;
    flaky.writeFile = (path, contents, intent) =>
      path.endsWith('workspace.json') ? Promise.reject(new Error('disk full')) : rig.fileSystem.writeFile(path, contents, intent);
    rig.application.welcomeContentService = rig.application.createWelcomeContentService({
      fileSystem: flaky,
      manifest: nodeShippedManifest(),
    });

    const first = await prepareWelcomeSpace(rig.application);
    expect(first.open).toBe(false);
    expect(rig.disk.hasFileSync(abs('Welcome to Clutter/.folder.md'))).toBe(false);

    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    expect(await prepareWelcomeSpace(reopened)).toEqual({ open: true, installed: true });
    await everythingIsThere(rig, reopened);
  });

  it('a completely empty folder chosen in the Welcome Screen (Select a folder) is populated exactly like a created one', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    const chosen = await reopen(rig);
    useShippedManifest(chosen, rig);

    const outcome = await prepareWelcomeSpace(chosen);

    expect(outcome).toEqual({ open: true, installed: true });
    await everythingIsThere(rig, chosen);
  });

  it('a folder that holds anything is left untouched: no write at all, no ledger, and it opens as it is', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    await rig.disk.writeFile(abs('mine.md'), 'user note');
    const chosen = await reopen(rig);
    useShippedManifest(chosen, rig);
    const callsBefore = rig.writer.calls.length;

    const outcome = await prepareWelcomeSpace(chosen);

    expect(outcome).toEqual({ open: true, installed: false });
    expect(rig.writer.calls).toHaveLength(callsBefore);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toBeNull();
    expect(await rig.disk.readFile(abs('mine.md'))).toBe('user note');
  });

  it('every Welcome Screen open of a new empty Space is populated, however many Spaces were populated before', async () => {
    const first = await makeWelcomeRig(atomicStack);
    useShippedManifest(first.application, first);
    const second = await makeWelcomeRig(atomicStack);
    useShippedManifest(second.application, second);

    expect(await prepareWelcomeSpace(first.application)).toEqual({ open: true, installed: true });
    expect(await prepareWelcomeSpace(second.application)).toEqual({ open: true, installed: true });
    await everythingIsThere(second, second.application);
  });

  it('deleting every note and file never brings the content back: the Space opens empty, nothing is written, the gate stays open', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);
    await prepareWelcomeSpace(rig.application);
    for (const entry of await rig.disk.readDirectory(SPACE_ROOT)) {
      if (entry.name !== '.clutter') await rig.disk.deleteFile(entry.path, { recursive: true });
    }

    const emptied = await reopen(rig);
    useShippedManifest(emptied, rig);
    expect([...emptied.vault.pages()]).toHaveLength(0);
    expect([...emptied.vault.folders()]).toHaveLength(0);
    const callsBefore = rig.writer.calls.length;

    // Opened again through the Welcome Screen (for example after removing every Space): still never repopulated.
    const outcome = await prepareWelcomeSpace(emptied);

    expect(outcome).toEqual({ open: true, installed: false });
    expect(rig.writer.calls).toHaveLength(callsBefore);
    expect([...emptied.vault.pages()]).toHaveLength(0);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed' });
  });

  it('a Space whose notes were edited or deleted after a complete install opens through the gate without being re-verified', async () => {
    const rig = await makeWelcomeRig(atomicStack);
    useShippedManifest(rig.application, rig);
    await prepareWelcomeSpace(rig.application);
    await rig.disk.deleteFile(abs('Templates/Idea.md'));

    const reopened = await reopen(rig);
    useShippedManifest(reopened, rig);
    const outcome = await prepareWelcomeSpace(reopened);

    expect(outcome).toEqual({ open: true, installed: false });
    expect(rig.disk.hasFileSync(abs('Templates/Idea.md'))).toBe(false);
    expect(await readWelcomeInstallLedger(rig.fileSystem, SPACE_ROOT)).toMatchObject({ state: 'complete', outcome: 'installed' });
  });
});
