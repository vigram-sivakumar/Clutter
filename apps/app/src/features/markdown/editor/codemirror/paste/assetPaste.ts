import type { Extension } from '@codemirror/state';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { findEnclosingTable } from '../table/tableGeometry';
import { decodeDataImage, hasRichHtml, htmlToPieces } from './htmlToMarkdown';
import { normalizeExternalPaste } from './externalPaste';

/** What the editor needs from the app to keep a pasted file: store it, and say what could not be stored. */
export interface PasteAssets {
  /** Stores one pasted image/PDF and returns its vault-relative reference (`Assets/<name>`). Rejects when it can't. */
  readonly importFile: (file: { name: string; type: string }, bytes: Uint8Array) => Promise<string>;
  /** Called once with the names of files that were not stored — the rest of the paste is still inserted. */
  readonly onFailed: (names: readonly string[]) => void;
  /** Called once when the editor was closed (the user left the note) before the files were stored: they are kept in Assets/, but nothing was inserted. Receives how many were stored. */
  readonly onNotInserted?: (stored: number) => void;
}

const SUPPORTED_TYPE = /^(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/i;
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

  return parts.length === 0 ? null : { parts, separator: '\n\n', finish: normalizeExternalPaste };
}

/** The plan for pasted files: any plain text first, then one embed per file. */
function planFromFiles(files: readonly File[], text: string): Plan {
  const parts: Part[] = [
    ...(text === '' ? [] : [{ kind: 'markdown', text } as const]),
    ...files.map((file): Part => ({ kind: 'asset', name: file.name, type: file.type, bytes: async () => new Uint8Array(await file.arrayBuffer()) })),
  ];

  return { parts, separator: '\n', finish: (joined) => joined };
}

/**
 * Pasting content that carries files — screenshots, copied images, PDFs, and rich HTML with embedded images
 * (Notion, Anytype, web pages). Each image/PDF is stored as an asset (the app's own import) and an embed —
 * `![[Assets/<name>]]`, the syntax the editor already renders for images and PDFs — is inserted in the order
 * it appeared. One undoable `input.paste` transaction.
 *
 * Two sources, files first: the clipboard's own `files` (text that came with them is kept before the embeds),
 * else `text/html` that has structure or an image, converted to Markdown (see `htmlToMarkdown.ts`) with
 * images in their original positions. Only embedded `data:image/` images are stored; a web image stays a
 * Markdown image link and nothing is downloaded. Anything else declines (so the default paste runs): text,
 * HTML without structure and tables — `tablePaste`/`tableCreatePaste` run before this and take spreadsheet
 * HTML. Identical bytes appearing twice in one paste are stored once and referenced twice. An image that
 * can't be stored or recovered is skipped and reported, never silently dropped, and never blocks the rest.
 * If the document changed while the files were being stored, the content goes at the caret instead of the
 * position the paste started at; if the editor was closed (the user left the note), nothing is inserted.
 */
export function pasteAssets(getPasteAssets: () => PasteAssets | undefined): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const assets = getPasteAssets();
      const data = event.clipboardData;
      if (!assets || !data || view.state.readOnly) {
        return false;
      }

      const files = Array.from(data.files).filter((file) => SUPPORTED_TYPE.test(file.type));
      const plan =
        files.length > 0 ? planFromFiles(files, normalizePastedText(data.getData('text/plain'), files)) : planFromHtml(data.getData('text/html'));
      if (!plan) {
        return false;
      }

      event.preventDefault();
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

        // The editor is torn down when the user leaves the note (it is remounted per note), and a dispatch on a
        // torn-down view still reaches its change listener — which could write into whichever note is open now.
        // The stored files stay in Assets/ (as after an undo); nothing is inserted anywhere, and the app is told (`onNotInserted`).
        if (!view.dom.isConnected) {
          if (stored.length > 0) {
            assets.onNotInserted?.(stored.length);
          }
          if (failed.length > 0) {
            assets.onFailed(failed);
          }
          return;
        }

        // Inside a table a row is one line: a newline would split it, so everything goes in on one line.
        const inTable = findEnclosingTable(view.state, view.state.selection.main.head) !== null;
        const joined = pieces
          .map((piece) => piece.text ?? `![[${piece.reference}]]`)
          .filter((text) => text !== '')
          .join(inTable ? ' ' : plan.separator);
        const insert = inTable ? joined.replace(/\s*\n\s*/g, ' ') : plan.finish(joined);

        if (insert !== '') {
          const unchanged = view.state.doc.eq(docAtStart);
          const at = unchanged ? { from, to } : { from: view.state.selection.main.head, to: view.state.selection.main.head };
          view.dispatch({
            changes: { ...at, insert },
            selection: EditorSelection.cursor(at.from + insert.length),
            scrollIntoView: true,
            userEvent: 'input.paste',
          });
        }

        if (failed.length > 0) {
          assets.onFailed(failed);
        }
      })();

      return true;
    },
  });
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
