import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { WindowWorkspace } from './window-workspace.mjs';
import { NoteMenu } from './note-menu.jsx';
function Button({ children, className = '', ...props }) {
  return (
    <button className={'button ' + className} {...props}>
      {children}
    </button>
  );
}
function NoteView({ model, tab, pane }) {
  const pageId = model.navigation.page(pane);
  const target = useRef(null),
    viewport = useRef(null),
    viewRef = useRef(null);
  const [error, setError] = useState('');
  const key = model.navigation.viewKey(tab, pane);
  const active =
    model.navigation.activeTab?.id === tab.id && tab.activePaneId === pane.id;
  const ownsFocus = () =>
    model.focusTarget === 'editor' &&
    !model.frozen &&
    model.navigation.activeTab?.id === tab.id &&
    model.navigation.activePane?.id === pane.id &&
    model.navigation.page() === pageId;
  useLayoutEffect(() => {
    let mounted = true;
    const scroller = viewport.current;
    const workspace = model.editor(pageId);
    setError('');
    workspace
      .mount(key, target.current)
      .then((view) => {
        if (!mounted) return;
        viewRef.current = view;
        const position = workspace.viewports.get(key);
        if (position && scroller) {
          scroller.scrollTop = position.top;
          scroller.scrollLeft = position.left;
        }
        if (ownsFocus()) view.focus();
      })
      .catch(() => {
        if (mounted)
          setError('The editor could not open. Your page was not replaced.');
      });
    return () => {
      mounted = false;
      viewRef.current = null;
      if (scroller)
        workspace.viewports.set(key, {
          top: scroller.scrollTop,
          left: scroller.scrollLeft,
        });
      workspace.unmount(key);
    };
  }, [model, pageId, key, model.recoveryEpoch]);
  useEffect(() => {
    if (active && ownsFocus()) viewRef.current?.focus();
  }, [active, model.focusRevision]);
  const title =
    model.pages.find((p) => p.pageId === pageId)?.title || 'Untitled';
  return (
    <section
      className="editor-pane"
      data-pane={pane.id}
      data-page={pageId}
      data-active={active}
      aria-label={'Note pane: ' + title}
      onFocusCapture={(e) =>
        model.selectPane(tab.id, pane.id, !!e.target.closest('.ProseMirror'))
      }
      onPointerDown={() => model.selectPane(tab.id, pane.id)}
    >
      <div className="pane-heading">
        {title}
        <span>{active ? 'Active pane' : 'Pane'}</span>
      </div>
      <div className="editor-tools">
        {['undo', 'redo'].map((direction) => (
          <Button
            key={direction}
            disabled={!model.canSelectView || !model.layoutRegistered}
            onMouseDown={(e) => {
              if (e.button === 0) e.preventDefault();
            }}
            onClick={() => {
              model.selectPane(tab.id, pane.id);
              model.editor(pageId).history(key, direction);
            }}
          >
            {direction === 'undo' ? 'Undo' : 'Redo'}
          </Button>
        ))}
        <Button
          disabled={!model.canSelectView || !model.layoutRegistered}
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
      <div className="note-scroll" ref={viewport}>
        <h1>{title}</h1>
        {error && <p role="alert">{error}</p>}
        <div className="editor-content" ref={target} />
      </div>
    </section>
  );
}
function App({ model }) {
  useSyncExternalStore(model.subscribe, model.snapshot);
  const tab = model.navigation.activeTab,
    pane = model.navigation.activePane;
  const title = (pageId) =>
    model.pages.find((p) => p.pageId === pageId)?.title || 'Untitled';
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
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          Clutter <span>Structured</span>
        </div>
        <div className="space-label">Development Space</div>
        <Button
          className="new-page"
          disabled={
            !model.ready ||
            model.frozen ||
            model.busy ||
            model.navigationBusy ||
            model.navigationError
          }
          onClick={() => void model.create()}
        >
          {model.pendingCreate ? 'Retry creation' : '+ New page'}
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
                <span>{page.title || 'Untitled'}</span>
              </button>
              <NoteMenu
                label={page.title || 'Untitled'}
                disabled={!model.canNavigate}
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
      <main className="page-area">
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
                !model.canNavigate ||
                !pane ||
                pane.index + 1 >= pane.history.length
              }
              onClick={() => void model.forward()}
            >
              →
            </Button>
            <span>{model.pageId ? title(model.pageId) : 'Pages'}</span>
          </div>
          <Button
            disabled={
              !model.ready || model.frozen || model.busy || model.navigationBusy
            }
            onClick={() => void model.save()}
          >
            Save
          </Button>
        </header>
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
        <div className="status-line" role="status">
          {model.status}
          {model.navigationError && (
            <Button
              disabled={model.frozen || model.navigationBusy}
              onClick={() => void model.retryNavigation()}
            >
              Retry navigation
            </Button>
          )}
        </div>
        {!model.ready ? (
          <div className="empty-state">
            <p>Connecting…</p>
          </div>
        ) : tab ? (
          <div
            className="tab-panel"
            key={tab.id}
            id={'tab-panel-' + tab.id}
            role="tabpanel"
            aria-busy={model.navigationBusy || model.busy}
            aria-labelledby={'tab-' + tab.id}
          >
            {tab.panes.map((item) => (
              <NoteView
                key={item.id + ':' + model.navigation.page(item)}
                model={model}
                tab={tab}
                pane={item}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h1>A space for your thoughts</h1>
            <p>Create a page to start writing.</p>
          </div>
        )}
      </main>
    </div>
  );
}
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
  const root = createRoot(target);
  root.render(<App model={model} />);
  return { model, root };
}
