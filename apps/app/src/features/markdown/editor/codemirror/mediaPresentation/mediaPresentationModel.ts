/**
 * The persisted (document-derived) media-presentation model — distinct
 * from `image/imageUiState.ts`'s `ImageDisplayMode`, which is explicitly
 * ephemeral CM6 UI state, never written to the Markdown source (see that
 * file's own doc comment: "switching modes never touches the Markdown
 * source... persistence/serialization of the selected mode is an
 * explicit, separate, not-yet-decided later concern"). This module *is*
 * that later concern. The two share the same three mode string literals
 * by deliberate convention, not by importing one from the other — they
 * answer different questions (what's on screen right now vs. what the
 * Markdown source actually says) and are allowed to diverge in principle
 * even though today nothing makes them.
 *
 * Locked syntax (Obsidian-style, superseding an earlier, abandoned
 * appended-`{...}`-suffix design — see git history / prior task reports for
 * that design's own rationale, now moot): presentation values live
 * **inside** the construct's own bracket, as an unordered comma-separated
 * token list appended to the display text after a `|`:
 *
 *   `![Mountain view|6,center,fit](photo.jpg)` — native Markdown image
 *   `![[document.pdf|6,center]]` — local PDF embed
 *   `![Mountain view|320,500,fill,center](photo.jpg)` — resized Image, Fill (width 320, height 500)
 *   `![Mountain view|320,fit,center](photo.jpg)` — resized Image, Fit (width 320 only, no persisted height)
 *
 * Recognized tokens:
 * - width: an integer token. 1–11 = proportional (Nths of available
 *   content width, 11 = full width); 12+ = a literal pixel width. Only
 *   these two buckets exist — a token outside both (e.g. `0`) is
 *   unrecognized.
 * - height (Image only, resize milestone): a second integer token — a
 *   literal pixel value, no proportional bucket. Never valid for a PDF —
 *   `resolvePdfPresentation` below simply never reads it. See
 *   `ImagePresentation.height`'s own doc comment for why it stays
 *   *dormant* (present in the Markdown, never applied to rendering)
 *   while Fit is the active mode.
 * - alignment: `left` | `center` | `right`.
 * - mode (Image only): `fill` | `fit`. Never valid for a PDF —
 *   `resolvePdfPresentation` below simply never reads it.
 * Unknown tokens (e.g. `banana`) are ignored, never an error. Duplicate
 * recognized values: **last one wins** — `parseMediaPresentationTokens`
 * below implements this by simply overwriting on every match in source
 * order, never by special-casing "first vs. last." Width/height are the
 * one exception to "last wins": since both are bare integers with no
 * distinguishing syntax, they're assigned *positionally* (first numeric
 * token = width, second = height) rather than both trying to occupy one
 * "last recognized number" slot — see `parseMediaPresentationTokens`'s
 * own doc comment.
 *
 * This file only ever deals in plain token arrays — it has no opinion on
 * *where* those tokens came from (a native Image's alt-bracket pipe
 * segment, or an Embed's WikiLink-style alias segment once
 * `mediaPresentationUpdate.ts`'s own disambiguation decides that segment
 * is metadata, not a real display alias) — see that file for the two
 * different raw-text extraction paths that both funnel into
 * `resolveImagePresentation`/`resolvePdfPresentation` here unchanged.
 */

export type MediaAlignment = 'left' | 'center' | 'right';
/**
 * `'large'` has been removed completely (a later product decision — image
 * modes are now only Fill/Fit). `'fit'` now covers what `'large'` used to
 * mean (natural size, no height cap) — the *old* `'fit'` (a 400px-tall
 * cap) no longer exists at all, not renamed, not aliased. A persisted
 * `large` token is simply unrecognized now — `parseMediaPresentationTokens`
 * ignores it like any other unknown token, never resurrected.
 */
export type MediaPresentationMode = 'fill' | 'fit';

/**
 * Image capability: width + height + alignment + mode. `height` (resize
 * milestone) is a literal pixel value or `null` (never persisted/never
 * resized) — unlike `width`, it has no proportional 1–10 bucket, since a
 * container height was never independently settable before native/custom
 * resize existed. **Dormant while Fit is active**: Fit's own rendered
 * height is always CSS-derived `auto` (`mediaLayoutStyle.ts`'s
 * `applyMediaHeight`) — a Fit image's `height` token, if present, is
 * carried in the Markdown untouched (e.g. surviving a Fit-mode width-only
 * resize) purely so a later Fit→Fill switch can reactivate it, exactly
 * mirroring how `width`/`alignment` already survive a mode switch via
 * plain object-spread at every existing write site
 * (`MarkdownEditor.tsx`'s `handleSelectImageDisplayMode`).
 */
export interface ImagePresentation {
  readonly width: number;
  readonly height: number | null;
  readonly alignment: MediaAlignment;
  readonly mode: MediaPresentationMode;
}

/** PDF capability: width + alignment only — no mode, no height exists for a PDF embed (PDF resizing is out of scope for this milestone). */
export interface PdfPresentation {
  readonly width: number;
  readonly alignment: MediaAlignment;
}

/**
 * Where Fill → Fit leaves the box: it keeps its HEIGHT, and the width follows from the image's own
 * proportions (so the image shows whole at that height) — a 3:2 image 400px tall becomes 600px wide.
 *
 * If that width would be wider than the box it is in (the image is wider than the box is), the
 * height can't be kept without cropping, so the box keeps its width instead and the height becomes
 * the image's natural height at it. `null` when anything needed is missing (no layout yet, the image
 * not loaded): the caller then changes nothing but the mode.
 *
 * Widths below 12 would be read as column units rather than pixels, so a pixel width is never
 * smaller than 12.
 */
export function resolveFitSizeOnSwitch(input: {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly currentWidth: number;
}): { readonly width: number; readonly height: number } | null {
  const { boxWidth, boxHeight, naturalWidth, naturalHeight, currentWidth } = input;
  const usable = [boxWidth, boxHeight, naturalWidth, naturalHeight].every(
    (value) => Number.isFinite(value) && value > 0
  );
  if (!usable) {
    return null;
  }
  const ratio = naturalWidth / naturalHeight;
  const widthAtThisHeight = Math.round(boxHeight * ratio);
  if (widthAtThisHeight >= Math.round(boxWidth)) {
    return { width: currentWidth, height: Math.round(boxWidth / ratio) };
  }
  return { width: Math.max(12, widthAtThisHeight), height: Math.round(boxHeight) };
}

export const DEFAULT_IMAGE_PRESENTATION: ImagePresentation = {
  width: 11,
  height: null,
  alignment: 'left',
  mode: 'fill',
};

export const DEFAULT_PDF_PRESENTATION: PdfPresentation = {
  width: 11,
  alignment: 'left',
};

const ALIGNMENT_VALUES: ReadonlySet<string> = new Set(['left', 'center', 'right']);
const MODE_VALUES: ReadonlySet<string> = new Set(['fill', 'fit']);

function isMediaAlignment(value: string): value is MediaAlignment {
  return ALIGNMENT_VALUES.has(value);
}

function isMediaPresentationMode(value: string): value is MediaPresentationMode {
  return MODE_VALUES.has(value);
}

/** A recognized-but-unbucketed width integer, or `null` for anything outside the recognized 1+ range (e.g. `0`) or non-numeric. */
function parseWidthToken(token: string): number | null {
  if (!/^\d+$/.test(token)) {
    return null;
  }
  const value = Number(token);
  return value >= 1 ? value : null;
}

export interface ParsedMediaPresentationTokens {
  readonly width: number | null;
  /** Second numeric token encountered, if any — `null` for a PDF (`resolvePdfPresentation` never reads it) or an Image with no persisted height. See `ImagePresentation.height`'s own doc comment for the dormant-while-Fit contract. */
  readonly height: number | null;
  readonly alignment: MediaAlignment | null;
  readonly mode: MediaPresentationMode | null;
}

/**
 * Classifies raw suffix tokens (`mediaPresentationScanner.ts`'s own
 * unclassified `tokens` array) into width/height/alignment/mode, unknown
 * tokens ignored, last-recognized-value-wins for duplicates (see this
 * file's own doc comment for why). Kind-agnostic on purpose —
 * `resolveImagePresentation`/`resolvePdfPresentation` below decide which
 * of these fields their own capability actually uses; a PDF's caller
 * simply never reads `mode`/`height`.
 *
 * **Numeric tokens are positional, not both "last wins."** Width and
 * height share no distinguishing syntax (both are bare positive
 * integers), so the *first* numeric token found is `width` and the
 * *second* is `height` — matching every example in this file's own top
 * doc comment (`320,fit,center` = width only; `320,500,fill,center` =
 * width then height) and requiring no new punctuation. A third numeric
 * token, if one somehow appeared, is simply ignored (extending the
 * existing "unknown/unrecognized value ignored" tolerance to this case,
 * rather than inventing a third slot nothing needs).
 */
export function parseMediaPresentationTokens(tokens: readonly string[]): ParsedMediaPresentationTokens {
  const numbers: number[] = [];
  let alignment: MediaAlignment | null = null;
  let mode: MediaPresentationMode | null = null;

  for (const raw of tokens) {
    const number_ = parseWidthToken(raw);
    if (number_ !== null) {
      numbers.push(number_);
      continue;
    }
    if (isMediaAlignment(raw)) {
      alignment = raw;
      continue;
    }
    if (isMediaPresentationMode(raw)) {
      mode = raw;
      continue;
    }
    // Unknown token — ignored, never breaks the parse.
  }

  return { width: numbers[0] ?? null, height: numbers[1] ?? null, alignment, mode };
}

/** Resolves raw suffix tokens into a complete `ImagePresentation`, filling in defaults for anything absent/unrecognized. */
export function resolveImagePresentation(tokens: readonly string[]): ImagePresentation {
  const parsed = parseMediaPresentationTokens(tokens);
  return {
    width: parsed.width ?? DEFAULT_IMAGE_PRESENTATION.width,
    height: parsed.height ?? DEFAULT_IMAGE_PRESENTATION.height,
    alignment: parsed.alignment ?? DEFAULT_IMAGE_PRESENTATION.alignment,
    mode: parsed.mode ?? DEFAULT_IMAGE_PRESENTATION.mode,
  };
}

/** Resolves raw suffix tokens into a complete `PdfPresentation` — a `mode` token, if present, is simply never consulted. */
export function resolvePdfPresentation(tokens: readonly string[]): PdfPresentation {
  const parsed = parseMediaPresentationTokens(tokens);
  return {
    width: parsed.width ?? DEFAULT_PDF_PRESENTATION.width,
    alignment: parsed.alignment ?? DEFAULT_PDF_PRESENTATION.alignment,
  };
}

/** A positive-integer guard for serialization — defensive against a caller-constructed `ImagePresentation`/`PdfPresentation` with a nonsensical `width`/`height` (never produced by `resolve*Presentation` itself, which only ever reads recognized 1+ integers). */
function isValidWidth(width: number): boolean {
  return Number.isInteger(width) && width >= 1;
}

/**
 * Canonical order `width,height,alignment,mode`, defaults omitted — per
 * the locked spec (`width` before `height` is load-bearing, not
 * cosmetic: `parseMediaPresentationTokens` assigns the first numeric
 * token to `width` and the second to `height`, so this order is what
 * makes the two round-trip correctly). Returns `''` (no pipe segment at
 * all) when every field is already default, which is what makes "reset
 * to defaults removes the metadata, restoring the normal syntax" fall
 * out of this function directly, with no separate "is this all-default"
 * branch needed at the call site. **`height` is emitted whenever it's
 * set, regardless of `mode`** — this is what makes a Fit-mode height
 * dormant rather than discarded (see `ImagePresentation.height`'s own
 * doc comment). The caller (`mediaPresentationUpdate.ts`) is responsible
 * for combining this bare token string with the display alt/alias and a
 * `|` — this function has no opinion on brackets or pipes, only on which
 * tokens the canonical form needs.
 */
export function serializeImagePresentationTokens(presentation: ImagePresentation): string {
  const tokens: string[] = [];
  const hasHeight = presentation.height !== null && isValidWidth(presentation.height);
  // A height is the SECOND number; the parser takes the first as width. So whenever a height is
  // written, the width is written too — even a default (full) one — or a lone `500` would be read
  // back as a width of 500 and the height would be lost.
  if (isValidWidth(presentation.width) && (presentation.width !== DEFAULT_IMAGE_PRESENTATION.width || hasHeight)) {
    tokens.push(String(presentation.width));
  }
  if (hasHeight) {
    tokens.push(String(presentation.height));
  }
  if (presentation.alignment !== DEFAULT_IMAGE_PRESENTATION.alignment) {
    tokens.push(presentation.alignment);
  }
  if (presentation.mode !== DEFAULT_IMAGE_PRESENTATION.mode) {
    tokens.push(presentation.mode);
  }
  return tokens.join(',');
}

/** PDF counterpart to `serializeImagePresentationTokens` — no `mode` field exists to consider. */
export function serializePdfPresentationTokens(presentation: PdfPresentation): string {
  const tokens: string[] = [];
  if (isValidWidth(presentation.width) && presentation.width !== DEFAULT_PDF_PRESENTATION.width) {
    tokens.push(String(presentation.width));
  }
  if (presentation.alignment !== DEFAULT_PDF_PRESENTATION.alignment) {
    tokens.push(presentation.alignment);
  }
  return tokens.join(',');
}
