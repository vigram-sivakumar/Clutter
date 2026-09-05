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
 *
 * Recognized tokens:
 * - width: an integer token. 1–11 = proportional (Nths of available
 *   content width, 11 = full width); 12+ = a literal pixel width. Only
 *   these two buckets exist — a token outside both (e.g. `0`) is
 *   unrecognized.
 * - alignment: `left` | `center` | `right`.
 * - mode (Image only): `fill` | `fit`. Never valid for a PDF —
 *   `resolvePdfPresentation` below simply never reads it.
 * Unknown tokens (e.g. `banana`) are ignored, never an error. Duplicate
 * recognized values: **last one wins** — `parseMediaPresentationTokens`
 * below implements this by simply overwriting on every match in source
 * order, never by special-casing "first vs. last."
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

/** Image capability: width + alignment + mode. */
export interface ImagePresentation {
  readonly width: number;
  readonly alignment: MediaAlignment;
  readonly mode: MediaPresentationMode;
}

/** PDF capability: width + alignment only — no mode exists for a PDF embed. */
export interface PdfPresentation {
  readonly width: number;
  readonly alignment: MediaAlignment;
}

export const DEFAULT_IMAGE_PRESENTATION: ImagePresentation = {
  width: 11,
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
  readonly alignment: MediaAlignment | null;
  readonly mode: MediaPresentationMode | null;
}

/**
 * Classifies raw suffix tokens (`mediaPresentationScanner.ts`'s own
 * unclassified `tokens` array) into width/alignment/mode, unknown tokens
 * ignored, last-recognized-value-wins for duplicates (see this file's own
 * doc comment for why). Kind-agnostic on purpose — `resolveImagePresentation`/
 * `resolvePdfPresentation` below decide which of these three fields their
 * own capability actually uses; a PDF's caller simply never reads `mode`.
 */
export function parseMediaPresentationTokens(tokens: readonly string[]): ParsedMediaPresentationTokens {
  let width: number | null = null;
  let alignment: MediaAlignment | null = null;
  let mode: MediaPresentationMode | null = null;

  for (const raw of tokens) {
    const width_ = parseWidthToken(raw);
    if (width_ !== null) {
      width = width_;
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

  return { width, alignment, mode };
}

/** Resolves raw suffix tokens into a complete `ImagePresentation`, filling in defaults for anything absent/unrecognized. */
export function resolveImagePresentation(tokens: readonly string[]): ImagePresentation {
  const parsed = parseMediaPresentationTokens(tokens);
  return {
    width: parsed.width ?? DEFAULT_IMAGE_PRESENTATION.width,
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

/** A positive-integer guard for serialization — defensive against a caller-constructed `ImagePresentation`/`PdfPresentation` with a nonsensical `width` (never produced by `resolve*Presentation` itself, which only ever reads recognized 1+ integers). */
function isValidWidth(width: number): boolean {
  return Number.isInteger(width) && width >= 1;
}

/**
 * Canonical order `width,alignment,mode`, defaults omitted — per the
 * locked spec. Returns `''` (no pipe segment at all) when every field is
 * already default, which is what makes "reset to defaults removes the
 * metadata, restoring the normal syntax" fall out of this function
 * directly, with no separate "is this all-default" branch needed at the
 * call site. The caller (`mediaPresentationUpdate.ts`) is responsible for
 * combining this bare token string with the display alt/alias and a `|`
 * — this function has no opinion on brackets or pipes, only on which
 * tokens the canonical form needs.
 */
export function serializeImagePresentationTokens(presentation: ImagePresentation): string {
  const tokens: string[] = [];
  if (isValidWidth(presentation.width) && presentation.width !== DEFAULT_IMAGE_PRESENTATION.width) {
    tokens.push(String(presentation.width));
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
