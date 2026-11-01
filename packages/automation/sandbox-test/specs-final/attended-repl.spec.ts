import fs from 'node:fs';

// A long-lived, in-webview command loop for the attended session. It reads one command at a time from a file, acts ONLY
// inside the test app's webview (click by text, read the page, screenshot, invoke a Tauri command, run page script), and
// writes the answer to another file. It never sends a key or a click to the desktop: native panels are the user's.
const DIR = process.env.CLUTTER_REPL_DIR as string;

describe('attended session: in-webview command loop', function () {
  this.timeout(3 * 60 * 60 * 1000);

  it('serves commands until told to quit', async () => {
    if (!DIR) throw new Error('CLUTTER_REPL_DIR is required');
    fs.mkdirSync(DIR, { recursive: true });
    let last = '';
    fs.writeFileSync(`${DIR}/ready`, String(Date.now()));
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!fs.existsSync(`${DIR}/cmd.json`)) continue;
      const raw = fs.readFileSync(`${DIR}/cmd.json`, 'utf8');
      let cmd: any;
      try {
        cmd = JSON.parse(raw);
      } catch {
        continue; // half-written
      }
      if (cmd.id === last) continue;
      last = cmd.id;
      let out: any;
      try {
        out = { id: cmd.id, ok: await run(cmd) };
      } catch (error) {
        out = { id: cmd.id, err: String((error as Error).message ?? error) };
      }
      fs.writeFileSync(`${DIR}/out.tmp`, JSON.stringify(out));
      fs.renameSync(`${DIR}/out.tmp`, `${DIR}/out-${cmd.id}.json`);
      if (cmd.op === 'quit') break;
    }
  });
});

async function run(cmd: any): Promise<unknown> {
  switch (cmd.op) {
    case 'eval':
      return browser.execute(`return (function(){ ${cmd.js} })()`);
    case 'evalAsync':
      return browser.executeAsync(`const done = arguments[arguments.length - 1]; (async () => { ${cmd.js} })().then((v) => done({ ok: v }), (e) => done({ err: String(e) }));`);
    case 'call':
      return browser.executeAsync(
        (c: string, a: unknown, done: (r: unknown) => void) => {
          (window as any).__TAURI_INTERNALS__.invoke(c, a).then(
            (v: unknown) => done({ ok: v }),
            (e: unknown) => done({ err: typeof e === 'string' ? e : JSON.stringify(e) })
          );
        },
        cmd.cmd,
        cmd.args ?? {}
      );
    case 'click': {
      // The smallest element whose text matches (exact when `exact`), clicked inside the page.
      return browser.execute(
        (text: string, exact: boolean, selector: string) => {
          const candidates = [...document.querySelectorAll<HTMLElement>(selector || 'button, [role="button"], [role="menuitem"], a, li, div, span')];
          const matches = candidates.filter((el) => {
            const own = (el.innerText ?? el.textContent ?? '').trim();
            return exact ? own === text : own.includes(text);
          });
          matches.sort((a, b) => (a.innerText ?? '').length - (b.innerText ?? '').length);
          const target = matches[0];
          if (!target) return { clicked: false, candidates: candidates.length };
          target.click();
          return { clicked: true, tag: target.tagName, text: (target.innerText ?? '').slice(0, 60) };
        },
        cmd.text,
        !!cmd.exact,
        cmd.selector ?? ''
      );
    }
    case 'text':
      return browser.execute(() => document.body.innerText);
    case 'shot':
      await browser.saveScreenshot(`${DIR}/${cmd.name}.png`);
      return `${DIR}/${cmd.name}.png`;
    case 'quit':
      return 'bye';
    default:
      throw new Error(`unknown op ${cmd.op}`);
  }
}
