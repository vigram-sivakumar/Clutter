import { SqliteStore } from '../src/sqlite-store.ts';
import { SpaceService } from '../../core/src/index.ts';
import { qualifiedEngine } from '../../editor/src/engine.mjs';
const [directory, phase, json] = process.argv.slice(2),
  command = JSON.parse(json);
let n = 0;
const v = SqliteStore.reopenDisposable(directory, {
    [phase]: () => process.kill(process.pid, 'SIGKILL'),
  }),
  s = new SpaceService(v, qualifiedEngine, { newGrant: () => `worker-${++n}` }),
  principal = {
    spaceId: v.spaceId,
    peerId: 'desktop',
    scopes: ['read', 'write'],
  };
const opened = await s.execute(
  {
    apiVersion: 1,
    spaceId: v.spaceId,
    pageId: command.pageId,
    contextId: command.contextId,
    method: 'editor.open',
  },
  principal
);
if (!opened.ok) throw Error(opened.error.code);
command.grant = opened.value.grant;
await new Promise((resolve, reject) =>
  process.send({ command }, (e) => (e ? reject(e) : resolve()))
);
const result = await s.execute(command, principal);
console.log(JSON.stringify(result));
v.close();
process.disconnect();
