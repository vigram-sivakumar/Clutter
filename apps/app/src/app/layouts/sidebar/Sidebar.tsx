import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useEffect, useState, type ReactNode } from 'react';
import { useFolderItemLimit } from '@shared/helpers/folderItemLimitPreference';
import { collectionViewKeyForSidebarLevel } from '@core/application/collection/collectionViewKey';
import { displayedOrderIds } from '@features/notes/sidebar/sidebarSort';
import { forgetInLevelOrder, levelOrderContextFor } from '@features/notes/sidebar/sidebarOrderActions';
import type { TaskExpansionKey } from '@features/tasks/helpers/groupTasks';
import { useTaskItemLimit } from '@shared/helpers/taskItemLimitPreference';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { TaskDisplayConfig } from '@features/tasks/helpers/groupTasks';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { getActiveDailyNoteDate } from '@features/daily-notes/helpers/getActiveDailyNoteDate';
import { shiftDailyNoteDate, todayAsDailyNoteDate } from '@features/daily-notes/helpers/shiftDailyNoteDate';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotes } from '@features/daily-notes/sidebar/Sidebar.DailyNotes';
import { Tasks } from '@features/tasks/sidebar/Sidebar.Tasks';
import { Tags } from '@features/tags/sidebar/Sidebar.Tags';
import { SearchPanel } from '@features/search/SearchPanel';
import { Controls } from '@app/layouts/sidebar/controls/Controls';
import { Footer } from './footer/Footer';
import { useNativeFileMenu } from './useNativeFileMenu';
import { useShortcutHandlers } from '@app/shortcuts/ShortcutsProvider';
import { useNativeEditMenu } from './useNativeEditMenu';
import { createLocationActions } from '@features/notes/helpers/createLocationActions';
import { useSpaces } from '@app/spaces/SpacesContext';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { RowContextMenuEnabled } from '@components/entry/EntryMenuContext';
import { NewTaskDialog } from '@features/tasks/shortcuts/NewTaskDialog';
import { EditTaskDialog } from '@features/tasks/shortcuts/EditTaskDialog';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { NewTagDialog } from '@features/tags/shortcuts/NewTagDialog';
import { NewFolderDialog } from '@features/notes/shortcuts/NewFolderDialog';
import { createAndOpenFolder } from '@features/notes/helpers/createAndOpenFolder';
import { createNote } from '@features/notes/helpers/createNote';
import { createTemplate } from '@features/notes/helpers/createTemplate';
import { uploadAssets } from '@features/notes/helpers/uploadAssets';
import { createTaskInDailyNote } from '@features/tasks/helpers/createTaskInDailyNote';
import { testIds } from '@shared/testing/selectors';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import type { SidebarTab } from '@core/application/workspace/WorkspaceSessionStore';

interface SidebarProps {
  application: Application;
  /**
   * Opens the shared resource overlay (owned by `AppLayout`, the confirmed
   * common ancestor of `Sidebar` and `PageHost`) for a real `VaultResource`
   * — routes to `ImageOverlay` or `PdfOverlay` based on `resource.kind`.
   */
  readonly onOpenResource: (resource: VaultResource) => void;
  /** See AppLayout's own doc comment on its `tasksViewConfig` state — lifted here since Sidebar's Tasks panel is one of its two consumers. */
  readonly tasksViewConfig: TaskDisplayConfig;
  readonly onTasksViewConfigChange: (next: TaskDisplayConfig) => void;
  /** See AppLayout's own doc comment on its `pendingReveal` state — set here by Tasks' "Show in note" (and by PageHost's own Tag collection "Open note"), consumed by PageHost. */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
}

export function Sidebar({
  application,
  onOpenResource,
  tasksViewConfig,
  onTasksViewConfigChange,
  onRequestReveal,
}: SidebarProps) {
  const {
    vault,
    query,
    navigation,
    pageOperations,
    folderOperations,
    resourceOperations,
    taskOperations,
    effectivePageState,
    membershipSelector,
  } = application;

  const workspace = useWorkspace(application.workspace);
  const spaces = useSpaces();
  const activeDailyNoteDate = getActiveDailyNoteDate(
    vault,
    workspace.activePageId,
    pageOperations
  );

  // "Reveal in Clutter" (Tags sidebar's note action) — purely intra-
  // Sidebar coordination between the Tags panel (producer) and the Notes
  // panel (consumer), so it lives here rather than lifted to AppLayout
  // the way pendingReveal/onRequestReveal is: Sidebar is already the
  // confirmed common ancestor of both, no sibling outside Sidebar needs
  // this. One-shot, cleared via onRevealHandled once the Notes panel has
  // applied it (same request/ack shape as PendingEditorReveal).
  const [sidebarNoteReveal, setSidebarNoteReveal] = useState<string | null>(null);
  // Tasks groups whose "N more" row was clicked. Session-only on purpose: held here (Sidebar stays
  // mounted, the Tasks panel doesn't) and never written to disk, so a restart collapses them again.
  // Same idea for the Notes tree: folders (by id, or the root key) showing all their notes/files.
  const [, setSortRevision] = useState(0);
  // A sort or order written from ANYWHERE — here, or by a drop that began in a Collection View — is drawn at once.
  useEffect(
    () => application.collectionViewConfigStore.subscribe(() => setSortRevision((revision) => revision + 1)),
    [application]
  );
  const [expandedFolders, setExpandedFolders] = useState<readonly string[]>([]);
  // A new Folder items limit applies to every folder alike: whichever ones had been opened with "N more" go back
  // to the limit, so none is left showing everything (or part of it) under a limit that no longer says so.
  const folderItemLimit = useFolderItemLimit();
  useEffect(() => setExpandedFolders((prev) => (prev.length > 0 ? [] : prev)), [folderItemLimit]);
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<readonly TaskExpansionKey[]>([]);
  // Same as the folders above: a new Tasks "Show" limit applies to every list alike, so every one opened with "N more" goes back to it.
  const taskItemLimit = useTaskItemLimit();
  useEffect(() => setExpandedTaskGroups((prev) => (prev.length > 0 ? [] : prev)), [taskItemLimit]);

  // The creation dialogs are hosted here, not inside their panels, so the top controls' menu and
  // each panel's own "New" row open the very same dialog whichever sidebar tab is mounted.
  // The task whose Edit task modal is open (Edit in a task row's menu) — the same dialog the Task Collection opens.
  const [editingTask, setEditingTask] = useState<TaskOccurrence | undefined>(undefined);
  const [creationDialog, setCreationDialog] = useState<'task' | 'tag' | 'folder' | null>(null);
  const closeCreationDialog = () => setCreationDialog(null);

  function revealNoteInNotesSidebar(pageId: string): void {
    workspace.setActiveSidebarTab('notes');
    setSidebarNoteReveal(pageId);
  }

  const tabs: Array<{
    // Typed as SidebarTab so a new tab can't be added here without also
    // being accepted as restorable by WorkspaceSessionStore (ADR-035).
    value: SidebarTab;
    icon: SystemIcon;
    emoji?: string;
    panel: ReactNode;
  }> = [
    {
      value: 'notes',
      icon: getSystemLocationPresentation('notes').icon,
      panel: (
        <Notes
          vault={vault}
          query={query}
          workspace={workspace}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          resourceOperations={resourceOperations}
          effectivePageState={effectivePageState}
          membershipSelector={membershipSelector}
          getDefaultNoteFolderId={() => application.resolveDefaultNoteFolderId()}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onOpenDraft={(pageId) => pageOperations.open(pageId)}
          onOpenResource={onOpenResource}
          expandedFolders={expandedFolders}
          getFolderSort={(parentId) => application.collectionViewConfigStore.get(collectionViewKeyForSidebarLevel(parentId))?.sidebarSort}
          getLevelOrder={(parentId) => application.collectionViewConfigStore.get(collectionViewKeyForSidebarLevel(parentId))?.sidebarOrder}
          onLevelOrderChange={(parentId, order) =>
            // A reorder makes the level Manual and stores its order in one write (ADR-055) — the same write a
            // drop from a Collection View makes.
            levelOrderContextFor(application.collectionViewConfigStore, membershipSelector).setOrder(parentId, order)
          }
          onItemLeftLevel={(parentId, kind, id) =>
            // A successful move out of `parentId`: forget the item in that level's saved order.
            forgetInLevelOrder(application.collectionViewConfigStore, parentId, kind, id)
          }
          onFolderSortChange={(folderId, sort) => {
            const stored = application.collectionViewConfigStore.get(collectionViewKeyForSidebarLevel(folderId));
            application.collectionViewConfigStore.update(collectionViewKeyForSidebarLevel(folderId), {
              sidebarSort: sort,
              // Choosing Manual restores the arrangement the user saved. Only a level with none yet starts from
              // what is drawn now, so nothing visibly jumps. (Leaving Manual never touches the saved order.)
              ...(sort.key === 'manual' && {
                sidebarOrder:
                  stored?.sidebarOrder ??
                  displayedOrderIds(membershipSelector, folderId, stored?.sidebarSort, stored?.sidebarOrder),
              }),
            });
            // The store is the source of truth; this just re-renders the tree to read it again.
            setSortRevision((revision) => revision + 1);
          }}
          onToggleFolderCap={(key) =>
            setExpandedFolders((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
            )
          }
          revealPageId={sidebarNoteReveal}
          onRevealHandled={() => setSidebarNoteReveal(null)}
        />
      ),
    },
    {
      value: 'daily-notes',
      icon: getSystemLocationPresentation('daily-notes').icon,
      panel: (
        <DailyNotes
          vault={vault}
          query={query}
          membershipSelector={membershipSelector}
          workspace={workspace}
          dailyNotesSidebarState={application.dailyNotesSidebarState}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          activeDate={activeDailyNoteDate}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenDraft={(pageId) => pageOperations.open(pageId)}
          onOpenDate={(date) =>
            pageOperations.openAtPath(
              DailyNotePath.absoluteFrom(vault.root, toDate(date)),
              { type: 'daily-note' }
            )
          }
        />
      ),
    },
    {
      value: 'tasks',
      icon: getSystemLocationPresentation('tasks').icon,
      panel: (
        <Tasks
          vault={vault}
          navigation={navigation}
          workspace={workspace}
          taskOperations={taskOperations}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          tasksViewConfig={tasksViewConfig}
          onTasksViewConfigChange={onTasksViewConfigChange}
          expandedGroups={expandedTaskGroups}
          onToggleGroup={(id) =>
            setExpandedTaskGroups((prev) =>
              prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
            )
          }
          onRequestReveal={onRequestReveal}
          onRequestNewTask={() => setCreationDialog('task')}
          onEditTask={setEditingTask}
        />
      ),
    },
    {
      value: 'tags',
      icon: getSystemLocationPresentation('tags').icon,
      panel: (
        <Tags
          vault={vault}
          navigation={navigation}
          tagOperations={application.tagOperations}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          membershipSelector={membershipSelector}
          workspace={workspace}
          tagExpansionStore={application.tagExpansionStore}
          collectionViewConfigStore={application.collectionViewConfigStore}
          onRequestReveal={onRequestReveal}
          onRequestNewTag={() => setCreationDialog('tag')}
          onRevealInNotesSidebar={revealNoteInNotesSidebar}
        />
      ),
    },
    {
      value: 'search',
      icon: getSystemLocationPresentation('search').icon,
      panel: <SearchPanel />,
    },
  ];

  // One implementation each for the Create menu and the native File menu.
  const newNote = () =>
    void createNote(folderOperations, pageOperations, application.resolveDefaultNoteFolderId()).catch(() => {});
  const openDailyNote = () =>
    void pageOperations
      .openAtPath(DailyNotePath.absoluteFrom(vault.root, new Date()), {
        type: 'daily-note',
      })
      .catch(() => {});
  const newFolder = () => setCreationDialog('folder');
  useNativeFileMenu({ onNewNote: newNote, onNewDailyNote: openDailyNote, onNewFolder: newFolder });
  // The same create actions by keyboard (shortcuts.ts). In the desktop app the File menu owns ⌘N, ⇧⌘N and ⇧⌘D, so
  // the dispatcher only handles those in the browser build; ⇧⌘T (New task) has no menu item and is always handled here.
  // Previous / next daily note step from the open Daily Note, or from today when none is open.
  const openDailyNoteBy = (days: number) =>
    void pageOperations
      .openAtPath(
        DailyNotePath.absoluteFrom(
          vault.root,
          toDate(shiftDailyNoteDate(activeDailyNoteDate ?? todayAsDailyNoteDate(), days))
        ),
        { type: 'daily-note' }
      )
      .catch(() => {});
  useShortcutHandlers({
    'new-note': newNote,
    'new-folder': newFolder,
    'new-task': () => setCreationDialog('task'),
    'new-daily-note': openDailyNote,
    'new-tag': () => setCreationDialog('tag'),
    'previous-daily-note': () => openDailyNoteBy(-1),
    'next-daily-note': () => openDailyNoteBy(1),
  });
  // The native Edit menu's "Copy Link to Current Page": the same "Copy path → As Markdown" action the page menus use,
  // on the open page. Enabled only while a page (note or daily note) is open.
  const openPage = workspace.activePageId ? vault.getPage(workspace.activePageId) : undefined;
  useNativeEditMenu(openPage !== undefined, () =>
    createLocationActions(vault.root).copyPath(openPage, 'page', 'as-markdown')
  );

  return (
    <aside className="sidebar" data-testid={testIds.sidebar.root}>
      {/* Sidebar content always stays mounted regardless of
          isSidebarVisible; nothing currently unmounts it based on that
          state. Controls no longer renders the sidebar-toggle button
          itself — see SidebarToggle (app-layout/sidebar-toggle). */}
      <Controls
        onNewNote={newNote}
        onOpenDailyNote={openDailyNote}
        onNewTask={() => setCreationDialog('task')}
        onNewFolder={newFolder}
        onNewTag={() => setCreationDialog('tag')}
        onNewTemplate={() =>
          void createTemplate(folderOperations, pageOperations).catch(() => {})
        }
        onUpload={() =>
          void uploadAssets((source, destination) =>
            application.importAsset(source, destination)
          ).catch(() => {})
        }
      />
      <div className="sidebar--tabs">
        <Tabs
          value={workspace.activeSidebarTab}
          onValueChange={(tab) => workspace.setActiveSidebarTab(tab)}
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} value={tab.value}>
              <AppIcon icon={tab.icon} emoji={tab.emoji} />
            </Tab>
          ))}
        </Tabs>
      </div>

      <RowContextMenuEnabled value>
      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === workspace.activeSidebarTab)?.panel}
      </div>
      </RowContextMenuEnabled>
      <Footer
        vaultFolderName={VaultPath.filename(vault.root)}
        spaces={spaces?.spaces}
        activeSpacePath={vault.root}
        onSwitchSpace={spaces?.onSwitchSpace}
        onNewSpace={spaces?.onAddSpace}
        onSpacesMenuOpen={spaces?.refreshAvailability}
        resolveImageUrl={spaces?.resolveAvatarImageUrl ?? ((src) => application.resolveCoverImageForDisplay(src))}
        onOpenArchive={() => navigation.openArchive()}
      />

      <NewTaskDialog
        open={creationDialog === 'task'}
        onClose={closeCreationDialog}
        onCreateTask={(title, dueDate) =>
          createTaskInDailyNote({ vault, pageOperations, taskOperations }, title, dueDate)
        }
      />
      {editingTask && (
        <EditTaskDialog task={editingTask} taskOperations={taskOperations} onClose={() => setEditingTask(undefined)} />
      )}
      <NewTagDialog
        open={creationDialog === 'tag'}
        onClose={closeCreationDialog}
        validateName={(input) => application.tagOperations.checkNewTagName(input)}
        onSubmit={(name, icon) => application.tagOperations.declare(name, { icon })}
      />
      <NewFolderDialog
        open={creationDialog === 'folder'}
        onClose={closeCreationDialog}
        canCreate={(name) => folderOperations.canCreate(name, null)}
        onSubmit={(name, icon, description) =>
          createAndOpenFolder(folderOperations, name, null, { icon, description })
        }
      />
    </aside>
  );
}
