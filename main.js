/* =========================================================
   Holy Hotsauce! — desktop widget (main process)

   A free-floating, frameless, transparent window that grows the same way
   the web game does, but powered by GLOBAL keystrokes (any app, not just
   this window) via a system-wide low-level keyboard hook (uiohook-napi).

   PRIVACY: the global-hook handler below does nothing but increment a
   counter. It never reads, stores, or logs which key was pressed -- see
   the keydown handler a few lines down; there's no variable anywhere in
   this file that ever holds a key code or character. Same discipline as
   the web app's own keystroke counter, just wired to a system-wide hook
   instead of a single window's keydown event.
   ========================================================= */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { uIOhook } = require("uiohook-napi");

const PEPPERS = [
  { name: "Bell Pepper",       scoville: 0,       color: "#4caf50" },
  { name: "Banana Pepper",     scoville: 500,     color: "#e8d84a" },
  { name: "Poblano",           scoville: 1500,    color: "#2e7d32" },
  { name: "Jalapeño",          scoville: 5000,    color: "#43a047" },
  { name: "Serrano",           scoville: 15000,   color: "#7cb342" },
  { name: "Cayenne",           scoville: 30000,   color: "#e53935" },
  { name: "Tabasco",           scoville: 50000,   color: "#fb8c00" },
  { name: "Thai Chili",        scoville: 75000,   color: "#d32f2f" },
  { name: "Habanero",          scoville: 150000,  color: "#ff7043" },
  { name: "Scotch Bonnet",     scoville: 250000,  color: "#f4511e" },
  { name: "Ghost Pepper",      scoville: 1000000, color: "#c62828" },
  { name: "Trinidad Scorpion", scoville: 1200000, color: "#b71c1c" },
  { name: "Carolina Reaper",   scoville: 1600000, color: "#7b0000" },
  { name: "Pepper X",          scoville: 2693000, color: "#4a0000" }
];
const STAGES = ["Seedling", "Leaf", "Blossom", "Pepper", "Hotsauce Bottle"];
const KEYSTROKES_PER_STAGE = 1000;
const WEB_GAME_URL = "https://slwmoninja.github.io/holy-hotsauce/";

const STATE_PATH = path.join(app.getPath("userData"), "state.json");
const SIZE_PX = { S: 72, M: 110, L: 156 };

function defaultState() {
  return {
    totalKeystrokes: 0,
    chartPosition: 0,
    stageIndex: 0,
    stageProgress: 0,
    completedCounts: {},
    totalHotsauces: 0,
    totalScoville: 0,
    settings: {
      alwaysOnTop: false,
      autoStartOnLogin: false,
      iconSize: "M",
      winX: null,
      winY: null
    }
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const d = defaultState();
    return Object.assign(d, parsed, { settings: Object.assign(d.settings, parsed.settings || {}) });
  } catch (e) {
    return defaultState();
  }
}

let state = loadState();
let saveTimer = null;
function saveStateDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state)); } catch (e) {}
  }, 400);
}

function officialDone() { return state.chartPosition >= PEPPERS.length; }
function currentGrowing() {
  if (!officialDone()) return PEPPERS[state.chartPosition];
  return PEPPERS[PEPPERS.length - 1]; // desktop widget has no Hybrid Lab -- just re-loops the top pepper
}

function completePepper(p) {
  state.completedCounts[p.name] = (state.completedCounts[p.name] || 0) + 1;
  state.totalHotsauces++;
  state.totalScoville += p.scoville;
  state.chartPosition++;
}

/* One keystroke event in, one counter increment out -- nothing else ever
   touches the event. This is the entire raw-count guarantee in one place. */
function addKeystroke() {
  state.totalKeystrokes++;
  const g = currentGrowing();
  state.stageProgress++;
  if (state.stageProgress >= KEYSTROKES_PER_STAGE) {
    state.stageProgress = 0;
    state.stageIndex++;
    if (state.stageIndex >= STAGES.length) {
      completePepper(g);
      state.stageIndex = 0;
    }
  }
  saveStateDebounced();
  broadcastState();
}

let mainWindow = null;
let tray = null;

function currentSnapshot() {
  const g = currentGrowing();
  return {
    pepper: g,
    stageIndex: state.stageIndex,
    stageProgress: state.stageProgress,
    fillFrac: state.stageProgress / KEYSTROKES_PER_STAGE,
    stageName: STAGES[state.stageIndex],
    totalKeystrokes: state.totalKeystrokes,
    totalHotsauces: state.totalHotsauces,
    totalScoville: state.totalScoville,
    chartPos: officialDone() ? null : state.chartPosition + 1,
    chartLen: PEPPERS.length,
    settings: state.settings
  };
}
function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state-update", currentSnapshot());
  }
}

function createWindow() {
  const size = SIZE_PX[state.settings.iconSize] || SIZE_PX.M;
  const display = screen.getPrimaryDisplay();
  const defaultX = display.workArea.x + display.workArea.width - size - 24;
  const defaultY = display.workArea.y + 60;

  mainWindow = new BrowserWindow({
    width: size,
    height: size + 26,
    x: state.settings.winX !== null ? state.settings.winX : defaultX,
    y: state.settings.winY !== null ? state.settings.winY : defaultY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile("index.html");

  mainWindow.on("moved", () => {
    const [x, y] = mainWindow.getPosition();
    state.settings.winX = x;
    state.settings.winY = y;
    saveStateDebounced();
  });

  mainWindow.webContents.once("did-finish-load", broadcastState);
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Holy Hotsauce!", enabled: false },
    { type: "separator" },
    {
      label: "Show Widget",
      click: () => { if (mainWindow) { mainWindow.show(); } }
    },
    { type: "separator" },
    {
      label: "Always on Top",
      type: "checkbox",
      checked: state.settings.alwaysOnTop,
      click: (item) => {
        state.settings.alwaysOnTop = item.checked;
        if (mainWindow) mainWindow.setAlwaysOnTop(item.checked);
        saveStateDebounced();
        refreshTrayMenu();
      }
    },
    {
      label: "Start at Login",
      type: "checkbox",
      checked: state.settings.autoStartOnLogin,
      click: (item) => {
        state.settings.autoStartOnLogin = item.checked;
        app.setLoginItemSettings({ openAtLogin: item.checked });
        saveStateDebounced();
        refreshTrayMenu();
      }
    },
    {
      label: "Icon Size",
      submenu: ["S", "M", "L"].map((sz) => ({
        label: sz,
        type: "radio",
        checked: state.settings.iconSize === sz,
        click: () => {
          state.settings.iconSize = sz;
          saveStateDebounced();
          if (mainWindow) {
            const size = SIZE_PX[sz];
            mainWindow.setSize(size, size + 26);
          }
          broadcastState();
          refreshTrayMenu();
        }
      }))
    },
    { type: "separator" },
    {
      label: "Open Full Game (browser)",
      click: () => shell.openExternal(WEB_GAME_URL)
    },
    {
      label: "Privacy: raw count only, see main.js",
      enabled: false
    },
    { type: "separator" },
    { label: "Quit Holy Hotsauce!", click: () => { uIOhook.stop(); app.quit(); } }
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, "tray-icon.png");
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip("Holy Hotsauce! — growing...");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => { if (mainWindow) mainWindow.show(); });
}
function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

/* ---- IPC from the renderer (widget window) ---- */
ipcMain.handle("get-state", () => currentSnapshot());
ipcMain.on("open-full-game", () => shell.openExternal(WEB_GAME_URL));
ipcMain.on("show-settings-menu", () => {
  buildTrayMenu().popup({ window: mainWindow });
});
ipcMain.on("request-quit", () => { uIOhook.stop(); app.quit(); });

/* ---- global keystroke hook: increments a counter, reads nothing else ---- */
function startGlobalHook() {
  uIOhook.on("keydown", () => { addKeystroke(); });
  uIOhook.start();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startGlobalHook();
  if (state.settings.autoStartOnLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
});

app.on("window-all-closed", () => {
  // Stay running in the tray -- this is a background widget, not a
  // document-editing app; quitting on window close would defeat the point
  // of a persistent desktop icon.
});

app.on("before-quit", () => {
  try { uIOhook.stop(); } catch (e) {}
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state)); } catch (e) {}
});
