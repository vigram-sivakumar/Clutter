import { SqliteVault } from '../src/adapters/sqlite-vault.ts';
import { SpaceService } from '../src/index.ts';
import { qualifiedEngine } from '../../../docs/foundation/i1/qualified-engine.mjs';
const [directory, phase, json] = process.argv.slice(2);
try {
  const v = SqliteVault.reopenDisposable(directory, {
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
