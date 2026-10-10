import { describe, expect, it } from 'vitest';

import { FolderBuilder } from './FolderBuilder';
import { FrontmatterParser } from './FrontmatterParser';
import { FrontmatterSerializer } from './FrontmatterSerializer';

const parse = (frontmatter: string) =>
  new FrontmatterParser().parse(`---\n${frontmatter}\n---\n`).frontmatter;

const build = (frontmatter: ReturnType<typeof parse> | null) =>
  new FolderBuilder().build({
    parentId: null,
    directory: { path: '/vault/Projects', parentPath: '/vault', frontmatter },
  });

describe('folder defaultTemplateId (.folder.md)', () => {
  it('parses the key as the template page id', () => {
    expect(parse('id: f1\ndefaultTemplateId: template-meeting-note').defaultTemplateId).toBe(
      'template-meeting-note'
    );
  });

  it('ignores an empty value', () => {
    expect(parse('id: f1\ndefaultTemplateId:').defaultTemplateId).toBeUndefined();
  });

  it('a missing key (or a missing .folder.md) builds as null', () => {
    expect(build(parse('id: f1')).metadata.defaultTemplateId).toBeNull();
    expect(build(null).metadata.defaultTemplateId).toBeNull();
  });

  it('builds the stored id into the folder metadata', () => {
    expect(build(parse('id: f1\ndefaultTemplateId: tpl-1')).metadata.defaultTemplateId).toBe('tpl-1');
  });

  it('serializes the field next to the rest of the metadata, and omits it when null', () => {
    const serializer = new FrontmatterSerializer();
    const folder = build(parse('id: f1\nicon: 🚀\nfavorite: true\ndefaultTemplateId: tpl-1'));

    const written = serializer.serializeFolder(folder);
    expect(written).toContain('defaultTemplateId: tpl-1');
    expect(written).toContain('icon: 🚀');
    expect(written).toContain('favorite: true');
    expect(build(parse(written.replace(/^---\n|\n---$/g, ''))).metadata).toEqual(folder.metadata);

    const cleared = serializer.serializeFolder({
      ...folder,
      metadata: { ...folder.metadata, defaultTemplateId: null },
    });
    expect(cleared).not.toContain('defaultTemplateId');
  });
});
