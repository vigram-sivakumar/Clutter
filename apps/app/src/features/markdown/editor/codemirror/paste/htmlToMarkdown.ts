/**
 * Clipboard HTML → Clutter Markdown, for rich content copied from other apps (Notion, Anytype, web pages).
 *
 * The HTML is untrusted: it is parsed by `DOMParser` into an inert document (no script runs, nothing is
 * loaded) and only read — never inserted anywhere. Only constructs Clutter's Markdown already has are kept
 * (emphasis, links, headings, lists, quotes, code, rules, images); everything else contributes its text.
 *
 * The result is an ordered list of pieces: Markdown text, and images exactly where they appeared, so the
 * caller can store the images it can recover and keep the original order.
 */

export type HtmlPiece =
  | { readonly kind: 'markdown'; readonly text: string }
  | { readonly kind: 'image'; readonly src: string; readonly alt: string };

/** Tags that mean the HTML carries structure worth converting. Plain wrappers (`div`/`span`, as editors and terminals put on the clipboard) do not. */
const SEMANTIC_SELECTOR = 'strong, b, em, i, del, s, strike, a[href], h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr, img';

const SKIPPED = new Set(['HEAD', 'STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO']);
const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'ADDRESS', 'DETAILS', 'SUMMARY']);
const BLOCK_DESCENDANT = 'p, div, ul, ol, li, h1, h2, h3, h4, h5, h6, pre, blockquote, table, hr';
const SAFE_LINK = /^(?:https?:|mailto:)/i;

function parse(html: string): Document | null {
  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
}

/** Whether `html` has structure (or an image) that is worth converting; plain-looking HTML is left to the ordinary text paste. */
export function hasRichHtml(html: string): boolean {
  return parse(html)?.body.querySelector(SEMANTIC_SELECTOR) != null;
}

function escapeText(text: string): string {
  return text.replace(/[\\*_`[\]]/g, '\\$&');
}

/** A line that would start a block when it is only text: its first character is escaped. */
function escapeBlockStart(line: string): string {
  return line.replace(/^(\s*)([#>+-]|\d+[.)])(?=\s|$)/, (_all, space: string, marker: string) => `${space}\\${marker}`);
}

interface Context {
  /** Finished pieces, in order. */
  readonly pieces: HtmlPiece[];
  /** Markdown blocks collected since the last image. */
  blocks: string[];
}

function flush(context: Context): void {
  const text = context.blocks.join('\n\n').trim();

  if (text !== '') {
    context.pieces.push({ kind: 'markdown', text });
  }

  context.blocks = [];
}

/** Inline content of `node` as one Markdown string; images found on the way are emitted as their own pieces (the text so far is flushed first). */
function inline(node: Node, context: Context, buffer: { text: string }): void {
  if (node.nodeType === Node.TEXT_NODE) {
    buffer.text += escapeText((node.textContent ?? '').replace(/\s+/g, ' '));
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tag = element.tagName.toUpperCase();

  if (SKIPPED.has(tag)) {
    return;
  }

  if (tag === 'IMG') {
    // Text so far becomes its own block, the image is its own piece, text after it starts a new block.
    commitBuffer(context, buffer);
    flush(context);
    context.pieces.push({ kind: 'image', src: element.getAttribute('src') ?? '', alt: element.getAttribute('alt') ?? '' });
    return;
  }

  if (tag === 'BR') {
    buffer.text += '  \n';
    return;
  }

  const wrap = (mark: string): void => {
    const inner = { text: '' };
    for (const child of Array.from(element.childNodes)) {
      inline(child, context, inner);
    }
    const body = inner.text.trim();
    // Marks must hug the text; whitespace stays outside them.
    buffer.text += body === '' ? inner.text : `${inner.text.match(/^\s*/)?.[0] ?? ''}${mark}${body}${mark}${inner.text.match(/\s*$/)?.[0] ?? ''}`;
  };

  switch (tag) {
    case 'STRONG':
    case 'B':
      return wrap('**');
    case 'EM':
    case 'I':
      return wrap('*');
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return wrap('~~');
    case 'CODE': {
      const code = element.textContent ?? '';
      buffer.text += code.trim() === '' ? code : `\`${code.replace(/`/g, "'")}\``;
      return;
    }
    case 'A': {
      const href = element.getAttribute('href') ?? '';
      const inner = { text: '' };
      for (const child of Array.from(element.childNodes)) {
        inline(child, context, inner);
      }
      buffer.text += SAFE_LINK.test(href.trim()) && inner.text.trim() !== '' ? `[${inner.text.trim()}](${href.trim().replace(/[()\s]/g, encodeURIComponent)})` : inner.text;
      return;
    }
    default:
      for (const child of Array.from(element.childNodes)) {
        inline(child, context, buffer);
      }
  }
}

function commitBuffer(context: Context, buffer: { text: string }): void {
  const text = buffer.text
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.replace(/^\s+/, '')))
    .join('\n')
    .replace(/^\s+|\s+$/g, '');

  if (text !== '') {
    context.blocks.push(text.split('\n').map(escapeBlockStart).join('\n'));
  }

  buffer.text = '';
}

function listItems(list: Element, context: Context, depth: number): string {
  const ordered = list.tagName.toUpperCase() === 'OL';
  let index = Number.parseInt(list.getAttribute('start') ?? '1', 10) || 1;
  const lines: string[] = [];

  for (const item of Array.from(list.children)) {
    if (item.tagName.toUpperCase() !== 'LI') {
      continue;
    }

    const marker = ordered ? `${index++}.` : '-';
    const checkbox = item.querySelector(':scope > input[type="checkbox"]');
    const task = checkbox ? (checkbox.hasAttribute('checked') ? '[x] ' : '[ ] ') : '';
    const own = { text: '' };
    const nested: string[] = [];

    for (const child of Array.from(item.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && /^(?:UL|OL)$/i.test((child as Element).tagName)) {
        nested.push(listItems(child as Element, context, depth + 1));
      } else {
        inline(child, { pieces: [], blocks: [] }, own);
      }
    }

    const text = own.text.replace(/\s+/g, ' ').trim();
    lines.push(`${'  '.repeat(depth)}${marker} ${task}${text}`.trimEnd(), ...nested);
  }

  return lines.join('\n');
}

function block(node: Node, context: Context, buffer: { text: string }): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    inline(node, context, buffer);
    return;
  }

  const element = node as Element;
  const tag = element.tagName.toUpperCase();

  if (SKIPPED.has(tag)) {
    return;
  }

  const heading = /^H([1-6])$/.exec(tag);

  if (heading || tag === 'UL' || tag === 'OL' || tag === 'BLOCKQUOTE' || tag === 'PRE' || tag === 'HR' || BLOCKS.has(tag)) {
    commitBuffer(context, buffer);
  }

  if (heading) {
    const inner = { text: '' };
    inline(element, context, inner);
    const text = inner.text.replace(/\s+/g, ' ').trim();
    if (text !== '') {
      context.blocks.push(`${'#'.repeat(Number(heading[1]))} ${text}`);
    }
    return;
  }

  switch (tag) {
    case 'UL':
    case 'OL': {
      const text = listItems(element, context, 0);
      if (text !== '') {
        context.blocks.push(text);
      }
      return;
    }
    case 'PRE': {
      const code = (element.textContent ?? '').replace(/\n+$/, '');
      if (code.trim() !== '') {
        const fence = '`'.repeat(Math.max(3, ...(code.match(/`+/g) ?? []).map((run) => run.length + 1)));
        context.blocks.push(`${fence}\n${code}\n${fence}`);
      }
      return;
    }
    case 'HR':
      context.blocks.push('---');
      return;
    case 'BLOCKQUOTE': {
      const inner: Context = { pieces: [], blocks: [] };
      const innerBuffer = { text: '' };
      for (const child of Array.from(element.childNodes)) {
        block(child, inner, innerBuffer);
      }
      commitBuffer(inner, innerBuffer);
      // Images inside a quote are kept (after the quote); the quote itself holds its text.
      const text = inner.blocks.join('\n\n');
      if (text !== '') {
        context.blocks.push(text.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n'));
      }
      for (const piece of inner.pieces) {
        flush(context);
        context.pieces.push(piece);
      }
      return;
    }
    default:
      // An inline element (bold, link, span, image…) with no block inside it is plain inline content.
      if (!BLOCKS.has(tag) && element.querySelector(BLOCK_DESCENDANT) === null) {
        inline(element, context, buffer);
        return;
      }
      for (const child of Array.from(element.childNodes)) {
        block(child, context, buffer);
      }
      if (BLOCKS.has(tag)) {
        commitBuffer(context, buffer);
      }
  }
}

/** The pieces of `html`, in document order; `[]` when it cannot be parsed or holds nothing. */
export function htmlToPieces(html: string): HtmlPiece[] {
  const document = parse(html);

  if (!document) {
    return [];
  }

  const context: Context = { pieces: [], blocks: [] };
  const buffer = { text: '' };

  for (const child of Array.from(document.body.childNodes)) {
    block(child, context, buffer);
  }

  commitBuffer(context, buffer);
  flush(context);

  return context.pieces;
}

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/i;

/** The bytes of an embedded `data:image/...;base64,` image, or null for anything else. */
export function decodeDataImage(src: string): { type: string; bytes: Uint8Array } | null {
  const match = DATA_IMAGE.exec(src.trim());

  if (!match) {
    return null;
  }

  try {
    const binary = atob(match[2]!.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { type: match[1]!.toLowerCase(), bytes };
  } catch {
    return null;
  }
}
