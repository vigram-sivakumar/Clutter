import { EditorWorkspace } from './workspace.mjs';
/** Window-local navigation and lifecycle. Core owns all accepted page content. */
export class WindowWorkspace {
  constructor({
    client,
    spaceId,
    windowId,
    changed = () => {},
    nextId = () => crypto.randomUUID(),
  }) {
    Object.assign(this, { client, spaceId, windowId, changed, nextId });
    this.editors = new Map();
    this.pages = [];
    this.next = undefined;
    this.pageId = null;
    this.status = 'Connecting…';
    this.busy = false;
    this.frozen = false;
    this.pendingCreate = null;
    this.creating = null;
    this.closing = null;
  }
  notify(status) {
    if (
      status === 'Saved' &&
      [...this.editors.values()].some((e) =>
        [...e.contexts.values()].some((s) => s.dirty)
      )
    )
      status = 'Work remains pending';
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
  async start() {
    await this.list();
    if (this.pages.length) this.open(this.pages[0].pageId);
    this.notify('Ready');
  }
  open(pageId) {
    if (this.frozen || this.pendingCreate) return;
    this.pageId = pageId;
    this.editor(pageId);
    this.changed();
  }
  editor(pageId) {
    if (!this.editors.has(pageId))
      this.editors.set(
        pageId,
        new EditorWorkspace({
          client: this.client,
          spaceId: this.spaceId,
          pageId,
          windowId: this.windowId,
          nextId: this.nextId,
          onStatus: (status) => this.notify(status),
        })
      );
    return this.editors.get(pageId);
  }
  create() {
    if (this.frozen) return Promise.resolve();
    if (this.creating) return this.creating;
    if (!this.pendingCreate)
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
    const command = this.pendingCreate;
    this.busy = true;
    this.notify('Creating…');
    this.creating = (async () => {
      const result = await this.client.execute(command);
      if (!result.ok) {
        // Unknown outcome retains the exact request for retry, never another page ID.
        if (result.error.code !== 'OUTCOME_UNKNOWN') this.pendingCreate = null;
        this.notify(
          this.pendingCreate
            ? 'Creation not confirmed. Retry creation.'
            : 'Could not create page: ' + result.error.code
        );
        return;
      }
      this.pendingCreate = null;
      // Created identity comes from the accepted request/receipt, not a sidebar cache.
      this.pageId = command.pageId;
      this.editor(command.pageId);
      this.notify('Saved');
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
    if (this.frozen) return;
    this.notify('Saving…');
    try {
      for (const e of this.editors.values()) await e.flush();
      this.notify('Saved');
    } catch {
      this.notify('Could not save. Work remains pending in this window.');
    }
  }
  prepareClose() {
    if (this.closing) return this.closing;
    this.frozen = true;
    this.changed();
    this.closing = (async () => {
      // A create acknowledgement must settle before this window may close.
      await this.creating;
      let safe = !this.pendingCreate;
      // Freeze and protect every page, including pages whose views were unmounted.
      const results = await Promise.all(
        [...this.editors.values()].map((e) => e.prepareClose())
      );
      safe = safe && results.every((r) => r.safe);
      if (!safe) {
        this.frozen = false;
        for (const e of this.editors.values()) e.resumeAfterRefusedClose();
        this.notify('Cannot close: work could not be saved or protected.');
      }
      return { safe };
    })()
      .catch(() => {
        this.frozen = false;
        for (const e of this.editors.values()) e.resumeAfterRefusedClose();
        this.notify('Cannot close: work remains pending.');
        return { safe: false };
      })
      .finally(() => {
        this.closing = null;
      });
    return this.closing;
  }
}
