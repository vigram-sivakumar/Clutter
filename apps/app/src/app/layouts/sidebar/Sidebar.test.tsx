// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';
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
    render(<Sidebar application={application} />);
    switchToNotesTab();

    const row = screen.getByText('photo');
    fireEvent.click(row);

    expect(document.querySelector('.image-overlay__img')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('opens the exact same Resource menu the Sidebar row\'s own overflow menu shows — Move to…, Reveal in Finder, Copy path, Archive, no Rename (buildResourceSidebarMenu reused, not a second menu implementation)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    render(<Sidebar application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('Copy path submenu keyboard navigation still works (preserved submenu keyboard/focus behavior)', () => {
    const resource = makeResource();
    const application = makeApplication([resource]);
    render(<Sidebar application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const parentMenu = screen.getByRole('menu');

    fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Move to…
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
    render(<Sidebar application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('photo'));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Archive'));

    expect(archiveSpy).toHaveBeenCalledWith('resource-1');
  });
});

describe('Sidebar: opening a local resource pdf shows PdfOverlay, not ImageOverlay', () => {
  it('clicking a pdf resource row opens PdfOverlay (toolbar with the resource filename), never ImageOverlay', () => {
    const resource = makeResource({ kind: 'pdf', name: 'contract.pdf' });
    const application = makeApplication([resource]);
    render(<Sidebar application={application} />);
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
    render(<Sidebar application={application} />);
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
    render(<Sidebar application={application} />);
    switchToNotesTab();

    fireEvent.click(screen.getByText('contract'));

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    const moreActions = screen.getByRole('button', { name: 'More actions' });
    expect(moreActions).toBeInTheDocument();

    fireEvent.click(moreActions);
    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Archive'));
    expect(archiveSpy).toHaveBeenCalledWith('resource-1');
  });

  it('Escape still closes the overlay with no Close button present', () => {
    const resource = makeResource({ kind: 'pdf', name: 'contract.pdf' });
    const application = makeApplication([resource]);
    render(<Sidebar application={application} />);
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
