import type { Frontmatter } from '../models';

export interface ParsedMarkdown {
  frontmatter: Frontmatter;
  body: string;
}

export class FrontmatterParser {
  parse(content: string): ParsedMarkdown {
    // 1. Check for opening delimiter
    if (!content.startsWith('---\n')) {
      return { frontmatter: {}, body: content };
    }
    // 2. Find closing delimiter
    const endIdx = content.indexOf('\n---', 4);
    if (endIdx === -1) {
      return { frontmatter: {}, body: content };
    }
    // 3. Extract frontmatter text
    const frontmatterText = content.slice(4, endIdx);
    // 4. Extract body, trimming a single leading newline if present
    let body = content.slice(endIdx + 4);
    if (body.startsWith('\n')) {
      body = body.slice(1);
    }
    // 5. Parse frontmatter line by line
    const frontmatter: Frontmatter = {};
    for (const line of frontmatterText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const sepIdx = trimmed.indexOf(':');
      if (sepIdx === -1) continue;
      const key = trimmed.slice(0, sepIdx).trim();
      const value = trimmed.slice(sepIdx + 1).trim();
      switch (key) {
        case 'id':
          frontmatter.id = value;
          break;
        case 'type':
          if (
            value === 'note' ||
            value === 'daily-note' ||
            value === 'folder'
          ) {
            frontmatter.type = value;
          }
          break;
        case 'icon':
          frontmatter.icon = value;
          break;
        case 'cover':
          frontmatter.cover = value;
          break;
        case 'description':
          frontmatter.description = value;
          break;
        case 'originalParentId':
          frontmatter.originalParentId = value;
          break;
        case 'createdAt':
          frontmatter.createdAt = value;
          break;
        case 'updatedAt':
          frontmatter.updatedAt = value;
          break;
      }
    }
    // 6. Return result
    return { frontmatter, body };
  }
}
