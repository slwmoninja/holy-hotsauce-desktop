const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hhsGame", {
  getState: () => ipcRenderer.invoke("get-state"),
  getPeppers: () => ipcRenderer.invoke("get-peppers"),
  onStateUpdate: (cb) => ipcRenderer.on("state-update", (_e, snapshot) => cb(snapshot)),
  breedHybrid: (parentAName, parentBName, name) => ipcRenderer.send("breed-hybrid", { parentAName, parentBName, name }),
  setHybridLabEnabled: (enabled) => ipcRenderer.send("set-hybrid-lab-enabled", enabled)
});
