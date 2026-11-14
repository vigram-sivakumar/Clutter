import * as Y from 'yjs';
import { schema } from '../src/schema.mjs';
import { yDocToProsemirror } from 'y-prosemirror';
import { OriginAuthority } from '../src/origin-authority.mjs';
import { documentChange } from '../src/change-footprint.mjs';
const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const base64 = (b) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
export class RemoteAuthority extends OriginAuthority {
  constructor(descriptor, root) {
    super();
    this.transportQueuesPaused = true;
    this.doc.destroy();
    this.doc = new Y.Doc();
    this.descriptor = descriptor;
    this.pending = new Map();
    this.generation = new Map();
    this.tags = new Map();
    this.busy = null;
    this.lastError = null;
    this.applyRoot(root);
    this.watch();
  }
  async rpc(c, id) {
    let envelope;
    try {
      const r = await fetch(this.descriptor.url, {
        method: 'POST',
        headers: {
          authorization:
            'Bearer ' +
            (id ? this.descriptor.editorGrants[id] : this.descriptor.token),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          spaceId: this.descriptor.spaceId,
          documentId: this.descriptor.documentId,
          ...c,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error();
      envelope = await r.json();
    } catch {
      throw Object.assign(Error('TRANSPORT_OUTCOME_UNKNOWN'), {
        unknown: true,
      });
    }
    if (!envelope.ok) throw Error(envelope.error);
    return envelope.result;
  }
  applyRoot(root) {
    if (
      root.spaceId !== this.descriptor.spaceId ||
      root.documentId !== this.descriptor.documentId
    )
      throw Error('WRONG_DESTINATION');
    if (this.epoch === root.ownerEpoch && root.version < this.version) return;
    if (
      this.epoch &&
      this.epoch !== root.ownerEpoch &&
      root.version < this.version
    )
      throw Error('DURABLE_VERSION_REGRESSION');
    if (this.epoch && this.epoch !== root.ownerEpoch) {
      for (const p of this.peers.values()) p.history?.manager.clear();
      this.historyBoundary = 'OWNER_RESTART';
    }
    for (const head of root.recoveryHeads ?? [])
      this.generation.set(
        head.context_id,
        Math.max(this.generation.get(head.context_id) ?? 0, head.generation)
      );
    this.epoch = root.ownerEpoch;
    this.serverVersion = root.version;
    Y.applyUpdate(this.doc, bytes(root.state.payload), this.remoteOrigin);
    this.changes = [];
    for (let i = 1; i < root.roots.length; i++)
      this.changes.push(
        documentChange(
          schema.nodeFromJSON(root.roots[i - 1].doc),
          schema.nodeFromJSON(root.roots[i].doc),
          root.roots[i].contextId,
          i
        )
      );
    for (const p of this.peers.values())
      if (!this.paused.has(p.id))
        Y.applyUpdate(
          p.doc,
          Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(p.doc)),
          this.remoteOrigin
        );
    this.onStatus();
  }
  get version() {
    return this.serverVersion ?? 0;
  }
  async sync() {
    const root = await this.rpc({ method: 'read' });
    this.applyRoot(root);
    return root;
  }
  submit(peer) {
    const queue = this.pending.get(peer.id) ?? [];
    queue.push({
      method: 'editor_update',
      contextId: peer.id,
      operationId: crypto.randomUUID(),
      baseVersion: this.version,
      payload: base64(Y.encodeStateAsUpdate(peer.doc)),
    });
    this.pending.set(peer.id, queue);
    if (!this.paused.has(peer.id) && !peer.blocked) this.flush();
    return true;
  }
  async flush() {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      for (const p of this.peers.values()) {
        const queue = this.pending.get(p.id) ?? [];
        if (this.paused.has(p.id) || p.blocked) continue;
        while (queue.length) {
          const c = queue[0];
          try {
            let r = await this.rpc(c, p.id);
            if (r.status === 'uncertain') {
              r = await this.rpc({
                method: 'outcome',
                operationId: c.operationId,
              });
              if (!r)
                throw Object.assign(Error('OUTCOME_UNRESOLVED'), {
                  unknown: true,
                });
            }
            if (!['applied', 'recorded'].includes(r.status))
              throw Error('NOT_ACCEPTED');
            this.lastReceipt = r;
            const tag = this.tags.get(c.operationId);
            if (tag) {
              const v = await this.rpc({
                method: 'read_version',
                version: r.version,
              });
              const d = schema.nodeFromJSON(v.state.doc);
              d.descendants((n, pos) => {
                if (n.type.name === 'table' && tag.pending) {
                  tag.scope = { from: pos, to: pos + n.nodeSize };
                  tag.version = r.version;
                  tag.pending = false;
                }
              });
              this.tags.delete(c.operationId);
            }
            await this.sync();
            queue.shift();
            p.transportError = null;
          } catch (e) {
            p.blocked = true;
            p.transportError = e.message;
            this.lastError = e.message;
            this.onStatus();
            break;
          }
        }
      }
    })().finally(() => {
      this.busy = null;
      this.lastError =
        [...this.peers.values()].map((p) => p.transportError).find(Boolean) ??
        null;
      this.onStatus();
    });
    return this.busy;
  }
  tagHistory(id, tag) {
    const c = this.pending.get(id)?.at(-1);
    if (c) {
      tag.pending = true;
      this.tags.set(c.operationId, tag);
    }
    return tag;
  }
  async resume(id) {
    this.paused.delete(id);
    const p = this.peers.get(id);
    p.blocked = false;
    p.transportError = null;
    await this.flush();
    await this.sync();
  }
  async settle() {
    await this.flush();
    await this.sync();
    return {
      version: this.version,
      pending: Object.fromEntries(
        [...this.pending].map(([id, q]) => [id, q.length])
      ),
      error: this.lastError,
    };
  }
  async protect(id) {
    const p = this.peers.get(id),
      generation = (this.generation.get(id) ?? 0) + 1;
    this.generation.set(id, generation);
    return this.rpc(
      {
        method: 'protect',
        operationId: crypto.randomUUID(),
        contextId: id,
        generation,
        baseVersion: this.pending.get(id)?.[0]?.baseVersion ?? this.version,
        state: {
          payload: base64(Y.encodeStateAsUpdate(p.doc)),
          doc: yDocToProsemirror(schema, p.doc).toJSON(),
          attachments: [],
        },
      },
      id
    );
  }
  async reconnect(descriptor) {
    if (
      descriptor.spaceId !== this.descriptor.spaceId ||
      descriptor.documentId !== this.descriptor.documentId
    )
      throw Error('WRONG_DESTINATION');
    this.abort?.abort();
    await this.busy?.catch(() => {});
    this.descriptor = descriptor;
    await this.sync();
    this.watch();
  }
  async watch() {
    this.abort = new AbortController();
    try {
      const r = await fetch(new URL('/events', this.descriptor.url), {
        headers: { authorization: 'Bearer ' + this.descriptor.token },
        signal: this.abort.signal,
      });
      if (!r.ok) return;
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        let end;
        while ((end = text.indexOf('\n\n')) >= 0) {
          const event = text.slice(0, end);
          text = text.slice(end + 2);
          if (event.startsWith('data:')) await this.sync();
        }
      }
    } catch {}
  }
  // Browser cache is never an acceptance path. External callers use stable owner commands.
  insertExternal() {
    throw Error('USE_DURABLE_COMMAND_CLIENT');
  }
  destroy() {
    this.abort?.abort();
    super.destroy();
  }
}
export async function fetchRoot(descriptor) {
  const r = await fetch(descriptor.url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + descriptor.token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      spaceId: descriptor.spaceId,
      documentId: descriptor.documentId,
      method: 'read',
    }),
  });
  const e = await r.json();
  if (!e.ok) throw Error(e.error);
  return e.result;
}
