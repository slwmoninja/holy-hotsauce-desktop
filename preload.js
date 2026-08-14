const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hhs", {
  getState: () => ipcRenderer.invoke("get-state"),
  onStateUpdate: (cb) => ipcRenderer.on("state-update", (_e, snapshot) => cb(snapshot)),
  openGame: () => ipcRenderer.send("open-game-window"),
  showSettingsMenu: () => ipcRenderer.send("show-settings-menu"),
  requestQuit: () => ipcRenderer.send("request-quit"),
  moveWindowBy: (dx, dy) => ipcRenderer.send("move-window-by", { dx, dy }),
  dragEnded: () => ipcRenderer.send("drag-ended")
});
