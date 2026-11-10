import fs from 'node:fs';
import { call } from './common';

/**
 * Packaged sandbox checks for parent-directory authorization (ADR-056 amendment).
 * Documents children need no extra parent prompt when Documents is authorized.
 * Spaces outside Documents need an attended step: allow parent access in the rename panel only.
 */
describe('rename parent authorization, in the packaged sandboxed app', () => {
  it('reports granted for a Space under authorized Documents without a separate parent bookmark', async () => {
    await call('restore_space_access');
    const docs = (await call('sandbox_info')).ok?.documents as string | undefined;
    if (!docs) throw new Error('sandbox_info missing documents');
    expect((await call('documents_access')).ok).toBe('granted');
    const name = 'ClutterSbxParentAuth';
    const folder = `${docs}/${name}`;
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
    expect((await call('create_space_folder', { name })).ok).toBe(folder);
    const check = await call('check_rename_parent_access', { path: folder });
    expect(check.ok?.status).toBe('granted');
    const renamed = await call('rename_space_folder', { path: folder, newName: `${name}2` });
    expect(renamed.ok).toBe(`${docs}/${name}2`);
    fs.rmSync(renamed.ok as string, { recursive: true, force: true });
  });
});
