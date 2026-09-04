import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import type { ResolveDate } from './codemirror/date/dateResolution';
import type { GetEmbedSuggestions } from './codemirror/embed/embedSuggestion';
import type { ResolveEmbedImage } from './codemirror/embed/embedImageResolution';
import type { ResolveEmbedPdf } from './codemirror/pdf/embedPdfResolution';
import type { OnPdfEmbedClick } from './codemirror/pdf/PdfEmbedWidget';
import type { ResolveImageResource } from './codemirror/image/imageResourceResolution';
import type { ResolveImageSrc } from './codemirror/image/imageSrcResolution';
import type { ResolveTag } from './codemirror/tag/tagResolution';
import type { GetTagSuggestions } from './codemirror/tag/tagSuggestion';
import type { ResolveWikiLink } from './codemirror/wikilink/wikiLinkResolution';
import type { GetWikiLinkSuggestions } from './codemirror/wikilink/wikiLinkSuggestion';

export interface MarkdownEditorProps {
  /**
   * The page/draft id this editor instance is showing — the same value
   * `PageHost.tsx` already passes as React's own `key={activePageId}`
   * (which is *why* a `MarkdownEditor` instance exists for exactly one
   * page at a time; this prop doesn't change that). Used explicitly as
   * the cache key for per-document CM6 undo/redo history preservation
   * (`codemirror/editorHistoryCache.ts`) — read once at mount, not
   * inferred from the React `key` (a private React implementation detail
   * this component shouldn't reach for) or from `markdown` content (which
   * is not a stable identity: two different pages can have identical
   * text, and a page's own text changes on every edit).
   */
  readonly pageId: string;
  readonly markdown: string;
  /**
   * Whether note-open policy (computed by `PageHost.tsx`, mirroring the
   * same "empty title -> title gets focus, otherwise the body is ready to
   * edit" concept `Page.tsx`'s own `shouldAutoFocusTitle` already applies
   * to the title) wants this editor focused when there's no restorable
   * cached session to make that decision instead. Read once at mount —
   * `false`/omitted for every existing test call site, which don't
   * exercise this policy. See `docs/editor-architecture-decisions.md`'s
   * "Focus restoration" entry for the full priority rule (a restorable
   * cached session always wins over this flag; this flag only decides
   * when there's no session to restore).
   */
  readonly focusOnOpen?: boolean;
  /**
   * Fires on every content change (typing, paste, deletion) — commits into
   * the document session's Committed stage only, no persistence
   * (autosave-execution-model.md §3.1). Called unconditionally on every
   * document-changing transaction; the session's own no-op guard is what
   * filters out anything that isn't a real change, so this component
   * doesn't need its own diffing.
   */
  readonly onEdit?: (markdown: string) => void;
  /**
   * Fires on blur — a save request, not a payload (autosave-execution-model.md
   * §0): asks the system to make this session durable if it isn't already,
   * never carries content itself. The content to persist is always
   * whatever the session's own current revision holds by the time this
   * fires, per onEdit's own already-committed calls.
   */
  readonly onFlush?: () => void;
  /**
   * Resolves a WikiLink's target path (and optional local alias) into a
   * status, display label, and activation behavior — supplied entirely by
   * the feature/app layer. Accepted here (§5) but not yet consumed
   * anywhere in the component; the decoration layer that calls it is
   * introduced in §6.
   */
  readonly resolveWikiLink?: ResolveWikiLink;
  /**
   * Supplies WikiLink autocomplete candidates for a given in-progress
   * `[[query` — supplied entirely by the feature/app layer, same
   * injected-boundary shape as `resolveWikiLink` above. Accepted here but
   * only consumed once `wikiLinkAutocomplete()` is wired into the
   * extension list.
   */
  readonly getWikiLinkSuggestions?: GetWikiLinkSuggestions;
  /**
   * Supplies Embed autocomplete candidates for a given in-progress
   * `![[query` — supplied entirely by the feature/app layer, same
   * injected-boundary shape as `getWikiLinkSuggestions` above. This
   * milestone (local Resource embed syntax + autocomplete) only wires
   * this through to `embedCompletionSource`; resolving an accepted
   * `![[path]]` into a rendered resource is a later step.
   */
  readonly getEmbedSuggestions?: GetEmbedSuggestions;
  /**
   * Resolves a completed `![[path]]` Embed's target into an image URL (or
   * an unresolved/non-image outcome) for `embedLivePreview.ts` to render —
   * supplied entirely by the feature/app layer, same injected-boundary
   * shape as `resolveWikiLink` above. Composed from `resolveResourceEmbed()`
   * + `Application.resolveResourceImageUrl()` (see resolveEmbedImage.ts).
   */
  readonly resolveEmbedImage?: ResolveEmbedImage;
  /**
   * Resolves a completed `![[path]]` Embed's target into a PDF URL/title
   * (or an unresolved/non-pdf outcome) for `embedLivePreview.ts` to
   * render — the PDF-scoped counterpart to `resolveEmbedImage` above, same
   * injected-boundary shape, supplied entirely by the feature/app layer.
   * Consulted only when `resolveEmbedImage` says the target is a real
   * `VaultResource` that isn't an image (see `embedPdfResolution.ts`'s own
   * doc comment). Composed from the same `resolveResourceEmbed()` +
   * a resolved file URL (see `resolveEmbedPdf.ts`) — never a second
   * resource lookup.
   */
  readonly resolveEmbedPdf?: ResolveEmbedPdf;
  /**
   * Invoked with a rendered PDF embed's own vault-relative target path
   * when its "Open" control is activated — supplied entirely by the
   * feature/app layer, which re-resolves that path into the real
   * `VaultResource` and opens the existing `PdfOverlay` (the same
   * `ResourceOverlayState` mechanism `Sidebar.tsx`/`PageHost.tsx` already
   * use for a sidebar-click PDF open). This editor never opens `PdfOverlay`
   * itself and never imports `Vault`, per this file's own boundary.
   */
  readonly onPdfEmbedClick?: OnPdfEmbedClick;
  /**
   * Resolves a standard Markdown `![alt](url)` image's own destination
   * into a loadable file URL when it happens to name a local Vault path —
   * supplied entirely by the feature/app layer, same injected-boundary
   * shape as `resolveEmbedImage` above, for `imageLivePreview.ts` to
   * render. Composed from the *same* `resolveResourceEmbed()`
   * `resolveEmbedImage` uses + `Application.resolveResourceImageUrl()`
   * (see resolveImageSrc.ts) — never a second resolution mechanism.
   * `undefined`/omitted, or a destination this resolver can't place in the
   * Vault (an external URL, the overwhelmingly common case), both leave
   * the destination exactly as-is — see `ImageSrcResolution`'s own doc
   * comment.
   */
  readonly resolveImageSrc?: ResolveImageSrc;
  /**
   * Resolves a Tag's identifier into a status and activation behavior —
   * supplied entirely by the feature/app layer, same injected-boundary
   * shape as `resolveWikiLink` above. Unlike `resolveWikiLink`, there is
   * no display label to resolve (a tag's raw and at-rest forms are the
   * same text — see `tagResolution.ts`).
   */
  readonly resolveTag?: ResolveTag;
  /**
   * Supplies Tag autocomplete candidates for a given in-progress
   * `#query` — supplied entirely by the feature/app layer, same
   * injected-boundary shape as `getWikiLinkSuggestions` above. Only
   * consumed once `tagCompletionSource` is included in
   * `semanticCompletion()`'s `override` array.
   */
  readonly getTagSuggestions?: GetTagSuggestions;
  /**
   * Resolves a Date's activation behavior — supplied entirely by the
   * feature/app layer, same injected-boundary shape as `resolveTag`
   * above. Narrower still: a Date's display label needs no injection at
   * all (see `dateResolution.ts`), so this only ever supplies
   * `activate()`.
   */
  readonly resolveDate?: ResolveDate;
  /**
   * "Set as cover image" (2026-09-02 UX baseline, item 9) — invoked with a
   * rendered image's own URL when its options menu's cover item is
   * selected. Capability-gating, same shape as
   * `ResourceTopBarActions.onSetCoverImage?`: this editor never persists
   * anything itself (it never imports `PageOperations`, per this file's own
   * "editor never imports Vault/VaultQuery/EffectivePageState/
   * PageOperations directly" boundary), so the actual
   * `PageOperations.updateMetadata({ cover })` call lives entirely in
   * whichever app-layer caller supplies this prop (`PageHost.tsx`, reusing
   * its existing `onSetCoverImage` closure — the same one already wired to
   * the top bar's own cover picker). Absent omits the image menu's cover
   * item entirely, mirroring `onSetCoverImage`'s own optionality there.
   */
  readonly onSetCoverImage?: (url: string) => void;
  /**
   * Backs both the inline `ImageOptionsMenu`'s and `ImageOverlay`'s own
   * Download item — takes the same `copyUrl ?? url` string
   * `onSetCoverImage` above already takes, for the exact same reason (a
   * local Resource embed's vault-relative `copyUrl` vs. a standard
   * image's raw `url`). The app layer (`PageHost.tsx`) decides whether
   * that string resolves to a local `VaultResource` (`downloadResource.ts`)
   * or a genuinely external URL (`downloadRemoteImage.ts`) — this editor
   * has no opinion on which, same boundary reasoning as every other prop
   * in this group.
   */
  readonly onDownloadImage?: (url: string) => void;
  /**
   * Resolves a clicked image's own path (a Resource embed's vault-relative
   * `copyUrl`, or — for a standard Markdown image — its raw `url`, see
   * `ImageWidget.ts`'s `OnImageClick` doc comment) into a local
   * `VaultResource` id, if one exists — supplied entirely by the feature/
   * app layer, same injected-boundary shape as `resolveWikiLink` above.
   * Absent (or resolving to nothing, e.g. an external URL) omits
   * `ImageOverlay`'s More Actions control entirely — see
   * `imageResourceResolution.ts`'s own doc comment.
   */
  readonly resolveImageResource?: ResolveImageResource;
  /**
   * The five props below back `ImageOverlay`'s More Actions menu — the
   * same actions/dispatch shape `SidebarRowActions`' own resource-scoped
   * members already use (`onArchiveResource`/`onRevealResourceInFinder`/
   * `onCopyResourcePath`/`resourceMoveDestinations`/`onMoveResource`),
   * reused here rather than re-derived: this editor never imports
   * `ResourceOperations`/`Vault` itself, so every one of these is a plain
   * callback the app layer (`PageHost.tsx`) composes from its own already-
   * existing `resourceOperations`/`vault` access — the exact same
   * operations Sidebar's own resource row menu already dispatches through,
   * just a second entry point into them, never a second implementation.
   * All five are omitted together (no image ever resolves a resource) for
   * any embedding context that doesn't wire this up, e.g. every existing
   * test call site.
   */
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  /** Same shape/reasoning as onRevealResourceInFinder above — see downloadResource.ts. */
  readonly onDownloadResource?: (resourceId: string) => void;
  readonly resourceMoveDestinations?: FolderPickerItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  /** Present alongside resourceMoveDestinations — see MoveDestinationPicker's matching prop. */
  readonly onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * Imperative handle for callers that need to move focus into an
 * already-mounted editor from outside — e.g. the page title's Enter key
 * advancing focus here. Mirrors EditableTextHandle's shape but is kept as
 * its own, separate type: MarkdownEditor isn't an EditableText, and a
 * one-method interface isn't worth cross-importing for.
 */
export interface MarkdownEditorHandle {
  focus(): void;
}
