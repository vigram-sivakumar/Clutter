// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isolateHistory,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { Application } from '@core/application/Application';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { contentIdentity } from '@core/shared/identity/textFingerprint';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { Vault } from '@core/vault/models/Vault';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { InMemoryAtomicVaultWriter } from '@core/vault/testing/InMemoryAtomicVaultWriter';
import { AtomicWriteFileSystem } from '@core/vault/atomicWrite/AtomicWriteFileSystem';
import {
  captureEditorHistory,
  createEditorView,
  syncMarkdownIntoView,
} from './createEditorView';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const ID = 'shared-note';
const PATH = `${ROOT}/Shared.md`;
const BASE = 'first\nmiddle\nlast';
const windows: WindowUnderTest[] = [];
/**
 * Phase 0 integration, NOT a native-window test. Two real Applications and editor views share simulated disk;
 * each has its own Vault, DocumentRegistry, navigation, persistence adapter and history. The explicit reconcile
 * call substitutes only for native watcher delivery. It does not prove WKWebView/IPC, native CAS or durability.
 */
class WindowUnderTest {
  readonly app: Application;
  readonly view: EditorView;
  private readonly unsubscribe: () => void;

  constructor(disk: InMemoryVaultFileSystem, body = BASE) {
    const page = (id: string, name: string, markdown: string) =>
      new PageBuilder().build({
        parentId: null,
        page: {
          path: `${ROOT}/${name}.md`,
          directoryPath: ROOT,
          frontmatter: { id },
          frontmatterAnalysis: { aliases: [] },
          content: markdown,
          sourceFingerprint: contentIdentity(
            `---\nid: ${id}\n---\n${markdown}`
          ),
          analysis: {
            headings: [],
            blockReferences: [],
            tasks: [],
            tags: [],
            links: [],
            embeds: [],
          },
        },
      });
    const vault = new Vault(
      ROOT,
      [page(ID, 'Shared', body), page('other-note', 'Other', 'other')],
      [],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );
    const fs = new AtomicWriteFileSystem(
      disk,
      new InMemoryAtomicVaultWriter(disk)
    );
    this.app = new Application(vault, fs, new SelfWriteRegistry());
    this.app.attachVault(
      vault,
      new PageCreator(new UuidGenerator(), new PageFactory()),
      new DailyNoteService()
    );
    // Match PageOperations.open's baseline without introducing startup Daily Notes or a native watcher.
    const session = this.app.documentRegistry.open(ID, body);
    session.diskFingerprint = vault.getPage(ID)!.sourceFingerprint;
    this.app.workspace.openPage(ID);
    const parent = document.body.appendChild(document.createElement('div'));
    this.view = createEditorView({
      parent,
      doc: body,
      onDocChange: (markdown) =>
        this.app.pageOperations.commitEdit(ID, markdown),
    });
    this.unsubscribe = session.subscribe(() =>
      syncMarkdownIntoView(this.view, session.currentRevision.markdown)
    );
    windows.push(this);
  }

  edit(from: number, to: number, insert: string) {
    this.view.dispatch({
      changes: { from, to, insert },
      annotations: [
        Transaction.userEvent.of('input.type'),
        isolateHistory.of('full'),
      ],
    });
  }
  async save() {
    await this.app.pageOperations.requestSave(ID);
  }
  async receive(path = PATH) {
    await this.app.vaultSyncService.reconcileKnownPath(path);
  }
  text() {
    return this.view.state.doc.toString();
  }
  dispose() {
    this.unsubscribe();
    this.app.saveCoordinator.cancelAllTimers();
    this.app.vaultSyncService.dispose();
    this.app.effectivePageState.dispose();
    this.app.documentRegistry.clear();
    this.view.dom.parentElement?.remove();
    this.view.destroy();
  }
}

function world() {
  const disk = new InMemoryVaultFileSystem({
    [PATH]: `---\nid: ${ID}\n---\n${BASE}`,
    [`${ROOT}/Other.md`]: '---\nid: other-note\n---\nother',
  });
  return { disk, a: new WindowUnderTest(disk), b: new WindowUnderTest(disk) };
}

afterEach(() => {
  windows.splice(0).forEach((window) => window.dispose());
});

describe('ADR-073 Phase 0 — real Application / editor integration on simulated disk', () => {
  it('keeps navigation, selection and document sessions independent', async () => {
    const { a, b } = world();
    a.view.dispatch({ selection: { anchor: 2 } });
    b.view.dispatch({ selection: { anchor: 8 } });
    await a.app.pageOperations.open('other-note');
    expect(a.app.workspace.activePageId).toBe('other-note');
    expect(b.app.workspace.activePageId).toBe(ID);
    expect(a.app.workspace.canNavigateBack).toBe(true);
    expect(b.app.workspace.canNavigateBack).toBe(false);
    a.app.navigation.back();
    expect(a.app.workspace.activePageId).toBe(ID);
    expect(a.app.workspace.canNavigateForward).toBe(true);
    expect(b.app.workspace.canNavigateForward).toBe(false);
    expect(a.view.state.selection.main.head).toBe(2);
    expect(b.view.state.selection.main.head).toBe(8);
    expect(a.app.documentRegistry.get(ID)).not.toBe(
      b.app.documentRegistry.get(ID)
    );
  });

  it('propagates a save to a clean peer without a feedback save or a peer undo step', async () => {
    const { a, b } = world();
    a.edit(0, 0, 'A: ');
    await a.save();
    await b.receive();
    expect(b.text()).toBe(`A: ${BASE}`);
    expect(b.app.documentRegistry.get(ID)?.isDirty).toBe(false);
    expect(undoDepth(a.view.state)).toBe(1);
    expect(undoDepth(b.view.state)).toBe(0);
    expect(undo(b.view)).toBe(false);
  });

  it('undoes and redoes only this window’s edit after a non-overlapping peer edit', async () => {
    const { a, b, disk } = world();
    a.edit(0, 0, 'A: ');
    await a.save();
    await b.receive();
    b.edit(b.text().length, b.text().length, '\nB');
    await b.save();
    await a.receive();
    expect(a.text()).toBe(`A: ${BASE}\nB`);
    expect(undo(a.view)).toBe(true);
    expect(a.text()).toBe(`${BASE}\nB`);
    await a.save();
    await b.receive();
    expect(b.text()).toBe(`${BASE}\nB`);
    expect(undoDepth(b.view.state)).toBe(1);
    expect(redoDepth(a.view.state)).toBe(1);
    expect(redo(a.view)).toBe(true);
    expect(a.text()).toBe(`A: ${BASE}\nB`);
    await a.save();
    await b.receive();
    expect(undo(b.view)).toBe(true);
    expect(b.text()).toBe(`A: ${BASE}`);
    await b.save();
    await a.receive();
    expect(a.text()).toBe(`A: ${BASE}`);
    expect(new FrontmatterParser().parse(await disk.readFile(PATH)).body).toBe(
      `A: ${BASE}`
    );
  });

  it('maps each window’s selection through an incoming edit', async () => {
    const { a, b } = world();
    b.view.dispatch({ selection: { anchor: 6, head: 12 } });
    a.edit(0, 0, 'A: ');
    await a.save();
    await b.receive();
    expect(b.view.state.selection.main.anchor).toBe(9);
    expect(b.view.state.selection.main.head).toBe(15);
    expect(a.view.state.selection.main.empty).toBe(true);
  });

  it('preserves a pending redo through an unrelated peer edit', async () => {
    const { a, b } = world();
    a.edit(0, 0, 'A: ');
    await a.save();
    await b.receive();
    expect(undo(a.view)).toBe(true);
    await a.save();
    await b.receive();
    b.edit(b.text().length, b.text().length, '\nB');
    await b.save();
    await a.receive();
    expect(redoDepth(a.view.state)).toBe(1);
    expect(redo(a.view)).toBe(true);
    expect(a.text()).toBe(`A: ${BASE}\nB`);
    expect(undoDepth(b.view.state)).toBe(1);
  });

  it('protects a dirty peer instead of replacing unsaved work or overwriting the newer disk body', async () => {
    const { a, b, disk } = world();
    a.edit(0, 0, 'A: ');
    b.edit(0, 0, 'B: ');
    await a.save();
    await b.receive();
    expect(b.text()).toBe(`B: ${BASE}`);
    expect(b.app.documentRegistry.get(ID)?.isDirty).toBe(true);
    await b.save();
    expect(b.app.documentRegistry.get(ID)?.isDirty).toBe(true);
    expect(b.text()).toBe(`B: ${BASE}`);
    expect(new FrontmatterParser().parse(await disk.readFile(PATH)).body).toBe(
      `A: ${BASE}`
    );
  });

  it('converges three Applications without sharing their histories', async () => {
    const { a, b, disk } = world();
    const c = new WindowUnderTest(disk);
    a.edit(0, 0, 'A: ');
    await a.save();
    await Promise.all([b.receive(), c.receive()]);
    expect([a.text(), b.text(), c.text()]).toEqual(Array(3).fill(`A: ${BASE}`));
    expect([a, b, c].map(({ view }) => undoDepth(view.state))).toEqual([
      1, 0, 0,
    ]);
  });

  it('follows a note rename by identity without navigating another window', async () => {
    const { a, b } = world();
    await a.app.pageOperations.rename(ID, 'Renamed');
    const renamed = a.app.vault.getPage(ID)!.path;
    expect(renamed).not.toBe(PATH);
    await b.receive(renamed);
    await b.receive(PATH);
    expect(b.app.vault.getPage(ID)?.path).toBe(renamed);
    expect(b.app.workspace.activePageId).toBe(ID);
    expect(b.text()).toBe(BASE);
    expect(b.app.workspace.canNavigateBack).toBe(false);
  });

  it('preserves unrelated local undo through a multi-hunk peer update', async () => {
    const { a, b } = world();
    a.edit(6, 12, 'MIDDLE');
    await a.save();
    await b.receive();
    expect(undoDepth(a.view.state)).toBe(1);
    // Two separate B edits surround A’s edit, leaving A’s text unchanged.
    b.edit(0, 5, 'FIRST');
    b.edit(b.text().lastIndexOf('last'), b.text().length, 'LAST');
    await b.save();
    await a.receive();
    expect(a.text()).toBe('FIRST\nMIDDLE\nLAST');
    // Regression: a single broad replacement used to append the old middle at the end.
    expect(undo(a.view)).toBe(true);
    expect(a.text()).toBe('FIRST\nmiddle\nLAST');
    expect(undoDepth(b.view.state)).toBe(2);
  });

  it('does not let undo restore content that a peer replaced in the same range', async () => {
    const { a, b } = world();
    a.edit(6, 12, 'MIDDLE');
    await a.save();
    await b.receive();
    b.edit(6, 12, 'peer');
    await b.save();
    await a.receive();
    expect(a.text()).toBe('first\npeer\nlast');
    // Conservative v1 contract: an obsolete overlapping inverse is unavailable, never reinserted elsewhere.
    expect(undo(a.view)).toBe(false);
    expect(a.text()).toBe('first\npeer\nlast');
  });

  it('preserves cached local history after an unrelated peer edit while the editor was unmounted', async () => {
    const { a, b } = world();
    a.edit(0, 0, 'A: ');
    await a.save();
    await b.receive();
    // The same capture/restore boundary used by MarkdownEditor when switching notes. No native window is simulated.
    const cached = captureEditorHistory(a.view);
    b.edit(b.text().length, b.text().length, '\nB');
    await b.save();
    const parent = document.body.appendChild(document.createElement('div'));
    const reopened = createEditorView({
      parent,
      doc: b.text(),
      restoreHistory: cached,
    });
    try {
      expect(undo(reopened)).toBe(true);
      expect(reopened.state.doc.toString()).toBe(`${BASE}\nB`);
    } finally {
      reopened.destroy();
      parent.remove();
    }
  });
});
