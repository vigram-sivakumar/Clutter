// Projections only. No storage APIs, document reducers or independent canonical state.
const descriptor = JSON.parse(decodeURIComponent(location.hash.slice(1)));
history.replaceState(null, '', location.pathname);
const status = document.querySelector('#status');
let serial = Promise.resolve(),
  version,
  pendingCommand;
const draft = document.querySelector('#draft'),
  save = document.querySelector('#save');
async function command(c) {
  let x;
  try {
    const r = await fetch('/rpc', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + descriptor.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        spaceId: descriptor.spaceId,
        documentId: descriptor.documentId,
        ...c,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error('HTTP_' + r.status);
    x = await r.json();
  } catch {
    throw Object.assign(Error('TRANSPORT_OUTCOME_UNKNOWN'), {
      unresolved: true,
    });
  }
  if (!x.ok) throw Error(x.error);
  return x.result;
}
function resync() {
  serial = serial
    .then(async () => {
      const r = await command({ method: 'read' });
      version = r.version;
      for (const id of ['a', 'b'])
        document.querySelector('#' + id).textContent = JSON.stringify(
          r.state,
          null,
          2
        );
      status.textContent = 'Durable version ' + version;
      window.proof.version = version;
    })
    .catch((e) => (status.textContent = e.message));
  return serial;
}
window.proof = { command, resync, version };
document.querySelector('#resync').onclick = resync;
save.onclick = async () => {
  pendingCommand ??= {
    method: 'insert',
    operationId: crypto.randomUUID(),
    expectedVersion: version,
    target: 'Alpha',
    offset: 0,
    text: draft.value,
  };
  draft.disabled = true;
  save.disabled = true;
  try {
    const r = await command(pendingCommand);
    status.textContent = r.status;
    if (r.status === 'applied') {
      pendingCommand = null;
      draft.value = '';
      draft.disabled = false;
      await resync();
    }
  } catch (e) {
    status.textContent = e.message;
    if (!e.unresolved) {
      pendingCommand = null;
      draft.disabled = false;
    }
  } finally {
    save.disabled = false;
    save.textContent = pendingCommand
      ? 'Retry unresolved operation'
      : 'Insert before Alpha';
  }
};
window.addEventListener('focus', resync);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resync();
});
await resync();
try {
  const r = await fetch('/events', {
    headers: { authorization: 'Bearer ' + descriptor.token },
  });
  if (!r.ok) throw Error('EVENT_AUTH');
  const reader = r.body.getReader(),
    decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let i;
    while ((i = pending.indexOf('\n\n')) >= 0) {
      const event = pending.slice(0, i);
      pending = pending.slice(i + 2);
      if (event.startsWith('data:')) await resync();
    }
  }
} catch {
  status.textContent += ' (notifications disconnected; resync from authority)';
}
