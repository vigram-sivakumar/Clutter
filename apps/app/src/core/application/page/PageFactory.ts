import type { PageFrontmatter } from '../../vault/ingest/frontmatter';
import { FrontmatterSerializer } from '../../vault/ingest';

/**
 * Constructs the initial Markdown content for newly created pages.
 *
 * Responsibilities:
 * - Construct page frontmatter.
 * - Serialize frontmatter.
 * - Append optional body content.
 *
 * Does NOT:
 * - Generate IDs.
 * - Generate timestamps.
 * - Read or write files.
 * - Choose templates.
 */
export class PageFactory {
  private readonly serializer = new FrontmatterSerializer();

  create(frontmatter: PageFrontmatter, body = ''): string {
    return `${this.serializer.serialize(frontmatter)}\n${body}`;
  }
}
