// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/core', () => tauri);
const plugin = vi.hoisted(() => ({
  writeTextFile: vi.fn(async () => undefined),
  mkdir: vi.fn(),
  stat: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { LocalVaultProvider } from '../providers/LocalFileSystem';
import type { AtomicVaultWriter } from './AtomicWriteContract';

describe('the atomic writer contract is separate from the production writer', () => {
  it('the production provider is not an AtomicVaultWriter, so its plain writeFile result can never be read as one', () => {
    const provider = new LocalVaultProvider('/vault');

    // @ts-expect-error `LocalVaultProvider` does not implement the atomic contract.
    const asWriter: AtomicVaultWriter = provider;

    expect((provider as unknown as Record<string, unknown>).kind).toBeUndefined();
    expect((provider as unknown as Record<string, unknown>).inspect).toBeUndefined();
    expect((provider as unknown as Record<string, unknown>).confirmDurability).toBeUndefined();
    expect(asWriter).toBe(provider);
  });

  it('a production save still goes through the fs plugin’s writeTextFile and never reaches an atomic command', async () => {
    plugin.writeTextFile.mockClear();
    tauri.invoke.mockClear();

    const result = await new LocalVaultProvider('/vault').writeFile('/vault/note.md', 'text', 'replace');

    expect(result).toBeUndefined(); // a Promise<void>: no outcome, no guarantee
    expect(plugin.writeTextFile).toHaveBeenCalledWith('/vault/note.md', 'text');
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('only the Composition Root, the save-failure classifier and the workspace-state merge, the Gate, the Sync repair writers and the short-lived vault opener import the atomic writer: only its own folder, the test double and those seven may', () => {
    const root = path.resolve(__dirname, '../../..'); // apps/app/src
    const offenders: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') visit(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const inAtomicFolder = full.includes(`${path.sep}atomicWrite${path.sep}`);
          const isDouble = full.endsWith(`${path.sep}InMemoryAtomicVaultWriter.ts`);
          // Application.ts builds the stack (off by default, one switch for every writer); PageOperations only asks
          // whether a failed save is worth retrying; workspaceStateFile and persistSyncedPageDocument only recognise a write conflict.
          const isAllowedConsumer = ['application/Application.ts', 'application/page/PageOperations.ts', 'vault/initialize/workspaceStateFile.ts', 'vault/providers/openVaultFileSystem.ts', 'vault/sync/persistSyncedPageDocument.ts', 'vault/sync/persistSyncedFolderDocument.ts', 'vault/persistence/PagePersistenceCoordinator.ts'].some((name) =>
            full.endsWith(`${path.sep}core${path.sep}${name.replace('/', path.sep)}`)
          );
          if (!inAtomicFolder && !isDouble && !isAllowedConsumer && /atomicWrite\//.test(fs.readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    visit(root);

    expect(offenders).toEqual([]);
  });

  it('atomic saves are off unless the build asks for them, and the production provider is still the plugin writer', async () => {
    const { featureFlags, isAtomicWritesEnabled } = await import('../../featureFlags');

    expect(featureFlags.atomicWrites).toBe(false);
    expect(isAtomicWritesEnabled()).toBe(false);
  });

  it('LocalFileSystem.ts does not mention the native atomic commands', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../providers/LocalFileSystem.ts'), 'utf8');

    expect(source).not.toMatch(/atomic_(write|inspect|confirm)/);
    expect(source).not.toMatch(/atomicWrite/);
  });
});
