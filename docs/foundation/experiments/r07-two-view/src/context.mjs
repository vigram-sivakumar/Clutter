import { EditorState } from 'prosemirror-state';
import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from 'prosemirror-collab';
import { history, undo, redo, closeHistory } from 'prosemirror-history';
import { schema } from './schema.mjs';
import { historySafety } from './history-guard.mjs';

export class Context {
  constructor(authority, id, plugins = []) {
    this.authority = authority;
    this.id = id;
    this.sequence = Math.max(
      0,
      ...[...authority.outcomes.keys()]
        .filter((k) => k.startsWith(id + ':'))
        .map((k) => Number(k.slice(id.length + 1)) || 0)
    );
    this.guardHistory = true;
    this.historyError = null;
    this.recovery = [];
    this.onChange = () => {};
    this.onBackup = () => {};
    this.state = EditorState.create({
      schema,
      doc: authority.doc,
      plugins: [
        history({ depth: 100, newGroupDelay: 500 }),
        collab({ version: authority.version, clientID: id }),
        ...plugins,
      ],
    });
  }
  apply(tr) {
    this.state = this.state.apply(tr);
    this.backup();
    this.onChange();
  }
  backup() {
    // Retain a synthetic local recovery record before rebase. Persistence of
    // this record is supplied by the shell, not implied by this in-memory class.
    const checkpoint = {
      context: this.id,
      base: getVersion(this.state),
      doc: this.state.doc.toJSON(),
      pending: sendableSteps(this.state)?.steps.map((s) => s.toJSON()) ?? [],
      recovery: this.recovery,
    };
    try {
      this.onBackup(checkpoint);
      this.backupError = null;
    } catch {
      this.backupError = 'CLIENT_BACKUP_FAILED';
      this.lastUnprotectedBackup = checkpoint;
    }
  }
  pull() {
    const data = this.authority.since(getVersion(this.state));
    if (!data.steps.length) return;
    const pending = sendableSteps(this.state);
    const before = this.state.doc.toJSON();
    let confirmed = 0;
    while (
      confirmed < data.clients.length &&
      data.clients[confirmed] === this.id
    )
      confirmed++;
    const next = this.state.apply(
      receiveTransaction(this.state, data.steps, data.clients, {
        mapSelectionBackward: true,
      })
    );
    const remaining = sendableSteps(next)?.steps.length ?? 0;
    if (pending && remaining < pending.steps.length - confirmed) {
      this.recovery.push({
        reason: 'REBASE_DROPPED_STEP',
        doc: before,
        steps: pending.steps.map((s) => s.toJSON()),
      });
    }
    this.state = next;
    this.backup();
    this.onChange();
  }
  push() {
    const data = sendableSteps(this.state);
    if (!data) return null;
    const result = this.authority.submit({
      id: this.id + ':' + ++this.sequence,
      clientId: this.id,
      version: data.version,
      steps: data.steps.map((s) => s.toJSON()),
    });
    this.pull();
    return result;
  }
  sync() {
    this.pull();
    return this.push();
  }
  insert(text, from, to) {
    const start = from ?? this.state.selection.from;
    const end = to ?? (from === undefined ? this.state.selection.to : start);
    this.apply(this.state.tr.insertText(text, start, end));
  }
  boundary() {
    this.apply(closeHistory(this.state.tr));
  }
  history(command) {
    this.pull();
    let applied = false;
    this.historyError = null;
    command(this.state, (tr) => {
      const error = this.guardHistory ? historySafety(this, tr) : null;
      if (error) {
        this.historyError = error;
        return;
      }
      this.apply(tr);
      applied = true;
    });
    return applied;
  }
  undo() {
    return this.history(undo);
  }
  redo() {
    return this.history(redo);
  }
  get pending() {
    return sendableSteps(this.state)?.steps.length ?? 0;
  }
}
export function settle(...contexts) {
  for (let round = 0; round < 50; round++) {
    for (const c of contexts) c.sync();
    if (
      contexts.every(
        (c) => !c.pending && getVersion(c.state) === c.authority.version
      )
    )
      return;
  }
  throw new Error('LAB_DID_NOT_SETTLE');
}
