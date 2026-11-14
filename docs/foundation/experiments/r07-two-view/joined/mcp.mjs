import { remoteCommand } from '../src/live-client.mjs';
import { runMcp } from '../src/mcp-stdio.mjs';
import { commandSchema } from './codec.mjs';
await runMcp({
  execute: remoteCommand,
  schema: commandSchema,
  name: 'clutter-joined-qualification',
});
