import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-067: the facades' `createFromSource` are not a general-purpose verbatim-write API. A source can only be minted
// by the welcome-content folder, so nothing else in the codebase can hand either facade arbitrary content.
const SRC = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);

    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('ShippedSource contract (ADR-067)', () => {
  it('only the welcome-content folder mints a shipped source', () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const relative = path.relative(SRC, file);
      if (relative.startsWith(path.join('core', 'application', 'welcome-content'))) return false;

      return /mintShipped(Page|Folder)Source/.test(fs.readFileSync(file, 'utf8'));
    });

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it('only PageOperations, FolderOperations and the welcome-content folder call createFromSource', () => {
    const callers = sourceFiles(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bcreateFromSource\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
      .sort();

    expect(callers).toEqual([
      path.join('core', 'application', 'folder', 'FolderOperations.ts'),
      path.join('core', 'application', 'page', 'PageOperations.ts'),
      path.join('core', 'application', 'welcome-content', 'WelcomeContentService.ts'),
    ]);
  });

  it('the Gate itself is untouched: no createOnly flag on any operation', () => {
    const gate = fs.readFileSync(path.join(SRC, 'core/vault/persistence/PagePersistenceCoordinator.ts'), 'utf8');

    expect(gate).not.toMatch(/createOnly/);
  });
});
