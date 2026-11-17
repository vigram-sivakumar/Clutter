import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { WindowWorkspace } from './window-workspace.mjs';

function Button({ children, className = '', ...props }) {
  return (
    <button className={'button ' + className} {...props}>
      {children}
    </button>
  );
}
function EditorPane({ model, pageId, pane }) {
  const target = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const workspace = model.editor(pageId);
    workspace
      .mount(pane, target.current)
      .then((view) => {
        if (active && pane === 'a') view.focus();
      })
      .catch(() => {
        if (active)
          setError('The editor could not open. Your page was not replaced.');
      });
    return () => {
      active = false;
      workspace.unmount(pane);
    };
  }, [model, pageId, pane]);
  return (
    <section
      className="editor-pane"
      aria-label={pane === 'a' ? 'Page editor' : 'Second page editor'}
    >
      <div className="editor-tools">
        {['undo', 'redo'].map((direction) => (
          <Button
            key={direction}
            disabled={model.frozen}
            onMouseDown={(e) => {
              if (e.button === 0) e.preventDefault();
            }}
            onClick={() => model.editor(pageId).history(pane, direction)}
          >
            {direction === 'undo' ? 'Undo' : 'Redo'}
          </Button>
        ))}
        <Button
          disabled={model.frozen}
          onClick={() =>
            model
              .editor(pageId)
              .recover(pane)
              .catch(() =>
                model.notify('No protected work is available for this view.')
              )
          }
        >
          Recover protected work
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="editor-content" data-pane={pane} ref={target} />
    </section>
  );
}
function App({ model }) {
  useSyncExternalStore(model.subscribe, model.snapshot);
  const [split, setSplit] = useState(false);
  const selected = model.pages.find((p) => p.pageId === model.pageId);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          Clutter <span>Structured</span>
        </div>
        <div className="space-label">Development Space</div>
        <Button
          className="new-page"
          disabled={model.busy || model.frozen}
          onClick={() => void model.create()}
        >
          {model.pendingCreate ? 'Retry creation' : '+ New page'}
        </Button>
        <Button
          disabled={model.frozen || model.busy}
          onClick={() =>
            model.list().catch(() => model.notify('Could not refresh pages.'))
          }
        >
          Refresh pages
        </Button>
        <nav aria-label="Pages">
          {model.pages.map((page) => (
            <button
              key={page.pageId}
              className="page-link"
              aria-current={page.pageId === model.pageId ? 'page' : undefined}
              disabled={model.frozen || !!model.pendingCreate}
              onClick={() => model.open(page.pageId)}
            >
              <span aria-hidden="true">▤</span>
              <span>{page.title || 'Untitled'}</span>
            </button>
          ))}
        </nav>
        {model.next && (
          <Button
            disabled={model.frozen}
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
          <span>
            {selected?.title || (model.pageId ? 'Untitled' : 'Pages')}
          </span>
          <div>
            <Button
              disabled={!model.pageId || model.frozen}
              onClick={() => setSplit((s) => !s)}
            >
              {split ? 'Single view' : 'Split view'}
            </Button>
            <Button
              disabled={!model.pageId || model.frozen}
              onClick={() => void model.save()}
            >
              Save
            </Button>
          </div>
        </header>
        <div className="status-line" role="status">
          {model.status}
        </div>
        {model.pageId ? (
          <article className="page" key={model.pageId}>
            <h1>{selected?.title || 'Untitled'}</h1>
            <div className={'editors' + (split ? ' split' : '')}>
              <EditorPane model={model} pageId={model.pageId} pane="a" />
              {split && (
                <EditorPane model={model} pageId={model.pageId} pane="b" />
              )}
            </div>
          </article>
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
