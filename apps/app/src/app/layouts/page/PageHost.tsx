import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { CoverCredit } from '@core/vault/models/PageMetadata';
import type { Application } from '@core/application/Application';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { createResourceLocationActions } from '@app/layouts/resourceLocationActions';
import { getTagOccurrenceRanges } from '@core/presentation/getTagOccurrenceRanges';
import {
  getPageDisplayLabel,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';
import { resolvePageIdentityIcon } from '@app/layouts/page/resolvePageIdentityIcon';

import { useActivePage } from '@app/hooks/useActivePage';
import { useReferencesDisplayStore } from '@app/hooks/useReferencesDisplayStore';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import {
  buildBreadcrumbs,
  buildBreadcrumbsForDraft,
  buildSystemLocationBreadcrumbs,
} from '@core/presentation/buildBreadcrumbs';
import { isPageTitleEditable } from '@core/presentation/isPageTitleEditable';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { formatAbsoluteDate } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import {
  getPageTitlePlaceholder,
  getFolderTitlePlaceholder,
} from '@core/presentation/PageDisplayPlaceholders';
import {
  buildTopBarActions,
  buildDraftTopBarActions,
} from '@app/layouts/page/topbar/buildTopBarActions';
import { duplicateAndOpenPage } from '@features/notes/helpers/duplicateAndOpenPage';
import { createFolderInZone } from '@features/notes/helpers/createFolderInZone';
import { createNoteForTag } from '@features/tags/helpers/createNoteForTag';
import {
  createAndOpenFolder,
  DISALLOWED_FOLDER_NAME_MESSAGE,
  isAllowedFolderName,
} from '@features/notes/helpers/createAndOpenFolder';
import { NewFolderDialog } from '@features/notes/shortcuts/NewFolderDialog';
import { ASSETS_DIRECTORY_NAME } from '@core/vault/initialize/ensureAssetsDirectory';
import type { Asset } from '@core/vault/models/Asset';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import {
  deleteAllArchived,
  deleteAllFailureMessage,
  hasArchivedItems,
} from '@features/notes/helpers/deleteAllArchived';
import { createNoteFromTemplate } from '@features/notes/helpers/createNoteFromTemplate';
import { createTemplate } from '@features/notes/helpers/createTemplate';
import {
  applyTemplateToNote,
  metadataPatchStillApplicable,
  type ExistingNoteMetadata,
} from '@features/notes/helpers/applyTemplateToNote';
import type { MetadataHistoryChange } from '@features/markdown/editor/codemirror/metadataHistoryStep';
import {
  isTodaysDailyNotePath,
  putPreferredTemplatesFirst,
  shouldSuggestTemplates,
  sortTemplatesByRecentUse,
} from '@features/notes/helpers/templateSuggestions';
import type { PageType } from '@core/vault/models/Page';
import { CurrentNoteTemplateSuggestions } from '@app/layouts/page/CurrentNoteTemplateSuggestions';
import { levelEntries } from '@features/notes/sidebar/sidebarSort';
import { setLevelSort } from '@features/notes/sidebar/sidebarOrderActions';
import { DEFAULT_SIDEBAR_SORT } from '@core/properties/sidebarSort';
import { resolveDefaultTemplateId } from '@features/notes/helpers/resolveDefaultTemplateId';
import { reportUpload, uploadAssets } from '@features/notes/helpers/uploadAssets';
import { buildResourceMenuOptions, type ResourceMenuOps } from '@app/layouts/page/topbar/buildResourceMenuOptions';
import {
  buildArchivedResourceItemMenu,
  buildAssetItemMenu,
  buildCollectionItemMenu,
} from '@app/layouts/page/body/buildCollectionItemMenu';
import type { CollectionItemMenuResolver } from '@app/layouts/page/body/useCollectionItemContextMenu';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { Pill } from '@components/property-list/Pill';
import {
  toResourcePageModel,
  toDraftPageModel,
} from '@app/layouts/page/toResourcePageModel';
import {
  toCollectionPageModel,
  toTemplateEntries,
} from '@features/collection/page/toCollectionPageModel';
import {
  getSystemLocationPresentation,
  getSystemLocationForFolder,
} from '@core/presentation/systemPresentation';
import type { SystemLocationId } from '@core/presentation/systemPresentation';
import { Page, type PageFocusHandle } from '@app/layouts/page/Page';
import { createDateResolver } from '@app/layouts/page/resolveDate';
import { DailyNoteNavControls } from '@features/daily-notes/controls/DailyNoteNavControls';
import type { NotePreviewResolvers } from '@features/collection/components/note/notePreviewResolvers';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { openPageAtHeading } from '@app/layouts/page/headingReveal';
import { createWikiLinkSuggester } from '@app/layouts/page/wikiLinkSuggestions';
import { spaceName } from '@app/spaces/spaceRegistry';
import { createEmbedSuggester } from '@app/layouts/page/embedSuggestions';
import { createHeadingSuggester } from '@app/layouts/page/headingSuggestions';
import { createEmbedImageResolver } from '@app/layouts/page/resolveEmbedImage';
import { createEmbedPdfResolver } from '@app/layouts/page/resolveEmbedPdf';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { resolveResourceEmbed } from '@app/layouts/page/resolveResourceEmbed';
import { createImageSrcResolver } from '@app/layouts/page/resolveImageSrc';
import { createImageResourceResolver } from '@app/layouts/page/resolveImageResource';
import { createTagSuggester } from '@app/layouts/page/tagSuggestions';
import { AddPropertyRow } from './AddPropertyRow';
import { getAddableSystemProperties } from './addableProperties';
import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';
import { emptyCustomProperty } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { resolvePageMetadata } from '@core/vault/ingest/resolvePageMetadata';
import type { PageMetadata } from '@core/vault/models/PageMetadata';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useToast } from '@components/toast/ToastProvider';
import { waitForImage } from '@shared/helpers/waitForImage';
import { reportTagBatch } from '@features/tags/helpers/tagBatchFeedback';
import { createTaskActions } from '@features/tasks/helpers/createTaskActions';
import { createArchiveActions } from '@features/notes/helpers/archiveWithUndo';
import { reportMoveFailure } from '@features/notes/helpers/reportMoveFailure';
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
import {
  createTagCollectionDeleteHandler,
  TAG_DELETE_CONFIRMATION_MESSAGE,
  getTagDeleteConfirmationTitle,
} from '@app/layouts/page/tagCollectionDelete';
import { useRequestCreateTemplate } from '@app/layouts/createTemplate/CreateTemplateProvider';
import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import { ResourceTopBarActions } from '@app/layouts/page/topbar/ResourceTopBarActions';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import { PageReferences } from '@app/layouts/page/reference/PageReferences';
import { getPageReferences } from '@app/layouts/page/reference/getPageReferences';
import {
  countPageReferences,
  isReferencesDisplayed,
} from '@app/layouts/page/reference/referencesDisplay';
import { useArchivedResourceDates } from './useArchivedResourceDates';
import {
  CollectionBody,
  type NoteCoverActions,
} from '@app/layouts/page/body/CollectionBody';
import {
  ASSET_MENU_LABELS,
  CollectionHeaderActions,
  type CollectionHeaderActionsProps,
} from '@app/layouts/page/body/CollectionHeaderActions';
import { deriveCollectionViewKey } from '@core/application/collection/collectionViewKey';
import type { PropertyId } from '@core/properties/collectionProperties';
import type { CollectionSort } from '@core/properties/collectionSort';
import type {
  CollectionLayout,
  CollectionViewConfig,
} from '@core/properties/collectionViewConfig';
import {
  ASSETS_COLLECTION,
  ARCHIVE_COLLECTION,
  ARCHIVED_FOLDER_EMPTY_MESSAGE,
  FOLDER_COLLECTION,
  collectionDefinitionForFilteredView,
  collectionDefinitionForFolder,
  type CollectionDefinition,
} from '@core/presentation/collection/collectionDefinitions';
import {
  resolveCollectionView,
  propertyOverridesFor,
  propertyOverridesPatch,
  setPropertyVisibility,
  toCollectionViewConfig,
} from '@core/presentation/collection/resolveCollectionView';
import { ArchiveCollectionBody } from '@app/layouts/page/body/ArchiveCollectionBody';
import { buildMoveDropActions } from '@features/notes/helpers/buildMoveDropActions';
import { RestoreNeedsDestinationError } from '@core/vault/persistence/PagePersistenceCoordinator';
import type { RestoreDestinationRequest } from '@app/layouts/page/restoreDestination';
import { AssetsCollectionBody } from '@app/layouts/page/body/AssetsCollectionBody';
import {
  TasksCollectionBody,
  type TasksCollectionView,
} from '@features/tasks/page/TasksCollectionBody';
import { NewTaskDialog } from '@features/tasks/shortcuts/NewTaskDialog';
import { EditTaskDialog } from '@features/tasks/shortcuts/EditTaskDialog';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import {
  TASKS_TAB_VIEW,
  TasksTabs,
  type TasksTabValue,
} from '@features/tasks/page/TasksTabs';
import { createTaskInDailyNote } from '@features/tasks/helpers/createTaskInDailyNote';
import type { TaskDisplayConfig } from '@features/tasks/helpers/groupTasks';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@features/markdown/editor/MarkdownEditor';
import { clearCachedEditorSession } from '@features/markdown/editor/codemirror/editorHistoryCache';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import { useShowReferencesAutomatically } from '@shared/helpers/showReferencesAutomaticallyPreference';
import { useShowTemplateSuggestions } from '@shared/helpers/showTemplateSuggestionsPreference';
import { PropertyList } from '@components/property-list/PropertyList';
import { buildPageProperties } from './buildPageProperties';
import { initialCoverLayoutPatch, newCoverPatch } from '@core/application/page/coverPatch';
import { isDailyNotesCollectionPagesEnabled } from '@core/featureFlags';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import {
  foldersOrderOf,
  showsFolders,
  showsNotes,
} from '@core/presentation/collection/collectionBehaviors';
import {
  isRemoteImageReference,
  useImageFileActions,
} from './ImageFileActionsContext';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';

/** The open note a template is applied to: what `shouldSuggestTemplates` reads, and what the merge must not overwrite. */
interface TemplateTargetNote {
  readonly id: string;
  readonly type: PageType;
  readonly markdown: string;
  readonly isArchived: boolean;
  readonly folderId: string | null;
  readonly existing: ExistingNoteMetadata;
  /** For a Daily Note draft: the path it will be saved at, whose file name is its date. */
  readonly dailyNotePath?: string;
}

/**
 * Runs `apply` once, when a brand-new (still unsaved) Daily Note is first shown — the moment it is created. It
 * renders nothing. The draft's id is the key, so one draft applies once; an existing note is never a draft, so
 * opening or revisiting one never reaches it.
 */
function DefaultTemplateOnCreate({ apply }: { readonly apply: () => void }) {
  const applied = useRef(false);

  useEffect(() => {
    if (!applied.current) {
      applied.current = true;
      apply();
    }
  }, []);

  return null;
}

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
  /**
   * An asset's "Set as cover image": asks the user which note gets this cover
   * reference (a vault-relative path, or a remote URL as is). Owned by
   * `AppLayout`, which hosts the note picker.
   */
  readonly onSetAssetAsCover: (reference: string) => void;
  /** Asks the user where to restore something that has no recorded original location (`AppLayout` owns the picker). */
  readonly onNeedsRestoreDestination?: (
    request: RestoreDestinationRequest
  ) => void;
  readonly onOpenImageOverlay: (
    image: ImageOverlayImage,
    options?: {
      readonly onSetCoverImage?: () => void;
      readonly actionsEnabled?: boolean;
    }
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
  /** Persists a change to the shared Tasks-view display preference (owned by AppLayout). */
  readonly onTasksViewConfigChange: (next: TaskDisplayConfig) => void;
  /** The Tasks page's selected tab, and its change handler — owned and persisted by AppLayout. */
  readonly tasksTab: TasksTabValue;
  readonly onTasksTabChange: (next: TasksTabValue) => void;
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
  ['tasks-all', 'tasks-unscheduled']
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
  onSetAssetAsCover,
  onNeedsRestoreDestination,
  tasksViewConfig,
  onTasksViewConfigChange,
  tasksTab,
  onTasksTabChange,
  pendingReveal,
  onRequestReveal,
  onRevealHandled,
}: PageHostProps) {
  const toast = useToast();
  const taskActions = createTaskActions(application.taskOperations, toast);
  // Archive with its feedback: a failure is reported and a success offers Undo (the existing restore).
  const archiveActions = createArchiveActions({
    vault: application.vault,
    pageOperations: application.pageOperations,
    folderOperations: application.folderOperations,
    resourceOperations: application.resourceOperations,
    toast,
  });
  const requestCreateTemplate = useRequestCreateTemplate();
  const workspace = useWorkspace(application.workspace);
  const vault = application.vault;

  // The cover menu's file actions: Download for any cover, Save to vault only for one that is a URL
  // (an image already in the vault has nothing to save). The flows live with AppLayout.
  const coverImageActions = useImageFileActions();
  function coverImageFileActions(reference: string | null) {
    if (!coverImageActions || !reference) {
      return {};
    }
    return {
      onDownloadCoverImage: () => coverImageActions.download(reference),
      onCopyCoverImage: () => coverImageActions.copyImage(reference),
      onCopyCoverImageAddress: () => coverImageActions.copyAddress(reference),
      // A cover from the vault's Assets has no right-click menu (the cover is a local file, not an address to copy).
      coverImageIsLocal: !isRemoteImageReference(reference),
      onSaveCoverImageToVault:
        isRemoteImageReference(reference)
          ? () => coverImageActions.saveToVault(reference)
          : undefined,
    };
  }

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
  // Page lends the editor "leave upward into the description/title" (ArrowUp on its first line).
  const pageFocusRef = useRef<PageFocusHandle>(null);

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
  // Whether the All Tasks page's New task dialog is open — local UI state, like the description-editor ids above.
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  // The task open in the Edit task modal (the same dialog as New task, in edit mode), or none.
  const [editingTask, setEditingTask] = useState<TaskOccurrence | undefined>(
    undefined
  );
  const collectionViewKey = deriveCollectionViewKey(workspace.activeView);
  // Which collection this is: its definition says which global properties it offers, which are
  // on by default, its layouts, default sort and which properties each layout requires. A page
  // or a task view is not a collection of this kind and never renders the Configure control, so
  // the ordinary folder definition stands in for them and is never read.
  const activeView = workspace.activeView;
  const activeCollectionFolder =
    activeView?.type === 'folder' ? vault.getFolder(activeView.id) : undefined;
  const collectionDefinition: CollectionDefinition =
    (activeCollectionFolder
      ? collectionDefinitionForFolder(
          activeCollectionFolder,
          vault.root,
          application.membershipSelector
        )
      : activeView?.type === 'filtered-view'
        ? collectionDefinitionForFilteredView(activeView.view)
        : undefined) ?? FOLDER_COLLECTION;

  // What the user chose for this collection (intent only: layout, property overrides, sort),
  // read from the store — converting an entry saved before the property registry, which needs
  // the collection's definition — and kept as local state so the menu reflects a change without
  // waiting on a store round trip. Everything the UI shows is `collectionView`, resolved from
  // definition + intent + registry by one pure function; nothing below resolves anything itself.
  //
  // Render-phase reset when the collection identity changes (navigating from collection A to
  // collection B, or back) — the same "compare during render, not in a useEffect" pattern
  // CollectionViewMenu.tsx's own `wasOpen` reset already uses, so switching collections never
  // paints one stale frame of the previous collection's configuration.
  const readCollectionViewConfig = (): CollectionViewConfig =>
    toCollectionViewConfig(
      collectionDefinition,
      collectionViewKey
        ? application.collectionViewConfigStore.get(collectionViewKey)
        : undefined
    );
  const [lastCollectionViewKey, setLastCollectionViewKey] =
    useState(collectionViewKey);
  const [collectionViewConfig, setCollectionViewConfig] =
    useState<CollectionViewConfig>(readCollectionViewConfig);
  if (collectionViewKey !== lastCollectionViewKey) {
    setLastCollectionViewKey(collectionViewKey);
    setCollectionViewConfig(readCollectionViewConfig());
  }

  // The store is the source of truth: a change made elsewhere to this collection's entry — the sidebar's Sort by
  // for the same folder — is read again here, so the page reflects it without being reopened.
  const readCollectionViewConfigRef = useRef(readCollectionViewConfig);
  readCollectionViewConfigRef.current = readCollectionViewConfig;
  useEffect(
    () =>
      application.collectionViewConfigStore.subscribe(() =>
        setCollectionViewConfig(readCollectionViewConfigRef.current())
      ),
    [application.collectionViewConfigStore]
  );

  const collectionView = resolveCollectionView(
    collectionDefinition,
    collectionViewConfig
  );
  // An ordinary folder's page orders its folders and notes by the folder's one sort — the very sort and manual
  // order its sidebar level uses (ADR-066) — not by a sort of its own. Every other collection keeps its own.
  const levelFolderId =
    collectionDefinition.kind === 'folder' && activeView?.type === 'folder' ? activeView.id : undefined;
  const levelSort =
    levelFolderId !== undefined ? (collectionViewConfig.sidebarSort ?? DEFAULT_SIDEBAR_SORT) : undefined;
  const levelEntryIds =
    levelFolderId !== undefined
      ? levelEntries(
          application.membershipSelector,
          levelFolderId,
          collectionViewConfig.sidebarSort,
          collectionViewConfig.sidebarOrder
        ).map((entry) => (entry.kind === 'folder' ? entry.folder.id : entry.entry.id))
      : undefined;

  // The Archive lists its files with the date each was archived, read from the archive record. Only
  // that collection reads it; the read is re-done when the set of archived files changes.
  const isArchiveCollection = collectionDefinition.kind === 'archive';
  const archivedResources = isArchiveCollection
    ? application.membershipSelector.getArchivedResources()
    : [];
  const archivedAtByPath = useArchivedResourceDates(
    application,
    archivedResources.map((resource) => resource.path),
    isArchiveCollection
  );

  // Each handler updates the render-phase-visible local state immediately and, when the active
  // view is actually a collection (collectionViewKey defined), persists the same patch — a page
  // or an out-of-scope filtered view (tasks) never renders the menu, so collectionViewKey is only
  // ever undefined here when these handlers can't be reached, but the guard keeps this correct.
  const updateCollectionViewConfig = (
    patch: Partial<CollectionViewConfig>
  ): void => {
    setCollectionViewConfig((previous) => ({ ...previous, ...patch }));
    if (collectionViewKey) {
      application.collectionViewConfigStore.update(collectionViewKey, patch);
    }
  };
  const setCollectionLayout = (layout: CollectionLayout): void =>
    updateCollectionViewConfig({ layout });
  // A required property can't be turned off, and a property at its default needs no override:
  // `setPropertyVisibility` is the one place that decides what a toggle writes.
  const setCollectionProperty = (id: PropertyId, visible: boolean): void =>
    updateCollectionViewConfig(
      propertyOverridesPatch(
        collectionView.layout,
        setPropertyVisibility(
          collectionDefinition,
          collectionView.layout,
          propertyOverridesFor(
            collectionDefinition,
            collectionViewConfig,
            collectionView.layout
          ),
          id,
          visible
        ),
        collectionViewConfig
      )
    );
  const setCollectionSort = (sort: CollectionSort): void =>
    updateCollectionViewConfig({ sort });

  // The collection's standard header actions (Settings / view mode + Add):
  // one component for every collection type — see CollectionHeaderActions.
  const renderCollectionHeaderActions = ({
    onAdd,
    onAddFolder,
    fromTemplate,
    defaultTemplate,
    menuLabels,
    addLabel,
    toggles,
  }: {
    toggles?: CollectionHeaderActionsProps['menu']['toggles'];
    onAdd?: () => void;
    onAddFolder?: () => void;
    fromTemplate?: CollectionHeaderActionsProps['fromTemplate'];
    defaultTemplate?: CollectionHeaderActionsProps['defaultTemplate'];
    menuLabels?: CollectionHeaderActionsProps['menuLabels'];
    addLabel?: string;
  } = {}) => (
    <CollectionHeaderActions
      menu={{
        view: collectionView,
        onLayoutChange: setCollectionLayout,
        onPropertyChange: setCollectionProperty,
        onSortChange: setCollectionSort,
        levelSort:
          levelFolderId !== undefined && levelSort
            ? {
                sort: levelSort,
                onChange: (next) =>
                  setLevelSort(application.collectionViewConfigStore, application.membershipSelector, levelFolderId, next),
              }
            : undefined,
        toggles,
      }}
      onAdd={onAdd}
      onAddFolder={onAddFolder}
      fromTemplate={fromTemplate}
      defaultTemplate={defaultTemplate}
      menuLabels={menuLabels}
      addLabel={addLabel}
    />
  );

  // The one "open a note, at its #heading when a reference names one" action — a wiki link's activation and a
  // note embed's source navigation both call it. Opens through PageOperations and, for a heading, asks the
  // existing reveal pipeline (AppLayout's pendingReveal -> this host's editor) to scroll to and highlight it.
  const onOpenPage = (pageId: string, heading?: string | null): void => {
    openPageAtHeading(
      {
        open: (id) => void application.pageOperations.open(id),
        getMarkdown: (id) => application.effectivePageState.getPage(id)?.markdown ?? vault.getPage(id)?.source.markdown ?? '',
        requestReveal: onRequestReveal,
      },
      pageId,
      heading
    );
  };

  // A link to a note that doesn't exist yet creates it when clicked (or accepted from autocomplete): say so when that fails.
  const reportLinkedNoteFailure = (error: unknown): void => void toast.fail('Couldn’t create the note', error);
  // Composed once per render from the currently-attached Vault/PageOperations
  // — cheap, stateless glue (resolveWikiLink.ts), not worth memoizing.
  const resolveWikiLink = createWikiLinkResolver(
    vault,
    application.pageOperations,
    application.folderOperations,
    application.effectivePageState,
    {
      openPage: onOpenPage,
      // A folder link opens through this host's own folder navigation (declared further down), an asset
      // link in the shared image / PDF preview — nothing new to open them with.
      openFolder: (folderId) => onOpenFolder(folderId),
      openResource: (resource, options) => onOpenResource(resource, options),
      membershipSelector: application.membershipSelector,
      resolveResourceUrl: (path) => application.resolveResourceImageUrl(path),
      onCreateFailed: reportLinkedNoteFailure,
    }
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getWikiLinkSuggestions = createWikiLinkSuggester(
    vault,
    application.pageOperations,
    application.folderOperations,
    undefined,
    reportLinkedNoteFailure,
    application.membershipSelector,
    (path) => application.resolveResourceImageUrl(path),
    spaceName(vault.root)
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  // Resource embed autocomplete only, this milestone — no resolver for a
  // renderer to call yet (resolveResourceEmbed.ts exists but isn't wired
  // through as an injected prop until a rendering milestone needs it).
  const getEmbedSuggestions = createEmbedSuggester(
    vault,
    application.membershipSelector,
    (path) => application.resolveResourceImageUrl(path)
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // ADR-032's heading-suggestion counterpart, scoped to whichever page the
  // in-progress ![[Page# target already names.
  const getHeadingSuggestions = createHeadingSuggester(
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
  // A note embed's own open-source-note action is `onOpenPage` above, the same one a wiki link uses.
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
    createResourceLocationActions(vault, toast);
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
    void downloadRemoteImage(url).then((saved) => {
      if (saved) {
        application.reportUnsplashDownload(url);
      }
    });
  }
  // "Save to vault" for a remote image embedded in the note: the same flow, and result dialog, as the
  // asset menu's (AppLayout owns it). The editor only offers it for a remote URL.
  const saveImageToVaultFromEditor = coverImageActions
    ? (url: string): void => coverImageActions.saveToVault(url)
    : undefined;
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveTag = createTagResolver(application.navigation, vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getTagSuggestions = createTagSuggester(vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveDate = createDateResolver(vault, application.pageOperations);
  // The one resolver set every note preview draws through — every collection body
  // (the Card previews and a Tag collection's matching-content lines), so a wiki-link, embed or tag in a line
  // resolves to the same display label everywhere, as in the Tags sidebar.
  const notePreviewResolvers: NotePreviewResolvers = {
    resolveWikiLink,
    resolveTag,
    resolveEmbed: resolvePageEmbed,
    resolveEmbedImage,
    resolveImageSrc,
    resolveCoverImage: (cover) =>
      application.resolveCoverImageForDisplay(cover),
  };
  // The Daily Note calendar control (in the title section's controls row) reuses
  // this exact same resolveDate/openAtPath flow — the same one the
  // editor's inline date links and Sidebar's calendar already open
  // through — rather than a second Daily-Note-opening implementation.
  const onNavigateToDailyNote = (date: string): void => {
    resolveDate(date).activate();
  };

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;
  const page = useActivePage(vault, activePageId);
  // ADR-052: the open note's saved References choices. References are hidden unless the user chose
  // Show, so the menu label names what a click does. The count also trails the menu item.
  const referencesDisplay = useReferencesDisplayStore(
    application.referencesDisplayStore
  );
  const savedReferencesHidden = activePageId
    ? referencesDisplay.getHidden(activePageId)
    : undefined;
  // The templates the user prefers for Daily Notes (Settings → Daily notes) and for regular notes (Settings →
  // Notes). Subscribed, so changing a list in Settings reorders an already-open suggestion row instead of
  // waiting for the next navigation.
  const preferredTemplateIds = useSyncExternalStore(
    application.preferredTemplatesStore.subscribe,
    () => application.preferredTemplatesStore.getIds('dailyNotes')
  );
  const preferredNoteTemplateIds = useSyncExternalStore(
    application.preferredTemplatesStore.subscribe,
    () => application.preferredTemplatesStore.getIds('notes')
  );
  const knowledgeGraph = vault.knowledgeGraph();
  const referencesCount = useMemo(
    () =>
      activePageId
        ? countPageReferences(getPageReferences(vault, activePageId))
        : 0,
    [vault, knowledgeGraph, activePageId]
  );
  const showReferencesAutomatically = useShowReferencesAutomatically();
  const showTemplateSuggestions = useShowTemplateSuggestions();
  const referencesHidden = !isReferencesDisplayed(savedReferencesHidden, {
    enabled: showReferencesAutomatically,
    count: referencesCount,
  });
  const propertyDrafts = useCustomPropertyDrafts(activePageId);
  const propertiesConfirmation = useConfirmationSurface();
  // A restore whose original path is taken by another page (a Daily Note for a date that exists
  // again): the question — Move to Inbox / Replace — waits here, naming the day.
  const [restoreConflict, setRestoreConflict] = useState<{
    readonly pageId: string;
    readonly dayLabel: string;
  } | null>(null);
  // The page whose title "Properties" was just chosen, before its first property.
  const [startingPropertyPageId, setStartingPropertyPageId] = useState<
    string | null
  >(null);
  // The New folder dialog while a collection is creating a folder: where the folder goes. Nothing is
  // created until the dialog is submitted.
  const [folderDialog, setFolderDialog] = useState<{
    resolveParentId: () => string | null | Promise<string | null>;
    checkParentId: string | null;
  } | null>(null);

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
    pendingReveal && pendingReveal.pageId === activePageId
      ? { ranges: pendingReveal.ranges }
      : null;

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

  // With the Daily Notes collection pages off (core/featureFlags.ts), the Daily Notes folder and its
  // year and month folders have no page to open — nothing that asks for one gets it.
  const isDailyNotesTreeFolder = (id: string): boolean => {
    const target = vault.getFolder(id);
    return (
      target !== undefined &&
      DailyNotePath.folderLevel(vault.root, target.path) !== null
    );
  };
  const onOpenFolder = (id: string) => {
    if (!isDailyNotesCollectionPagesEnabled() && isDailyNotesTreeFolder(id)) {
      return;
    }
    // The physical Assets/ folder IS the Assets collection: opening it opens that page.
    const target = vault.getFolder(id);
    if (
      target &&
      application.membershipSelector.isAssetsStorageFolder(target)
    ) {
      application.navigation.openAssets();
      return;
    }
    application.folderOperations.open(id);
  };

  // ── Assets: every folder inside Assets/ is itself an Assets page ──────────────────────────
  // What the Assets header's Add menu calls its entries (this collection's wording, not the notes').

  // Create, for assets: pick files and copy them into the folder the page is showing — `Assets/`
  // itself on the top-level page — via the same import the cover upload uses (collision-free naming),
  // and let the vault's normal ingest/watch pick them up as resources.
  const uploadAssetsInto = (destinationFolderPath?: string): void => {
    void uploadAssets(
      (source, destination) => application.importAsset(source, destination),
      destinationFolderPath
    )
      .then((result) => reportUpload(toast, result))
      .catch((error: unknown) => toast.fail('Couldn’t add the files', error));
  };

  // Create folder: opens the one New folder dialog (the sidebar's), creating in the given parent.
  // `resolveParentId` is read at submit (Assets/ may not exist yet); `checkParentId` is the parent
  // already known, for the duplicate check.
  const folderCreationTrigger =
    (
      resolveParentId: () => string | null | Promise<string | null>,
      checkParentId: string | null
    ) =>
    (): void =>
      setFolderDialog({ resolveParentId, checkParentId });

  const folderCreationDialog = (
    <NewFolderDialog
      open={folderDialog !== null}
      onClose={() => setFolderDialog(null)}
      canCreate={(name) =>
        application.folderOperations.canCreate(name, folderDialog?.checkParentId ?? null)
      }
      onSubmit={async (name, icon, description) => {
        if (!folderDialog) return;
        if (!isAllowedFolderName(name)) {
          throw new Error(DISALLOWED_FOLDER_NAME_MESSAGE);
        }
        await createAndOpenFolder(
          application.folderOperations,
          name,
          await folderDialog.resolveParentId(),
          { icon, description }
        );
      }}
    />
  );

  // Where a folder made on an Assets page goes: inside the folder the page shows — or, on the
  // top-level page, inside `Assets/`, which is created first if the vault has none yet.
  const assetsParentResolver =
    (parentFolderId: string | null) => async (): Promise<string | null> =>
      parentFolderId ??
      application.membershipSelector.getAssetsStorageFolder()?.id ??
      (await application.folderOperations.create(ASSETS_DIRECTORY_NAME, null));

  // The assets one Assets page lists — only its DIRECT ones: a folder's own files, or on the top-level
  // page everything in the catalog (remote images and files elsewhere in the vault included) except the
  // files that live in a folder inside Assets/, which show in that folder instead.
  const assetsOfPage = (folderId: string | null): Asset[] =>
    application.membershipSelector
      .getAllAssets()
      .filter((asset) =>
        folderId === null
          ? !(
              asset.source === 'local' &&
              application.membershipSelector.isInAssetsSubfolder(asset.resource)
            )
          : asset.source === 'local' && asset.resource.parentId === folderId
      );

  // The body of an Assets page (top-level or a folder): same list/table/card, a folders section at the top.
  const renderAssetsBody = (props: {
    assets: readonly Asset[];
    folders: readonly CollectionEntryModel[];
    onCreate?: () => void;
    onCreateFolder?: () => void;
  }) => (
    <AssetsCollectionBody
      assets={props.assets}
      folders={props.folders}
      onCreateFolder={props.onCreateFolder}
      viewMode={collectionView.layout}
      visible={collectionView.visible}
      sort={collectionView.sort}
      resolveResourceUrl={(path) => application.resolveResourceImageUrl(path)}
      // A vault file opens in its viewer (with its actions); a remote image in the plain image overlay.
      onOpenAsset={(asset) =>
        asset.source === 'local'
          ? onOpenResource(asset.resource)
          : onOpenImageOverlay(
              { url: asset.url, alt: getResourceDisplayName(asset) },
              { onSetCoverImage: () => onSetAssetAsCover(asset.url) }
            )
      }
      onCreate={props.onCreate}
      emptyCreateLabel="Upload"
      emptyMessage={ASSETS_COLLECTION.emptyMessage}
      emptyCreateIcon="upload"
      onRenameResource={(id, name) =>
        void application.resourceOperations
          .renameResource(id, name)
          .catch((error: unknown) => toast.fail('Couldn’t rename this file', error))
      }
      // Right-click: an asset's More actions (the viewer's menu), and the folder cards' (the topbar's).
      assetMenu={(asset) =>
        buildAssetItemMenu(
          application,
          {
            onArchiveResource: (id) =>
              void archiveActions.archiveResource(id),
            onMoveResource: (id, destinationFolderId) =>
              void application.resourceOperations
                .moveResource(id, destinationFolderId)
                .catch((error: unknown) => reportMoveFailure(toast, 'file', error)),
            onRenameResource: (id, name) => application.resourceOperations.renameResource(id, name),
            onRevealResourceInFinder: revealResourceInFinder,
            onCopyResourcePath: copyResourcePath,
            onDownloadResource: downloadResourceById,
            remoteImage: coverImageActions?.remoteImage,
            onSetRemoteAsCover: onSetAssetAsCover,
          },
          asset
        )
      }
      folderMenu={collectionItemMenu}
    />
  );
  // Committed-stage only (autosave-execution-model.md §3.1) — no Gate call,
  // no persistence. Durable-stage persistence is a separate, payload-free
  // request (onRequestSave below), fired on blur.
  const onUpdateMarkdown = (pageId: string, markdown: string): void => {
    application.pageOperations.commitEdit(pageId, markdown);
  };
  // Undoing or redoing a template application also reverses or reapplies the metadata it changed — only the
  // properties still holding what the application left, never ones the user has changed since. A failure is
  // reported: the body has already moved, so the properties must not be left behind silently.
  const onMetadataHistoryStep = ({
    apply,
    expect,
  }: MetadataHistoryChange): void => {
    if (!activePageId) {
      return;
    }

    const current = vault.getPage(activePageId)?.metadata;
    const patch = current
      ? metadataPatchStillApplicable(current, apply, expect)
      : apply;

    if (Object.keys(patch).length === 0) {
      return;
    }

    void application.pageOperations
      .updateMetadata(activePageId, patch)
      .catch((error: unknown) =>
        toast.fail('Couldn’t update the note’s properties', error)
      );
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
  const onEditFolderDescription = (
    folderId: string,
    description: string
  ): void => {
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

  // The page operations below take the page's id so the topbar (the open page) and a Collection View
  // item's right-click menu (any listed note) run the very same code; `onArchive` etc. are the open
  // page's.
  const archivePage = (pageId: string): void => {
    // The open note stays on screen under its ArchivedBanner (which has its own Restore); any other, archived
    // from a list's right-click menu, leaves the list — that one offers Undo.
    void archiveActions.archivePage(pageId, { offerUndo: pageId !== activePageId });
  };
  const restorePage = (pageId: string): void => {
    void application.pageOperations
      .restore(pageId)
      .then((outcome) => {
        if (outcome.status === 'needs-destination') {
          onNeedsRestoreDestination?.({ kind: 'page', id: pageId });
          return;
        }

        if (outcome.status !== 'conflict') {
          return;
        }

        const originalPath =
          application.vault.getPage(pageId)?.metadata.originalPath;
        const date = originalPath ? VaultPath.pageName(originalPath) : '';
        setRestoreConflict({
          pageId,
          dayLabel: isValidCalendarDate(date)
            ? formatAbsoluteDate(date)
            : date,
        });
      })
      .catch((error: unknown) => toast.fail('Couldn’t restore this note', error));
  };
  const onRestore = (): void => {
    if (activePageId) {
      restorePage(activePageId);
    }
  };

  const onResolveRestoreConflict = (choice: 'inbox' | 'replace'): void => {
    if (!restoreConflict) {
      return;
    }

    const { pageId } = restoreConflict;
    setRestoreConflict(null);

    void application.pageOperations
      .restore(pageId, { onConflict: choice })
      .then((outcome) => {
        if (outcome.status === 'restored' && outcome.movedToInbox) {
          toast.show({
            text: 'Restored to Inbox',
            action: {
              label: 'Open',
              onAction: () => void application.pageOperations.open(pageId),
            },
          });
        }
      })
      .catch((error: unknown) => toast.fail('Couldn’t restore this note', error));
  };

  const deletePage = (pageId: string): void => {
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
    clearCachedEditorSession(pageId);
    // ADR-033: same rationale as clearCachedEditorSession above, applied
    // to the durable fold-state store instead of the session cache.
    application.foldStateStore.clear(pageId);
    // ADR-052: same rationale, for the note's saved References display preferences.
    application.referencesDisplayStore.clear(pageId);
    void application.pageOperations
      .delete(pageId)
      .catch((error: unknown) => toast.fail('Couldn’t delete this note', error));
  };

  const duplicatePage = (pageId: string): void => {
    void duplicateAndOpenPage(application.pageOperations, pageId).catch((error: unknown) =>
      toast.fail('Couldn’t duplicate this note', error)
    );
  };

  const restoreFolder = (folderId: string): void =>
    void application.folderOperations
      .restore(folderId)
      .catch((error: unknown) => {
        if (error instanceof RestoreNeedsDestinationError) {
          onNeedsRestoreDestination?.({ kind: 'folder', id: folderId });
          return;
        }

        toast.fail('Couldn’t restore this folder', error);
      });

  const archiveFolder = (folderId: string): void =>
    void archiveActions.archiveFolder(folderId, { offerUndo: folderId !== activeFolderId });
  const deleteFolder = (folderId: string): void =>
    void application.folderOperations
      .delete(folderId)
      .catch((error: unknown) => toast.fail('Couldn’t delete this folder', error));
  const movePage = (pageId: string, destinationFolderId: string | null): void =>
    void application.pageOperations
      .move(pageId, destinationFolderId)
      .catch((error: unknown) => reportMoveFailure(toast, 'note', error));
  const moveFolder = (folderId: string, destinationFolderId: string | null): void =>
    void application.folderOperations
      .move(folderId, destinationFolderId)
      .catch((error: unknown) => reportMoveFailure(toast, 'folder', error));

  // What the shared More actions menu runs for a resource other than the open one's own state (see
  // `buildResourceMenuOptions`): one set, used by the topbar below and by the Collection View's
  // right-click menu.
  const resourceMenuOps: ResourceMenuOps = {
    archivePage,
    restorePage,
    deletePage,
    duplicatePage,
    restoreFolder,
    archiveFolder,
    deleteFolder,
    movePage,
    moveFolder,
    notifier: toast,
    createTemplate: requestCreateTemplate,
    fail: (title, error) => toast.fail(title, error),
  };
  // A Collection View entry's right-click menu — its resource's topbar menu (see `buildCollectionItemMenu`).
  const collectionItemMenu: CollectionItemMenuResolver = (entry) =>
    buildCollectionItemMenu(application, resourceMenuOps, entry);
  // A file in the Trash: its right-click menu's Restore and Delete permanently — the same operations, and the same
  // failure reports, as the file's viewer (AppLayout): a Restore with no recorded place asks where it should go.
  const archivedResourceMenu: CollectionItemMenuResolver<VaultResource> = (resource) =>
    buildArchivedResourceItemMenu(
      application,
      {
        onRestoreResource: (resourceId) =>
          void application.resourceOperations.restoreResource(resourceId).catch((error: unknown) => {
            if (error instanceof RestoreNeedsDestinationError) {
              onNeedsRestoreDestination?.({ kind: 'asset', id: resourceId });
              return;
            }

            toast.fail('Couldn’t restore this file', error);
          }),
        onDeleteResource: (resourceId) =>
          void application.resourceOperations
            .deleteResource(resourceId)
            .catch((error: unknown) => toast.fail('Couldn’t delete this file', error)),
      },
      resource
    );

  // Shared by both the persisted-page and draft render branches below —
  // PageOperations.updateMetadata() already handles both cases itself
  // (a draft's committed cover patch promotes it via the same persistDraft
  // helper title/body commits already use), so there is no separate
  // draft-specific persistence path to wire here.
  // Where a cover added to `noteId` goes, from the app-wide default (Settings → Preferences → Cover image). A draft
  // has no page yet, so no cover and no saved position — it takes the default like any note without a cover.
  const coverLayoutFor = (noteId: string) =>
    initialCoverLayoutPatch(vault.getPage(noteId)?.metadata, application.defaultCoverPosition);

  // Returns the write, so a caller that waits (the title section's cover picker closes only once the cover is
  // applied) can; the others ignore it, as before.
  const onSetCoverImage = (url: string, credit?: CoverCredit | null): Promise<void> | false => {
    if (!activePageId) {
      return false;
    }

    const noteId = activePageId;
    const apply = (): Promise<void> =>
      // Both saved positions reset to centered alongside a new image, same
      // reasoning as onRemoveCoverImage's coverHidden reset below — a
      // position belongs to the image it was framed against, never carries
      // over to a replacement the user hasn't positioned yet.
      application.pageOperations.updateMetadata(noteId, {
        cover: url,
        // The credit belongs to the image (ADR-054): the picker's own, else one
        // already recorded for this exact URL, else cleared — never left stale.
        coverCredit: credit ?? application.findCoverCredit(url),
        coverPositionAbove: 50,
        coverPositionSide: 50,
        ...coverLayoutFor(noteId),
      });

    // Applied only once the picture has loaded: a first cover then appears whole (picture and credit together, not
    // the credit ahead of a blank), a replacement keeps the old cover and its credit until the new one is ready, and
    // a picture that cannot load leaves the note as it was instead of ending up with no cover.
    const displayUrl = application.resolveCoverImageForDisplay(url);
    if (!displayUrl) {
      return apply();
    }
    return waitForImage(displayUrl).then((loaded) => {
      if (!loaded) {
        toast.fail('Couldn’t set the cover image', new Error('The image could not be loaded.'));
        return;
      }
      return apply();
    });
  };

  // Resolves `true` once the cover is applied, `false` when it failed (already reported by the toast).
  const onSetCoverImageFromUpload = (sourcePath: string): Promise<boolean> | false => {
    if (!activePageId) {
      return false;
    }

    // Read before the import: by the time it finishes, nothing about the note's own cover has changed.
    const layout = coverLayoutFor(activePageId);

    return (async () => {
      const relativePath = await application.importCoverAsset(sourcePath);
      await application.pageOperations.updateMetadata(activePageId, {
        cover: relativePath,
        coverCredit: null,
        coverPositionAbove: 50,
        coverPositionSide: 50,
        ...layout,
      });
      return true;
    })().catch((error: unknown) => {
      toast.fail('Couldn’t set the cover image', error);
      return false;
    });
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
      coverCredit: null,
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
  const onSaveCoverPosition = (
    layout: 'side' | 'above',
    position: number
  ): void => {
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
  // above — the page header's More-actions "Change icon" entry point (unset)
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
    onSet: (noteId, url, credit) => {
      void application.pageOperations.updateMetadata(noteId, {
        ...newCoverPatch(url, credit ?? application.findCoverCredit(url)),
        ...coverLayoutFor(noteId),
      });
    },
    onSetFromUpload: (noteId, sourcePath) => {
      const layout = coverLayoutFor(noteId);

      void (async () => {
        const relativePath = await application.importCoverAsset(sourcePath);
        await application.pageOperations.updateMetadata(noteId, {
          ...newCoverPatch(relativePath),
          ...layout,
        });
      })().catch((error: unknown) => toast.fail('Couldn’t set the cover image', error));
    },
    onRemove: (noteId) => {
      void application.pageOperations.updateMetadata(noteId, {
        cover: null,
        coverCredit: null,
        coverHidden: false,
        coverPositionAbove: 50,
        coverPositionSide: 50,
      });
    },
  };

  // The Add menu's From template section: the templates come from the Templates folder (the
  // source of truth), choosing one opens a new note in `targetFolderId` with its body and the template's icon and cover, and the
  // leading "New template" row opens a new draft inside Templates (created on first use, ADR-030).
  // The one way a note is made from a template page: its body, icon and cover into a new note in
  // `targetFolderId` (createNoteFromTemplate). Shared by From template and a folder's default template.
  const createNoteFromTemplatePage = (
    targetFolderId: string | null,
    templatePageId: string
  ): void => {
    // The body as the Templates list reads it (the effective page, unsaved edits included), the icon and cover from the vault.
    const template = application.effectivePageState.getPage(templatePageId);

    if (template) {
      void createNoteFromTemplate(
        application.pageOperations,
        targetFolderId,
        template.markdown,
        vault.getPage(templatePageId)?.metadata
      )
        // Counted only once the note exists; a failure is not a use (and is logged, as an unhandled rejection was).
        .then(() => application.templateUsageStore.recordUse(templatePageId))
        .catch((error: unknown) => toast.fail('Couldn’t create the note from the template', error));
    }
  };

  // The one order every template selection surface shows — the inline suggestions, their "+N more" picker and
  // the Add menu's From template: most recently used first, a never-used template by its creation date.
  // Images/PDFs pasted into a note are kept as vault assets (Application.importPastedAsset) and embedded.
  const pasteAssets = {
    importFile: (file: { name: string; type: string }, bytes: Uint8Array) =>
      application.importPastedAsset(file.name, file.type, bytes),
    onFailed: (names: readonly string[]) =>
      toast.fail(`Couldn’t add ${names.length === 1 ? names[0] : `${names.length} pasted files`}`),
    onNotInserted: (stored: number) =>
      toast.show({
        text: `${stored === 1 ? 'Pasted file' : `${stored} pasted files`} saved to Assets, but not added to the note`,
      }),
  };

  const rankTemplates = (
    templates: readonly CollectionEntryModel[]
  ): CollectionEntryModel[] =>
    sortTemplatesByRecentUse(templates, (templateId) =>
      application.templateUsageStore.lastUsedAt(templateId)
    );

  const buildFromTemplate = (
    targetFolderId: string | null
  ): NonNullable<CollectionHeaderActionsProps['fromTemplate']> => ({
    // Creates a regular note, so the Notes preferences lead the list (the same order as its suggestions).
    getTemplates: () =>
      putPreferredTemplatesFirst(
        rankTemplates(
          toTemplateEntries(
            vault,
            application.membershipSelector,
            (_markdown, templatePageId) =>
              createNoteFromTemplatePage(targetFolderId, templatePageId)
          )
        ),
        preferredNoteTemplateIds
      ),
    onCreateTemplate: () => {
      void createTemplate(
        application.folderOperations,
        application.pageOperations
      );
    },
  });

  // Applies the template page `templatePageId` to the open note — what a "Start with template" suggestion does,
  // and what a new Daily Note's default template does on its own (applyTemplateToNote either way).
  const applyTemplateToOpenNote = (
    note: TemplateTargetNote,
    templatePageId: string
  ): void => {
    const template = application.effectivePageState.getPage(templatePageId);

    if (!template) {
      return;
    }

    void applyTemplateToNote(
      application.pageOperations,
      note.id,
      note.type,
      note.existing,
      template.markdown,
      vault.getPage(templatePageId)?.metadata,
      {
        // Through the open editor, so the body and the metadata it brought undo and redo as one step.
        applyBody: (markdown, step) => {
          const editor = editorRef.current;

          if (editor) {
            editor.applyBodyWithMetadata(markdown, step);
          } else {
            return application.pageOperations.mutateBody(
              note.id,
              (current) => (current.trim() === '' ? markdown : current)
            );
          }
        },
      }
    )
      // Counted only now that the application succeeded; a failure goes to the toast below and is not a use.
      .then(() => application.templateUsageStore.recordUse(templatePageId))
      // No focus call: the content is in the editor either way, and where the user types next is theirs to choose.
      .catch((error: unknown) => toast.fail('Couldn’t apply the template', error));
  };


  // A new Daily Note for TODAY gets the "Today's template" (Settings → Daily notes) applied by the same
  // applyTemplateToNote a "Start with template" click uses. Only today's: a note for a past or a future date — which
  // opens as an empty draft just the same — is left empty, with its suggestions. Today is the user's local calendar
  // day (isTodaysDailyNotePath), judged here, where the template is applied, not in the settings screen. Only for an
  // empty Daily Note, and only a template that is still offered — one archived, deleted or moved out of Templates is
  // skipped, never swapped for another. Preferred templates are not consulted: they order suggestions, this one is
  // applied.
  const applyDefaultDailyNoteTemplate = (note: TemplateTargetNote): void => {
    const templateId = application.preferredTemplatesStore.getDefaultDailyNoteTemplateId();

    if (
      templateId === undefined ||
      note.type !== 'daily-note' ||
      !isTodaysDailyNotePath(note.dailyNotePath) ||
      !shouldSuggestTemplates({
        type: note.type,
        markdown: note.markdown,
        isArchived: note.isArchived,
        isInTemplatesFolder: application.membershipSelector.isInTemplatesFolder(note.folderId),
      })
    ) {
      return;
    }

    const isOffered = toTemplateEntries(vault, application.membershipSelector, () => undefined).some(
      (template) => template.id === templateId
    );

    if (note.type === 'daily-note' && isOffered) {
      applyTemplateToOpenNote(note, templateId);
    }
  };

  // "Start with template" for the open note, while its body is empty: the same templates, in the same
  // order, as From template (rankTemplates), applied to THIS note (applyTemplateToNote) instead of making a new one.
  const buildTemplateSuggestions = (note: TemplateTargetNote): ReactNode => {
    if (
      !showTemplateSuggestions ||
      !shouldSuggestTemplates({
        type: note.type,
        markdown: note.markdown,
        isArchived: note.isArchived,
        isInTemplatesFolder: application.membershipSelector.isInTemplatesFolder(
          note.folderId
        ),
      })
    ) {
      return undefined;
    }

    const ranked = rankTemplates(
      toTemplateEntries(vault, application.membershipSelector, () => undefined)
    );
    // Preferred templates lead the suggestions, in their saved order — the Daily notes list for a Daily Note, the
    // Notes list for every other note; the recent-use ranking orders whatever follows them.
    const templates = putPreferredTemplatesFirst(
      ranked,
      note.type === 'daily-note' ? preferredTemplateIds : preferredNoteTemplateIds
    );

    return (
      <CurrentNoteTemplateSuggestions
        templates={templates}
        onApply={(templatePageId) => applyTemplateToOpenNote(note, templatePageId)}
        onCreateTemplate={() => {
          void createTemplate(
            application.folderOperations,
            application.pageOperations
          );
        }}
      />
    );
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
        onOpenDraftNote: (id: string) => application.pageOperations.open(id),
      }
    );

    const breadcrumbs = buildBreadcrumbs(
      folder,
      vault,
      application.membershipSelector,
      onOpenFolder
    );
    // Named (not inlined into buildTopBarActions' options below) so
    // PageCover's own "Remove" menu action can call the exact same
    // removal, not a second copy of it — see the Note/DailyNote branch's
    // top-level onRemoveCoverImage for the equivalent page-level case.
    // coverHidden resets alongside cover — see the Note/DailyNote
    // branch's onRemoveCoverImage for why.
    const onRemoveFolderCoverImage = (): void =>
      void application.folderOperations.updateMetadata(folder.id, {
        cover: null,
        coverCredit: null,
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
    const onSetFolderCoverImage = (url: string, credit?: CoverCredit | null): Promise<void> =>
      application.folderOperations.updateMetadata(folder.id, {
        cover: url,
        coverCredit: credit ?? application.findCoverCredit(url),
        coverPositionAbove: 50,
        coverPositionSide: 50,
      });
    const onSetFolderCoverImageFromUpload = (sourcePath: string): Promise<boolean> =>
      (async () => {
        const relativePath = await application.importCoverAsset(sourcePath);
        await application.folderOperations.updateMetadata(folder.id, {
          cover: relativePath,
          coverCredit: null,
          coverPositionAbove: 50,
          coverPositionSide: 50,
        });
        return true;
      })().catch((error: unknown) => {
        toast.fail('Couldn’t set the cover image', error);
        return false;
      });
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
    // The More-actions "Change icon" entry point's persistence — same
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

    const folderSystemLocationId = getSystemLocationForFolder(
      folder,
      application.membershipSelector
    );
    const onRestoreFolder = (): void => restoreFolder(folder.id);
    const topBar = buildTopBarActions(folder, {
      ...buildResourceMenuOptions(application, folder, resourceMenuOps),
      // The Archive page's page-level 'Delete all' — wired only for the Archive; every other
      // reserved folder keeps no top bar actions at all.
      ...(folderSystemLocationId === 'archive' && {
        onDeleteAll: () =>
          void deleteAllArchived(application, folder.id)
            .then((result) => {
              const message = deleteAllFailureMessage(result);
              if (message) {
                toast.fail(message, result.firstError);
              }
            })
            .catch((error: unknown) => toast.fail('Couldn’t delete the items in Archive', error)),
        archiveIsEmpty: !hasArchivedItems(application, folder.id),
      }),
    });
    // A reserved folder (Archive, Templates, Daily Notes) can't be
    // renamed or deleted — buildTopBarActions already dispatches it to
    // topBarRegistry's no-op reserved-folder renderer (no menu trigger at
    // all) via MembershipSelector.isSystemFolder, but title-editability has
    // no equivalent automatic gate, so it's checked here explicitly.
    // The shared effectively-archived policy (Phase 1): an archived folder, or one inside an archived
    // folder, is read-only — its title, icon and Add controls are not there at all.
    const isFolderArchived =
      application.membershipSelector.isEntityEffectivelyArchived(folder);
    const isRenameable =
      !application.membershipSelector.isSystemFolder(folder) &&
      !isFolderArchived;
    // A user-owned folder that can still be changed: not a reserved one, and not an archived one. An
    // archived folder keeps its title and any description as text, with no title-controls button.
    const isFolderUserEditable =
      !getSystemLocationForFolder(folder, application.membershipSelector) &&
      !isFolderArchived;
    // The Archive folder gets a resource-aware body (ArchiveCollectionBody)
    // instead of the plain folder/note-shaped CollectionBody — see that
    // component's own doc comment for why this isn't a CollectionPageModel
    // extension. Every other folder (including every other reserved one)
    // keeps the exact same CollectionBody rendering as before.
    const isArchiveView = folderSystemLocationId === 'archive';
    // Page-header-controls configuration (final UX rules): a reserved
    // folder (Archive, Templates, Daily Notes) is system-reserved —
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
    // What this folder's collection can create, and its named behavior, come from its
    // CollectionDefinition (core/presentation/collection) — the one place that says an ordinary
    // folder and Templates can create notes and folders, that Inbox, the Archive and every Daily
    // Notes level cannot, and that the Daily Notes root and a year list only folders in calendar
    // order. This page only binds what each capability DOES here.
    //
    // Create is wired to the exact same PageOperations.openDraft({ folderId }) call
    // Sidebar.Notes.tsx's own "+" row action already uses for "new note in this folder" (ADR-017
    // draft flow), not a new creation path. Shared by two entry points below: the title-adjacent
    // Button, and the collection's trailing Create row (CollectionBody's
    // onCreate) — one handler, two live controls, not two implementations. A capability the
    // definition does not declare gets no handler at all (rule 12 — never wire a live control to
    // an invented handler).
    const foldersOrder = foldersOrderOf(collectionDefinition.behavior);
    const dailyNotesFolders = foldersOrder
      ? [...model.folders].sort((a, b) =>
          foldersOrder(a.values.name, b.values.name)
        )
      : model.folders;
    // What Create DOES here is the collection's: a note in a note folder; for a folder inside Assets/ —
    // an Assets page — the file picker, importing into this folder.
    const isAssetsFolderPage = collectionDefinition.kind === 'assets';
    // A user folder's default template — only while it still resolves to a template; otherwise (unset,
    // deleted, archived) the folder's blank note is made, never a different template.
    const defaultTemplateId =
      collectionDefinition.kind === 'folder' && isFolderUserEditable
        ? resolveDefaultTemplateId(
            vault,
            application.membershipSelector,
            folder.metadata.defaultTemplateId
          )
        : null;
    const onCreate =
      collectionDefinition.actions.create && !isFolderArchived
        ? isAssetsFolderPage
          ? () => uploadAssetsInto(folder.path)
          : defaultTemplateId !== null
            ? () => createNoteFromTemplatePage(folder.id, defaultTemplateId)
            : () =>
                void application.pageOperations.openDraft({
                  folderId: folder.id,
                })
        : undefined;
    // Folders grid's "Create folder" card handler (CollectionBody's onCreateFolder) — reusing
    // FolderOperations.create()/open() via createAndOpenFolder.ts, the same create-then-open
    // shape duplicateAndOpenPage.ts already established for Duplicate. Creates as a subfolder
    // of the folder currently being viewed.
    const onCreateSubfolder =
      collectionDefinition.actions.createFolder && !isFolderArchived
        ? folderCreationTrigger(() => folder.id, folder.id)
        : undefined;
    // Where this collection's notes and folders can be dragged into a folder (a card here, a folder in the
    // sidebar, Templates): the collections that are an ordinary place to move things from. Daily Notes, the
    // Archive and an archived folder are opaque to Move; their entries stay plain.
    const moveDrag =
      !isFolderArchived &&
      (collectionDefinition.kind === 'folder' ||
        collectionDefinition.kind === 'inbox' ||
        collectionDefinition.kind === 'templates')
        ? {
            parentId: folder.id,
            actions: buildMoveDropActions(application, toast),
            // Only a folder in Manual order offers positions; a card grid's run before/after along its row, a list's above/below.
            reorder: (collectionDefinition.kind === 'folder' && levelSort?.key === 'manual'
              ? collectionView.layout === 'card'
                ? 'grid'
                : 'list'
              : undefined) as 'list' | 'grid' | undefined,
          }
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
          descriptionEditable={isFolderUserEditable}
          showDescriptionEditor={
            isFolderUserEditable && descriptionEditorRequestedIds.has(folder.id)
          }
          onDescriptionEdit={
            isFolderUserEditable
              ? (description) => onEditFolderDescription(folder.id, description)
              : undefined
          }
          onDescriptionFlush={
            isFolderUserEditable
              ? () => onFlushFolderDescription(folder.id)
              : undefined
          }
          onDescriptionCancel={
            isFolderUserEditable
              ? () =>
                  onCancelFolderDescription(
                    folder.id,
                    Boolean(folder.metadata.description)
                  )
              : undefined
          }
          onEditDescription={
            isFolderUserEditable
              ? () => onOpenDescriptionEditor(folder.id)
              : undefined
          }
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          archived={
            isFolderArchived
              ? {
                  archivedAt: folder.metadata.archivedAt,
                  onRestore: application.membershipSelector.isRestorable(folder)
                    ? onRestoreFolder
                    : undefined,
                }
              : undefined
          }
          titleActions={renderCollectionHeaderActions({
            onAdd: onCreate,
            onAddFolder: onCreateSubfolder,
            fromTemplate:
              collectionDefinition.actions.fromTemplate && !isFolderArchived
                ? buildFromTemplate(folder.id)
                : undefined,
            // Only an ordinary user folder has a default template: not a reserved, Assets or
            // Daily Notes folder (the collection kind), and not an archived one.
            defaultTemplate:
              collectionDefinition.kind === 'folder' && isFolderUserEditable
                ? {
                    currentId: defaultTemplateId,
                    onEdit: (templateId) => openNoteFromCollection(templateId),
                    onChange: (templateId) =>
                      void application.folderOperations.updateMetadata(
                        folder.id,
                        {
                          defaultTemplateId: templateId,
                        }
                      ),
                  }
                : undefined,
            ...(isAssetsFolderPage && {
              menuLabels: ASSET_MENU_LABELS,
              addLabel: 'Upload',
            }),
            // Templates are flat: one Add action, creating a template (a draft in Templates).
            ...(collectionDefinition.kind === 'templates' && {
              addLabel: 'New template',
            }),
          })}
          emoji={
            folderSystemLocationId
              ? undefined
              : (folder.metadata.icon ?? undefined)
          }
          icon={folderSystemIcon}
          showMoreActions={isFolderUserEditable}
          onSelectEmoji={
            folderSystemLocationId || isFolderArchived
              ? undefined
              : onSelectFolderEmoji
          }
          onRemoveEmoji={
            folderSystemLocationId || isFolderArchived
              ? undefined
              : onRemoveFolderEmoji
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
          coverCredit={model.coverCredit}
          onRemoveCoverImage={onRemoveFolderCoverImage}
          {...coverImageFileActions(model.coverImage)}
          coverHidden={model.coverHidden}
          onHideCoverImage={onHideFolderCoverImage}
          onShowCoverImage={onShowFolderCoverImage}
          coverLayout={model.coverLayout}
          onSetCoverLayout={onSetFolderCoverLayout}
          coverPositionAbove={model.coverPositionAbove}
          coverPositionSide={model.coverPositionSide}
          onSaveCoverPosition={onSaveFolderCoverPosition}
          coverKey={folder.id}
          coverEditable={!isFolderArchived}
          body={
            isAssetsFolderPage ? (
              renderAssetsBody({
                assets: assetsOfPage(folder.id),
                folders: model.folders,
                onCreate,
                onCreateFolder: onCreateSubfolder,
              })
            ) : isArchiveView ? (
              <ArchiveCollectionBody
                emptyMessage={ARCHIVE_COLLECTION.emptyMessage}
                folders={model.folders}
                notes={model.notes}
                viewMode={collectionView.layout}
                visible={collectionView.visible}
                sort={collectionView.sort}
                resources={archivedResources}
                archivedAtByPath={archivedAtByPath}
                resolveResourceUrl={(path) =>
                  application.resolveResourceImageUrl(path)
                }
                onOpenResource={openArchivedResourceOverlay}
                itemMenu={collectionItemMenu}
                resourceMenu={archivedResourceMenu}
              />
            ) : (
              <CollectionBody
                folders={
                  showsFolders(collectionDefinition.behavior)
                    ? dailyNotesFolders
                    : []
                }
                foldersInGivenOrder={foldersOrder !== undefined}
                entryOrder={levelEntryIds}
                showNotes={showsNotes(collectionDefinition.behavior)}
                notes={model.notes}
                viewMode={collectionView.layout}
                visible={collectionView.visible}
                sort={collectionView.sort}
                onCreateFolder={onCreateSubfolder}
                onCreate={onCreate}
                emptyCreateLabel={
                  collectionDefinition.kind === 'templates'
                    ? 'New template'
                    : 'New note'
                }
                emptyMessage={
                  isFolderArchived
                    ? ARCHIVED_FOLDER_EMPTY_MESSAGE
                    : collectionDefinition.emptyMessage
                }
                // A frozen folder's notes show their covers but offer no way to change one.
                noteCover={isFolderArchived ? undefined : noteCoverActions}
                previewResolvers={notePreviewResolvers}
                moveDrag={moveDrag}
                itemMenu={collectionItemMenu}
              />
            )
          }
        />
      {folderCreationDialog}
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
    // The collection's one Create handler, from its declared capability: for assets, the file picker
    // (into Assets/ — a folder inside it is its own page).
    const onCreate = collectionDefinition.actions.create
      ? () => uploadAssetsInto()
      : undefined;
    // Create folder: inside Assets/. Declared by the definition like every other collection's.
    const onCreateFolder = collectionDefinition.actions.createFolder
      ? folderCreationTrigger(
          assetsParentResolver(null),
          application.membershipSelector.getAssetsStorageFolder()?.id ?? null
        )
      : undefined;
    // The folders in Assets/ — each opens as an Assets page of its own.
    const assetsStorageFolder =
      application.membershipSelector.getAssetsStorageFolder();
    const assetFolders = assetsStorageFolder
      ? toCollectionPageModel(
          assetsStorageFolder,
          vault,
          application.query,
          application.effectivePageState,
          application.membershipSelector,
          workspace,
          {
            onOpenFolder,
            onOpenNote: openNoteFromCollection,
            onOpenDraftNote: (id: string) => application.pageOperations.open(id),
          }
        ).folders
      : [];

    return (
      <>
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation('assets').label}
        titleEditable={false}
        breadcrumbs={
          <Breadcrumbs items={buildSystemLocationBreadcrumbs('assets')} />
        }
        icon={getSystemLocationPresentation('assets', 'page-header').icon}
        showMoreActions={false}
        titleActions={renderCollectionHeaderActions({
          onAdd: onCreate,
          onAddFolder: onCreateFolder,
          menuLabels: ASSET_MENU_LABELS,
          addLabel: 'Upload',
        })}
        body={renderAssetsBody({
          assets: assetsOfPage(null),
          folders: assetFolders,
          onCreate,
          onCreateFolder,
        })}
      />
      {folderCreationDialog}
      </>
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
    // The page's own view (what the title, breadcrumbs and icon describe) — the tab below picks the dataset, not the page.
    const view = workspace.activeView.view.kind as Extract<
      TasksCollectionView,
      'tasks-all' | 'tasks-unscheduled'
    >;

    return (
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation(view).label}
        titleEditable={false}
        breadcrumbs={
          <Breadcrumbs items={buildSystemLocationBreadcrumbs(view)} />
        }
        icon={getSystemLocationPresentation(view, 'page-header').icon}
        showMoreActions={false}
        // On All Tasks the tab strip sits below the title (presentation only), in the title section's tabs slot.
        tabs={
          view === 'tasks-all' ? (
            <TasksTabs value={tasksTab} onValueChange={onTasksTabChange} />
          ) : undefined
        }
        titleActions={
          // Every task view is the one Task Collection: the same header actions as every collection
          // (Configure + Add), sharing one configuration; Add opens the New task dialog.
          <>
            {renderCollectionHeaderActions({
              onAdd: () => setIsNewTaskOpen(true),
              addLabel: 'New task',
              // The Tasks view's own display preferences — the same shared setting the Tasks sidebar edits.
              toggles: [
                {
                  id: 'show-completed',
                  label: 'Show completed',
                  checked: tasksViewConfig.showCompleted,
                  onChange: (showCompleted) =>
                    onTasksViewConfigChange({
                      ...tasksViewConfig,
                      showCompleted,
                    }),
                },
                {
                  id: 'auto-sort-completed',
                  label: 'Auto-sort completed',
                  checked: tasksViewConfig.autoSortCompleted,
                  onChange: (autoSortCompleted) =>
                    onTasksViewConfigChange({
                      ...tasksViewConfig,
                      autoSortCompleted,
                    }),
                },
              ],
            })}
            <NewTaskDialog
              open={isNewTaskOpen}
              onClose={() => setIsNewTaskOpen(false)}
              onCreateTask={(title, dueDate) =>
                createTaskInDailyNote(
                  {
                    vault,
                    pageOperations: application.pageOperations,
                    taskOperations: application.taskOperations,
                  },
                  title,
                  dueDate
                )
              }
            />
            {editingTask && (
              <EditTaskDialog
                task={editingTask}
                taskOperations={application.taskOperations}
                onClose={() => setEditingTask(undefined)}
              />
            )}
          </>
        }
        body={
          <TasksCollectionBody
            view={view === 'tasks-all' ? TASKS_TAB_VIEW[tasksTab] : view}
            tasks={[...vault.tasks()]}
            onToggleComplete={taskActions.toggleComplete}
            onOpenTask={(task) =>
              void application.pageOperations.open(task.sourcePageId)
            }
            onChangeDueDate={taskActions.changeDueDate}
            onEditTask={setEditingTask}
            onDuplicateTask={taskActions.duplicate}
            onDeleteTask={taskActions.remove}
            displayConfig={tasksViewConfig}
            collectionView={collectionView}
            getSource={(task) => {
              const sourcePage = vault.getPage(task.sourcePageId);

              if (!sourcePage) {
                return undefined;
              }

              const effective = application.effectivePageState.getPage(
                sourcePage.id
              );
              const { icon, emoji } = resolvePageIdentityIcon(
                sourcePage,
                effective,
                vault.isFolderWithinReservedFolder(
                  sourcePage.parentId,
                  'templates'
                )
              );

              return {
                label: getPageDisplayLabel(
                  effective ?? toPageDisplayLabelInput(sourcePage)
                ).text,
                icon,
                emoji,
              };
            }}
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
        onOpenDraftNote: (id: string) => application.pageOperations.open(id),
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
    // A tag's own emoji (Tag.icon, set from the New tag dialog or the
    // sidebar's Change icon — the same field the sidebar's tag row shows),
    // read once so the title and the breadcrumb can never disagree. Read
    // from the Vault on every render, so a changed emoji shows in both at
    // once. Workspace/Favorites have none.
    const tagEmoji =
      view.kind === 'tag'
        ? (vault.getTagByName(view.tagName)?.icon ?? undefined)
        : undefined;
    // What each filtered view can create comes from its CollectionDefinition: Workspace (the
    // vault's own root listing) a note and a folder, a Tag's notes a note, Favorites nothing —
    // Favorites is a filter, not a container, with no existing "create a note in this view" call to
    // wire to (rule 12 — never wire a live control to an invented handler). This page only binds
    // what each capability does here: a root-level PageOperations.openDraft({ folderId: null }) —
    // the exact call the sidebar's "New" shortcut already uses (buildNotesShortcutHandler.ts's
    // 'new-note' case) — for Workspace, and createNoteForTag, the same helper the Tags sidebar
    // row's "+" uses, for a Tag. Shared by the title-adjacent Button below and the notes table's
    // trailing Create row (CollectionBody's onCreate).
    const onCreate = collectionDefinition.actions.create
      ? view.kind === 'tag'
        ? () =>
            void createNoteForTag(
              application.pageOperations,
              application.tagExpansionStore,
              view.tagName
            )
        : () => void application.pageOperations.openDraft({ folderId: null })
      : undefined;
    // Folders grid's "Create folder" card handler, reusing FolderOperations.create()/open() via
    // createAndOpenFolder.ts. Creates at the vault root (parentId: null), the same root scope
    // Workspace-root's own folder listing already shows.
    const onCreateFolder = collectionDefinition.actions.createFolder
      ? folderCreationTrigger(() => null, null)
      : undefined;

    return (
      <>
      <Page
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={titleProps.title}
        description={model.description}
        titleEditable={titleProps.titleEditable}
        onTitleCommit={onTitleCommit}
        breadcrumbs={
          <Breadcrumbs
            items={buildSystemLocationBreadcrumbs(
              filteredViewSystemLocationId,
              titleProps.title,
              tagEmoji
            )}
          />
        }
        // A tag page's one top-bar action: Delete (TagOperations.deleteTag),
        // through the same menu + confirmation surface every resource's
        // More actions uses. Workspace/Favorites keep none.
        actions={
          view.kind === 'tag' ? (
            <ResourceTopBarActions
              menu={buildResourceActionMenu('tag', {}, 'topbar')}
              handlers={{
                delete: () =>
                  void createTagCollectionDeleteHandler(
                    {
                      tagOperations: application.tagOperations,
                      navigation: application.navigation,
                      workspace: application.workspace,
                      collectionViewConfigStore:
                        application.collectionViewConfigStore,
                      tagExpansionStore: application.tagExpansionStore,
                    },
                    view.tagName
                  )()
                    .then((result) => reportTagBatch(toast, result, 'delete'))
                    .catch((error: unknown) => toast.fail('Couldn’t delete the tag', error)),
              }}
              deleteConfirmationTitle={getTagDeleteConfirmationTitle(
                view.tagName
              )}
              deleteConfirmationMessage={TAG_DELETE_CONFIRMATION_MESSAGE}
            />
          ) : undefined
        }
        titleActions={renderCollectionHeaderActions({
          onAdd: onCreate,
          onAddFolder: onCreateFolder,
          fromTemplate: collectionDefinition.actions.fromTemplate
            ? buildFromTemplate(null)
            : undefined,
        })}
        // A tag's own emoji shows in the title the same way an ordinary
        // folder's metadata.icon does; the generic icon below is what shows
        // when it has none (and always for Workspace/Favorites).
        emoji={tagEmoji}
        icon={
          getSystemLocationPresentation(
            filteredViewSystemLocationId,
            'page-header'
          ).icon
        }
        // Only a tag's page is editable here: picking or removing its emoji
        // goes through TagOperations.updateMetadata (the tag's definition in
        // tags.json) and the header's existing emoji picker / More actions
        // "Emoji" item — the same controls a folder's page uses, which show
        // only the capabilities whose handler is supplied. Workspace and
        // Favorites supply none and keep no More actions.
        showMoreActions={view.kind === 'tag'}
        onSelectEmoji={
          view.kind === 'tag'
            ? (selected) =>
                void application.tagOperations.updateMetadata(view.tagName, {
                  icon: selected,
                })
            : undefined
        }
        onRemoveEmoji={
          view.kind === 'tag'
            ? () =>
                void application.tagOperations.updateMetadata(view.tagName, {
                  icon: undefined,
                })
            : undefined
        }
        body={
          <CollectionBody
            folders={model.folders}
            notes={model.notes}
            viewMode={collectionView.layout}
            visible={collectionView.visible}
            sort={collectionView.sort}
            onCreateFolder={onCreateFolder}
            onCreate={onCreate}
            emptyCreateLabel="New note"
            emptyMessage={collectionDefinition.emptyMessage}
            noteCover={noteCoverActions}
            previewResolvers={notePreviewResolvers}
            // The vault root's own collection: its folders and notes move like any other folder's.
            moveDrag={
              collectionDefinition.kind === 'workspace'
                ? { parentId: null, actions: buildMoveDropActions(application, toast) }
                : undefined
            }
            itemMenu={collectionItemMenu}
          />
        }
      />
      {folderCreationDialog}
      </>
    );
  }

  if (!session || !activePageId) {
    return null;
  }

  // The Properties section and the title's control for `target` — a saved page or a draft (which has
  // no frontmatter yet: empty metadata). Every write goes through PageOperations, which promotes a
  // draft on the first property actually written; opening the control or the picker, starting or
  // abandoning an unnamed property, never reaches it, so none of those creates the file.
  const buildPropertiesSection = (target: {
    readonly id: string;
    readonly metadata: PageMetadata;
  }) => {
    // The Properties list: the listed system properties, the custom
    // properties, and any property being added.
    // Read-only when the page is effectively archived (the shared policy): the properties stay visible,
    // but every write handler and the Add row are gone. A draft has no Vault page and is never archived.
    const vaultPage = vault.getPage(target.id);
    const isArchived = vaultPage
      ? application.membershipSelector.isEntityEffectivelyArchived(vaultPage)
      : false;
    const propertyItems = buildPageProperties(target, {
      isEffectivelyArchived: isArchived,
      // The editor's own inline-#tag click path (createTagResolver's
      // activate → navigation.openTag), not a second navigation.
      onOpenTag: (name) =>
        (isArchived
          ? createTagResolver(application.navigation, vault, {
              requireExisting: true,
            })
          : resolveTag)(name).activate(),
      getTagIcon: (name) => vault.getTagByName(name)?.icon,
      aliases: {
        // The one write path for page metadata.
        onCommit: (aliases) =>
          void application.pageOperations.updateMetadata(target.id, {
            aliases,
          }),
        getSuggestions: createAliasSuggester(vault, target.id),
      },
      onRenameProperty: (key, name) =>
        void application.pageOperations.renameCustomProperty(
          target.id,
          key,
          name
        ),
      onCommitTags: (tags) =>
        void application.pageOperations.updateMetadata(target.id, { tags }),
      getTagSuggestions,
      onRemoveListItem: (key, index, value) =>
        void application.pageOperations.removeCustomPropertyItem(
          target.id,
          key,
          index,
          value
        ),
      onCommitListValue: (key, value) =>
        void application.pageOperations.setCustomPropertyList(
          target.id,
          key,
          value
        ),
      onSetScalarValue: (key, type, value) =>
        void application.pageOperations.setCustomPropertyValue(
          target.id,
          key,
          type,
          value
        ),
      onDeleteProperty: (key) =>
        void application.pageOperations.deleteCustomProperty(target.id, key),
      onRemoveSystemProperty: (key) =>
        void application.pageOperations.removeSystemProperty(target.id, key),
      drafts: {
        items: propertyDrafts.drafts,
        // Named: the property is written now (empty, typed), and the
        // draft row stands in for it until the page shows it.
        onName: (id, name) => {
          const draft = propertyDrafts.drafts.find(
            (candidate) => candidate.id === id
          );

          if (!draft) {
            return;
          }

          propertyDrafts.name(id, name);
          void application.pageOperations
            .addCustomProperty(target.id, name, emptyCustomProperty(draft.type))
            .finally(() => propertyDrafts.remove(id));
        },
        onAbandon: propertyDrafts.remove,
      },
    });
    // The Properties section — see derivePropertiesSectionState, the one place
    // its state (displayed, add button, title control) is derived.
    const sectionState = derivePropertiesSectionState({
      lines: target.metadata.unownedFrontmatter ?? [],
      ...(target.metadata.frontmatterEntryOrder && { order: target.metadata.frontmatterEntryOrder }),
      isArchived,
      hasDraft: propertyDrafts.drafts.length > 0,
      isStarting: startingPropertyPageId === target.id,
    });
    // An unnamed draft belongs to the section being hidden: drop it, so it
    // can't reappear (and grab focus) when shown again.
    const hidePropertiesSection = (): void => {
      propertyDrafts.clear();
      setStartingPropertyPageId(null);
      void application.pageOperations.setPropertiesSectionHidden(
        target.id,
        true
      );
    };
    const requestDeleteAllProperties = (): void =>
      propertiesConfirmation.request({
        title: 'Delete all properties?',
        message:
          'All custom properties will be permanently deleted. This action cannot be undone',
        confirmLabel: 'Delete all',
        onConfirm: () => {
          propertyDrafts.clear();
          setStartingPropertyPageId(null);
          void application.pageOperations.deleteAllProperties(target.id);
        },
      });
    const addPropertyRow = sectionState.showsAddRow ? (
      <AddPropertyRow
        systemProperties={getAddableSystemProperties(target)}
        // The title's "Add a property" opens this button's menu; once it is
        // used or dismissed the transient start is over (a choice has then
        // either written the property or begun a draft, which keep the section).
        autoOpen={startingPropertyPageId === target.id}
        onDismiss={() => setStartingPropertyPageId(null)}
        onAddSystemProperty={(key) => {
          void application.pageOperations
            .addSystemProperty(target.id, key)
            .finally(() => setStartingPropertyPageId(null));
        }}
        onAddCustomProperty={(type) => {
          propertyDrafts.add(type);
          setStartingPropertyPageId(null);
        }}
        // Always listed, but disabled while there is nothing to hide or delete
        // (the first property is only being started).
        onHideProperties={hidePropertiesSection}
        onDeleteAll={requestDeleteAllProperties}
        disableActions={!sectionState.hasProperties}
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
            onStart: () => setStartingPropertyPageId(target.id),
          }
        : sectionState.control === 'show'
          ? {
              mode: 'show',
              onShow: () =>
                void application.pageOperations.setPropertiesSectionHidden(
                  target.id,
                  false
                ),
            }
          : undefined;

    return {
      propertiesControl,
      // The whole section. Displayed, it lists the properties and ends with "+ Add a property" once
      // there is one; nothing at all if there is neither.
      propertiesSection:
        sectionState.isDisplayed &&
        (propertyItems.length > 0 || addPropertyRow) ? (
          <PropertyList
            key={target.id}
            items={propertyItems}
            footer={addPropertyRow}
            // An archived page is view-only: its rows don't move. Every other order change is one
            // PageOperations write (the Gate save), including the first one on a legacy note.
            onReorder={
              isArchived
                ? undefined
                : (keys, movedKey) =>
                    void application.pageOperations.reorderProperties(
                      target.id,
                      keys,
                      movedKey
                    )
            }
          />
        ) : undefined,
    };
  };

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

    // The draft Daily Note's date (its title), when it is one — captured here so the header-controls callback below keeps the narrowing.
    const draftDailyNoteDate = draft.type === 'daily-note' && draft.title ? draft.title : undefined;
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
    // A draft has no frontmatter yet, so its Properties start empty; the first property written
    // promotes it (buildPropertiesSection).
    const draftProperties = buildPropertiesSection({
      id: activePageId,
      metadata: resolvePageMetadata({}),
    });
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
        titleEditable={isPageTitleEditable(draft.type)}
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
        // A Daily Note's title already is its date and it has its own date navigation, so it shows no
        // breadcrumbs at all (no element: the top bar leaves no gap where they would be).
        breadcrumbs={
          draft.type === 'daily-note' ? undefined : <Breadcrumbs items={draftBreadcrumbs} />
        }
        // Same page chrome as a persisted page (ADR-017 Decision item 9) —
        // archive/restore/delete render disabled, not omitted, since they
        // don't apply until this draft is actually persisted.
        actions={
          <>
            {application.membershipSelector.isInTemplatesFolder(
              draft.folderId
            ) && <Pill size="small">Editing template</Pill>}
            {draftTopBar.actions}
          </>
        }
        // A Note and a Daily Note both carry an emoji (frontmatter `icon`).
        onSelectEmoji={onSelectEmoji}
        onRemoveEmoji={onRemoveEmoji}
        // A Daily Note's calendar button sits in the controls row above its title (a visual placement experiment).
        headerControls={
          draftDailyNoteDate
            ? (menu) => (
                <DailyNoteNavControls
                  date={draftDailyNoteDate}
                  onNavigateToDate={onNavigateToDailyNote}
                  visibleControls={['calendar']}
                  calendarOpen={menu.open}
                  onCalendarOpenChange={menu.onOpenChange}
                />
              )
            : undefined
        }
        onSetCoverImage={onSetCoverImage}
        onSetCoverImageFromUpload={onSetCoverImageFromUpload}
        onRemoveCoverImage={onRemoveCoverImage}
        coverKey={activePageId}
        bodyFocusRef={editorRef}
        pageFocusRef={pageFocusRef}
        propertiesControl={draftProperties.propertiesControl}
        properties={draftProperties.propertiesSection}
        appliesHeaderSeparator
        onTitleCommit={
          isPageTitleEditable(draft.type)
            ? (title) =>
                void application.pageOperations.updateDraftTitle(
                  activePageId,
                  title
                )
            : undefined
        }
        bodyOverlay={buildTemplateSuggestions({
          id: activePageId,
          type: draft.type,
          markdown: model.markdown,
          isArchived: false,
          folderId: draft.folderId,
          existing: { tags: draft.tags },
        })}
        body={
          <>
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
                onMetadataHistoryStep={onMetadataHistoryStep}
                onFlush={() => model.requestSave()}
                onExitUp={(clientX) =>
                  pageFocusRef.current?.focusAboveBody(clientX) ?? false
                }
                resolveWikiLink={resolveWikiLink}
                getWikiLinkSuggestions={getWikiLinkSuggestions}
                getEmbedSuggestions={getEmbedSuggestions}
                getHeadingSuggestions={getHeadingSuggestions}
                resolveEmbedImage={resolveEmbedImage}
                resolveEmbedPdf={resolveEmbedPdf}
                onPdfEmbedClick={onPdfEmbedClick}
                resolvePageEmbed={resolvePageEmbed}
                onOpenPage={onOpenPage}
                resolveImageSrc={resolveImageSrc}
                pasteAssets={pasteAssets}
                resolveTag={resolveTag}
                // A new tag-definitions snapshot (an emoji changed) redraws the open tag references.
                tagResolutionRevision={vault.tagMetadataSnapshot()}
                getTagSuggestions={getTagSuggestions}
                resolveDate={resolveDate}
                onOpenImageOverlay={onOpenImageOverlay}
                onSetCoverImage={onSetCoverImage}
                onDownloadImage={downloadImageFromEditor}
                onSaveImageToVault={saveImageToVaultFromEditor}
                onDownloadPdfResource={downloadResourceById}
                resolveImageResource={resolveImageResource}
                onArchiveResource={(id) =>
                  void archiveActions.archiveResource(id)
                }
                onRevealResourceInFinder={revealResourceInFinder}
                onCopyResourcePath={copyResourcePath}
                resourceMoveDestinations={buildMoveDestinationItems(
                  application.membershipSelector,
                  undefined,
                  'assets'
                )}
                onMoveResource={(id, destinationFolderId) =>
                  void application.resourceOperations
                    .moveResource(id, destinationFolderId)
                    .catch(() => undefined)
                }
                onCreateFolder={createFolderInZone(
                  application.folderOperations,
                  application.membershipSelector,
                  'assets'
                )}
              />
            </MarkdownBody>
            {/* After the editor: effects run in tree order, and the body must go into an editor that has already been built. */}
            <DefaultTemplateOnCreate
              key={activePageId}
              apply={() =>
                applyDefaultDailyNoteTemplate({
                  id: activePageId,
                  type: draft.type,
                  markdown: model.markdown,
                  isArchived: false,
                  folderId: draft.folderId,
                  existing: { tags: draft.tags },
                  dailyNotePath: draft.deterministicPath,
                })
              }
            />
            <div className="markdown__bottom-spacer" aria-hidden="true" />
          </>
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

  const model = toResourcePageModel(
    page,
    session,
    onUpdateMarkdown,
    onRequestSave
  );
  const topBar = buildTopBarActions(page, {
    ...buildResourceMenuOptions(application, page, resourceMenuOps),
    // ADR-052: flips the note's saved Hide/Show choice (Show keeps the section visible even when empty).
    referencesHidden,
    referencesCount,
    onToggleReferences: () =>
      application.referencesDisplayStore.setHidden(page.id, !referencesHidden),
  });
  // A Daily Note's title is derived from its date and is its permanent
  // calendar identity (toResourcePageModel's own title comment) — renaming
  // it would desynchronize its filename from the deterministic path
  // DailyNoteService/Application.openFallbackPage resolve by date, so it
  // stays view-only here the same way a reserved folder's title does
  // (isRenameable above). Notes have no such constraint.
  // The shared effectively-archived policy (Phase 1): an archived note, or one inside an archived
  // folder, is read-only — no title editing, no icon change, no day navigation.
  const isPageArchived =
    application.membershipSelector.isEntityEffectivelyArchived(page);
  const isRenameable = isPageTitleEditable(page.type) && !isPageArchived;
  // An archived note is read-only throughout: its links and dates still open what EXISTS, but cannot
  // create a missing page or Daily Note, and its editor offers no way to change the document, the
  // note's cover or any embedded resource.
  const editorResolveWikiLink = isPageArchived
    ? createWikiLinkResolver(
        vault,
        application.pageOperations,
        application.folderOperations,
        application.effectivePageState,
        {
          createMissing: false,
          openPage: onOpenPage,
          openFolder: (folderId) => onOpenFolder(folderId),
          openResource: (resource, options) => onOpenResource(resource, options),
          membershipSelector: application.membershipSelector,
          resolveResourceUrl: (path) => application.resolveResourceImageUrl(path),
          onCreateFailed: reportLinkedNoteFailure,
        }
      )
    : resolveWikiLink;
  const editorResolveTag = isPageArchived
    ? createTagResolver(application.navigation, vault, {
        requireExisting: true,
      })
    : resolveTag;
  const editorResolveDate = isPageArchived
    ? createDateResolver(vault, application.pageOperations, {
        createMissing: false,
      })
    : resolveDate;
  // The editor's image click opens the overlay; for an archived note it opens the image to view only:
  // no resource id (which enables the vault file's own menu), no "set as cover", and no URL menu either.
  const editorOpenImageOverlay: typeof onOpenImageOverlay = isPageArchived
    ? (image) =>
        onOpenImageOverlay(
          { ...image, resourceId: undefined },
          { actionsEnabled: false }
        )
    : onOpenImageOverlay;
  // A PDF embed opens its viewer without the file's actions.
  const editorPdfEmbedClick = isPageArchived
    ? (path: string): void => {
        const resource = resolveResourceEmbed(vault, path);
        if (resource) {
          onOpenResource(resource, { archived: true });
        }
      }
    : onPdfEmbedClick;

  const { propertiesControl, propertiesSection } = buildPropertiesSection(page);

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
        onTitleFlush={
          isRenameable ? () => onFlushPageTitle(page.id) : undefined
        }
        onTitleCancel={
          isRenameable ? () => onCancelPageTitle(page.id) : undefined
        }
        // A Note and a Daily Note both offer "Add a description"/"Description"
        // (the header More menu offers it for both) — unlike title, description editability has no note-vs-daily-
        // note distinction.
        // An archived page shows an existing description as plain text and offers no way to add or edit
        // one, and has no title-controls (More actions) button at all.
        descriptionEditable={!isPageArchived}
        showDescriptionEditor={
          !isPageArchived && descriptionEditorRequestedIds.has(page.id)
        }
        onDescriptionEdit={
          isPageArchived
            ? undefined
            : (description) => onEditPageDescription(page.id, description)
        }
        onDescriptionFlush={
          isPageArchived ? undefined : () => onFlushPageDescription(page.id)
        }
        onDescriptionCancel={
          isPageArchived
            ? undefined
            : () =>
                onCancelPageDescription(
                  page.id,
                  Boolean(page.metadata.description)
                )
        }
        onEditDescription={
          isPageArchived ? undefined : () => onOpenDescriptionEditor(page.id)
        }
        showMoreActions={!isPageArchived}
        // A Daily Note's title already is its date and it has its own date navigation, so it shows no
        // breadcrumbs at all (no element: the top bar leaves no gap where they would be).
        breadcrumbs={page.type === 'daily-note' ? undefined : <Breadcrumbs items={breadcrumbs} />}
        archived={
          isPageArchived
            ? {
                archivedAt: page.metadata.archivedAt,
                onRestore: application.membershipSelector.isRestorable(page)
                  ? onRestore
                  : undefined,
              }
            : undefined
        }
        actions={
          <>
            {application.membershipSelector.isInTemplatesFolder(
              page.parentId
            ) && <Pill size="small">Editing template</Pill>}
            {topBar.actions}
          </>
        }
        // Page-header-controls configuration: a Note and a Daily Note are
        // both user-owned for their emoji (metadata.icon, when set, always
        // shows; More actions is hover-revealed). A Daily Note's title is
        // still its date (isRenameable above draws that line), but nothing
        // about it stops it carrying an emoji.
        emoji={page.metadata.icon ?? undefined}
        onSelectEmoji={!isPageArchived ? onSelectEmoji : undefined}
        onRemoveEmoji={!isPageArchived ? onRemoveEmoji : undefined}
        // A Daily Note's calendar button sits in the controls row above its title (a visual placement experiment).
        headerControls={
          page.type === 'daily-note' && !isPageArchived
            ? (menu) => (
                <DailyNoteNavControls
                  date={page.name}
                  onNavigateToDate={onNavigateToDailyNote}
                  visibleControls={['calendar']}
                  calendarOpen={menu.open}
                  onCalendarOpenChange={menu.onOpenChange}
                />
              )
            : undefined
        }
        onSetCoverImage={onSetCoverImage}
        onSetCoverImageFromUpload={onSetCoverImageFromUpload}
        coverImage={
          application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
        }
        coverCredit={model.coverCredit}
        onRemoveCoverImage={onRemoveCoverImage}
        {...coverImageFileActions(model.coverImage)}
        coverHidden={model.coverHidden}
        onHideCoverImage={onHideCoverImage}
        onShowCoverImage={onShowCoverImage}
        coverLayout={model.coverLayout}
        onSetCoverLayout={onSetCoverLayout}
        coverPositionAbove={model.coverPositionAbove}
        coverPositionSide={model.coverPositionSide}
        onSaveCoverPosition={onSaveCoverPosition}
        coverKey={activePageId}
        coverEditable={!isPageArchived}
        bodyFocusRef={isPageArchived ? undefined : editorRef}
        pageFocusRef={pageFocusRef}
        // An archived page is view-only: nothing can be added to it.
        propertiesControl={propertiesControl}
        properties={propertiesSection}
        appliesHeaderSeparator
        bodyOverlay={buildTemplateSuggestions({
          id: activePageId,
          type: page.type,
          markdown: model.markdown,
          isArchived: isPageArchived,
          folderId: page.parentId,
          existing: page.metadata,
        })}
        body={
          <>
            <MarkdownBody>
              <MarkdownEditor
                // Keyed by the page only: archiving or restoring an open page re-configures this editor in
                // place (its `readOnly` prop), it does not rebuild it.
                key={activePageId}
                readOnly={isPageArchived}
                // `readOnly` follows the archive only after React has rendered it; this is the same rule asked live,
                // so a keystroke in between is refused instead of reaching commitEdit (which throws for an archived page).
                canEdit={() => {
                  const current = vault.getPage(activePageId);

                  return (
                    !current ||
                    !application.membershipSelector.isEntityEffectivelyArchived(
                      current
                    )
                  );
                }}
                pageId={activePageId}
                ref={editorRef}
                markdown={model.markdown}
                focusOnOpen={focusEditorOnOpen(model.title)}
                pendingReveal={editorPendingReveal}
                onRevealApplied={onRevealHandled}
                foldStateStore={application.foldStateStore}
                onEdit={(markdown) => model.updateMarkdown(markdown)}
                onMetadataHistoryStep={onMetadataHistoryStep}
                onFlush={() => model.requestSave()}
                onExitUp={(clientX) =>
                  pageFocusRef.current?.focusAboveBody(clientX) ?? false
                }
                resolveWikiLink={editorResolveWikiLink}
                getWikiLinkSuggestions={getWikiLinkSuggestions}
                getEmbedSuggestions={getEmbedSuggestions}
                getHeadingSuggestions={getHeadingSuggestions}
                resolveEmbedImage={resolveEmbedImage}
                resolveEmbedPdf={resolveEmbedPdf}
                onPdfEmbedClick={editorPdfEmbedClick}
                resolvePageEmbed={resolvePageEmbed}
                onOpenPage={onOpenPage}
                resolveImageSrc={resolveImageSrc}
                pasteAssets={pasteAssets}
                resolveTag={editorResolveTag}
                tagResolutionRevision={vault.tagMetadataSnapshot()}
                getTagSuggestions={getTagSuggestions}
                resolveDate={editorResolveDate}
                onOpenImageOverlay={editorOpenImageOverlay}
                onSetCoverImage={isPageArchived ? undefined : onSetCoverImage}
                onDownloadImage={
                  isPageArchived ? undefined : downloadImageFromEditor
                }
                onSaveImageToVault={
                  isPageArchived ? undefined : saveImageToVaultFromEditor
                }
                onDownloadPdfResource={
                  isPageArchived ? undefined : downloadResourceById
                }
                resolveImageResource={resolveImageResource}
                onArchiveResource={
                  isPageArchived
                    ? undefined
                    : (id) =>
                        void archiveActions.archiveResource(id)
                }
                onRevealResourceInFinder={
                  isPageArchived ? undefined : revealResourceInFinder
                }
                onCopyResourcePath={
                  isPageArchived ? undefined : copyResourcePath
                }
                resourceMoveDestinations={
                  isPageArchived
                    ? undefined
                    : buildMoveDestinationItems(
                        application.membershipSelector,
                        undefined,
                        'assets'
                      )
                }
                onMoveResource={
                  isPageArchived
                    ? undefined
                    : (id, destinationFolderId) =>
                        void application.resourceOperations
                          .moveResource(id, destinationFolderId)
                          .catch(() => undefined)
                }
                onCreateFolder={
                  isPageArchived
                    ? undefined
                    : createFolderInZone(
                        application.folderOperations,
                        application.membershipSelector,
                        'assets'
                      )
                }
              />
            </MarkdownBody>
            <PageReferences
              key={page.id}
              pageId={page.id}
              vault={vault}
              pageOperations={application.pageOperations}
              displayStore={application.referencesDisplayStore}
              taskOperations={application.taskOperations}
              onRequestReveal={onRequestReveal}
              resolveWikiLink={resolveWikiLink}
              resolveTag={resolveTag}
              resolveEmbed={resolvePageEmbed}
              resolveDate={resolveDate}
              resolveEmbedImage={resolveEmbedImage}
              resolveEmbedPdf={resolveEmbedPdf}
              resolveImageSrc={resolveImageSrc}
            />
            <div className="markdown__bottom-spacer" aria-hidden="true" />
          </>
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
      <Dialog
        open={restoreConflict !== null}
        onClose={() => setRestoreConflict(null)}
        size="medium"
      >
        {restoreConflict && (
          <Confirmation
            title="Restore daily note"
            description={`A daily note for ${restoreConflict.dayLabel} already exists.\nWhat would you like to do?`}
            confirmLabel="Move to Inbox"
            confirmVariant="primary"
            alternateLabel="Replace"
            alternateVariant="danger"
            onConfirm={() => onResolveRestoreConflict('inbox')}
            onAlternate={() => onResolveRestoreConflict('replace')}
            onCancel={() => setRestoreConflict(null)}
          />
        )}
      </Dialog>
    </>
  );
}
