import type { EditorState } from '@codemirror/state';

import { type ClipboardGrid, readClipboardGrid } from '../table-engine/tableClipboard';
import { TableEngineError } from '../table-engine/tableModel';
import { hasRichHtml } from './htmlToMarkdown';
import { type PasteContext, pasteContextAt } from './pasteContext';

/** Image and PDF files are the only files the editor stores and embeds. */
export const SUPPORTED_TYPE = /^(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/i;

/**
 * Which existing paste strategy handles a paste. Exactly one per paste, decided once by `classifyPaste`:
 *
 * - `tableCreate`  the clipboard is a grid at an ordinary caret: create a table (engine table creation)
 * - `files`        supported image/PDF files: store and embed them (`embedPasted`)
 * - `richHtml`     HTML with structure or an image: convert it to Markdown (`embedPasted`)
 * - `empty`        nothing to insert (no plain text, no URI list): change nothing
 * - `default`      everything else: CodeMirror's own paste (with the input filters of the editor)
 */
export type PasteStrategy = 'tableCreate' | 'files' | 'richHtml' | 'empty' | 'default';

/** Why clipboard files are left out: an `unsupported` type, or a `target` (a table) that takes no files. */
export interface SkippedFiles {
  readonly names: readonly string[];
  readonly reason: 'unsupported' | 'target';
}

export interface PasteClassification {
  readonly strategy: PasteStrategy;
  /** The grid the clipboard carries, read once (set for every table strategy). */
  readonly table: ClipboardGrid | null;
  /** The block the root caret is in, when it limits what the paste may become. */
  readonly context: PasteContext | null;
  /** The clipboard files the chosen strategy leaves out, to be reported once — null when none (or nothing can report them). */
  readonly skipped: SkippedFiles | null;
}

export interface PasteEnvironment {
  readonly state: EditorState;
  readonly canEmbed: boolean;
}

const HAS_TABLE = /<table[\s>]/i;

/**
 * The one decision about a paste: which strategy handles it, in what context, and which files it leaves out. It only
 * reads the clipboard and the editor state — nothing is dispatched. The order is the tested priority of the handlers
 * it replaces: a table created from a grid, files, rich HTML, then the plain paste.
 *
 * - A grid never creates a table inside code, a list item or a blockquote (it would be literal, glued to the item, or lose
 *   its `>`). Rich HTML is not converted inside code, and HTML containing a table is not converted inside a list item or a
 *   blockquote either (a top-level table would break them): both fall to the plain paste.
 * - A grid read only from tab-separated text, next to HTML tables that are not one standalone grid (two tables), is that
 *   HTML flattened: with an importer, the HTML wins and each table stays a table.
 * - Files lose to a grid (a spreadsheet copy with a preview image pastes its table) and are never embedded into cells; `skipped` says so.
 */
export function classifyPaste(data: DataTransfer, env: PasteEnvironment): PasteClassification {
  const { state } = env;
  const files = Array.from(data.files ?? []);
  const supported = files.filter((file) => SUPPORTED_TYPE.test(file.type));
  const unsupported = files.filter((file) => !SUPPORTED_TYPE.test(file.type));
  const context = pasteContextAt(state, state.selection.main.from);
  const plainText = data.getData('text/plain');
  const html = data.getData('text/html');
  const hasHtmlTable = HAS_TABLE.test(html);
  let table: ClipboardGrid | null = null;
  let rejectedGrid = false;
  try {
    table = readClipboardGrid(data, false, true);
  } catch (error) {
    if (!(error instanceof TableEngineError)) throw error;
    rejectedGrid = true;
  }
  const nothing = plainText === '' && data.getData('text/uri-list') === '';
  const fallback: PasteStrategy = nothing ? 'empty' : 'default';

  const names = (list: readonly File[]): string[] => list.map((file) => file.name || 'file');
  const result = (strategy: PasteStrategy, skipped: SkippedFiles | null = null): PasteClassification => ({
    strategy,
    table,
    context,
    skipped: env.canEmbed && files.length > 0 ? skipped : null,
  });

  if (state.readOnly) {
    return result('default');
  }

  // A malformed grid at a valid table insertion site must not be interpreted
  // as a different source representation. Code and list/quote contexts still
  // retain ordinary text/file handling.
  if (rejectedGrid && context === null) {
    return result('empty', { names: names(files), reason: 'target' });
  }

  // Rich HTML can be converted here (an importer is wired, not in code, no table where a table would break the block).
  const htmlTable = hasHtmlTable;
  let richHtmlResult: boolean | undefined;
  const richHtml = (): boolean =>
    (richHtmlResult ??= env.canEmbed && context !== 'code' && !(htmlTable && (context === 'list' || context === 'quote')) && hasRichHtml(html));

  // A grid read from the plain text of a clipboard whose HTML holds tables that were not one standalone grid (two tables,
  // a layout table) is the flattened form of that HTML: the HTML is authoritative, so it is converted instead (each table
  // stays a table). Only here: a cell or a selected range has no conversion and keeps filling from the grid.
  const flattenedHtmlTables = table?.source === 'text' && htmlTable && richHtml();

  if (table && context === null && !flattenedHtmlTables) {
    return supported.length > 0
      ? result('tableCreate', { names: names(files), reason: 'target' })
      : result('tableCreate', unsupported.length > 0 ? { names: names(unsupported), reason: 'unsupported' } : null);
  }

  const unsupportedNotice = unsupported.length > 0 ? { names: names(unsupported), reason: 'unsupported' as const } : null;

  if (env.canEmbed && supported.length > 0) {
    return result('files', unsupportedNotice);
  }

  if (richHtml()) {
    return result('richHtml', unsupportedNotice);
  }

  return result(fallback, unsupportedNotice);
}
