import type { PageFrontmatter } from './frontmatter';

/**
 * FrontmatterSerializer is the sole component responsible for converting the canonical `PageFrontmatter` model
 * into persisted YAML. It acts as the persistence boundary between Clutter's metadata model and Markdown files.
 *
 * Deterministic serialization is an architectural requirement to ensure that identical metadata always produces
 * identical output. Serialization should never invent, derive, or validate metadata; it only formats already
 * validated data.
 */
export class FrontmatterSerializer {
  /**
   * Serializes only defined values from the provided frontmatter.
   * The output is intended to be deterministic.
   * Future implementations may support richer YAML features such as arrays,
   * multiline values, escaping, and quoting, while preserving the same public contract.
   */
  serialize(frontmatter: PageFrontmatter): string {
    const lines = ['---'];

    // TODO: Replace the current key/value formatting with a canonical YAML serializer.
    // Future versions must correctly handle arrays, multiline strings, escaping,
    // quoting and deterministic key ordering while preserving backwards compatibility.
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value !== undefined) {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push('---');

    return lines.join('\n');
  }
}
