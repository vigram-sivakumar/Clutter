import { useRef, useState } from 'react';
import type { Application } from '@core/application/Application';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { createResourceLocationActions } from '@app/layouts/resourceLocationActions';
import { getTagOccurrenceRanges } from '@core/presentation/getTagOccurrenceRanges';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import {
  buildBreadcrumbs,
  buildBreadcrumbsForDraft,
} from '@core/presentation/buildBreadcrumbs';
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
import { createNoteForTag } from '@features/tags/helpers/createNoteForTag';
import { createAndOpenFolder } from '@features/notes/helpers/createAndOpenFolder';
import {
  buildMoveDestinationItems,
  buildResourceMoveDestinationItems,
} from '@features/notes/helpers/buildMoveDestinationItems';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import {
  toResourcePageModel,
  toDraftPageModel,
} from '@app/layouts/page/toResourcePageModel';
import { toCollectionPageModel } from '@features/collection/page/toCollectionPageModel';
import {
  getSystemLocationPresentation,
  getSystemLocationForFolder,
} from '@core/presentation/systemPresentation';
import type { SystemLocationId } from '@core/presentation/systemPresentation';
import { Page } from '@app/layouts/page/Page';
import { createDateResolver } from '@app/layouts/page/resolveDate';
import { DailyNoteNavControls } from '@features/daily-notes/controls/DailyNoteNavControls';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { createWikiLinkSuggester } from '@app/layouts/page/wikiLinkSuggestions';
import { createEmbedSuggester } from '@app/layouts/page/embedSuggestions';
import { createEmbedHeadingSuggester } from '@app/layouts/page/headingSuggestions';
import { createEmbedImageResolver } from '@app/layouts/page/resolveEmbedImage';
import { createEmbedPdfResolver } from '@app/layouts/page/resolveEmbedPdf';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { resolveResourceEmbed } from '@app/layouts/page/resolveResourceEmbed';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { supportedResourceFileExtensions } from '@core/vault/ingest/SupportedResourceKind';
import { createImageSrcResolver } from '@app/layouts/page/resolveImageSrc';
import { createImageResourceResolver } from '@app/layouts/page/resolveImageResource';
import { createTagSuggester } from '@app/layouts/page/tagSuggestions';
import { AddPropertyRow } from './AddPropertyRow';
import { getAddableSystemProperties } from './addableProperties';
import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';
import { emptyCustomProperty } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { Dialog } from '@components/dialog/Dialog';
import type { PropertiesControl } from './header/propertiesControl';
import { derivePropertiesSectionState } from './propertiesSectionState';
import { createAliasSuggester } from '@app/layouts/page/aliasSuggestions';
import { downloadRemoteImage } from '@shared/helpers/downloadRemoteImage';
import {
  getCollectionPageTitleProps,
  createTagCollectionRenameHandler,
} from '@app/layouts/page/tagCollectionRename';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import {
  CollectionBody,
  DEFAULT_COLLECTION_SORT,
  type CollectionViewMode,
  type CollectionPropertyVisibility,
  type CollectionSortState,
  type NoteCoverActions,
} from '@app/layouts/page/body/CollectionBody';
import { CollectionHeaderActions } from '@app/layouts/page/body/CollectionHeaderActions';
import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  NOTE_COLLECTION_VIEW_CAPABILITIES,
  resolveDefaultProperties,
  resolveSupportedLayout,
  resolveSupportedSort,
  type CollectionViewCapabilities,
} from '@app/layouts/page/body/collectionViewCapabilities';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { deriveCollectionViewKey } from '@core/application/collection/collectionViewKey';
import { ArchiveCollectionBody } from '@app/layouts/page/body/ArchiveCollectionBody';
import { AssetsCollectionBody } from '@app/layouts/page/body/AssetsCollectionBody';
import {
  TasksCollectionBody,
  type TasksCollectionView,
} from '@features/tasks/page/TasksCollectionBody';
import type { TaskDisplayConfig } from '@features/tasks/helpers/groupTasks';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@features/markdown/editor/MarkdownEditor';
import { clearCachedEditorSession } from '@features/markdown/editor/codemirror/editorHistoryCache';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import { PropertyList } from '@components/property-list/PropertyList';
import { buildPageProperties } from './buildPageProperties';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';

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
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * (owned by `AppLayout`, the common ancestor of this and Sidebar's Tasks
   * panel) — applied to the Today/Everything else collection pages'
   * `TasksCollectionBody` below, so they always render identically to
   * their sidebar counterparts. Read-only here: the settings menu that
   * changes it lives only on the sidebar's All Tasks row (see
   * TasksViewSettingsMenu's doc comment).
   */
  readonly tasksViewConfig: TaskDisplayConfig;
  /**
   * A pending "land on this content" request — from Sidebar's Tasks panel,
   * or from this component's own Tag collection "Open note" click (see
   * AppLayout's own doc comment on this state) — threaded straight through
   * to `MarkdownEditor`'s own `pendingReveal` prop (filtered to this exact
   * target page below), which applies it in its own post-mount effect and
   * reports back via `onRevealHandled`. See
   * `MarkdownEditorProps.pendingReveal`'s own doc comment for why this is a
   * prop handed to the editor rather than an imperative
   * `MarkdownEditorHandle.revealRange()`/`revealRanges()` call from an
   * effect here: a parent-side effect only knows the child *ref* exists,
   * not that the child's own mount-time work has actually settled, which
   * previously let the reveal's scroll apply while its temporary highlight
   * silently failed to paint.
   */
  readonly pendingReveal: PendingEditorReveal | null;
  /**
   * Requests a new reveal — passed straight through from AppLayout
   * (`setPendingReveal`). `Sidebar`'s Tasks panel is one caller (routed
   * through `AppLayout` directly); this component's own Tag collection
   * "Open note" click (`openNoteFromCollection` below) is the other,
   * called directly here since the click handler already lives in this
   * component's own render.
   */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
  readonly onRevealHandled: () => void;
}

const TASK_COLLECTION_VIEWS: ReadonlySet<string> = new Set<TasksCollectionView>(
  [
    'tasks-today',
    'tasks-overdue',
    'tasks-upcoming',
    'tasks-completed',
    'tasks-all',
    'tasks-unscheduled',
  ]
);

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

/** Resolved Configure-menu state for the currently active collection — always fully populated, never partial. */
interface CollectionViewState {
  readonly viewMode: CollectionViewMode;
  readonly properties: CollectionPropertyVisibility;
  readonly sort: CollectionSortState;
}

/**
 * Resolves a collection's Configure-menu state from
 * `CollectionViewConfigStore`, falling back to today's exact defaults for
 * any field the collection has never persisted (or, when `collectionViewKey`
 * is `undefined` — the active view isn't a collection at all — for every
 * field). The store's own `PersistedCollectionLayout`/
 * `PersistedCollectionProperties`/`PersistedCollectionSort` types are
 * structurally identical to `CollectionViewMode`/`CollectionPropertyVisibility`/
 * `CollectionSortState` by design (see `CollectionViewConfigStore`'s own
 * doc comment), so no field-by-field conversion is needed here.
 */
function resolveCollectionViewState(
  store: CollectionViewConfigStore,
  collectionViewKey: string | undefined,
  capabilities: CollectionViewCapabilities
): CollectionViewState {
  const persisted = collectionViewKey
    ? store.get(collectionViewKey)
    : undefined;

  return {
    // A persisted layout the collection doesn't support (e.g. 'table' for Assets) falls back to its default.
    viewMode: resolveSupportedLayout(persisted?.layout, capabilities),
    // Nothing persisted yet -> the collection's own starting properties (Assets' card starts with only its title).
    properties: { ...resolveDefaultProperties(capabilities), ...persisted?.properties },
    // A persisted sort key the collection doesn't offer falls back to the default (Name).
    sort: resolveSupportedSort(persisted?.sort, capabilities, DEFAULT_COLLECTION_SORT),
  };
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
export function PageHost({
  application,
  onOpenResource,
  onOpenImageOverlay,
  tasksViewConfig,
  pendingReveal,
  onRequestReveal,
  onRevealHandled,
}: PageHostProps) {
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

  // Which page/folder ids currently have a user-requested-open description
  // editor (see onOpenDescriptionEditor below and Page.tsx's
  // showDescriptionEditor doc comment) — deliberately local UI state, never
  // persisted: the description's own value remains the source of truth
  // once it exists, this only covers the moment a still-empty description
  // is first shown for editing. Set-based (not a single id) so a page and a
  // folder can independently have this requested without competing for one
  // slot, though only one resource is ever the active view at a time.
  const [descriptionEditorRequestedIds, setDescriptionEditorRequestedIds] =
    useState<ReadonlySet<string>>(new Set());

  // The current in-progress (uncommitted-to-Vault) description text per id,
  // populated on every keystroke (onEditPageDescription/onEditFolderDescription
  // below) and consulted only at the moment an editing session ends (flush/
  // cancel) to decide whether the empty-editor-hides-on-blur rule applies —
  // see PageHost's onFlushPageDescription doc comment. A ref, not state:
  // this is read-only-at-settlement bookkeeping, never itself a reason to
  // re-render.
  const descriptionDraftValues = useRef(new Map<string, string>());

  // Collection-view wiring: persisted per collection through
  // CollectionViewConfigStore, keyed by the current collection's identity
  // (workspace.activeView, via deriveCollectionViewKey) — shared across
  // every collection-shaped branch below (Folder, Archive, Workspace/
  // Favorites/Tag) since only one ever renders per PageHost render, the
  // same one-instance reasoning editorRef above already relies on. Lives
  // beside the page title (Page's titleActions prop), not the top bar —
  // see CollectionViewMenu's own doc comment.
  const collectionViewKey = deriveCollectionViewKey(workspace.activeView);
  // Which standard controls this collection offers — a collection type
  // declares it here; the header actions/menu below are the same for all.
  const collectionCapabilities: CollectionViewCapabilities =
    workspace.activeView?.type === 'filtered-view' &&
    workspace.activeView.view.kind === 'assets'
      ? ASSET_COLLECTION_VIEW_CAPABILITIES
      : NOTE_COLLECTION_VIEW_CAPABILITIES;

  // Render-phase reset when the collection identity changes (navigating
  // from collection A to collection B, or back) — the same "compare during
  // render, not in a useEffect" pattern CollectionViewMenu.tsx's own
  // `wasOpen` reset already uses, so switching collections never paints
  // one stale frame of the previous collection's configuration before
  // correcting itself a moment later.
  const [lastCollectionViewKey, setLastCollectionViewKey] =
    useState(collectionViewKey);
  const [collectionViewState, setCollectionViewState] =
    useState<CollectionViewState>(() =>
      resolveCollectionViewState(
        application.collectionViewConfigStore,
        collectionViewKey,
        collectionCapabilities
      )
    );
  if (collectionViewKey !== lastCollectionViewKey) {
    setLastCollectionViewKey(collectionViewKey);
    setCollectionViewState(
      resolveCollectionViewState(
        application.collectionViewConfigStore,
        collectionViewKey,
        collectionCapabilities
      )
    );
  }

  const {
    viewMode: collectionViewMode,
    properties: collectionProperties,
    sort: collectionSort,
  } = collectionViewState;

  // Each handler updates the render-phase-visible local state immediately
  // (so the menu reflects the change without waiting on a store round
  // trip) and, when the active view is actually a collection
  // (collectionViewKey defined), persists it — a page or an out-of-scope
  // filtered view (tasks/assets) never renders collectionViewMenu at all,
  // so collectionViewKey is only ever undefined here when these handlers
  // can't be reached in the first place, but the guard keeps this
  // correct even so.
  const setCollectionViewMode = (mode: CollectionViewMode): void => {
    setCollectionViewState((previous) => ({ ...previous, viewMode: mode }));
    if (collectionViewKey) {
      application.collectionViewConfigStore.update(collectionViewKey, {
        layout: mode,
      });
    }
  };
  const setCollectionProperties = (
    next: CollectionPropertyVisibility
  ): void => {
    setCollectionViewState((previous) => ({ ...previous, properties: next }));
    if (collectionViewKey) {
      application.collectionViewConfigStore.update(collectionViewKey, {
        properties: next,
      });
    }
  };
  const setCollectionSort = (next: CollectionSortState): void => {
    setCollectionViewState((previous) => ({ ...previous, sort: next }));
    if (collectionViewKey) {
      application.collectionViewConfigStore.update(collectionViewKey, {
        sort: next,
      });
    }
  };

  // The collection's standard header actions (Settings / view mode + Add):
  // one component for every collection type — see CollectionHeaderActions.
  const renderCollectionHeaderActions = ({
    showArchived = false,
    onAdd,
    addLabel,
  }: {
    showArchived?: boolean;
    onAdd?: () => void;
    addLabel?: string;
  } = {}) => (
    <CollectionHeaderActions
      menu={{
        viewMode: collectionViewMode,
        onChange: setCollectionViewMode,
        properties: collectionProperties,
        onPropertiesChange: setCollectionProperties,
        sort: collectionSort,
        onSortChange: setCollectionSort,
        showArchived,
        capabilities: collectionCapabilities,
      }}
      onAdd={onAdd}
      addLabel={addLabel}
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
  const getEmbedSuggestions = createEmbedSuggester(
    vault,
    application.membershipSelector
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // ADR-032's heading-suggestion counterpart, scoped to whichever page the
  // in-progress ![[Page# target already names.
  const getEmbedHeadingSuggestions = createEmbedHeadingSuggester(
    vault,
    application.effectivePageState
  );
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
  const resolvePageEmbed = createPageEmbedResolver(
    vault,
    application.effectivePageState
  );
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
  // Daily Notes nav row (PageTitleSection's belowDescription slot) reuses
  // this exact same resolveDate/openAtPath flow — the same one the
  // editor's inline date links and Sidebar's calendar already open
  // through — rather than a second Daily-Note-opening implementation.
  const onNavigateToDailyNote = (date: string): void => {
    resolveDate(date).activate();
  };

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;
  const page = useActivePage(vault, activePageId);
  const propertyDrafts = useCustomPropertyDrafts(activePageId);
  const propertiesConfirmation = useConfirmationSurface();
  // The page whose title "Properties" was just chosen, before its first property.
  const [startingPropertyPageId, setStartingPropertyPageId] = useState<string | null>(null);

  const rawSession = activePageId
    ? application.pageOperations.getSession(activePageId)
    : undefined;

  // React observes DocumentSession changes through this hook.
  // The session remains the single source of editable document state.
  const session = useDocumentSession(rawSession);

  // Narrowed to `null` unless this request actually targets the page this
  // render is showing — `pageOperations.open` (called by Sidebar.Tasks'
  // onOpenTask, or by this component's own openNoteFromCollection below,
  // both fire-and-forget) resolves asynchronously, so `activePageId` can
  // still name the *previous* page on the render that sets `pendingReveal`;
  // this recomputes on every render and simply yields `null` until
  // `workspace`'s own notify() flips `activePageId` to match. Handed to
  // `MarkdownEditor` below as its own `pendingReveal` prop — see that
  // prop's own doc comment (`MarkdownEditor.types.ts`) for why applying it
  // is that component's own job now, not an imperative
  // `revealRange()`/`revealRanges()` call from an effect here.
  const editorPendingReveal =
    pendingReveal && pendingReveal.pageId === activePageId ? { ranges: pendingReveal.ranges } : null;

  // Shared by both `toCollectionPageModel` call sites below (folder
  // branch, filtered-view branch) — opens the note exactly like every
  // other collection click (`application.pageOperations.open`), and, when
  // this click came from a Tag collection view (`revealTagName` set by
  // `toCollectionEntry`'s own tag-aware onClick), additionally resolves
  // every occurrence of that tag in the clicked note's own Markdown and
  // requests a reveal for all of them at once — the same
  // `onRequestReveal`/`pendingReveal` pipeline Sidebar's Tasks panel
  // already drives (`AppLayout`'s own doc comment on that state). Reading
  // `vault.getPage(id)` fresh here (not `page`, this component's own
  // *active* page) is deliberate: the clicked note is very often a
  // *different* page than the one currently open.
  const openNoteFromCollection = (id: string, revealTagName?: string): void => {
    application.pageOperations.open(id);

    if (!revealTagName) {
      return;
    }

    const clickedPage = vault.getPage(id);
    const ranges = getTagOccurrenceRanges(clickedPage, revealTagName);

    if (ranges.length > 0) {
      onRequestReveal({ pageId: id, ranges });
    }
  };

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

  // Description editing — mirrors the title channel's shape exactly (see
  // onEditPageTitle/onFlushPageTitle/onCancelPageTitle below), targeting
  // PageOperations.commitDescription()'s own debounced channel (which
  // flushes through updateMetadata(), not rename()) instead of a single
  // discrete call. A draft's description has no channel yet — it commits
  // discretely via updateMetadata() directly, in the draft-render branch
  // below, the same way updateDraftTitle() is title's own discrete-commit
  // counterpart for drafts.
  const onEditPageDescription = (pageId: string, description: string): void => {
    descriptionDraftValues.current.set(pageId, description);
    application.pageOperations.commitDescription(pageId, description);
  };
  // An empty, never-typed-into (or typed-then-cleared) editor is a
  // transient UI affordance, not a committed value (Description UX spec
  // §4/§7) — it must not survive a blur, and must not have written
  // `description:` to frontmatter just because it was opened.
  // requestDescriptionSave() itself already handles the "nothing was ever
  // typed" case correctly (a silent no-op — commitDescription() above only
  // arms a FieldEditState on a real keystroke) and the "typed then cleared"
  // case (persists `null`, per the existing empty→null convention) — the
  // only thing this adds is hiding the transient editor once its resulting
  // value is empty, without waiting on (or racing) that async persist:
  // descriptionDraftValues holds the live, synchronously-known typed value,
  // so this never has to guess from the still-stale `description` prop.
  const onFlushPageDescription = (pageId: string): void => {
    void application.pageOperations.requestDescriptionSave(pageId);
    const draftValue = descriptionDraftValues.current.get(pageId);
    if (!draftValue) {
      hideDescriptionEditor(pageId);
    }
    descriptionDraftValues.current.delete(pageId);
  };
  // Escape reverts to whatever was already persisted (cancelDescriptionEdit
  // never writes) — so, unlike flush, the correct "should this hide" signal
  // is simply whether a description already existed *before* this editing
  // session, not what (if anything) was typed and then discarded.
  const onCancelPageDescription = (
    pageId: string,
    hadPersistedDescription: boolean
  ): void => {
    application.pageOperations.cancelDescriptionEdit(pageId);
    descriptionDraftValues.current.delete(pageId);
    if (!hadPersistedDescription) {
      hideDescriptionEditor(pageId);
    }
  };

  // Folder-scoped counterpart to the three handlers above — same channel
  // shape, backed by FolderOperations.commitDescription() instead.
  const onEditFolderDescription = (folderId: string, description: string): void => {
    descriptionDraftValues.current.set(folderId, description);
    application.folderOperations.commitDescription(folderId, description);
  };
  const onFlushFolderDescription = (folderId: string): void => {
    void application.folderOperations.requestDescriptionSave(folderId);
    const draftValue = descriptionDraftValues.current.get(folderId);
    if (!draftValue) {
      hideDescriptionEditor(folderId);
    }
    descriptionDraftValues.current.delete(folderId);
  };
  const onCancelFolderDescription = (
    folderId: string,
    hadPersistedDescription: boolean
  ): void => {
    application.folderOperations.cancelDescriptionEdit(folderId);
    descriptionDraftValues.current.delete(folderId);
    if (!hadPersistedDescription) {
      hideDescriptionEditor(folderId);
    }
  };

  // Transient "the user asked to see the description editor" state
  // (product decision: never persisted — see Page.tsx's showDescriptionEditor
  // doc comment). Keyed by page/folder id so switching the active resource
  // can never leak a requested-open editor onto a different one — a page's
  // entry simply isn't consulted while a different id is active.
  const onOpenDescriptionEditor = (id: string): void => {
    setDescriptionEditorRequestedIds((previous) => {
      if (previous.has(id)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(id);
      return next;
    });
  };
  const hideDescriptionEditor = (id: string): void => {
    setDescriptionEditorRequestedIds((previous) => {
      if (!previous.has(id)) {
        return previous;
      }

      const next = new Set(previous);
      next.delete(id);
      return next;
    });
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

    // Both saved positions reset to centered alongside a new image, same
    // reasoning as onRemoveCoverImage's coverHidden reset below — a
    // position belongs to the image it was framed against, never carries
    // over to a replacement the user hasn't positioned yet.
    void application.pageOperations.updateMetadata(activePageId, {
      cover: url,
      coverPositionAbove: 50,
      coverPositionSide: 50,
    });
  };

  const onSetCoverImageFromUpload = (sourcePath: string): void => {
    if (!activePageId) {
      return;
    }

    void (async () => {
      const relativePath = await application.importCoverAsset(sourcePath);
      await application.pageOperations.updateMetadata(activePageId, {
        cover: relativePath,
        coverPositionAbove: 50,
        coverPositionSide: 50,
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
    // for no reason visible in the UI that set it. Both saved positions
    // reset for the same reason: a future cover must not inherit an old
    // image's framing.
    void application.pageOperations.updateMetadata(activePageId, {
      cover: null,
      coverHidden: false,
      coverPositionAbove: 50,
      coverPositionSide: 50,
    });
  };

  // PageCover's "Save Position" action, reached only while repositioning
  // mode is active (Page.Cover.tsx's own local drag-preview state) — the
  // one point where a drag preview actually becomes persisted metadata.
  // Only the layout currently being repositioned is patched; the other
  // layout's saved position is never read or touched here.
  const onSaveCoverPosition = (layout: 'side' | 'above', position: number): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(
      activePageId,
      layout === 'above'
        ? { coverPositionAbove: position }
        : { coverPositionSide: position }
    );
  };

  // Same shared-across-draft-and-persisted reasoning as onSetCoverImage
  // above — the page header's More-actions "Emoji" entry point (unset)
  // and the emoji button's own ChangeIconPicker (already set) both funnel
  // here, exactly one write path either way.
  const onSelectEmoji = (emoji: string): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      icon: emoji,
    });
  };

  const onRemoveEmoji = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      icon: null,
    });
  };

  // Distinct from onRemoveCoverImage: leaves `cover` untouched, only sets
  // coverHidden — see PageCover.tsx's own onHide doc comment for why this
  // needs no further sequencing beyond persisting the flag.
  const onHideCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      coverHidden: true,
    });
  };

  // The reveal counterpart to onHideCoverImage above — same coverHidden-only
  // patch, flipped back to false. Reached from the More-actions "Show cover
  // image" item (PageHeaderMoreActionsMenu), never the picker: it must not
  // touch `cover` itself.
  const onShowCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      coverHidden: false,
    });
  };

  // PageCover's own "Layout" menu action — only ever changes coverLayout,
  // never cover/coverHidden (see PageCover.tsx's onSetLayout doc comment).
  const onSetCoverLayout = (layout: 'side' | 'above'): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      coverLayout: layout,
    });
  };

  const onMoveNote = (destinationFolderId: string | null): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.move(activePageId, destinationFolderId);
  };

  const onMoveFolder = (
    folderId: string,
    destinationFolderId: string | null
  ): void => {
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

  // The Table's Cover image column (every note collection — folders, Daily
  // Notes, Workspace, Favorites, tags): changes a *listed* note's cover through
  // the same PageOperations.updateMetadata write the open page's own cover uses
  // (onSetCoverImage above), just keyed by that note's id instead of the active
  // page's. A new cover also un-hides a hidden one and re-centers the framing,
  // since the collection shows a hidden cover as none (see CollectionBody).
  const noteCoverActions: NoteCoverActions = {
    resolveUrl: (cover) => application.resolveCoverImageForDisplay(cover),
    onSet: (noteId, url) => {
      void application.pageOperations.updateMetadata(noteId, {
        cover: url,
        coverHidden: false,
        coverPositionAbove: 50,
        coverPositionSide: 50,
      });
    },
    onSetFromUpload: (noteId, sourcePath) => {
      void (async () => {
        const relativePath = await application.importCoverAsset(sourcePath);
        await application.pageOperations.updateMetadata(noteId, {
          cover: relativePath,
          coverHidden: false,
          coverPositionAbove: 50,
          coverPositionSide: 50,
        });
      })();
    },
    onRemove: (noteId) => {
      void application.pageOperations.updateMetadata(noteId, {
        cover: null,
        coverHidden: false,
        coverPositionAbove: 50,
        coverPositionSide: 50,
      });
    },
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
        onOpenNote: openNoteFromCollection,
        onOpenDraftNote: (id: string) => application.workspace.openPage(id),
      }
    );

    const breadcrumbs = buildBreadcrumbs(
      folder,
      vault,
      application.membershipSelector,
      onOpenFolder
    );
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
        coverPositionAbove: 50,
        coverPositionSide: 50,
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
    // Folder-scoped counterpart to the Note/DailyNote branch's
    // onSetCoverLayout above — only ever changes coverLayout.
    const onSetFolderCoverLayout = (layout: 'side' | 'above'): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        coverLayout: layout,
      });
    // Named for the same reason onRemoveFolderCoverImage above is — the
    // More-actions "Cover image" picker (PageHeaderMoreActionsMenu, via
    // <Page>) needs the exact same set/upload calls buildTopBarActions'
    // own cover-image menu item already uses, not a second copy.
    const onSetFolderCoverImage = (url: string): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        cover: url,
        coverPositionAbove: 50,
        coverPositionSide: 50,
      });
    const onSetFolderCoverImageFromUpload = (sourcePath: string): void => {
      void (async () => {
        const relativePath = await application.importCoverAsset(sourcePath);
        await application.folderOperations.updateMetadata(folder.id, {
          cover: relativePath,
          coverPositionAbove: 50,
          coverPositionSide: 50,
        });
      })();
    };
    // Folder-scoped counterpart to onSaveCoverPosition above.
    const onSaveFolderCoverPosition = (
      layout: 'side' | 'above',
      position: number
    ): void =>
      void application.folderOperations.updateMetadata(
        folder.id,
        layout === 'above'
          ? { coverPositionAbove: position }
          : { coverPositionSide: position }
      );
    // The More-actions "Emoji" entry point's persistence — same
    // FolderOperations.updateMetadata write path sidebar Folder.tsx's own
    // ChangeIconPicker already uses (icon: null clears it, same as
    // cover's own null-to-clear convention above).
    const onSelectFolderEmoji = (emoji: string): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        icon: emoji,
      });
    const onRemoveFolderEmoji = (): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        icon: null,
      });

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
      moveDestinations: buildMoveDestinationItems(
        application.membershipSelector,
        folder.id
      ),
      onMove: (destinationFolderId) =>
        onMoveFolder(folder.id, destinationFolderId),
      onCreateFolder: (name) => application.folderOperations.create(name, null),
    });
    // A reserved folder (Archive, Inbox, Templates, Daily Notes) can't be
    // renamed or deleted — buildTopBarActions already dispatches it to
    // topBarRegistry's no-op reserved-folder renderer (no menu trigger at
    // all) via MembershipSelector.isSystemFolder, but title-editability has
    // no equivalent automatic gate, so it's checked here explicitly.
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
    // its fixed icon always shows (once the header is allowed to show one
    // at all — see getSystemLocationPresentation's 'page-header' surface,
    // the single place that decision and the collectionIcon-vs-icon
    // preference are made), never an editable emoji, never More actions.
    // An ordinary folder is user-owned — its own metadata.icon (if set)
    // always shows, and More actions is hover-revealed.
    const folderSystemIcon = folderSystemLocationId
      ? getSystemLocationPresentation(folderSystemLocationId, 'page-header')
          .icon
      : undefined;
    // Primary "New note" action handler — wired to the exact same
    // PageOperations.openDraft({ folderId }) call Sidebar.Notes.tsx's own
    // "+" row action already uses for "new note in this folder" (ADR-017
    // draft flow), not a new creation path. Shared by two entry points
    // below: the title-adjacent Button, and the notes table's always-rendered
    // trailing "New Note" row (CollectionBody's onCreateNote) — one
    // handler, two live controls, not two implementations. Only defined
    // for an ordinary folder: a reserved one (Archive, Templates, Daily
    // Notes — folderSystemLocationId truthy) has no established "create a
    // note here" affordance today (rule 12 — never wire a live control to
    // an invented handler), matching the same `!folderSystemLocationId`
    // gate showMoreActions/emoji already use.
    const onCreateNote = !folderSystemLocationId
      ? () => void application.pageOperations.openDraft({ folderId: folder.id })
      : undefined;
    // Title-adjacent (PageTitleSection's `actions` slot, after the
    // Configure/CollectionViewMenu button, at the far right).
    // Folders grid's "Create folder" card handler (CollectionBody's
    // onCreateFolder) — same `!folderSystemLocationId` gate as
    // onCreateNote above (no established "create a folder here" for a
    // reserved one), reusing FolderOperations.create()/open() via
    // createAndOpenFolder.ts, the same create-then-open shape
    // duplicateAndOpenPage.ts already established for Duplicate. Creates
    // as a subfolder of the folder currently being viewed.
    const onCreateSubfolder = !folderSystemLocationId
      ? () =>
          void createAndOpenFolder(
            application.folderOperations,
            getFolderTitlePlaceholder(),
            folder.id
          )
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
          onTitleEdit={
            isRenameable
              ? (name) => onEditFolderName(folder.id, name)
              : undefined
          }
          onTitleFlush={
            isRenameable ? () => onFlushFolderName(folder.id) : undefined
          }
          onTitleCancel={
            isRenameable ? () => onCancelFolderName(folder.id) : undefined
          }
          descriptionKey={folder.id}
          // Same reserved-vs-ordinary gate as showMoreActions/emoji/cover
          // below — a reserved folder has no "Description" entry point at
          // all (its menu is never rendered), so this stays unreachable
          // for one regardless, but is gated explicitly for consistency.
          descriptionEditable={!folderSystemLocationId}
          showDescriptionEditor={descriptionEditorRequestedIds.has(folder.id)}
          onDescriptionEdit={
            !folderSystemLocationId
              ? (description) => onEditFolderDescription(folder.id, description)
              : undefined
          }
          onDescriptionFlush={
            !folderSystemLocationId
              ? () => onFlushFolderDescription(folder.id)
              : undefined
          }
          onDescriptionCancel={
            !folderSystemLocationId
              ? () =>
                  onCancelFolderDescription(
                    folder.id,
                    Boolean(folder.metadata.description)
                  )
              : undefined
          }
          onEditDescription={
            !folderSystemLocationId
              ? () => onOpenDescriptionEditor(folder.id)
              : undefined
          }
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          titleActions={renderCollectionHeaderActions({
            showArchived: isArchiveView,
            onAdd: onCreateNote,
          })}
          emoji={
            folderSystemLocationId
              ? undefined
              : (folder.metadata.icon ?? undefined)
          }
          icon={folderSystemIcon}
          showMoreActions={!folderSystemLocationId}
          onSelectEmoji={
            folderSystemLocationId ? undefined : onSelectFolderEmoji
          }
          onRemoveEmoji={
            folderSystemLocationId ? undefined : onRemoveFolderEmoji
          }
          onSetCoverImage={
            folderSystemLocationId ? undefined : onSetFolderCoverImage
          }
          onSetCoverImageFromUpload={
            folderSystemLocationId ? undefined : onSetFolderCoverImageFromUpload
          }
          coverImage={
            application.resolveCoverImageForDisplay(model.coverImage) ??
            undefined
          }
          onRemoveCoverImage={onRemoveFolderCoverImage}
          coverHidden={model.coverHidden}
          onHideCoverImage={onHideFolderCoverImage}
          onShowCoverImage={onShowFolderCoverImage}
          coverLayout={model.coverLayout}
          onSetCoverLayout={onSetFolderCoverLayout}
          coverPositionAbove={model.coverPositionAbove}
          coverPositionSide={model.coverPositionSide}
          onSaveCoverPosition={onSaveFolderCoverPosition}
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
                onRestoreFolder={(id) =>
                  void application.folderOperations.restore(id)
                }
                onDeleteFolder={(id) =>
                  void application.folderOperations.delete(id)
                }
                onRestoreNote={(id) =>
                  void application.pageOperations.restore(id)
                }
                onDeleteNote={(id) =>
                  void application.pageOperations.delete(id)
                }
              />
            ) : (
              <CollectionBody
                folders={model.folders}
                notes={model.notes}
                viewMode={collectionViewMode}
                properties={collectionProperties}
                sort={collectionSort}
                onCreateFolder={onCreateSubfolder}
                onCreateNote={onCreateNote}
                noteCover={noteCoverActions}
                previewResolvers={{
                  resolveWikiLink,
                  resolveTag,
                  resolveEmbed: resolvePageEmbed,
                  resolveEmbedImage,
                  resolveImageSrc,
                  resolveCoverImage: (cover) =>
                    application.resolveCoverImageForDisplay(cover),
                }}
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
    // Every asset Clutter knows about or uses: the vault's files plus the remote images notes and covers reference.
    const assets = application.membershipSelector.getAllAssets();

    // The collection's standard Add action, for assets: pick files, copy them
    // into the vault's Assets folder via the same import the cover upload uses
    // (`importCoverAsset` -> `importAsset`; collision-free naming), and let the
    // vault's normal ingest/watch pick them up as resources.
    const onAddAsset = (): void => {
      void (async () => {
        const selected = await openFileDialog({
          multiple: true,
          directory: false,
          filters: [
            { name: 'Images and PDFs', extensions: supportedResourceFileExtensions() },
          ],
        });
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
        for (const sourcePath of paths) {
          await application.importCoverAsset(sourcePath);
        }
      })();
    };

    return (
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation('assets').label}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={[]} />}
        icon={getSystemLocationPresentation('assets', 'page-header').icon}
        showMoreActions={false}
        titleActions={renderCollectionHeaderActions({
          onAdd: onAddAsset,
          addLabel: 'Add asset',
        })}
        body={
          <AssetsCollectionBody
            assets={assets}
            viewMode={collectionViewMode}
            properties={collectionProperties}
            sort={collectionSort}
            resolveResourceUrl={(path) => application.resolveResourceImageUrl(path)}
            // A vault file opens in its viewer (with its actions); a remote image in the plain image overlay.
            onOpenAsset={(asset) =>
              asset.source === 'local'
                ? onOpenResource(asset.resource)
                : onOpenImageOverlay({ url: asset.url, alt: getResourceDisplayName(asset) })
            }
            onRenameResource={(id, name) =>
              void application.resourceOperations.renameResource(id, name)
            }
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
        icon={getSystemLocationPresentation(view, 'page-header').icon}
        showMoreActions={false}
        body={
          <TasksCollectionBody
            view={view}
            tasks={[...vault.tasks()]}
            onToggleComplete={(task) =>
              void application.taskOperations.toggleComplete(task)
            }
            onOpenTask={(task) =>
              void application.pageOperations.open(task.sourcePageId)
            }
            onChangeDueDate={(task, date) =>
              void (date === null
                ? application.taskOperations.clearDate(task)
                : application.taskOperations.setDate(task, date))
            }
            onDuplicateTask={(task) => void application.taskOperations.duplicate(task)}
            onDeleteTask={(task) => void application.taskOperations.delete(task)}
            displayConfig={tasksViewConfig}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
            resolveEmbed={resolvePageEmbed}
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
        onOpenNote: openNoteFromCollection,
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
    // "New note" action handler: only for Workspace-root (the vault's own
    // root note listing), wired to the exact same root-level
    // PageOperations.openDraft({ folderId: null }) call the sidebar's
    // "New" shortcut already uses (buildNotesShortcutHandler.ts's
    // 'new-note' case) — not a new creation path. Shared by the title-
    // adjacent Button below and the notes table's trailing "New Note" row
    // (CollectionBody's onCreateNote). Favorites and a Tag's notes are
    // filters, not containers — Favorites has no existing "create a note in
    // this view" call to wire to, so per rule 12 (never wire a live
    // control to an invented handler) it gets none. A Tag's notes reuse
    // createNoteForTag, the same helper the Tags sidebar row's "+" uses.
    const onCreateNote =
      view.kind === 'workspace'
        ? () => void application.pageOperations.openDraft({ folderId: null })
        : view.kind === 'tag'
          ? () => void createNoteForTag(
                application.pageOperations,
                application.tagExpansionStore,
                view.tagName
              )
          : undefined;
    // Title-adjacent "New" action.
    // Folders grid's "Create folder" card handler — same `view.kind ===
    // 'workspace'` gate as onCreateNote above, reusing
    // FolderOperations.create()/open() via createAndOpenFolder.ts.
    // Creates at the vault root (parentId: null), the same root scope
    // Workspace-root's own folder listing already shows.
    const onCreateFolder =
      view.kind === 'workspace'
        ? () =>
            void createAndOpenFolder(
              application.folderOperations,
              getFolderTitlePlaceholder(),
              null
            )
        : undefined;

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
        titleActions={renderCollectionHeaderActions({ onAdd: onCreateNote })}
        icon={
          getSystemLocationPresentation(filteredViewSystemLocationId, 'page-header')
            .icon
        }
        showMoreActions={false}
        body={
          <CollectionBody
            folders={model.folders}
            notes={model.notes}
            viewMode={collectionViewMode}
            properties={collectionProperties}
            sort={collectionSort}
            onCreateFolder={onCreateFolder}
            onCreateNote={onCreateNote}
            noteCover={noteCoverActions}
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
    // A draft has no persisted metadata to read back from (ADR-017) — while
    // typing, the only place the in-progress text exists is
    // descriptionDraftValues (set by onDescriptionEdit below). Falling back
    // to it here (rather than the model's always-'' description) is what
    // keeps the field showing what was just typed during the brief async
    // window between commit (blur) and the draft's actual promotion —
    // without it, the next render (still on this draft branch, since
    // vault.getPage() hasn't resolved the promotion yet) would re-sync the
    // controlled EditableText back to the stale empty value.
    const draftDescription =
      descriptionDraftValues.current.get(activePageId) ?? model.description;

    return (
      <Page
        titleKey={activePageId}
        descriptionKey={activePageId}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={model.title}
        description={draftDescription}
        titleEditable
        titlePlaceholder={getPageTitlePlaceholder(draft.type)}
        descriptionEditable
        showDescriptionEditor={descriptionEditorRequestedIds.has(activePageId)}
        // Tracking-only — a draft has no debounced channel of its own
        // (updateDraftTitle()'s counterpart doesn't exist for description;
        // updateMetadata()'s draft branch is discrete-commit-only), so this
        // never calls PageOperations. It exists purely so onDescriptionFlush
        // below can know synchronously whether anything was typed this
        // session, the same draftValues mechanism the persisted branches use.
        onDescriptionEdit={(description) =>
          descriptionDraftValues.current.set(activePageId, description)
        }
        onDescriptionCommit={(description) => {
          descriptionDraftValues.current.delete(activePageId);
          void application.pageOperations.updateMetadata(activePageId, {
            description,
          });
        }}
        onDescriptionFlush={() => {
          const draftValue = descriptionDraftValues.current.get(activePageId);
          if (!draftValue) {
            hideDescriptionEditor(activePageId);
          }
          descriptionDraftValues.current.delete(activePageId);
        }}
        onDescriptionCancel={() => {
          descriptionDraftValues.current.delete(activePageId);
          // A draft never has a persisted description to revert to — Escape
          // always returns to the no-description state.
          hideDescriptionEditor(activePageId);
        }}
        onEditDescription={() => onOpenDescriptionEditor(activePageId)}
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
        belowDescription={
          draft.type === 'daily-note' && draft.title ? (
            <DailyNoteNavControls
              date={draft.title}
              onNavigateToDate={onNavigateToDailyNote}
            />
          ) : undefined
        }
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
              pendingReveal={editorPendingReveal}
              onRevealApplied={onRevealHandled}
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
                void application.resourceOperations.moveResource(
                  id,
                  destinationFolderId
                )
              }
              onCreateFolder={(name) =>
                application.folderOperations.create(name, null)
              }
            />
          </MarkdownBody>
        }
      />
    );
  }

  const breadcrumbs = buildBreadcrumbs(
    page,
    vault,
    application.membershipSelector,
    onOpenFolder
  );

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

  const model = toResourcePageModel(page, session, onUpdateMarkdown, onRequestSave);
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
        ? buildMoveDestinationItems(application.membershipSelector)
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

  // The Properties list: the listed system properties, the custom
  // properties, and any property being added.
  const propertyItems = buildPageProperties(page, {
    // The editor's own inline-#tag click path (createTagResolver's
    // activate → navigation.openTag), not a second navigation.
    onOpenTag: (name) => resolveTag(name).activate(),
    aliases: {
      // The one write path for page metadata.
      onCommit: (aliases) =>
        void application.pageOperations.updateMetadata(page.id, { aliases }),
      getSuggestions: createAliasSuggester(vault, page.id),
    },
    onRenameProperty: (key, name) =>
      void application.pageOperations.renameCustomProperty(page.id, key, name),
    onCommitTags: (tags) => void application.pageOperations.updateMetadata(page.id, { tags }),
    getTagSuggestions,
    onRemoveListItem: (key, index, value) =>
      void application.pageOperations.removeCustomPropertyItem(page.id, key, index, value),
    onCommitListValue: (key, value) =>
      void application.pageOperations.setCustomPropertyList(page.id, key, value),
    onSetScalarValue: (key, type, value) =>
      void application.pageOperations.setCustomPropertyValue(page.id, key, type, value),
    onDeleteProperty: (key) => void application.pageOperations.deleteCustomProperty(page.id, key),
    onRemoveSystemProperty: (key) => void application.pageOperations.removeSystemProperty(page.id, key),
    drafts: {
      items: propertyDrafts.drafts,
      // Named: the property is written now (empty, typed), and the
      // draft row stands in for it until the page shows it.
      onName: (id, name) => {
        const draft = propertyDrafts.drafts.find((candidate) => candidate.id === id);

        if (!draft) {
          return;
        }

        propertyDrafts.name(id, name);
        void application.pageOperations
          .addCustomProperty(page.id, name, emptyCustomProperty(draft.type))
          .finally(() => propertyDrafts.remove(id));
      },
      onAbandon: propertyDrafts.remove,
    },
  });
  // The Properties section — see derivePropertiesSectionState, the one place
  // its state (displayed, add button, title control) is derived.
  const isArchived = page.metadata.status === 'archived';
  const sectionState = derivePropertiesSectionState({
    lines: page.metadata.unownedFrontmatter ?? [],
    isArchived,
    hasDraft: propertyDrafts.drafts.length > 0,
    isStarting: startingPropertyPageId === page.id,
  });
  // An unnamed draft belongs to the section being hidden: drop it, so it
  // can't reappear (and grab focus) when shown again.
  const hidePropertiesSection = (): void => {
    propertyDrafts.clear();
    setStartingPropertyPageId(null);
    void application.pageOperations.setPropertiesSectionHidden(page.id, true);
  };
  const requestDeleteAllProperties = (): void =>
    propertiesConfirmation.request({
      title: 'Delete all properties?',
      message:
        "This deletes every custom property and its value from this note's frontmatter and removes the Properties section. Tags, aliases and the other system values are kept.",
      confirmLabel: 'Delete all',
      onConfirm: () => {
        propertyDrafts.clear();
        setStartingPropertyPageId(null);
        void application.pageOperations.deleteAllProperties(page.id);
      },
    });
  const addPropertyRow =
    sectionState.showsAddRow ? (
      <AddPropertyRow
        systemProperties={getAddableSystemProperties(page)}
        // The title's "Add a property" opens this button's menu; once it is
        // used or dismissed the transient start is over (a choice has then
        // either written the property or begun a draft, which keep the section).
        autoOpen={startingPropertyPageId === page.id}
        onDismiss={() => setStartingPropertyPageId(null)}
        onAddSystemProperty={(key) =>
          void application.pageOperations
            .addSystemProperty(page.id, key)
            .finally(() => setStartingPropertyPageId(null))
        }
        onAddCustomProperty={(type) => {
          propertyDrafts.add(type);
          setStartingPropertyPageId(null);
        }}
        // Only when there is something to hide or delete: not while the first
        // property is only being started.
        onHideProperties={sectionState.hasProperties ? hidePropertiesSection : undefined}
        onDeleteAll={sectionState.hasProperties ? requestDeleteAllProperties : undefined}
      />
    ) : undefined;
  // The title's control (derivePropertiesSectionState): "Add a property" to
  // start the first one, "Show properties" for an explicitly hidden section,
  // nothing while it is displayed — Hide properties is in the section's menu.
  const propertiesControl: PropertiesControl | undefined =
    sectionState.control === 'add'
      ? {
          mode: 'add',
          // Shows the (empty) section and opens its "+ Add a property"
          // menu there, so the first property is chosen in place.
          onStart: () => setStartingPropertyPageId(page.id),
        }
      : sectionState.control === 'show'
        ? {
            mode: 'show',
            onShow: () => void application.pageOperations.setPropertiesSectionHidden(page.id, false),
          }
        : undefined;

  return (
    <>
    <Page
      titleKey={activePageId}
      descriptionKey={activePageId}
      canNavigateBack={workspace.canNavigateBack}
      canNavigateForward={workspace.canNavigateForward}
      onNavigateBack={() => application.navigation.back()}
      onNavigateForward={() => application.navigation.forward()}
      title={model.title}
      description={model.description}
      titleEditable={isRenameable}
      onTitleEdit={
        isRenameable ? (title) => onEditPageTitle(page.id, title) : undefined
      }
      onTitleFlush={isRenameable ? () => onFlushPageTitle(page.id) : undefined}
      onTitleCancel={
        isRenameable ? () => onCancelPageTitle(page.id) : undefined
      }
      // A Note and a Daily Note both offer "Add a description"/"Description"
      // (dailyNoteTopBarMenu.config.ts includes the same item noteTopBarMenu
      // does) — unlike title, description editability has no note-vs-daily-
      // note distinction.
      descriptionEditable
      showDescriptionEditor={descriptionEditorRequestedIds.has(page.id)}
      onDescriptionEdit={(description) => onEditPageDescription(page.id, description)}
      onDescriptionFlush={() => onFlushPageDescription(page.id)}
      onDescriptionCancel={() =>
        onCancelPageDescription(page.id, Boolean(page.metadata.description))
      }
      onEditDescription={() => onOpenDescriptionEditor(page.id)}
      breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
      actions={topBar.actions}
      // Page-header-controls configuration: a Note is user-owned (its
      // metadata.icon, when set, always shows; More actions is
      // hover-revealed). A Daily Note shows neither emoji nor icon — its
      // title is already its calendar identity — but keeps More actions
      // on hover, same as a Note (isRenameable above draws the same
      // note-vs-daily-note line for the title's own editability).
      emoji={
        page.type === 'note' ? (page.metadata.icon ?? undefined) : undefined
      }
      onSelectEmoji={page.type === 'note' ? onSelectEmoji : undefined}
      onRemoveEmoji={page.type === 'note' ? onRemoveEmoji : undefined}
      belowDescription={
        page.type === 'daily-note' ? (
          <DailyNoteNavControls
            date={page.name}
            onNavigateToDate={onNavigateToDailyNote}
          />
        ) : undefined
      }
      onSetCoverImage={onSetCoverImage}
      onSetCoverImageFromUpload={onSetCoverImageFromUpload}
      coverImage={
        application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
      }
      onRemoveCoverImage={onRemoveCoverImage}
      coverHidden={model.coverHidden}
      onHideCoverImage={onHideCoverImage}
      onShowCoverImage={onShowCoverImage}
      coverLayout={model.coverLayout}
      onSetCoverLayout={onSetCoverLayout}
      coverPositionAbove={model.coverPositionAbove}
      coverPositionSide={model.coverPositionSide}
      onSaveCoverPosition={onSaveCoverPosition}
      coverKey={activePageId}
      bodyFocusRef={editorRef}
      // An archived page is view-only: nothing can be added to it.
      propertiesControl={propertiesControl}
      properties={
        // The whole section. Displayed, it lists the properties and ends
        // with "+ Add a property" once there is one; nothing at all if there
        // is neither.
        sectionState.isDisplayed && (propertyItems.length > 0 || addPropertyRow) ? (
          <PropertyList key={activePageId} items={propertyItems} footer={addPropertyRow} />
        ) : undefined
      }
      body={
        <MarkdownBody>
          <MarkdownEditor
            key={activePageId}
            pageId={activePageId}
            ref={editorRef}
            markdown={model.markdown}
            focusOnOpen={focusEditorOnOpen(model.title)}
            pendingReveal={editorPendingReveal}
            onRevealApplied={onRevealHandled}
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
              void application.resourceOperations.moveResource(
                id,
                destinationFolderId
              )
            }
            onCreateFolder={(name) =>
              application.folderOperations.create(name, null)
            }
          />
        </MarkdownBody>
      }
    />
    <Dialog
      open={propertiesConfirmation.pending !== null}
      onClose={propertiesConfirmation.cancel}
      size="medium"
    >
      {propertiesConfirmation.pending && (
        <Confirmation
          title={propertiesConfirmation.pending.title}
          description={propertiesConfirmation.pending.message}
          confirmLabel={propertiesConfirmation.pending.confirmLabel}
          onConfirm={propertiesConfirmation.confirm}
          onCancel={propertiesConfirmation.cancel}
        />
      )}
    </Dialog>
    </>
  );
}
