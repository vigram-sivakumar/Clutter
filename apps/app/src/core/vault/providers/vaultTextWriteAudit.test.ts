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

describe('vault text writes have one door', () => {
  it('writeTextFile is imported only by the vault provider and by recovery storage (app data, outside every vault)', () => {
    expect(importersOf('writeTextFile')).toEqual(['core/recovery/TauriRecoveryStorage.ts', 'core/vault/providers/LocalFileSystem.ts']);
  });

  it('binary writeFile is imported only by the vault provider (assets) and by the two downloads to a user-chosen place', () => {
    expect(importersOf('writeFile')).toEqual([
      'core/vault/providers/LocalFileSystem.ts',
      'shared/helpers/downloadRemoteImage.ts',
      'shared/helpers/downloadTextFile.ts',
    ]);
  });

  it('the plain vault provider is constructed only by the Composition Root and the one factory for short-lived jobs', () => {
    const constructors = sourceFiles(SRC)
      .filter((file) => /new LocalVaultProvider\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'));

    expect(constructors).toEqual(['core/application/Application.ts', 'core/vault/providers/openVaultFileSystem.ts']);
  });
});
