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
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, clipboard, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { uIOhook, UiohookKey } = require("uiohook-napi");
const { autoUpdater } = require("electron-updater");

// Color ramps with heat, extra mild (yellow) -> mild (green) -> warm
// (orange) -> hot (red), interpolated across all 50 tiers. Kept in sync
// with the identical PEPPERS array in the web app's index.html.
const PEPPERS = [
  { name: "Bell Pepper",                 scoville: 0,       color: "#fdd835" },
  { name: "Pimento",                     scoville: 100,     color: "#f2d536" },
  { name: "Shishito",                    scoville: 200,     color: "#e6d137" },
  { name: "Cubanelle",                   scoville: 300,     color: "#dbce38" },
  { name: "Banana Pepper",               scoville: 500,     color: "#cfca39" },
  { name: "Peperoncini",                 scoville: 600,     color: "#c4c73b" },
  { name: "Anaheim",                     scoville: 800,     color: "#b9c33c" },
  { name: "Poblano",                     scoville: 1500,    color: "#adc03d" },
  { name: "Espelette",                   scoville: 2000,    color: "#a2bd3e" },
  { name: "Pasilla",                     scoville: 2500,    color: "#97b93f" },
  { name: "Mulato",                      scoville: 3000,    color: "#8bb640" },
  { name: "Guajillo",                    scoville: 4000,    color: "#80b241" },
  { name: "New Mexico Chile",            scoville: 4500,    color: "#74af42" },
  { name: "Jalapeño",                    scoville: 5000,    color: "#69ab43" },
  { name: "Mirasol",                     scoville: 5500,    color: "#5ea844" },
  { name: "Fresno",                      scoville: 7000,    color: "#52a546" },
  { name: "Hungarian Wax",               scoville: 10000,   color: "#47a147" },
  { name: "Serrano",                     scoville: 15000,   color: "#4b9f44" },
  { name: "Chile de Árbol",              scoville: 22000,   color: "#569e40" },
  { name: "Manzano",                     scoville: 25000,   color: "#619d3b" },
  { name: "Aji Amarillo",                scoville: 35000,   color: "#6c9c37" },
  { name: "Cayenne",                     scoville: 40000,   color: "#789a33" },
  { name: "Tabasco",                     scoville: 45000,   color: "#83992e" },
  { name: "Pequin",                      scoville: 50000,   color: "#8e982a" },
  { name: "Santaka",                     scoville: 55000,   color: "#999726" },
  { name: "Malagueta",                   scoville: 65000,   color: "#a59521" },
  { name: "Chiltepin",                   scoville: 75000,   color: "#b0941d" },
  { name: "Thai Chili",                  scoville: 85000,   color: "#bb9319" },
  { name: "Piri Piri",                   scoville: 100000,  color: "#c69214" },
  { name: "Aji Charapita",               scoville: 120000,  color: "#d29010" },
  { name: "Jamaican Hot",                scoville: 150000,  color: "#dd8f0c" },
  { name: "Datil",                       scoville: 175000,  color: "#e88e07" },
  { name: "Scotch Bonnet",               scoville: 200000,  color: "#f38d03" },
  { name: "Habanero",                    scoville: 250000,  color: "#fa8a01" },
  { name: "Fatalii",                     scoville: 300000,  color: "#f58302" },
  { name: "Peruvian White Habanero",     scoville: 325000,  color: "#f17c04" },
  { name: "Red Savina Habanero",         scoville: 450000,  color: "#ed7506" },
  { name: "7 Pot Yellow",                scoville: 600000,  color: "#e96e07" },
  { name: "7 Pot Red",                   scoville: 800000,  color: "#e56709" },
  { name: "Naga Morich",                 scoville: 900000,  color: "#e1610b" },
  { name: "Ghost Pepper",                scoville: 1000000, color: "#dc5a0d" },
  { name: "7 Pot Barrackpore",           scoville: 1150000, color: "#d8530e" },
  { name: "Trinidad Scorpion Butch T",   scoville: 1300000, color: "#d44c10" },
  { name: "7 Pot Douglah",               scoville: 1450000, color: "#d04512" },
  { name: "Trinidad Moruga Scorpion",    scoville: 1600000, color: "#cc3e13" },
  { name: "Trinidad Scorpion Chocolate", scoville: 1750000, color: "#c83715" },
  { name: "Komodo Dragon",               scoville: 1850000, color: "#c33117" },
  { name: "Carolina Reaper",             scoville: 2000000, color: "#bf2a19" },
  { name: "Dragon's Breath",             scoville: 2400000, color: "#bb231a" },
  { name: "Pepper X",                    scoville: 2693000, color: "#b71c1c" }
];
const STAGES = ["Seedling", "Leaf", "Blossom", "Pepper", "Hotsauce Bottle"];
const KEYSTROKES_PER_STAGE = 1000;

// Dev runs (npm start, not packaged) use a separate userData profile so
// testing this file never races with -- or corrupts -- a real installed
// copy's save file. Found the hard way: running `npm start` for a quick
// test while an already-installed copy was open meant BOTH processes had
// their own global hook counting the same real keystrokes and writing to
// the same state.json, producing an inflated, corrupted save file.
if (!app.isPackaged) {
  app.setPath("userData", app.getPath("userData") + "-dev");
}

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
    totalCustomHotsauces: 0,
    completionHistory: [],   // pepper names, in the order finished -- powers "latest 5" on the shelf
    customPeppers: [],       // {name, scoville, color, parentA, parentB}
    pendingCustomIndex: -1,  // index into customPeppers currently being grown, -1 = none
    settings: {
      alwaysOnTop: false,
      autoStartOnLogin: false,
      iconSize: "S",
      winX: null,
      winY: null,
      // when false, reaching Pepper X just re-grows Pepper X in a loop
      // instead of unlocking the Hybrid Lab -- matches the web app
      hybridLabEnabled: true,
      // Off by default ("not always on"). This app never touches the
      // microphone itself -- it has no audio code at all. Whatever voice
      // app the user already prefers (Whisper-based or otherwise) drives
      // its own listening (auto/push-to-talk, all the user's own choice
      // in that app). If that tool TYPES its output as simulated
      // keystrokes, it's already counted automatically the moment global
      // capture is running, same as physical typing -- no setting needed,
      // since a low-level keyboard hook can't tell synthetic keystrokes
      // from physical ones (uiohook-napi doesn't expose that distinction).
      // This setting only covers the other common case: a dictation tool
      // that inserts text via clipboard paste (Ctrl+V) instead of typing
      // it. When on, a detected paste reads clipboard.readText().length
      // ONLY -- never the text itself -- adds that many counts, and
      // discards it. Because paste is indistinguishable from any other
      // paste, enabling this counts ALL system-wide pastes' length, not
      // just ones from a voice app -- see the countPasteLength() comment.
      countPastedText: false
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

/* Manual backup/restore, matching the web app's pattern -- the only
   persistence before this was the one auto-save file at STATE_PATH, with
   no way to export it anywhere else (e.g. before an OS reinstall, or to
   move progress to another PC). Uses native save/open dialogs since this
   is a desktop app, not a browser download. */
async function backupNow() {
  if (!mainWindow) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Back up Holy Hotsauce! progress",
    defaultPath: path.join(app.getPath("documents"), `holy-hotsauce-desktop-backup-${stamp}.json`),
    filters: [{ name: "Holy Hotsauce backup", extensions: ["json"] }]
  });
  if (canceled || !filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  dialog.showMessageBox(mainWindow, { type: "info", message: "Backup saved.", detail: filePath, buttons: ["OK"] });
}

async function restoreFromFile() {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Restore Holy Hotsauce! progress",
    defaultPath: app.getPath("documents"),
    filters: [{ name: "Holy Hotsauce backup", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (canceled || !filePaths[0]) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
    if (typeof parsed.totalKeystrokes !== "number") throw new Error("not a Holy Hotsauce backup file");
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      message: "Replace current progress with this backup?",
      detail: `Found ${parsed.totalKeystrokes.toLocaleString()} total keystrokes in the backup. This overwrites what's currently saved.`,
      buttons: ["Cancel", "Restore"],
      defaultId: 1,
      cancelId: 0
    });
    if (response !== 1) return;
    const d = defaultState();
    state = Object.assign(d, parsed, { settings: Object.assign(d.settings, parsed.settings || {}) });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    broadcastState();
    dialog.showMessageBox(mainWindow, { type: "info", message: "Backup restored.", buttons: ["OK"] });
  } catch (e) {
    dialog.showMessageBox(mainWindow, { type: "error", message: "Couldn't restore that file.", detail: String(e.message || e), buttons: ["OK"] });
  }
}

function officialDone() { return state.chartPosition >= PEPPERS.length; }

// Ported from the web app so the desktop game window has full feature
// parity: breeding a custom hybrid, re-looping Pepper X when the Hybrid
// Lab is off, or waiting on a breeding choice once it's on.
function currentGrowing() {
  if (state.pendingCustomIndex >= 0 && state.customPeppers[state.pendingCustomIndex]) {
    return Object.assign({ isCustom: true }, state.customPeppers[state.pendingCustomIndex]);
  }
  if (!officialDone()) return Object.assign({ isCustom: false }, PEPPERS[state.chartPosition]);
  if (!state.settings.hybridLabEnabled) return Object.assign({ isCustom: false }, PEPPERS[PEPPERS.length - 1]);
  return null; // waiting on a Hybrid Lab choice
}

function ownedList() {
  const out = [];
  PEPPERS.forEach((p) => { if (state.completedCounts[p.name]) out.push(p); });
  state.customPeppers.forEach((p) => { if (state.completedCounts[p.name]) out.push(p); });
  return out;
}

function mixHex(h1, h2) {
  const n1 = parseInt(h1.slice(1), 16), n2 = parseInt(h2.slice(1), 16);
  const r = Math.round((((n1 >> 16) & 0xff) + ((n2 >> 16) & 0xff)) / 2);
  const g = Math.round((((n1 >> 8) & 0xff) + ((n2 >> 8) & 0xff)) / 2);
  const b = Math.round(((n1 & 0xff) + (n2 & 0xff)) / 2);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function breedHybrid(parentAName, parentBName, rawName) {
  const owned = ownedList();
  const a = owned.find((p) => p.name === parentAName);
  const b = owned.find((p) => p.name === parentBName);
  const name = (rawName || "").trim();
  if (!a || !b || a.name === b.name || !name || state.pendingCustomIndex >= 0) return;
  const blended = Math.round((a.scoville + b.scoville) / 2);
  const custom = { name, scoville: blended, color: mixHex(a.color, b.color), parentA: a.name, parentB: b.name };
  state.customPeppers.push(custom);
  state.pendingCustomIndex = state.customPeppers.length - 1;
  state.stageIndex = 0;
  state.stageProgress = 0;
  saveStateDebounced();
  broadcastState();
}

function completePepper(p) {
  state.completedCounts[p.name] = (state.completedCounts[p.name] || 0) + 1;
  state.totalHotsauces++;
  state.totalScoville += p.scoville;
  state.completionHistory.push(p.name);
  if (state.completionHistory.length > 300) state.completionHistory.shift();
  if (p.isCustom) {
    state.totalCustomHotsauces++;
    state.pendingCustomIndex = -1;
  } else {
    state.chartPosition++;
  }
}

/* One keystroke event in, one counter increment out -- nothing else ever
   touches the event. This is the entire raw-count guarantee in one place.
   addKeystrokes(n) is the same idea for a batch (a paste is many
   characters landing at once) -- still just a number in, counter out. */
function addKeystrokes(n) {
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    state.totalKeystrokes++;
    const g = currentGrowing();
    if (!g) break; // nothing to grow until a hybrid is chosen
    state.stageProgress++;
    if (state.stageProgress >= KEYSTROKES_PER_STAGE) {
      state.stageProgress = 0;
      state.stageIndex++;
      if (state.stageIndex >= STAGES.length) {
        completePepper(g);
        state.stageIndex = 0;
      }
    }
  }
  saveStateDebounced();
  broadcastState();
}
function addKeystroke() { addKeystrokes(1); }

let mainWindow = null;
let gameWindow = null;
let tray = null;

// Everything the game window needs to render the growing icon, the
// Scoville chart, the Hotsauce Shelf, and the Hybrid Lab -- the widget
// snapshot only needed pepper/stage/totals, but this is the same single
// source of truth (`state`), just a fuller view of it.
function currentSnapshot() {
  const g = currentGrowing();
  return {
    pepper: g,
    stageIndex: state.stageIndex,
    stageProgress: state.stageProgress,
    fillFrac: g ? state.stageProgress / KEYSTROKES_PER_STAGE : 0,
    stageName: STAGES[state.stageIndex],
    totalKeystrokes: state.totalKeystrokes,
    totalHotsauces: state.totalHotsauces,
    totalScoville: state.totalScoville,
    totalCustomHotsauces: state.totalCustomHotsauces,
    chartPos: officialDone() ? null : state.chartPosition + 1,
    chartLen: PEPPERS.length,
    completedCounts: state.completedCounts,
    completionHistory: state.completionHistory,
    customPeppers: state.customPeppers,
    pendingCustomIndex: state.pendingCustomIndex,
    settings: state.settings
  };
}
function broadcastState() {
  const snap = currentSnapshot();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("state-update", snap);
  if (gameWindow && !gameWindow.isDestroyed()) gameWindow.webContents.send("state-update", snap);
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

/* The full game view -- a real, resizable window showing the SAME
   progress as the floating widget (growing icon, Scoville chart,
   Hotsauce Shelf, Hybrid Lab), reading the same `state` this file
   already owns. Clicking the widget used to open a browser tab running
   the separate web game (its own unsynced counter, looked like "my
   progress reset to 0") or a native dialog with just a few stats -- this
   replaces both with one native, in-app drill-down into this app's own
   progress, nothing split off into a browser. */
function createGameWindow() {
  gameWindow = new BrowserWindow({
    width: 560,
    height: 840,
    minWidth: 420,
    minHeight: 560,
    title: "Holy Hotsauce!",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "game-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  gameWindow.setMenuBarVisibility(false);
  gameWindow.loadFile("game.html");
  gameWindow.on("closed", () => { gameWindow = null; });
  gameWindow.webContents.once("did-finish-load", () => {
    gameWindow.webContents.send("state-update", currentSnapshot());
  });
}
function openGameWindow() {
  if (gameWindow && !gameWindow.isDestroyed()) {
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.show();
    gameWindow.focus();
    return;
  }
  createGameWindow();
}

function showAndFocusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/* ---- auto-update (GitHub Releases via electron-builder's "publish"
   config) -- so a fix doesn't mean everyone has to notice, re-download,
   and re-run the installer by hand every time, the way it's worked
   until now. Only runs in a packaged build: `npm start` has no real
   update feed to check against, and re-checking constantly during dev
   would just be noise. Downloads silently in the background; only
   interrupts once it's fully downloaded and ready to install. */
const updateState = { downloaded: false, version: null };
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-downloaded", (info) => {
  updateState.downloaded = true;
  updateState.version = info.version;
  refreshTrayMenu();
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Holy Hotsauce! update ready",
    message: `Version ${info.version} has been downloaded.`,
    detail: "Restart now to install it, or it'll install automatically the next time you quit.",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});
autoUpdater.on("error", () => {}); // silent -- a network hiccup shouldn't interrupt anyone typing
function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "Updates only run in the installed app, not this dev build (`npm start`).",
        buttons: ["OK"]
      });
    }
    return;
  }
  if (updateState.downloaded) {
    autoUpdater.quitAndInstall();
    return;
  }
  autoUpdater.checkForUpdates().then((result) => {
    if (manual && (!result || !result.updateInfo || result.updateInfo.version === app.getVersion())) {
      dialog.showMessageBox(mainWindow, { type: "info", message: "You're on the latest version.", buttons: ["OK"] });
    }
  }).catch(() => {
    if (manual) dialog.showMessageBox(mainWindow, { type: "error", message: "Couldn't check for updates -- check your internet connection.", buttons: ["OK"] });
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Holy Hotsauce!", enabled: false },
    { type: "separator" },
    { label: "Open Game", click: openGameWindow },
    { label: "Show Widget", click: showAndFocusWindow },
    { label: "Hide Widget (stays in tray, still counting)", click: () => { if (mainWindow) mainWindow.hide(); } },
    { type: "separator" },
    {
      label: updateState.downloaded ? `Restart to Install Update (v${updateState.version})` : "Check for Updates",
      click: () => { if (updateState.downloaded) autoUpdater.quitAndInstall(); else checkForUpdates(true); }
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
      label: "Count Pasted Text (voice apps that paste)",
      type: "checkbox",
      checked: state.settings.countPastedText,
      click: (item) => {
        state.settings.countPastedText = item.checked;
        saveStateDebounced();
        refreshTrayMenu();
      }
    },
    { type: "separator" },
    { label: "Back Up Now…", click: backupNow },
    { label: "Restore from File…", click: restoreFromFile },
    { type: "separator" },
    {
      label: "Privacy: raw count only, see main.js",
      enabled: false
    },
    {
      label: "  Typed dictation counts automatically (no toggle)",
      enabled: false
    },
    {
      label: "  Pasted dictation: enable the checkbox above",
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
  tray.on("click", showAndFocusWindow);
}
function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

/* ---- IPC from the renderer (widget window) ---- */
ipcMain.handle("get-state", () => currentSnapshot());
ipcMain.handle("get-peppers", () => PEPPERS);
ipcMain.on("open-game-window", openGameWindow);
ipcMain.on("show-settings-menu", () => {
  buildTrayMenu().popup({ window: mainWindow });
});
/* ---- IPC from the game window ---- */
ipcMain.on("breed-hybrid", (e, { parentAName, parentBName, name } = {}) => {
  breedHybrid(parentAName, parentBName, name);
});
ipcMain.on("set-hybrid-lab-enabled", (e, enabled) => {
  state.settings.hybridLabEnabled = !!enabled;
  saveStateDebounced();
  broadcastState();
  refreshTrayMenu();
});
ipcMain.on("request-quit", () => { uIOhook.stop(); app.quit(); });
// Custom drag: the renderer tracks its own mousedown/mousemove and sends
// incremental screen-pixel deltas here instead of using CSS
// `-webkit-app-region: drag`, which (a real bug found in testing) can
// suppress normal click/hover DOM events on the very same element in
// Electron -- exactly why hovering/clicking the widget wasn't responding.
ipcMain.on("move-window-by", (e, { dx, dy }) => {
  if (!mainWindow) return;
  // Cheap position-only update on every mousemove -- setBounds (which also
  // re-asserts width/height) used to run here instead, on every single
  // move, which fixed an earlier size-drift bug but turned out to cause a
  // new one: on this transparent window, that many rapid geometry changes
  // in a row left the bottom half of the widget unpainted after a drag
  // (a stale/partial-repaint compositor artifact). The exact-size
  // reassertion now only happens once, in reassertWindowBounds() below,
  // called at the end of the drag instead of on every move.
  const [x, y] = mainWindow.getPosition();
  const nx = x + dx, ny = y + dy;
  mainWindow.setPosition(nx, ny);
  state.settings.winX = nx;
  state.settings.winY = ny;
  saveStateDebounced();
});
function reassertWindowBounds() {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const size = SIZE_PX[state.settings.iconSize] || SIZE_PX.M;
  mainWindow.setBounds({ x, y, width: size, height: size + 26 });
}
ipcMain.on("drag-ended", () => { reassertWindowBounds(); });

/* ---- global keystroke hook: increments a counter, reads nothing else ---- */
function startGlobalHook() {
  uIOhook.on("keydown", (e) => {
    // e.keycode is read only to detect the Ctrl/Cmd+V chord itself (a
    // physical key combination, not "which key was pressed" in the sense
    // of recording typed content) -- every other keystroke ignores e
    // entirely. See countPasteLength() below for the one narrow, opt-in
    // exception where paste length (never content) is read.
    const isPasteChord = (e.ctrlKey || e.metaKey) && e.keycode === UiohookKey.V;
    if (isPasteChord && state.settings.countPastedText) {
      countPasteLength();
      return; // don't also double-count the Ctrl/V keydowns as typing
    }
    addKeystroke();
  });
  uIOhook.start();
}

/* Opt-in only (state.settings.countPastedText, default off). Reads
   clipboard text length -- and ONLY the length, never the text itself --
   then `text` goes out of scope immediately. Covers voice-dictation tools
   that insert transcribed speech via paste instead of simulated typing
   (tools that type are already counted automatically above, with no
   special-casing needed -- a low-level keyboard hook can't distinguish
   synthetic keystrokes from physical ones). Runs on ANY system-wide paste
   while enabled, not just ones from a voice app -- ordinary Ctrl+V is
   indistinguishable from one a dictation tool triggers. */
function countPasteLength() {
  try {
    const text = clipboard.readText();
    const len = text.length;
    if (len > 0) addKeystrokes(len);
  } catch (e) {}
}

// Only one instance may ever hold the global hook + write the save file --
// two copies both counting the same real-world keystrokes and racing to
// write the same state.json is exactly the corruption this caused once
// already (see the userData comment above). A second launch attempt (e.g.
// double-clicking the desktop/Start Menu shortcut while it's already
// running in the tray) just focuses the existing widget instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    startGlobalHook();
    if (state.settings.autoStartOnLogin) {
      app.setLoginItemSettings({ openAtLogin: true });
    }
    // Delayed so it never competes with startup for network/CPU, and
    // repeated periodically since this app is meant to stay running in
    // the tray for a long time, not get relaunched daily.
    setTimeout(() => checkForUpdates(false), 8000);
    setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
  });
}

app.on("window-all-closed", () => {
  // Stay running in the tray -- this is a background widget, not a
  // document-editing app; quitting on window close would defeat the point
  // of a persistent desktop icon.
});

app.on("before-quit", () => {
  try { uIOhook.stop(); } catch (e) {}
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state)); } catch (e) {}
});
