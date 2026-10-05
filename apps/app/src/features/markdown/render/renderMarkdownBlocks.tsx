import { createElement, type ReactNode } from 'react';
import type { SyntaxNode } from '@lezer/common';

import { parseTableColumnWidthsAttribute } from '../editor/codemirror/table/tableColumnWidthMetadata';
import { dividerLabelText, trimEdgeWhitespace } from './blocks/selectCompactBlock';
import { tokenizeInline, type InlineSpan } from './inlineSpan';
import { renderCompactSpans, type CompactMarkdownResolvers } from './renderCompactMarkdown';
import { DEFAULT_PREVIEW_LIMITS, extractPreviewBlocks, type PreviewLimits } from './extractPreviewBlocks';

/**
 * Block-level, read-only React rendering of a whole Markdown document — the
 * counterpart to `renderCompactMarkdown`'s single-inline-run output, for
 * surfaces that show document *structure* without CodeMirror (currently the
 * Card view's `NotePageCanvas`).
 *
 * Not a second Markdown implementation: the tree comes from
 * `sharedMarkdownParser` (the exact grammar the editor parses with), every
 * block's inline content is `tokenizeInline` -> `renderCompactSpans` (the
 * same span vocabulary and renderer the compact surface uses, including its
 * strike-ownership contract), and this module only maps *block* node names
 * to HTML elements. Deterministic and side-effect free: no anchors, no
 * handlers, no editor state — a Link/WikiLink/Tag renders as a styled
 * `<span>`, never an `<a>`.
 *
 * Vertical spacing is plain CSS owned by the card preview
 * (`NotePageCanvas.css`, a small semantic scale per block type) — not the
 * editor's separator algorithm, which needs an `EditorState`. The one
 * structural concession to how a note reads: a paragraph's soft line breaks
 * render as separate lines (`markdown-blocks__line`), since the editor shows
 * each source line as its own line.
 *
 * Block coverage: ATX/Setext headings, paragraphs, bullet/ordered/emoji
 * lists (nested, with task markers), blockquotes (nested blocks), fenced
 * code (plain text — no syntax highlighting at this scale), tables (with
 * column alignment), and the native + Clutter divider variants (with
 * labels). Anything else (raw HTML blocks, link reference definitions) is
 * intentionally omitted, never partially exposed.
 */

interface BlockContext {
  readonly text: string;
  readonly resolvers: CompactMarkdownResolvers;
}

const HEADING_NODE_LEVELS: Readonly<Record<string, number>> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
};

const DIVIDER_VARIANTS: Readonly<Record<string, string>> = {
  HorizontalRule: 'plain',
  WavyHorizontalRule: 'wavy',
  DoubleHorizontalRule: 'double',
  DottedHorizontalRule: 'dotted',
  LabeledHorizontalRule: 'labeled',
};

const LIST_NODE_NAMES: ReadonlySet<string> = new Set(['BulletList', 'OrderedList', 'EmojiList']);

type CellAlignment = 'left' | 'center' | 'right' | undefined;

/**
 * The task checkbox, drawn exactly as the editor draws it — same circle
 * glyphs as `shared/icon/svg/checkbox-checked.svg`/`checkbox-unchecked.svg`
 * (the editor's `TaskCheckboxWidget` inlines the same markup, since neither
 * a widget nor this renderer can use the `.svg?react` asset's component for
 * a purely presentational, non-interactive glyph at this scale). Keep in
 * sync with those files. Inert: no button, no handler — the preview never
 * toggles a task.
 */
function TaskCheckboxIcon({ checked }: { checked: boolean }): ReactNode {
  return (
    <svg
      className="markdown-blocks__task-box"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {checked ? (
        <>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path
            d="M5 8.42857L6.8 11L11 5"
            stroke="var(--icon-on-accent, #FFF)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <circle cx="8" cy="8" r="7.4" stroke="currentColor" />
      )}
    </svg>
  );
}

function renderInline(node: SyntaxNode, ctx: BlockContext, from?: number): ReactNode[] {
  return renderCompactSpans(trimEdgeWhitespace(tokenizeInline(node, ctx.text, from, { includeImageSrc: true })), ctx.resolvers);
}

/**
 * Splits spans at the soft line breaks (`\n`) in their plain-text runs, so
 * each source line of a paragraph can be its own line, as in the editor.
 * Only top-level text spans are split; a break inside a styled span
 * (`**a\nb**`) stays in that span's line — rare, and splitting there would
 * mean re-opening the span on the next line.
 */
function splitSpansIntoLines(spans: readonly InlineSpan[]): InlineSpan[][] {
  const lines: InlineSpan[][] = [[]];
  for (const span of spans) {
    if (span.kind !== 'text') {
      lines[lines.length - 1]!.push(span);
      continue;
    }
    span.value.split('\n').forEach((segment, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (segment.length > 0) {
        lines[lines.length - 1]!.push({ kind: 'text', value: segment });
      }
    });
  }
  return lines.map((line) => trimEdgeWhitespace(line)).filter((line) => line.length > 0);
}

/** A paragraph-like block's content: one run for a single line, one `markdown-blocks__line` per source line otherwise. */
function renderLines(node: SyntaxNode, ctx: BlockContext, from?: number): ReactNode[] {
  const lines = splitSpansIntoLines(tokenizeInline(node, ctx.text, from, { includeImageSrc: true }));
  if (lines.length <= 1) {
    return lines.length === 0 ? [] : renderCompactSpans(lines[0]!, ctx.resolvers);
  }
  return lines.map((line, index) => (
    <span key={index} className="markdown-blocks__line">
      {renderCompactSpans(line, ctx.resolvers)}
    </span>
  ));
}

/**
 * Skips a table's `{table-col-widths="..."}` attribute line, which the
 * grammar leaves as (the start of) the next sibling paragraph — same case
 * `selectCompactBlock.ts` handles. Returns where this paragraph's real
 * content starts, or `null` when nothing but the attribute line is there.
 */
function paragraphContentFrom(node: SyntaxNode, text: string): number | null {
  if (node.prevSibling?.name !== 'Table') {
    return node.from;
  }
  const raw = text.slice(node.from, node.to);
  const newlineIndex = raw.indexOf('\n');
  const firstLine = newlineIndex === -1 ? raw : raw.slice(0, newlineIndex);
  if (parseTableColumnWidthsAttribute(firstLine) === null) {
    return node.from;
  }
  if (newlineIndex === -1) {
    return null;
  }
  const from = node.from + newlineIndex + 1;
  return text.slice(from, node.to).trim().length > 0 ? from : null;
}

function renderCode(node: SyntaxNode, ctx: BlockContext, key: number): ReactNode {
  const lines: string[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeText') {
      lines.push(ctx.text.slice(child.from, child.to));
    }
  }
  const code = lines.join('\n').replace(/\n$/, '');
  return (
    <pre key={key} className="markdown-blocks__code">
      <code>{code}</code>
    </pre>
  );
}

function parseAlignments(table: SyntaxNode, text: string): CellAlignment[] {
  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue;
    }
    const raw = text.slice(child.from, child.to);
    if (raw.length <= 1 || !raw.includes('-')) {
      continue;
    }
    return raw
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const left = part.startsWith(':');
        const right = part.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined;
      });
  }
  return [];
}

function renderTable(node: SyntaxNode, ctx: BlockContext, key: number): ReactNode {
  const alignments = parseAlignments(node, ctx.text);

  function renderRow(row: SyntaxNode, cellTag: 'th' | 'td', rowKey: number): ReactNode {
    const cells: ReactNode[] = [];
    let column = 0;
    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== 'TableCell') {
        continue;
      }
      const align = alignments[column];
      cells.push(
        createElement(cellTag, { key: column, style: align ? { textAlign: align } : undefined }, renderInline(cell, ctx))
      );
      column += 1;
    }
    return <tr key={rowKey}>{cells}</tr>;
  }

  const header = node.getChild('TableHeader');
  const rows = node.getChildren('TableRow');

  return (
    <table key={key} className="markdown-blocks__table">
      {header && <thead>{renderRow(header, 'th', 0)}</thead>}
      <tbody>{rows.map((row, index) => renderRow(row, 'td', index))}</tbody>
    </table>
  );
}

function renderList(node: SyntaxNode, ctx: BlockContext, key: number): ReactNode {
  const ordered = node.name === 'OrderedList';
  const items: ReactNode[] = [];
  let start: number | undefined;

  for (let item = node.firstChild; item; item = item.nextSibling) {
    if (item.name !== 'ListItem') {
      continue;
    }
    if (ordered && start === undefined) {
      const mark = item.getChild('ListMark');
      const parsed = mark ? parseInt(ctx.text.slice(mark.from, mark.to), 10) : NaN;
      start = Number.isNaN(parsed) ? undefined : parsed;
    }
    items.push(
      <li
        key={items.length}
        className={`markdown-blocks__list-item${item.getChild('Task') ? ' markdown-blocks__list-item--task' : ''}`}
      >
        {renderBlockChildren(item, ctx)}
      </li>
    );
  }

  const className = `markdown-blocks__list${node.name === 'EmojiList' ? ' markdown-blocks__list--emoji' : ''}`;
  return ordered ? (
    <ol key={key} className={className} start={start}>
      {items}
    </ol>
  ) : (
    <ul key={key} className={className}>
      {items}
    </ul>
  );
}

function renderBlock(node: SyntaxNode, ctx: BlockContext, key: number): ReactNode {
  const level = HEADING_NODE_LEVELS[node.name];
  if (level !== undefined) {
    return createElement(`h${level}`, { key, className: 'markdown-blocks__heading' }, renderInline(node, ctx));
  }

  if (LIST_NODE_NAMES.has(node.name)) {
    return renderList(node, ctx, key);
  }

  const variant = DIVIDER_VARIANTS[node.name];
  if (variant !== undefined) {
    const label = dividerLabelText(node, ctx.text);
    return (
      <div key={key} className="markdown-blocks__rule" role="separator" data-variant={variant}>
        {label ? <span className="markdown-blocks__rule-label">{label}</span> : null}
      </div>
    );
  }

  switch (node.name) {
    case 'Paragraph': {
      const from = paragraphContentFrom(node, ctx.text);
      if (from === null) {
        return null;
      }
      const content = renderLines(node, ctx, from);
      return content.length > 0 ? (
        <p key={key} className="markdown-blocks__paragraph">
          {content}
        </p>
      ) : null;
    }
    case 'Task': {
      const marker = node.getChild('TaskMarker');
      const checked = marker ? /x/i.test(ctx.text.slice(marker.from, marker.to)) : false;
      return (
        <p key={key} className="markdown-blocks__paragraph markdown-blocks__task" data-checked={checked}>
          <TaskCheckboxIcon checked={checked} />
          <span className="markdown-blocks__task-text">{renderLines(node, ctx)}</span>
        </p>
      );
    }
    case 'Blockquote':
      return (
        <blockquote key={key} className="markdown-blocks__quote">
          {renderBlockChildren(node, ctx)}
        </blockquote>
      );
    case 'FencedCode':
      return renderCode(node, ctx, key);
    case 'Table':
      return renderTable(node, ctx, key);
    default:
      // Marker nodes (`QuoteMark`, `ListMark`, ...) and constructs this
      // surface deliberately omits (raw HTML, link reference definitions).
      return null;
  }
}

function renderBlockChildren(parent: SyntaxNode, ctx: BlockContext): ReactNode[] {
  const blocks: ReactNode[] = [];
  let index = 0;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    const block = renderBlock(child, ctx, index);
    if (block !== null) {
      blocks.push(block);
    }
    index += 1;
  }
  return blocks;
}

/**
 * Renders a *bounded* preview of `markdown`: `extractPreviewBlocks` decides
 * which complete top-level blocks are worth rendering (within `limits`), and
 * only those become React elements — see that module for the pipeline and
 * why the rest of the note is never parsed or rendered.
 */
export function renderMarkdownBlocks(
  markdown: string,
  resolvers: CompactMarkdownResolvers = {},
  limits: PreviewLimits = DEFAULT_PREVIEW_LIMITS
): ReactNode {
  const { text, blocks } = extractPreviewBlocks(markdown, limits);
  const ctx: BlockContext = { text, resolvers };
  const rendered: ReactNode[] = [];
  blocks.forEach((block, index) => {
    const element = renderBlock(block, ctx, index);
    if (element !== null) {
      rendered.push(element);
    }
  });
  return <>{rendered}</>;
}
