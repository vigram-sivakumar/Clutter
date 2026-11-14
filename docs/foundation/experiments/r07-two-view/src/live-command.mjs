// Experiment-only shared ingress. Shell/CLI/MCP transport adapters own no document.
// Cache receipts, not document copies; the engine remains the sole accepted state.
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]])
        )
      : v
  );
const copy = (value) => JSON.parse(canonical(value));
const fail = (code) => {
  throw new Error(code);
};
export const commandSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['method', 'session'],
  properties: {
    method: { enum: ['read', 'insert', 'outcome'] },
    session: { type: 'string' },
    id: { type: 'string' },
    version: { type: 'integer', minimum: 0 },
    target: { type: 'string' },
    offset: { type: 'integer', minimum: 0 },
    text: { type: 'string' },
  },
};
export function liveCommands(adapter, session = crypto.randomUUID()) {
  const receipts = new Map();
  const fields = {
    read: ['method', 'session'],
    outcome: ['method', 'session', 'id'],
    insert: ['method', 'session', 'id', 'version', 'target', 'offset', 'text'],
  };
  return (command) => {
    if (!command || typeof command !== 'object' || Array.isArray(command))
      fail('INVALID_REQUEST');
    const encoded = canonical(command);
    if (encoded.length > 1048576) fail('REQUEST_LIMIT');
    const allowed = Object.hasOwn(fields, command.method)
      ? fields[command.method]
      : null;
    if (!allowed || Object.keys(command).some((k) => !allowed.includes(k)))
      fail('INVALID_REQUEST');
    if (command.session !== session) fail('STALE_SESSION');
    if (command.method === 'read')
      return copy({
        session,
        ...adapter.read(),
        durability: 'ephemeral-lab-session',
      });
    if (
      typeof command.id !== 'string' ||
      !command.id.length ||
      command.id.length > 128
    )
      fail('INVALID_REQUEST');
    if (command.method === 'outcome')
      return copy(
        receipts.get(command.id)?.result ?? { session, known: false }
      );
    if (
      typeof command.target !== 'string' ||
      !command.target.length ||
      typeof command.text !== 'string' ||
      !command.text.length ||
      command.text.length > 65536 ||
      !Number.isSafeInteger(command.version) ||
      command.version < 0 ||
      !Number.isSafeInteger(command.offset) ||
      command.offset < 0 ||
      command.offset > command.target.length
    )
      fail('INVALID_REQUEST');
    const known = receipts.get(command.id);
    if (known) {
      if (known.request !== encoded) fail('OPERATION_ID_REUSED');
      return copy(known.result);
    }
    if (receipts.size >= 1024) fail('SESSION_OPERATION_LIMIT');
    const before = adapter.read();
    if (command.version !== before.version) fail('STALE_VERSION');
    // Resolve all preconditions before mutation; only the engine can accept it.
    adapter.insert(command);
    const after = adapter.read();
    if (after.version <= before.version) fail('NOT_ACCEPTED');
    const result = {
      session,
      accepted: true,
      id: command.id,
      version: after.version,
      durability: 'ephemeral-lab-session',
    };
    receipts.set(command.id, { request: encoded, result });
    return copy(result);
  };
}
