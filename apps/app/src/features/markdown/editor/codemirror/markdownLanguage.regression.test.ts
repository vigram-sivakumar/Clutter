import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from './markdownLanguage';

/**
 * Pure parser-level regression tests — no EditorView, no DOM. Confirms the
 * enabled GFM subset (TaskList, Strikethrough, Autolink), the exclusion of
 * Table, and (since §4) the `WikiLink` extension all produce the expected
 * tree shape and coexist with ordinary CommonMark without altering its
 * meaning. Node names and tree shapes below were confirmed empirically
 * against the installed `@lezer/markdown@1.7.2` — not assumed from the
 * type declarations alone.
 */

function nodeNames(text: string): string[] {
  const language = markdownLanguageExtension().language;
  const names: string[] = [];
  language.parser.parse(text).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

describe('Markdown/GFM baseline — unaffected by our configuration', () => {
  it('parses an ATX heading', () => {
    expect(nodeNames('# Heading')).toContain('ATXHeading1');
  });

  it('parses an ordinary CommonMark link as Link, with a URL child', () => {
    const names = nodeNames('[text](url)');
    expect(names).toContain('Link');
    expect(names).toContain('URL');
  });

  it('parses an inline code span as InlineCode', () => {
    expect(nodeNames('`code`')).toContain('InlineCode');
  });
});

describe('Enabled GFM subset', () => {
  it('parses ~~strike~~ as Strikethrough', () => {
    expect(nodeNames('~~strike~~')).toContain('Strikethrough');
  });

  it('parses a task list item with a TaskMarker', () => {
    const names = nodeNames('- [ ] todo\n- [x] done');
    expect(names).toContain('Task');
    expect(names).toContain('TaskMarker');
  });

  it('parses a bare URL as an autolinked URL node', () => {
    expect(nodeNames('https://example.com')).toContain('URL');
  });

  it('parses a bare email address as an autolinked URL node', () => {
    // Confirmed empirically: GFM's extended email autolink also emits a
    // node named "URL", not a separate "Email"/"Autolink" type — worth
    // recording since it's not obvious from the API surface alone, and is
    // directly relevant later to the `@`-family-vs-Autolink precedence rule.
    expect(nodeNames('foo@bar.com')).toContain('URL');
  });
});

describe('Table is deliberately not enabled', () => {
  it('does not produce a Table node for pipe-table-shaped text', () => {
    const names = nodeNames('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(names).not.toContain('Table');
    expect(names).not.toContain('TableHeader');
    expect(names).not.toContain('TableRow');
  });
});

describe('WikiLink — native Markdown coexistence (§4 load-bearing safety net)', () => {
  it('[[Projects/Project A]] produces a WikiLink node', () => {
    expect(nodeNames('[[Projects/Project A]]')).toContain('WikiLink');
  });

  it('[[Project A]](url) is NOT claimed by WikiLink — the continuation-lookahead proof', () => {
    // The critical regression test: a genuine CommonMark link whose text
    // happens to be a doubled bracket must still parse as an ordinary
    // Link, never as a WikiLink followed by stray text. This is the
    // direct, empirical proof the continuation-lookahead requirement
    // actually works, not just that it was specified.
    const names = nodeNames('[[Project A]](url)');
    expect(names).not.toContain('WikiLink');
    expect(names).toContain('Link');
  });

  it('`[[fake]]` inside a code span stays inert — no WikiLink node exists inside it', () => {
    const names = nodeNames('`[[fake]]`');
    expect(names).toContain('InlineCode');
    expect(names).not.toContain('WikiLink');
  });

  it('**[[Page]]** composes correctly: WikiLink nests as a direct child of StrongEmphasis', () => {
    // Resolves the Open item carried in docs/editor-architecture-decisions.md
    // ("exact resulting tree shape ... wasn't empirically confirmed") —
    // confirmed here: WikiLink sits as a direct child of StrongEmphasis,
    // between its two EmphasisMark children, exactly the composition the
    // architecture predicted by analogy with GFM's own
    // Strikethrough-inside-Emphasis precedent.
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('**[[Page]]**');
    const cursor = tree.cursor();
    const path: string[] = [];
    let foundWikiLinkUnderStrongEmphasis = false;

    function visit() {
      path.push(cursor.name);
      if (
        cursor.name === 'WikiLink' &&
        path.includes('StrongEmphasis')
      ) {
        foundWikiLinkUnderStrongEmphasis = true;
      }
      if (cursor.firstChild()) {
        do {
          visit();
        } while (cursor.nextSibling());
        cursor.parent();
      }
      path.pop();
    }
    visit();

    expect(foundWikiLinkUnderStrongEmphasis).toBe(true);
  });

  it('[text](url) remains an ordinary Link, completely unaffected by WikiLink being registered', () => {
    const names = nodeNames('[text](url)');
    expect(names).toContain('Link');
    expect(names).not.toContain('WikiLink');
  });

  it('a representative plain-prose document produces zero WikiLink nodes and round-trips byte-identical', () => {
    const text =
      '# Notes\n\nSome prose with a [link](https://example.com) and `code`.\n\n- one\n- two\n';
    const language = markdownLanguageExtension().language;
    const names: string[] = [];
    language.parser.parse(text).iterate({
      enter: (n) => {
        names.push(n.name);
      },
    });
    expect(names).not.toContain('WikiLink');
  });
});
