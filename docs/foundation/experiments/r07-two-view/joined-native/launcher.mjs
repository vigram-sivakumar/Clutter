import { ensureOwner, testControl } from './discovery.mjs';
import { remoteCommand } from '../src/live-client.mjs';
import { runMcp } from '../src/mcp-stdio.mjs';
import { commandSchema } from '../joined/codec.mjs';
const argv = process.argv.slice(2),
  at = argv.indexOf('--session');
try {
  if (at < 0 || !argv[at + 1]) throw Error('SESSION_REQUIRED');
  const d = await ensureOwner(argv[at + 1]);
  if (argv.includes('--ensure'))
    process.stdout.write(
      JSON.stringify({
        ok: true,
        spaceId: d.spaceId,
        documentId: d.documentId,
        ownerEpoch: d.ownerEpoch,
        profile: d.profile,
      }) + '\n'
    );
  else if (argv.includes('--control')) {
    const i = argv.indexOf('--control'),
      method = argv[i + 1],
      value = argv[i + 2];
    const r = await testControl(d, {
      method,
      ...(value !== undefined
        ? { value: value === 'true' ? true : value === 'false' ? false : value }
        : {}),
    });
    process.stdout.write(JSON.stringify(r) + '\n');
  } else if (argv.includes('--mcp'))
    await runMcp({
      execute: (c) => remoteCommand(c, d),
      schema: commandSchema,
      name: 'clutter-joined-native-lab',
    });
  else {
    let input = '';
    for await (const b of process.stdin) {
      input += b;
      if (Buffer.byteLength(input) > 1048576) throw Error('FRAME_LIMIT');
    }
    const c = JSON.parse(input || '{"method":"read"}');
    const result = await remoteCommand(
      { spaceId: d.spaceId, documentId: d.documentId, ...c },
      d
    );
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  }
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
  process.exitCode = 1;
}
