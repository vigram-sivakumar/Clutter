import { FrontmatterParser } from '../FrontmatterParser';
import { FrontmatterSerializer } from '../FrontmatterSerializer';
import { PageBuilder } from '../PageBuilder';
import type { Page } from '../../models/Page';
import { systemValuePatch, type PropertyFrontmatter } from './propertyLines';

/**
 * Test support: a whole Markdown document read the way Clutter reads a file, and written the way Clutter
 * writes one — so a property change can be asserted on the actual frontmatter text, not just on preserved
 * lines.
 */

const parser = new FrontmatterParser();

/** The page Clutter builds from `document`, and the preserved-frontmatter state the property operations work on. */
export function readDocument(document: string): { page: Page; state: PropertyFrontmatter; body: string } {
  const parsed = parser.parse(document);
  const page = new PageBuilder('/vault').build({
    parentId: null,
    page: {
      path: '/vault/N.md',
      directoryPath: '/vault',
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: { aliases: [] },
      content: parsed.body,
      analysis: parsed.analysis,
    } as never,
  });

  return {
    page,
    state: {
      lines: page.metadata.unownedFrontmatter ?? [],
      order: page.metadata.frontmatterEntryOrder,
    },
    body: parsed.body,
  };
}

/** `document` after `change` — the file text the Gate would write (and the page rebuilt from it re-read). */
export function writeDocument(
  document: string,
  change: (state: PropertyFrontmatter) => PropertyFrontmatter | null
): string {
  const { page, state, body } = readDocument(document);
  const next = change(state);

  if (next === null) {
    return document;
  }

  const patched: Page = {
    ...page,
    metadata: {
      ...page.metadata,
      unownedFrontmatter: next.lines,
      ...(next.order !== undefined && { frontmatterEntryOrder: next.order }),
      ...systemValuePatch(next),
    },
  };

  return new FrontmatterSerializer().serializeDocument(patched, body);
}

/** The frontmatter lines of a document, without the `---` fences. */
export function frontmatterLines(document: string): string[] {
  const lines = document.split('\n');
  const end = lines.indexOf('---', 1);

  return lines.slice(1, end);
}

/** A frontmatter block assembled from lines, plus a body. */
export const documentOf = (...lines: string[]): string => `---\n${lines.join('\n')}\n---\nBody`;
