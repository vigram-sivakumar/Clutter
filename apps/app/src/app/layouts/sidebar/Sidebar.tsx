import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useState, type ReactNode } from 'react';
import { ImageOverlay } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { PdfOverlay } from '@features/pdf/PdfOverlay';
import type { ResourceOverlayState } from '@app/layouts/resourceOverlay';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { getActiveDailyNoteDate } from '@features/daily-notes/helpers/getActiveDailyNoteDate';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { buildResourceMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { revealInFinder } from '@shared/helpers/revealInFinder';
import { downloadResource } from '@shared/helpers/downloadResource';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import {
  getLocationPathRepresentations,
  pickLocationPathRepresentation,
  type LocationPathFormat,
} from '@core/presentation/getLocationPathRepresentations';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotes } from '@features/daily-notes/sidebar/Sidebar.DailyNotes';
import { Tasks } from '@features/tasks/sidebar/Sidebar.Tasks';
import { Tags } from '@features/tags/sidebar/Sidebar.Tags';
import { SearchPanel } from '@features/search/SearchPanel';
import { Controls } from '@app/layouts/sidebar/controls/Controls';
import { Footer } from './footer/Footer';
import { testIds } from '@shared/testing/selectors';

interface SidebarProps {
  application: Application;
}

export function Sidebar({ application }: SidebarProps) {
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
  // Sidebar-owned instance of the same lightbox a clicked Markdown image
  // opens (MarkdownEditor.tsx's own imageOverlay state) — ImageOverlay is
  // already a plain, stateless component parameterized only by
  // { url, alt }, so mounting a second instance here is reuse, not a
  // second implementation. resolveResourceImageUrl reuses the same
  // injected CoverImageUrlResolver the cover-image path already uses.
  //
  // One discriminated ResourceOverlayState (image | pdf | null) instead of
  // two independent useStates — a click can never leave both an image and
  // a pdf overlay backing-state simultaneously non-null. PdfOverlay is a
  // second, independent mount of Overlay (see its own doc comment); this
  // does not touch ImageOverlay's existing behavior at all.
  const [resourceOverlay, setResourceOverlay] = useState<ResourceOverlayState>(
    null
  );
  function openResourceOverlay(resource: VaultResource): void {
    if (resource.kind === 'image') {
      setResourceOverlay({
        kind: 'image',
        image: {
          url: application.resolveResourceImageUrl(resource.path),
          alt: getResourceDisplayName(resource),
          resourceId: resource.id,
        },
      });
    } else {
      setResourceOverlay({ kind: 'pdf', resource });
    }
  }
  // ImageOverlay's own More Actions dispatch, for an image resource opened
  // directly from this sidebar (as opposed to clicked inside an open
  // Markdown editor, which resolves resourceId indirectly — see
  // PageHost.tsx's own onImageClickRef/resolveImageResource) — a sidebar
  // row already has the real VaultResource in hand (openResourceOverlay's
  // own `resource` param above), so `resourceId: resource.id` needs no
  // resolution step at all. Composed the same way PageHost.tsx's identical
  // ImageOverlay wiring is (revealInFinder/getLocationPathRepresentations +
  // copyTextToClipboard/ResourceOperations), a second entry point into
  // those same primitives, never a second implementation of them —
  // Sidebar.Notes.tsx's own resource row menu already dispatches through
  // the exact same primitives for its own (separate) OverflowMenu.
  function revealResourceInFinder(resourceId: string): void {
    const path = vault.getResource(resourceId)?.path;
    if (path) {
      void revealInFinder(path);
    }
  }
  function copyResourcePath(resourceId: string, format: LocationPathFormat): void {
    const resource = vault.getResource(resourceId);
    if (!resource) {
      return;
    }
    const representations = getLocationPathRepresentations(resource, 'resource', vault.root);
    const value = pickLocationPathRepresentation(representations, format);
    if (value !== null) {
      void copyTextToClipboard(value);
    }
  }
  // Same read-only, straight-from-`vault` shape as revealResourceInFinder/
  // copyResourcePath above — ImageOverlay's own More Actions Download entry
  // (image resources only).
  function downloadResourceFromOverlay(resourceId: string): void {
    const resource = vault.getResource(resourceId);
    if (resource) {
      void downloadResource(resource.path, resource.name);
    }
  }
  const activeDailyNoteDate = getActiveDailyNoteDate(
    vault,
    workspace.activePageId,
    pageOperations
  );

  const tabs: Array<{
    value: string;
    icon: SystemIcon;
    emoji?: string;
    panel: ReactNode;
  }> = [
    {
      value: 'daily-notes',
      icon: getSystemLocationPresentation('daily-notes').icon,
      panel: (
        <DailyNotes
          vault={vault}
          query={query}
          membershipSelector={membershipSelector}
          workspace={workspace}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          activeDate={activeDailyNoteDate}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
          onOpenDate={(date) =>
            pageOperations.openAtPath(
              DailyNotePath.absoluteFrom(vault.root, new Date(date)),
              { type: 'daily-note' }
            )
          }
        />
      ),
    },
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
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
          onOpenResource={openResourceOverlay}
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
        />
      ),
    },
    {
      value: 'tags',
      icon: getSystemLocationPresentation('tags').icon,
      panel: <Tags vault={vault} navigation={navigation} tagOperations={application.tagOperations} />,
    },
    {
      value: 'search',
      icon: getSystemLocationPresentation('search').icon,
      panel: <SearchPanel />,
    },
  ];

  return (
    <aside className="sidebar" data-testid={testIds.sidebar.root}>
      {/* Sidebar content always stays mounted — AppLayout is the single
          place isSidebarVisible drives layout, via its CSS Grid collapse
          (data-sidebar-collapsed), not a React unmount here. Two different
          collapse techniques for the same state would defeat the point of
          having one source of truth (ADR-021, M4). */}
      <Controls
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
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

      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === workspace.activeSidebarTab)?.panel}
      </div>
      <Footer onOpenArchive={() => navigation.openArchive()} />
      <ImageOverlay
        image={resourceOverlay?.kind === 'image' ? resourceOverlay.image : null}
        onClose={() => setResourceOverlay(null)}
        onArchiveResource={(id) => void resourceOperations.archiveResource(id)}
        onRevealResourceInFinder={revealResourceInFinder}
        onCopyResourcePath={copyResourcePath}
        onDownloadResource={downloadResourceFromOverlay}
        resourceMoveDestinations={buildResourceMoveDestinationItems(membershipSelector, query)}
        onMoveResource={(id, destinationFolderId) =>
          void resourceOperations.moveResource(id, destinationFolderId)
        }
        onCreateFolder={(name) => folderOperations.create(name, null)}
      />
      <PdfOverlay
        resource={resourceOverlay?.kind === 'pdf' ? resourceOverlay.resource : null}
        onClose={() => setResourceOverlay(null)}
        resolveResourceUrl={(path) => application.resolveResourceImageUrl(path)}
        onArchiveResource={(id) => void resourceOperations.archiveResource(id)}
        onRevealResourceInFinder={revealResourceInFinder}
        onCopyResourcePath={copyResourcePath}
        resourceMoveDestinations={buildResourceMoveDestinationItems(membershipSelector, query)}
        onMoveResource={(id, destinationFolderId) =>
          void resourceOperations.moveResource(id, destinationFolderId)
        }
        onCreateFolder={(name) => folderOperations.create(name, null)}
      />
    </aside>
  );
}
