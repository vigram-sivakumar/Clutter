import type { Page } from '../models/Page';
import type { PageFrontmatter } from './frontmatter';

/**
 * FrontmatterSerializer is the sole component responsible for converting the canonical `Page` model
 * into persisted YAML. It acts as the persistence boundary between Clutter's metadata model and Markdown files.
 *
 * Deterministic serialization is an architectural requirement to ensure that identical metadata always produces
 * identical output. Serialization should never invent, derive, or validate metadata; it only formats already
 * validated data.
 *
 * It also assembles the canonical persisted Markdown document by combining
 * serialized frontmatter with committed Markdown content.
 *
 * The serializer derives persisted frontmatter from the immutable `Page` model.
 *
 * It supports both serialization of persisted pages (`Page`) and page creation frontmatter (`PageFrontmatter`).
 */
export class FrontmatterSerializer {
  /**
   * Serializes persisted frontmatter during page creation.
   */
  serialize(frontmatter: PageFrontmatter): string {
    const lines = ['---'];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (value !== undefined) {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Serializes only defined values from the provided page.
   * The output is intended to be deterministic.
   * Future implementations may support richer YAML features such as arrays,
   * multiline values, escaping, and quoting, while preserving the same public contract.
   */
  serializePage(page: Page): string {
    const lines = ['---'];

    // Metadata is serialized in a deterministic order so identical Page models
    // always produce identical persisted output.
    // Future iterations may replace this formatter with a full YAML serializer
    // while preserving the same canonical field ordering.
    const entries: [string, any][] = [
      ['id', page.id],
      ['type', page.type],
      ['created', page.metadata.createdAt],
      ['modified', page.metadata.updatedAt],
      ['favorite', page.metadata.favorite],
      ['icon', page.metadata.icon],
      ['cover', page.metadata.cover],
      ['description', page.metadata.description],
      ['status', page.metadata.status],
      ['archivedAt', page.metadata.archivedAt],
      ['originalPath', page.metadata.originalPath],
      ['originalParentId', page.metadata.originalParentId],
    ];

    for (const [key, value] of entries) {
      if (value !== undefined) {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Serializes a complete Markdown document consisting of YAML frontmatter
   * followed by the Markdown body.
   *
   * This is the canonical representation written to disk.
   */
  serializeDocument(page: Page, markdown: string): string {
    return `${this.serializePage(page)}\n${markdown}`;
  }
}
