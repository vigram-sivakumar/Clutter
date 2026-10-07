import { parser } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';

import { findTagOccurrences } from '@core/vault/ingest/tag/findTagOccurrences';

import { markdownGrammarExtensions } from '../../../../../core/vault/ingest/grammar/markdownGrammarExtensions';

const editorParser = parser.configure(markdownGrammarExtensions);

function editorTags(markdown: string): string[] {
  const out: string[] = [];
  editorParser.parse(markdown).iterate({
    enter(node) {
      if (node.name === 'Tag') {
        out.push(`${node.from}:${markdown.slice(node.from, node.to)}`);
      }
    },
  });
  return out;
}

function ingestTags(markdown: string): string[] {
  return findTagOccurrences(markdown).map((s) => `${s.startOffset}:#${s.name}`);
}

// The contract: the editor's `Tag` nodes and Vault Ingest's extraction are
// the same set at the same offsets — including inside WikiLinks, embeds,
// images, dividers and dates, since both parse with one shared grammar. Any
// new tag or syntax rule must keep this green.
const CORPUS: readonly string[] = [
  '#design',
  'Working on #design today. Need more #research before shipping.',
  '# Heading\n\n#tag after heading',
  '`#design` and #real',
  '```text\n#design\n```\n#after',
  '~~~\n#x\n~~~',
  '\\#escaped and #real',
  'foo#bar https://example.com/a#b',
  '#café #日本語 #naïve-design #C++ #foo/bar #123 #design- #foo.bar',
  '- [ ] task #a\n- [x] done #b',
  '> quote #q\n> > nested #n',
  '| a | b |\n| - | - |\n| #x | #y |',
  '**bold #b** *em #e* ~~strike #s~~ ==mark #m==',
  '[see #design](note.md) ![alt #img](a.png)',
  'para\n\n    #indented text',
  '<div>#html</div>',
  '#a\n#b\n\n#c',
  '[[Note #heading]] and [[Note #x|alias #y]] #real',
  '![[Note #x]] ![[image.png #p]] #real',
  '![alt](a b.png #x) #real',
  '--- label #x ---\n#real',
  '@today #real and @2026-10-07 #also',
  'example.com #real example.com/#frag',
  '- [x] done ✓ 2026-10-07 #real',
];

describe('tag grammar parity: editor Tag nodes ≡ ingest extraction', () => {
  for (const markdown of CORPUS) {
    it(JSON.stringify(markdown), () => {
      expect(ingestTags(markdown)).toEqual(editorTags(markdown));
    });
  }
});
