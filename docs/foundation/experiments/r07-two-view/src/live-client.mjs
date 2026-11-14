// Experiment transport only. No filesystem/store access and no document logic.
export async function remoteCommand(command) {
  const endpoint = new URL(process.env.CLUTTER_LAB_RELAY_URL ?? 'invalid:');
  const token = process.env.CLUTTER_LAB_RELAY_TOKEN;
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.pathname !== '/rpc' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    typeof token !== 'string' ||
    token.length < 32
  )
    throw new Error('INVALID_LAB_ENDPOINT');
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('TRANSPORT_OUTCOME_UNKNOWN');
  }
  if (!response.ok) throw new Error('RELAY_HTTP_' + response.status);
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new Error('TRANSPORT_OUTCOME_UNKNOWN');
  }
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.result;
}
