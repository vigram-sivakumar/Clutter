import { remoteCommand } from './src/live-client.mjs';
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1048576) throw new Error('REQUEST_LIMIT');
    chunks.push(chunk);
  }
  const result = await remoteCommand(
    JSON.parse(Buffer.concat(chunks).toString('utf8'))
  );
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
  process.exitCode = 1;
}
