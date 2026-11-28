import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { planTableEdit } from './tableCommands';

/** Test-only non-identity persistence policy, using the canonical explicit
 * format command rather than a second formatter. Production saves are exact. */
export function formatTablesForTest(markdown: string): string {
  const parse = (source: string) => sharedMarkdownParser.parse(source);
  const positions: number[] = [];
  parse(markdown).iterate({ enter(node) {
    if (node.name !== 'Table') return;
    if (node.node.parent?.name === 'Document') positions.push(node.from);
    return false;
  } });
  let result = markdown;
  // Right to left preserves earlier source positions.
  for (const from of positions.reverse()) {
    const edit = planTableEdit(result, from, { kind: 'format' }, parse);
    if (edit) result = edit.expectedDocument;
  }
  return result;
}
