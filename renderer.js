const canvas = document.getElementById("icon");
const label = document.getElementById("label");

function sizeCanvasToWindow() {
  const side = Math.max(40, Math.min(window.innerWidth, window.innerHeight - 22));
  canvas.style.width = side + "px";
  canvas.style.height = side + "px";
}
window.addEventListener("resize", sizeCanvasToWindow);
sizeCanvasToWindow();

function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function render(snapshot) {
  if (!snapshot || !snapshot.pepper) return;
  drawIcon(canvas, snapshot.stageIndex, snapshot.pepper.color, snapshot.fillFrac);
  label.textContent = snapshot.pepper.name;
  const chartText = snapshot.chartPos ? `${snapshot.chartPos}/${snapshot.chartLen}` : "max tier";
  canvas.title =
    `${snapshot.pepper.name} — ${snapshot.stageName} (${fmt(snapshot.stageProgress)}/1000)\n` +
    `${chartText} on the Scoville chart\n` +
    `${fmt(snapshot.totalHotsauces)} total hotsauces · ${fmt(snapshot.totalScoville)} SHU total\n` +
    `Powered by ${fmt(snapshot.totalKeystrokes)} global keystrokes (raw count only)`;
}

window.hhs.getState().then(render);
window.hhs.onStateUpdate(render);

let downX = 0, downY = 0, moved = false;
document.getElementById("drag").addEventListener("mousedown", (e) => {
  downX = e.screenX; downY = e.screenY; moved = false;
});
document.getElementById("drag").addEventListener("mousemove", (e) => {
  if (Math.abs(e.screenX - downX) > 4 || Math.abs(e.screenY - downY) > 4) moved = true;
});
document.getElementById("drag").addEventListener("click", () => {
  if (!moved) window.hhs.openFullGame();
});
document.getElementById("drag").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.hhs.showSettingsMenu();
});
