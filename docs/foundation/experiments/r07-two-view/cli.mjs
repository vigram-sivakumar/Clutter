import { FileStore } from './src/file-store.mjs';
import { openAuthority, execute } from './src/api.mjs';
// Deliberately reads request JSON from stdin, avoiding shell interpolation of note text.
let store;
try {
  if (process.argv.length !== 4 || process.argv[2] !== '--store')
    throw new Error(
      'USAGE: node cli.mjs --store NEW_LAB_DIRECTORY < request.json'
    );
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 1048576) throw new Error('REQUEST_LIMIT');
    chunks.push(chunk);
  }
  store = new FileStore(process.argv[3]);
  const result = execute(
    openAuthority(store),
    JSON.parse(Buffer.concat(chunks).toString('utf8'))
  );
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  if (result.accepted && !result.durable) process.exitCode = 2;
} catch (error) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: error.code ?? error.message }) + '\n'
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
