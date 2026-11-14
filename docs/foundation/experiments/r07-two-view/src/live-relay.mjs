import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
// Loopback test relay: Playwright delivers commands to ONE live browser authority.
// Holds a bounded request queue, never document state/outcomes/files. Not app IPC
// or MCP Streamable HTTP; MCP here is a separate stdio process using this relay.
export async function liveRelay(execute) {
  const token = randomBytes(32).toString('base64url');
  let tail = Promise.resolve(),
    pending = 0,
    dropReply = false;
  const app = createServer(async (req, res) => {
    const reject = (status, error) => {
      res
        .writeHead(status, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: false, error }));
    };
    const expected = Buffer.from('Bearer ' + token),
      actual = Buffer.from(req.headers.authorization ?? '');
    if (
      req.headers.origin !== undefined ||
      req.headers.host !== `127.0.0.1:${app.address().port}` ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return reject(403, 'DENIED');
    if (
      req.method !== 'POST' ||
      req.url !== '/rpc' ||
      req.headers['content-type'] !== 'application/json'
    )
      return reject(400, 'INVALID_REQUEST');
    if (pending >= 128) return reject(429, 'QUEUE_LIMIT');
    let bytes = 0,
      parts = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1048576) return reject(413, 'REQUEST_LIMIT');
        parts.push(chunk);
      }
      const command = JSON.parse(Buffer.concat(parts).toString('utf8'));
      pending++;
      const result = tail.then(() => execute(command));
      tail = result.catch(() => {});
      try {
        const envelope = await result;
        if (dropReply) {
          dropReply = false;
          res.destroy();
          return;
        }
        res
          .writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          .end(JSON.stringify(envelope));
      } finally {
        pending--;
      }
    } catch {
      if (!res.writableEnded) reject(400, 'INVALID_REQUEST');
    }
  });
  app.requestTimeout = 10000;
  app.headersTimeout = 10000;
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  return {
    dropNextReply: () => {
      dropReply = true;
    },
    env: {
      CLUTTER_LAB_RELAY_URL: `http://127.0.0.1:${app.address().port}/rpc`,
      CLUTTER_LAB_RELAY_TOKEN: token,
    },
    close: () => new Promise((resolve) => app.close(resolve)),
  };
}
