import * as Y from 'yjs';
import { StepMap } from 'prosemirror-transform';
import { OriginHistoryContext } from './origin-history-context.mjs';
import { touches, mapRange, validRange } from './change-footprint.mjs';
import {
  prosemirrorToYDoc,
  yDocToProsemirror,
  initProseMirrorDoc,
  absolutePositionToRelativePosition,
} from 'y-prosemirror';
import { fixture, schema, validateDocument, textPosition } from './schema.mjs';

// Separate history candidate: accepted Y.Doc plus per-context provisional replicas.
// This is local-only delivery, not a provider protocol or production vault format.
export class OriginAuthority {
  constructor() {
    this.doc = prosemirrorToYDoc(fixture());
    this.remoteOrigin = Object.freeze({ authorityDelivery: true });
    this.peers = new Map();
    this.paused = new Set();
    this.changes = [];
    this.onStatus = () => {};
  }
  get version() {
    return this.changes.length;
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
    const before = this.read();
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
      const after = this.read(),
        from = before.content.findDiffStart(after.content),
        end = before.content.findDiffEnd(after.content);
      // A conservative PM token span; store only positional metadata, not roots.
      const start = from ?? 0;
      let to = end?.a ?? before.content.size,
        newTo = end?.b ?? after.content.size;
      // Equal prefix/suffix runs can overlap on pure insertion/deletion. Keep
      // a valid conservative replacement map instead of a negative old span.
      const overlap = Math.max(0, start - Math.min(to, newTo));
      to += overlap;
      newTo += overlap;
      this.changes.push({
        version: this.version + 1,
        origin: peer.id,
        from: start,
        to,
        newTo,
      });
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
  insertExternal({ target, offset, text }) {
    const peer = this.peers.get('external') ?? this.attach('external');
    if (peer.error) throw new Error(peer.error);
    const fragment = peer.doc.getXmlFragment('prosemirror');
    const { doc, mapping } = initProseMirrorDoc(fragment, schema);
    const pos = textPosition(doc, target, offset);
    const relative = absolutePositionToRelativePosition(pos, fragment, mapping);
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      relative,
      peer.doc
    );
    if (!(absolute?.type instanceof Y.XmlText))
      throw new Error('NOT_TEXT_TARGET');
    // Public Y text operation, no hidden EditorView and no second canonical model.
    peer.doc.transact(
      () => absolute.type.insert(absolute.index, text),
      'external-command'
    );
    if (peer.error) throw new Error(peer.error);
  }
  historyContext(id) {
    const peer = this.peers.get(id);
    if (!peer) throw new Error('UNKNOWN_CONTEXT');
    return (peer.history ??= new OriginHistoryContext(
      peer.doc.getXmlFragment('prosemirror'),
      schema
    ));
  }
  mapScopeSince(version, scope) {
    if (
      !validRange(scope) ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > this.version
    )
      throw new Error('INVALID_HISTORY_SCOPE');
    let current = { ...scope };
    for (const change of this.changes)
      if (change.version > version)
        current = mapRange(
          current,
          new StepMap([
            change.from,
            change.to - change.from,
            change.newTo - change.from,
          ])
        );
    return current;
  }
  hasForeignInScope(id, version, scope) {
    if (
      !validRange(scope) ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > this.version
    )
      return true;
    let current = { ...scope };
    for (const change of this.changes) {
      if (change.version <= version) continue;
      if (change.origin !== id && touches(current, change.from, change.to))
        return true;
      current = mapRange(
        current,
        new StepMap([
          change.from,
          change.to - change.from,
          change.newTo - change.from,
        ])
      );
    }
    return false;
  }
  destroy() {
    for (const peer of this.peers.values()) {
      peer.history?.destroy();
      peer.doc.destroy();
    }
    this.doc.destroy();
  }
}
