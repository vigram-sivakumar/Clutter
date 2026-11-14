import * as Y from 'yjs';
import { prosemirrorToYDoc, yDocToProsemirror } from 'y-prosemirror';
import { fixture, schema, validateDocument } from './schema.mjs';

// Separate history candidate: accepted Y.Doc plus per-context provisional replicas.
// This is local-only delivery, not a provider protocol or production vault format.
export class OriginAuthority {
  constructor() {
    this.doc = prosemirrorToYDoc(fixture());
    this.remoteOrigin = Object.freeze({ authorityDelivery: true });
    this.peers = new Map();
    this.paused = new Set();
    this.version = 0;
    this.latestOriginVersion = new Map();
    this.onStatus = () => {};
  }
  read() {
    return yDocToProsemirror(schema, this.doc);
  }
  attach(id) {
    if (this.peers.has(id)) throw new Error('DUPLICATE_CONTEXT');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(this.doc), this.remoteOrigin);
    const peer = { id, doc, queued: [], rejected: [], error: null };
    this.peers.set(id, peer);
    doc.on('update', (update, origin) => {
      if (origin === this.remoteOrigin || peer.error) return;
      if (this.paused.has(id)) {
        peer.queued.push(update.slice());
        return;
      }
      this.submit(peer, update);
    });
    return peer;
  }
  submit(peer, update) {
    if (update.byteLength > 1048576) {
      peer.error = 'UPDATE_LIMIT';
      this.onStatus();
      return false;
    }
    // Validate a staged candidate before changing the accepted document.
    const staged = new Y.Doc();
    try {
      Y.applyUpdate(staged, Y.encodeStateAsUpdate(this.doc));
      Y.applyUpdate(staged, update);
      validateDocument(yDocToProsemirror(schema, staged));
    } catch {
      peer.error = 'INVALID_CANDIDATE_UPDATE';
      peer.rejected.push({
        update: Array.from(update),
        fullReplicaUpdate: Array.from(Y.encodeStateAsUpdate(peer.doc)),
      });
      this.onStatus();
      return false;
    } finally {
      staged.destroy();
    }
    let changed = false;
    const change = () => {
      changed = true;
    };
    this.doc.on('update', change);
    try {
      Y.applyUpdate(this.doc, update, peer.id);
    } finally {
      this.doc.off('update', change);
    }
    if (changed) {
      this.version++;
      this.latestOriginVersion.set(peer.id, this.version);
    }
    this.deliver();
    this.onStatus();
    return true;
  }
  deliver() {
    for (const peer of this.peers.values())
      if (!this.paused.has(peer.id) && !peer.error) {
        Y.applyUpdate(
          peer.doc,
          Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(peer.doc)),
          this.remoteOrigin
        );
      }
  }
  pause(id) {
    this.paused.add(id);
  }
  resume(id) {
    const peer = this.peers.get(id);
    this.paused.delete(id);
    const queued = peer.queued;
    peer.queued = [];
    for (const update of queued) if (!this.submit(peer, update)) break;
    this.deliver();
  }
  hasForeignSince(id, version) {
    return [...this.latestOriginVersion].some(
      ([origin, last]) => origin !== id && last > version
    );
  }
  destroy() {
    for (const peer of this.peers.values()) peer.doc.destroy();
    this.doc.destroy();
  }
}
