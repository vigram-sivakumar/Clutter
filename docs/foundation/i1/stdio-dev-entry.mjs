// Private test composition, parent IPC is the transport. No discovery/user-vault access.
import { CoreClient } from '../../../packages/foundation-runtime/src/index.ts';
import {
  runCli,
  runMcp,
} from '../../../packages/foundation-runtime/src/adapters/stdio.ts';
if (!process.send) throw Error('TEST_PARENT_REQUIRED');
let serial = 0;
const pending = new Map();
process.on('message', (m) => {
  const done = pending.get(m.id);
  if (done) {
    pending.delete(m.id);
    done(m.reply);
  }
});
const client = new CoreClient(
  (command) =>
    new Promise((resolve) => {
      const id = ++serial;
      pending.set(id, resolve);
      process.send({ id, command });
    })
);
try {
  if (process.argv[2] === 'mcp') await runMcp(client);
  else await runCli(client, process.argv.slice(3));
} finally {
  process.disconnect();
}
