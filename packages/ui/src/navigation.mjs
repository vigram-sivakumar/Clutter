const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const object = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === keys.split(',').sort().join();
export function parseNavigation(value) {
  if (
    !object(value, 'version,tabs,activeTabId') ||
    value.version !== 1 ||
    !Array.isArray(value.tabs) ||
    value.tabs.length > 64
  )
    throw Error('INVALID_WINDOW_LAYOUT');
  const tabs = new Set(),
    panes = new Set();
  for (const tab of value.tabs) {
    if (
      !object(tab, 'id,panes,activePaneId') ||
      typeof tab.id !== 'string' ||
      !ID.test(tab.id) ||
      tabs.has(tab.id) ||
      !Array.isArray(tab.panes) ||
      !tab.panes.length ||
      tab.panes.length > 8
    )
      throw Error('INVALID_WINDOW_LAYOUT');
    tabs.add(tab.id);
    for (const pane of tab.panes) {
      if (
        !object(pane, 'id,history,index,visited') ||
        typeof pane.id !== 'string' ||
        !ID.test(pane.id) ||
        panes.has(pane.id) ||
        !Array.isArray(pane.visited) ||
        !pane.visited.length ||
        pane.visited.length > 1024 ||
        pane.visited.some((id) => typeof id !== 'string' || !ID.test(id)) ||
        new Set(pane.visited).size !== pane.visited.length ||
        !Array.isArray(pane.history) ||
        !pane.history.length ||
        pane.history.length > 128 ||
        pane.history.some(
          (id) =>
            typeof id !== 'string' || !ID.test(id) || !pane.visited.includes(id)
        ) ||
        !Number.isInteger(pane.index) ||
        pane.index < -1 ||
        pane.index >= pane.history.length ||
        (pane.history.length > 0 && pane.index < 0)
      )
        throw Error('INVALID_WINDOW_LAYOUT');
      panes.add(pane.id);
    }
    if (!tab.panes.some((p) => p.id === tab.activePaneId))
      throw Error('INVALID_WINDOW_LAYOUT');
  }
  if (
    value.tabs.length
      ? !tabs.has(value.activeTabId)
      : value.activeTabId !== null
  )
    throw Error('INVALID_WINDOW_LAYOUT');
  const result = structuredClone(value);
  if (JSON.stringify(result).length > 524288)
    throw Error('WINDOW_LAYOUT_TOO_LARGE');
  return result;
}
/** UI navigation only. Histories contain page references, never document bodies. */
export class WindowNavigation {
  constructor(nextId, value = { version: 1, tabs: [], activeTabId: null }) {
    this.nextId = nextId;
    this.value = parseNavigation(value);
  }
  get tabs() {
    return this.value.tabs;
  }
  get activeTab() {
    return this.tabs.find((t) => t.id === this.value.activeTabId);
  }
  get activePane() {
    return this.activeTab?.panes.find(
      (p) => p.id === this.activeTab.activePaneId
    );
  }
  page(pane = this.activePane) {
    return pane?.history[pane.index] ?? null;
  }
  location() {
    return this.activeTab
      ? { tabId: this.activeTab.id, paneId: this.activePane.id }
      : null;
  }
  viewKey(tab, pane) {
    return JSON.stringify([tab.id, pane.id]);
  }
  snapshot() {
    return parseNavigation(this.value);
  }
  mutate(change) {
    const draft = this.snapshot();
    if (!change(draft)) return false;
    this.value = parseNavigation(draft);
    return true;
  }
  pane(draft, location) {
    const tab = draft.tabs.find(
      (t) => t.id === (location?.tabId ?? draft.activeTabId)
    );
    return {
      tab,
      pane: tab?.panes.find(
        (p) => p.id === (location?.paneId ?? tab.activePaneId)
      ),
    };
  }
  newTab(pageId) {
    return this.mutate((draft) => {
      const pane = {
        id: this.nextId(),
        history: [pageId],
        visited: [pageId],
        index: 0,
      };
      const tab = { id: this.nextId(), panes: [pane], activePaneId: pane.id };
      draft.tabs.push(tab);
      draft.activeTabId = tab.id;
      return true;
    });
  }
  open(pageId, location) {
    if (!this.activeTab) return this.newTab(pageId);
    return this.mutate((draft) => {
      const { tab, pane } = this.pane(draft, location);
      if (!pane) throw Error('VIEW_NOT_AVAILABLE');
      if (this.page(pane) === pageId) return false;
      pane.history = [...pane.history.slice(0, pane.index + 1), pageId];
      pane.index = pane.history.length - 1;
      if (!pane.visited.includes(pageId)) pane.visited.push(pageId);
      draft.activeTabId = tab.id;
      tab.activePaneId = pane.id;
      return true;
    });
  }
  split(pageId) {
    if (!this.activeTab) return this.newTab(pageId);
    return this.mutate((draft) => {
      const { tab } = this.pane(draft);
      const pane = {
        id: this.nextId(),
        history: [pageId],
        visited: [pageId],
        index: 0,
      };
      tab.panes.push(pane);
      tab.activePaneId = pane.id;
      return true;
    });
  }
  travel(offset) {
    return this.mutate((draft) => {
      const { pane } = this.pane(draft);
      if (
        !pane ||
        ![-1, 1].includes(offset) ||
        pane.index + offset < 0 ||
        pane.index + offset >= pane.history.length
      )
        return false;
      pane.index += offset;
      return true;
    });
  }
  selectTab(id) {
    return this.mutate((draft) => {
      if (!draft.tabs.some((t) => t.id === id) || draft.activeTabId === id)
        return false;
      draft.activeTabId = id;
      return true;
    });
  }
  selectPane(tabId, paneId) {
    return this.mutate((draft) => {
      if (draft.activeTabId !== tabId) return false;
      const { tab } = this.pane(draft);
      if (
        !tab.panes.some((p) => p.id === paneId) ||
        tab.activePaneId === paneId
      )
        return false;
      tab.activePaneId = paneId;
      return true;
    });
  }
}
