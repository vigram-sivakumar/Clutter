import { SqliteStore } from '../src/sqlite-store.ts';
import { SpaceService } from '../../core/src/index.ts';
import { qualifiedEngine } from '../../editor/src/engine.mjs';
const [directory, phase, json] = process.argv.slice(2);
try {
  const v = SqliteStore.reopenDisposable(directory, {
    [phase]: () => process.kill(process.pid, 'SIGKILL'),
  });
  const s = new SpaceService(v, qualifiedEngine);
  const r = await s.execute(JSON.parse(json), {
    spaceId: v.spaceId,
    scopes: ['read', 'write'],
  });
  console.log(JSON.stringify(r));
  v.close();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
