import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Static boundary check for codemirror/pdf/ — the PDF-embed counterpart to
 * embed/boundary.test.ts and wikilink/boundary.test.ts, same rule
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary"):
 * no file here may import Vault/VaultQuery/EffectivePageState/
 * PageOperations/MembershipSelector, or reach into core/vault or
 * core/application at all — and, per this widget's own "Open" contract
 * (`OnPdfEmbedClick`), it must never import or construct `PdfOverlay`
 * itself either. Resolution is entirely injected (embedPdfResolution.ts,
 * `OnPdfEmbedClick`) — the editor stays fully ignorant of what a resource,
 * a vault, or the overlay is.
 */

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"].*core\/vault/,
  /from\s+['"].*core\/application/,
  /\bVaultQuery\b/,
  /\bEffectivePageState\b/,
  /\bPageOperations\b/,
  /\bMembershipSelector\b/,
  /\bVault\b(?!Resource)/, // avoid false-positiving on our own "VaultResource"/type-only references
  /\bPdfOverlay\b/,
];

/**
 * Strips comments before checking — same reasoning embed/boundary.test.ts
 * already applies: files are free to *document* the boundary in prose
 * without that explanation itself tripping the check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const pdfDir = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts'));
}

describe('PDF embed editor boundary: no Vault/application-layer/PdfOverlay imports', () => {
  const files = sourceFiles(pdfDir);

  it('found the expected source files to check (sanity check on the check itself)', () => {
    expect(files).toEqual(
      expect.arrayContaining(['PdfEmbedWidget.ts', 'embedPdfResolution.ts', 'pdfDocumentCache.ts'])
    );
  });

  it.each(files)(
    '%s does not import or reference Vault/VaultQuery/EffectivePageState/PageOperations/MembershipSelector/PdfOverlay',
    (file) => {
      const content = stripComments(readFileSync(join(pdfDir, file), 'utf-8'));
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  );
});
