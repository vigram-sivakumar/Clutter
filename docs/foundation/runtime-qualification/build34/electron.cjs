const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const i = process.argv.indexOf('--host-config');
if (i < 0) throw Error('HOST_CONFIG_REQUIRED');
const privateFile = process.argv[i + 1],
  boot = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
const origin = new URL(boot.url).origin;
if (
  new URL(boot.url).hostname !== '127.0.0.1' ||
  new URL(boot.url).protocol !== 'http:'
)
  throw Error('LOCAL_ORIGIN_REQUIRED');
app.setPath(
  'userData',
  path.join(path.dirname(privateFile), 'electron-user-data')
);
let win,
  allow = false,
  guarding = false;
const record = (event, extra = {}) =>
  fs.appendFileSync(
    boot.report,
    JSON.stringify({ host: 'H-E', event, ...extra }) + '\n',
    { mode: 0o600 }
  );
app
  .whenReady()
  .then(() => {
    win = new BrowserWindow({
      title: 'Clutter H-E · build smoke',
      width: 1024,
      height: 768,
      useContentSize: true,
      resizable: false,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        devTools: false,
        spellcheck: false,
        partition: 'h01-' + boot.bootNonce,
      },
    });
    const trusted = (e) => {
      try {
        return (
          e.sender === win.webContents &&
          e.senderFrame === win.webContents.mainFrame &&
          new URL(e.senderFrame.url).origin === origin
        );
      } catch {
        return false;
      }
    };
    ipcMain.on('host34:bootstrap', (e) => {
      if (trusted(e)) e.returnValue = boot.ui;
      else e.returnValue = null;
    });
    ipcMain.on('host34:event', (e, m) => {
      if (
        trusted(e) &&
        ['ready', 'error', 'pdf-not-qualified'].includes(m?.event)
      )
        record(m.event);
    });
    win.webContents.session.setPermissionRequestHandler((_w, _p, answer) =>
      answer(false)
    );
    win.webContents.session.setPermissionCheckHandler(() => false);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== boot.url) event.preventDefault();
    });
    win.webContents.on('preload-error', () => record('preload-failed'));
    win.webContents.on('will-redirect', (event) => event.preventDefault());
    win.webContents.on('render-process-gone', () =>
      record('renderer-gone-no-volatile-recovery-inferred')
    );
    win.on('close', (event) => {
      if (allow) return;
      event.preventDefault();
      if (guarding) return;
      guarding = true;
      win.webContents
        .executeJavaScript(
          '(async()=>{try{return (await globalThis.lab28?.prepareClose())?.safe===true}catch{return false}})()'
        )
        .then((safe) => {
          guarding = false;
          record('close-guard', { safe: safe === true });
          if (safe === true) {
            allow = true;
            win.close();
          }
        })
        .catch(() => {
          guarding = false;
          record('close-guard', { safe: false });
        });
    });
    win.on('closed', () => {
      win = null;
      allow = true;
      app.quit();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Clutter H-E',
          submenu: [
            {
              label: 'Quit',
              accelerator: 'Command+Q',
              click: () => win?.close(),
            },
          ],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
      ])
    );
    win.loadURL(boot.url);
  })
  .catch(() => {
    record('startup-failed');
    app.exit(1);
  });
app.on('before-quit', (event) => {
  if (win && !allow) {
    event.preventDefault();
    win.close();
  }
});
