import { EditorState } from 'prosemirror-state';
import { Authority, LabError, encode } from './authority.mjs';
import { fixture, textPosition } from './schema.mjs';

// Shared experiment API: both adapters below call this exact dispatcher.
export function execute(authority, command) {
  if (!command || encode(command).length > 1048576)
    throw new LabError('REQUEST_LIMIT');
  const allowed = {
    read: ['method'],
    outcome: ['method', 'id'],
    insert: ['method', 'id', 'text', 'version', 'target', 'offset'],
  }[command.method];
  if (allowed && Object.keys(command).some((key) => !allowed.includes(key)))
    throw new LabError('INVALID_REQUEST');
  if (command?.method === 'read')
    return {
      version: authority.version,
      doc: authority.doc.toJSON(),
      durableVersion: authority.durableVersion,
    };
  if (command?.method === 'outcome') {
    const outcome = authority.outcomes.get(command.id);
    return outcome ? authority.result(outcome.version) : { known: false };
  }
  if (command?.method === 'insert') {
    if (
      typeof command.text !== 'string' ||
      command.text.length > 65536 ||
      typeof command.id !== 'string' ||
      typeof (command.target ?? 'Alpha') !== 'string' ||
      !Number.isSafeInteger(command.offset ?? 0) ||
      (command.offset ?? 0) < 0 ||
      (command.offset ?? 0) > (command.target ?? 'Alpha').length
    )
      throw new LabError('INVALID_REQUEST');
    // Resolve retries before rebuilding positions against newer content.
    const known = authority.outcomes.get(command.id);
    if (known) {
      if (known.apiRequest !== encode(command))
        throw new LabError('OPERATION_ID_REUSED');
      return authority.result(known.version);
    }
    if (command.version !== authority.version)
      throw new LabError('STALE_VERSION');
    const state = EditorState.create({ doc: authority.doc });
    const pos = textPosition(
      authority.doc,
      command.target ?? 'Alpha',
      command.offset ?? 0
    );
    const tr = state.tr.insertText(command.text, pos);
    const request = {
      id: command.id,
      clientId: 'external',
      version: command.version,
      steps: tr.steps.map((s) => s.toJSON()),
    };
    return authority.submit(request, { apiRequest: encode(command) });
  }
  throw new LabError('UNKNOWN_METHOD');
}
export const openAuthority = (store) => Authority.restore(store, fixture());
