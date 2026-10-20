// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { writeFolderItemLimitChoice } from '@shared/helpers/folderItemLimitPreference';
import { SpaceProfileStore } from '@core/application/space/SpaceProfileStore';
import type { Folder } from '@core/vault/models/Folder';

// Same reason Application.test.ts mocks this: Application's constructor
// (via attachVault's isTauri() branch) reaches Tauri IPC with no runtime
// to answer it under vitest.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: `${ROOT}/photo.png`,
    parentId: null,
    ...overrides,
  };
}

/** The default active sidebar tab is Daily Notes — resource rows only render under the Notes tab. */
function switchToNotesTab(): void {
  fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
}

function makeApplication(resources: VaultResource[]): Application {
  const vault = new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

describe('Sidebar: opening a local resource image shows ImageOverlay More Actions', () => {
  it('clicking an image resource row opens ImageOverlay with the More Actions control (resourceId wired directly, no resolution step needed)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    const row = screen.getByText('photo');
    fireEvent.click(row);

    expect(document.querySelector('.image-overlay__img')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('opens the exact same Resource menu the Sidebar row\'s own overflow menu shows — Move to…, Reveal in Finder, Copy path, Archive, no Rename (the canonical asset actions reused, not a second menu implementation)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Move to trash')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('Copy path submenu keyboard navigation still works (preserved submenu keyboard/focus behavior)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const parentMenu = screen.getByRole('menu');

    fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Move to…
    fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Set as cover image
    fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Reveal in Finder
    fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Copy path
    fireEvent.keyDown(parentMenu, { key: 'ArrowRight' });

    const submenu = screen.getAllByRole('menu').find((menu) => menu !== parentMenu)!;
    expect(document.activeElement).toBe(submenu);
    expect(screen.getByText('From vault')).toBeInTheDocument();
    expect(screen.getByText('Full path')).toBeInTheDocument();
    expect(screen.getByText('As Markdown')).toBeInTheDocument();
  });

  it('Reveal in Finder / Archive dispatch through the real Application operations (the same primitives the row\'s own context menu already dispatches through, never a second implementation)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    const archiveSpy = vi.spyOn(application.resourceOperations, 'archiveResource');
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Move to trash'));

    expect(archiveSpy).toHaveBeenCalledWith('resource-1');
  });
});

describe('Sidebar: opening a local resource pdf shows PdfOverlay, not ImageOverlay', () => {
  it('clicking a pdf resource row opens PdfOverlay (toolbar with the resource filename), never ImageOverlay', () => {
    const resource = makeResource({ kind: 'pdf', name: 'contract.pdf' });
    const application = makeApplication([resource]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('contract'));

    expect(document.querySelector('.pdf-viewer')).not.toBeNull();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(document.querySelector('.image-overlay__img')).toBeNull();
  });

  it('closing the pdf overlay (Escape) and then opening an image resource still opens ImageOverlay — the two overlays share one discriminated state, never both open at once', () => {
    const pdf = makeResource({ id: 'resource-pdf', kind: 'pdf', name: 'contract.pdf' });
    const image = makeResource({ id: 'resource-image', kind: 'image', name: 'photo.png' });
    const application = makeApplication([pdf, image]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('contract'));
    expect(document.querySelector('.pdf-viewer')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.pdf-viewer')).toBeNull();

    fireEvent.click(screen.getByText('photo'));
    expect(document.querySelector('.image-overlay__img')).not.toBeNull();
    expect(document.querySelector('.pdf-viewer')).toBeNull();
  });

  it('has no Close ("X") control — the toolbar shows "More actions" instead, dispatching through the real ResourceOperations', () => {
    const resource = makeResource({ kind: 'pdf', name: 'contract.pdf' });
    const application = makeApplication([resource]);
    const archiveSpy = vi.spyOn(application.resourceOperations, 'archiveResource');
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('contract'));

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    const moreActions = screen.getByRole('button', { name: 'More actions' });
    expect(moreActions).toBeInTheDocument();

    fireEvent.click(moreActions);
    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Move to trash')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Move to trash'));
    expect(archiveSpy).toHaveBeenCalledWith('resource-1');
  });

  it('Escape still closes the overlay with no Close button present', () => {
    const resource = makeResource({ kind: 'pdf', name: 'contract.pdf' });
    const application = makeApplication([resource]);
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('contract'));
    expect(document.querySelector('.pdf-viewer')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.pdf-viewer')).toBeNull();
  });
});

// A sidebar resource row always represents a real, already-resolved
// VaultResource — there is no "external image" row a sidebar click could
// ever produce, unlike a Markdown `![alt](url)` image. The
// resourceId-gates-the-button behavior itself (an external/unresolved
// image never gets the control) is already covered where it's actually
// decided, ImageOverlay.test.tsx's own "is absent for an external URL"
// test — not duplicated here as a second implementation of that check.

describe('Sidebar: the Folder items setting and an opened "N more"', () => {
  const twelveFiles = () =>
    Array.from({ length: 12 }, (_, i) => {
      const name = `file-${String(i).padStart(2, '0')}.png`;
      return makeResource({ id: `r-${i}`, name, path: `${ROOT}/${name}` });
    });

  afterEach(() => localStorage.clear());

  it('puts every opened "N more" back to the new limit, so no folder is left expanded under it', () => {
    render(<AppLayout application={makeApplication(twelveFiles())} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('2 more'));
    expect(screen.getByText('Show less')).toBeInTheDocument();

    act(() => writeFolderItemLimitChoice(5));

    expect(screen.queryByText('Show less')).toBeNull();
    expect(screen.getByText('7 more')).toBeInTheDocument();
  });

  it('keeps an opened "N more" open when the limit is unchanged', () => {
    render(<AppLayout application={makeApplication(twelveFiles())} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('2 more'));
    act(() => writeFolderItemLimitChoice(10));

    expect(screen.getByText('Show less')).toBeInTheDocument();
  });
});

describe('Sidebar: the Default note location setting', () => {
  const metadata = {
    defaultTemplateId: null,
    icon: null,
    favorite: false,
    description: '',
    cover: null,
    coverHidden: false,
    coverLayout: 'side' as const,
    coverPositionAbove: 50,
    coverPositionSide: 50,
    status: 'active' as const,
    archivedAt: null,
    originalPath: null,
    originalParentId: null,
  };
  const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
    id,
    name,
    path: `${ROOT}/${name}`,
    parentId,
    metadata,
  });

  async function makeApplicationWith(savedFolderId?: string) {
    const fileSystem = new InMemoryVaultFileSystem();
    const profile = await SpaceProfileStore.load(fileSystem, ROOT);
    if (savedFolderId !== undefined) {
      await profile.setDefaultNoteFolder(savedFolderId);
    }
    const vault = new Vault(
      ROOT,
      [],
      [folder('projects', 'Projects'), folder('inbox', 'Inbox')],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder(),
      new Map(),
      []
    );
    const application = new Application(
      vault,
      fileSystem,
      new SelfWriteRegistry(),
      { toLoadableUrl: (path: string) => path },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      profile
    );
    Reflect.set(application, 'rootPath', ROOT);
    application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
    const openDraft = vi.spyOn(application.pageOperations, 'openDraft').mockResolvedValue('draft');
    return { application, openDraft };
  }

  it("the Notes sidebar's New row creates in the configured folder", async () => {
    const { application, openDraft } = await makeApplicationWith('projects');
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('New'));
    await act(async () => {});

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'projects' });
  });

  it('creates in Inbox when no folder is configured', async () => {
    const { application, openDraft } = await makeApplicationWith();
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('New'));
    await act(async () => {});

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'inbox' });
  });

  it('creates in Inbox when the configured folder is no longer a valid destination', async () => {
    const { application, openDraft } = await makeApplicationWith('gone');
    render(<AppLayout application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('New'));
    await act(async () => {});

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'inbox' });
    expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
  });
});
