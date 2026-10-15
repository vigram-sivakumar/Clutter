import { describe, expect, it } from 'vitest';

import { FolderBuilder } from '../FolderBuilder';
import { FrontmatterParser } from '../FrontmatterParser';
import { FrontmatterSerializer } from '../FrontmatterSerializer';
import { PageBuilder } from '../PageBuilder';
import { resolvePageMetadata } from '../resolvePageMetadata';
import type { Folder } from '../../models/Folder';
import type { Page } from '../../models/Page';
import { formatCoverCredit, parseCoverCredit } from './coverCredit';

const CREDIT = { name: 'Alex Doe', url: 'https://unsplash.com/@alex' };
const COVER = 'https://images.unsplash.com/photo-1?ixid=abc&w=1080';

describe('parseCoverCredit / formatCoverCredit (ADR-054)', () => {
  it('round-trips "Name <https-url>"', () => {
    const line = formatCoverCredit(CREDIT)!;

    expect(line).toBe('Alex Doe <https://unsplash.com/@alex>');
    expect(parseCoverCredit(line)).toEqual(CREDIT);
  });

  it('round-trips the optional download location, and parses old two-part lines without one', () => {
    const credit = { ...CREDIT, downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc' };
    const line = formatCoverCredit(credit)!;

    expect(line).toBe('Alex Doe <https://unsplash.com/@alex> <https://api.unsplash.com/photos/p1/download?ixid=abc>');
    expect(parseCoverCredit(line)).toEqual(credit);
    expect(parseCoverCredit('Alex Doe <https://unsplash.com/@alex>')).toEqual(CREDIT);
  });

  it('refuses to write a download location that is not on the Unsplash API host (the credit itself is kept)', () => {
    const line = formatCoverCredit({ ...CREDIT, downloadLocation: 'https://evil.example/download' });

    expect(line).toBe('Alex Doe <https://unsplash.com/@alex>');
    expect(
      parseCoverCredit('Alex Doe <https://unsplash.com/@alex> <https://evil.example/download>')?.downloadLocation
    ).toBeUndefined();
  });

  it('keeps names with punctuation, unicode, a colon, a hash and a "<"', () => {
    for (const name of ['Zoë Müller', 'J. R. R.', 'Ana: the #1 <fan>', "O'Neil", '山田 太郎']) {
      const line = formatCoverCredit({ name, url: CREDIT.url })!;

      expect(parseCoverCredit(line)).toEqual({ name, url: CREDIT.url });
    }
  });

  it('normalizes whitespace and control characters in the written name', () => {
    expect(formatCoverCredit({ name: '  Alex \n\t Doe  ', url: CREDIT.url })).toBe(
      'Alex Doe <https://unsplash.com/@alex>'
    );
  });

  it('writes nothing for a missing, nameless or non-https credit — never an invented one', () => {
    expect(formatCoverCredit(null)).toBeUndefined();
    expect(formatCoverCredit(undefined)).toBeUndefined();
    expect(formatCoverCredit({ name: '   ', url: CREDIT.url })).toBeUndefined();
    expect(formatCoverCredit({ name: 'A', url: 'http://unsplash.com/@a' })).toBeUndefined();
    expect(formatCoverCredit({ name: 'A', url: 'javascript:alert(1)' })).toBeUndefined();
    expect(formatCoverCredit({ name: 'A', url: 'https://unsplash.com/@a b' })).toBeUndefined();
  });

  it.each([
    '',
    'Alex Doe',
    'Alex Doe <>',
    'Alex Doe <not a url>',
    'Alex Doe <http://unsplash.com/@alex>',
    'Alex Doe <javascript:alert(1)>',
    '<https://unsplash.com/@alex>',
    ' <https://unsplash.com/@alex>',
    'https://unsplash.com/@alex',
  ])('parses malformed value %j as absent', (raw) => {
    expect(parseCoverCredit(raw)).toBeUndefined();
  });
});

function pageWith(metadata: Partial<Page['metadata']>): Page {
  return {
    id: 'p1',
    type: 'note',
    name: 'Note',
    path: 'Note.md',
    parentId: null,
    metadata: { ...resolvePageMetadata({ id: 'p1' }), ...metadata },
    source: { markdown: 'Body' },
    analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  } as Page;
}

describe('cover credit frontmatter round trip', () => {
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();

  it('serializes right after `cover` and parses back into the same credit (a page)', () => {
    const text = serializer.serializePage(pageWith({ cover: COVER, coverCredit: CREDIT }));
    const lines = text.split('\n');

    expect(lines[lines.indexOf(`cover: ${COVER}`) + 1]).toBe(
      'coverCredit: Alex Doe <https://unsplash.com/@alex>'
    );
    expect(parser.parse(`${text}\n`).frontmatter.coverCredit).toEqual(CREDIT);
    expect(resolvePageMetadata(parser.parse(`${text}\n`).frontmatter).coverCredit).toEqual(CREDIT);
  });

  it('survives closing and reopening: the persisted file text rebuilds a page holding the credit', () => {
    const text = serializer.serializeDocument(pageWith({ cover: COVER, coverCredit: CREDIT }), 'Body');
    const scanned = parser.parse(text);
    const page = new PageBuilder().build({
      parentId: null,
      page: {
        path: '/vault/Note.md',
        directoryPath: '/vault',
        frontmatter: scanned.frontmatter,
        frontmatterAnalysis: scanned.frontmatterAnalysis,
        content: scanned.body,
        analysis: scanned.analysis,
      },
    });

    expect(page.metadata.cover).toBe(COVER);
    expect(page.metadata.coverCredit).toEqual(CREDIT);
  });

  it('omits the key without a credit, and an existing file without it parses as no credit', () => {
    const text = serializer.serializePage(pageWith({ cover: COVER }));

    expect(text).not.toContain('coverCredit');
    expect(parser.parse(`${text}\n`).frontmatter.coverCredit).toBeUndefined();
    expect(resolvePageMetadata(parser.parse(`${text}\n`).frontmatter).coverCredit).toBeNull();
  });

  it('treats a malformed coverCredit line as no credit (never an error)', () => {
    const parsed = parser.parse(`---\nid: p1\ncover: ${COVER}\ncoverCredit: garbage\n---\nBody`);

    expect(parsed.frontmatter.coverCredit).toBeUndefined();
    expect(parsed.frontmatter.cover).toBe(COVER);
  });

  it('is an owned key: never preserved as a custom property alongside the parsed credit', () => {
    const parsed = parser.parse(`---\nid: p1\ncoverCredit: Alex Doe <${CREDIT.url}>\n---\nBody`);

    expect(parsed.frontmatter.unownedLines ?? []).toEqual([]);
  });

  it('serialize() (a page created already holding a credit) writes the credit line, not "[object Object]"', () => {
    const text = serializer.serialize({ id: 'p1', cover: COVER, coverCredit: CREDIT });

    expect(text).toContain('coverCredit: Alex Doe <https://unsplash.com/@alex>');
    expect(text).not.toContain('[object Object]');
  });

  it('round-trips a folder cover credit and defaults to null', () => {
    const folder = {
      id: 'f1',
      name: 'Folder',
      path: '/vault/Folder',
      parentId: null,
      metadata: {
        ...new FolderBuilder().build({
          parentId: null,
          directory: { path: '/vault/Folder', parentPath: '/vault', frontmatter: { id: 'f1' } },
        }).metadata,
        cover: COVER,
        coverCredit: CREDIT,
      },
    } as Folder;

    const text = serializer.serializeFolderDocument(folder);
    const frontmatter = parser.parse(text).frontmatter;
    const rebuilt = new FolderBuilder().build({
      parentId: null,
      directory: { path: '/vault/Folder', parentPath: '/vault', frontmatter },
    });

    expect(rebuilt.metadata.coverCredit).toEqual(CREDIT);
    expect(
      new FolderBuilder().build({
        parentId: null,
        directory: { path: '/vault/Other', parentPath: '/vault', frontmatter: { id: 'f2' } },
      }).metadata.coverCredit
    ).toBeNull();
  });
});
