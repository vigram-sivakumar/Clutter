/** Browser view resources only. Sessions/content/history stay in EditorWorkspace/Core. */
export class SurfaceRegistry {
  constructor(model, document, { cacheLimit = 16 } = {}) {
    this.model = model;
    this.document = document;
    this.cacheLimit = cacheLimit;
    this.entries = new Map();
    this.staging = document.createElement('div');
    this.staging.className = 'surface-staging';
    this.staging.inert = true;
    this.staging.setAttribute('aria-hidden', 'true');
    document.body.append(this.staging);
    this.clock = 0;
  }
  identity(pageId, viewKey) {
    return JSON.stringify([pageId, viewKey]);
  }
  async prepare(navigation) {
    const tab = navigation.activeTab;
    if (!tab) return;
    const width =
      this.document.querySelector('.page-area')?.getBoundingClientRect()
        .width || 800;
    const token = Symbol('surface-preparation');
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setTimeout(() => {
        for (const entry of this.entries.values())
          entry.reservations.delete(token);
        this.trim();
      }, 0);
    };
    try {
      await Promise.all(
        tab.panes.map(async (pane) => {
          const pageId = navigation.page(pane),
            viewKey = navigation.viewKey(tab, pane);
          const key = this.identity(pageId, viewKey);
          let entry = this.entries.get(key);
          if (!entry) {
            const host = this.document.createElement('div');
            host.className = 'editor-surface';
            const frame = this.document.createElement('section');
            frame.className = 'editor-pane';
            const scroll = this.document.createElement('div');
            scroll.className = 'note-scroll';
            const slot = this.document.createElement('div');
            slot.className = 'editor-content';
            slot.append(host);
            scroll.append(slot);
            frame.append(scroll);
            this.staging.append(frame);
            entry = {
              host,
              frame,
              slot,
              pageId,
              viewKey,
              workspace: this.model.editor(pageId),
              attached: false,
              reservations: new Set(),
              used: ++this.clock,
            };
            this.entries.set(key, entry);
            entry.opening = entry.workspace
              .mount(viewKey, host)
              .then((view) => {
                entry.view = view;
                return entry;
              })
              .catch((error) => {
                this.entries.delete(key);
                frame.remove();
                throw error;
              });
          }
          entry.frame.style.width =
            Math.max(260, width / tab.panes.length) + 'px';
          entry.reservations.add(token);
          await entry.opening;
        })
      );
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
  attach(pageId, viewKey, target) {
    const entry = this.entries.get(this.identity(pageId, viewKey));
    if (!entry?.view) throw Error('SURFACE_NOT_PREPARED');
    entry.attached = true;
    entry.used = ++this.clock;
    target.replaceChildren(entry.host);
    entry.workspace.restoreView(viewKey);
    const position = entry.workspace.viewports.get(viewKey);
    const scroller = target.closest('.note-scroll');
    if (position && scroller) {
      scroller.scrollTop = position.top;
      scroller.scrollLeft = position.left;
    }
    return entry.view;
  }
  detach(pageId, viewKey) {
    const entry = this.entries.get(this.identity(pageId, viewKey));
    if (!entry?.attached) return;
    entry.workspace.captureView(viewKey);
    const scroller = entry.host.closest('.note-scroll');
    if (scroller)
      entry.workspace.viewports.set(viewKey, {
        top: scroller.scrollTop,
        left: scroller.scrollLeft,
      });
    entry.attached = false;
    entry.used = ++this.clock;
    entry.slot.append(entry.host);
    queueMicrotask(() => this.trim());
  }
  trim() {
    const inactive = [...this.entries.entries()]
      .filter(([, e]) => !e.attached && !e.reservations.size && e.view)
      .sort((a, b) => b[1].used - a[1].used);
    for (const [key, entry] of inactive.slice(this.cacheLimit)) {
      entry.workspace.unmount(entry.viewKey);
      entry.frame.remove();
      this.entries.delete(key);
    }
  }
  destroy() {
    for (const entry of this.entries.values()) {
      if (entry.view) entry.workspace.unmount(entry.viewKey);
      entry.host.remove();
      entry.frame.remove();
    }
    this.entries.clear();
    this.staging.remove();
  }
}
