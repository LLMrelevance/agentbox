// The Neo window's whole bridge. Small on purpose: a window that floats over
// every app gets only what Neo needs, and never the key.
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('neo', {
  onWake: listen('neo:wake'),
  onSleep: listen('neo:sleep'),
  onResting: listen('neo:resting'),
  onNoMic: listen('neo:no-mic'),
  onNotice: listen('neo:notice'),
  startLive: (sdp, outside) => ipcRenderer.invoke('neo:start-live', { sdp, outside: !!outside }),
  tool: (callId, name, args, heard) => ipcRenderer.invoke('neo:tool', { callId, name, args, heard }),
  drag: (phase, dx, dy) => ipcRenderer.send('neo:drag', { phase, dx, dy }),
  pace: (value) => ipcRenderer.invoke('neo:pace', value),
  usage: (seconds) => ipcRenderer.send('neo:usage', { seconds }),
  allowMic: () => ipcRenderer.invoke('neo:allow-mic'),
  ending: () => ipcRenderer.send('neo:ending'),
  closed: () => ipcRenderer.send('neo:closed'),
  clickable: (on) => ipcRenderer.send('neo:clickable', !!on),
});
