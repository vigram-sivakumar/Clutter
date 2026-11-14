import { remoteCommand } from './src/live-client.mjs';
import { commandSchema } from './src/live-command.mjs';
import { runMcp } from './src/mcp-stdio.mjs';
await runMcp({
  execute: remoteCommand,
  schema: commandSchema,
  name: 'clutter-live-qualification',
});
