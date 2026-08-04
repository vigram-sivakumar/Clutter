import { describe, expect, it } from 'vitest';
import { PageBuilder } from './PageBuilder';
import type { ScannedPage } from './VaultScanResult';

function makeScannedPage(overrides: Partial<ScannedPage> = {}): ScannedPage {
  return {
    path: 'notes/My Note.md',
    directoryPath: 'notes',
    frontmatter: {},
    frontmatterAnalysis: { aliases: [] },
    content: '',
    analysis: {
      headings: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
    ...overrides,
  };
}

describe('PageBuilder', () => {
  const builder = new PageBuilder();

  it('uses the persisted frontmatter id as the stable identity when present', () => {
    const scanned = makeScannedPage({
      frontmatter: { id: 'persisted-id-123' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.id).toBe('persisted-id-123');
  });

  it('derives identity from the file path when no frontmatter id exists', () => {
    const scanned = makeScannedPage({
      path: 'notes/Untitled.md',
      frontmatter: {},
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.id).toBe('notes/Untitled.md');
  });

  it('derives the page name from the filename, stripping the .md extension', () => {
    const scanned = makeScannedPage({ path: 'notes/My Note.md' });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.name).toBe('My Note');
  });

  it('maps scanned analysis (tags, tasks) into the page analysis, stamped with the resolved page id', () => {
    const scanned = makeScannedPage({
      frontmatter: { id: 'page-xyz' },
      analysis: {
        headings: [{ title: 'Heading', level: 1 }],
        blockReferences: [],
        tasks: [
          { text: 'do the thing', completed: false, rawText: '- [ ] do the thing' },
        ],
        tags: [{ name: 'design' }],
        links: [],
        embeds: [],
      },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.analysis.headings).toEqual([{ text: 'Heading', level: 1 }]);
    expect(page.analysis.tasks).toEqual([
      {
        sourcePageId: 'page-xyz',
        text: 'do the thing',
        completed: false,
        rawText: '- [ ] do the thing',
        startOffset: undefined,
        endOffset: undefined,
        sourceVersion: undefined,
      },
    ]);
    expect(page.analysis.tags).toEqual([
      {
        sourcePageId: 'page-xyz',
        name: 'design',
        rawText: undefined,
        startOffset: undefined,
        endOffset: undefined,
        sourceVersion: undefined,
      },
    ]);
  });

  it('defaults type to "note" and applies documented metadata defaults when frontmatter is absent', () => {
    const scanned = makeScannedPage({ frontmatter: {} });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
    expect(page.metadata.favorite).toBe(false);
    expect(page.metadata.status).toBe('active');
    expect(page.metadata.icon).toBeNull();
  });

  it('maps frontmatter.originalPath into page.metadata.originalPath', () => {
    const scanned = makeScannedPage({
      frontmatter: { originalPath: '/vault/Projects/Test.md' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.metadata.originalPath).toBe('/vault/Projects/Test.md');
  });
});
