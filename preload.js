const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hhs", {
  getState: () => ipcRenderer.invoke("get-state"),
  onStateUpdate: (cb) => ipcRenderer.on("state-update", (_e, snapshot) => cb(snapshot)),
  openFullGame: () => ipcRenderer.send("open-full-game"),
  showSettingsMenu: () => ipcRenderer.send("show-settings-menu"),
  requestQuit: () => ipcRenderer.send("request-quit")
});
