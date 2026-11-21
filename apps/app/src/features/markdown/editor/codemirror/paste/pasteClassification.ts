import type { EditorState } from '@codemirror/state';

import { type ClipboardTable, readClipboardTable } from '../table/tablePaste';
import { tableSelectionField } from '../table/tableSelection';
import { hasRichHtml } from './htmlToMarkdown';
import { type PasteContext, pasteContextAt } from './pasteContext';

/** Image and PDF files are the only files the editor stores and embeds. */
export const SUPPORTED_TYPE = /^(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/i;

/**
 * Which existing paste strategy handles a paste. Exactly one per paste, decided once by `classifyPaste`:
 *
 * - `tableRange`   cells are selected in a rendered table and the clipboard is a grid: fill them (`pasteIntoSelectedRange`)
 * - `tableCell`    the clipboard is a grid and a table cell is being edited: fill from that cell (`pasteIntoActiveCell`)
 * - `tableCreate`  the clipboard is a grid at an ordinary caret: create a table (`createTableFromClipboard`)
 * - `files`        supported image/PDF files: store and embed them (`embedPasted`)
 * - `richHtml`     HTML with structure or an image: convert it to Markdown (`embedPasted`)
 * - `empty`        nothing to insert (no plain text, no URI list): change nothing
 * - `default`      everything else: CodeMirror's own paste (with the input filters of the editor)
 */
export type PasteStrategy = 'tableRange' | 'tableCell' | 'tableCreate' | 'files' | 'richHtml' | 'empty' | 'default';

/** Why clipboard files are left out: an `unsupported` type, or a `target` (a table) that takes no files. */
export interface SkippedFiles {
  readonly names: readonly string[];
  readonly reason: 'unsupported' | 'target';
}

export interface PasteClassification {
  readonly strategy: PasteStrategy;
  /** The grid the clipboard carries, read once (set for every table strategy). */
  readonly table: ClipboardTable | null;
  /** The block the root caret is in, when it limits what the paste may become. */
  readonly context: PasteContext | null;
  /** The clipboard files the chosen strategy leaves out, to be reported once — null when none (or nothing can report them). */
  readonly skipped: SkippedFiles | null;
}

export interface PasteEnvironment {
  /** `root`: the document view. `cell`: the nested editor of an active table cell (`state` is still the root's). */
  readonly scope: 'root' | 'cell';
  /** The root view's state: its selection, table selection and syntax tree decide the context. */
  readonly state: EditorState;
  /** Whether the app can store files (an asset importer is wired and the editor is editable). */
  readonly canEmbed: boolean;
  /** `cell` scope only: whether an active cell is the paste target. */
  readonly cellActive?: boolean;
}

const HAS_TABLE = /<table[\s>]/i;

/**
 * The one decision about a paste: which strategy handles it, in what context, and which files it leaves out. It only
 * reads the clipboard and the editor state — nothing is dispatched. The order is the tested priority of the handlers
 * it replaces: a selected table range, a table created from a grid, files, rich HTML, then the plain paste.
 *
 * - A grid never creates a table inside code, a list item or a blockquote (it would be literal, glued to the item, or lose
 *   its `>`). Rich HTML is not converted inside code, and HTML containing a table is not converted inside a list item or a
 *   blockquote either (a top-level table would break them): both fall to the plain paste.
 * - A grid read only from tab-separated text, next to HTML tables that are not one standalone grid (two tables), is that
 *   HTML flattened: with an importer, the HTML wins and each table stays a table. A cell or a range still fills from the grid.
 * - Files lose to a grid (a spreadsheet copy with a preview image pastes its table) and are never embedded into cells or
 *   a selected range; `skipped` says so.
 * - A selected range with no grid in the clipboard takes no files and no HTML conversion: the plain paste (or `empty`).
 */
export function classifyPaste(data: DataTransfer, env: PasteEnvironment): PasteClassification {
  const { state } = env;
  const files = Array.from(data.files ?? []);
  const supported = files.filter((file) => SUPPORTED_TYPE.test(file.type));
  const unsupported = files.filter((file) => !SUPPORTED_TYPE.test(file.type));
  const selection = state.field(tableSelectionField, false) ?? null;
  const parsedTable = readClipboardTable(data);
  const context = pasteContextAt(state, state.selection.main.from);
  const plainText = data.getData('text/plain');
  // Plain text is a 1x1 clipboard grid when a table cell or table selection
  // is the explicit target. Elsewhere it keeps normal editor paste behaviour.
  const html = data.getData('text/html');
  const hasHtmlTable = HAS_TABLE.test(html);
  const isTableTarget = selection !== null || (env.scope === 'cell' && env.cellActive === true);
  const isSingleCellText = plainText !== '' && !/[\\r\\n\\t]/.test(plainText) && !hasHtmlTable;
  const table: ClipboardTable | null = parsedTable ?? (
    isTableTarget && isSingleCellText
      ? { source: 'text', grid: [[plainText]] }
      : null
  );
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

  if (env.scope === 'cell') {
    // A cell embeds no files.
    return result(env.cellActive && table ? 'tableCell' : fallback, { names: names(files), reason: 'target' });
  }

  if (selection) {
    return result(table ? 'tableRange' : fallback, { names: names(files), reason: 'target' });
  }

  // Rich HTML can be converted here (an importer is wired, not in code, no table where a table would break the block).
  const htmlTable = hasHtmlTable;
  let richHtmlResult: boolean | undefined;
  const richHtml = (): boolean =>
    (richHtmlResult ??= env.canEmbed && context !== 'code' && !(htmlTable && (context === 'list' || context === 'quote')) && hasRichHtml(html));

  // A grid read from the plain text of a clipboard whose HTML holds tables that were not one standalone grid (two tables,
  // a layout table) is the flattened form of that HTML: the HTML is authoritative, so it is converted instead (each table
  // stays a table). Only here: a cell or a selected range has no conversion and keeps filling from the grid (above).
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
