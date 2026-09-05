import { syntaxTree } from '@codemirror/language';
import {
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
} from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { getImagePresentation } from '../mediaPresentation/mediaPresentationUpdate';

/**
 * Per-`Image`-node UI state — whether its raw Markdown source is currently
 * revealed alongside the rendered widget, and which display mode it's
 * rendered at. Deliberately **not** derived from selection the way the
 * shared reveal-on-engagement mechanism is (docs/editor-architecture-
 * decisions.md's "engagement is derived from selection... no engagement
 * flag anywhere" is a Locked principle for the *shared* inline mechanism —
 * Image opts out of that shared mechanism entirely, the same way WikiLink
 * already did for a different reason, and defines its own contract here):
 * `revealed` only ever turns **on** via the widget's own explicit edit/
 * source button, never as a side effect of the caret entering the image's
 * range. It does turn **off** automatically when the caret leaves the
 * image's own line (see `imageUiStateField.update`'s own comment below) —
 * a real, narrower exception to "cursor movement never changes this
 * state," reflecting the 2026-09-02 UX baseline's explicit "leaving source
 * editing" requirement. This supersedes the 2026-09-01 entry's stronger
 * claim that Image never consults selection at all — recorded as a
 * superseding note in docs/editor-architecture-decisions.md, not a silent
 * reversal.
 *
 * `displayMode` replaces the earlier two-state `fullWidth: boolean` — a
 * boolean cannot cleanly represent three mutually-exclusive display modes
 * (Large/Fill/Fit), so this is a real type change, not an additive one.
 * `'fill'` is this field's default. Explicitly UI/display state only, per
 * the image-options-menu task: switching modes never touches the Markdown
 * source (`![alt](url)` stays exactly as written regardless of mode) —
 * persistence/serialization of the selected mode is an explicit, separate,
 * not-yet-decided later concern.
 *
 * **Deliberately excludes the options-menu's own open/closed state** — a
 * first pass added a `menuOpen` field here, diffed by `eq()` the same way
 * `revealed`/`displayMode` are, and hit a real bug as a direct result:
 * `ImageOptionsMenu`'s `Overlay` is anchored to `ImageWidget`'s own
 * `sizeButton` DOM element via a plain `{current: HTMLElement}` (see
 * `ImageWidget.ts`'s class doc comment). The instant the menu opened, the
 * `menuOpen` effect made `eq()` return false, which made CM6 destroy the
 * old widget DOM and call `toDOM()` again — producing a *new* `sizeButton`
 * element while the just-opened `Overlay` was still anchored to the old,
 * now-detached one, whose `getBoundingClientRect()` reads as `{0,0,0,0}`,
 * placing the menu at the viewport's top-left corner. `revealed`/
 * `displayMode` never had this failure mode because nothing anchors an
 * external, portal-rendered popover to a piece of *their* DOM. Menu-open
 * visibility (`[data-menu-open]`, `MarkdownEditor.css`) and the size
 * button's active styling are driven by plain, direct DOM mutation from
 * `MarkdownEditor.tsx`'s `onOpenImageMenuRef`/`closeImageMenu` instead —
 * see those functions' own comments — specifically so the widget's DOM,
 * and therefore the anchor button's own identity, is never touched by
 * opening or closing the menu.
 *
 * `broken` (2026-09-02 UX baseline, "Broken / Invalid Image UX") records
 * that `ImageWidget`'s own `<img>` fired a native `error` event for this
 * occurrence — a real, observed load failure, never a guess from the raw
 * Markdown text alone (a syntactically *incomplete* image, e.g. `![Text]`
 * with no destination, never reaches this at all: it never parses as a
 * complete Lezer `Image` node with a usable URL, so `imageLivePreview.ts`'s
 * existing `scanImage`-based guard already excludes it before an
 * `ImageWidget` — and therefore an `<img>` that could ever fire `error` —
 * is created in the first place). Safe to diff via `eq()` the ordinary way
 * `revealed`/`displayMode` are, unlike the options-menu's `menuOpen`
 * (removed, see below): nothing external is anchored to a piece of the
 * broken-state DOM, so recreating it on a `broken` transition has no
 * anchor-staleness risk.
 *
 * **`broken` on a genuine edit to the node's own text: pessimistic, not
 * optimistic** (revised 2026-09-02 after an intermittent-flicker
 * investigation — see `imageUiStateField.update`'s own comment below for
 * the mechanism, and `ImageWidget.renderBroken`'s own comment for the
 * probe that actually re-confirms). An earlier revision reset straight to
 * `broken: false` the moment an edit touched the node, on the theory that
 * a just-corrected URL deserves an immediate fresh attempt — reasonable
 * in principle, but it had two real consequences, confirmed directly, not
 * assumed:
 * - A **coordinate-space bug**: the check resolved the node against the
 *   *post*-change document but queried `ChangeDesc.touchesRange` (which
 *   is defined over *pre*-change coordinates) with those post-change
 *   numbers — confirmed via `@codemirror/state`'s own source, then
 *   confirmed live with a coordinate sweep against the real reducer:
 *   deleting characters on the line *above* the image (which shifts the
 *   node backward) produced false positives whenever the deleted count
 *   was roughly at least half the gap between the edit and the image —
 *   resetting `broken` for edits that never touched the image's own text
 *   at all.
 * - Even with that bug fixed, going straight to `false` re-admits the
 *   *design* flaw the flicker investigation actually turned up: `false`
 *   immediately authorizes `ImageWidget.renderWorking()` to mount a real,
 *   visible `<img>` for whatever text is *currently* in the URL — during
 *   character-by-character URL editing, that's frequently a garbage
 *   intermediate value, and the browser's own native broken-image glyph
 *   would flash inside it before that `<img>`'s own `error` listener ever
 *   got a chance to correct it back. Confirmed as the actual mechanism a
 *   user reported and reproduced, not a theoretical concern.
 *
 * The fix is pessimistic instead: a genuine edit to the node's own text
 * sets `broken: true` (regardless of what it was before), which keeps
 * `ImageWidget` rendering its own safe, no-native-`<img>` broken
 * representation. `ImageWidget.renderBroken()` starts an invisible probe
 * (a detached `Image()`, never inserted into the DOM) for whatever URL is
 * current at construction time; only that probe's own `load` event —
 * confirming the *exact* current URL genuinely resolves — dispatches
 * `broken: false`, at which point a real, visible `<img>` is mounted for
 * an already-known-good URL (so its own `error` path is realistically
 * unreachable, not merely rare). This closes both the previously-working-
 * image-being-edited-toward-broken direction (nothing reset `broken` for
 * it before, at all — `renderWorking()` re-rendered on every keystroke
 * with no verification of any kind) and the previously-broken-being-fixed
 * direction, through the exact same mechanism, rather than two different
 * ones.
 *
 * **Deliberately excludes the options-menu's own open/closed state** — a
 * first pass added a `menuOpen` field here, diffed by `eq()` the same way
 * `revealed`/`displayMode` are, and hit a real bug as a direct result:
 * `ImageOptionsMenu`'s `Overlay` is anchored to `ImageWidget`'s own
 * `sizeButton` DOM element via a plain `{current: HTMLElement}` (see
 * `ImageWidget.ts`'s class doc comment). The instant the menu opened, the
 * `menuOpen` effect made `eq()` return false, which made CM6 destroy the
 * old widget DOM and call `toDOM()` again — producing a *new* `sizeButton`
 * element while the just-opened `Overlay` was still anchored to the old,
 * now-detached one, whose `getBoundingClientRect()` reads as `{0,0,0,0}`,
 * placing the menu at the viewport's top-left corner. `revealed`/
 * `displayMode`/`broken` never have this failure mode because nothing
 * anchors an external, portal-rendered popover to a piece of *their* DOM
 * (a broken image shows no options menu at all — see `ImageWidget.ts`).
 * Menu-open visibility (`[data-menu-open]`, `MarkdownEditor.css`) and the
 * size button's active styling are driven by plain, direct DOM mutation
 * from `MarkdownEditor.tsx`'s `onOpenImageMenuRef`/`closeImageMenu`
 * instead — see those functions' own comments — specifically so the
 * widget's DOM, and therefore the anchor button's own identity, is never
 * touched by opening or closing the menu.
 *
 * Stored as a `RangeSet` keyed by each Image node's own `from` position —
 * the standard CM6 pattern for per-position UI state that must survive
 * document edits elsewhere (`RangeSet.map` remaps positions automatically
 * on every transaction, the same mechanism CM6's own fold state uses
 * internally), rather than a plain `Map<number, ...>` keyed by a position
 * that would silently go stale the moment any earlier edit shifted it.
 * Entries carry a real `[from, to)` span, not a zero-width point (revised
 * 2026-09-02 for the Link/Image source-editing consistency fix — see
 * `imageUiStateField.update`'s own comment on the `revealed` auto-hide
 * block for why the span itself, tracked via `RangeSet.map` with
 * `ImageUiValue.endSide = -1`, replaced a syntax-tree re-resolution of
 * `to` on every transaction): lookups by `getImageUiState`/`buildDecorations`
 * still only ever query a single point (`between(pos, pos, ...)`, always
 * called with a node's own `from`), which a span still answers correctly
 * since a query point exactly at a range's own `from` still finds it.
 */
/** `'large'` was removed (product decision) — `'fit'` now covers what `'large'` used to mean (natural size). See `mediaPresentationModel.ts`'s `MediaPresentationMode` for the full account. */
export type ImageDisplayMode = 'fill' | 'fit';

export interface ImageUiState {
  readonly revealed: boolean;
  readonly displayMode: ImageDisplayMode;
  readonly broken: boolean;
  /**
   * Phase 2 (2026-09 rendering-lifecycle unification): true only for the
   * brief window between "this exact Image/Embed occurrence was just
   * created (typed, pasted, or completed) with no prior UI-state entry"
   * and "the caret has left it for the first time since." While true, the
   * live-preview render gate (`imageLivePreview.ts`/`embedLivePreview.ts`)
   * keeps the raw Markdown visible instead of collapsing to a widget, even
   * though the node is otherwise complete — "while actively editing, show
   * raw; render on first leave."
   *
   * Deliberately **not** derived from `isTokenEngaged` alone (unlike the
   * shared inline mechanism's own reveal-on-engagement). A pure
   * engagement check can't distinguish "the caret is here because the
   * user just typed this" from "the caret is here because it arrow-keyed
   * or clicked past an already-at-rest widget" — both land the caret
   * inside the node's range (confirmed directly: CM6's atomic-range
   * navigation lands the caret exactly at a node's own boundary, which
   * satisfies `isTokenEngaged`'s inclusive containment check identically
   * to genuine mid-edit engagement). Without this flag, navigating past a
   * rendered image would un-render it on every pass — the "entering a
   * valid rendered construct via navigation must not reveal it" rule.
   * `pendingFirstLeave` is what lets the render gate ask "is this actually
   * still being created" instead of merely "is the caret nearby right
   * now."
   *
   * Defaults to `false` (not pending) — an existing image loaded from
   * disk, or any occurrence with no entry yet, renders immediately
   * regardless of where the caret happens to be; only a transaction that
   * genuinely creates a brand-new node sets this `true` (see
   * `imageUiStateField.update`'s own "freshly created" block below), and
   * it is cleared back to `false` the first time engagement ends
   * afterward (the "leaving source editing" block below, extended) or
   * explicitly by an autocomplete completion's own `apply()` (Embed's
   * "selecting from autocomplete renders immediately" requirement —
   * `embedCompletionSource.ts` dispatches `setImageUiState` with this
   * already `false` in the same transaction as the insert, so the
   * creation-detection block below never gets a chance to mark it
   * pending in the first place).
   */
  readonly pendingFirstLeave: boolean;
}

export const DEFAULT_IMAGE_UI_STATE: ImageUiState = {
  revealed: false,
  displayMode: 'fill',
  broken: false,
  pendingFirstLeave: false,
};

class ImageUiValue extends RangeValue {
  constructor(readonly state: ImageUiState) {
    super();
  }

  // `endSide = -1`: an insertion landing exactly at this range's own `to`
  // (e.g. typing the character right after a just-completed image) is
  // *excluded* from growing the range, while an insertion strictly inside
  // it still grows the range normally — confirmed empirically against
  // `RangeSet.map`'s actual behavior before relying on it (default
  // `endSide` of 0 grows on *both*, which would silently regress
  // "completing source editing and continuing after the image", below).
  // This is what makes the range's own mapped `to` usable directly as the
  // "still inside the revealed source" boundary, with no syntax-tree
  // re-resolution needed on every transaction.
  override readonly endSide = -1;

  override eq(other: RangeValue): boolean {
    return (
      other instanceof ImageUiValue &&
      other.state.revealed === this.state.revealed &&
      other.state.displayMode === this.state.displayMode &&
      other.state.broken === this.state.broken &&
      other.state.pendingFirstLeave === this.state.pendingFirstLeave
    );
  }
}

export const setImageUiState = StateEffect.define<{
  pos: number;
  /** The Image node's own current `to` at dispatch time — always resolved fresh by the caller (never stale), since every dispatch site only ever fires when a widget for this occurrence currently exists or a probe just re-resolved the node. Used to (re)seat this entry's own stored `[pos, to)` span; see the field's own doc comment for why the span, not just `pos`, needs to be tracked. */
  to: number;
  state: ImageUiState;
}>();

/**
 * Marks a transaction as a *presentation-only* edit — its `changes`
 * rewrite an Image/Embed node's own `|width,alignment,mode` pipe segment
 * (`mediaPresentationUpdate.ts`'s `computeImagePresentationUpdate`/
 * `computePdfPresentationUpdate`), never the alt text, URL, title, or
 * WikiLink path/alias. Every dispatch site that changes presentation
 * (`MarkdownEditor.tsx`'s `handleSelectImageDisplayMode`, `ImageWidget.ts`/
 * `PdfEmbedWidget.ts`'s own resize-commit handlers) includes this
 * alongside its `changes`.
 *
 * **Why this exists (root cause of a real flicker bug)**: the `broken`
 * pessimistic-marking block below used to treat *any* `docChanged`
 * transaction that overlapped an Image node's own range as "a genuine
 * edit to the image's content" and forced `broken: true` — correct for an
 * actual alt/URL/title edit (the whole reason that block is pessimistic
 * at all, per this field's own top-level doc comment), but a presentation
 * change is a docChanged edit too, *because the pipe segment lives inside
 * the same node's own `[from, to)` range* (Obsidian-style syntax,
 * `mediaPresentationModel.ts`). Without this marker, switching Fill→Fit
 * via the options menu forced the working image straight into its broken
 * card, which then had to probe and recover back to working in a
 * *second*, separate transaction — two full widget teardown/rebuild
 * cycles for what the user experiences as one instantaneous toggle,
 * which is the actual mechanism behind the reported "image disappears
 * and then renders again" flicker and layout jump. The `broken` block
 * now skips its detection entirely for a transaction carrying this
 * effect — content edits (typing in the URL, alt text, etc.) are
 * completely unaffected, since those dispatch sites never include it.
 */
export const presentationOnlyEdit = StateEffect.define<null>();

/**
 * Walks up from whatever node starts exactly at `pos` (an Image node's own
 * children — `LinkMark`, `URL`, etc. — all start at or after its own
 * `from`, so the *deepest* node beginning there is never the `Image` node
 * itself) until it finds the enclosing `Image`, or returns `null` if none
 * exists there any more (e.g. the raw text was edited into something that
 * no longer parses as one — treated as "outside" by the caller, the same
 * safe default a malformed construct gets everywhere else in this
 * codebase).
 */
export function findEnclosingImageNode(state: EditorState, pos: number): { from: number; to: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
  while (node && node.name !== 'Image') {
    node = node.parent;
  }
  return node ? { from: node.from, to: node.to } : null;
}

export const imageUiStateField = StateField.define<RangeSet<ImageUiValue>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setImageUiState)) {
        const { pos, to, state } = effect.value;
        next = next.update({
          filter: (from) => from !== pos,
          add: [new ImageUiValue(state).range(pos, to)],
        });
      }
    }

    // "Leaving source editing" (2026-09-02 UX baseline, item 4, refined
    // 2026-09-02 for "completing source editing and continuing after the
    // image", refined again 2026-09-02 to fix a Link/Image lifecycle
    // inconsistency a user reported directly): a revealed image's raw
    // Markdown auto-hides once the caret moves outside the image's own
    // source — but only the caret leaving does this; entering never
    // auto-reveals (that's still exclusively the widget's own edit button,
    // per this field's own doc comment above).
    //
    // **Purely positional now, not re-parsed.** The previous revision
    // re-resolved the Image node fresh from the *current* syntax tree on
    // every transaction (`findEnclosingImageNode`) to get an up-to-date
    // `to` boundary, on the theory that `to` "can't be cached the way
    // `from` is." That was wrong in a way that only showed up once a user
    // actually edited a *revealed* image's URL character-by-character:
    // every keystroke that transiently makes the raw text fail to parse as
    // a complete `Image` node (an interior edit that momentarily breaks
    // `](` balance, a temporarily-empty destination, etc.) made this re-
    // resolution come back `null`, which this check then read as "the
    // caret left" and hid the source out from under the user *while they
    // were still typing inside it* — exactly the bug reported: Link never
    // has this failure mode, because Link's own engagement check
    // (`inlineLivePreviewRegion.ts`'s `isTokenEngaged`) only ever gates
    // *concealment styling* on top of raw text that stays real and visible
    // regardless of parse validity, whereas Image's `revealed` flag gates
    // whether a *widget replaces the text outright* — a parse hiccup is
    // invisible to the former and destructive to the latter. Load state
    // (`broken`, this field's own separate mechanism below) is
    // deliberately unaffected by any of this — a user-reported "these are
    // two different concepts" instruction: whether the raw source stays
    // visible must never depend on whether the *rendered preview* would
    // currently succeed.
    //
    // The fix removes the syntax-tree dependency entirely: each entry is
    // now stored as a real `RangeSet` span (`[pos, to)`, not a zero-width
    // point), and `RangeValue`'s own `endSide = -1` (`ImageUiValue`,
    // above) makes `RangeSet.map` track that span exactly the way this
    // check needs, with no re-parsing at all —
    // - An edit **strictly inside** the span (any character of the alt
    //   text, URL, brackets, or parens) grows/shrinks the mapped `to`
    //   automatically, so the caret — which moves with the same edit —
    //   never ends up outside the freshly-mapped range. This is what keeps
    //   "temporarily invalid URL" and "temporarily incomplete syntax"
    //   (e.g. deleting the closing paren mid-edit) from ever closing
    //   source editing: the tracked span doesn't care whether Lezer
    //   currently agrees the text is a complete `Image` node.
    // - An insertion **exactly at** the mapped `to` (continuing to type
    //   right after a completed image, on the same line) does *not* grow
    //   the range (confirmed via a scratch `RangeSet.map` test against
    //   `endSide = -1` before relying on it), so the caret advances past a
    //   `to` that stays put — `caretHead > to` — hiding the source in that
    //   same transaction, preserving "completing source editing and
    //   continuing after the image" exactly as before.
    // A caret exactly at the mapped `to` (where revealing itself places
    // it, `ImageWidget.makeEditButton`) still counts as inside, matching
    // the previous inclusive-on-`to` semantics.
    //
    // **Supplementary re-parse OR, not the primary check**: the positional
    // span alone under-includes one narrow, real edge case — deleting the
    // construct's own last character (e.g. the closing `)`) shrinks the
    // mapped `to` down by one (correct: that char is genuinely gone), but
    // then *retyping* that exact character lands the insertion exactly at
    // the new (shrunk) `to` boundary — indistinguishable, by position
    // alone, from "continuing to type past a still-valid image" (the
    // `endSide = -1` exclusion above exists *specifically* to hide in that
    // latter case). Re-resolving the current syntax tree at `from` and
    // checking the caret against *that* node's own `to` as an additional,
    // OR'd condition resolves the ambiguity the moment the retyped
    // character makes the text parse as a complete `Image` node again,
    // without making re-parsing the *primary* signal — a transient parse
    // failure (the original bug) only ever *fails* this second check
    // (`findEnclosingImageNode` returns `null`), never overrides the
    // positional check's own `true`, since this is an OR: either signal
    // agreeing "still inside" is enough.
    // Phase 2 (2026-09 rendering-lifecycle unification): `pendingFirstLeave`
    // clears through this exact same loop, on the exact same `stillInside`
    // signal `revealed` already uses — "the caret has left" is one fact,
    // not two separately-computed ones, even though it now closes out two
    // different fields. `findEnclosingImageNode` only ever matches a node
    // literally named `Image` (pre-existing, narrower than this field's
    // own now-kind-agnostic storage), so `insideReparsedNode`'s fallback
    // doesn't apply to an `Embed` entry — harmless: the primary
    // `insidePositionalSpan` check is already purely positional, with no
    // node-name assumption, and is what every Embed entry relies on here.
    const toClear: Array<{ from: number; state: ImageUiState }> = [];
    next.between(0, tr.state.doc.length, (from, to, value) => {
      if (!value.state.revealed && !value.state.pendingFirstLeave) {
        return;
      }
      const caretHead = tr.state.selection.main.head;
      const insidePositionalSpan = caretHead >= from && caretHead <= to;
      const imageNode = findEnclosingImageNode(tr.state, from);
      const insideReparsedNode = imageNode !== null && caretHead >= imageNode.from && caretHead <= imageNode.to;
      const stillInside = insidePositionalSpan || insideReparsedNode;
      if (!stillInside) {
        toClear.push({ from, state: value.state });
      }
    });
    for (const { from, state } of toClear) {
      next = next.update({
        filter: (f) => f !== from,
        add: [new ImageUiValue({ ...state, revealed: false, pendingFirstLeave: false }).range(from, from)],
      });
    }

    // "Freshly created" (Phase 2, 2026-09 rendering-lifecycle
    // unification): marks a brand-new Image/Embed occurrence — one with
    // no prior UI-state entry at all — `pendingFirstLeave: true`, so the
    // live-preview render gate (`imageLivePreview.ts`/`embedLivePreview.ts`)
    // keeps it raw until the caret first leaves, instead of collapsing to
    // a widget the instant the syntax completes. Walks the **new**
    // document's tree (unlike the `broken` block below, which walks the
    // *old* tree for its own, different coordinate-safety reason) — the
    // node this is looking for frequently only starts existing as a
    // complete Lezer node as a *result* of this very transaction (e.g.
    // typing the closing `)`/`]]`).
    //
    // Checks `next` — already reflecting this same transaction's own
    // explicit `setImageUiState` effects, applied in the loop above — for
    // an existing entry first, and does nothing if one is already there.
    // This is what makes Embed's "selecting from autocomplete renders
    // immediately" fall out for free with no special-casing here:
    // `embedCompletionSource.ts`'s own `apply()` dispatches
    // `setImageUiState` with `pendingFirstLeave: false` in the exact same
    // transaction as the insert, so by the time this block runs, an entry
    // already exists and this loop skips it entirely.
    //
    // Also skipped entirely for a transaction carrying `presentationOnlyEdit`
    // (flicker-fix follow-on, found via a resize/mode-change on an image
    // with no prior UI entry — e.g. never touched this session): the pipe
    // segment rewrite this block would otherwise see as "an Image/Embed
    // node overlapping the edit" is a genuine `docChanged` edit to the
    // node's own text, exactly like the `broken`-forcing block below has
    // its own copy of this same guard for — without it, a presentation-only
    // commit on such an image would mark it `pendingFirstLeave: true`,
    // which (if the caret happened to still be inside the node's range —
    // not unusual right after opening its size menu) makes
    // `imageLivePreview.ts`'s own render gate keep it fully raw instead of
    // rendering the widget at all, the same "image vanishes" symptom the
    // `broken`-forcing fix addresses for a different code path.
    if (tr.docChanged && !tr.effects.some((effect) => effect.is(presentationOnlyEdit))) {
      const freshNodes: Array<{ from: number; to: number }> = [];
      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        syntaxTree(tr.state).iterate({
          from: Math.max(0, fromB - 1),
          to: Math.min(tr.state.doc.length, toB + 1),
          enter: (node) => {
            if ((node.name === 'Image' || node.name === 'Embed') && fromB < node.to && toB > node.from) {
              freshNodes.push({ from: node.from, to: node.to });
            }
          },
        });
      });
      for (const { from, to } of freshNodes) {
        // Same `f !== from` adjacency guard as the `broken` block's own
        // existing-entry lookup below — two directly-adjacent
        // Image/Embed nodes share a boundary point the instant either one
        // has any stored entry, and `RangeSet.between`'s point query at
        // that shared point visits both.
        let hasEntry = false;
        next.between(from, from, (f) => {
          if (f === from) {
            hasEntry = true;
          }
        });
        if (!hasEntry) {
          // Seeds `displayMode` from whatever the just-completed node's own
          // `|token,...` presentation segment already says (resize
          // milestone; syntax later reworked to the Obsidian-style
          // in-bracket pipe — mediaPresentationModel.ts) — not always
          // `DEFAULT_IMAGE_UI_STATE`'s hardcoded `'fill'`. Without this, an
          // image pasted with metadata already present in one transaction
          // (e.g. `![Alt|6,center,fit](url)`) would still render Fill: this
          // "freshly created" block runs before `getImageUiState`'s own
          // persisted-mode fallback ever gets a chance to — an entry
          // already exists the instant this block writes one, so that
          // fallback's own "no entry yet" precondition never fires for a
          // node created this way. Harmless to call for an `Embed` node
          // that turns out to be a PDF, not an image: `getImagePresentation`
          // only ever reads the segment's own tokens (kind-agnostic), and
          // `PdfEmbedWidget` never reads `displayMode` at all.
          next = next.update({
            add: [
              new ImageUiValue({
                ...DEFAULT_IMAGE_UI_STATE,
                displayMode: getImagePresentation(tr.state, to).mode,
                pendingFirstLeave: true,
              }).range(from, to),
            ],
          });
        }
      }
    }

    // `broken` forced `true` on a genuine edit to an Image node's own
    // text — pessimistic by design (this field's own doc comment above
    // has the full account of why the earlier optimistic-reset revision
    // was wrong twice over: a coordinate-space bug in how it queried
    // `touchesRange`, and a design flaw where `false` let a real, visible
    // `<img>` mount for an as-yet-unverified URL). `ImageWidget.
    // renderBroken`'s own probe is what ever moves this back to `false`,
    // only once the *current* URL is confirmed to actually load.
    //
    // Walks the **old** document's syntax tree (`tr.startState`), windowed
    // narrowly around each of this transaction's own changed ranges (via
    // `iterChangedRanges`, the same narrow-window discipline `findTokenAt`
    // in `semanticToken/tokenEngagement.ts` already established for
    // exactly this kind of hot-path query) — never the *new* document.
    // This is what makes it coordinate-safe by construction, not merely
    // coordinate-correct by careful arithmetic: every position involved —
    // the changed range and the candidate node — is read from the same
    // (old) document, so no separate `touchesRange` call, and therefore no
    // pre/post-change coordinate mismatch to get wrong, is possible here.
    //
    // The `[fromA - 1, toA + 1]` padding on the *search* window is
    // deliberately generous — it exists only so `Tree.iterate` doesn't
    // miss a candidate node, not to decide whether the edit actually
    // touches it. That decision is the explicit `fromA < node.to && toA >
    // node.from` check below, confirmed directly (not assumed) to be
    // necessary: `Tree.iterate`'s own point-query boundary behavior is
    // *inclusive* on both ends (a zero-width query exactly at a node's own
    // `to` still visits that node), so relying on the search window alone
    // — the first version of this fix — incorrectly flagged an insertion
    // immediately *after* the image (typing right after it, or editing
    // unrelated text one line below where the search padding reached back
    // in) as "touching" it. The explicit half-open overlap test is what
    // actually encodes "the edit's own characters overlap the node's own
    // characters," independent of `Tree.iterate`'s own boundary quirks.
    //
    // Deliberately does **not** require an existing `imageUiState` entry
    // (unlike the `revealed` auto-hide above, which only ever iterates
    // `next`'s existing entries): a previously-*working* image (`broken:
    // false`, its entire steady state being "no entry was ever written")
    // being edited toward a bad URL must also flip pessimistic — that
    // image never had an entry to iterate before this. Writing a fresh
    // entry here (preserving `revealed`/`displayMode` from whatever entry
    // already existed, or `DEFAULT_IMAGE_UI_STATE`'s otherwise) is what
    // covers that direction, symmetric with the already-broken-being-
    // edited direction, through this one mechanism rather than two.
    //
    // Skips entirely for a transaction carrying `presentationOnlyEdit` —
    // see that effect's own doc comment for the flicker bug this guard
    // fixes: a presentation-only rewrite of the pipe segment is a
    // `docChanged` edit that overlaps the node's own range exactly like a
    // real content edit would, but it never touches alt/URL/title, so it
    // must never pessimistically flip a working image to broken.
    if (tr.docChanged && !tr.effects.some((effect) => effect.is(presentationOnlyEdit))) {
      const touchedImages: Array<{ from: number; to: number }> = [];
      tr.changes.iterChangedRanges((fromA, toA) => {
        syntaxTree(tr.startState).iterate({
          from: Math.max(0, fromA - 1),
          to: Math.min(tr.startState.doc.length, toA + 1),
          enter: (node) => {
            if (node.name === 'Image' && fromA < node.to && toA > node.from) {
              touchedImages.push({ from: node.from, to: node.to });
            }
          },
        });
      });
      for (const node of touchedImages) {
        const newFrom = tr.changes.mapPos(node.from);
        // Preserve whatever span an *existing* entry already tracks (the
        // `revealed` auto-hide check above depends on this span, not on
        // this block's own `broken` write) — only a brand-new entry (no
        // prior occurrence at this position) falls back to the node's own
        // freshly-mapped `to`.
        let existing: ImageUiState | null = null;
        let existingTo: number | null = null;
        next.between(newFrom, newFrom, (f, t, v) => {
          // `between`'s point query at `newFrom` also visits any *other*
          // entry whose own span happens to *end* exactly at `newFrom` —
          // confirmed directly, not assumed (a scratch `RangeSet.between`
          // test) — which is exactly what two directly-adjacent Image
          // nodes produce (`image1.to === image2.from`) the moment image1
          // has any stored entry at all. Without this `f !== newFrom`
          // guard, image2's lookup could silently adopt image1's state
          // (or vice versa) instead of correctly finding nothing yet for
          // a brand-new occurrence. See `getImageUiState`'s own comment
          // below for the other, user-facing half of this same bug.
          if (f !== newFrom) {
            return;
          }
          existing = v.state;
          existingTo = t;
          return false;
        });
        const base = existing ?? DEFAULT_IMAGE_UI_STATE;
        const spanTo = existingTo ?? tr.changes.mapPos(node.to);
        next = next.update({
          filter: (f) => f !== newFrom,
          add: [new ImageUiValue({ ...base, broken: true }).range(newFrom, spanTo)],
        });
      }
    }

    return next;
  },
});

/**
 * Current UI state for the Image node starting at `pos`, or the default
 * (hidden source, large display mode) if never toggled.
 *
 * **Adjacent-images bug (2026-09-02), root cause and fix**: `RangeSet.
 * between(pos, pos, cb)` also visits any *other* entry whose own span
 * happens to *end* exactly at `pos` — confirmed directly against
 * `@codemirror/state`'s real behavior, not assumed. Two Image nodes with
 * no separator between them (`![A](url1)![B](url2)`) produce exactly
 * that: the first image's own `to` equals the second image's own `from`.
 * The instant the first image has *any* stored entry (an edit touched it,
 * its edit button was clicked, its display mode changed — anything that
 * gives it a real `[from, to)` span, per this field's own doc comment on
 * why entries carry spans at all), a lookup for the *second* image at
 * that shared boundary point could non-deterministically return the
 * first image's state instead of its own (`between`'s callback returning
 * `false` stops at whichever overlapping entry it reaches first, not
 * necessarily the one actually starting at `pos`) — including reading
 * `broken: false` off the first (working) image while the second
 * image's own, correct `broken: true` entry sits right there unseen.
 * That silently authorized `ImageWidget.renderWorking()` for a genuinely
 * broken second image — a real, visible `<img>` for an invalid URL,
 * showing the browser's native broken-image glyph, confirmed via a
 * direct reproduction before this fix. The fix is the same one-line
 * guard as the `broken`-forcing block's own "existing entry" lookup
 * below (`imageUiStateField.update`): reject any hit whose own `from`
 * doesn't exactly equal the queried `pos`, rather than trusting
 * `between`'s coarser overlap semantics to have found the right entry.
 *
 * `to`, when given, seeds a not-yet-toggled node's `displayMode` from its
 * *persisted* mode (`mediaPresentation/mediaPresentationUpdate.ts`'s
 * `getImagePresentation`) instead of this field's own hardcoded `'fill'`
 * default — added for the resize milestone, once mode became something
 * `MarkdownEditor.tsx`'s `handleSelectImageDisplayMode` actually writes to
 * the Markdown source rather than only to this ephemeral field (see that
 * function's own doc comment). Without this, a `{6,center,large}` image
 * would render as Large only after the user reopened the size menu once in
 * this session — reloading a note (a fresh `EditorState`, empty
 * `RangeSet`, this file's own documented reason display mode used to reset
 * to Fill on reopen) would otherwise silently drop back to Fill despite
 * the Markdown itself saying `large`. Every other field
 * (`revealed`/`broken`/`pendingFirstLeave`) still defaults exactly as
 * before — only `displayMode` has a persisted source to fall back to.
 * `to` is optional and only consulted on this miss path so every
 * pre-existing call site (none of which pass it) keeps compiling and
 * behaving identically unchanged.
 */
export function getImageUiState(state: EditorState, pos: number, to?: number): ImageUiState {
  let found: ImageUiState | null = null;
  state
    .field(imageUiStateField, false)
    ?.between(pos, pos, (from, _to, value) => {
      if (from !== pos) {
        return;
      }
      found = value.state;
      return false;
    });
  if (found) {
    return found;
  }
  if (to === undefined) {
    return DEFAULT_IMAGE_UI_STATE;
  }
  const persistedMode = getImagePresentation(state, to).mode;
  return { ...DEFAULT_IMAGE_UI_STATE, displayMode: persistedMode };
}
