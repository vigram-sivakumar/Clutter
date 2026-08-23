import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Static boundary check, made a literal test assertion rather than a
 * stated-but-unenforced convention (docs/editor-architecture-decisions.md,
 * "Editor/persistence boundary"): no file under codemirror/wikilink/ (or
 * its sibling codemirror/semanticToken/, extracted per §11 — the shared
 * mechanism is even more strictly obligated to stay kind-agnostic, since
 * it has no resolution boundary of its own to hide behind) may import
 * Vault/VaultQuery/EffectivePageState/PageOperations, or reach into
 * core/vault or core/application at all. Resolution is entirely injected
 * (wikiLinkResolution.ts) — the editor stays fully ignorant of what a page
 * or a vault is.
 */

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"].*core\/vault/,
  /from\s+['"].*core\/application/,
  /\bVaultQuery\b/,
  /\bEffectivePageState\b/,
  /\bPageOperations\b/,
  /\bVault\b(?!Link)/, // avoid false-positiving on our own "WikiLink" name
];

/**
 * Strips comments before checking, so files are free to *document* the
 * boundary (naming Vault/VaultQuery/etc. in prose, as
 * wikiLinkResolution.ts's own doc comments correctly do) without that
 * explanation itself tripping the check — this test guards actual
 * imports/code references, not the words used to explain why they're
 * absent.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const wikilinkDir = dirname(fileURLToPath(import.meta.url));
const semanticTokenDir = join(wikilinkDir, '..', 'semanticToken');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts'));
}

describe('WikiLink editor boundary: no Vault/application-layer imports', () => {
  const files = sourceFiles(wikilinkDir);

  it('found the expected source files to check (sanity check on the check itself)', () => {
    expect(files).toEqual(
      expect.arrayContaining(['wikiLinkScanner.ts', 'wikiLinkSyntax.ts', 'wikiLinkSerialize.ts', 'wikiLinkResolution.ts'])
    );
  });

  it.each(files)('%s does not import or reference Vault/VaultQuery/EffectivePageState/PageOperations', (file) => {
    const content = stripComments(readFileSync(join(wikilinkDir, file), 'utf-8'));
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(content).not.toMatch(pattern);
    }
  });
});

describe('Shared semantic-token mechanism boundary: no Vault/application-layer imports', () => {
  const files = sourceFiles(semanticTokenDir);

  it('found the expected source files to check (sanity check on the check itself)', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'tokenEngagement.ts',
        'tokenDecorations.ts',
        'tokenMouseHandlers.ts',
        'tokenSelectionSnap.ts',
      ])
    );
  });

  it.each(files)('%s does not import or reference Vault/VaultQuery/EffectivePageState/PageOperations', (file) => {
    const content = stripComments(readFileSync(join(semanticTokenDir, file), 'utf-8'));
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(content).not.toMatch(pattern);
    }
  });
});
