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
    this.pendingNavigation = null;
    this.registeredViews = new Set();
    this.layoutRevision = 0;
    this.pendingLayout = null;
    this.layoutTail = Promise.resolve();
    this.layoutTimer = null;
    this.layoutWriteToken = 0;
    this.navigationTail = Promise.resolve();
    this.intents = new Map();
    this.routeOperations = new Map();
    this.preparing = new Set();
    this.intentSequence = 0;
    this.focusEpoch = 0;
    this.failedIntent = null;
    this.creationState = 'idle';
    this.prepareViews = null;
  }
  get pageId() {
    return this.navigation.page();
  }
  get canSelectView() {
    return this.ready && !this.frozen;
  }
  get canNavigate() {
    return this.canSelectView;
  }
  references(value) {
    return value.tabs.flatMap((tab) =>
      tab.panes.flatMap((pane) =>
        pane.visited.map((pageId) => JSON.stringify([tab.id, pane.id, pageId]))
      )
    );
  }
  get layoutRegistered() {
    return this.isRegistered(this.navigation);
  }
  isRegistered(navigation) {
    if (!this.stateStore) return true;
    const tab = navigation.activeTab;
    return (
      !tab ||
      tab.panes.every((pane) =>
        this.registeredViews.has(
          JSON.stringify([tab.id, pane.id, navigation.page(pane)])
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
      const release = await this.primeNavigation(this.navigation);
      this.ready = true;
      this.notify('Ready');
      release?.();
    })();
    return this.loading;
  }
  checkpoint(navigation = this.pendingNavigation ?? this.navigation) {
    if (!this.stateStore) return Promise.resolve();
    const value = JSON.stringify(navigation.snapshot());
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
  navigate(
    change,
    { route = null, focus = true, epoch = ++this.focusEpoch } = {}
  ) {
    if (!this.canNavigate) return Promise.resolve(false);
    const intent = {
      change,
      route,
      focus,
      epoch,
      sequence: ++this.intentSequence,
      ids: [],
    };
    intent.superseded = new Promise((resolve) => {
      intent.supersede = () => {
        intent.cancelled = true;
        resolve();
      };
    });
    if (route) {
      this.routeOperations.get(route)?.supersede();
      this.routeOperations.set(route, intent);
      this.intents.set(route, intent.sequence);
    }
    return this.commitNavigation(intent);
  }
  candidate(intent) {
    let index = 0;
    const next = new WindowNavigation(
      () => intent.ids[index++] ?? (intent.ids[index - 1] = this.nextId()),
      this.navigation.snapshot()
    );
    const changed = intent.change(next);
    if (intent.epoch !== this.focusEpoch) {
      const current = this.navigation.activeTab;
      const tab = next.tabs.find((t) => t.id === current?.id);
      if (tab) {
        next.value.activeTabId = tab.id;
        if (tab.panes.some((p) => p.id === current.activePaneId))
          tab.activePaneId = current.activePaneId;
      }
    }
    return { next, changed };
  }
  currentIntent(intent) {
    return !intent.route || this.intents.get(intent.route) === intent.sequence;
  }
  async waitForIntent(intent, work) {
    const task = Promise.resolve(work);
    this.preparing.add(task);
    task.then(
      (value) => {
        this.preparing.delete(task);
        if (intent.cancelled && typeof value === 'function') value();
      },
      () => this.preparing.delete(task)
    );
    return Promise.race([
      task.then((value) => ({ value })),
      intent.superseded.then(() => null),
    ]);
  }
  async primeNavigation(navigation) {
    if (this.prepareViews) return this.prepareViews(navigation);
    const tab = navigation.activeTab;
    if (!tab) return;
    await Promise.all(
      tab.panes.map((pane) =>
        this.editor(navigation.page(pane)).prime(navigation.viewKey(tab, pane))
      )
    );
  }
  cancelLayoutWrite() {
    clearTimeout(this.layoutTimer);
    this.layoutTimer = null;
    this.layoutWriteToken++;
  }
  scheduleLayoutWrite() {
    this.cancelLayoutWrite();
    const token = this.layoutWriteToken;
    this.layoutTimer = setTimeout(async () => {
      this.layoutTimer = null;
      await this.layoutTail;
      if (token !== this.layoutWriteToken || this.frozen) return;
      try {
        await this.checkpoint(this.navigation);
      } catch {
        if (token === this.layoutWriteToken && !this.frozen) {
          this.navigationError = true;
          this.notify(
            'Could not save navigation. Retry navigation before closing.'
          );
        }
      }
    }, 120);
  }
  commitNavigation(intent = this.failedIntent) {
    if (!intent)
      return this.checkpoint(this.navigation)
        .then(() => {
          this.navigationError = false;
          this.changed();
          return true;
        })
        .catch(() => false);
    this.cancelLayoutWrite();
    this.navigationBusy = true;
    const preparations = [];
    const task = this.navigationTail
      .then(async () => {
        if (!this.currentIntent(intent)) return false;
        let { next, changed } = this.candidate(intent);
        if (!changed) {
          this.failedIntent = null;
          this.navigationError = false;
          this.pendingNavigation = null;
          this.scheduleLayoutWrite();
          if (intent.epoch === this.focusEpoch) {
            this.focusTarget = intent.focus ? 'editor' : 'tabs';
            this.focusRevision++;
            this.changed();
          }
          return true;
        }
        this.pendingNavigation = next;
        const registered = this.isRegistered(next);
        if (
          !registered &&
          !(await this.waitForIntent(intent, this.checkpoint(next)))
        )
          return false;
        if (!this.currentIntent(intent)) return false;
        const prepared = await this.waitForIntent(
          intent,
          this.primeNavigation(next)
        );
        if (!prepared) return false;
        preparations.push(prepared.value);
        if (!this.currentIntent(intent)) return false;
        // A pane/tab may have been activated while preparation was pending. Rebase
        // the intent over current topology without allocating different view IDs.
        const rebased = this.candidate(intent).next;
        if (
          JSON.stringify(rebased.snapshot()) !== JSON.stringify(next.snapshot())
        ) {
          next = rebased;
          this.pendingNavigation = next;
          if (
            !this.isRegistered(next) &&
            !(await this.waitForIntent(intent, this.checkpoint(next)))
          )
            return false;
          if (!this.currentIntent(intent)) return false;
          const rebasedPreparation = await this.waitForIntent(
            intent,
            this.primeNavigation(next)
          );
          if (!rebasedPreparation) return false;
          preparations.push(rebasedPreparation.value);
        }
        if (!this.currentIntent(intent)) return false;
        // No awaits between the final selection rebase and publication.
        const final = this.candidate(intent).next;
        this.navigation = final;
        this.pendingNavigation = null;
        this.failedIntent = null;
        this.navigationError = false;
        if (intent.epoch === this.focusEpoch) {
          this.focusTarget = intent.focus ? 'editor' : 'tabs';
          this.focusRevision++;
        }
        this.scheduleLayoutWrite();
        this.changed();
        return true;
      })
      .catch(() => {
        if (this.currentIntent(intent)) {
          this.failedIntent = intent;
          this.navigationError = true;
          this.notify(
            'Could not complete this navigation. Existing notes remain available.'
          );
        }
        return false;
      });
    const settled = task.finally(() => {
      if (this.navigationTask === settled) {
        this.navigationBusy = false;
        this.navigationTask = null;
      }
      if (!this.failedIntent && this.navigationTask === null)
        this.pendingNavigation = null;
      for (const release of preparations) release?.();
      this.changed();
    });
    this.navigationTail = settled.then(() => {});
    this.navigationTask = settled;
    return settled;
  }
  retryNavigation() {
    if (!this.canNavigate) return Promise.resolve(false);
    return this.commitNavigation();
  }
  open(pageId) {
    const location = this.navigation.location();
    return this.navigate((nav) => nav.open(pageId, location), {
      route: JSON.stringify(location),
    });
  }
  openInNewTab(pageId) {
    return this.navigate((nav) => nav.newTab(pageId));
  }
  openInSplit(pageId) {
    const location = this.navigation.location();
    return this.navigate((nav) => nav.split(pageId, location));
  }
  back() {
    return this.travel(-1);
  }
  forward() {
    return this.travel(1);
  }
  travel(offset) {
    const location = this.navigation.location();
    return this.navigate((nav) => nav.travel(offset, location), {
      route: JSON.stringify(location),
    });
  }
  selectTab(id, focusEditor = true) {
    return this.navigate((nav) => nav.selectTab(id), {
      route: 'tab-selection',
      focus: focusEditor,
    });
  }
  selectPane(tabId, paneId, editorFocus = false, userIntent = false) {
    if (!this.canSelectView) return;
    if (this.navigation.activeTab?.id !== tabId) return;
    // Explicit user activity invalidates late focus requests, even in the same pane.
    if (userIntent || this.navigation.activePane?.id !== paneId)
      this.focusEpoch++;
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
    if (!this.canSelectView) return Promise.resolve();
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
    const command = this.pendingCreate,
      location = this.createTarget,
      epoch = ++this.focusEpoch;
    this.creationState = 'pending';
    this.changed();
    this.creating = (async () => {
      const result = await this.client.execute(command);
      if (!result.ok) {
        if (result.error.code !== 'OUTCOME_UNKNOWN') this.pendingCreate = null;
        this.creationState = this.pendingCreate ? 'uncertain' : 'failed';
        this.notify(
          this.pendingCreate
            ? 'Creation not confirmed. Retry creation.'
            : 'Could not create page: ' + result.error.code
        );
        return;
      }
      this.pendingCreate = null;
      this.creationState = 'idle';
      // Project the accepted command result, not a speculative React body copy.
      const read = await this.client.execute({
        apiVersion: 1,
        method: 'page.read',
        spaceId: this.spaceId,
        pageId: command.pageId,
      });
      if (!read.ok) throw Error(read.error.code);
      const { pageId, title, kind, head, sequence } = read.value;
      this.pages = [
        ...this.pages.filter((p) => p.pageId !== pageId),
        { pageId, title, kind, head, sequence },
      ];
      this.changed();
      // Accepted creations remain in the index even if newer navigation supersedes
      // their reveal. Do not restore an obsolete destination or steal focus.
      if (epoch === this.focusEpoch)
        await this.navigate((nav) => nav.open(pageId, location), {
          route: JSON.stringify(location),
          epoch,
        });
    })()
      .catch((error) => {
        this.creationState = this.pendingCreate ? 'uncertain' : 'failed';
        this.notify(
          'Could not confirm creation details: ' +
            error.message +
            '. Refresh pages; accepted work is retained.'
        );
      })
      .finally(() => {
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
    this.cancelLayoutWrite();
    this.notify('Saving…');
    try {
      await this.navigationTail;
      await this.checkpoint(this.navigation);
      this.navigationError = false;
      for (const e of this.editors.values()) await e.flush();
      this.notify('Saved');
    } catch {
      this.notify('Could not save. Work remains pending in this window.');
    }
  }
  prepareClose() {
    if (this.closing) return this.closing;
    this.cancelLayoutWrite();
    this.frozen = true;
    for (const e of this.editors.values()) e.freeze();
    this.changed();
    this.closing = (async () => {
      await this.loading?.catch(() => {});
      await this.creating;
      await this.navigationTail;
      await Promise.allSettled([...this.preparing]);
      let safe = !this.pendingCreate;
      if (this.ready) {
        try {
          await this.checkpoint(this.navigation);
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
    this.frozen = false;
    for (const e of this.editors.values()) e.resumeAfterRefusedClose();
    this.focusRevision++;
    this.notify(
      'Cannot close: work or navigation could not be saved or protected.'
    );
  }
}
