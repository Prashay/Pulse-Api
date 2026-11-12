const { contextBridge, ipcRenderer, webFrame } = require("electron");

function workspaceRequest(channel, ...args) {
  const result = ipcRenderer.sendSync(channel, ...args);
  if (!result?.ok) throw new Error(result?.error || "Could not access the saved workspace.");
  return result.data;
}

contextBridge.exposeInMainWorld("pulseDesktop", {
  isDesktop: true,
  platform: process.platform,
  readWorkspace: () => workspaceRequest("pulse:read-workspace"),
  writeWorkspace: (data) => workspaceRequest("pulse:write-workspace", data),
  windowZoom: {
    getFactor: () => webFrame.getZoomFactor(),
    setFactor: (factor) => {
      if (Number.isFinite(factor)) webFrame.setZoomFactor(Math.max(0.5, Math.min(2, factor)));
    },
  },
  proxyRequest: (payload) => ipcRenderer.invoke("pulse:proxy-request", payload),
  cancelProxyRequest: (id) => ipcRenderer.send("pulse:cancel-proxy-request", id),
  checkHealth: () => ipcRenderer.invoke("pulse:health-check"),
});
