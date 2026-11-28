import { ChangeSet, EditorSelection, EditorState, StateField, Text, type ChangeSpec, type Extension, type Transaction, type TransactionSpec } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { tableCellBreakRanges } from '../../../render/inlineSpan';
import { encodeWikiLinkTableSource } from '@core/vault/ingest/grammar/wikiLinkScanner';
import { recordInternalClipboardText } from '../paste/externalPaste';

/** Derived offsets only: the nested document remains exact raw table source.
 * Each odd run of 2n+1 backslashes + pipe is n logical slashes + pipe.
 * Each transported character occupies two raw positions; hide the first,
 * and make the entire pair atomic. No WikiLink node is required, so this
 * also works while its syntax is incomplete and in ordinary cell text.
 */
function projection(raw: string) {
  const hidden = new Set<number>();
  for (const match of raw.matchAll(/(\\+)\|/g)) {
    const count = match[1]!.length;
    if (count % 2 === 0) continue;
    for (let i = 0; i < count; i += 2) hidden.add(match.index! + i);
  }
  const rawOffsets = [0];
  const logicalOffsets = [0];
  let logical = '';
  for (let i = 0; i < raw.length; i++) {
    if (!hidden.has(i)) {
      logical += raw[i];
      rawOffsets.push(i + 1);
    }
    logicalOffsets.push(logical.length);
  }
  // A noncanonical imported cell must not be silently rewritten by editing
  // elsewhere. Leave that cell in the existing raw-source/preflight mode.
  const canonical = encodeWikiLinkTableSource(logical) === raw;
  return { raw, logical, rawOffsets, logicalOffsets, hidden, canonical };
}

export function logicalCellText(raw: string): string {
  const p = projection(raw);
  return p.canonical ? p.logical : raw;
}

/** Visual line breaks are derived from the same parsed cell source used by
 * the static renderer, never a second editable string or physical newline. */
export function cellLineBreaks(raw: string): { from: number; to: number }[] {
  return /<br[\s/>]/i.test(raw) ? tableCellBreakRanges(sharedMarkdownParser.parse(raw).topNode, raw) : [];
}

class CellLineBreakWidget extends WidgetType {
  get lineBreaks(): number { return 1; }
  toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement('span');
    span.className = 'cm-table-cell-line-break';
    span.appendChild(span.ownerDocument.createElement('br'));
    return span;
  }
}
const cellBreakWidget = new CellLineBreakWidget();

function buildDecorationSets(raw: string): { hidden: DecorationSet; atomic: DecorationSet } {
  const p = projection(raw);
  const breaks = cellLineBreaks(raw);
  const hidden = breaks.map(({ from, to }) => Decoration.replace({ widget: cellBreakWidget }).range(from, to));
  const atomic = breaks.map(({ from, to }) => Decoration.mark({}).range(from, to));
  if (p.canonical) {
    for (const from of p.hidden) {
      hidden.push(Decoration.replace({}).range(from, from + 1));
      atomic.push(Decoration.mark({}).range(from, from + 2));
    }
  }
  return { hidden: Decoration.set(hidden, true), atomic: Decoration.set(atomic, true) };
}

function snapBreakSelection(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!tr.selection) return tr;
  const breaks = cellLineBreaks(tr.newDoc.toString());
  if (!breaks.length) return tr;
  function snap(pos: number, forward: boolean): number {
    const hit = breaks.find(({ from, to }) => pos > from && pos < to);
    return hit ? (forward ? hit.to : hit.from) : pos;
  }
  const selection = EditorSelection.create(tr.newSelection.ranges.map(range => {
    if (range.empty) return EditorSelection.cursor(snap(range.head, range.head >= tr.startState.selection.main.head), range.assoc);
    const from = snap(range.from, false), to = snap(range.to, true);
    return range.anchor <= range.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from);
  }), tr.newSelection.mainIndex);
  return selection.eq(tr.newSelection) ? tr : [tr, { selection, sequential: true }];
}

export function insertCellLineBreak(view: EditorView): boolean {
  if (view.composing) return false;
  if (view.state.readOnly) return true;
  const { from, to } = view.state.selection.main;
  const tag = '<br>';
  const raw = view.state.doc.toString();
  const proposed = raw.slice(0, from) + tag + raw.slice(to);
  // Do not insert a literal tag inside code, a semantic token or an escaped
  // context where it would not actually be presented as a line break.
  if (!cellLineBreaks(proposed).some(range => range.from === from && range.to === from + tag.length)) return true;
  view.dispatch({ ...view.state.replaceSelection(tag), userEvent: 'input.type.lineBreak' });
  return true;
}

const transportRanges = StateField.define({
  create: state => buildDecorationSets(state.doc.toString()),
  update: (value, tr) => tr.docChanged ? buildDecorationSets(tr.newDoc.toString()) : value,
  provide: field => [
    EditorView.decorations.from(field, value => value.hidden),
    EditorView.atomicRanges.of(view => view.state.field(field).atomic),
  ],
});

type Projection = ReturnType<typeof projection>;
function floor(p: Projection, raw: number): number {
  return p.logicalOffsets[raw]!;
}
function ceil(p: Projection, raw: number): number {
  const logical = floor(p, raw);
  return p.rawOffsets[logical] === raw ? logical : logical + 1;
}

/** Atomic ranges handle CM6 cursor motion/deletion. This also sanitizes
 * pointer/native or explicit selection positions that land inside a pair.
 * Range direction is preserved; selection alone never changes the source.
 */
function snapSelection(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!tr.selection) return tr;
  const p = projection(tr.newDoc.toString());
  if (!p.canonical || !p.hidden.size) return tr;
  const selection = EditorSelection.create(tr.newSelection.ranges.map(range => {
    if (range.empty) {
      const offset = range.head >= tr.startState.selection.main.head ? ceil(p, range.head) : floor(p, range.head);
      return EditorSelection.cursor(p.rawOffsets[offset]!, range.assoc);
    }
    const from = p.rawOffsets[floor(p, range.from)]!;
    const to = p.rawOffsets[ceil(p, range.to)]!;
    return range.anchor <= range.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from);
  }), tr.newSelection.mainIndex);
  return selection.eq(tr.newSelection) ? tr : [tr, { selection, sequential: true }];
}

/** Preserve unchanged raw characters between disjoint logical edits.
 * Re-encode a neighbouring run only if the edit changes its transport width.
 * This avoids a full-cell replacement and retains the exact root history
 * and source-span contract.
 */
function rawChanges(before: Projection, after: Projection, changes: ChangeSet): ChangeSet {
  const specs: ChangeSpec[] = [];
  let oldEnd = 0;
  let newEnd = 0;
  function flush(oldTo: number, newTo: number) {
    const removed = before.raw.slice(oldEnd, oldTo);
    const inserted = after.raw.slice(newEnd, newTo);
    if (removed !== inserted) specs.push({ from: oldEnd, to: oldTo, insert: inserted });
  }
  changes.iterGaps((oldAt, newAt, length) => {
    for (let i = 0; i < length; i++) {
      const a = before.rawOffsets[oldAt + i]!;
      const b = before.rawOffsets[oldAt + i + 1]!;
      const c = after.rawOffsets[newAt + i]!;
      const d = after.rawOffsets[newAt + i + 1]!;
      if (before.raw.slice(a, b) !== after.raw.slice(c, d)) continue;
      flush(a, c);
      oldEnd = b;
      newEnd = d;
    }
  });
  flush(before.raw.length, after.raw.length);
  return ChangeSet.of(specs, before.raw.length);
}

/** Translate an actual user edit to logical characters, then encode it
 * before the existing full-document root preflight. Raw/programmatic
 * transactions stay raw and must still pass that preflight.
 */
function normalizeInput(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!tr.docChanged || !(tr.isUserEvent('input.type') || tr.isUserEvent('input.paste') ||
    tr.isUserEvent('input.format') || tr.isUserEvent('delete'))) return snapSelection(tr);
  const raw = tr.startState.doc.toString();
  const proposed = tr.newDoc.toString();
  if (!raw.includes('|') && !proposed.includes('|')) return tr;
  const before = projection(raw);
  if (!before.canonical) return tr;

  const logicalSpecs: ChangeSpec[] = [];
  const consumed = new Set<number>();
  let lastTo = 0;
  let overlap = false;
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    const a = floor(before, from);
    const b = from === to ? a : ceil(before, to);
    if (a < lastTo) overlap = true;
    lastTo = b;
    for (let i = a; i < b; i++) consumed.add(i);
    logicalSpecs.push({ from: a, to: b, insert: inserted });
  });
  if (overlap) return [];
  const logicalChanges = ChangeSet.of(logicalSpecs, before.logical.length);

  // The proposed transaction's new selection is expressed in raw offsets
  // plus the newly inserted logical text. Remove surviving old transport
  // bytes, including any half-pair left by a native single-char deletion,
  // to recover its logical position before encoding the new run widths.
  const removals: ChangeSpec[] = [];
  tr.changes.iterGaps((oldAt, newAt, length) => {
    for (let i = 0; i < length; i++) {
      const pos = oldAt + i;
      if (before.hidden.has(pos) || consumed.has(floor(before, pos))) {
        removals.push({ from: newAt + i, to: newAt + i + 1 });
      }
    }
  });
  const remove = ChangeSet.of(removals, tr.newDoc.length);
  const logical = logicalChanges.apply(Text.of([before.logical])).toString();
  if (remove.apply(tr.newDoc).toString() !== logical) return [];
  const after = projection(encodeWikiLinkTableSource(logical));
  const mapped = tr.newSelection.map(remove);
  const selection = EditorSelection.create(mapped.ranges.map(range =>
    range.empty ? EditorSelection.cursor(after.rawOffsets[range.head]!, range.assoc) :
      EditorSelection.range(after.rawOffsets[range.anchor]!, after.rawOffsets[range.head]!)), mapped.mainIndex);

  const changes = rawChanges(before, after, logicalChanges);
  // Compose within the original transaction; preserve its annotations,
  // effects and history intent. The root still validates the final bytes.
  const correction = tr.changes.invert(tr.startState.doc).compose(changes);
  if (proposed === after.raw && selection.eq(tr.newSelection)) return tr;
  return [tr, { changes: correction, selection, sequential: true }];
}

export function tableCellTransport(): Extension {
  return [
    transportRanges,
    // Filters execute in reverse order: pipe mapping first, break snapping last.
    EditorState.transactionFilter.of(snapBreakSelection),
    EditorState.transactionFilter.of(normalizeInput),
    EditorView.clipboardOutputFilter.of((text, state) => {
      const p = projection(state.doc.toString());
      const range = state.selection.main;
      // A copied logical slash can be only part of a transported run.
      // Decode against the entire cell, not an isolated raw substring.
      if (p.canonical && !range.empty && text === state.sliceDoc(range.from, range.to)) {
        const logical = p.logical.slice(floor(p, range.from), ceil(p, range.to));
        recordInternalClipboardText(logical);
        return logical;
      }
      const logical = logicalCellText(text);
      recordInternalClipboardText(logical);
      return logical;
    }),
  ];
}
