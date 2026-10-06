import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The collection-page scrolling contract, checked against the source: every
 * scrollable collection page scrolls in the shell's `.page__content` (no
 * page-specific scroll container) and every collection body — a `PageBody`
 * with `collection__content` — ends with exactly one shared
 * `collection__bottom-spacer`, the trailing scroll space that lets the last
 * item scroll clear of the page's bottom fade. A body that ends straight
 * after its last item is the bug this guards against (it once hid the Tasks
 * page's last rows under the fade).
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Code only: comments are free to *name* the spacer. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const count = (text: string, needle: string) => text.split(needle).length - 1;

const bodies = sourceFiles(SRC)
  .map((path) => ({ file: relative(SRC, path), code: strip(readFileSync(path, 'utf8')) }))
  .filter(({ code }) => code.includes('className="collection__content"'));

describe('collection-page scrolling contract', () => {
  it('finds every known collection body', () => {
    expect(bodies.map(({ file }) => file).sort()).toEqual([
      'app/layouts/page/body/ArchiveCollectionBody.tsx',
      'app/layouts/page/body/AssetsCollectionBody.tsx',
      'app/layouts/page/body/CollectionBody.tsx',
      'features/tasks/page/TasksCollectionBody.tsx',
    ]);
  });

  it.each(bodies.map(({ file, code }) => [file, code] as const))(
    '%s renders its collection__content body with exactly one collection__bottom-spacer',
    (_file, code) => {
      expect(count(code, 'className="collection__content"')).toBe(1);
      expect(count(code, 'className="collection__bottom-spacer"')).toBe(1);
    }
  );

  it('no page-specific vertical scroll container: .page__content is the only overflow-y: auto page-level container', () => {
    const pageCss = readFileSync(join(SRC, 'app/layouts/page/Page.css'), 'utf8');

    expect(pageCss).toMatch(/\.page__content\s*\{[^}]*overflow-y:\s*auto/);
  });
});
