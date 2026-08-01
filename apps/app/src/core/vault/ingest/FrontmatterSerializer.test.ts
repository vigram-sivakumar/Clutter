import { describe, expect, it } from 'vitest';
import { FrontmatterSerializer } from './FrontmatterSerializer';
import { FrontmatterParser } from './FrontmatterParser';
import type { Page } from '../models/Page';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-123',
    type: 'note',
    name: 'My Note',
    path: 'My Note.md',
    parentId: null,
    metadata: {
      icon: '📝',
      cover: null,
      description: null,
      favorite: true,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    source: {
      markdown: 'Hello world',
    },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
    ...overrides,
  };
}

describe('FrontmatterSerializer round-trip', () => {
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();

  it('preserves id, type, favorite, icon, status, createdAt, updatedAt through serialize -> parse', () => {
    const page = makePage();

    const frontmatterBlock = serializer.serializePage(page);
    const parsed = parser.parse(`${frontmatterBlock}\n`);

    expect(parsed.frontmatter.id).toBe(page.id);
    expect(parsed.frontmatter.type).toBe(page.type);
    expect(parsed.frontmatter.favorite).toBe(page.metadata.favorite);
    expect(parsed.frontmatter.icon).toBe(page.metadata.icon);
    // FrontmatterSerializer.serializePage does not emit a "status" key by
    // its documented field list (see entries[] in FrontmatterSerializer);
    // "status" is written under the "status" key so parse should recover it.
    expect(parsed.frontmatter.status).toBe(page.metadata.status);
    expect(parsed.frontmatter.created).toBe(page.metadata.createdAt);
    expect(parsed.frontmatter.modified).toBe(page.metadata.updatedAt);
  });

  it('produces deterministic output for identical Page models', () => {
    const page = makePage();

    const first = serializer.serializePage(page);
    const second = serializer.serializePage(page);

    expect(first).toBe(second);
  });

  it('omits undefined optional fields rather than emitting "undefined"', () => {
    const page = makePage({
      metadata: {
        ...makePage().metadata,
        icon: null,
        cover: null,
        description: null,
        archivedAt: null,
      },
    });

    const frontmatterBlock = serializer.serializePage(page);

    expect(frontmatterBlock).not.toContain('undefined');
  });
});
