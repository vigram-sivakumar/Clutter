import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { scanImage } from '../image/imageScanner';
import { scanEmbed, type EmbedMatch } from '../embed/embedScanner';
import {
  resolveImagePresentation,
  resolvePdfPresentation,
  serializeImagePresentationTokens,
  serializePdfPresentationTokens,
  type ImagePresentation,
  type PdfPresentation,
} from './mediaPresentationModel';

/**
 * Disambiguates an Embed's WikiLink-style alias segment
 * (`embedScanner.ts`'s `EmbedMatch.alias`, delegated wholesale from
 * `wikiLinkScanner.ts` — **never modified by this file**, per the locked
 * "do not modify WikiLink grammar/scanning semantics, do not break normal
 * WikiLink aliases" constraint) into either a real display alias/title or
 * presentation-metadata tokens. The two share the exact same single pipe
 * slot (`![[path|X]]`) — the WikiLink grammar only ever recognizes one
 * `|`, by design, and this file must not change that — so a real display
 * alias and presentation metadata can never coexist on one embed; setting
 * one displaces the other. See this module's own doc comment for the full
 * account of that tradeoff.
 *
 * The disambiguation is shape-based, not a new syntax, with two rules:
 * - **Multiple comma-separated segments** (`6,center`, `center,fit`) are
 *   always metadata — a real alias essentially never contains a literal
 *   comma, so this alone is a strong, low-collision signal, regardless of
 *   whether every individual token is itself a *recognized* value
 *   (`mediaPresentationModel.ts`'s own "unknown tokens are ignored" rule
 *   already covers an unrecognized one inside a comma list).
 * - **A single bare token** (no comma) is metadata only when it is
 *   actually a *recognized* value on its own — a positive integer width,
 *   or one of `left`/`center`/`right`/`fill`/`fit`. Anything else
 *   — including an ordinary single-word alias like `Caption` or
 *   `Screenshot` (confirmed against `resolveEmbedPdf.ts`'s/
 *   `resolveEmbedImage.ts`'s own existing, pre-this-change test coverage,
 *   which relies on exactly this working) — is preserved as a real alias.
 *   This is what keeps a common single-word title from being silently
 *   swallowed as metadata purely because it happens to contain no spaces:
 *   *recognition*, not bare shape, is what disambiguates the single-token
 *   case.
 *
 * A real display alias/title (`My Document`, `Q3 Report`, `Caption`,
 * anything with a space, punctuation, or an unrecognized single word)
 * never matches either metadata rule, so it's preserved exactly as
 * `resolveEmbedImage.ts`/`resolveEmbedPdf.ts` already treat it today —
 * this function changes nothing about an alias that isn't itself
 * metadata-shaped. **Residual ambiguity, disclosed, not solved**: an
 * alias that happens to equal a recognized single word (a resource
 * genuinely titled "Center" or "Fit") is indistinguishable from real
 * metadata under this heuristic and will be treated as metadata — there
 * is no escape syntax for this today; renaming the resource (or using a
 * multi-word title) is the only workaround.
 */
const RECOGNIZED_SINGLE_TOKEN = /^(?:[1-9]\d*|left|center|right|fill|fit)$/;

export interface EmbedAliasFields {
  /** The real display alias/title to use — `null` when the alias segment is absent, or when it's metadata-shaped (nothing left to display). */
  readonly displayAlias: string | null;
  /** Unclassified presentation tokens — empty when the alias segment is absent or is a real (non-metadata-shaped) alias. */
  readonly tokens: readonly string[];
}

export function resolveEmbedAliasFields(alias: string | null): EmbedAliasFields {
  if (alias === null) {
    return { displayAlias: null, tokens: [] };
  }
  const tokens = alias.split(',');
  const isMetadata =
    tokens.length > 1 ? tokens.every((token) => /^[A-Za-z0-9]+$/.test(token)) : RECOGNIZED_SINGLE_TOKEN.test(alias);
  if (isMetadata) {
    return { displayAlias: null, tokens };
  }
  return { displayAlias: alias, tokens: [] };
}

interface MediaNodeRange {
  readonly kind: 'Image' | 'Embed';
  readonly from: number;
  readonly to: number;
}

/** Walks up from whatever node ends exactly at `to` to find the enclosing `Image`/`Embed` — the kind-detection step `getImagePresentation`/`getPdfPresentation`/`computeImagePresentationUpdate`/`computePdfPresentationUpdate` all need before they know which raw-text scanner (`scanImage` vs `scanEmbed`) applies. */
function findMediaNodeEndingAt(state: EditorState, to: number): MediaNodeRange | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(to, -1);
  while (node) {
    if ((node.name === 'Image' || node.name === 'Embed') && node.to === to) {
      return { kind: node.name, from: node.from, to: node.to };
    }
    node = node.parent;
  }
  return null;
}

/** Current, fully-resolved `ImagePresentation` for the Image/Embed node ending at `to` — defaults if absent or unparseable. Re-derives from the current raw text/syntax tree on every call (cheap, single-node), never cached. */
export function getImagePresentation(state: EditorState, to: number): ImagePresentation {
  const found = findMediaNodeEndingAt(state, to);
  if (!found) {
    return resolveImagePresentation([]);
  }
  const raw = state.sliceDoc(found.from, found.to);
  if (found.kind === 'Embed') {
    const match = scanEmbed(raw, 0);
    return resolveImagePresentation(resolveEmbedAliasFields(match?.alias ?? null).tokens);
  }
  const match = scanImage(raw);
  return resolveImagePresentation(match?.presentationTokens ?? []);
}

/** PDF counterpart to `getImagePresentation` — only ever meaningful for an `Embed` node (a native `Image` node has no PDF interpretation), defaults otherwise. */
export function getPdfPresentation(state: EditorState, to: number): PdfPresentation {
  const found = findMediaNodeEndingAt(state, to);
  if (!found || found.kind !== 'Embed') {
    return resolvePdfPresentation([]);
  }
  const raw = state.sliceDoc(found.from, found.to);
  const match = scanEmbed(raw, 0);
  return resolvePdfPresentation(resolveEmbedAliasFields(match?.alias ?? null).tokens);
}

/** A single-transaction document change — `view.dispatch({ changes })` is the caller's job, so every UI entry point commits through exactly one CM6 transaction. */
export interface MediaPresentationChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

const NO_OP_CHANGE = (at: number): MediaPresentationChange => ({ from: at, to: at, insert: '' });

/**
 * Rewrites an `Embed`'s own alias/pipe segment to reflect `tokenString`
 * (already serialized by the caller — this function has no opinion on
 * which capability's tokens they are, image or PDF). **Overwrites any
 * existing real display alias** when `tokenString` is non-empty — see
 * this module's own doc comment (`resolveEmbedAliasFields`) for why: the
 * single WikiLink pipe slot cannot hold both a real alias and
 * presentation metadata at once, and this is only ever invoked by an
 * explicit user presentation-changing action (mode selection, a future
 * resize commit), never automatically — an alias the user never touches
 * this way is never touched at all. When `tokenString` is empty (`next`
 * was all-default), preserves whatever real alias the *current* document
 * text still has (or removes the pipe segment entirely if there is none,
 * or it's itself metadata-shaped), matching "defaults remain implicit."
 * This only preserves an alias that survived untouched — once a real
 * alias has already been overwritten by a prior call to this function, it
 * is genuinely gone (the pipe slot now holds metadata-shaped text, which
 * `resolveEmbedAliasFields` can never distinguish back into the original
 * alias), not merely hidden.
 *
 * Shared by both `computeImagePresentationUpdate` (an image-asset Embed,
 * e.g. `![[image.png]]`) and `computePdfPresentationUpdate` (a PDF
 * Embed) — the alias-segment rewrite is identical WikiLink-alias
 * mechanics either way; only which serializer produced `tokenString`
 * differs, which is already resolved by the caller before this function
 * is ever reached.
 */
function computeEmbedPresentationChange(
  found: MediaNodeRange,
  match: EmbedMatch,
  tokenString: string
): MediaPresentationChange {
  const { displayAlias } = resolveEmbedAliasFields(match.alias);

  let bracketContent: string;
  if (tokenString !== '') {
    bracketContent = `${match.path}|${tokenString}`;
  } else if (displayAlias !== null) {
    bracketContent = `${match.path}|${displayAlias}`;
  } else {
    bracketContent = match.path;
  }

  // The Embed's own bracket content spans `![[` (3 chars) through the
  // closing `]]` (2 chars) — `match.end` is one past the closing `]]`
  // within `raw` (embedScanner.ts's own contract), so the bracket content
  // itself is `raw.slice(3, match.end - 2)`.
  return { from: found.from + 3, to: found.from + match.end - 2, insert: bracketContent };
}

/**
 * Rewrites the Image/Embed node ending at `to` to reflect `next` — a
 * native Markdown Image's own alt bracket (`![alt|tokens](url)`) for an
 * `Image` node, or an image-asset Embed's alias/pipe segment
 * (`![[path|tokens]]`) for an `Embed` node, via the shared
 * `computeEmbedPresentationChange` both this function and
 * `computePdfPresentationUpdate` use. Both node kinds render through the
 * same `ImageWidget` (`imageLivePreview.ts`/`embedLivePreview.ts`) and
 * must persist a mode/width/alignment change identically — dispatching to
 * the wrong shape here (or silently no-op'ing for one kind) is exactly
 * the bug this kind-dispatch exists to prevent.
 *
 * For an `Image` node: removes the `|tokens` segment entirely when `next`
 * is all-default (`serializeImagePresentationTokens` returns `''`),
 * restoring `![alt](url)`'s normal, implicit-defaults form, preserving
 * the display alt text, the URL, and any title exactly.
 */
export function computeImagePresentationUpdate(
  state: EditorState,
  to: number,
  next: ImagePresentation
): MediaPresentationChange {
  const found = findMediaNodeEndingAt(state, to);
  if (!found) {
    return NO_OP_CHANGE(to);
  }
  const raw = state.sliceDoc(found.from, found.to);
  const tokenString = serializeImagePresentationTokens(next);

  if (found.kind === 'Embed') {
    const match = scanEmbed(raw, 0);
    if (!match) {
      return NO_OP_CHANGE(to);
    }
    return computeEmbedPresentationChange(found, match, tokenString);
  }

  const match = scanImage(raw);
  if (!match) {
    return NO_OP_CHANGE(to);
  }
  const labelClose = raw.indexOf('](', 2);
  const insert = tokenString === '' ? match.alt : `${match.alt}|${tokenString}`;
  return { from: found.from + 2, to: found.from + labelClose, insert };
}

/** PDF counterpart to `computeImagePresentationUpdate` — only ever meaningful for an `Embed` node (a native `Image` node has no PDF interpretation), a no-op otherwise. See `computeEmbedPresentationChange`'s own doc comment for the shared alias-rewrite mechanics. */
export function computePdfPresentationUpdate(
  state: EditorState,
  to: number,
  next: PdfPresentation
): MediaPresentationChange {
  const found = findMediaNodeEndingAt(state, to);
  if (!found || found.kind !== 'Embed') {
    return NO_OP_CHANGE(to);
  }
  const raw = state.sliceDoc(found.from, found.to);
  const match = scanEmbed(raw, 0);
  if (!match) {
    return NO_OP_CHANGE(to);
  }
  return computeEmbedPresentationChange(found, match, serializePdfPresentationTokens(next));
}
