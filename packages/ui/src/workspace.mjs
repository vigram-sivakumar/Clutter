import { EditorSession, EditingContextRegistry, sha256 } from '@clutter/core';
import { createEditorReplica, browserCodec } from '@clutter/editor/browser';
export class EditorWorkspace {
  constructor({
    client,
    spaceId,
    pageId,
    windowId,
    onStatus = () => {},
    onChanged = () => {},
    nextId = () => crypto.randomUUID(),
    viewOptions = {},
  }) {
    Object.assign(this, {
      client,
      spaceId,
      pageId,
      windowId,
      onStatus,
      onChanged,
      nextId,
      viewOptions,
    });
    this.views = new Map();
    this.mountTasks = new Set();
    this.mountTickets = new Map();
    this.bookmarks = new Map();
    this.contexts = new Map();
    this.timers = new Map();
    this.frozen = false;
    this.closing = null;
    this.safeToRelease = false;
    this.registry = new EditingContextRegistry(async (scope) => {
      const session = await EditorSession.open({
        client,
        ...scope,
        nextId,
        createReplica: (root, onLocal) =>
          createEditorReplica(
            root,
            () => {
              onLocal();
              this.schedule(scope.contextId);
            },
            nextId,
            { ...viewOptions, codec: browserCodec, canEdit: () => !this.frozen }
          ),
      });
      this.contexts.set(scope.contextId, session);
      return session;
    });
  }
  async scope(id) {
    const identity = JSON.stringify([
      this.spaceId,
      this.windowId,
      this.pageId,
      id,
    ]);
    return {
      spaceId: this.spaceId,
      pageId: this.pageId,
      contextId: 'editor_' + (await sha256(new TextEncoder().encode(identity))),
    };
  }
  mount(id, target) {
    const task = this.mountView(id, target);
    this.mountTasks.add(task);
    task.finally(() => this.mountTasks.delete(task)).catch(() => {});
    return task;
  }
  async mountView(id, target) {
    if (this.frozen || this.views.has(id)) throw Error('VIEW_NOT_AVAILABLE');
    const ticket = {};
    this.mountTickets.set(id, ticket);
    const lease = await this.registry.acquire(await this.scope(id));
    if (
      this.frozen ||
      this.views.has(id) ||
      this.mountTickets.get(id) !== ticket
    ) {
      lease.release();
      throw Error('VIEW_NOT_AVAILABLE');
    }
    try {
      const view = lease.session.mount(target);
      this.views.set(id, { view, lease });
      if (this.bookmarks.has(id))
        lease.session.restoreSelection(view, this.bookmarks.get(id));
      return view;
    } catch (e) {
      lease.release();
      throw e;
    }
  }
  unmount(id) {
    this.mountTickets.delete(id);
    const entry = this.views.get(id);
    if (!entry) return;
    this.bookmarks.set(id, entry.lease.session.captureSelection(entry.view));
    entry.view.destroy();
    entry.lease.release();
    this.views.delete(id);
  }
  async remount(id, target) {
    if (this.frozen) return;
    const old = this.views.get(id);
    if (!old) return;
    const selection = old.lease.session.captureSelection(old.view);
    this.unmount(id);
    const view = await this.mount(id, target);
    this.views.get(id).lease.session.restoreSelection(view, selection);
    view.focus();
    return view;
  }
  history(id, direction) {
    if (this.frozen) return false;
    const e = this.views.get(id);
    if (!e) return false;
    const changed = e.lease.session.history(e.view, direction, {
      preserveSelection: true,
    });
    e.view.focus();
    return changed;
  }
  schedule(contextId) {
    if (this.frozen) return;
    this.onStatus('Unsaved changes');
    clearTimeout(this.timers.get(contextId));
    this.timers.set(
      contextId,
      setTimeout(() => {
        this.timers.delete(contextId);
        this.flush().catch(() => this.onStatus('Work remains pending'));
      }, 180)
    );
  }
  async sync() {
    for (const s of this.contexts.values()) await s.sync();
    this.onChanged();
  }
  async flush() {
    for (const s of this.contexts.values()) {
      const r = await s.flush();
      if (r && !r.ok) throw Error(r.error.code);
    }
    await this.sync();
    this.onStatus('Saved');
  }
  async recover(id) {
    const s = this.contexts.get((await this.scope(id)).contextId);
    if (!s) throw Error('NO_CONTEXT');
    const r = await s.recover();
    if (!r.ok) throw Error(r.error.code);
    this.onStatus('Recovered work is ready to save');
  }
  prepareClose() {
    if (this.closing) return this.closing;
    this.frozen = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    const focused = [...this.views.values()].find((e) =>
      e.view.hasFocus()
    )?.view;
    for (const { view } of this.views.values())
      view.setProps({ editable: () => false });
    this.closing = (async () => {
      let safe = true;
      try {
        await Promise.allSettled([...this.mountTasks]);
        for (const s of this.contexts.values()) {
          await s.settle();
          if (!(await s.prepareClose())) safe = false;
        }
      } catch {
        safe = false;
      }
      if (!safe) {
        this.frozen = false;
        for (const { view } of this.views.values())
          view.setProps({ editable: () => !this.frozen });
        focused?.focus();
        this.onStatus('Cannot close: work could not be saved or protected');
      }
      this.safeToRelease = safe;
      return { safe };
    })().finally(() => {
      this.closing = null;
    });
    return this.closing;
  }
  resumeAfterRefusedClose() {
    this.frozen = false;
    this.safeToRelease = false;
    for (const { view } of this.views.values())
      view.setProps({ editable: () => !this.frozen });
  }
  // Called only after prepareClose succeeds. Unsafe sessions are never auto-disposed.
  async releaseAfterClose() {
    if (!this.frozen || !this.safeToRelease)
      throw Error('PREPARE_CLOSE_REQUIRED');
    for (const id of [...this.views.keys()]) this.unmount(id);
  }
}
