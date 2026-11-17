import { SqliteStore } from '../src/sqlite-store.ts';
import { SpaceService } from '../../core/src/index.ts';
import { qualifiedEngine } from '../../editor/src/engine.mjs';
const [directory, phase, json] = process.argv.slice(2),
  command = JSON.parse(json),
  kill = () => process.kill(process.pid, 'SIGKILL');
const v = SqliteStore.reopenDisposable(directory, {
    assetPhase: (name) => {
      if (name === phase) kill();
    },
    beforeCommit: () => {
      if (phase === 'sql_before_commit') kill();
    },
    afterCommit: () => {
      if (phase === 'sql_after_commit') kill();
    },
  }),
  s = new SpaceService(v, qualifiedEngine);
const r = await s.execute(command, {
  spaceId: v.spaceId,
  scopes: ['read', 'write'],
});
console.log(JSON.stringify(r));
v.close();
