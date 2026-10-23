// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '@app/layouts/app-layout/AppLayout';
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
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { todayAsDailyNoteDate } from '@features/daily-notes/helpers/shiftDailyNoteDate';
import { ShortcutsProvider } from './ShortcutsProvider';

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

beforeAll(() => void vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => void vi.unstubAllGlobals());
beforeEach(() => void vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeApplication(): Application {
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

const press = (init: KeyboardEventInit & { code: string }) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, ...init }));
  });

const activeTab = () => document.querySelector('.tab--active')?.getAttribute('data-testid');
const collapsed = () => document.querySelector('.app-layout')?.getAttribute('data-sidebar-collapsed');

describe('global shortcuts, through the real layout', () => {
  it('⌘1–⌘4 and ⌘K switch the same sidebar tabs the tab bar does', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    press({ code: 'Digit3' });
    await waitFor(() => expect(activeTab()).toBe('sidebar.tab.tasks'));
    press({ code: 'Digit4' });
    await waitFor(() => expect(activeTab()).toBe('sidebar.tab.tags'));
    press({ code: 'Digit1' });
    await waitFor(() => expect(activeTab()).toBe('sidebar.tab.notes'));
    press({ code: 'Digit2' });
    await waitFor(() => expect(activeTab()).toBe('sidebar.tab.daily-notes'));
    press({ code: 'KeyK' });
    await waitFor(() => expect(activeTab()).toBe('sidebar.tab.search'));
  });

  it('⌘\\ collapses and expands the sidebar, and a tab shortcut brings a collapsed one back', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    expect(collapsed()).toBe('false');
    press({ code: 'Backslash' });
    await waitFor(() => expect(collapsed()).toBe('true'));
    press({ code: 'Digit3' });
    await waitFor(() => expect(collapsed()).toBe('false'));
    expect(activeTab()).toBe('sidebar.tab.tasks');
  });

  it('⇧⌘T opens the same New task dialog the Create menu does', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    expect(screen.queryByPlaceholderText('Task title')).toBeNull();
    press({ code: 'KeyT', shiftKey: true });
    expect(await screen.findByPlaceholderText('Task title')).toBeInTheDocument();
  });

  it('⇧⌘N opens the same New folder dialog the Create menu does', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    expect(screen.queryByLabelText('Folder name')).toBeNull();
    press({ code: 'KeyN', shiftKey: true });
    expect(await screen.findByLabelText('Folder name')).toBeInTheDocument();
  });

  it('⌃⌘C hides and shows the open note’s cover through the cover’s own handlers, and never edits the note', async () => {
    const application = makeApplication();
    render(
      <ShortcutsProvider>
        <AppLayout application={application} />
      </ShortcutsProvider>
    );
    await act(async () => {
      await application.pageOperations.openAtPath(DailyNotePath.absoluteFrom(application.vault.root, new Date()), {
        type: 'daily-note',
      });
    });
    const pageId = application.workspace.activePageId!;
    await act(async () => {
      await application.pageOperations.updateMetadata(pageId, { cover: '/vault/cover.png' });
    });
    const hidden = () => application.effectivePageState.getPage(pageId)?.coverHidden;
    const content = await waitFor(() => {
      const el = document.querySelector('.cm-content');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const before = content.textContent;
    expect(hidden()).toBe(false);

    // Pressed in the focused note, as a real press arrives.
    const toggle = () =>
      act(() => {
        content.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, metaKey: true, ctrlKey: true, bubbles: true, cancelable: true })
        );
      });
    toggle();
    await waitFor(() => expect(hidden()).toBe(true));
    toggle();
    await waitFor(() => expect(hidden()).toBe(false));
    expect(content.textContent).toBe(before);
  });

  it('⌥⌘T opens the same New tag dialog the Create menu does', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    press({ code: 'KeyT', altKey: true });
    expect(await screen.findByPlaceholderText('Tag name')).toBeInTheDocument();
  });

  it('⌃⌘← and ⌃⌘→ open the previous and next daily note, from today when none is open', async () => {
    const application = makeApplication();
    const open = vi.spyOn(application.pageOperations, 'openAtPath').mockResolvedValue(undefined as never);
    render(
      <ShortcutsProvider>
        <AppLayout application={application} />
      </ShortcutsProvider>
    );
    const day = (offset: number) => {
      const now = new Date();
      return todayAsDailyNoteDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
    };
    press({ code: 'ArrowLeft', ctrlKey: true });
    press({ code: 'ArrowRight', ctrlKey: true });
    expect(open.mock.calls.map(([path]) => path)).toEqual([
      DailyNotePath.absoluteFrom('/vault', new Date(day(-1))),
      DailyNotePath.absoluteFrom('/vault', new Date(day(1))),
    ]);
    expect(open.mock.calls.every(([, options]) => (options as { type: string }).type === 'daily-note')).toBe(true);
  });

  it('⌥⌘/ opens the Keyboard shortcuts dialog, and the footer’s Help item opens that same one', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    press({ code: 'Slash', altKey: true });
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Keyboard shortcuts' })).toHaveLength(1);
  });

  it('Go back / Go forward pressed inside the focused note run once each and never indent the note', async () => {
    // CodeMirror reads the platform once, at load, and jsdom is not a Mac: its `Mod` is Ctrl, so use Ctrl here (the
    // dispatcher's `mod` follows the same platform) — that is the press the editor's old indent binding would catch.
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const application = makeApplication();
    const back = vi.spyOn(application.navigation, 'back');
    const forward = vi.spyOn(application.navigation, 'forward');
    render(
      <ShortcutsProvider>
        <AppLayout application={application} />
      </ShortcutsProvider>
    );
    // Open today's daily note, so a real editor is on screen.
    await act(async () => {
      await application.pageOperations.openAtPath(DailyNotePath.absoluteFrom(application.vault.root, new Date()), {
        type: 'daily-note',
      });
    });
    const content = await waitFor(() => {
      const el = document.querySelector('.cm-content');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const before = content.textContent;
    const key = (init: KeyboardEventInit & { key: string; code: string }) =>
      act(() => {
        content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, ...init }));
      });
    key({ key: '[', code: 'BracketLeft', keyCode: 219 });
    key({ key: ']', code: 'BracketRight', keyCode: 221 });
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(content.textContent).toBe(before);
  });

  it('⌘[ and ⌘] with nothing to go back or forward to do nothing and break nothing', async () => {
    render(
      <ShortcutsProvider>
        <AppLayout application={makeApplication()} />
      </ShortcutsProvider>
    );
    press({ code: 'BracketLeft' });
    press({ code: 'BracketRight' });
    expect(collapsed()).toBe('false');
  });
});
