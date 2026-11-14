import { Step } from 'prosemirror-transform';
import { schema, validateDocument } from './schema.mjs';

export const encode = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]])
        )
      : v
  );
const copy = (value) => JSON.parse(encode(value));
export class LabError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
// One in-process authority. OS/process authentication, compaction and production
// domain commands are deliberately outside this experiment.
export class Authority {
  constructor(doc, store = null) {
    validateDocument(doc);
    this.genesis = doc;
    this.doc = doc;
    this.steps = [];
    this.clients = [];
    this.outcomes = new Map();
    this.store = store;
    this.durableVersion = 0;
    this.saveError = null;
  }
  get version() {
    return this.steps.length;
  }
  static restore(store, fallback) {
    const saved = store.read();
    if (!saved) return new Authority(fallback, store);
    if (
      saved.format !== 'clutter-r07-v1' ||
      !Array.isArray(saved.steps) ||
      saved.steps.length > 10000 ||
      saved.steps.length !== saved.clients?.length
    )
      throw new LabError('INVALID_SNAPSHOT');
    const a = new Authority(schema.nodeFromJSON(saved.genesis), store);
    for (const json of saved.steps) {
      const result = Step.fromJSON(schema, json).apply(a.doc);
      if (result.failed) throw new LabError('INVALID_REPLAY');
      a.doc = result.doc;
      a.steps.push(json);
    }
    validateDocument(a.doc);
    if (!a.doc.eq(schema.nodeFromJSON(saved.doc)))
      throw new LabError('SNAPSHOT_MISMATCH');
    a.clients = saved.clients;
    a.outcomes = new Map(saved.outcomes);
    a.durableVersion = a.version;
    return a;
  }
  snapshot() {
    return {
      format: 'clutter-r07-v1',
      genesis: this.genesis.toJSON(),
      doc: this.doc.toJSON(),
      steps: copy(this.steps),
      clients: [...this.clients],
      outcomes: [...this.outcomes],
    };
  }
  submit(request, metadata = {}) {
    if (!request || encode(request).length > 1048576)
      throw new LabError('REQUEST_LIMIT');
    const { id, clientId, version, steps } = request;
    if (
      typeof id !== 'string' ||
      !id ||
      id.length > 128 ||
      typeof clientId !== 'string' ||
      !clientId ||
      clientId.length > 64 ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      !Array.isArray(steps) ||
      steps.length < 1 ||
      steps.length > 100
    )
      throw new LabError('INVALID_REQUEST');
    const fingerprint = encode(request);
    const known = this.outcomes.get(id);
    if (known) {
      if (known.fingerprint !== fingerprint)
        throw new LabError('OPERATION_ID_REUSED');
      return this.result(known.version);
    }
    if (version !== this.version) throw new LabError('STALE_VERSION');
    if (this.version + steps.length > 10000) throw new LabError('LAB_CAPACITY');
    let next = this.doc;
    for (const json of steps) {
      const result = Step.fromJSON(schema, json).apply(next);
      if (result.failed) throw new LabError('INVALID_STEP');
      next = result.doc;
    }
    if (encode(next.toJSON()).length > 1048576)
      throw new LabError('LAB_DOCUMENT_LIMIT');
    validateDocument(next); // Whole batch validates before any authoritative effect.
    this.doc = next;
    this.steps.push(...copy(steps));
    this.clients.push(...steps.map(() => clientId));
    this.outcomes.set(id, { fingerprint, version: this.version, ...metadata });
    this.save();
    return this.result(this.version);
  }
  result(version) {
    return {
      accepted: true,
      version,
      durable: !!this.store && this.durableVersion >= version,
      saveError: this.saveError,
    };
  }
  save() {
    if (!this.store) return false;
    try {
      this.store.write(this.snapshot());
      this.durableVersion = this.version;
      this.saveError = null;
      return true;
    } catch {
      this.saveError = 'SAVE_FAILED';
      return false;
    }
  }
  protectBeforeClose() {
    if (this.store && this.save()) return { protected: true, via: 'snapshot' };
    if (!this.store) throw new LabError('CLOSE_BLOCKED');
    try {
      this.store.protect(this.snapshot());
      return { protected: true, via: 'recovery' };
    } catch {
      throw new LabError('CLOSE_BLOCKED');
    }
  }
  since(version) {
    if (!Number.isSafeInteger(version) || version < 0 || version > this.version)
      throw new LabError('INVALID_VERSION');
    return {
      steps: this.steps
        .slice(version)
        .map((json) => Step.fromJSON(schema, json)),
      clients: this.clients.slice(version),
    };
  }
}
// Test-only adapter with separate save/protection fault controls.
export class MemoryStore {
  constructor() {
    this.saved = null;
    this.recovery = null;
    this.failSave = false;
    this.failProtect = false;
  }
  read() {
    return copy(this.recovery ?? this.saved);
  }
  write(snapshot) {
    if (this.failSave) throw new Error('injected save failure');
    this.saved = copy(snapshot);
    this.recovery = null;
  }
  protect(snapshot) {
    if (this.failProtect) throw new Error('injected protection failure');
    this.recovery = copy(snapshot);
  }
}
