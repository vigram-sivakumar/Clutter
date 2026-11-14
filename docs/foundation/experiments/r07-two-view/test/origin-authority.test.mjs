import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { OriginAuthority } from '../src/origin-authority.mjs';
const firstText = (peer) =>
  peer.doc.getXmlFragment('prosemirror').get(0).get(0);
test('origin authority accepts one mutation and duplicate update replay is idempotent', (t) => {
  const a = new OriginAuthority();
  t.after(() => a.destroy());
  const A = a.attach('A'),
    B = a.attach('B');
  let last;
  A.doc.on('update', (u, o) => {
    if (o !== a.remoteOrigin) last = u;
  });
  firstText(A).insert(0, 'X');
  assert.equal(a.read().firstChild.textContent, 'XAlpha beta');
  const version = a.version;
  assert.equal(a.submit(A, last), true);
  assert.equal(a.version, version);
  assert.equal(firstText(B).toString(), 'XAlpha beta');
});
test('paused origin edits converge without making the accepted copy provisional', (t) => {
  const a = new OriginAuthority();
  t.after(() => a.destroy());
  const A = a.attach('A'),
    B = a.attach('B');
  a.pause('B');
  firstText(B).insert(0, 'B');
  assert.equal(a.read().firstChild.textContent, 'Alpha beta');
  firstText(A).insert(0, 'A');
  a.resume('B');
  assert.ok(
    ['ABAlpha beta', 'BAAlpha beta'].includes(a.read().firstChild.textContent)
  );
  assert.equal(firstText(A).toString(), firstText(B).toString());
});
test('a duplicate task identity never enters accepted state; rejected replica bytes remain', (t) => {
  const a = new OriginAuthority();
  t.after(() => a.destroy());
  const A = a.attach('A');
  const fragment = A.doc.getXmlFragment('prosemirror');
  const before = a.read().toJSON();
  fragment.push([fragment.get(2).clone()]);
  assert.equal(A.error, 'INVALID_CANDIDATE_UPDATE');
  assert.deepEqual(a.read().toJSON(), before);
  assert.ok(A.rejected[0].fullReplicaUpdate.length > 0);
});
test('unknown schema content is rejected without throwing away recovery bytes', (t) => {
  const a = new OriginAuthority();
  t.after(() => a.destroy());
  const A = a.attach('A');
  const before = a.read().toJSON();
  A.doc
    .getXmlFragment('prosemirror')
    .push([new Y.XmlElement('unknown-test-node')]);
  assert.equal(A.error, 'INVALID_CANDIDATE_UPDATE');
  assert.deepEqual(a.read().toJSON(), before);
  assert.ok(A.rejected[0].update.length > 0);
});
