import { CoreClient } from '../../../../packages/foundation-runtime/src/client.ts';
import { EditorSession } from '../../../../packages/foundation-runtime/src/editor-session.ts';
import { createEditorReplica } from '../editor-replica.mjs';
import { browserCodec } from './browser-codec.mjs';
import { MediaPanel } from './media-panel.mjs';
let config = globalThis.__clutterCore28Bootstrap;
if (!config || !config.url || !config.token || !config.spaceId)
  throw Error('NATIVE_BOOTSTRAP_REQUIRED');
const sessions = {},
  views = {},
  panels = {},
  pending = new Map(),
  timers = new Map();
const mediaActions = new Set();
let frozen = true,
  ready = false,
  poll;
const status = (text) => (document.querySelector('#status').textContent = text);
const native = (action, value = {}) =>
  globalThis.webkit?.messageHandlers?.core28?.postMessage({ action, ...value });
async function rpc(path, value) {
  const r = await fetch(config.url + path, {
    method: value === undefined ? 'GET' : 'POST',
    headers: {
      authorization: 'Bearer ' + config.token,
      ...(value === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? 'HOST_UNAVAILABLE');
  return result;
}
const client = new CoreClient((c) => rpc('/api', c));
async function refresh() {
  for (const s of Object.values(sessions)) await s.sync();
  for (const p of Object.values(panels)) await p.refresh();
  const state = await rpc('/status');
  document.querySelector('#pending').textContent =
    state.pending.length + ' protected media request(s)';
  return state;
}
function editable(value) {
  for (const view of Object.values(views))
    view.setProps({ editable: () => value });
  for (const button of document.querySelectorAll('button'))
    button.disabled = !value;
}
function autosave(id) {
  if (frozen) return;
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(async () => {
      try {
        const r = await sessions[id].flush();
        if (r && !r.ok) throw Error(r.error.code);
        await refresh();
        status('Saved');
      } catch (e) {
        status('Work remains pending: ' + e.message);
      }
    }, 180)
  );
}
function mount(id) {
  views[id] = sessions[id].mount(document.querySelector('#editor-' + id));
  panels[id] = new MediaPanel({
    client,
    spaceId: config.spaceId,
    pageId: 'page',
    target: document.querySelector('#media-' + id),
    showPDF: (value) => native('pdf', value),
  });
}
async function queue(c) {
  pending.set(c.operationId, c);
  try {
    const r = await rpc('/media', c);
    if (r.durable) pending.delete(c.operationId);
    status(
      r.result.ok
        ? 'Media saved'
        : 'Media protected; retry later: ' + r.result.error.code
    );
    await refresh();
  } catch (e) {
    status(
      (pending.has(c.operationId)
        ? 'Media is NOT yet protected: '
        : 'Media protected; refresh failed: ') + e.message
    );
    throw e;
  }
}
async function add(kind) {
  const page = await client.execute({
    apiVersion: 1,
    spaceId: config.spaceId,
    pageId: 'page',
    method: 'page.read',
  });
  if (!page.ok) throw Error(page.error.code);
  const cover = kind === 'cover',
    pdf = kind === 'pdf',
    listed = await client.execute({
      apiVersion: 1,
      spaceId: config.spaceId,
      pageId: 'page',
      method: 'media.list',
    });
  if (!listed.ok) throw Error(listed.error.code);
  const hasCover = Object.hasOwn(listed.value.assets, 'cover');
  const c = {
    apiVersion: 1,
    spaceId: config.spaceId,
    pageId: 'page',
    method: cover && hasCover ? 'media.replace' : 'media.import',
    operationId: crypto.randomUUID(),
    expectedHead: page.value.head,
    attachmentId: cover ? 'cover' : crypto.randomUUID(),
    name: pdf
      ? 'Synthetic.pdf'
      : cover
        ? 'Synthetic cover.png'
        : 'Synthetic.png',
    mime: pdf ? 'application/pdf' : 'image/png',
    payload: pdf ? config.pdf : cover && hasCover ? config.pngAlt : config.png,
    ...(cover && hasCover ? {} : { role: cover ? 'cover' : 'body' }),
  };
  await queue(c);
}
function capture() {
  return {
    ready,
    views: Object.fromEntries(
      Object.entries(views).map(([id, v]) => [
        id,
        {
          text: v.state.doc.textContent,
          selection: {
            anchor: v.state.selection.anchor,
            head: v.state.selection.head,
          },
          dirty: sessions[id].dirty,
          canClose: sessions[id].canClose,
          lastError: sessions[id].lastError,
          historyBoundary: sessions[id].historyBoundary,
        },
      ])
    ),
    unprotectedMedia: pending.size,
    objectURLs: Object.fromEntries(
      Object.entries(panels).map(([id, p]) => [id, p.live.length])
    ),
  };
}
async function prepareClose() {
  frozen = true;
  clearInterval(poll);
  for (const t of timers.values()) clearTimeout(t);
  editable(false);
  let safe = false;
  try {
    await Promise.allSettled([...mediaActions]);
    for (const c of [...pending.values()]) {
      const r = await rpc('/media', c);
      if (!r.durable) throw Error('MEDIA_NOT_PROTECTED');
      pending.delete(c.operationId);
    }
    safe = pending.size === 0;
    for (const s of Object.values(sessions)) {
      await s.settle();
      if (s.dirty) {
        if (!(await s.prepareClose())) safe = false;
      } else if (!s.canClose) safe = false;
    }
  } catch (e) {
    status('Close refused: ' + e.message);
    safe = false;
  }
  if (!safe) {
    frozen = false;
    editable(true);
    startPoll();
    status('Close refused: work is not saved/protected');
  }
  return { safe, capture: capture() };
}
function startPoll() {
  clearInterval(poll);
  poll = setInterval(() => {
    if (!frozen)
      refresh().catch((e) =>
        status('Reconnect needed; work retained: ' + e.message)
      );
  }, 1200);
}
async function start() {
  for (const id of ['A', 'B']) {
    sessions[id] = await EditorSession.open({
      client,
      spaceId: config.spaceId,
      pageId: 'page',
      contextId: id,
      nextId: () => crypto.randomUUID(),
      createReplica: (root, onLocal) =>
        createEditorReplica(
          root,
          () => {
            onLocal();
            autosave(id);
          },
          () => crypto.randomUUID(),
          { codec: browserCodec, canEdit: () => !frozen }
        ),
    });
    mount(id);
  }
  await refresh();
  ready = true;
  frozen = false;
  editable(true);
  status('Ready — synthetic content only. Start NC28-01.');
  native('ready', { capture: capture() });
  startPoll();
}
for (const button of document.querySelectorAll('[data-add]'))
  button.onclick = () => {
    const task = add(button.dataset.add);
    mediaActions.add(task);
    task
      .finally(() => mediaActions.delete(task))
      .catch((e) => status(e.message));
  };
document.querySelector('#retry').onclick = async () => {
  try {
    for (const c of [...pending.values()]) await queue(c);
    await rpc('/retry', {});
    await refresh();
    status('Retry complete; protected conflicts remain queued');
  } catch (e) {
    status(e.message);
  }
};
document.querySelector('#remount').onclick = async () => {
  if (!views.A) {
    mount('A');
    await panels.A.refresh();
  } else {
    views.A.destroy();
    panels.A.destroy();
    delete views.A;
    delete panels.A;
  }
};
document.querySelector('#recover').onclick = async () => {
  try {
    const r = await sessions.A.recover();
    if (!r.ok) throw Error(r.error.code);
    status('Protected A restored; Save/close will retry it');
  } catch (e) {
    status(e.message);
  }
};
document.querySelector('#save').onclick = () =>
  Promise.all(Object.values(sessions).map((s) => s.flush()))
    .then(refresh)
    .catch((e) => status(e.message));
for (const id of ['A', 'B'])
  for (const direction of ['undo', 'redo'])
    document.querySelector('#' + direction + '-' + id).onclick = () => {
      if (views[id]) {
        sessions[id].history(views[id], direction);
        autosave(id);
      }
    };
globalThis.lab28 = { capture, prepareClose, refresh, ready: () => ready };
addEventListener('focus', () => {
  if (ready && !frozen) refresh().catch((e) => status(e.message));
});
addEventListener('pagehide', () => {
  clearInterval(poll);
  for (const p of Object.values(panels)) p.destroy();
});
editable(false);
start().catch((e) => {
  status('Blocked: ' + e.message);
  native('error', { message: e.message });
});
