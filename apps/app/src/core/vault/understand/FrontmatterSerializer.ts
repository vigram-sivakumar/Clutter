import type { PageFrontmatter } from './frontmatter';

/**
 * Serializes canonical page metadata into YAML frontmatter.
 *
 * This is the counterpart to FrontmatterParser. Both classes must operate on
 * the same PageFrontmatter model to ensure a single canonical representation.
 */
export class FrontmatterSerializer {
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
}
