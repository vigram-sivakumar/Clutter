import { useRef, useState } from 'react';
import type { Application } from '@core/application/Application';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { createResourceLocationActions } from '@app/layouts/resourceLocationActions';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from '@core/presentation/buildBreadcrumbs';
import {
  getPageTitlePlaceholder,
  getFolderTitlePlaceholder,
} from '@core/presentation/PageDisplayPlaceholders';
import {
  buildTopBarActions,
  buildDraftTopBarActions,
} from '@app/layouts/page/topbar/buildTopBarActions';
import {
  getFolderArchiveConfirmation,
  getFolderDeleteConfirmation,
  PAGE_DELETE_CONFIRMATION_MESSAGE,
} from '@features/notes/helpers/folderActionConfirmation';
import { duplicateAndOpenPage } from '@features/notes/helpers/duplicateAndOpenPage';
import {
  buildMoveDestinationItems,
  buildResourceMoveDestinationItems,
} from '@features/notes/helpers/buildMoveDestinationItems';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { toResourcePageModel, toDraftPageModel } from '@app/layouts/page/toResourcePageModel';
import { toCollectionPageModel } from '@features/collection/page/toCollectionPageModel';
import {
  getSystemLocationPresentation,
  getSystemLocationForFolder,
} from '@core/presentation/systemPresentation';
import type { SystemLocationId } from '@core/presentation/systemPresentation';
import { Page } from '@app/layouts/page/Page';
import { createDateResolver } from '@app/layouts/page/resolveDate';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { createWikiLinkSuggester } from '@app/layouts/page/wikiLinkSuggestions';
import { createEmbedSuggester } from '@app/layouts/page/embedSuggestions';
import { createEmbedHeadingSuggester } from '@app/layouts/page/headingSuggestions';
import { createEmbedImageResolver } from '@app/layouts/page/resolveEmbedImage';
import { createEmbedPdfResolver } from '@app/layouts/page/resolveEmbedPdf';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { resolveResourceEmbed } from '@app/layouts/page/resolveResourceEmbed';
import { createImageSrcResolver } from '@app/layouts/page/resolveImageSrc';
import { createImageResourceResolver } from '@app/layouts/page/resolveImageResource';
import { createTagSuggester } from '@app/layouts/page/tagSuggestions';
import { downloadRemoteImage } from '@shared/helpers/downloadRemoteImage';
import {
  getCollectionPageTitleProps,
  createTagCollectionRenameHandler,
} from '@app/layouts/page/tagCollectionRename';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import {
  CollectionBody,
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  DEFAULT_COLLECTION_SORT,
  type CollectionViewMode,
  type CollectionPropertyVisibility,
  type CollectionSortState,
} from '@app/layouts/page/body/CollectionBody';
import { CollectionViewMenu } from '@app/layouts/page/body/CollectionViewMenu';
import { ArchiveCollectionBody } from '@app/layouts/page/body/ArchiveCollectionBody';
import { AssetsCollectionBody } from '@app/layouts/page/body/AssetsCollectionBody';
import {
  TasksCollectionBody,
  type TasksCollectionView,
} from '@features/tasks/page/TasksCollectionBody';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@features/markdown/editor/MarkdownEditor';
import { clearCachedEditorSession } from '@features/markdown/editor/codemirror/editorHistoryCache';

interface PageHostProps {
  application: Application;
  /**
   * Opens the shared resource overlay (owned by `AppLayout`) for a real
   * `VaultResource` — routes to `ImageOverlay` or `PdfOverlay` based on
   * `resource.kind`. `{ archived: true }` disables every resource-mutating
   * action (Archive/Move/Set-cover/Download), matching the Archive
   * collection's existing restriction.
   */
  readonly onOpenResource: (
    resource: VaultResource,
    options?: { readonly archived?: boolean }
  ) => void;
  /**
   * Opens the shared resource overlay for an image that doesn't necessarily
   * have a backing `VaultResource` — threaded down into `MarkdownEditor`,
   * whose own image-click handler already resolves an optional `resourceId`
   * itself and builds the full `ImageOverlayImage`.
   */
  readonly onOpenImageOverlay: (
    image: ImageOverlayImage,
    options?: { readonly onSetCoverImage?: () => void }
  ) => void;
}

const TASK_COLLECTION_VIEWS: ReadonlySet<string> = new Set<TasksCollectionView>([
  'tasks-today',
  'tasks-upcoming',
  'tasks-completed',
  'tasks-all',
  'tasks-unscheduled',
]);

/**
 * The note-open half of `MarkdownEditor`'s focus policy (the other half —
 * "a restorable cached session always wins" — lives entirely inside
 * `MarkdownEditor.tsx`'s own mount effect, since only it knows about the
 * session cache). Deliberately the *same* emptiness check `Page.tsx`'s own
 * `shouldAutoFocusTitle` applies to this identical `title` value, not a
 * competing rule: when there's no cached session to restore, an empty
 * title should stay the first editing target (title autofocuses, per
 * existing behavior, untouched here), and a non-empty title means the
 * user is opening an already-named note to keep editing its body, so the
 * editor should be ready to type into immediately. See
 * `docs/editor-architecture-decisions.md`'s "Focus restoration" entry.
 */
function focusEditorOnOpen(title: string): boolean {
  return title !== '';
}

/**
 * PageHost is the composition root for page rendering.
 *
 * It resolves the active navigation target, constructs the appropriate ViewModel,
 * and composes the shared Page shell with the appropriate body type.
 *
 * It intentionally contains no business logic or persistence logic.
 *
 * Page dispatch currently uses a switch statement but is expected to evolve into a registry
 * when multiple page types justify the abstraction.
 */
export function PageHost({ application, onOpenResource, onOpenImageOverlay }: PageHostProps) {
  const workspace = useWorkspace(application.workspace);
  const vault = application.vault;

  // Archive's onOpenResource dispatch — the resource-overlay state itself
  // is owned by AppLayout now; this just fixes the `archived` option so
  // every already-archived resource's overlay keeps the same restriction
  // it always had (Restore/Delete live on the row's own hover actions
  // instead — see PageHost/AppLayout's `openVaultResourceOverlay` doc
  // comment for the full reasoning).
  function openArchivedResourceOverlay(resource: VaultResource): void {
    onOpenResource(resource, { archived: true });
  }

  // One handle, reused across the draft/note/daily-note branches below —
  // only one of them ever renders per render, and each gets a fresh
  // instance anyway via the per-entity `key` on <Page>. Lets the title's
  // Enter (Page's bodyFocusRef) move focus into the editor without Page
  // needing to know what body actually is.
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Collection-view wiring: local render state only, not persisted
  // (persistence is a separate, deliberately deferred decision) — shared
  // across every collection-shaped branch below (Folder, Archive,
  // Workspace/Favorites/Tag) since only one ever renders per PageHost
  // render, the same one-instance reasoning editorRef above already
  // relies on. Lives beside the page title (Page's titleActions prop),
  // not the top bar — see CollectionViewMenu's own doc comment.
  const [collectionViewMode, setCollectionViewMode] = useState<CollectionViewMode>('table');
  // Same local, unpersisted, shared-across-collection-branches reasoning
  // as collectionViewMode above — the Properties section's checkbox state.
  const [collectionProperties, setCollectionProperties] = useState<CollectionPropertyVisibility>(
    DEFAULT_COLLECTION_PROPERTY_VISIBILITY
  );
  // Same local, unpersisted, shared-across-collection-branches reasoning
  // as collectionViewMode above — the Configure menu's "Sort by" section.
  const [collectionSort, setCollectionSort] = useState<CollectionSortState>(
    DEFAULT_COLLECTION_SORT
  );
  const collectionViewMenu = (
    <CollectionViewMenu
      viewMode={collectionViewMode}
      onChange={setCollectionViewMode}
      properties={collectionProperties}
      onPropertiesChange={setCollectionProperties}
      sort={collectionSort}
      onSortChange={setCollectionSort}
    />
  );

  // Composed once per render from the currently-attached Vault/PageOperations
  // — cheap, stateless glue (resolveWikiLink.ts), not worth memoizing.
  const resolveWikiLink = createWikiLinkResolver(
    vault,
    application.pageOperations,
    application.folderOperations,
    application.effectivePageState
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getWikiLinkSuggestions = createWikiLinkSuggester(
    vault,
    application.pageOperations,
    application.folderOperations
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  // Resource embed autocomplete only, this milestone — no resolver for a
  // renderer to call yet (resolveResourceEmbed.ts exists but isn't wired
  // through as an injected prop until a rendering milestone needs it).
  const getEmbedSuggestions = createEmbedSuggester(vault, application.membershipSelector);
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // ADR-032's heading-suggestion counterpart, scoped to whichever page the
  // in-progress ![[Page# target already names.
  const getEmbedHeadingSuggestions = createEmbedHeadingSuggester(vault, application.effectivePageState);
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // this milestone's rendering counterpart to getEmbedSuggestions.
  const resolveEmbedImage = createEmbedImageResolver(vault, (path) =>
    application.resolveResourceImageUrl(path)
  );
  // Same per-render, stateless-glue composition as resolveEmbedImage above —
  // the PDF-embed counterpart (Stage 2). embedLivePreview.ts only ever
  // consults this after resolveEmbedImage says a target is a real
  // VaultResource that isn't an image.
  const resolveEmbedPdf = createEmbedPdfResolver(vault, (path) =>
    application.resolveResourceImageUrl(path)
  );
  // The inline PDF embed's "Open" control (PdfEmbedWidget.ts) — re-resolves
  // the embed's own vault-relative path through the exact same
  // resolveResourceEmbed() lookup every other embed composer here already
  // uses, then reuses the shared onOpenResource opener (AppLayout) rather
  // than a second PdfOverlay-opening implementation.
  const onPdfEmbedClick = (path: string): void => {
    const resource = resolveResourceEmbed(vault, path);
    if (resource) {
      onOpenResource(resource);
    }
  };
  // Same per-render, stateless-glue composition as resolveEmbedImage above
  // — the note-embed counterpart, unchanged since ADR-032/Milestones 3-5
  // (see resolvePageEmbed.ts's own doc comment): reads through
  // EffectivePageState, never a second draft-vs-committed resolution.
  const resolvePageEmbed = createPageEmbedResolver(vault, application.effectivePageState);
  // A note embed's own "open source note" action — the exact same
  // one-line pageOperations.open(id) pattern resolveWikiLink.ts's own
  // activate() already establishes, never a second implementation.
  const onOpenPage = (pageId: string): void => {
    void application.pageOperations.open(pageId);
  };
  // Same per-render, stateless-glue composition as resolveEmbedImage above —
  // the standard-Markdown-image counterpart: `![alt](Assets/image.jpg)`'s
  // own local-path resolution, sharing the exact same resolveResourceEmbed()
  // lookup, never a second one.
  const resolveImageSrc = createImageSrcResolver(vault, (path) =>
    application.resolveResourceImageUrl(path)
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // MarkdownEditor.tsx's own ImageOverlay More Actions gate: whether a
  // clicked image resolves to a local VaultResource at all.
  const resolveImageResource = createImageResourceResolver(vault);
  // ImageOverlay's own More Actions dispatch (MarkdownEditor.tsx) — the
  // exact same operations/helpers Sidebar.Notes.tsx's own resource row menu
  // already dispatches through (ResourceOperations.archiveResource/
  // moveResource, revealInFinder, getLocationPathRepresentations +
  // copyTextToClipboard), composed fresh here as a second entry point into
  // them, never a second implementation. Read-only location actions
  // (reveal/copy path/download) go straight to `vault`, same as every other
  // location-action call site — they never touch ResourceOperations/the
  // Gate, which own writes, not this. Shared with AppLayout's identical
  // overlay wiring via resourceLocationActions.ts, rather than a second
  // inline copy of the same three functions.
  const { revealResourceInFinder, copyResourcePath, downloadResourceById } =
    createResourceLocationActions(vault);
  // MarkdownEditor's inline image options menu — Download, for both a
  // local Resource embed/image (resolves via the same resolveImageResource
  // boundary onImageClickRef already uses) and a genuinely external URL
  // image (no local VaultResource at all): the former reuses
  // downloadResourceById above, the latter falls back to a fetch-based
  // save (downloadRemoteImage.ts) — this editor-facing handler is the one
  // place that decision is made, never the editor itself.
  function downloadImageFromEditor(url: string): void {
    const resolved = resolveImageResource(url);
    if (resolved) {
      downloadResourceById(resolved.resourceId);
      return;
    }
    void downloadRemoteImage(url);
  }
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveTag = createTagResolver(application.navigation, vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getTagSuggestions = createTagSuggester(vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveDate = createDateResolver(vault, application.pageOperations);

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;
  const page = useActivePage(vault, activePageId);

  const rawSession = activePageId
    ? application.pageOperations.getSession(activePageId)
    : undefined;

  // React observes DocumentSession changes through this hook.
  // The session remains the single source of editable document state.
  const session = useDocumentSession(rawSession);

  const onOpenFolder = (id: string) => application.folderOperations.open(id);
  // Committed-stage only (autosave-execution-model.md §3.1) — no Gate call,
  // no persistence. Durable-stage persistence is a separate, payload-free
  // request (onRequestSave below), fired on blur.
  const onUpdateMarkdown = (pageId: string, markdown: string): void => {
    application.pageOperations.commitEdit(pageId, markdown);
  };
  const onRequestSave = (pageId: string): void => {
    void application.pageOperations.requestSave(pageId);
  };

  const onUpdateDescription = (pageId: string, description: string): void => {
    void application.pageOperations.updateMetadata(pageId, { description });
  };

  const onArchive = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.archive(activePageId);
  };

  const onRestore = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.restore(activePageId);
  };

  const onDelete = (): void => {
    if (!activePageId) {
      return;
    }

    // Deletion is the one truly non-reversible page action — unlike
    // archive/restore below (which deliberately do NOT clear this),
    // a deleted page's cached editing session (editorHistoryCache.ts)
    // can never legitimately be returned to, so it's cleared eagerly
    // here rather than left to decay as an inert, never-looked-up-again
    // entry. Best-effort: if this page's MarkdownEditor is still mounted
    // and unmounts after this call (the common outcome of a delete,
    // since navigation typically moves away from the deleted page), its
    // own cleanup will write the entry back — a known, accepted race
    // (see clearCachedEditorSession's own doc comment) that can only
    // ever make this a no-op, never cause incorrect behavior.
    clearCachedEditorSession(activePageId);
    // ADR-033: same rationale as clearCachedEditorSession above, applied
    // to the durable fold-state store instead of the session cache.
    application.foldStateStore.clear(activePageId);
    void application.pageOperations.delete(activePageId);
  };

  const onDuplicate = (): void => {
    if (!activePageId) {
      return;
    }

    void duplicateAndOpenPage(application.pageOperations, activePageId);
  };

  const onToggleFavorite = (): void => {
    if (!activePageId || !page) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      favorite: !page.metadata.favorite,
    });
  };

  // Shared by both the persisted-page and draft render branches below —
  // PageOperations.updateMetadata() already handles both cases itself
  // (a draft's committed cover patch promotes it via the same persistDraft
  // helper title/body commits already use), so there is no separate
  // draft-specific persistence path to wire here.
  const onSetCoverImage = (url: string): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { cover: url });
  };

  const onSetCoverImageFromUpload = (sourcePath: string): void => {
    if (!activePageId) {
      return;
    }

    void (async () => {
      const relativePath = await application.importCoverAsset(sourcePath);
      await application.pageOperations.updateMetadata(activePageId, {
        cover: relativePath,
      });
    })();
  };

  const onRemoveCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    // coverHidden resets alongside cover, not just cover alone — without
    // this, hiding a cover and then removing it would leave a stale
    // coverHidden: true in frontmatter that silently carries over to
    // whatever cover image gets set next, mounting it already-hidden
    // for no reason visible in the UI that set it.
    void application.pageOperations.updateMetadata(activePageId, {
      cover: null,
      coverHidden: false,
    });
  };

  // Same shared-across-draft-and-persisted reasoning as onSetCoverImage
  // above — the page header's More-actions "Emoji" entry point (unset)
  // and the emoji button's own ChangeIconPicker (already set) both funnel
  // here, exactly one write path either way.
  const onSelectEmoji = (emoji: string): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { icon: emoji });
  };

  const onRemoveEmoji = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { icon: null });
  };

  // Distinct from onRemoveCoverImage: leaves `cover` untouched, only sets
  // coverHidden — see PageCover.tsx's own onHide doc comment for why this
  // needs no further sequencing beyond persisting the flag.
  const onHideCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { coverHidden: true });
  };

  // The reveal counterpart to onHideCoverImage above — same coverHidden-only
  // patch, flipped back to false. Reached from the More-actions "Show cover
  // image" item (PageHeaderMoreActionsMenu), never the picker: it must not
  // touch `cover` itself.
  const onShowCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { coverHidden: false });
  };

  const onMoveNote = (destinationFolderId: string | null): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.move(activePageId, destinationFolderId);
  };

  const onMoveFolder = (folderId: string, destinationFolderId: string | null): void => {
    void application.folderOperations.move(folderId, destinationFolderId);
  };

  // Both a persisted Note's title and a folder's name use the same
  // continuous-commit/debounced-autosave channel model (SaveCoordinator's
  // channel primitives + a FieldEditState<string>), not a single
  // blur-triggered rename() call — folder rename() itself still does the
  // actual persisting underneath; this only changes how often it's called
  // and adds Escape-cancel support (onCancel reverts the pending value).
  const onEditPageTitle = (pageId: string, title: string): void => {
    application.pageOperations.commitTitle(pageId, title);
  };
  const onFlushPageTitle = (pageId: string): void => {
    void application.pageOperations.requestTitleSave(pageId);
  };
  const onCancelPageTitle = (pageId: string): void => {
    application.pageOperations.cancelTitleEdit(pageId);
  };

  const onEditFolderName = (folderId: string, name: string): void => {
    application.folderOperations.commitName(folderId, name);
  };
  const onFlushFolderName = (folderId: string): void => {
    void application.folderOperations.requestNameSave(folderId);
  };
  const onCancelFolderName = (folderId: string): void => {
    application.folderOperations.cancelNameEdit(folderId);
  };

  if (activeFolderId) {
    const folder = vault.getFolder(activeFolderId);

    if (!folder) {
      throw new Error(`Folder not found: ${activeFolderId}`);
    }

    const model = toCollectionPageModel(
      folder,
      vault,
      application.query,
      application.effectivePageState,
      application.membershipSelector,
      workspace,
      {
        onOpenFolder,
        onOpenNote: (id: string) => application.pageOperations.open(id),
        onOpenDraftNote: (id: string) => application.workspace.openPage(id),
      }
    );

    const breadcrumbs = buildBreadcrumbs(folder, vault, application.membershipSelector, onOpenFolder);
    // Confirmation copy is computed here (one predicate, shared with the
    // sidebar's identical computation in Sidebar.Notes.tsx) and handed to
    // ResourceTopBarActions as a message — that component owns showing the
    // Confirmation surface and gating dispatch on it, so onArchive/onDelete
    // below are plain, unconditional calls straight to the domain
    // operation; navigation after a successful archive/delete is owned by
    // FolderOperations itself (ADR-025's fallback-page pattern), not by
    // this component.
    const archiveConfirmation = getFolderArchiveConfirmation(vault, folder.id);
    const deleteConfirmation = getFolderDeleteConfirmation(vault, folder.id);
    // Named (not inlined into buildTopBarActions' options below) so
    // PageCover's own "Remove" menu action can call the exact same
    // removal, not a second copy of it — see the Note/DailyNote branch's
    // top-level onRemoveCoverImage for the equivalent page-level case.
    // coverHidden resets alongside cover — see the Note/DailyNote
    // branch's onRemoveCoverImage for why.
    const onRemoveFolderCoverImage = (): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        cover: null,
        coverHidden: false,
      });
    // Folder-scoped counterpart to the Note/DailyNote branch's
    // onHideCoverImage above — same coverHidden-only patch, leaving
    // `cover` untouched.
    const onHideFolderCoverImage = (): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        coverHidden: true,
      });
    // Folder-scoped counterpart to the Note/DailyNote branch's
    // onShowCoverImage above — reveals the existing cover without touching
    // `cover`.
    const onShowFolderCoverImage = (): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        coverHidden: false,
      });
    // Named for the same reason onRemoveFolderCoverImage above is — the
    // More-actions "Cover image" picker (PageHeaderMoreActionsMenu, via
    // <Page>) needs the exact same set/upload calls buildTopBarActions'
    // own cover-image menu item already uses, not a second copy.
    const onSetFolderCoverImage = (url: string): void =>
      void application.folderOperations.updateMetadata(folder.id, { cover: url });
    const onSetFolderCoverImageFromUpload = (sourcePath: string): void => {
      void (async () => {
        const relativePath = await application.importCoverAsset(sourcePath);
        await application.folderOperations.updateMetadata(folder.id, {
          cover: relativePath,
        });
      })();
    };
    // The More-actions "Emoji" entry point's persistence — same
    // FolderOperations.updateMetadata write path sidebar Folder.tsx's own
    // ChangeIconPicker already uses (icon: null clears it, same as
    // cover's own null-to-clear convention above).
    const onSelectFolderEmoji = (emoji: string): void =>
      void application.folderOperations.updateMetadata(folder.id, { icon: emoji });
    const onRemoveFolderEmoji = (): void =>
      void application.folderOperations.updateMetadata(folder.id, { icon: null });

    const topBar = buildTopBarActions(folder, {
      membershipSelector: application.membershipSelector,
      vaultRoot: vault.root,
      onArchive: () => void application.folderOperations.archive(folder.id),
      onRestore: () => void application.folderOperations.restore(folder.id),
      onDelete: () => void application.folderOperations.delete(folder.id),
      onToggleFavorite: () =>
        void application.folderOperations.updateMetadata(folder.id, {
          favorite: !folder.metadata.favorite,
        }),
      archiveConfirmationMessage: archiveConfirmation.hasDescendants
        ? archiveConfirmation.message
        : undefined,
      // Unlike Archive above, Delete always confirms — a delete is only
      // ever reachable here for an archived/Archive-descendant folder
      // (buildTopBarActions.tsx's isDeletable), and the product decision is
      // to require confirmation for every such delete regardless of
      // whether the folder is empty (see getFolderDeleteConfirmation's own
      // doc comment).
      deleteConfirmationMessage: deleteConfirmation.message,
      // A reserved folder never reaches this branch's menu (buildFolderTopBarMenu
      // only renders for an ordinary folder — see topBar's own dispatch), so
      // excluding `folder.id` (and its descendants, via
      // buildMoveDestinationItems' own walk) is always excluding a real,
      // movable folder here, never a reserved one.
      moveDestinations: buildMoveDestinationItems(application.membershipSelector, vault.root, folder.id),
      onMove: (destinationFolderId) => onMoveFolder(folder.id, destinationFolderId),
      onCreateFolder: (name) => application.folderOperations.create(name, null),
    });
    // A reserved folder (Archive, Inbox, Templates, Daily Notes) can't be
    // renamed or deleted — buildTopBarActions already dispatches it to
    // ReservedFolderTopBarActions (no delete button) via
    // MembershipSelector.isSystemFolder, but title-editability has no
    // equivalent automatic gate, so it's checked here explicitly.
    const isRenameable = !application.membershipSelector.isSystemFolder(folder);
    // The Archive folder gets a resource-aware body (ArchiveCollectionBody)
    // instead of the plain folder/note-shaped CollectionBody — see that
    // component's own doc comment for why this isn't a CollectionPageModel
    // extension. Every other folder (including every other reserved one)
    // keeps the exact same CollectionBody rendering as before.
    const folderSystemLocationId = getSystemLocationForFolder(
      folder,
      application.membershipSelector
    );
    const isArchiveView = folderSystemLocationId === 'archive';
    // Page-header-controls configuration (final UX rules): a reserved
    // folder (Archive, Inbox, Templates, Daily Notes) is system-reserved —
    // its fixed icon always shows, never an editable emoji, never More
    // actions. An ordinary folder is user-owned — its own metadata.icon
    // (if set) always shows, and More actions is hover-revealed. Daily
    // Notes' `collectionIcon` (not `icon`) applies here specifically
    // because this page represents the whole collection of daily notes,
    // not one specific day — see SystemLocationPresentation's own doc
    // comment on that field.
    const folderSystemIcon = folderSystemLocationId
      ? (getSystemLocationPresentation(folderSystemLocationId).collectionIcon ??
        getSystemLocationPresentation(folderSystemLocationId).icon)
      : undefined;

    return (
      <>
        <Page
          canNavigateBack={workspace.canNavigateBack}
          canNavigateForward={workspace.canNavigateForward}
          onNavigateBack={() => application.navigation.back()}
          onNavigateForward={() => application.navigation.forward()}
          title={model.title}
          description={model.description}
          titleEditable={isRenameable}
          titlePlaceholder={getFolderTitlePlaceholder()}
          onTitleEdit={isRenameable ? (name) => onEditFolderName(folder.id, name) : undefined}
          onTitleFlush={isRenameable ? () => onFlushFolderName(folder.id) : undefined}
          onTitleCancel={isRenameable ? () => onCancelFolderName(folder.id) : undefined}
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          titleActions={collectionViewMenu}
          emoji={folderSystemLocationId ? undefined : (folder.metadata.icon ?? undefined)}
          icon={folderSystemIcon}
          showMoreActions={!folderSystemLocationId}
          onSelectEmoji={folderSystemLocationId ? undefined : onSelectFolderEmoji}
          onRemoveEmoji={folderSystemLocationId ? undefined : onRemoveFolderEmoji}
          onSetCoverImage={folderSystemLocationId ? undefined : onSetFolderCoverImage}
          onSetCoverImageFromUpload={
            folderSystemLocationId ? undefined : onSetFolderCoverImageFromUpload
          }
          coverImage={
            application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
          }
          onRemoveCoverImage={onRemoveFolderCoverImage}
          coverHidden={model.coverHidden}
          onHideCoverImage={onHideFolderCoverImage}
          onShowCoverImage={onShowFolderCoverImage}
          coverKey={folder.id}
          body={
            isArchiveView ? (
              <ArchiveCollectionBody
                vault={vault}
                folders={model.folders}
                notes={model.notes}
                viewMode={collectionViewMode}
                properties={collectionProperties}
                sort={collectionSort}
                resources={application.membershipSelector.getArchivedResources()}
                onOpenResource={openArchivedResourceOverlay}
                onRestoreResource={(id) =>
                  void application.resourceOperations.restoreResource(id)
                }
                onDeleteResource={(id) =>
                  void application.resourceOperations.deleteResource(id)
                }
                onRestoreFolder={(id) => void application.folderOperations.restore(id)}
                onDeleteFolder={(id) => void application.folderOperations.delete(id)}
                onRestoreNote={(id) => void application.pageOperations.restore(id)}
                onDeleteNote={(id) => void application.pageOperations.delete(id)}
              />
            ) : (
              <CollectionBody
                folders={model.folders}
                notes={model.notes}
                viewMode={collectionViewMode}
                properties={collectionProperties}
                sort={collectionSort}
              />
            )
          }
        />
      </>
    );
  }

  // The Assets collection is a filtered view too, but
  // CollectionPageModel/CollectionBody are folder+note shaped — no room for
  // `kind` (image vs. pdf) — so this dispatches to AssetsCollectionBody
  // instead, before the generic filtered-view branch below, same reasoning
  // as the task-views branch that follows it.
  if (
    workspace.activeView?.type === 'filtered-view' &&
    workspace.activeView.view.kind === 'assets'
  ) {
    const resources = application.membershipSelector.getAllVisibleResources();

    return (
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation('assets').label}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={[]} />}
        icon={getSystemLocationPresentation('assets').icon}
        showMoreActions={false}
        body={
          <AssetsCollectionBody
            resources={resources}
            onOpenResource={onOpenResource}
            onRenameResource={(id, name) =>
              void application.resourceOperations.renameResource(id, name)
            }
            onArchiveResource={(id) =>
              void application.resourceOperations.archiveResource(id)
            }
            onDownloadResource={downloadResourceById}
            resourceMoveDestinations={buildResourceMoveDestinationItems(
              application.membershipSelector,
              application.query
            )}
            onMoveResource={(id, destinationFolderId) =>
              void application.resourceOperations.moveResource(id, destinationFolderId)
            }
            onCreateFolder={(name) => application.folderOperations.create(name, null)}
          />
        }
      />
    );
  }

  // The task collection views are filtered views too, but
  // CollectionPageModel/CollectionBody are folder+note shaped — no room
  // for completed/dueDate — so this dispatches to TasksCollectionBody
  // instead of toCollectionPageModel, before the generic filtered-view
  // branch below (which stays exactly as ADR-022 left it for Workspace/
  // Favorites).
  if (
    workspace.activeView?.type === 'filtered-view' &&
    TASK_COLLECTION_VIEWS.has(workspace.activeView.view.kind)
  ) {
    const view = workspace.activeView.view.kind as TasksCollectionView;

    return (
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation(view).label}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={[]} />}
        icon={getSystemLocationPresentation(view).icon}
        showMoreActions={false}
        body={
          <TasksCollectionBody
            view={view}
            tasks={[...vault.tasks()]}
            workspace={workspace}
            onToggleComplete={(task) => void application.taskOperations.toggleComplete(task)}
            onOpenTask={(task) => void application.pageOperations.open(task.sourcePageId)}
            onOpenCompleted={() => application.navigation.openTasksCompleted()}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
          />
        }
      />
    );
  }

  // A filtered view (ADR-022) — Workspace-root or Favorites — has no
  // backing Folder/breadcrumb trail or per-resource top-bar actions
  // (archive/restore/delete don't apply to a view), so this branch is
  // deliberately smaller than the folder branch above, not a stripped-down
  // copy of it.
  if (workspace.activeView?.type === 'filtered-view') {
    const view = workspace.activeView.view;

    const model = toCollectionPageModel(
      { view },
      vault,
      application.query,
      application.effectivePageState,
      application.membershipSelector,
      workspace,
      {
        onOpenFolder,
        onOpenNote: (id: string) => application.pageOperations.open(id),
        onOpenDraftNote: (id: string) => application.workspace.openPage(id),
      }
    );

    // Tag is the one filtered view that's renameable — reuses the exact
    // same inline title-edit mechanism (PageTitle/EditableText,
    // titleEditable + onTitleCommit) Folder rename already established,
    // not a topbar menu item (no existing precedent for that shape here).
    // Workspace-root/Favorites remain non-editable, unchanged.
    const titleProps = getCollectionPageTitleProps(view, model.title);
    const onTitleCommit =
      view.kind === 'tag'
        ? createTagCollectionRenameHandler(
            application.tagOperations,
            application.navigation,
            view.tagName
          )
        : undefined;
    // Page-header-controls configuration: every filtered view that reaches
    // this branch (Workspace, Favorites, and an individual tag's notes) is
    // system-reserved for header-presentation purposes — a fixed icon
    // always shows, never an emoji control, never More actions. This is
    // deliberately true for Tags too even though a Tag entity can carry
    // its own icon (Tag.icon) and its title is renameable (onTitleCommit
    // above, unaffected by this) — the header always shows the generic
    // Tags icon, not a per-tag one. `view.kind` 'tag' maps to the
    // SystemLocationId 'tags' (singular vs. plural — the filtered-view
    // payload's own kind name vs. the presentation table's key).
    const filteredViewSystemLocationId: SystemLocationId =
      view.kind === 'tag' ? 'tags' : view.kind;

    return (
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={titleProps.title}
        description={model.description}
        titleEditable={titleProps.titleEditable}
        onTitleCommit={onTitleCommit}
        breadcrumbs={<Breadcrumbs items={[]} />}
        titleActions={collectionViewMenu}
        icon={getSystemLocationPresentation(filteredViewSystemLocationId).icon}
        showMoreActions={false}
        body={
          <CollectionBody
            folders={model.folders}
            notes={model.notes}
            viewMode={collectionViewMode}
            properties={collectionProperties}
            sort={collectionSort}
          />
        }
      />
    );
  }

  if (!session || !activePageId) {
    return null;
  }

  // Structural presentation (path, parent, breadcrumbs, metadata) must read
  // from the Vault — the live source of truth after moves and archive/restore.
  // DocumentSession owns only the editor buffer and save lifecycle.
  if (!page) {
    // ADR-017: a session with no backing Vault page is an unpersisted
    // draft, not an error, as long as PageOperations still has a
    // descriptor for it (getDraft). Anything else missing from both is
    // the pre-existing "dangling id" error, unchanged.
    const draft = application.pageOperations.getDraft(activePageId);

    if (!draft) {
      throw new Error(`Page not found: ${activePageId}`);
    }

    const draftBreadcrumbs = buildBreadcrumbsForDraft(
      activePageId,
      draft.folderId,
      draft.title ?? getPageTitlePlaceholder(draft.type),
      draft.type,
      vault,
      application.membershipSelector,
      onOpenFolder
    );
    const model = toDraftPageModel(
      activePageId,
      draft.type,
      draft.title,
      session,
      onUpdateMarkdown,
      onRequestSave
    );
    const draftTopBar = buildDraftTopBarActions(draft.type);

    return (
      <Page
        titleKey={activePageId}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={model.title}
        description={model.description}
        titleEditable
        titlePlaceholder={getPageTitlePlaceholder(draft.type)}
        breadcrumbs={<Breadcrumbs items={draftBreadcrumbs} />}
        // Same page chrome as a persisted page (ADR-017 Decision item 9) —
        // archive/restore/delete render disabled, not omitted, since they
        // don't apply until this draft is actually persisted.
        actions={draftTopBar.actions}
        // Same user-owned-vs-Daily-Note gating as the persisted branch
        // below (page.type === 'note' there, draft.type === 'note' here)
        // — a fresh Daily Note draft never offers an emoji control either.
        onSelectEmoji={draft.type === 'note' ? onSelectEmoji : undefined}
        onRemoveEmoji={draft.type === 'note' ? onRemoveEmoji : undefined}
        onSetCoverImage={onSetCoverImage}
        onSetCoverImageFromUpload={onSetCoverImageFromUpload}
        onRemoveCoverImage={onRemoveCoverImage}
        coverKey={activePageId}
        bodyFocusRef={editorRef}
        onTitleCommit={(title) =>
          void application.pageOperations.updateDraftTitle(activePageId, title)
        }
        body={
          <MarkdownBody>
            <MarkdownEditor
              key={activePageId}
              pageId={activePageId}
              ref={editorRef}
              markdown={model.markdown}
              focusOnOpen={focusEditorOnOpen(model.title)}
              foldStateStore={application.foldStateStore}
              onEdit={(markdown) => model.updateMarkdown(markdown)}
              onFlush={() => model.requestSave()}
              resolveWikiLink={resolveWikiLink}
              getWikiLinkSuggestions={getWikiLinkSuggestions}
              getEmbedSuggestions={getEmbedSuggestions}
              getEmbedHeadingSuggestions={getEmbedHeadingSuggestions}
              resolveEmbedImage={resolveEmbedImage}
              resolveEmbedPdf={resolveEmbedPdf}
              onPdfEmbedClick={onPdfEmbedClick}
              resolvePageEmbed={resolvePageEmbed}
              onOpenPage={onOpenPage}
              resolveImageSrc={resolveImageSrc}
              resolveTag={resolveTag}
              getTagSuggestions={getTagSuggestions}
              resolveDate={resolveDate}
              onOpenImageOverlay={onOpenImageOverlay}
              onSetCoverImage={onSetCoverImage}
              onDownloadImage={downloadImageFromEditor}
              onDownloadPdfResource={downloadResourceById}
              resolveImageResource={resolveImageResource}
              onArchiveResource={(id) =>
                void application.resourceOperations.archiveResource(id)
              }
              onRevealResourceInFinder={revealResourceInFinder}
              onCopyResourcePath={copyResourcePath}
              resourceMoveDestinations={buildResourceMoveDestinationItems(
                application.membershipSelector,
                application.query
              )}
              onMoveResource={(id, destinationFolderId) =>
                void application.resourceOperations.moveResource(id, destinationFolderId)
              }
              onCreateFolder={(name) => application.folderOperations.create(name, null)}
            />
          </MarkdownBody>
        }
      />
    );
  }

  const breadcrumbs = buildBreadcrumbs(page, vault, application.membershipSelector, onOpenFolder);

  // Note and Daily Note render identically today (both markdown-editable,
  // both resolve through toResourcePageModel/buildTopBarActions) — this
  // guard exists because page.type is user-editable frontmatter, not a
  // TypeScript-enforced value, so a malformed/unexpected type on disk must
  // fail loudly rather than silently render as one of the two known types.
  // Reintroduce a per-type branch here (or a registry) if a future page
  // type actually needs different rendering.
  if (page.type !== 'note' && page.type !== 'daily-note') {
    throw new Error(`Unsupported page type: ${page.type}`);
  }

  const model = toResourcePageModel(
    page,
    session,
    onUpdateMarkdown,
    onRequestSave,
    onUpdateDescription
  );
  // Move applies only to Notes and Folders (approved contract) — a Daily
  // Note's menu never includes a `move-to` item (dailyNoteTopBarMenu.config.ts),
  // so moveDestinations/onMove are only ever computed and passed for a
  // real Note, never for a Daily Note.
  const topBar = buildTopBarActions(page, {
    membershipSelector: application.membershipSelector,
    vaultRoot: vault.root,
    onArchive,
    onRestore,
    onDelete,
    onDuplicate,
    onToggleFavorite,
    // A note/daily-note delete is only ever reachable here for an
    // archived/Archive-descendant page (buildTopBarActions.tsx's
    // isDeletable) — every such delete now requires confirmation, so this
    // is always passed rather than gated (see PAGE_DELETE_CONFIRMATION_MESSAGE's
    // own doc comment).
    deleteConfirmationMessage: PAGE_DELETE_CONFIRMATION_MESSAGE,
    moveDestinations:
      page.type === 'note'
        ? buildMoveDestinationItems(application.membershipSelector, vault.root)
        : undefined,
    onMove: page.type === 'note' ? onMoveNote : undefined,
    onCreateFolder:
      page.type === 'note'
        ? (name) => application.folderOperations.create(name, null)
        : undefined,
  });
  // A Daily Note's title is derived from its date and is its permanent
  // calendar identity (toResourcePageModel's own title comment) — renaming
  // it would desynchronize its filename from the deterministic path
  // DailyNoteService/Application.openFallbackPage resolve by date, so it
  // stays view-only here the same way a reserved folder's title does
  // (isRenameable above). Notes have no such constraint.
  const isRenameable = page.type !== 'daily-note';

  return (
    <Page
      titleKey={activePageId}
      canNavigateBack={workspace.canNavigateBack}
      canNavigateForward={workspace.canNavigateForward}
      onNavigateBack={() => application.navigation.back()}
      onNavigateForward={() => application.navigation.forward()}
      title={model.title}
      description={model.description}
      titleEditable={isRenameable}
      onTitleEdit={isRenameable ? (title) => onEditPageTitle(page.id, title) : undefined}
      onTitleFlush={isRenameable ? () => onFlushPageTitle(page.id) : undefined}
      onTitleCancel={isRenameable ? () => onCancelPageTitle(page.id) : undefined}
      breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
      actions={topBar.actions}
      // Page-header-controls configuration: a Note is user-owned (its
      // metadata.icon, when set, always shows; More actions is
      // hover-revealed). A Daily Note shows neither emoji nor icon — its
      // title is already its calendar identity — but keeps More actions
      // on hover, same as a Note (isRenameable above draws the same
      // note-vs-daily-note line for the title's own editability).
      emoji={page.type === 'note' ? (page.metadata.icon ?? undefined) : undefined}
      onSelectEmoji={page.type === 'note' ? onSelectEmoji : undefined}
      onRemoveEmoji={page.type === 'note' ? onRemoveEmoji : undefined}
      onSetCoverImage={onSetCoverImage}
      onSetCoverImageFromUpload={onSetCoverImageFromUpload}
      coverImage={
        application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
      }
      onRemoveCoverImage={onRemoveCoverImage}
      coverHidden={model.coverHidden}
      onHideCoverImage={onHideCoverImage}
      onShowCoverImage={onShowCoverImage}
      coverKey={activePageId}
      bodyFocusRef={editorRef}
      body={
        <MarkdownBody>
          <MarkdownEditor
            key={activePageId}
            pageId={activePageId}
            ref={editorRef}
            markdown={model.markdown}
            focusOnOpen={focusEditorOnOpen(model.title)}
            foldStateStore={application.foldStateStore}
            onEdit={(markdown) => model.updateMarkdown(markdown)}
            onFlush={() => model.requestSave()}
            resolveWikiLink={resolveWikiLink}
            getWikiLinkSuggestions={getWikiLinkSuggestions}
            getEmbedSuggestions={getEmbedSuggestions}
            getEmbedHeadingSuggestions={getEmbedHeadingSuggestions}
            resolveEmbedImage={resolveEmbedImage}
            resolveEmbedPdf={resolveEmbedPdf}
            onPdfEmbedClick={onPdfEmbedClick}
            resolvePageEmbed={resolvePageEmbed}
            onOpenPage={onOpenPage}
            resolveImageSrc={resolveImageSrc}
            resolveTag={resolveTag}
            getTagSuggestions={getTagSuggestions}
            resolveDate={resolveDate}
            onOpenImageOverlay={onOpenImageOverlay}
            onSetCoverImage={onSetCoverImage}
            onDownloadImage={downloadImageFromEditor}
            onDownloadPdfResource={downloadResourceById}
            resolveImageResource={resolveImageResource}
            onArchiveResource={(id) =>
              void application.resourceOperations.archiveResource(id)
            }
            onRevealResourceInFinder={revealResourceInFinder}
            onCopyResourcePath={copyResourcePath}
            resourceMoveDestinations={buildResourceMoveDestinationItems(
              application.membershipSelector,
              application.query
            )}
            onMoveResource={(id, destinationFolderId) =>
              void application.resourceOperations.moveResource(id, destinationFolderId)
            }
            onCreateFolder={(name) => application.folderOperations.create(name, null)}
          />
        </MarkdownBody>
      }
    />
  );
}
