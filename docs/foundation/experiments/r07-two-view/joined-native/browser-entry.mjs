// The ordinary joined editors/core are unchanged; this adds native lifetime controls.
await import('../joined/browser.mjs');
let released = false;
function editable(enabled) {
  for (const id of ['A', 'B'])
    window.originLab.view(id)?.setProps({ editable: () => enabled });
}
async function prepareClose(quitting) {
  editable(false);
  const protectedContexts = [];
  try {
    await window.joined.settle();
    for (const [id, commands] of Object.entries(window.joined.pending()))
      if (commands.length) {
        await window.joined.protect(id);
        protectedContexts.push(id);
      }
    if (quitting) {
      released = true;
      const live = await window.joined.rpc({ method: 'list_recovery' });
      for (const r of live.filter(
        (r) => r.liveOwned && ['A', 'B'].includes(r.context_id)
      ))
        await window.joined.rpc(
          {
            method: 'release_context',
            operationId: crypto.randomUUID(),
            contextId: r.context_id,
            generation: r.generation,
          },
          r.context_id
        );
    }
    return { protectedContexts, quitting, snapshot: capture() };
  } catch (e) {
    if (!released) editable(true);
    throw e;
  }
}
function capture() {
  return {
    ready: true,
    at: new Date().toISOString(),
    snapshot: window.originLab.snapshot(),
    pending: Object.fromEntries(
      Object.entries(window.joined.pending()).map(([id, q]) => [id, q.length])
    ),
    historyBoundary: window.joined.authority.historyBoundary ?? null,
  };
}
window.joinedNative = {
  capture,
  prepareClose,
  async reopen() {
    released = false;
    await window.joined.authority.sync();
    editable(true);
    return capture();
  },
  async recover(contextId = 'A') {
    const list = await window.joined.rpc({ method: 'list_recovery' }),
      r = list.find((r) => r.context_id === contextId);
    if (!r) throw Error('NO_PROTECTED_CONTEXT_' + contextId);
    const root = await window.joined.rpc({ method: 'read' });
    const result = await window.joined.rpc({
      method: 'restore_protection',
      operationId: crypto.randomUUID(),
      expectedVersion: root.version,
      contextId,
      generation: r.generation,
    });
    await window.joined.authority.sync();
    return result;
  },
};
