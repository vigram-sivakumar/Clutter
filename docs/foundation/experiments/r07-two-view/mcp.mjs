import { FileStore } from './src/file-store.mjs';
import { openAuthority, execute } from './src/api.mjs';
// Scoped test adapter, no network listener or production grant/authentication.
// stdout is reserved exclusively for newline-delimited JSON-RPC responses.
if (process.argv.length !== 4 || process.argv[2] !== '--store') {
  process.stderr.write('Use --store NEW_LAB_DIRECTORY\n');
  process.exit(1);
}
const store = new FileStore(process.argv[3]);
const authority = openAuthority(store);
const inputSchema = {
  type: 'object',
  properties: {
    method: { enum: ['read', 'insert', 'outcome'] },
    id: { type: 'string' },
    version: { type: 'integer', minimum: 0 },
    target: { type: 'string' },
    offset: { type: 'integer', minimum: 0 },
    text: { type: 'string' },
  },
  required: ['method'],
  additionalProperties: false,
};
let initialized = false;
const respond = (value) => process.stdout.write(JSON.stringify(value) + '\n');
function handle(message) {
  if (
    !message ||
    message.jsonrpc !== '2.0' ||
    typeof message.method !== 'string'
  )
    return respond({
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32600, message: 'Invalid request' },
    });
  if (message.id === undefined) return; // Includes notifications/initialized; no notifications have effects.
  const envelope = { jsonrpc: '2.0', id: message.id };
  if (message.method === 'initialize') {
    if (message.params?.protocolVersion !== '2025-11-25')
      return respond({
        ...envelope,
        error: { code: -32602, message: 'Experiment pins protocol 2025-11-25' },
      });
    initialized = true;
    return respond({
      ...envelope,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'clutter-r07-lab', version: '0.1.0' },
      },
    });
  }
  if (!initialized)
    return respond({
      ...envelope,
      error: { code: -32000, message: 'Initialize first' },
    });
  if (message.method === 'ping') return respond({ ...envelope, result: {} });
  if (message.method === 'tools/list')
    return respond({
      ...envelope,
      result: {
        tools: [
          {
            name: 'lab_command',
            description: 'Synthetic experiment-only document operations',
            inputSchema,
          },
        ],
      },
    });
  if (message.method !== 'tools/call')
    return respond({
      ...envelope,
      error: { code: -32601, message: 'Method not found' },
    });
  if (message.params?.name !== 'lab_command')
    return respond({
      ...envelope,
      error: { code: -32602, message: 'Unknown tool' },
    });
  try {
    const result = execute(authority, message.params.arguments);
    respond({
      ...envelope,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !!result.accepted && !result.durable,
      },
    });
  } catch (e) {
    respond({
      ...envelope,
      result: {
        content: [{ type: 'text', text: e.code ?? e.message }],
        isError: true,
      },
    });
  }
}
let buffered = Buffer.alloc(0);
try {
  for await (const chunk of process.stdin) {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > 1048576) throw new Error('FRAME_LIMIT');
    let end;
    while ((end = buffered.indexOf(10)) !== -1) {
      const line = buffered.subarray(0, end).toString('utf8');
      buffered = buffered.subarray(end + 1);
      try {
        handle(JSON.parse(line));
      } catch {
        respond({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        });
      }
    }
  }
  if (buffered.length)
    respond({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Truncated frame' },
    });
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exitCode = 1;
} finally {
  store.close();
}
