import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The page body's sizing contract: `.page__body` contains its content (so trailing space inside it is real
 * scroll space), the editor-to-References gap comes from the body's `gap`, and a Markdown page ends with one
 * `.markdown__bottom-spacer` rather than the editor padding it replaced. Source-level, like
 * collectionScrollContract.test.ts: jsdom has no layout.
 */
const read = (path: string) =>
  readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, selector: string) =>
  css.match(
    new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`)
  )?.[1] ?? '';

describe('page body layout', () => {
  const pageCss = read('../Page.css');
  const body = rule(pageCss, '.page__body');

  it('grows to fill the viewport but never shrinks below its content', () => {
    expect(body).toMatch(/flex\s*:\s*1 0 auto/);
    expect(body).not.toMatch(/min-height/);
  });

  it('separates the editor and References with the body gap', () => {
    expect(body).toMatch(/gap\s*:\s*var\(--space-32\)/);
  });

  it('keeps the page-level scroll container unchanged', () => {
    const content = rule(pageCss, '.page__content');
    expect(content).toMatch(/overflow-y\s*:\s*auto/);
    expect(content).toMatch(/min-height\s*:\s*0/);
  });

  it('no longer pads the editor column for trailing space', () => {
    expect(
      rule(
        read('../../../../features/markdown/editor/MarkdownEditor.css'),
        '.markdown__editor'
      )
    ).not.toMatch(/padding-bottom/);
  });

  it('defines the Markdown spacer as in-flow, full-width, non-shrinking trailing space with no margin', () => {
    const spacer = rule(read('Page.Body.css'), '.markdown__bottom-spacer');
    expect(spacer).toMatch(/height\s*:\s*30vh/);
    expect(spacer).toMatch(/width\s*:\s*100%/);
    expect(spacer).toMatch(/flex-shrink\s*:\s*0/);
    expect(spacer).not.toMatch(/margin|position/);
  });

  it('is separate from the collection spacer', () => {
    expect(read('CollectionBody.css')).not.toMatch(/markdown__bottom-spacer/);
  });

  it('renders the Markdown spacer after the editor and References in both Markdown page branches', () => {
    const src = readFileSync(join(__dirname, '../PageHost.tsx'), 'utf8');
    const spacer = 'className="markdown__bottom-spacer"';
    expect(src.split(spacer).length - 1).toBe(2);
    const afterRefs = src.slice(src.indexOf('<PageReferences'));
    expect(afterRefs.indexOf(spacer)).toBeGreaterThan(afterRefs.indexOf('/>'));
    expect(afterRefs.indexOf(spacer)).toBeLessThan(afterRefs.indexOf('</>'));
  });
});
