import { remoteCommand } from '../src/live-client.mjs';
import { runMcp } from '../src/mcp-stdio.mjs';
import { commandSchema } from './model.mjs';
await runMcp({
  execute: remoteCommand,
  schema: commandSchema,
  name: 'clutter-durable-qualification',
});
