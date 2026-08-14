/* Full game view for the desktop app -- growing icon, Scoville chart,
   Hotsauce Shelf, and Hybrid Lab, all reading the SAME `state` main.js
   already tracks from global keystrokes. This window does no counting
   or growth-logic of its own; it's a pure view of snapshots pushed from
   the main process (get-state/state-update), same channel the floating
   widget uses -- see main.js's currentSnapshot()/broadcastState(). */

const els = {
  keystrokeTotal: document.getElementById("keystrokeTotal"),
  statHotsauces: document.getElementById("statHotsauces"),
  statScoville: document.getElementById("statScoville"),
  growStage: document.getElementById("growStage"),
  chartPos: document.getElementById("chartPos"),
  activeIcon: document.getElementById("activeIcon"),
  growName: document.getElementById("growName"),
  growStageLabel: document.getElementById("growStageLabel"),
  growProgressBar: document.getElementById("growProgressBar"),
  growProgressText: document.getElementById("growProgressText"),
  shelf: document.getElementById("shelf"),
  shelfMoreLink: document.getElementById("shelfMoreLink"),
  chartList: document.getElementById("chartList"),
  hybridLockedMsg: document.getElementById("hybridLockedMsg"),
  hybridOffMsg: document.getElementById("hybridOffMsg"),
  pepperXLoopCount: document.getElementById("pepperXLoopCount"),
  hybridPanel: document.getElementById("hybridPanel"),
  toggleHybridLab: document.getElementById("toggleHybridLab"),
  parentA: document.getElementById("parentA"),
  parentB: document.getElementById("parentB"),
  hybridName: document.getElementById("hybridName"),
  breedBtn: document.getElementById("breedBtn"),
  breedPreview: document.getElementById("breedPreview")
};

const KEYSTROKES_PER_STAGE = 1000; // kept in sync with main.js
let PEPPERS = [];
let lastSnap = null;

function fmt(n) { return Math.round(n).toLocaleString("en-US"); }

function ownedList(snap) {
  const out = [];
  PEPPERS.forEach((p) => { if (snap.completedCounts[p.name]) out.push(p); });
  (snap.customPeppers || []).forEach((p) => { if (snap.completedCounts[p.name]) out.push(p); });
  return out;
}
// Most-recently-finished DISTINCT peppers, most recent first -- e.g.
// looping Pepper X five times in a row shouldn't fill all 5 shelf slots
// with the same bottle.
function recentOwnedList(snap, n) {
  const all = ownedList(snap);
  const byName = {};
  all.forEach((p) => { byName[p.name] = p; });
  const seen = new Set();
  const out = [];
  const history = snap.completionHistory || [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
    const name = history[i];
    if (seen.has(name) || !byName[name]) continue;
    seen.add(name);
    out.push(byName[name]);
  }
  return out;
}
function findOwnedByName(snap, name) {
  return ownedList(snap).find((p) => p.name === name);
}

function renderActive(snap) {
  const g = snap.pepper;
  if (!g) {
    // Nothing's growing until a hybrid is bred -- the Hybrid Lab chooser
    // (now above this panel) already makes that obvious, so this box
    // just hides instead of showing a redundant placeholder.
    els.growStage.style.display = "none";
    return;
  }
  els.growStage.style.display = "";
  els.activeIcon.style.visibility = "visible";
  drawIcon(els.activeIcon, snap.stageIndex, g.color, snap.fillFrac);
  els.growName.textContent = g.name + (g.isCustom ? "  🧪" : "");
  els.growStageLabel.textContent = snap.stageName;
  els.growProgressBar.style.width = (snap.fillFrac * 100).toFixed(1) + "%";
  els.growProgressText.textContent = fmt(snap.stageProgress) + " / " + KEYSTROKES_PER_STAGE;
  if (g.isCustom) {
    els.chartPos.textContent = "CUSTOM VARIETY";
  } else if (snap.chartPos === null) {
    els.chartPos.textContent = "MAX TIER ×" + fmt((snap.completedCounts["Pepper X"] || 0) + 1);
  } else {
    els.chartPos.textContent = snap.chartPos + " / " + snap.chartLen;
  }
}

let shelfExpanded = false;
els.shelfMoreLink.addEventListener("click", () => {
  shelfExpanded = !shelfExpanded;
  if (lastSnap) renderShelf(lastSnap);
});

function renderShelf(snap) {
  const full = ownedList(snap);
  const recent = recentOwnedList(snap, 5);
  const showingAll = shelfExpanded || full.length <= recent.length;
  const owned = showingAll ? full : recent;

  els.shelfMoreLink.classList.toggle("show", full.length > recent.length);
  els.shelfMoreLink.textContent = shelfExpanded ? "← show latest only" : "see the full store room →";

  els.shelf.innerHTML = "";
  if (owned.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shelf-empty";
    empty.textContent = "no bottles finished yet — keep typing!";
    els.shelf.appendChild(empty);
    return;
  }
  owned.forEach((p) => {
    const item = document.createElement("div");
    item.className = "shelf-item";
    const cnv = document.createElement("canvas");
    // Internal resolution stays 192 (matching the 24-cell shape grid) even
    // though this renders small -- at a literal 48x48 canvas, drawIcon's
    // inset math rounds down to zero width for the colored fill, leaving
    // every shelf bottle solid black regardless of its actual pepper
    // color. CSS shrinks the display size instead of the render resolution.
    cnv.width = 192; cnv.height = 192;
    cnv.style.width = "48px"; cnv.style.height = "48px";
    drawIcon(cnv, 4, p.color, 1);
    const cnt = document.createElement("div");
    cnt.className = "cnt";
    cnt.textContent = "x" + snap.completedCounts[p.name];
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = p.name;
    item.appendChild(cnv);
    item.appendChild(cnt);
    item.appendChild(nm);
    els.shelf.appendChild(item);
  });
}

function renderChart(snap) {
  els.chartList.innerHTML = "";
  PEPPERS.forEach((p, i) => {
    const row = document.createElement("div");
    const done = !!snap.completedCounts[p.name];
    const isCurrent = snap.chartPos !== null && i === snap.chartPos - 1 && snap.pendingCustomIndex < 0;
    row.className = "chart-row" + (done ? " done" : "") + (isCurrent ? " current" : "");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = p.color;
    row.appendChild(sw);
    const label = document.createElement("span");
    label.textContent = (done ? "✓ " : "") + p.name;
    row.appendChild(label);
    const shu = document.createElement("span");
    shu.className = "shu";
    shu.textContent = fmt(p.scoville) + " SHU";
    row.appendChild(shu);
    els.chartList.appendChild(row);
  });
}

function renderHybridPanel(snap) {
  const unlocked = snap.chartPos === null;
  const hybridOn = snap.settings.hybridLabEnabled;
  els.toggleHybridLab.classList.toggle("on", hybridOn);

  els.hybridLockedMsg.style.display = (unlocked || !hybridOn) ? "none" : "block";
  els.hybridOffMsg.classList.toggle("show", unlocked && !hybridOn);
  if (unlocked && !hybridOn) {
    els.pepperXLoopCount.textContent = fmt(snap.completedCounts["Pepper X"] || 0);
  }
  els.hybridPanel.classList.toggle("unlocked", unlocked && hybridOn);
  if (!unlocked || !hybridOn) return;

  const owned = ownedList(snap);
  [els.parentA, els.parentB].forEach((sel) => {
    const prev = sel.value;
    sel.innerHTML = "";
    owned.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name + " (" + fmt(p.scoville) + " SHU)";
      sel.appendChild(opt);
    });
    if (owned.some((p) => p.name === prev)) sel.value = prev;
  });
  updateBreedPreview();
}

function updateBreedPreview() {
  if (!lastSnap) return;
  const a = findOwnedByName(lastSnap, els.parentA.value);
  const b = findOwnedByName(lastSnap, els.parentB.value);
  const busy = lastSnap.pendingCustomIndex >= 0;
  if (busy) {
    els.breedPreview.textContent = "Finish growing your current pepper before breeding another.";
    els.breedBtn.disabled = true;
    return;
  }
  if (a && b && a.name !== b.name) {
    const blended = Math.round((a.scoville + b.scoville) / 2);
    els.breedPreview.innerHTML = "Blend preview: <b style='color:var(--accent-2)'>" + fmt(blended) + " SHU</b> (exact 50/50 of " + a.name + " + " + b.name + ")";
    els.breedBtn.disabled = !els.hybridName.value.trim();
  } else {
    els.breedPreview.textContent = a && b && a.name === b.name ? "Pick two different peppers." : "";
    els.breedBtn.disabled = true;
  }
}

els.parentA.addEventListener("change", updateBreedPreview);
els.parentB.addEventListener("change", updateBreedPreview);
els.hybridName.addEventListener("input", updateBreedPreview);
els.breedBtn.addEventListener("click", () => {
  const name = els.hybridName.value.trim();
  if (els.breedBtn.disabled || !name) return;
  window.hhsGame.breedHybrid(els.parentA.value, els.parentB.value, name);
  els.hybridName.value = "";
});
els.toggleHybridLab.addEventListener("click", () => {
  const next = !els.toggleHybridLab.classList.contains("on");
  window.hhsGame.setHybridLabEnabled(next);
});

function render(snap) {
  lastSnap = snap;
  els.keystrokeTotal.textContent = fmt(snap.totalKeystrokes);
  els.statHotsauces.textContent = fmt(snap.totalHotsauces) + " hotsauces";
  els.statScoville.textContent = fmt(snap.totalScoville) + " total SHU";
  renderActive(snap);
  renderShelf(snap);
  renderChart(snap);
  renderHybridPanel(snap);
}

window.hhsGame.getPeppers().then((list) => {
  PEPPERS = list;
  window.hhsGame.getState().then(render);
  window.hhsGame.onStateUpdate(render);
});
