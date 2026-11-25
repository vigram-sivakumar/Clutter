import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertedEmbedEffects } from '../embed/insertedEmbedEffects';
import { planMediaBlockInsertion } from '../embed/mediaBlockInsertion';
import { serializeEmbed } from '../embed/embedSerialize';
import { syncEmbedObjectSelection } from '../embed/embedObjectSelection';

import { findEnclosingTable } from '../table/tableGeometry';
import { decodeDataImage, hasRichHtml, htmlToPieces } from './htmlToMarkdown';
import { isBlockMarkdown, normalizeExternalPaste } from './externalPaste';
import { pasteContextAt } from './pasteContext';
import { SUPPORTED_TYPE } from './pasteClassification';

/** What the editor needs from the app to keep a pasted file: store it, and say what could not be stored. */
export interface PasteAssets {
  /** Stores one pasted image/PDF and returns its local media reference. Rejects when it can't. */
  readonly importFile: (file: { name: string; type: string }, bytes: Uint8Array) => Promise<string>;
  /** Called once with the names of files that were not stored — the rest of the paste is still inserted. */
  readonly onFailed: (names: readonly string[]) => void;
  /**
   * Called once when files were stored but the editor could no longer take them, so nothing was inserted: they are
   * kept in the Space. Receives how many were stored and why — `closed` (the user left the note) or `readOnly`
   * (the note was archived or locked while the files were being stored).
   */
  readonly onNotInserted?: (stored: number, reason: 'closed' | 'readOnly') => void;
  /** Called once per paste with the names of files deliberately left out (see `skippedFiles.ts`): `unsupported` types, or a `target` (a table) that takes no files. Not a failure — nothing was attempted. */
  readonly onSkipped?: (names: readonly string[], reason: 'unsupported' | 'target') => void;
}

const REMOTE_IMAGE = /^https?:\/\//i;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}

/** One piece of what is being pasted, in order: ready Markdown, a file to store and embed, or something that could not be recovered. */
type Part =
  | { readonly kind: 'markdown'; readonly text: string }
  | { readonly kind: 'asset'; readonly name: string; readonly type: string; readonly bytes: () => Promise<Uint8Array> }
  | { readonly kind: 'unrecoverable'; readonly name: string };

interface Plan {
  readonly parts: readonly Part[];
  /** Joins the parts, and shapes the result (Markdown from HTML is compacted like any external paste). */
  readonly separator: string;
  readonly finish: (joined: string) => string;
  /** Content converted from HTML: made of blocks, it gets a block of its own when it lands in ordinary text (see `blockBoundaries`). */
  readonly block: boolean;
}

/** The plan for rich HTML: its text keeps its formatting, embedded images are stored where they appeared. Null when the HTML is not worth converting. */
function planFromHtml(html: string): Plan | null {
  if (!hasRichHtml(html)) {
    return null;
  }

  const parts: Part[] = htmlToPieces(html).map((piece): Part => {
    if (piece.kind === 'markdown') {
      return piece;
    }

    const image = decodeDataImage(piece.src);
    if (image) {
      return { kind: 'asset', name: piece.alt || 'image', type: image.type, bytes: async () => image.bytes };
    }

    // A web image is kept as the Markdown image it is — nothing is downloaded. Anything else (blob:, file:,
    // a relative path) names nothing this editor can reach.
    return REMOTE_IMAGE.test(piece.src.trim()) && !/[\s()<>]/.test(piece.src.trim())
      ? { kind: 'markdown', text: `![${piece.alt.replace(/[\\[\]]/g, '')}](${piece.src.trim()})` }
      : { kind: 'unrecoverable', name: piece.alt || 'image' };
  });

  return parts.length === 0 ? null : { parts, separator: '\n\n', block: true, finish: (joined) => normalizeExternalPaste(joined, { origin: 'html' }) };
}

/** The plan for pasted files: any plain text first, then one embed per file. */
function planFromFiles(files: readonly File[], text: string): Plan {
  const parts: Part[] = [
    ...(text === '' ? [] : [{ kind: 'markdown', text } as const]),
    ...files.map((file): Part => ({ kind: 'asset', name: file.name, type: file.type, bytes: async () => new Uint8Array(await file.arrayBuffer()) })),
  ];

  return { parts, separator: '\n', block: false, finish: (joined) => joined };
}

/**
 * Where block content converted from HTML lands in ordinary text: in a block of its own, so it never glues to the text on
 * the caret's line or turns the next line into part of its last block (a list, a table, a quote). Text before the caret on
 * its line, or after it, is separated by a blank line; a following line gets a blank line too. Inline content (one
 * paragraph's text, `**bold** word`) stays inline, and inside a list item, a quote or code nothing is added — the same
 * contexts `classifyPaste` keeps blocks out of.
 */
function blockBoundaries(state: EditorState, at: { readonly from: number; readonly to: number }, insert: string): { leading: string; body: string; trailing: string } {
  const body = insert.replace(/^\n+|\n+$/g, '');
  if (!isBlockMarkdown(body) || pasteContextAt(state, at.from) !== null) {
    return { leading: '', body: insert, trailing: '' };
  }

  const lineTo = state.doc.lineAt(at.to);
  const textBefore = state.sliceDoc(state.doc.lineAt(at.from).from, at.from).trim() !== '';
  const textAfter = state.sliceDoc(at.to, lineTo.to).trim() !== '';
  const nextLineFilled = !textAfter && lineTo.number < state.doc.lines && state.doc.line(lineTo.number + 1).text.trim() !== '';

  return { leading: textBefore ? '\n\n' : '', body, trailing: textAfter ? '\n\n' : nextLineFilled ? '\n' : '' };
}

/**
 * Pasting content that carries files — screenshots, copied images, PDFs, and rich HTML with embedded images
 * (Notion, Anytype, web pages). Each image/PDF is stored as an asset (the app's own import) and an embed —
 * `![[Attachments/<name>]]`, the syntax the editor already renders for images and PDFs — is inserted in the order
 * it appeared. One undoable `input.paste` transaction.
 *
 * Two sources, files first: the clipboard's own `files` (text that came with them is kept before the embeds),
 * else `text/html` that has structure or an image, converted to Markdown (see `htmlToMarkdown.ts`) with
 * images in their original positions. Only embedded `data:image/` images are stored; a web image stays a
 * Markdown image link and nothing is downloaded. This is a strategy, not a handler: `classifyPaste`
 * (`pasteClassification.ts`) decides whether a paste is `files` or `richHtml` — spreadsheet tables, code, list items,
 * plain text and the rest never get here — and `pasteRouting.ts` runs it. Identical bytes appearing twice in one paste are stored once and referenced twice. An image that
 * can't be stored or recovered is skipped and reported, never silently dropped, and never blocks the rest.
 * If the document changed while the files were being stored, the content goes at the caret instead of the
 * position the paste started at; if the editor was closed (the user left the note), nothing is inserted.
 */
export function embedPasted(view: EditorView, data: DataTransfer, assets: PasteAssets, strategy: 'files' | 'richHtml'): boolean {
  const files = Array.from(data.files ?? []).filter((file) => SUPPORTED_TYPE.test(file.type));
  const plan = strategy === 'files' ? planFromFiles(files, normalizePastedText(data.getData('text/plain'), files)) : planFromHtml(data.getData('text/html'));
  if (!plan) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  const docAtStart = view.state.doc;

  void (async () => {
    const stored: { bytes: Uint8Array; reference: string }[] = [];
    const pieces: { readonly text?: string; readonly reference?: string }[] = [];
    const failed: string[] = [];

    for (const part of plan.parts) {
      if (part.kind === 'markdown') {
        pieces.push({ text: part.text });
      } else if (part.kind === 'unrecoverable') {
        failed.push(part.name);
      } else {
        try {
          const bytes = await part.bytes();
          const duplicate = stored.find((entry) => sameBytes(entry.bytes, bytes));
          const reference = duplicate?.reference ?? (await assets.importFile(part, bytes));
          if (!duplicate) {
            stored.push({ bytes, reference });
          }
          pieces.push({ reference });
        } catch {
          failed.push(part.name || 'image');
        }
      }
    }

    // Checked after the last await, against the live view: the editor is torn down when the user leaves the note
    // (it is remounted per note, and a dispatch on a torn-down view still reaches its change listener — which could
    // write into whichever note is open now), and it is re-configured read-only in place when the note is archived
    // (`switchEditorMode`), which `view.state` reflects at once. The stored files stay in the Space (as after an undo);
    // nothing is inserted anywhere, and the app is told (`onNotInserted`) — a failed import is `onFailed`, never this.
    const closed = !view.dom.isConnected;
    if (closed || view.state.readOnly || !view.state.facet(EditorView.editable)) {
      if (stored.length > 0) {
        assets.onNotInserted?.(stored.length, closed ? 'closed' : 'readOnly');
      }
      if (failed.length > 0) {
        assets.onFailed(failed);
      }
      return;
    }

    // Inside a table a row is one line: a newline would split it, so everything goes in on one line.
    const inTable = findEnclosingTable(view.state, view.state.selection.main.head) !== null;
    const joined = pieces
      .map((piece) => piece.text ?? serializeEmbed(piece.reference!))
      .filter((text) => text !== '')
      .join(inTable ? ' ' : plan.separator);
    const insert = inTable ? joined.replace(/\s*\n\s*/g, ' ') : plan.finish(joined);

    if (insert !== '') {
      const unchanged = view.state.doc.eq(docAtStart);
      const at = unchanged ? { from, to } : { from: view.state.selection.main.head, to: view.state.selection.main.head };
      const { leading, body, trailing } = plan.block && !inTable ? blockBoundaries(view.state, at, insert) : { leading: '', body: insert, trailing: '' };
      const inserted = new Set(pieces.flatMap((piece) => piece.reference === undefined ? [] : [serializeEmbed(piece.reference)]));
      // File payloads (including any accompanying caption) are one media block.
      // Rich HTML retains its existing content order and block-conversion rules.
      const media = strategy === 'files' && !inTable && inserted.size > 0
        ? planMediaBlockInsertion(view.state, at, insert)
        : null;
      const changes = media?.changes ?? [{ ...at, insert: leading + body + trailing }];
      const selection = EditorSelection.cursor(media?.to ?? at.from + leading.length + body.length);
      const scratch = view.state.update({ changes, selection });
      const effects = !inTable && inserted.size
        ? insertedEmbedEffects(scratch.state, media?.from ?? at.from, media?.to ?? at.from + leading.length + body.length + trailing.length, (raw) => inserted.has(raw))
        : [];
      view.dispatch({
        changes,
        selection,
        effects,
        scrollIntoView: true,
        userEvent: 'input.paste',
      });
      syncEmbedObjectSelection(view);
    }

    if (failed.length > 0) {
      assets.onFailed(failed);
    }
  })();

  return true;
}

/**
 * The plain text that came with the files, or ''. Copying a file in a file manager puts its name on the
 * clipboard as text; that is not content to insert next to the embed.
 */
function normalizePastedText(text: string, files: readonly File[]): string {
  const trimmed = text.replace(/\r\n?/g, '\n').trim();
  const names = new Set(files.map((file) => file.name));

  return trimmed === '' || names.has(trimmed) || trimmed.split('\n').every((line) => names.has(line.trim()))
    ? ''
    : trimmed;
}
