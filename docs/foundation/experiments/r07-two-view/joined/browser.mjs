import { RemoteAuthority, fetchRoot } from './remote-authority.mjs';
const descriptor = JSON.parse(decodeURIComponent(location.hash.slice(1)));
history.replaceState(null, '', location.pathname);
const authority = new RemoteAuthority(descriptor, await fetchRoot(descriptor));
window.clutterAuthorityFactory = () => authority;
await import('../src/origin-browser.mjs');
document.title = 'Clutter joined core proof';
document.querySelector('h1').textContent = 'Joined editor + durable owner';
document.querySelector('main > p').textContent =
  'Synthetic proof. Two actual editor views; accepted Y state and receipts committed by one real owner. No production or native acceptance.';
document.querySelector('#origin-reset').disabled = true;
window.originLab.reset = () => {
  throw Error('RESET_REQUIRES_NEW_SYNTHETIC_STORE');
};
window.joined = {
  authority,
  settle: () => authority.settle(),
  rpc: (c, id) => authority.rpc(c, id),
  resume: (id) => authority.resume(id),
  protect: (id) => authority.protect(id),
  async close(id) {
    if (authority.pending.get(id)?.length) await authority.protect(id);
    window.originLab.detachView(id);
  },
  reconnect: (d) => authority.reconnect(d),
  pending: () =>
    Object.fromEntries(
      [...authority.pending].map(([id, q]) => [
        id,
        q.map((c) => structuredClone(c)),
      ])
    ),
};

const originalStatus = authority.onStatus;
authority.onStatus = () => {
  originalStatus();
  const status = document.querySelector('#origin-status');
  status.textContent =
    status.textContent.replace('local origin-aware candidate', 'SQLite owner') +
    ' · pending ' +
    [...authority.pending].map(([id, q]) => id + ':' + q.length).join(', ') +
    (authority.lastError ? ' · ' + authority.lastError : '');
};
authority.onStatus();
const paragraphs = document.querySelectorAll('main > p');
paragraphs[paragraphs.length - 1].textContent =
  'Input is provisional until the durable owner commits it. Context undo survives view detach; owner restart creates an explicit interactive-history boundary. Native, production task/asset model and installed runtime gates remain open.';
const resync = () =>
  authority.sync().catch((e) => {
    authority.lastError = e.message;
    authority.onStatus();
  });
window.addEventListener('focus', resync);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resync();
});
