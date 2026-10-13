// The corner tag's two pages (the tag, and the list beside it) talk to
// main/corner-tag.mjs through this, and through nothing else: it is a separate,
// much smaller door than preload.cjs, because a window floating over every
// other app has no business holding the whole bridge.
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('cornerTag', {
  onState: listen('corner-tag:state'),
  onOpen: listen('corner-tag:open'),
  onReset: listen('corner-tag:reset'),
  onDragging: listen('corner-tag:dragging'),
  ready: (part) => ipcRenderer.invoke('corner-tag:ready', { part }),
  // frame: the clear band the tag's window keeps around the glass, so the
  // resize arrows can hang over its edges. The window is the glass plus that.
  size: (part, width, height, frame) => ipcRenderer.invoke('corner-tag:size', { part, width, height, frame }),
  // Whether what is under the pointer right now belongs to the tag. In the
  // clear band it does not, and the click must reach the app underneath.
  clickable: (on) => ipcRenderer.invoke('corner-tag:clickable', { on: !!on }),
  hover: (part, inside) => ipcRenderer.invoke('corner-tag:hover', { part, inside }),
  toggle: () => ipcRenderer.invoke('corner-tag:toggle'),
  // The button went down on the tag, and came up (or was taken away). What
  // happens in between, a drag or nothing, the main process reads off the
  // real cursor.
  // grip: the press landed on one of the tag's four resize corners, so what
  // the cursor does next is a resize rather than a move, and corner says which
  // one it has hold of.
  press: (x, y, grip, corner) => ipcRenderer.invoke('corner-tag:press', { x, y, grip: !!grip, corner }),
  release: (cancelled) => ipcRenderer.invoke('corner-tag:release', { cancelled: !!cancelled }),
  go: (id) => ipcRenderer.invoke('corner-tag:go', id),
  hide: (choice) => ipcRenderer.invoke('corner-tag:hide', choice),
  // One notch bigger or smaller, from the list's own foot, so she can see the
  // tag change while she decides.
  resize: (by) => ipcRenderer.invoke('corner-tag:resize', { by }),
  settings: () => ipcRenderer.invoke('corner-tag:settings'),
  menu: () => ipcRenderer.invoke('corner-tag:menu'),
});
