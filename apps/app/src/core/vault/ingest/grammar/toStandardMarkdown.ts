import type { SyntaxNode } from '@lezer/common';
import { parser } from '@lezer/markdown';

import { FrontmatterParser } from '../FrontmatterParser';
import { markdownGrammarExtensions } from './markdownGrammarExtensions';
import { isQuoteNodeName, quotePrefixOf } from './quoteNodes';

const clutterParser = parser.configure(markdownGrammarExtensions);
const frontmatter = new FrontmatterParser();

/**
 * Rewrites Clutter's native Markdown into standard Markdown that other editors read the same way. Today that is
 * one construct: a `" text` quote (`ClutterQuote`) becomes a `> text` blockquote. A pure text-to-text function with
 * no caller yet beyond its tests: nothing in the app exports or converts a note, and the vault keeps `" ` as typed.
 *
 * What it changes, and only this:
 * - every `"` that the parse tree identifies as a quote marker becomes `>`, the space after it stays. Because the
 *   marker comes from the parse tree, `" ` inside fenced code, indented code, inline code or ordinary text
 *   (`"Hello" she said`, `Say " hello`) is never touched.
 * - where `>` would change what the text means, one separator line is added. A Clutter quote ends at the first line
 *   without a marker; a `>` quote lets a plain line join its paragraph (lazy continuation), so `" a⏎plain` becomes
 *   `> a⏎⏎plain`. The same holds between a native quote and an adjacent standard one (`" a⏎> b` would merge into one
 *   quote) and where a nested quote ends inside an outer one (`> > b⏎> c` would pull `c` into the inner quote), where
 *   the separator is the outer markers alone (`>`).
 *
 * Frontmatter is returned untouched. Text with no native quote comes back as the same string. A quote inside a list
 * item is converted but gets no separator, since a blank line there would turn a tight list loose.
 */
export function toStandardMarkdown(markdown: string): string {
  const { body } = frontmatter.split(markdown);
  if (!body.includes('" ')) {
    return markdown;
  }
  const converted = convertBody(body);
  return converted === body ? markdown : markdown.slice(0, markdown.length - body.length) + converted;
}

function convertBody(text: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const lineStarts: number[] = [];
  for (let at = 0, i = 0; i < lines.length; at += (lines[i] as string).length + eol.length, i++) {
    lineStarts.push(at);
  }
  const lineOf = (pos: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] as number) <= pos) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  };

  const marks: number[] = [];
  const quotes: SyntaxNode[] = [];
  clutterParser.parse(text).iterate({
    enter: (node) => {
      if (node.name === 'QuoteMark' && text[node.from] === '"') {
        marks.push(node.from);
      } else if (node.name === 'ClutterQuote') {
        quotes.push(node.node);
      }
    },
  });
  if (marks.length === 0) {
    return text;
  }

  const separators = new Map<number, string>();
  for (const quote of quotes) {
    planSeparators(quote, lines, lineOf, separators);
  }

  let converted = text;
  for (const pos of marks) {
    converted = `${converted.slice(0, pos)}>${converted.slice(pos + 1)}`;
  }
  const convertedLines = converted.split(eol);
  const output: string[] = [];
  convertedLines.forEach((line, index) => {
    const separator = separators.get(index);
    if (separator !== undefined) {
      output.push(separator);
    }
    output.push(line);
  });
  return output.join(eol);
}

/** The standard-Markdown form of a quote prefix: every `"` as `>`, without trailing spaces. */
function standardPrefix(prefix: string): string {
  return prefix.replace(/"/g, '>').trimEnd();
}

/** Records the separator lines `quote` needs before the line after it, and before its own first line. */
function planSeparators(
  quote: SyntaxNode,
  lines: readonly string[],
  lineOf: (pos: number) => number,
  separators: Map<number, string>
): void {
  let enclosing = 0;
  for (let node = quote.parent; node; node = node.parent) {
    if (node.name === 'ListItem') {
      return;
    }
    if (isQuoteNodeName(node.name)) {
      enclosing += 1;
    }
  }

  const first = lineOf(quote.from);
  const last = lineOf(quote.to);

  // After: the next line must not be pulled into, or merged with, the converted quote.
  const nextLine = lines[last + 1];
  if (nextLine !== undefined) {
    const next = quotePrefixOf(nextLine);
    if (next.tokens.length >= enclosing) {
      const outerEnd = enclosing === 0 ? 0 : (next.tokens[enclosing - 1] as { end: number }).end;
      if (nextLine.slice(outerEnd).trim() !== '' && !separators.has(last + 1)) {
        separators.set(last + 1, standardPrefix(nextLine.slice(0, outerEnd)));
      }
    }
  }

  // Before: a standard quote right above would merge with this one once both are `>`.
  const previousLine = lines[first - 1];
  if (previousLine !== undefined) {
    const previous = quotePrefixOf(previousLine);
    const sibling = previous.tokens[enclosing];
    if (previous.tokens.length > enclosing && sibling?.kind === '>' && !separators.has(first)) {
      const outerEnd = enclosing === 0 ? 0 : (previous.tokens[enclosing - 1] as { end: number }).end;
      separators.set(first, standardPrefix(previousLine.slice(0, outerEnd)));
    }
  }
}
