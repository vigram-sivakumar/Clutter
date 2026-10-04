import type { CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { findEmbedAt } from './embedEngagement';
import { embedHeadingRow, embedResourceRow, type EmbedCompletion } from './embedCompletionRow';
import { serializeEmbed } from './embedSerialize';
import { lastUnescapedSlashOffset, splitAtFirstUnescapedPipe } from '../wikilink/wikiLinkScanner';
import { DEFAULT_IMAGE_UI_STATE, setImageUiState } from '../image/imageUiState';
import type { EmbedSuggestion, GetEmbedHeadingSuggestions, GetEmbedSuggestions } from './embedSuggestion';

/**
 * Matches from the most recent unclosed `![[` up to the cursor — a fresh,
 * in-progress Embed that hasn't closed yet. The resource-scoped
 * counterpart to WIKILINK_TRIGGER_PATTERN
 * (wikilink/wikiLinkCompletionSource.ts), with one addition: the leading
 * `!` is part of the pattern itself, not merely implied — this is exactly
 * what keeps this pattern from ever matching a bare `[[query` (no `!`
 * immediately before it), and it's also why WIKILINK_TRIGGER_PATTERN
 * needed its own explicit "reject if preceded by `!`" guard added
 * (wikiLinkCompletionSource.ts) rather than relying on this pattern's mere
 * existence to keep the two sources from racing: an unanchored `/\[\[.../`
 * still matches starting at the second bracket of `![[`, so both sources
 * would otherwise fire for the same keystroke.
 */
export const EMBED_TRIGGER_PATTERN = /!\[\[[^\]|\n]*$/;

/**
 * Shared `apply()` body — both a resource/heading suggestion insert the
 * same way, differing only in what `insert` text they compose (a
 * resource's own `path`, or `${pagePart}#${heading}` for a heading
 * suggestion — see `toCompletion`/`toHeadingCompletion`).
 */
function applyEmbedInsert(insert: string, view: EditorView, from: number, to: number): void {
  const changes = { from, to, insert };

  // Mirrors wikiLinkCompletionSource.ts's identical fix, one node
  // type over: reactivating completion inside an ALREADY-CLOSED
  // `![[reference]]` replaces only the bare reference text, leaving
  // whatever already follows it (bare `]]`, or `|alias]]`) untouched
  // — so `from + insert.length` alone lands the cursor mid-syntax
  // instead of after the complete construct. `existingBeforeChange`
  // (looked up in the PRE-change state, the only state `from`/`to`
  // are meaningful against) is that already-closed node's own end;
  // the fresh (`![[query`, no existing brackets yet) case has no such
  // node and falls back to `from + insert.length`, already correct
  // there since `serializeEmbed` appended its own `]]` into `insert`.
  const existingBeforeChange = findEmbedAt(view.state, from);
  const selection = {
    anchor: existingBeforeChange
      ? existingBeforeChange.to + (insert.length - (to - from))
      : from + insert.length,
  };

  // Phase 2 (2026-09 rendering-lifecycle unification): explicitly
  // completing the target — as opposed to merely typing/pasting one
  // — renders immediately, per this milestone's own product
  // requirement. A scratch (never dispatched) `state.update()` is
  // how the resulting Embed node's own exact `[from, to)` is known
  // *before* the real dispatch, so the `setImageUiState` effect
  // below can be included in the very same transaction as the
  // insert — one atomic change, not two, so undo/redo treats
  // "select this suggestion" as a single step, same as every other
  // completion's own apply(). `pendingFirstLeave: false` (the
  // default) is what lets `embedLivePreview.ts`'s own render gate
  // skip its "stay raw" branch for this occurrence even though the
  // cursor lands at its own `to` — which is otherwise
  // indistinguishable, by selection alone, from a fresh, still-being-
  // typed embed. See that file's own guard-2 doc comment.
  const scratch = view.state.update({ changes, selection });
  const node = findEmbedAt(scratch.state, from);
  const effects = node
    ? [setImageUiState.of({ pos: node.from, to: node.to, state: DEFAULT_IMAGE_UI_STATE })]
    : [];

  view.dispatch({ changes, selection, effects });
}

function toCompletion(
  suggestion: Extract<EmbedSuggestion, { kind: 'resource' }>,
  insertText: (path: string) => string
): EmbedCompletion {
  const completion: EmbedCompletion = {
    label: suggestion.title,
    suggestion,
    ...embedResourceRow(suggestion),
    apply(view, _completion, from, to) {
      applyEmbedInsert(insertText(suggestion.path), view, from, to);
    },
  };

  return completion;
}

/**
 * A heading suggestion inserts the full `${pagePart}#${heading}` target
 * text — the same "replace the whole reference" rule every other Embed
 * completion already follows (see `embedCompletionSource`'s own doc
 * comment on the reference-zone branch), not just the portion after `#`.
 */
function toHeadingCompletion(
  suggestion: Extract<EmbedSuggestion, { kind: 'heading' }>,
  pagePart: string,
  insertText: (target: string) => string
): EmbedCompletion {
  const completion: EmbedCompletion = {
    label: suggestion.heading,
    suggestion,
    ...embedHeadingRow(suggestion),
    apply(view, _completion, from, to) {
      applyEmbedInsert(insertText(`${pagePart}#${suggestion.heading}`), view, from, to);
    },
  };

  return completion;
}

export interface EmbedReferenceZone {
  /** Start of the reference text, right after the opening `![[`. */
  readonly from: number;
  /** End of the reference text — right before the existing `|`, or right before the closing `]]` when there's no alias. */
  readonly to: number;
}

/**
 * Returns the reference-zone range of the already-closed Embed at `pos`,
 * if `pos` sits within it (inclusive of its own boundaries) — `null` if
 * `pos` isn't inside any closed Embed at all, or is past the reference
 * zone (inside the alias, if the syntax happens to carry one — see
 * embedScanner.ts's doc comment on why this milestone doesn't build any
 * alias-editing affordance even though the underlying grammar permits the
 * syntax). Mirrors wikilink/wikiLinkCompletionSource.ts's
 * `referenceZoneAt` exactly, one node type over.
 */
export function embedReferenceZoneAt(state: EditorState, pos: number): EmbedReferenceZone | null {
  const existing = findEmbedAt(state, pos);
  if (!existing) {
    return null;
  }

  // The reference text starts right after the opening `![[` — three
  // characters in, unlike WikiLink's two (`[[`).
  const from = existing.from + 3;
  const raw = state.sliceDoc(from, existing.to);
  const { pipeIndex } = splitAtFirstUnescapedPipe(raw);
  const to = pipeIndex !== null ? from + pipeIndex : existing.to - 2;

  return pos >= from && pos <= to ? { from, to } : null;
}

function buildResult(
  from: number,
  to: number,
  query: string,
  suggestions: GetEmbedSuggestions,
  insertText: (path: string) => string
): CompletionResult | null {
  const items = suggestions(query);
  if (items.length === 0) {
    return null;
  }

  return {
    from,
    to,
    options: items.map((suggestion) => toCompletion(suggestion, insertText)),
    // Suggestions are already filtered by the app-layer suggester's own
    // substring match — same reasoning wikiLinkCompletionSource.ts's
    // buildResult already documents: CM6's own fuzzy re-filter/re-rank on
    // top would be a second, competing matching algorithm over the same
    // list.
    filter: false,
  };
}

/**
 * Embed's `CompletionSource` — the resource-scoped counterpart to
 * wikilink/wikiLinkCompletionSource.ts's `wikiLinkCompletionSource`, same
 * two-branch shape: a fresh, not-yet-closed `![[query`, or the cursor
 * sitting inside the reference portion of an already-closed
 * `![[reference]]`. See that file's own doc comment for the full reasoning
 * behind this shape — repeated here only where Embed's behavior actually
 * differs:
 *
 * - No alias-insertion variant: unlike WikiLink's `|`-key command
 *   (wikiLinkAutocomplete.ts), accepting an Embed suggestion always
 *   inserts the full `![[path]]` in the fresh case, or just the bare path
 *   in the reference-zone-edit case — there is no "commit as reference,
 *   keep editing the display name" flow for this milestone.
 * - No `create` suggestion kind: see embedSuggestion.ts's own doc comment.
 *
 * ADR-032: once the typed target contains `#`, the query is split into
 * a page portion (everything before `#`) and a heading query
 * (everything after), and suggestions switch from resource targets to
 * headings within that one already-typed page — never a second
 * `CompletionSource`/trigger/`autocompletion()` registration, just a
 * content-based branch inside this same source, at the same point the
 * query string is already being computed for the resource case.
 */
function buildHeadingResult(
  from: number,
  to: number,
  pagePart: string,
  headingQuery: string,
  getHeadingSuggestions: GetEmbedHeadingSuggestions,
  insertText: (target: string) => string
): CompletionResult | null {
  const items = getHeadingSuggestions(pagePart, headingQuery);
  if (items.length === 0) {
    return null;
  }

  return {
    from,
    to,
    options: items.map((suggestion) => toHeadingCompletion(suggestion, pagePart, insertText)),
    filter: false,
  };
}

export function embedCompletionSource(
  getSuggestions: () => GetEmbedSuggestions | undefined,
  getHeadingSuggestions: () => GetEmbedHeadingSuggestions | undefined = () => undefined
): CompletionSource {
  return (context) => {
    const suggestions = getSuggestions();
    if (!suggestions) {
      return null;
    }

    const zone = embedReferenceZoneAt(context.state, context.pos);
    if (zone) {
      // Checked against the FULL zone reference (pipe-split for a `|alias`
      // if present, but not yet slash-narrowed) — a heading query's page
      // portion must keep any folder prefix, unlike the resource-query
      // "visible segment" narrowing below, which only ever applies once
      // it's confirmed there's no `#` to handle instead.
      const zoneReference = splitAtFirstUnescapedPipe(context.state.sliceDoc(zone.from, zone.to)).reference;
      const zoneHashIndex = zoneReference.indexOf('#');
      if (zoneHashIndex !== -1) {
        const headingSuggestions = getHeadingSuggestions();
        if (!headingSuggestions) {
          return null;
        }
        const pagePart = zoneReference.slice(0, zoneHashIndex);
        const headingQuery = zoneReference.slice(zoneHashIndex + 1);
        return buildHeadingResult(zone.from, zone.to, pagePart, headingQuery, headingSuggestions, (target) => target);
      }

      // Same reasoning as wikiLinkCompletionSource.ts: the FULL current
      // reference text, not just the prefix up to the cursor, and scoped
      // to the visible segment only (past the last folder slash) — one
      // shared definition (lastUnescapedSlashOffset) of "where the visible
      // part starts," not a second one. The *replace range* stays the
      // full zone regardless, so accepting a suggestion overwrites the
      // entire reference, folder included.
      const refText = context.state.sliceDoc(zone.from, zone.to);
      const slashOffset = lastUnescapedSlashOffset(refText);
      const visibleFrom = slashOffset === null ? zone.from : zone.from + slashOffset + 1;
      const query = splitAtFirstUnescapedPipe(context.state.sliceDoc(visibleFrom, zone.to)).reference;

      return buildResult(zone.from, zone.to, query, suggestions, (path) => path);
    }

    // `embedReferenceZoneAt` returning `null` covers two cases the
    // fresh-Embed branch below must not also match: the cursor is past the
    // reference portion of a closed Embed (ordinary text editing), or it
    // isn't inside any closed Embed at all. Only the latter should fall
    // through.
    if (findEmbedAt(context.state, context.pos)) {
      return null;
    }

    const match = context.matchBefore(EMBED_TRIGGER_PATTERN);
    if (!match) {
      return null;
    }

    const query = match.text.slice(3);
    const hashIndex = query.indexOf('#');
    if (hashIndex !== -1) {
      const headingSuggestions = getHeadingSuggestions();
      if (!headingSuggestions) {
        return null;
      }
      const pagePart = query.slice(0, hashIndex);
      const headingQuery = query.slice(hashIndex + 1);
      return buildHeadingResult(match.from, context.pos, pagePart, headingQuery, headingSuggestions, (target) =>
        serializeEmbed(target)
      );
    }

    return buildResult(match.from, context.pos, query, suggestions, (path) => serializeEmbed(path));
  };
}
