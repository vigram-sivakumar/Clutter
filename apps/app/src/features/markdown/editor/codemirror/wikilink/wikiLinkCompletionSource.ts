import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';

import { findWikiLinkAt } from './wikiLinkEngagement';
import type { WikiLinkCompletion } from './wikiLinkCompletionRenderer';
import { serializeWikiLink } from './wikiLinkSerialize';
import { lastUnescapedSlashOffset, splitAtFirstUnescapedPipe } from './wikiLinkScanner';
import type { GetWikiLinkSuggestions, WikiLinkSuggestion } from './wikiLinkSuggestion';

/**
 * Matches from the most recent unclosed `[[` up to the cursor — a fresh,
 * in-progress WikiLink that hasn't closed yet. Excludes `]` (an
 * already-closed `]]` means this is a completed WikiLink — see
 * `findWikiLinkAt` below, the actual source of truth for that case) and
 * `|` (typing `|` here is intercepted entirely by
 * `wikiLinkAutocomplete.ts`'s own keymap command, which commits the
 * currently-selected reference and closes completion before this pattern
 * would ever need to see a `|` — the reference and the display name are
 * two separate editing zones, never one continuously-open completion) and
 * newlines (WikiLinks never span lines).
 *
 * Exported so `wikiLinkAutocomplete.ts`'s `|` keymap command can recover
 * the exact same in-progress range this source itself would compute,
 * without duplicating the regex.
 */
export const WIKILINK_TRIGGER_PATTERN = /\[\[[^\]|\n]*$/;

/** Turns an accepted suggestion's target path (and matched alias, if any) into the text to insert. */
type InsertText = (path: string, alias: string | null) => string;

function toCompletion(suggestion: WikiLinkSuggestion, insertText: InsertText): Completion {
  const alias = suggestion.kind === 'page' ? (suggestion.alias ?? null) : null;
  const completion: WikiLinkCompletion = {
    label:
      suggestion.kind === 'create'
        ? `Create "${suggestion.path}"`
        : alias !== null
          ? `${suggestion.title} (${alias})`
          : suggestion.title,
    suggestion,
    apply(view, _completion, from, to) {
      const insert = insertText(suggestion.path, alias);

      // Reactivating completion inside an ALREADY-CLOSED reference (see
      // `referenceZoneAt`) replaces only the bare reference text —
      // whatever already follows it (a bare closing `]]`, or `|alias]]`)
      // is pre-existing, untouched document content, not part of
      // `insert`. The product contract is that accepting ANY autocomplete
      // suggestion — WikiLink, with or without an alias, Embed, Date —
      // places the cursor after the complete construct, never mid-syntax;
      // `|` is alias syntax, not a resting point. `existing` (looked up
      // in the PRE-change state, since `from`/`to` and any node found via
      // them are only meaningful against the document as it stood before
      // this transaction) is that already-closed node's own end; the
      // fresh (`[[query`, no existing brackets yet) case has no such node
      // and falls back to `from + insert.length`, which is already
      // correct there since `serializeWikiLink` appended its own `]]`
      // into `insert`.
      const existing = findWikiLinkAt(view.state, from);
      const anchor = existing ? existing.to + (insert.length - (to - from)) : from + insert.length;

      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor },
      });

      if (suggestion.kind === 'create') {
        suggestion.create();
      }
    },
  };

  return completion;
}

export interface WikiLinkReferenceZone {
  /** Start of the reference text, right after the opening `[[`. */
  readonly from: number;
  /** End of the reference text — right before the existing `|`, or right before the closing `]]` when there's no alias. */
  readonly to: number;
}

/**
 * Returns the reference-zone range of the already-closed WikiLink at
 * `pos`, if `pos` sits within it (inclusive of its own boundaries) —
 * `null` if `pos` isn't inside any closed WikiLink at all, or is past the
 * reference zone (inside the alias). Shared by `wikiLinkCompletionSource`
 * itself (which also needs the current reference text as a query) and by
 * `wikiLinkAutocomplete.ts`'s deletion-reactivation listener (which only
 * needs to know whether `pos` is in-zone at all) — one definition of "the
 * reference zone", not two.
 */
export function referenceZoneAt(state: EditorState, pos: number): WikiLinkReferenceZone | null {
  const existing = findWikiLinkAt(state, pos);
  if (!existing) {
    return null;
  }

  const from = existing.from + 2;
  const raw = state.sliceDoc(from, existing.to);
  const { pipeIndex } = splitAtFirstUnescapedPipe(raw);
  const to = pipeIndex !== null ? from + pipeIndex : existing.to - 2;

  return pos >= from && pos <= to ? { from, to } : null;
}

function buildResult(
  from: number,
  to: number,
  query: string,
  suggestions: GetWikiLinkSuggestions,
  insertText: InsertText
): CompletionResult | null {
  const items = suggestions(query);
  if (items.length === 0) {
    return null;
  }

  return {
    from,
    to,
    options: items.map((suggestion) => toCompletion(suggestion, insertText)),
    // Suggestions are already filtered by wikiLinkSuggestions.ts's own
    // substring match — CM6's own fuzzy re-filter/re-rank on top would
    // be a second, competing matching algorithm over the same list.
    filter: false,
  };
}

/**
 * WikiLink's `CompletionSource` — the one piece of `@codemirror/autocomplete`
 * that is Clutter-specific. Everything else (triggering, popup lifecycle,
 * positioning, keyboard nav, accept/dismiss) is CM6's own, wired in
 * `wikiLinkAutocomplete.ts`.
 *
 * Two distinct completion targets, matching the core invariant: a
 * WikiLink has two editing zones, `[[reference|display name]]` — only the
 * reference zone is ever autocomplete-aware.
 *
 * - A fresh, not-yet-closed `[[query` (no `findWikiLinkAt` match at all):
 *   the historical/default case. Accepting inserts the full canonical
 *   `[[path]]` — or `[[path|alias]]` for a page found by one of its
 *   aliases (the alias is display text; the path stays the target).
 * - The cursor sits inside the REFERENCE portion of an ALREADY-CLOSED
 *   `[[reference|alias]]` (or `[[reference]]`) — reactivates completion
 *   scoped to just that portion. The query is the reference text from the
 *   node's start up to the cursor (so a mid-reference edit filters on the
 *   prefix actually typed, same as the fresh case); the replace range on
 *   accept is the WHOLE reference zone (node start through the existing
 *   pipe, or through the closing `]]` when there's no alias yet) — never
 *   the alias or the closing brackets, which accepting must leave
 *   untouched. Accepting inserts only the bare decoded path text, since
 *   the surrounding `[[`, pipe/alias, and `]]` already exist.
 *
 * Note this only ever runs for a genuine edit inside the reference zone,
 * never for merely placing the cursor there: CM6 itself only invokes a
 * `CompletionSource` on a transaction classified as typing/backspacing
 * (`getUpdateType`, `@codemirror/autocomplete`'s internal
 * `ActiveSource.update`) — a plain click/selection-only transaction never
 * reaches this function at all, so clicking into an existing link's
 * reference can never pop the completion open by itself.
 *
 * If the cursor is in the ALIAS portion of an already-closed WikiLink (or
 * anywhere else not covered by the two cases above), this returns `null`
 * — ordinary text editing, no WikiLink-specific completion.
 */
export function wikiLinkCompletionSource(
  getSuggestions: () => GetWikiLinkSuggestions | undefined
): CompletionSource {
  return (context) => {
    const suggestions = getSuggestions();
    if (!suggestions) {
      return null;
    }

    const zone = referenceZoneAt(context.state, context.pos);
    if (zone) {
      // The FULL current reference text, not just the prefix up to the
      // cursor: unlike the fresh-link case below (composed strictly
      // left-to-right, where "up to the cursor" is the entire query by
      // definition), this reference already exists in full regardless of
      // where the cursor happens to sit within it. Using only the prefix
      // meant editing anywhere before the end — most visibly, deleting the
      // reference's own first character, which leaves the cursor exactly
      // at `zone.from` with an empty prefix — silently produced an empty
      // query and no suggestions, even though the reference still had
      // real content just past the cursor. Cursor position must not
      // determine whether autocomplete can activate.
      //
      // Scoped to the filename segment only — a query should match what a
      // user is actually typing to search for a page by name ("Note"), not
      // the folder-qualified canonical path ("Projects/Project A/Note")
      // sitting in front of it, independent of the editor's own rendering
      // (the full path is real, visible, editable source once engaged —
      // see wikiLinkLivePreview.ts). Uses the same `lastUnescapedSlashOffset`
      // split — one definition of "where the filename segment starts", not
      // two. The *replace range* below stays the full zone regardless:
      // accepting a suggestion must still overwrite the entire canonical
      // reference, folder included, with the picked suggestion's own full path.
      const refText = context.state.sliceDoc(zone.from, zone.to);
      const slashOffset = lastUnescapedSlashOffset(refText);
      const visibleFrom = slashOffset === null ? zone.from : zone.from + slashOffset + 1;
      const query = splitAtFirstUnescapedPipe(context.state.sliceDoc(visibleFrom, zone.to)).reference;

      // An alias match adds `|alias` only when the link has no display
      // text yet — an existing one is the user's, and stays untouched.
      // Serialized through serializeWikiLink (minus its brackets) so the
      // path and alias are escaped exactly as a fresh link's are.
      const hasDisplayText = zone.to < findWikiLinkAt(context.state, zone.from)!.to - 2;

      return buildResult(zone.from, zone.to, query, suggestions, (path, alias) =>
        alias !== null && !hasDisplayText ? serializeWikiLink(path, alias).slice(2, -2) : path
      );
    }

    // `referenceZoneAt` returning `null` covers two different cases the
    // fresh-link branch below must not also match: the cursor is inside
    // the ALIAS portion of a closed WikiLink (ordinary text editing, no
    // completion at all — `findWikiLinkAt` finding a node here is exactly
    // what must suppress the fresh-link match below), or it isn't inside
    // any closed WikiLink. Only the latter should fall through.
    if (findWikiLinkAt(context.state, context.pos)) {
      return null;
    }

    const match = context.matchBefore(WIKILINK_TRIGGER_PATTERN);
    if (!match) {
      return null;
    }

    // A `![[` in progress belongs entirely to Embed's own completion
    // source (embed/embedCompletionSource.ts) — WIKILINK_TRIGGER_PATTERN
    // has no `!`-anchor of its own (it only needs to recognize `[[`), so
    // without this check it would also match starting at the inner `[[`
    // of an in-progress `![[query`, racing the Embed source for the same
    // keystroke. Embed's own trigger pattern (EMBED_TRIGGER_PATTERN)
    // requires the leading `!` directly, so no equivalent guard is needed
    // in the other direction — a bare `[[query` never has a `!` immediately
    // before it for that pattern to match.
    if (context.state.sliceDoc(Math.max(0, match.from - 1), match.from) === '!') {
      return null;
    }

    const query = match.text.slice(2);

    return buildResult(match.from, context.pos, query, suggestions, (path, alias) =>
      serializeWikiLink(path, alias)
    );
  };
}
