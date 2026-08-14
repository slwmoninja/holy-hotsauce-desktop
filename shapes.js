/* Ported verbatim from the web app (Desktop/Apps/HolyHotsauce/index.html) so
   the desktop widget's icon matches the browser game exactly. Keep these two
   copies in sync if the shapes/shading ever change on the web side. */
const PG = 24; // shape grid resolution
function makeGrid(fn){
  const g=[];
  for(let r=0;r<PG;r++){
    const row=[];
    for(let c=0;c<PG;c++) row.push(fn(r,c));
    g.push(row);
  }
  return g;
}
function ellipseHit(r,c,cr,cc,rr,rc,ang){
  if(ang){
    const dr0=r-cr, dc0=c-cc;
    const ca=Math.cos(ang), sa=Math.sin(ang);
    const dr=dc0*ca+dr0*sa, dc=-dc0*sa+dr0*ca;
    return (dr*dr)/(rc*rc)+(dc*dc)/(rr*rr)<=1;
  }
  const dr=(r-cr)/rr, dc=(c-cc)/rc;
  return dr*dr+dc*dc<=1;
}

const shapeSeedling = makeGrid((r,c)=>{
  const rim = r>=15 && r<=16 && c>=3 && c<=20;
  const bodyTopL=5, bodyTopR=18, bodyBotL=7, bodyBotR=16;
  const t = r>=17 ? (r-17)/(23-17) : 0;
  const left = bodyTopL+(bodyBotL-bodyTopL)*t, right = bodyTopR+(bodyBotR-bodyTopR)*t;
  const body = r>=17 && r<=23 && c>=left && c<=right;
  const soil = r>=14 && r<=15 && c>=6 && c<=17;
  const stem = r>=6 && r<=14 && c>=11 && c<=12;
  const leafL = ellipseHit(r,c,8,8,3.6,2.4,0.55);
  const leafR = ellipseHit(r,c,8,15,3.6,2.4,-0.55);
  if(rim||body) return "pot";
  return soil||stem||leafL||leafR;
});

// Ovate-lanceolate with a pointed tip, a central midrib + two pairs of
// side veins, and a short petiole (stem) at the base -- closer to a real
// chili pepper leaf. Two things had to change from the first attempt at
// this shape to get there:
//  1. The tip taper used sin() easing, which grows almost linearly near
//     zero -- at this pixel resolution that reached 4 columns wide by
//     the SECOND row, reading as a flat/round cap instead of a point.
//     A power curve (t^2.4) grows near-zero for several rows before
//     accelerating, giving a genuinely narrow point across multiple rows.
//  2. Veins used to be a "hole" in the silhouette (a cell excluded from
//     the body), which gets both its edges outlined by isBorderCell just
//     like the outer silhouette -- reads as a carved-out eye, not a
//     vein. Veins are body cells now (see cellOn), just with their own
//     "vein" fill color instead of the leaf's default shade.
const shapeLeaf = makeGrid((r,c)=>{
  const cx = PG/2-0.5;
  if(r>=1 && r<=18){
    const t = (r-1)/17;
    const peak = 0.38, maxHalf = 6.3, minFrac = 0.15, tipPower = 2.4;
    let w;
    if(t<=peak) w = Math.pow(t/peak, tipPower);
    else { const tt=(t-peak)/(1-peak); w = Math.pow(1-tt,0.75)*(1-minFrac)+minFrac; }
    const half = maxHalf*w;
    if(Math.abs(c-cx)>half) return false;
    if(Math.abs(c-cx)<=0.5 && r>=5 && r<=15) return "vein";
    for(const [vr0,vr1,off] of [[6,9,2.2],[10,13,2.6]]){
      if(r>=vr0 && r<=vr1){
        const tt2=(r-vr0)/(vr1-vr0);
        for(const sign of [-1,1]){
          const vc = cx+sign*off*tt2;
          if(Math.abs(c-vc)<=0.5) return "vein";
        }
      }
    }
    return true;
  }
  if(r>=19 && r<=22 && Math.abs(c-cx)<=1.1) return "stem";
  return false;
});

const shapeBlossom = makeGrid((r,c)=>{
  const cx=PG/2-0.5, cy=PG/2-1.5;
  if(ellipseHit(r,c,cy,cx,2.6,2.6)) return "center";
  let petal=false;
  for(let k=0;k<5;k++){
    const ang = k*(2*Math.PI/5)-Math.PI/2;
    const pr = cy+Math.sin(ang)*5.2, pc = cx+Math.cos(ang)*5.2;
    if(ellipseHit(r,c,pr,pc,3.6,3.6)){
      const tipR = cy+Math.sin(ang)*8.4, tipC = cx+Math.cos(ang)*8.4;
      if(ellipseHit(r,c,tipR,tipC,1.7,1.7)) continue;
      petal = true;
    }
  }
  const stem = r>=PG-3 && Math.abs(c-cx)<=0.6;
  return petal||stem;
});

const shapePepper = (function(){
  const P0={x:16.5,y:3}, P1={x:5,y:9}, P2={x:9,y:21};
  const samples=[];
  for(let i=0;i<=80;i++){
    const t=i/80, it=1-t;
    samples.push({
      x: it*it*P0.x+2*it*t*P1.x+t*t*P2.x,
      y: it*it*P0.y+2*it*t*P1.y+t*t*P2.y,
      t
    });
  }
  return makeGrid((r,c)=>{
    const stem = r<=2 && c>=14 && c<=18;
    if(stem) return "stem";
    if(r>=2 && r<=4){
      for(let k=0;k<5;k++){
        const cc0 = 13+k*1.4;
        if(Math.abs(c-cc0)<=0.7 && r<=3+(k%2)*1) return "calyx";
      }
    }
    let minD=Infinity, minT=0;
    for(let i=0;i<samples.length;i++){
      const d=Math.hypot(c-samples[i].x, r-samples[i].y);
      if(d<minD){minD=d; minT=samples[i].t;}
    }
    const width = 1.3+2.5*Math.sin(Math.PI*Math.min(minT*1.05,1));
    return minD<=width;
  });
})();

const shapeBottle = makeGrid((r,c)=>{
  const cx = PG/2-0.5;
  const cap = r>=0 && r<=2 && Math.abs(c-cx)<=2.6;
  const neck = r>=2 && r<=6 && Math.abs(c-cx)<=1.8;
  let shoulder = false;
  if(r>=6 && r<=8){
    const t=(r-6)/2;
    shoulder = Math.abs(c-cx) <= 1.8+(7.2-1.8)*t;
  }
  let body = r>=8 && r<=22 && Math.abs(c-cx)<=7.2;
  if(r>=21 && Math.abs(c-cx)>6.0) body=false;
  if(r===22 && Math.abs(c-cx)>4.5) body=false;
  const base = r===23 && Math.abs(c-cx)<=5.5;
  const label = r>=13 && r<=15 && Math.abs(c-cx)<=7.2;
  if(!(cap||neck||shoulder||body||base)) return false;
  if(cap) return "cap";
  if(label) return "label";
  return true;
});

const STAGE_SHAPES = [shapeSeedling, shapeLeaf, shapeBlossom, shapePepper, shapeBottle];
const STAGE_NAMES_ART = ["seedling","leaf","blossom","pepper","bottle"];
const STAGE_COLORS = {
  seedling: {default:"#4caf50", pot:"#c07a4e"},
  leaf:     {default:"#4caf50", stem:"#6ea83f", vein:"#1b5e20"},
  blossom:  {default:"#f2a6c4", center:"#f4c542"},
  pepper:   {default:"#d32f2f", stem:"#4caf50", calyx:"#4caf50"},
  bottle:   {default:"#d32f2f", label:"#f0e6da", cap:"#6a1b9a"}
};
// "vein" used to be excluded here (a hole, not body) so it could draw as
// a solid dark line -- but a hole gets its edges outlined by
// isBorderCell just like the outer silhouette, which at this pixel
// resolution reads as a carved-out eye rather than a subtle vein.
// Veins are body cells now, just with their own fill color (see
// STAGE_COLORS.leaf.vein / colorFor) instead of the default shade.
function cellOn(v){ return v===true || typeof v==="string"; }
function cellKind(v){ return typeof v==="string" ? v : null; }
// `instanceColor` is the specific pepper's own gradient color (PEPPERS[i]
// .color); a stage-specific "kind" override (pot/stem/calyx/cap/label/
// vein -- a fixed-role part like a brown pot or purple cap that shouldn't
// vary by pepper) still wins when present. Previously this always fell
// back to a hardcoded STAGE_COLORS[stage].default instead of the pepper's
// own color, so growing icons and shelf bottles rendered in one fixed
// color per stage no matter which pepper -- only the flat chart-list
// swatches (plain CSS background, no drawIcon involved) ever showed the
// real per-pepper gradient.
function colorFor(stage, kind, instanceColor){
  const m = STAGE_COLORS[stage];
  return (kind && m[kind]) ? m[kind] : instanceColor;
}

function computeBounds(grid){
  let minR=PG,maxR=-1,minC=PG,maxC=-1;
  for(let r=0;r<PG;r++){
    for(let c=0;c<PG;c++){
      if(cellOn(grid[r][c])){
        if(r<minR)minR=r; if(r>maxR)maxR=r;
        if(c<minC)minC=c; if(c>maxC)maxC=c;
      }
    }
  }
  return {minR,maxR,minC,maxC};
}
const STAGE_BOUNDS = STAGE_SHAPES.map(computeBounds);

function isBorderCell(grid,r,c){
  if(!cellOn(grid[r][c])) return false;
  const neighbors=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
  for(const [nr,nc] of neighbors){
    if(nr<0||nc<0||nr>=PG||nc>=PG||!cellOn(grid[nr][nc])) return true;
  }
  return false;
}

/* Alternating black/white outline, colored by walking the connected border
   (8-connectivity) and greedily picking whichever color is the local
   minority among each cell's already-colored neighbors -- NOT a fixed
   (r+c)%2 checkerboard. A coordinate-parity checkerboard only alternates
   correctly on horizontal/vertical steps; on a diagonal step both r and c
   change together so (r+c)%2 stays THE SAME, which made whole stretches of
   diagonal outline collapse to a single color -- invisible against a
   same-tone background, i.e. the outline appeared to have gaps. This
   walk-and-vote approach keeps genuinely alternating through curves and
   diagonals (a handful of unavoidable repeats can remain at true branch
   points, since a solid 2D region isn't always perfectly 2-colorable --
   but it's a large, visually-confirmed improvement over the coordinate
   formula). Returns a Map of "r,c" -> 0 (dark) or 1 (light).
   Precomputed once per shape, not per frame. */
function computeOutlineColors(grid){
  const borderSet = new Set();
  for(let r=0;r<PG;r++){
    for(let c=0;c<PG;c++){
      if(isBorderCell(grid,r,c)) borderSet.add(r*PG+c);
    }
  }
  function neighborsOf(r,c){
    const out=[];
    for(let dr=-1;dr<=1;dr++){
      for(let dc=-1;dc<=1;dc++){
        if(dr===0&&dc===0) continue;
        const nr=r+dr, nc=c+dc;
        if(borderSet.has(nr*PG+nc)) out.push(nr*PG+nc);
      }
    }
    return out;
  }
  const order = [];
  const remaining = new Set(borderSet);
  while(remaining.size){
    let start = null;
    for(const k of remaining){ if(start===null||k<start) start=k; }
    const queue=[start];
    remaining.delete(start);
    while(queue.length){
      const k = queue.shift();
      order.push(k);
      for(const nb of neighborsOf(Math.floor(k/PG), k%PG)){
        if(remaining.has(nb)){ remaining.delete(nb); queue.push(nb); }
      }
    }
  }
  const color = new Map();
  for(const k of order){
    const r = Math.floor(k/PG), c = k%PG;
    let c0=0, c1=0;
    for(const nb of neighborsOf(r,c)){
      if(color.has(nb)){ if(color.get(nb)===0) c0++; else c1++; }
    }
    let chosen;
    if(c1>c0) chosen=0;
    else if(c0>c1) chosen=1;
    else chosen=(r+c)%2===0?0:1;
    color.set(k, chosen);
  }
  return color;
}
const STAGE_OUTLINE_COLORS = STAGE_SHAPES.map(computeOutlineColors);

function shadeColor(hex, amt){
  const n = parseInt(hex.slice(1),16);
  let r=(n>>16)+amt, g=((n>>8)&0xff)+amt, b=(n&0xff)+amt;
  r=Math.round(Math.max(0,Math.min(255,r)));
  g=Math.round(Math.max(0,Math.min(255,g)));
  b=Math.round(Math.max(0,Math.min(255,b)));
  return "#"+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function shadeForCell(color, r, c, bounds){
  const tRow = bounds.maxR>bounds.minR ? (r-bounds.minR)/(bounds.maxR-bounds.minR) : 0.5;
  const tCol = bounds.maxC>bounds.minC ? (c-bounds.minC)/(bounds.maxC-bounds.minC) : 0.5;
  const amt = 58 - tRow*116 + (0.5-tCol)*26;
  return shadeColor(color, amt);
}

const OUTLINE_DARK = "#000000";
const OUTLINE_LIGHT = "#ffffff";
const GRID_COLOR = "#140b09";

/* draws one stage icon into a canvas at a continuous fill fraction (0..1) */
function drawIcon(canvas, stageIdx, color, fillFrac){
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.imageSmoothingEnabled = false;
  const cell = W/PG;
  const grid = STAGE_SHAPES[stageIdx];
  const bounds = STAGE_BOUNDS[stageIdx];
  const stage = STAGE_NAMES_ART[stageIdx];
  const outlineColors = STAGE_OUTLINE_COLORS[stageIdx];

  for(let r=0;r<PG;r++){
    for(let c=0;c<PG;c++){
      if(isBorderCell(grid,r,c)){
        // Alternating black/white "marching ants" outline (see
        // computeOutlineColors) instead of a single fixed color, so the
        // silhouette stays visible sitting on top of an arbitrary desktop
        // wallpaper -- light, dark, or a busy photo -- rather than
        // disappearing against a same-tone background.
        const oc = outlineColors.get(r*PG+c);
        ctx.fillStyle = oc===0 ? OUTLINE_DARK : OUTLINE_LIGHT;
        ctx.fillRect(c*cell, r*cell, cell, cell);
      }
    }
  }

  const fillH = Math.max(0, Math.min(1, fillFrac)) * H;
  if(fillH<=0) return;
  const inset = Math.max(1, cell*0.14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, H-fillH, W, fillH);
  ctx.clip();
  for(let r=0;r<PG;r++){
    for(let c=0;c<PG;c++){
      const v = grid[r][c];
      if(!cellOn(v)) continue;
      ctx.fillStyle = GRID_COLOR;
      ctx.fillRect(c*cell, r*cell, cell, cell);
      const kind = cellKind(v);
      const baseColor = (stage==="seedling" && r>=17) ? colorFor(stage,"pot",color) : colorFor(stage, kind, color);
      if(kind==="label"){
        ctx.fillStyle = baseColor;
      } else {
        ctx.fillStyle = shadeForCell(baseColor, r, c, bounds);
      }
      ctx.fillRect(c*cell+inset, r*cell+inset, cell-2*inset, cell-2*inset);
    }
  }
  ctx.restore();
}
