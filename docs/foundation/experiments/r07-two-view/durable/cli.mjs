import { remoteCommand } from '../src/live-client.mjs';
let input = '';
try {
  for await (const b of process.stdin) {
    input += b;
    if (Buffer.byteLength(input) > 1048576) throw Error('FRAME_LIMIT');
  }
  const result = await remoteCommand(JSON.parse(input));
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
  process.exitCode = 1;
}
