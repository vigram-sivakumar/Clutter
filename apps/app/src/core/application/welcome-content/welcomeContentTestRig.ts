/**
 * Test support for ADR-067 (imported by tests only): the shipped welcome content read straight from disk with Node
 * (independent of the bundler's glob, so the two can be compared), and a real Application over a file system the
 * test supplies. The tests supply the production write stack with the in-memory atomic writer, which enforces
 * create-only intent like the native writer; they build it themselves because only test files may import the atomic
 * writer (`AtomicWriteContract.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application } from '../Application';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { SelfWriteRegistry } from '../../vault/providers/SelfWriteRegistry';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { EXCLUDED_FROM_INSTALL, buildWelcomeManifest, type ManifestFile, type WelcomeManifest } from './welcomeContentManifest';

export const SPACE_ROOT = '/space';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHIPPED_SOURCE_ROOT = path.resolve(HERE, '../../../welcome-content/Welcome to Clutter');

/** Every shipped file that is installed (never `.DS_Store`, never `EXCLUDED_FROM_INSTALL`), relative to the shipped Space root. */
export function shippedFiles(dir = SHIPPED_SOURCE_ROOT, rel = ''): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const abs = path.join(dir, name);
    const childRel = rel === '' ? name : `${rel}/${name}`;
    if (fs.statSync(abs).isDirectory()) out.push(...shippedFiles(abs, childRel));
    else if (!EXCLUDED_FROM_INSTALL.includes(childRel)) out.push({ rel: childRel, abs });
  }

  return out;
}

/** Every file in the shipped folder, installed or not, for tests of the exclusion itself. */
export function allFilesInShippedFolder(dir = SHIPPED_SOURCE_ROOT, rel = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;

    return entry.isDirectory() ? allFilesInShippedFolder(path.join(dir, entry.name), childRel) : [childRel];
  });
}

/** The shipped content as a manifest, built from Node's view of the disk. `mutate` rewrites a file's text for tests. */
export function nodeShippedManifest(mutate?: (rel: string, text: string) => string, extraFiles: readonly ManifestFile[] = []): WelcomeManifest {
  const files: ManifestFile[] = shippedFiles().map(({ rel, abs }) =>
    rel.endsWith('.md')
      ? {
          path: rel,
          loadText: async () => {
            const text = fs.readFileSync(abs, 'utf8');

            return mutate ? mutate(rel, text) : text;
          },
        }
      : { path: rel, loadBytes: async () => new Uint8Array(fs.readFileSync(abs)) }
  );

  return buildWelcomeManifest([...files, ...extraFiles]);
}

export interface WelcomeRig {
  readonly application: Application;
  readonly vault: Vault;
  readonly disk: InMemoryVaultFileSystem;
  /** Every write the writer saw, as `write:<intent>:<path>`. */
  readonly writer: { readonly calls: string[] };
  readonly fileSystem: VaultFileSystem;
}

export type WelcomeFileSystemFactory = (disk: InMemoryVaultFileSystem) => {
  readonly fileSystem: VaultFileSystem;
  readonly writer: { readonly calls: string[] };
};

export async function makeWelcomeRig(makeFileSystem: WelcomeFileSystemFactory): Promise<WelcomeRig> {
  const disk = new InMemoryVaultFileSystem();
  await disk.createDirectory(SPACE_ROOT);
  const { fileSystem, writer } = makeFileSystem(disk);
  const vault = new Vault(SPACE_ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return { application, vault, disk, writer, fileSystem };
}

/**
 * What the OS watcher does: tells the Application's Sync about a change (the in-memory watcher has no emit of its own,
 * so this calls the listeners Application subscribed, the same entry point a real event takes).
 */
export function emitWatcherEvent(application: Application, change: { type: 'created'; path: string; isDirectory: boolean }): void {
  const watcher = Reflect.get(application, 'fileSystemWatcher') as { listeners: Set<(change: unknown) => void> };
  for (const listener of watcher.listeners) listener(change);
}
