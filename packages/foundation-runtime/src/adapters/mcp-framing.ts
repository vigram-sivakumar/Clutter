/** Shared bounded stdio framing; no page rules, storage, or runtime discovery. */
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as RecordValue)
    : {};
export type McpOptions = {
  execute: (command: unknown) => Promise<unknown>;
  schema: unknown;
  name: string;
  toolName?: string;
  isError?: (value: unknown) => boolean;
  strictVersion?: boolean;
};
export async function runMcpFrames({
  execute,
  schema,
  name,
  toolName = 'lab_command',
  isError = () => false,
  strictVersion = false,
}: McpOptions): Promise<void> {
  let phase = 'new',
    buffer = Buffer.alloc(0);
  const reply = (x: unknown) => process.stdout.write(JSON.stringify(x) + '\n');
  async function handle(value: unknown) {
    const m = record(value);
    if (
      m.jsonrpc !== '2.0' ||
      typeof m.method !== 'string' ||
      (m.id !== undefined &&
        typeof m.id !== 'string' &&
        typeof m.id !== 'number')
    ) {
      reply({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid request' },
      });
      return;
    }
    if (m.id === undefined) {
      if (m.method === 'notifications/initialized' && phase === 'initializing')
        phase = 'ready';
      return;
    }
    const env = { jsonrpc: '2.0', id: m.id },
      params = record(m.params);
    const error = (code: number, message: string) =>
      reply({ ...env, error: { code, message } });
    if (m.method === 'initialize') {
      if (
        phase !== 'new' ||
        typeof params.protocolVersion !== 'string' ||
        !params.clientInfo ||
        !params.capabilities ||
        (strictVersion && params.protocolVersion !== '2025-11-25')
      )
        return error(-32602, 'Invalid initialize');
      phase = 'initializing';
      return reply({
        ...env,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name, version: '0.1.0' },
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
              name: toolName,
              description:
                'Synthetic disposable qualification operations; no production access',
              inputSchema: schema,
            },
          ],
        },
      });
    if (m.method !== 'tools/call') return error(-32601, 'Method not found');
    if (params.name !== toolName) return error(-32602, 'Unknown tool');
    try {
      const result = await execute(params.arguments);
      reply({
        ...env,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: isError(result),
        },
      });
    } catch (e) {
      reply({
        ...env,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: e instanceof Error ? e.message : 'INVALID_COMMAND',
              }),
            },
          ],
          isError: true,
        },
      });
    }
  }
  try {
    for await (const chunk of process.stdin) {
      buffer = Buffer.concat([buffer, chunk]);
      let end;
      while ((end = buffer.indexOf(10)) !== -1) {
        if (end > 1048576) throw Error('FRAME_LIMIT');
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
      if (buffer.length > 1048576) throw Error('FRAME_LIMIT');
    }
    if (buffer.length)
      reply({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Truncated frame' },
      });
  } catch (e) {
    process.stderr.write(
      (e instanceof Error ? e.message : 'FRAME_ERROR') + '\n'
    );
    process.exitCode = 1;
  }
}
