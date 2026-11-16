const { contextBridge, ipcRenderer } = require('electron');
const ui = ipcRenderer.sendSync('host34:bootstrap');
if (
  ui &&
  location.origin === new URL(ui.url).origin &&
  location.pathname === '/'
) {
  contextBridge.exposeInMainWorld('__clutterCore28Bootstrap', ui);
  contextBridge.exposeInMainWorld('__clutterHostEvent', (m) => {
    const event =
      m?.action === 'ready'
        ? 'ready'
        : m?.action === 'error'
          ? 'error'
          : m?.action === 'pdf'
            ? 'pdf-not-qualified'
            : null;
    if (event === 'pdf-not-qualified')
      document.querySelector('#status').textContent =
        'PDF host bridge is not included in build34 build-smoke scope';
    if (event) ipcRenderer.send('host34:event', { event });
  });
}
