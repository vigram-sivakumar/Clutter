import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Static boundary check for codemirror/embed/ — the Embed-scoped
 * counterpart to wikilink/boundary.test.ts, same rule
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary"):
 * no file here may import Vault/VaultQuery/EffectivePageState/
 * PageOperations/MembershipSelector, or reach into core/vault or
 * core/application at all. Resolution and suggestions are entirely
 * injected (embedSuggestion.ts) — the editor stays fully ignorant of what
 * a resource or a vault is.
 */

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"].*core\/vault/,
  /from\s+['"].*core\/application/,
  /\bVaultQuery\b/,
  /\bEffectivePageState\b/,
  /\bPageOperations\b/,
  /\bMembershipSelector\b/,
  /\bVault\b(?!Resource)/, // avoid false-positiving on our own "VaultResource"/type-only references
];

/**
 * Strips comments before checking — same reasoning wikilink/boundary.test.ts
 * already applies: files are free to *document* the boundary in prose
 * without that explanation itself tripping the check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const embedDir = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts'));
}

describe('Embed editor boundary: no Vault/application-layer imports', () => {
  const files = sourceFiles(embedDir);

  it('found the expected source files to check (sanity check on the check itself)', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'embedScanner.ts',
        'embedSyntax.ts',
        'embedSerialize.ts',
        'embedSuggestion.ts',
        'embedEngagement.ts',
        'embedCompletionSource.ts',
        'embedCompletionRenderer.ts',
        'embedImageResolution.ts',
        'embedLivePreview.ts',
        'embedAutocomplete.ts',
      ])
    );
  });

  it.each(files)(
    '%s does not import or reference Vault/VaultQuery/EffectivePageState/PageOperations/MembershipSelector',
    (file) => {
      const content = stripComments(readFileSync(join(embedDir, file), 'utf-8'));
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  );
});
