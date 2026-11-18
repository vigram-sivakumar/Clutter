import React, {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { WindowWorkspace } from './window-workspace.mjs';
import { NoteMenu } from './note-menu.jsx';
import { SurfaceRegistry } from './surfaces.mjs';

function useModel(model, select) {
  const snapshot = useCallback(() => select(model), [model, select]);
  return useSyncExternalStore(model.subscribe, snapshot);
}
const lifecycle = (m) => JSON.stringify([m.ready, m.frozen]);
const navigation = (m) =>
  JSON.stringify([m.ready, m.frozen, m.navigation.snapshot()]);
const indexState = (m) =>
  JSON.stringify([
    m.ready,
    m.frozen,
    m.creationState,
    m.pages,
    m.next,
    m.pageId,
  ]);
const titles = (m) => JSON.stringify(m.pages.map((p) => [p.pageId, p.title]));
const statusState = (m) =>
  JSON.stringify([m.status, m.navigationError, m.frozen]);
const focusState = (m) => JSON.stringify([m.focusRevision, m.frozen]);
function Button({ children, className = '', ...props }) {
  return (
    <button className={'button ' + className} {...props}>
      {children}
    </button>
  );
}
const NoteView = memo(function NoteView({
  model,
  tabId,
  paneId,
  pageId,
  active,
  visible,
}) {
  const target = useRef(null),
    viewRef = useRef(null);
  const key = JSON.stringify([tabId, paneId]);
  useModel(model, lifecycle);
  useModel(model, focusState);
  const ownsFocus = () =>
    model.focusTarget === 'editor' &&
    !model.frozen &&
    model.navigation.activeTab?.id === tabId &&
    model.navigation.activePane?.id === paneId &&
    model.pageId === pageId;
  useLayoutEffect(() => {
    if (!visible) return;
    viewRef.current = model.surfaces.attach(pageId, key, target.current);
    if (ownsFocus()) viewRef.current.focus();
    return () => {
      viewRef.current = null;
      model.surfaces.detach(pageId, key);
    };
  }, [model, pageId, key, visible]);
  useLayoutEffect(() => {
    if (visible && active && ownsFocus()) viewRef.current?.focus();
  }, [visible, active, model.focusRevision]);
  const title = useModel(
    model,
    useCallback(
      (m) => m.pages.find((p) => p.pageId === pageId)?.title || 'New note',
      [pageId]
    )
  );
  return (
    <section
      className="editor-pane"
      data-pane={paneId}
      data-page={pageId}
      data-active={active}
      aria-label={'Note pane: ' + title}
      onFocusCapture={(e) =>
        model.selectPane(tabId, paneId, !!e.target.closest('.ProseMirror'))
      }
      onPointerDown={() => model.selectPane(tabId, paneId, false, true)}
    >
      <div className="pane-heading">
        {title}
        <span>{active ? 'Active pane' : 'Pane'}</span>
      </div>
      <div className="editor-tools">
        {['undo', 'redo'].map((direction) => (
          <Button
            key={direction}
            disabled={!model.canSelectView}
            onMouseDown={(e) => {
              if (e.button === 0) e.preventDefault();
            }}
            onClick={() => {
              model.selectPane(tabId, paneId);
              model.editor(pageId).history(key, direction);
            }}
          >
            {direction === 'undo' ? 'Undo' : 'Redo'}
          </Button>
        ))}
        <Button
          disabled={!model.canSelectView}
          onClick={() =>
            model
              .editor(pageId)
              .recover(key)
              .catch(() =>
                model.notify('No protected work is available for this view.')
              )
          }
        >
          Recover protected work
        </Button>
      </div>
      <div className="note-scroll" data-block-selection-canvas="">
        <div className="editor-content" ref={target} />
      </div>
    </section>
  );
});
function App({ model }) {
  return (
    <div className="workspace">
      <Sidebar model={model} />
      <main className="page-area">
        <PageBar model={model} />
        <Tabs model={model} />
        <Status model={model} />
        <Panels model={model} />
      </main>
    </div>
  );
}
const Sidebar = memo(function Sidebar({ model }) {
  useModel(model, indexState);
  useModel(model, navigation);
  return (
    <aside className="sidebar">
      <div className="brand">
        Clutter <span>Structured</span>
      </div>
      <div className="space-label">Development Space</div>
      <Button
        className="new-page"
        disabled={!model.canSelectView}
        onClick={() => void model.create()}
      >
        {model.creationState === 'uncertain' ? 'Retry creation' : '+ New page'}
      </Button>
      <Button
        disabled={!model.canNavigate}
        onClick={() =>
          model.list().catch(() => model.notify('Could not refresh pages.'))
        }
      >
        Refresh pages
      </Button>
      <nav aria-label="Pages">
        {model.pages.map((page) => (
          <div className="page-row" key={page.pageId}>
            <button
              className="page-link"
              data-page={page.pageId}
              aria-current={page.pageId === model.pageId ? 'page' : undefined}
              disabled={!model.canNavigate}
              onClick={() => void model.open(page.pageId)}
            >
              <span aria-hidden="true">▤</span>
              <span>{page.title || 'New note'}</span>
            </button>
            <NoteMenu
              label={page.title || 'New note'}
              disabled={!model.canNavigate}
              splitDisabled={!model.canSplit(page.pageId)}
              windowDisabled={!model.canOpenWindow}
              onNewWindow={() => void model.openInNewWindow(page.pageId)}
              onNewTab={() => void model.openInNewTab(page.pageId)}
              onSplit={() => void model.openInSplit(page.pageId)}
            />
          </div>
        ))}
      </nav>
      {model.next && (
        <Button
          disabled={!model.canNavigate}
          onClick={() =>
            model
              .list(true)
              .catch(() => model.notify('Could not load more pages.'))
          }
        >
          Load more
        </Button>
      )}
      <p className="development-note">
        Development build
        <br />
        Use synthetic content only
      </p>
    </aside>
  );
});
const PageBar = memo(function PageBar({ model }) {
  useModel(model, navigation);
  useModel(model, titles);
  const pane = model.navigation.activePane;
  const title = (pageId) =>
    model.pages.find((p) => p.pageId === pageId)?.title || 'New note';
  return (
    <header className="page-bar">
      <div className="navigation-tools">
        <Button
          aria-label="Back"
          disabled={!model.canNavigate || !pane || pane.index <= 0}
          onClick={() => void model.back()}
        >
          ←
        </Button>
        <Button
          aria-label="Forward"
          disabled={
            !model.canNavigate || !pane || pane.index + 1 >= pane.history.length
          }
          onClick={() => void model.forward()}
        >
          →
        </Button>
        <span>{model.pageId ? title(model.pageId) : 'Pages'}</span>
      </div>
      <Button disabled={!model.canSelectView} onClick={() => void model.save()}>
        Save
      </Button>
    </header>
  );
});
const Tabs = memo(function Tabs({ model }) {
  useModel(model, navigation);
  useModel(model, titles);
  const tab = model.navigation.activeTab;
  const title = (pageId) =>
    model.pages.find((p) => p.pageId === pageId)?.title || 'New note';
  const tabKey = (event) => {
    const tabs = model.navigation.tabs;
    const index = tabs.findIndex(
      (t) => t.id === model.navigation.value.activeTabId
    );
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      model.selectTab(tabs[next].id, false);
      event.currentTarget.querySelectorAll('[role=tab]')[next]?.focus();
    }
  };
  return (
    <div
      className="tab-strip"
      role="tablist"
      aria-label="Open tabs"
      onKeyDown={tabKey}
    >
      {model.navigation.tabs.map((item, index) => (
        <button
          role="tab"
          key={item.id}
          id={'tab-' + item.id}
          aria-controls={'tab-panel-' + item.id}
          aria-selected={item.id === tab?.id}
          aria-label={
            'Tab ' +
            (index + 1) +
            ': ' +
            title(
              model.navigation.page(
                item.panes.find((p) => p.id === item.activePaneId)
              )
            )
          }
          tabIndex={item.id === tab?.id ? 0 : -1}
          disabled={!model.canSelectView}
          onClick={() => model.selectTab(item.id)}
        >
          {title(
            model.navigation.page(
              item.panes.find((p) => p.id === item.activePaneId)
            )
          )}
          {item.panes.length > 1 && (
            <span className="split-count">{item.panes.length} panes</span>
          )}
        </button>
      ))}
    </div>
  );
});
const Status = memo(function Status({ model }) {
  useModel(model, statusState);
  return (
    <div className="status-line" role="status">
      {model.status}
      {model.navigationError && (
        <Button
          disabled={model.frozen}
          onClick={() => void model.retryNavigation()}
        >
          Retry navigation
        </Button>
      )}
    </div>
  );
});
const Panels = memo(function Panels({ model }) {
  useModel(model, navigation);
  return !model.ready ? (
    <div className="empty-state">
      <p>Connecting…</p>
    </div>
  ) : model.navigation.tabs.length ? (
    model.navigation.tabs.map((tab) => (
      <div
        className="tab-panel"
        key={tab.id}
        id={'tab-panel-' + tab.id}
        role="tabpanel"
        hidden={tab.id !== model.navigation.activeTab?.id}
        aria-labelledby={'tab-' + tab.id}
      >
        {tab.panes.map((item) => (
          <NoteView
            key={item.id}
            model={model}
            tabId={tab.id}
            paneId={item.id}
            pageId={model.navigation.page(item)}
            visible={tab.id === model.navigation.activeTab?.id}
            active={
              tab.id === model.navigation.activeTab?.id &&
              item.id === tab.activePaneId
            }
          />
        ))}
      </div>
    ))
  ) : (
    <div className="empty-state">
      <h1>A space for your thoughts</h1>
      <p>Create a page to start writing.</p>
    </div>
  );
});
export function mountWorkspace(target, options) {
  let revision = 0;
  const listeners = new Set();
  const model = new WindowWorkspace({
    ...options,
    changed: () => {
      revision++;
      for (const listener of listeners) listener();
    },
  });
  model.subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  model.snapshot = () => revision;
  model.surfaces = new SurfaceRegistry(model, target.ownerDocument);
  model.prepareViews = (nav) => model.surfaces.prepare(nav);
  const root = createRoot(target);
  root.render(<App model={model} />);
  return { model, root };
}
