import { CoreClient } from '@clutter/core';
import { mountWorkspace } from '@clutter/ui/app';
const config = globalThis.__clutterHost;
if (
  !config ||
  config.url !== location.origin ||
  !config.token ||
  !config.windowId
)
  throw Error('HOST_BOOTSTRAP_REQUIRED');
const client = new CoreClient(async (command) => {
  const r = await fetch(config.url + '/api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + config.token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error('CONNECTION_UNAVAILABLE');
  return r.json();
});
const { model } = mountWorkspace(document.querySelector('#app'), {
  client,
  ...config,
  stateStore: {
    load: () => windowState({ action: 'read' }),
    save: (record) => windowState({ action: 'write', ...record }),
  },
});
async function windowState(request) {
  const r = await fetch(config.url + '/view-state', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + config.token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...request, windowId: config.windowId }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await r.json();
  if (!r.ok || !result.ok) throw Error('WINDOW_STATE_UNAVAILABLE');
  return result.value;
}
let ready = false;
let syncing = false;
const sync = async () => {
  if (syncing || !ready || model.frozen) return;
  syncing = true;
  try {
    await model.sync();
  } catch {
    model.notify('Connection unavailable. Pending work is retained.');
  } finally {
    syncing = false;
  }
};
const poll = setInterval(sync, 1000);
addEventListener('focus', sync);
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    model.notify('Close and reopen safely to reload this development build.');
  }
});
globalThis.clutterWindow = {
  prepareClose: async () => {
    const result = await model.prepareClose();
    if (result.safe) clearInterval(poll);
    return result;
  },
};
model
  .start()
  .then(() => {
    ready = true;
    globalThis.__clutterHostEvent?.({ event: 'ready' });
  })
  .catch(() => {
    model.notify('Could not connect. Your Space was not replaced.');
    globalThis.__clutterHostEvent?.({ event: 'error' });
  });
