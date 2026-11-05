// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { ToastProvider } from '@components/toast/ToastProvider';
import { resetNameTakenToast } from '@components/toast/showNameTaken';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';

/**
 * Renaming a note to a title another note already has, through the real AppLayout (PageHost -> Page -> PageTitle ->
 * EditableText) over a real Application: the title field shakes (Enter) or reverts (blur), a toast says the name is
 * taken — once — and the top bar never shows "Couldn’t save changes", because nothing failed to save. A genuine
 * write failure still does.
 */
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterAll(() => vi.unstubAllGlobals());

const ROOT = '/vault';

function buildPage(name: string, id: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

let application: Application;
let fileSystem: InMemoryVaultFileSystem;

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Alpha and Beta, side by side in the vault root, with Beta open. */
async function openBeta() {
  const alpha = buildPage('Alpha', 'page-alpha');
  const beta = buildPage('Beta', 'page-beta');
  const vault = new Vault(ROOT, [alpha, beta], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  fileSystem = new InMemoryVaultFileSystem();
  for (const page of [alpha, beta]) {
    fileSystem.seedFile(page.path, `---\nid: ${page.id}\n---\nBody`);
  }
  application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  await application.pageOperations.open(beta.id);
  render(
    <ToastProvider>
      <AppLayout application={application} />
    </ToastProvider>
  );
  await flush();
  return { vault, alpha, beta };
}

const titleField = () => document.querySelector<HTMLElement>('.page-title [contenteditable]')!;
const toastTexts = () => Array.from(document.querySelectorAll('.toast__message')).map((el) => el.textContent);
const takenToasts = () => toastTexts().filter((text) => text?.includes('is already taken'));
const saveNotice = () => screen.queryByTestId('save-failure-notice');

function typeTitle(text: string) {
  const field = titleField();
  field.focus();
  field.textContent = text;
  fireEvent.input(field);
  return field;
}
const pressEnter = (field: HTMLElement) => fireEvent.keyDown(field, { key: 'Enter' });
const leave = (field: HTMLElement) => fireEvent.blur(field);

/** Lets the title channel's debounce (and anything it started) run to the end. */
async function settleTitleSave(pageId: string) {
  await act(async () => {
    await application.pageOperations.requestTitleSave(pageId);
  });
  await flush();
}

beforeEach(() => {
  resetNameTakenToast();
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
});

describe('renaming a note to a title another note already has', () => {
  it('Enter: the field shakes and keeps what was typed, a toast names the taken name once, and nothing fails to save', async () => {
    const { vault, beta } = await openBeta();

    const field = typeTitle('Alpha');
    pressEnter(field);
    await settleTitleSave(beta.id);

    expect(field.dataset.shake).toBe('true');
    expect(field.textContent).toBe('Alpha');
    expect(takenToasts()).toEqual(['The name “Alpha” is already taken']);
    expect(saveNotice()).toBeNull();
    expect(vault.getPage(beta.id)!.path).toBe(`${ROOT}/Beta.md`);
  });

  it('blur: the original title comes back, a toast names the taken name once, and nothing fails to save', async () => {
    const { vault, beta } = await openBeta();

    const field = typeTitle('Alpha');
    leave(field);
    await settleTitleSave(beta.id);

    expect(titleField().textContent).toBe('Beta');
    expect(takenToasts()).toEqual(['The name “Alpha” is already taken']);
    expect(saveNotice()).toBeNull();
    expect(vault.getPage(beta.id)!.path).toBe(`${ROOT}/Beta.md`);
    expect(application.pageOperations.getLiveTitle(beta.id)).toBeUndefined();
  });

  it('Enter and then the blur that follows it are one rejection: one toast, and the title is restored', async () => {
    const { beta } = await openBeta();

    const field = typeTitle('Alpha');
    pressEnter(field);
    leave(field);
    await settleTitleSave(beta.id);

    expect(takenToasts()).toHaveLength(1);
    expect(titleField().textContent).toBe('Beta');
    expect(saveNotice()).toBeNull();
  });

  it('is case-insensitive, like the rule itself, and ignores surrounding spaces', async () => {
    const { beta } = await openBeta();

    const field = typeTitle('  alpha ');
    pressEnter(field);
    await settleTitleSave(beta.id);

    expect(field.dataset.shake).toBe('true');
    expect(takenToasts()).toEqual(['The name “alpha” is already taken']);
    expect(saveNotice()).toBeNull();
  });

  it('a duplicate that sits unsubmitted past the autosave delay is not a save failure either', async () => {
    vi.useFakeTimers();
    try {
      const { beta } = await openBeta();

      typeTitle('Alpha');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(saveNotice()).toBeNull();
      expect(application.pageOperations.saveFailureStatus(beta.id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('what the duplicate-title handling leaves alone', () => {
  it('a new, free title renames the note: no toast, no shake, no failure', async () => {
    const { vault, beta } = await openBeta();

    const field = typeTitle('Gamma');
    pressEnter(field);
    await settleTitleSave(beta.id);

    expect(field.dataset.shake).not.toBe('true');
    expect(takenToasts()).toEqual([]);
    expect(saveNotice()).toBeNull();
    expect(vault.getPage(beta.id)!.path).toBe(`${ROOT}/Gamma.md`);
  });

  it('keeping the same title is not a duplicate of itself', async () => {
    const { beta } = await openBeta();

    const field = typeTitle('Beta');
    pressEnter(field);
    await settleTitleSave(beta.id);

    expect(takenToasts()).toEqual([]);
    expect(saveNotice()).toBeNull();
  });

  it('a genuine write failure on an ordinary title still shows “Couldn’t save changes”, and no “already taken” toast', async () => {
    const { beta } = await openBeta();
    vi.spyOn(application.pageOperations, 'rename').mockRejectedValue(new Error('disk full'));

    const field = typeTitle('Gamma');
    pressEnter(field);
    await settleTitleSave(beta.id);

    expect(saveNotice()).toHaveTextContent('Couldn’t save changes');
    expect(takenToasts()).toEqual([]);
  });
});
