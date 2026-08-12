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

// A page's Daily Note vs. Note role is derived from its current path —
// specifically, from being both located under the reserved Daily Notes
// folder AND matching the canonical Daily Note path convention for some
// date (DailyNotePath.matchesCanonicalPath) — never from persisted
// frontmatter (frontmatter.type, if present, is inert legacy data and must
// not influence classification), and never from location alone (a
// malformed/external Markdown file placed inside Daily Notes must remain
// an ordinary Note, so nothing downstream ever treats a non-date filename
// as a Daily Note date).
describe('PageBuilder: type is derived from canonical path, never frontmatter', () => {
  const ROOT = '/vault';
  const builder = new PageBuilder(ROOT);

  it('a page at the canonical Daily Note path builds as type "daily-note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
      directoryPath: `${ROOT}/Daily Notes/2026/August`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('daily-note');
  });

  it('a page outside the Daily Notes folder builds as type "note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Projects/Note.md`,
      directoryPath: `${ROOT}/Projects`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('a malformed filename inside Daily Notes builds as type "note", not "daily-note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/Random Note.md`,
      directoryPath: `${ROOT}/Daily Notes`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('another non-date filename inside Daily Notes builds as type "note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/Meeting.md`,
      directoryPath: `${ROOT}/Daily Notes`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('a date-looking filename outside the canonical year/month folder structure builds as type "note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/2026-08-12.md`,
      directoryPath: `${ROOT}/Daily Notes`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('a canonical-looking date under non-canonical (numeric) month folder names builds as type "note"', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/2026/08/2026-08-12.md`,
      directoryPath: `${ROOT}/Daily Notes/2026/08`,
      frontmatter: { id: 'page-1' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('ignores frontmatter.type entirely — path outside Daily Notes wins over a stale "daily-note" frontmatter value', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Projects/Note.md`,
      directoryPath: `${ROOT}/Projects`,
      frontmatter: { id: 'page-1', type: 'daily-note' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });

  it('ignores frontmatter.type entirely — a canonical Daily Note path wins over a stale "note" frontmatter value', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
      directoryPath: `${ROOT}/Daily Notes/2026/August`,
      frontmatter: { id: 'page-1', type: 'note' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('daily-note');
  });

  it('ignores frontmatter.type entirely — a malformed filename stays "note" even with a stale "daily-note" frontmatter value', () => {
    const scanned = makeScannedPage({
      path: `${ROOT}/Daily Notes/Random Note.md`,
      directoryPath: `${ROOT}/Daily Notes`,
      frontmatter: { id: 'page-1', type: 'daily-note' },
    });

    const page = builder.build({ parentId: null, page: scanned });

    expect(page.type).toBe('note');
  });
});
