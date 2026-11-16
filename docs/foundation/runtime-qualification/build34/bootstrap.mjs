// Host port only. Browser/Core code and prepareClose policy remain shared.
export const eventScheme = 'clutter-host34:';
export function bootstrap(ui, bootNonce) {
  const url = new URL(ui.url);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error('HOST_BOOTSTRAP_ORIGIN');
  if (
    typeof bootNonce !== 'string' ||
    !bootNonce.length ||
    typeof ui.token !== 'string'
  )
    throw Error('HOST_BOOTSTRAP_INVALID');
  return `(() => {
    if (location.origin !== ${JSON.stringify(url.origin)} || location.pathname !== '/') return;
    const nonce = ${JSON.stringify(bootNonce)};
    Object.defineProperty(globalThis, '__clutterCore28Bootstrap', {value:${JSON.stringify(ui)}, configurable:false});
    const emit = message => { location.href = 'clutter-host34://event/?m=' + encodeURIComponent(JSON.stringify({...message,bootNonce:nonce})); };
    Object.defineProperty(globalThis, '__clutterHostEvent', {value: message => {
      if (message?.action === 'ready') emit({event:'ready'});
      else if (message?.action === 'error') emit({event:'error'});
      else if (message?.action === 'pdf') {
        document.querySelector('#status').textContent = 'PDF host bridge is not included in build34 build-smoke scope';
        emit({event:'pdf-not-qualified'});
      }
    }});
    Object.defineProperty(globalThis, '__host34Close', {value: async guardNonce => {
      let safe = false;
      try { safe = (await globalThis.lab28?.prepareClose())?.safe === true; } catch {}
      emit({event:'close',guardNonce,safe});
    }});
  })();`;
}
export function decodeEvent(address, nonce) {
  try {
    const url = new URL(address);
    if (url.protocol !== eventScheme || url.hostname !== 'event') return null;
    const payload = url.searchParams.get('m');
    if (!payload || payload.length > 8192) return null;
    const m = JSON.parse(payload);
    if (
      m.bootNonce !== nonce ||
      !['ready', 'error', 'close', 'pdf-not-qualified'].includes(m.event)
    )
      return null;
    if (
      m.event === 'close' &&
      (typeof m.guardNonce !== 'string' || typeof m.safe !== 'boolean')
    )
      return null;
    return m;
  } catch {
    return null;
  }
}
