const canvas = document.getElementById("icon");
const label = document.getElementById("label");
const dragEl = document.getElementById("drag");

// Canvas display size is derived deterministically from the icon-size
// setting (S/M/L), not from a reactive `resize` DOM listener -- Windows
// can fire spurious resize events on a frameless window purely from
// *moving* it (no size actually changed), which made the icon visibly
// flicker/resize on every drag when this read window.innerWidth/Height
// reactively. Kept in sync with main.js's SIZE_PX.
const SIZE_PX = { S: 72, M: 110, L: 156 };
let currentIconSize = "M";
function applyCanvasSize(iconSize) {
  if (iconSize === currentIconSize) return;
  currentIconSize = iconSize;
  const side = SIZE_PX[iconSize] || SIZE_PX.M;
  canvas.style.width = side + "px";
  canvas.style.height = side + "px";
}
applyCanvasSize("M");

function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function render(snapshot) {
  if (!snapshot) return;
  if (snapshot.settings && snapshot.settings.iconSize) applyCanvasSize(snapshot.settings.iconSize);
  if (!snapshot.pepper) {
    // Waiting on a Hybrid Lab breeding choice -- nothing's actively
    // growing, so there's no icon to draw. Open the game window (click)
    // to pick two peppers and breed.
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    label.textContent = "Hybrid Lab";
    return;
  }
  drawIcon(canvas, snapshot.stageIndex, snapshot.pepper.color, snapshot.fillFrac);
  label.textContent = snapshot.pepper.name;
}

window.hhs.getState().then(render);
window.hhs.onStateUpdate(render);

/* ---- custom drag (see index.html's comment: -webkit-app-region: drag
   suppressed click on this same element, so dragging is done by hand
   here instead, via mousedown/mousemove deltas sent to main.js). Click
   (no significant movement) opens the full game window -- the same
   growing icon, Scoville chart, Hotsauce Shelf, and Hybrid Lab you'd get
   on the web, but as one native desktop window reading this app's own
   progress. No browser tab, no separate/unsynced counter, no split
   experience. Hover/tooltip was removed since there's no room to show
   one without it clipping off this tiny window. */
let dragging = false;
let downX = 0, downY = 0;
let lastX = 0, lastY = 0;
let moved = false;

dragEl.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // left button only; right-click is the context menu
  dragging = true;
  moved = false;
  downX = lastX = e.screenX;
  downY = lastY = e.screenY;
  dragEl.classList.add("dragging");
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  lastX = e.screenX;
  lastY = e.screenY;
  if (Math.abs(e.screenX - downX) > 4 || Math.abs(e.screenY - downY) > 4) moved = true;
  if (dx !== 0 || dy !== 0) window.hhs.moveWindowBy(dx, dy);
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  dragEl.classList.remove("dragging");
  if (moved) window.hhs.dragEnded();
  else window.hhs.openGame();
});

dragEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.hhs.showSettingsMenu();
});
