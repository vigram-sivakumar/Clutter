import fs from 'node:fs';
import { APP_DATA, CONTAINER, FIXTURE, OUT, REAL_DOCS, REAL_HOME, call, callWithBody, bodyText } from './common';

// Launch 1: nothing here needs a Space or a file panel. The packaged, sandboxed test app, its CSP, the webview's fs plugin
// commands, and the native commands against paths nobody authorized.
const NOTE = `${FIXTURE}/note.md`;
const OTHER = `${FIXTURE}/other.md`;
const SECRET = `${OUT}/secret.md`;

describe('F1: the packaged sandboxed app, its CSP and its permission boundary', () => {
  before(() => {
    fs.rmSync(FIXTURE, { recursive: true, force: true });
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(FIXTURE, { recursive: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(NOTE, 'ORIGINAL NOTE');
    fs.writeFileSync(OTHER, 'OTHER NOTE');
    fs.writeFileSync(SECRET, 'ORIGINAL SECRET');
    fs.symlinkSync(OUT, `${FIXTURE}/exit`);
  });

  it('is really sandboxed, in the test identity\'s container, and names the real home and Documents', async () => {
    await browser.pause(3000);
    const info = (await call('sandbox_info')).ok;
    console.log('FINAL sandbox_info', JSON.stringify(info));
    expect(info).toEqual({ sandboxed: true, realHome: REAL_HOME, documents: REAL_DOCS });
    console.log('FINAL documents_access', JSON.stringify((await call('documents_access')).ok));
  });

  describe('the Content Security Policy the packaged webview actually applies', () => {
    it('serves a policy whose scripts come from the app only, with no eval and no inline script', async () => {
      const header = (await browser.executeAsync((done: (v: unknown) => void) => {
        fetch(location.href).then((r) => done({ origin: location.origin, csp: r.headers.get('content-security-policy') }), (e) => done({ error: String(e) }));
      })) as { origin?: string; csp?: string | null; error?: string };
      console.log('FINAL csp', JSON.stringify(header));
      expect(header.csp ?? '').not.toBe('');
      const policy = header.csp as string;
      const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(policy)?.[1] ?? '';
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain('localhost:5173');
      expect(policy).toContain("object-src 'none'");
    });

    it('actually blocks eval, new Function and an injected inline script', async () => {
      const result = (await browser.execute(() => {
        const violations: string[] = [];
        document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective}:${event.blockedURI}`));
        const attempt = (run: () => unknown) => {
          try {
            return `ran:${String(run())}`;
          } catch (error) {
            return `blocked:${(error as Error).name}`;
          }
        };
        const evalResult = attempt(() => (0, eval)('1+1'));
        const functionResult = attempt(() => new Function('return 2')());
        (window as any).__cspProbe = 'not-run';
        const script = document.createElement('script');
        script.textContent = "window.__cspProbe = 'ran'";
        document.head.appendChild(script);
        return { evalResult, functionResult, inline: (window as any).__cspProbe as string, violations };
      })) as { evalResult: string; functionResult: string; inline: string; violations: string[] };
      console.log('FINAL csp probe', JSON.stringify(result));
      expect(result.evalResult).toMatch(/^blocked:/);
      expect(result.functionResult).toMatch(/^blocked:/);
      expect(result.inline).toBe('not-run');
    });

    it('still boots: the app rendered, no startup failure, fonts loaded, styles applied', async () => {
      const state = (await browser.executeAsync((done: (v: unknown) => void) => {
        (document as any).fonts.ready.then(() => {
          const faces = [...(document as any).fonts].map((face: any) => `${face.family}:${face.status}`);
          const startupFailure = document.body.innerText.includes('Something went wrong');
          const styled = getComputedStyle(document.body).fontFamily;
          done({ rootChildren: document.getElementById('root')?.children.length ?? 0, faces, startupFailure, styled, themed: document.documentElement.getAttribute('data-theme') });
        });
      })) as { rootChildren: number; faces: string[]; startupFailure: boolean; styled: string; themed: string | null };
      console.log('FINAL boot', JSON.stringify(state));
      expect(state.rootChildren).toBeGreaterThan(0);
      expect(state.startupFailure).toBe(false);
      expect(state.faces.some((face) => face.endsWith(':loaded'))).toBe(true);
      expect(state.faces.filter((face) => face.endsWith(':error'))).toEqual([]);
      expect(['light', 'dark']).toContain(state.themed); // the build-time hashed inline script ran
    });
  });

  describe('the webview\'s fs plugin commands', () => {
    const attempts: Array<[string, () => Promise<{ ok?: any; err?: string }>]> = [
      ['write_text_file', () => callWithBody('plugin:fs|write_text_file', NOTE, 'OVERWRITTEN')],
      ['write_text_file (empty, truncating)', () => callWithBody('plugin:fs|write_text_file', NOTE, '')],
      ['write_file', () => callWithBody('plugin:fs|write_file', NOTE, 'OVERWRITTEN')],
      ['rename over a note', () => call('plugin:fs|rename', { oldPath: OTHER, newPath: NOTE, options: {} })],
      ['rename out through a link', () => call('plugin:fs|rename', { oldPath: NOTE, newPath: `${FIXTURE}/exit/moved-out.md`, options: {} })],
      ['remove a note', () => call('plugin:fs|remove', { path: NOTE, options: {} })],
      ['mkdir through a link', () => call('plugin:fs|mkdir', { path: `${FIXTURE}/exit/made`, options: { recursive: true } })],
      ['mkdir', () => call('plugin:fs|mkdir', { path: `${FIXTURE}/made`, options: {} })],
      ['copy_file over a note', () => call('plugin:fs|copy_file', { fromPath: OTHER, toPath: NOTE, options: {} })],
      ['create', () => call('plugin:fs|create', { path: NOTE, options: {} })],
      ['truncate', () => call('plugin:fs|truncate', { path: NOTE, len: 0, options: {} })],
      ['open for writing', () => call('plugin:fs|open', { path: NOTE, options: { write: true, truncate: true } })],
    ];
    for (const [label, run] of attempts) {
      it(`${label} is refused by the permission system, and nothing changes`, async () => {
        const answer = await run();
        expect(answer.err ?? '').toContain('not allowed');
        expect(fs.readFileSync(NOTE, 'utf8')).toBe('ORIGINAL NOTE');
        expect(fs.readFileSync(OTHER, 'utf8')).toBe('OTHER NOTE');
        expect(fs.readFileSync(SECRET, 'utf8')).toBe('ORIGINAL SECRET');
        expect(fs.existsSync(`${FIXTURE}/made`) || fs.existsSync(`${OUT}/made`) || fs.existsSync(`${OUT}/moved-out.md`)).toBe(false);
      });
    }

    it('still reads, which the app needs', async () => {
      expect((await call('plugin:fs|exists', { path: NOTE })).ok).toBe(true);
      expect((await call('plugin:fs|stat', { path: NOTE })).err).toBeUndefined();
    });
  });

  describe('native commands against paths nobody authorized', () => {
    it('refuse to delete, create or move anything: no Space has been authorized, whatever the static scope says', async () => {
      const refusals = [
        await call('delete_path', { path: NOTE }),
        await call('delete_path', { path: FIXTURE, recursive: true }),
        await call('create_directory', { path: `${FIXTURE}/made`, recursive: true }),
        await call('create_directory', { path: `${OUT}/made`, recursive: true }),
        await call('move_file_no_clobber', { from: OTHER, to: `${FIXTURE}/moved.md` }),
        await call('copy_file_no_clobber', { from: OTHER, to: `${FIXTURE}/copy.md` }),
        await callWithBody('write_file_no_clobber', `${FIXTURE}/new.bin`, 'x'),
      ];
      console.log('FINAL unauthorized', JSON.stringify(refusals.map((r) => r.err ?? r.ok)));
      for (const answer of refusals) expect(answer.err ?? '').toMatch(/forbidden path|not allowed/);
      expect(fs.readFileSync(NOTE, 'utf8')).toBe('ORIGINAL NOTE');
      expect(fs.readdirSync(FIXTURE).sort()).toEqual(['exit', 'note.md', 'other.md']);
      expect(fs.readdirSync(OUT)).toEqual(['secret.md']);
    });
  });

  describe('recovery records are written by the native command, which cannot name a path', () => {
    it('writes a record under the app data folder, replaces it whole, and refuses a path-shaped name', async () => {
      const dir = `${APP_DATA}/recovery/zz-final-key`;
      expect((await call('recovery_write', { key: 'zz-final-key', name: 'x.aaaaaaaa.json', text: '{"v":1}' })).err).toBeUndefined();
      expect(fs.readFileSync(`${dir}/x.aaaaaaaa.json`, 'utf8')).toBe('{"v":1}');
      expect((await call('recovery_write', { key: 'zz-final-key', name: 'x.aaaaaaaa.json', text: '{"v":2}' })).err).toBeUndefined();
      expect(fs.readFileSync(`${dir}/x.aaaaaaaa.json`, 'utf8')).toBe('{"v":2}');
      expect(fs.readdirSync(dir)).toEqual(['x.aaaaaaaa.json']);

      for (const [key, name] of [['zz-final-key', '../escape.json'], ['../zz', 'x.json'], ['zz-final-key', '/etc/x.json'], ['zz-final-key', 'note.md']]) {
        expect((await call('recovery_write', { key, name, text: 'x' })).err ?? '').toContain('not a recovery');
      }
      expect(fs.existsSync(`${APP_DATA}/recovery/escape.json`)).toBe(false);
      expect((await call('recovery_remove', { key: 'zz-final-key', name: 'x.aaaaaaaa.json' })).err).toBeUndefined();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  after(async () => {
    console.log('FINAL body', (await bodyText()).slice(0, 120).replace(/\n/g, ' | '));
    fs.rmSync(FIXTURE, { recursive: true, force: true });
    fs.rmSync(OUT, { recursive: true, force: true });
    void CONTAINER;
  });
});
