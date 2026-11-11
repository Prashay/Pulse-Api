const { contextBridge, ipcRenderer } = require("electron");

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
  proxyRequest: (payload) => ipcRenderer.invoke("pulse:proxy-request", payload),
  checkHealth: () => ipcRenderer.invoke("pulse:health-check"),
});
