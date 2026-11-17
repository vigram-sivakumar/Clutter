import { EditorWorkspace } from './workspace.mjs';
import { WindowNavigation } from './navigation.mjs';
/** Window-local navigation/lifecycle. Core owns accepted page content. */
export class WindowWorkspace {
  constructor({
    client,
    spaceId,
    windowId,
    changed = () => {},
    nextId = () => crypto.randomUUID(),
    stateStore = null,
  }) {
    Object.assign(this, {
      client,
      spaceId,
      windowId,
      changed,
      nextId,
      stateStore,
    });
    this.navigation = new WindowNavigation(nextId);
    this.editors = new Map();
    this.pages = [];
    this.next = undefined;
    this.status = 'Connecting…';
    this.ready = !stateStore;
    this.busy = false;
    this.navigationBusy = false;
    this.navigationError = false;
    this.focusTarget = 'editor';
    this.focusRevision = 0;
    this.recoveryEpoch = 0;
    this.frozen = false;
    this.pendingCreate = null;
    this.creating = null;
    this.loading = null;
    this.closing = null;
    this.navigationTask = null;
    this.registeredViews = new Set();
    this.layoutRevision = 0;
    this.pendingLayout = null;
    this.layoutTail = Promise.resolve();
  }
  get pageId() {
    return this.navigation.page();
  }
  get canSelectView() {
    return (
      this.ready &&
      !this.frozen &&
      !this.busy &&
      !this.navigationBusy &&
      !this.pendingCreate
    );
  }
  get canNavigate() {
    return this.canSelectView && !this.navigationError;
  }
  references(value) {
    return value.tabs.flatMap((tab) =>
      tab.panes.flatMap((pane) =>
        pane.visited.map((pageId) => JSON.stringify([tab.id, pane.id, pageId]))
      )
    );
  }
  get layoutRegistered() {
    if (!this.stateStore) return true;
    const tab = this.navigation.activeTab;
    return (
      !tab ||
      tab.panes.every((pane) =>
        this.registeredViews.has(
          JSON.stringify([tab.id, pane.id, this.navigation.page(pane)])
        )
      )
    );
  }
  notify(status) {
    if (
      status === 'Saved' &&
      [...this.editors.values()].some((e) =>
        [...e.contexts.values()].some((s) => s.dirty)
      )
    )
      status = 'Work remains pending';
    if (this.navigationError && status === 'Saved')
      status = 'Content saved; navigation needs retry';
    if (status !== undefined) this.status = status;
    this.changed();
  }
  async list(more = false) {
    const r = await this.client.execute({
      apiVersion: 1,
      method: 'page.list',
      spaceId: this.spaceId,
      limit: 50,
      ...(more && this.next ? { afterId: this.next } : {}),
    });
    if (!r.ok) throw Error(r.error.code);
    this.pages = more ? [...this.pages, ...r.value.pages] : r.value.pages;
    this.next = r.value.next;
    this.changed();
  }
  start() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      let value = null;
      if (this.stateStore) {
        const record = await this.stateStore.load();
        if (
          !record ||
          !Number.isSafeInteger(record.revision) ||
          record.revision < 0 ||
          !(
            (record.value === null && record.revision === 0) ||
            (typeof record.value === 'string' && record.revision > 0)
          )
        )
          throw Error('INVALID_WINDOW_STATE');
        this.layoutRevision = record.revision;
        value = record.value;
        if (value !== null)
          this.navigation = new WindowNavigation(
            this.nextId,
            JSON.parse(value)
          );
      }
      if (value !== null)
        this.registeredViews = new Set(
          this.references(this.navigation.snapshot())
        );
      await this.list();
      if (value === null) {
        if (this.pages.length) this.navigation.open(this.pages[0].pageId);
        await this.checkpoint();
      }
      this.ready = true;
      this.notify('Ready');
    })();
    return this.loading;
  }
  checkpoint() {
    if (!this.stateStore) return Promise.resolve();
    const value = JSON.stringify(this.navigation.snapshot());
    const record =
      this.pendingLayout?.value === value
        ? this.pendingLayout
        : { revision: ++this.layoutRevision, value };
    this.pendingLayout = record;
    const task = this.layoutTail.then(async () => {
      const r = await this.stateStore.save(record);
      if (r?.revision !== record.revision)
        throw Error('WINDOW_STATE_NOT_CONFIRMED');
      this.registeredViews = new Set(this.references(JSON.parse(record.value)));
      if (this.pendingLayout === record) this.pendingLayout = null;
    });
    this.layoutTail = task.catch(() => {});
    return task;
  }
  navigate(change) {
    if (!this.canNavigate) return Promise.resolve(false);
    let changed;
    try {
      changed = change();
    } catch {
      this.notify('This development layout has reached its navigation limit.');
      return Promise.resolve(false);
    }
    this.focusTarget = 'editor';
    this.focusRevision++;
    if (!changed) {
      this.changed();
      return Promise.resolve(true);
    }
    // Register view identities/history before opening an editable context.
    return this.commitNavigation();
  }
  commitNavigation() {
    const recovering = this.navigationError;
    this.navigationBusy = true;
    this.changed();
    this.navigationTask = this.checkpoint()
      .then(() => {
        this.navigationError = false;
        if (recovering) this.notify('Navigation saved');
        return true;
      })
      .catch(() => {
        this.navigationError = true;
        this.notify(
          'Could not save navigation. Retry navigation before continuing.'
        );
        return false;
      })
      .finally(() => {
        this.navigationBusy = false;
        this.navigationTask = null;
        this.changed();
      });
    return this.navigationTask;
  }
  retryNavigation() {
    if (!this.ready || this.frozen || this.navigationBusy || this.busy)
      return Promise.resolve(false);
    return this.commitNavigation();
  }
  open(pageId) {
    return this.navigate(() => this.navigation.open(pageId));
  }
  openInNewTab(pageId) {
    return this.navigate(() => this.navigation.newTab(pageId));
  }
  openInSplit(pageId) {
    return this.navigate(() => this.navigation.split(pageId));
  }
  back() {
    return this.navigate(() => this.navigation.travel(-1));
  }
  forward() {
    return this.navigate(() => this.navigation.travel(1));
  }
  selectTab(id, focusEditor = true) {
    if (!this.canSelectView) return;
    this.navigation.selectTab(id);
    this.focusTarget = focusEditor ? 'editor' : 'tabs';
    this.focusRevision++;
    this.changed();
  }
  selectPane(tabId, paneId, editorFocus = false) {
    if (!this.canSelectView) return;
    this.focusTarget = editorFocus ? 'editor' : null;
    if (this.navigation.selectPane(tabId, paneId)) this.changed();
  }
  editor(pageId) {
    if (!this.editors.has(pageId)) {
      const e = new EditorWorkspace({
        client: this.client,
        spaceId: this.spaceId,
        pageId,
        windowId: this.windowId,
        nextId: this.nextId,
        onStatus: (status) => this.notify(status),
      });
      if (this.frozen) e.freeze();
      this.editors.set(pageId, e);
    }
    return this.editors.get(pageId);
  }
  create() {
    if (
      !this.ready ||
      this.frozen ||
      this.navigationBusy ||
      this.navigationError
    )
      return Promise.resolve();
    if (this.creating) return this.creating;
    if (!this.pendingCreate) {
      this.createTarget = this.navigation.location();
      this.pendingCreate = {
        apiVersion: 1,
        method: 'page.create',
        spaceId: this.spaceId,
        pageId: this.nextId(),
        operationId: this.nextId(),
        kind: 'note',
        title: 'Untitled',
        body: {
          format: 'clutter.pm-json',
          schemaVersion: 1,
          value: {
            type: 'doc',
            content: [{ type: 'paragraph', attrs: { blockId: this.nextId() } }],
          },
        },
        properties: {},
      };
    }
    const command = this.pendingCreate;
    this.busy = true;
    this.notify('Creating…');
    this.creating = (async () => {
      const result = await this.client.execute(command);
      if (!result.ok) {
        if (result.error.code !== 'OUTCOME_UNKNOWN') this.pendingCreate = null;
        this.notify(
          this.pendingCreate
            ? 'Creation not confirmed. Retry creation.'
            : 'Could not create page: ' + result.error.code
        );
        return;
      }
      this.pendingCreate = null;
      this.navigation.open(command.pageId, this.createTarget);
      this.focusTarget = 'editor';
      this.focusRevision++;
      await this.commitNavigation();
      if (!this.navigationError) this.notify('Saved');
      await this.list();
    })()
      .catch(() =>
        this.notify('Could not refresh pages. Your saved work is retained.')
      )
      .finally(() => {
        this.busy = false;
        this.creating = null;
        this.changed();
      });
    return this.creating;
  }
  async sync() {
    if (this.frozen) return;
    for (const e of this.editors.values()) await e.sync();
  }
  async save() {
    if (this.frozen || !this.ready) return;
    this.notify('Saving…');
    try {
      await this.navigationTask;
      await this.checkpoint();
      this.navigationError = false;
      for (const e of this.editors.values()) await e.flush();
      this.notify('Saved');
    } catch {
      this.notify('Could not save. Work remains pending in this window.');
    }
  }
  prepareClose() {
    if (this.closing) return this.closing;
    this.frozen = true;
    for (const e of this.editors.values()) e.freeze();
    this.changed();
    this.closing = (async () => {
      await this.loading?.catch(() => {});
      await this.creating;
      await this.navigationTask;
      let safe = !this.pendingCreate;
      if (this.ready) {
        try {
          await this.checkpoint();
          this.navigationError = false;
        } catch {
          safe = false;
          this.navigationError = true;
        }
      }
      // Includes every context on hidden tabs and previously visited notes.
      const results = await Promise.all(
        [...this.editors.values()].map((e) => e.prepareClose())
      );
      safe = safe && results.every((r) => r.safe);
      if (!safe) this.refuseClose();
      return { safe };
    })()
      .catch(() => {
        this.refuseClose();
        return { safe: false };
      })
      .finally(() => {
        this.closing = null;
      });
    return this.closing;
  }
  refuseClose() {
    this.focusTarget = 'editor';
    this.recoveryEpoch++;
    this.frozen = false;
    for (const e of this.editors.values()) e.resumeAfterRefusedClose();
    this.focusRevision++;
    this.notify(
      'Cannot close: work or navigation could not be saved or protected.'
    );
  }
}
