import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-063: "one switch covers every writer" is only true while every vault text write goes through
 * `VaultFileSystem.writeFile`. This audits who may import the fs plugin's write primitives; a new importer fails
 * here, so a competing write path cannot appear unnoticed.
 */
const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The non-test files that import `primitive` from the fs plugin. */
function importersOf(primitive: string): string[] {
  return sourceFiles(SRC)
    .filter((file) => {
      const match = /import\s*\{([^}]*)\}\s*from\s*'@tauri-apps\/plugin-fs'/.exec(readFileSync(file, 'utf8'));

      return match !== null && match[1]!.split(',').some((name) => name.trim().split(/\s+as\s+/)[0] === primitive);
    })
    .map((file) => relative(SRC, file).split('\\').join('/'))
    .sort();
}

describe('vault text writes have one door', { timeout: 30_000 }, () => {
  it('the plugin\'s writeTextFile, which truncates in place, is imported by nobody and is not granted', () => {
    // Vault text goes through the atomic provider; recovery records through the native `recovery_write`
    // (`recovery_store.rs`), which takes a key and a name and never a path.
    expect(importersOf('writeTextFile')).toEqual([]);
  });

  it('the plugin\'s binary writeFile and copyFile, which replace what is at the destination, are imported by nobody', () => {
    // Assets, pasted files and duplicates go through the native no-clobber commands (`write_file_no_clobber`,
    // `copy_file_no_clobber`); the downloads to a place the user chose go through the native export commands
    // (`export_pick_destination`, `export_copy_file`, `export_write_file`). The commands are not even granted
    // (`pluginFsCapabilityAudit.test.ts`).
    expect(importersOf('writeFile')).toEqual([]);
    expect(importersOf('copyFile')).toEqual([]);
  });

  it('the plain vault provider is constructed only by the Composition Root and the one factory for short-lived jobs', () => {
    const constructors = sourceFiles(SRC)
      .filter((file) => /new LocalVaultProvider\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'));

    expect(constructors).toEqual(['core/application/Application.ts', 'core/vault/providers/openVaultFileSystem.ts']);
  });
});
