import { runMcpFrames } from './mcp-framing.ts';
/** Stdio adapters share CoreClient; they contain no page rules or SQL. */
import { commandSchema, catalogue } from '../../core/src/contracts.ts';
import type { Command } from '../../core/src/contracts.ts';
import { CoreClient } from '../../core/src/client.ts';
const LIMIT = 1048576;
const output = (x: unknown) => process.stdout.write(JSON.stringify(x) + '\n');
export async function runCli(
  client: CoreClient,
  args = process.argv.slice(2)
): Promise<void> {
  if (args.length === 1 && args[0] === '--help-json') {
    output({ commands: Object.keys(catalogue), inputSchema: commandSchema });
    return;
  }
  if (args.length) throw Error('Use JSON on stdin or --help-json');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > LIMIT) throw Error('FRAME_LIMIT');
    chunks.push(chunk);
  }
  try {
    const r = await client.execute(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    output(r);
    if (!r.ok) process.exitCode = 1;
  } catch {
    output({ ok: false, error: { code: 'INVALID_REQUEST' } });
    process.exitCode = 1;
  }
}
/** MCP and the historical proof bridge reuse one framer. */
export async function runMcp(client: CoreClient): Promise<void> {
  return runMcpFrames({
    execute: (command) => client.execute(command as Command),
    schema: commandSchema,
    name: 'clutter-i1',
    toolName: 'clutter_command',
    strictVersion: true,
    isError: (value) =>
      !!value &&
      typeof value === 'object' &&
      'ok' in value &&
      value.ok === false,
  });
}
