// Native credentials are injected in memory for each document. No web storage.
export function consumeBootstrap() {
  const native = globalThis.__clutterBootstrap;
  delete globalThis.__clutterBootstrap;
  const encoded = location.hash.slice(1);
  if (!native && !encoded) throw Error('MISSING_BOOTSTRAP_REOPEN_SAME_SESSION');
  const d = native ?? JSON.parse(decodeURIComponent(encoded));
  const u = new URL(d.url);
  if (
    u.origin !== location.origin ||
    u.pathname !== '/rpc' ||
    typeof d.token !== 'string' ||
    !d.editorGrants?.A ||
    !d.editorGrants?.B ||
    typeof d.spaceId !== 'string' ||
    typeof d.documentId !== 'string'
  )
    throw Error('INVALID_BOOTSTRAP');
  history.replaceState(null, '', location.pathname);
  return d;
}
