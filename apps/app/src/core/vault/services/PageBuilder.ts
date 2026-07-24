import type { Page } from '../models';
import type { ParsedMarkdown } from '../parsers';

export class PageBuilder {
  build(
    markdown: ParsedMarkdown,
    path: string,
    parentId: string | null
  ): Page | null {
    const id = markdown.frontmatter.id;

    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }

    const type = markdown.frontmatter.type;

    return {
      id,
      path,
      type: type ?? 'note',
      name: path.split('/').pop()!.replace(/\.md$/, ''),

      icon: markdown.frontmatter.icon,
      cover: markdown.frontmatter.cover,
      description: markdown.frontmatter.description,

      parentId,
      originalParentId: markdown.frontmatter.originalParentId ?? null,

      createdAt: markdown.frontmatter.createdAt,
      updatedAt: markdown.frontmatter.updatedAt,
    };
  }
}
