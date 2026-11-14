import { remoteCommand } from './src/live-client.mjs';
import { commandSchema } from './src/live-command.mjs';
// Pinned stdio-only tools subset. No stdout logging, filesystem operations,
// notifications with mutation effects, HTTP-MCP endpoint or production grants.
let phase = 'new';
const reply = (x) => process.stdout.write(JSON.stringify(x) + '\n');
async function handle(m) {
  if (
    !m ||
    m.jsonrpc !== '2.0' ||
    typeof m.method !== 'string' ||
    (m.id !== undefined && typeof m.id !== 'string' && typeof m.id !== 'number')
  )
    return reply({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid request' },
    });
  if (m.id === undefined) {
    if (m.method === 'notifications/initialized' && phase === 'initializing')
      phase = 'ready';
    return;
  }
  const env = { jsonrpc: '2.0', id: m.id },
    error = (code, message) => reply({ ...env, error: { code, message } });
  if (m.method === 'initialize') {
    if (
      phase !== 'new' ||
      typeof m.params?.protocolVersion !== 'string' ||
      !m.params?.clientInfo ||
      !m.params?.capabilities
    )
      return error(-32602, 'Invalid initialize');
    phase = 'initializing';
    return reply({
      ...env,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'clutter-live-qualification', version: '0.1.0' },
      },
    });
  }
  if (m.method === 'ping') return reply({ ...env, result: {} });
  if (phase !== 'ready')
    return error(-32000, 'Initialize and send initialized first');
  if (m.method === 'tools/list')
    return reply({
      ...env,
      result: {
        tools: [
          {
            name: 'lab_command',
            description:
              'Ephemeral synthetic live-authority qualification commands',
            inputSchema: commandSchema,
          },
        ],
      },
    });
  if (m.method !== 'tools/call') return error(-32601, 'Method not found');
  if (m.params?.name !== 'lab_command') return error(-32602, 'Unknown tool');
  try {
    const result = await remoteCommand(m.params.arguments);
    reply({
      ...env,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false,
      },
    });
  } catch (e) {
    reply({
      ...env,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
        isError: true,
      },
    });
  }
}
let buffer = Buffer.alloc(0);
try {
  for await (const chunk of process.stdin) {
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(10)) !== -1) {
      if (end > 1048576) throw new Error('FRAME_LIMIT');
      const line = buffer.subarray(0, end).toString('utf8');
      buffer = buffer.subarray(end + 1);
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        reply({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        });
        continue;
      }
      await handle(value);
    }
    if (buffer.length > 1048576) throw new Error('FRAME_LIMIT');
  }
  if (buffer.length)
    reply({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Truncated frame' },
    });
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exitCode = 1;
}
