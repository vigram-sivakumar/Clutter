import { CoreClient } from '@clutter/foundation-runtime';
import { EditorWorkspace } from '@clutter/foundation-ui';
const config = globalThis.__clutterFoundation;
if (
  !config ||
  config.url !== location.origin ||
  !config.token ||
  !config.windowId
)
  throw Error('HOST_BOOTSTRAP_REQUIRED');
const status = (text) => {
  // A completed request must not update a document after its view is torn down.
  const target = globalThis.document?.querySelector('#status');
  if (target) target.textContent = text;
};
const client = new CoreClient(async (c) => {
  const r = await fetch(config.url + '/api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + config.token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(c),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error('CONNECTION_UNAVAILABLE');
  return r.json();
});
const workspace = new EditorWorkspace({
  client,
  spaceId: config.spaceId,
  pageId: 'page',
  windowId: config.windowId,
  onStatus: status,
});
let ready = false,
  poll;
const refresh = () =>
  workspace
    .sync()
    .catch(() => status('Connection unavailable; work remains in this window'));
const native = (m) => globalThis.__clutterFoundationEvent?.(m);
for (const id of ['a', 'b'])
  for (const direction of ['undo', 'redo']) {
    const b = document.querySelector('#' + direction + '-' + id);
    b.onmousedown = (e) => {
      if (e.button === 0) e.preventDefault();
    };
    b.onclick = () => workspace.history(id, direction);
  }
document.querySelector('#remount').onclick = () =>
  workspace
    .remount('a', document.querySelector('#editor-a'))
    .catch(() => status('View could not reopen; context retained'));
document.querySelector('#save').onclick = () =>
  workspace.flush().catch(() => status('Work remains pending'));
document.querySelector('#recover').onclick = () =>
  workspace
    .recover('a')
    .catch(() => status('No recoverable work is available'));
function buttons(value) {
  for (const b of document.querySelectorAll('button')) b.disabled = !value;
}
globalThis.foundationWindow = {
  prepareClose: async () => {
    buttons(false);
    clearInterval(poll);
    const r = await workspace.prepareClose();
    if (!r.safe) {
      buttons(true);
      startPoll();
    }
    return r;
  },
  capture: () => ({
    ready,
    views: Object.fromEntries(
      [...workspace.views].map(([id, e]) => [
        id,
        { text: e.view.state.doc.textContent, dirty: e.lease.session.dirty },
      ])
    ),
  }),
};
function startPoll() {
  clearInterval(poll);
  poll = setInterval(() => {
    if (!workspace.frozen) void refresh();
  }, 1000);
}
addEventListener('focus', () => {
  if (ready && !workspace.frozen) void refresh();
});
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    status('Reload is disabled in this build; close and reopen safely');
  }
});
buttons(false);
(async () => {
  for (const id of ['a', 'b'])
    await workspace.mount(id, document.querySelector('#editor-' + id));
  await workspace.sync();
  ready = true;
  buttons(true);
  status('Saved');
  startPoll();
  native({ event: 'ready' });
})().catch(() => {
  status('Could not connect. Your existing Space was not replaced.');
  native({ event: 'error' });
});
