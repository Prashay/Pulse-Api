const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pulseDesktop", {
  isDesktop: true,
  platform: process.platform,
  proxyRequest: (payload) => ipcRenderer.invoke("pulse:proxy-request", payload),
  checkHealth: () => ipcRenderer.invoke("pulse:health-check"),
});
