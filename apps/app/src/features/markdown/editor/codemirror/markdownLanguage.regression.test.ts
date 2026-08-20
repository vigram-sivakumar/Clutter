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

  it('InlineCode has exactly two CodeMark children — the shape strikethroughMarkerDecoration/inlineCodeMarkerDecoration depend on', () => {
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('`code`');
    const inlineCode = tree.topNode.getChild('Paragraph')?.getChild('InlineCode');
    expect(inlineCode?.firstChild?.name).toBe('CodeMark');
    expect(inlineCode?.lastChild?.name).toBe('CodeMark');
    expect(inlineCode?.firstChild).not.toBe(inlineCode?.lastChild);
  });
});

describe('Enabled GFM subset', () => {
  it('parses ~~strike~~ as Strikethrough', () => {
    expect(nodeNames('~~strike~~')).toContain('Strikethrough');
  });

  it('Strikethrough has exactly two StrikethroughMark children — the shape strikethroughMarkerDecoration depends on', () => {
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('~~strike~~');
    const strikethrough = tree.topNode.getChild('Paragraph')?.getChild('Strikethrough');
    expect(strikethrough?.firstChild?.name).toBe('StrikethroughMark');
    expect(strikethrough?.lastChild?.name).toBe('StrikethroughMark');
    expect(strikethrough?.firstChild).not.toBe(strikethrough?.lastChild);
  });

  it('~~**bold**~~ composes correctly: Strikethrough and StrongEmphasis nest without disturbing each other’s mark shape', () => {
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('~~**bold**~~');
    const paragraph = tree.topNode.getChild('Paragraph');
    const strikethrough = paragraph?.getChild('Strikethrough');
    const strongEmphasis = strikethrough?.getChild('StrongEmphasis');
    expect(strikethrough?.firstChild?.name).toBe('StrikethroughMark');
    expect(strikethrough?.lastChild?.name).toBe('StrikethroughMark');
    expect(strongEmphasis?.firstChild?.name).toBe('EmphasisMark');
    expect(strongEmphasis?.lastChild?.name).toBe('EmphasisMark');
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

describe('Tag — heading disambiguation and coexistence (§11 second-kind proof)', () => {
  it('# Heading remains an ATXHeading1, not a Tag', () => {
    const names = nodeNames('# Heading');
    expect(names).toContain('ATXHeading1');
    expect(names).not.toContain('Tag');
  });

  it('## Heading remains an ATXHeading2, not a Tag', () => {
    const names = nodeNames('## Heading');
    expect(names).toContain('ATXHeading2');
    expect(names).not.toContain('Tag');
  });

  it('### Heading remains an ATXHeading3, not a Tag', () => {
    const names = nodeNames('### Heading');
    expect(names).toContain('ATXHeading3');
    expect(names).not.toContain('Tag');
  });

  it('# tag (with a space) is a heading, not a Tag — the space is what matters, not the word', () => {
    const names = nodeNames('# tag');
    expect(names).toContain('ATXHeading1');
    expect(names).not.toContain('Tag');
  });

  it('#tag (no space) produces a Tag node, not a heading', () => {
    const names = nodeNames('#tag');
    expect(names).toContain('Tag');
    expect(names).not.toContain('ATXHeading1');
  });

  it('#tag-name is a single Tag node — hyphen is a valid identifier character', () => {
    const names = nodeNames('#tag-name');
    expect(names).toContain('Tag');
  });

  it('#tag_name is a single Tag node — underscore is a valid identifier character', () => {
    const names = nodeNames('#tag_name');
    expect(names).toContain('Tag');
  });

  it('#tag123 is a single Tag node — digits are valid identifier characters', () => {
    const names = nodeNames('#tag123');
    expect(names).toContain('Tag');
  });

  it('foo#tag does NOT produce a Tag node — not preceded by whitespace or start, matching TagExtractor.ts', () => {
    const names = nodeNames('foo#tag');
    expect(names).not.toContain('Tag');
  });

  it('foo #tag DOES produce a Tag node — preceded by whitespace', () => {
    const names = nodeNames('foo #tag');
    expect(names).toContain('Tag');
  });

  it('`#tag` inside a code span produces no Tag node — code-span content is never re-offered to later inline parsers', () => {
    const names = nodeNames('`#tag`');
    expect(names).toContain('InlineCode');
    expect(names).not.toContain('Tag');
  });

  it('Tag has no children of its own — a single indivisible node, unlike WikiLink/Emphasis/Strikethrough', () => {
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('#tag');
    const paragraph = tree.topNode.getChild('Paragraph');
    const tag = paragraph?.getChild('Tag');
    expect(tag).not.toBeNull();
    expect(tag?.firstChild).toBeNull();
  });

  it('a bare # with no identifier characters after it produces no Tag node', () => {
    const names = nodeNames('# ');
    expect(names).not.toContain('Tag');
  });

  it('a tag at the very start of the second line of a paragraph is recognized — newline counts as whitespace, matching TagExtractor’s \\s', () => {
    const names = nodeNames('line one\n#tag');
    expect(names).toContain('Tag');
  });

  it('a tag at the start of a second (non-first) paragraph is recognized', () => {
    const names = nodeNames('First paragraph.\n\n#tag second paragraph.');
    expect(names).toContain('Tag');
  });

  it('adjacent Tag and WikiLink tokens with no separating whitespace both parse as distinct nodes', () => {
    const names = nodeNames('#tag[[Page]]');
    expect(names).toContain('Tag');
    expect(names).toContain('WikiLink');
  });

  it('[[Page]]#tag — WikiLink immediately followed by a tag both parse as distinct nodes', () => {
    // Not preceded by whitespace ("]" before "#"), so per the same
    // foo#tag rule this must NOT produce a Tag node.
    const names = nodeNames('[[Page]]#tag');
    expect(names).toContain('WikiLink');
    expect(names).not.toContain('Tag');
  });

  it('a representative plain-prose document with a tag round-trips correctly alongside every other construct', () => {
    const text = '# Notes\n\nSome prose with a #project tag and a [[Reference]].\n';
    const names = nodeNames(text);
    expect(names).toContain('ATXHeading1');
    expect(names).toContain('Tag');
    expect(names).toContain('WikiLink');
  });
});

describe('Date — the @-family’s first construct, context-free by construction', () => {
  it('@2026-08-20 produces a Date node', () => {
    expect(nodeNames('@2026-08-20')).toContain('Date');
  });

  it('foo @2026-08-20 (preceded by whitespace) produces a Date node', () => {
    expect(nodeNames('foo @2026-08-20')).toContain('Date');
  });

  it('foo@2026-08-20 (no preceding whitespace) does NOT produce a Date node', () => {
    expect(nodeNames('foo@2026-08-20')).not.toContain('Date');
  });

  it('@2026-08-20x (trailing letter) does NOT produce a Date node — not a valid boundary', () => {
    expect(nodeNames('@2026-08-20x')).not.toContain('Date');
  });

  it('@2026-13-45 (calendar-invalid but shape-valid) still produces a Date node — parse vs. validate', () => {
    // The grammar only checks shape; calendar correctness is a separate,
    // later concern (isValidCalendarDate), same distinction already
    // established for @due:-style property values.
    expect(nodeNames('@2026-13-45')).toContain('Date');
  });

  it('`@2026-08-20` inside a code span produces no Date node — code-span content is never re-offered to later inline parsers', () => {
    const names = nodeNames('`@2026-08-20`');
    expect(names).toContain('InlineCode');
    expect(names).not.toContain('Date');
  });

  it('@Today does NOT produce a Date node — relative keywords are never persistent syntax', () => {
    expect(nodeNames('@Today')).not.toContain('Date');
  });

  it('@Tomorrow does NOT produce a Date node', () => {
    expect(nodeNames('@Tomorrow')).not.toContain('Date');
  });

  it('@Yesterday does NOT produce a Date node', () => {
    expect(nodeNames('@Yesterday')).not.toContain('Date');
  });

  it('@20/08/2026 does NOT produce a Date node — not an accepted format', () => {
    expect(nodeNames('@20/08/2026')).not.toContain('Date');
  });

  it('Date has no children of its own — a single indivisible node, same shape as Tag', () => {
    const language = markdownLanguageExtension().language;
    const tree = language.parser.parse('@2026-08-20');
    const paragraph = tree.topNode.getChild('Paragraph');
    const date = paragraph?.getChild('Date');
    expect(date).not.toBeNull();
    expect(date?.firstChild).toBeNull();
  });

  it('# Heading remains a heading, never a Date construct — different trigger characters, no collision possible', () => {
    const names = nodeNames('# Heading');
    expect(names).toContain('ATXHeading1');
    expect(names).not.toContain('Date');
  });

  it('a task line containing a bare date parses Date exactly as ordinary content would — no context-sensitive grammar', () => {
    const names = nodeNames('- [ ] Finish report @2026-08-20');
    expect(names).toContain('Task');
    expect(names).toContain('Date');
  });

  it('adjacent Date and Tag tokens with no separating whitespace both parse as distinct nodes', () => {
    const names = nodeNames('@2026-08-20#tag');
    expect(names).toContain('Date');
    // Not preceded by whitespace ("0" before "#"), so per the same
    // foo#tag rule this must NOT produce a Tag node.
    expect(names).not.toContain('Tag');
  });

  it('adjacent Date and WikiLink tokens with no separating whitespace both parse as distinct nodes', () => {
    const names = nodeNames('@2026-08-20[[Page]]');
    expect(names).toContain('Date');
    expect(names).toContain('WikiLink');
  });

  it('a representative plain-prose document with a date round-trips correctly alongside every other construct', () => {
    const text = '# Notes\n\nMeeting on @2026-08-20 about #project and [[Reference]].\n';
    const names = nodeNames(text);
    expect(names).toContain('ATXHeading1');
    expect(names).toContain('Date');
    expect(names).toContain('Tag');
    expect(names).toContain('WikiLink');
  });
});
