"use strict";
/* Bubble Blast Pro — lean core. No heavy libs: 2D canvas bg, CSS-only motion. */

const POINTS_GOOD = 10;
const POINTS_BAD = 5;
const STREAK_EVERY = 5;
const STREAK_BONUS = 25;

const pbtm = document.querySelector("#pbtm");
const floatLayer = document.querySelector("#float-layer");
const hitVal = document.querySelector("#hitval");
const timerNum = document.querySelector("#timerval-num");
const timerBar = document.querySelector("#timerbar");
const scoreVal = document.querySelector("#scoreval");
const scoreHud = document.querySelector(".hud-score");
const accVal = document.querySelector("#accval");
const streakVal = document.querySelector("#streakval");
const modeVal = document.querySelector("#modeval");
const bestVal = document.querySelector("#bestval");
const startOverlay = document.querySelector("#startOverlay");
const pauseOverlay = document.querySelector("#pauseOverlay");
const gameOverOverlay = document.querySelector("#gameOverOverlay");
const finalScore = document.querySelector("#finalScore");
const newBestMsg = document.querySelector("#newBest");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const resumeButton = document.querySelector("#resumeButton");
const quitButton = document.querySelector("#quitButton");
const changeDurButton = document.querySelector("#changeDurButton");
const soundBtn = document.querySelector("#soundBtn");
const hapticBtn = document.querySelector("#hapticBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const statHits = document.querySelector("#statHits");
const statStreak = document.querySelector("#statStreak");
const statAcc = document.querySelector("#statAcc");
const overMeta = document.querySelector("#overMeta");
const timeHud = document.querySelector(".hud-time");
const timeLabel = timeHud ? timeHud.querySelector(".hud-label") : null;
const pauseTimeLabel = document.querySelector("#pauseTimeLabel");
const pauseTime = document.querySelector("#pauseTime");

let roundSecs = 60;          // chosen ONLY on the setup screen; 0 = unlimited
let mode = "easy";            // easy | medium | hard — chosen ONLY on the setup screen
let timer = roundSecs;        // seconds remaining (limited rounds)
let elapsed = 0;              // seconds played (unlimited rounds)
let score = 0;
let hit = -1;
let timerId = null;
let playing = false;
let paused = false;
let soundOn = true;
let hapticOn = true;
try { hapticOn = localStorage.getItem("bubble-blast-haptics") !== "off"; } catch (_) {}
let streak = 0, bestStreak = 0, hits = 0, misses = 0;
let best = 0;
try { best = Number(localStorage.getItem("bubble-blast-best") || 0); } catch (_) {}
bestVal.textContent = best;

const randDigit = () => Math.floor(Math.random() * 10);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const unlimited = () => roundSecs === 0; // no clock: the round runs until you end it
const roundLabel = () => (unlimited() ? "∞" : roundSecs + "S");

function safePlay(el) {
  if (!soundOn || !el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}
const sfx = (id) => safePlay(document.getElementById(id));

/* Haptics: Vibration API (Android/Chrome & most mobile browsers; a silent
   no-op on desktop / iOS, which don't expose navigator.vibrate).

   The API gives no amplitude control — only *how long* and *in what rhythm* —
   so "feel" is built from pulse length and spacing. Two rules learned the
   hard way: devices drop or round up pulses shorter than ~20 ms (the earlier
   16 ms tap was essentially imperceptible), and array indices alternate
   starting with VIBRATE, i.e. [on, off, on, off, …] — not [wait, on, …]. */
const HAPTIC = {
  // single tap that lands a little heavier with every hit in the streak (30 → 42 ms),
  // so the board audibly "charges up" on the way to the +25 bonus
  hit: (streak) => 26 + (streak % STREAK_EVERY) * 4,
  bonus: [22, 40, 30, 40, 55],   // rising triple — reward feels like a flourish
  miss: [45, 60, 80],            // heavy two-stage thud: clear "no"
  end: [70, 60, 70, 60, 160]     // round-over fanfare
};

function buzz(pattern) {
  if (!hapticOn) return;
  try {
    if (!navigator.vibrate) return;
    navigator.vibrate(0); // drop any in-flight buzz so fast pops stay snappy
    navigator.vibrate(pattern);
  } catch (_) {}
}

/* Stop helpers: the round-over fanfare is long — it must die the moment
   the user touches any button (Play again, New setup, mute, …). */
function stopSfx(id) {
  try {
    const el = document.getElementById(id);
    if (el) { el.pause(); el.currentTime = 0; }
  } catch (_) {}
}
function stopAllSfx() {
  stopSfx("timerEndSound");
  stopSfx("scoreIncreaseSound");
  stopSfx("scoreDecreaseSound");
}

/* ----- themes: midnight (dark) · daylight (bright) ----- */
const THEMES = [
  { id: "midnight", glyph: "☾", name: "Midnight" },
  { id: "daylight", glyph: "☀", name: "Daylight" }
];
const themeBtn = document.querySelector("#themeBtn");

function currentTheme() {
  return document.documentElement.dataset.theme || "midnight";
}
function syncBg() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (v) bgPaint = v;
  } catch (_) {}
  bgPalette = BG_DOTS[currentTheme()] || BG_DOTS.midnight;
}
function setTheme(id, save = true) {
  if (!BG_DOTS[id]) id = "midnight";
  if (id === "midnight") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", id);
  try { if (save) localStorage.setItem("bubble-blast-theme", id); } catch (_) {}
  if (themeBtn) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    themeBtn.textContent = t.glyph;
    themeBtn.setAttribute("aria-label", "Theme: " + t.name);
    themeBtn.title = "Theme: " + t.name;
  }
  document.querySelectorAll(".themeSeg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.themeVal === id);
  });
  syncBg();
}
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const ids = THEMES.map((t) => t.id);
    setTheme(ids[(ids.indexOf(currentTheme()) + 1) % ids.length]);
  });
}
document.querySelectorAll(".themeSeg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn || !btn.dataset.themeVal) return;
    setTheme(btn.dataset.themeVal);
  });
});

/* ----- cheap 2D ambient background (theme-aware) ----- */
const BG_DOTS = {
  midnight: ["34,211,238", "167,139,250"],
  daylight: ["67,56,202", "225,29,72"]
};
let bgPalette = BG_DOTS.midnight;
let bgPaint = "#07080d";
(function bg() {
  try {
    if (reducedMotion()) return;
    const cv = document.getElementById("bg");
    const ctx = cv.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 1); // cap at 1: perf
    let W = 0, H = 0, dots = [];
    const N = window.innerWidth < 640 ? 16 : 26;
    function size() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * DPR; cv.height = H * DPR;
      cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function seed() {
      dots = Array.from({ length: N }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: 60 + Math.random() * 150,
        vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.1,
        c: bgPalette[Math.floor(Math.random() * bgPalette.length)],
        a: 0.04 + Math.random() * 0.05
      }));
    }
    size(); seed();
    window.addEventListener("resize", () => { size(); seed(); }, { passive: true });
    let running = true;
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bgPaint;
      ctx.fillRect(0, 0, W, H);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < -d.r) d.x = W + d.r; if (d.x > W + d.r) d.x = -d.r;
        if (d.y < -d.r) d.y = H + d.r; if (d.y > H + d.r) d.y = -d.r;
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(${d.c},${d.a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (_) {}
})();

/* ----- difficulty pick (setup screen only) ----- */
document.querySelectorAll(".diff").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode || "easy";
    if (modeVal) modeVal.textContent = mode.toUpperCase();
    refreshCustomUI();
  }, { passive: true });
});

/* ----- custom rules (setup screen only): any preset, or your own mix ----- */
let custom = { drift: "off", overlap: "off", numbers: "popped", speed: "default" };

function settings() {
  if (mode === "easy") return { drift: false, overlap: false, numbers: "popped", mult: 1 };
  if (mode === "medium") return { drift: false, overlap: false, numbers: "all", mult: 1 };
  if (mode === "hard") return { drift: true, overlap: false, numbers: "all", mult: 1 };
  if (mode === "extreme") return { drift: true, overlap: true, numbers: "all", mult: 1 };
  const mult = custom.speed === "faster" ? 1.5 : custom.speed === "fast" ? 1.25 : 1;
  return {
    drift: custom.drift === "on",
    overlap: custom.drift === "on" && custom.overlap === "on",
    numbers: custom.numbers,
    mult
  };
}

document.querySelectorAll("#customPanel .seg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    custom[seg.closest(".crow").dataset.key] = btn.dataset.val;
    if (mode !== "custom") {
      mode = "custom";
      document.querySelectorAll(".diff").forEach((b) => b.classList.toggle("active", b.dataset.mode === "custom"));
      if (modeVal) modeVal.textContent = "CUSTOM";
    }
    refreshCustomUI();
  });
});

function refreshCustomUI() {
  const panel = document.querySelector("#customPanel");
  if (panel) panel.classList.toggle("hidden", mode !== "custom");
  const on = custom.drift === "on";
  const ov = document.querySelector('.crow[data-key="overlap"]');
  const sp = document.querySelector('.crow[data-key="speed"]');
  if (ov) ov.classList.toggle("disabled", !on);
  if (sp) sp.classList.toggle("disabled", !on);
}
document.querySelectorAll(".dur").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dur").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    // data-secs="0" is a legitimate pick (unlimited), so 0 must not fall back to 60
    const secs = Number(btn.dataset.secs);
    roundSecs = Number.isFinite(secs) ? secs : 60;
    timer = roundSecs;
    elapsed = 0;
    updateTimerUI();
  }, { passive: true });
});

/* Board geometry. The panel now has a definite height (flex), so size the
   grid to the box that is actually available: pick the column count whose
   cell size keeps the bubbles closest to their intended size while filling
   the panel, then let the leftover centre out. Square cells, no clipping,
   and a tall phone gets a tall board instead of dead space. */
const pbtmWrap = document.querySelector("#pbtm-wrap");
let fit = { cols: 7, rows: 6, cell: 44 }; // last measured geometry

function fitBoard() {
  const cs = getComputedStyle(pbtm);
  const gap = parseFloat(cs.columnGap) || 10;
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = pbtm.clientWidth - padX;
  const availH = pbtm.clientHeight - padY;
  const baseCell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 44;
  if (availW < 80 || availH < 80) return false; // not laid out yet — keep the last fit

  // the density the game had before (width-only rule) is the target, so filling
  // the panel never silently makes the board harder
  const baseCols = Math.max(3, Math.floor((availW + gap) / (baseCell + gap)));
  const baseRows = (window.innerWidth <= 480 || window.innerHeight < 700) ? 6 : 7;
  const target = baseCols * baseRows;

  let best = null;
  for (const minCell of [baseCell * 0.8, 22]) {
    for (let cols = 3; cols <= baseCols + 2; cols++) {
      const cell = (availW - (cols - 1) * gap) / cols; // fills the width exactly
      if (cell < minCell) continue;
      const rows = Math.floor((availH + gap) / (cell + gap));
      if (rows < 2) continue;
      const slack = (availH - (rows * cell + (rows - 1) * gap)) / availH;
      const score = Math.abs(cols * rows - target) / target + slack * 2;
      if (!best || score < best.score) best = { cols, rows, cell, score };
    }
    if (best) break;
  }
  if (!best) return false;

  fit = best;
  pbtm.style.setProperty("--cell", best.cell + "px");
  pbtm.style.gridTemplateColumns = "repeat(" + best.cols + ", var(--cell))";
  return true;
}

function boardCapacity() {
  return fit.cols * fit.rows; // fallback: last measured fit
}

function updateScoreUI(flash) {
  scoreVal.textContent = score;
  const total = hits + misses;
  accVal.textContent = (total === 0 ? 100 : Math.round((hits / total) * 100)) + "%";
  streakVal.textContent = streak;
  if (flash && !reducedMotion()) {
    scoreHud.classList.remove("flash-good", "flash-bad");
    void scoreHud.offsetWidth;
    scoreHud.classList.add(flash === "good" ? "flash-good" : "flash-bad");
    if (flash === "bad") setTimeout(() => scoreHud.classList.remove("flash-bad"), 320);
  }
}

function updateTimerUI() {
  if (timeHud) timeHud.classList.toggle("unlimited", unlimited());
  if (timeLabel) timeLabel.textContent = unlimited() ? "Elapsed" : "Time";
  if (unlimited()) {
    // no countdown to show — report how long you've lasted instead
    timerNum.textContent = elapsed;
    timerBar.classList.remove("low", "critical");
    return;
  }
  timerNum.textContent = timer;
  const pct = Math.max(0, (timer / roundSecs) * 100);
  timerBar.style.width = pct + "%";
  timerBar.classList.toggle("low", timer <= Math.ceil(roundSecs / 3) && timer > 10);
  timerBar.classList.toggle("critical", timer <= 10);
}

function boardValues() {
  const set = new Set();
  for (const b of pbtm.querySelectorAll(".bubble")) set.add(Number(b.dataset.val));
  return [...set];
}

/* Target is always drawn from values actually on the board,
   so static (easy) boards can never roll an unwinnable target. */
function getNewHit() {
  const pool = boardValues();
  let next;
  if (pool.length > 1) {
    let guard = 0;
    do { next = pool[Math.floor(Math.random() * pool.length)]; } while (next === hit && guard++ < 20);
  } else if (pool.length === 1) {
    next = pool[0];
  } else {
    next = randDigit();
    let guard = 0;
    while (next === hit && guard++ < 20) next = randDigit();
  }
  hit = next;
  hitVal.textContent = hit;
  if (!reducedMotion()) {
    hitVal.classList.remove("swap");
    void hitVal.offsetWidth;
    hitVal.classList.add("swap");
  }
}

/* FIX for the "-1" bubbles in your screenshot: never stamp a target
   until a real target exists (hit < 0 means idle preview). */
function ensureHitExists(count = 3) {
  if (hit < 0) return;
  const bubbles = pbtm.querySelectorAll(".bubble");
  if (!bubbles.length) return;
  let found = 0;
  for (const b of bubbles) if (Number(b.dataset.val) === hit) found++;
  if (found === 0) {
    for (let i = 0; i < Math.min(count, bubbles.length); i++) {
      const b = bubbles[Math.floor(Math.random() * bubbles.length)];
      b.dataset.val = String(hit);
      b.textContent = String(hit);
    }
  }
}

function makeBubble(spawnAnim) {
  fitBoard();
  const count = boardCapacity(); // fitted cols × rows
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const v = randDigit();
    const d = document.createElement("div");
    d.className = "bubble" + (spawnAnim && !reducedMotion() ? " spawn" : "");
    d.setAttribute("role", "gridcell");
    d.dataset.val = String(v);
    d.textContent = String(v);
    frag.appendChild(d);
  }
  pbtm.innerHTML = "";
  pbtm.appendChild(frag);
  ensureHitExists(); // no-op while idle (hit = -1), active only in-game
  requestAnimationFrame(fillLastRow); // top up any partial last row after layout
}

/* Second pass: measure the ACTUAL rendered columns (immune to any
   box-model mismatch) and append cells until the last row is full. */
function fillLastRow() {
  if (pbtm.classList.contains("drift")) return; // absolute arena: rows don't apply
  const kids = pbtm.children;
  if (kids.length < 2) return;
  const top = kids[0].offsetTop;
  let cols = 0;
  for (const k of kids) {
    if (k.offsetTop === top) cols++;
    else break;
  }
  if (cols < 1) return;
  const rem = kids.length % cols;
  if (rem === 0) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cols - rem; i++) {
    const v = randDigit();
    const d = document.createElement("div");
    d.className = "bubble";
    d.setAttribute("role", "gridcell");
    d.dataset.val = String(v);
    d.textContent = String(v);
    frag.appendChild(d);
  }
  pbtm.appendChild(frag);
}

/* Blast FX (correct hits ONLY): crack lines flash on the shell, a shockwave
   ring expands, and shards burst outward. Transform/opacity only. */
function blastAt(el) {
  try {
    if (reducedMotion()) return;
    el.classList.add("crack");
    const r = el.getBoundingClientRect();
    const wrap = pbtm.parentElement.getBoundingClientRect();
    const cx = r.left + r.width / 2 - wrap.left;
    const cy = r.top + r.height / 2 - wrap.top;
    const d = Math.max(r.width, r.height);
    const ring = document.createElement("span");
    ring.className = "shock";
    ring.style.left = (cx - d / 2) + "px";
    ring.style.top = (cy - d / 2) + "px";
    ring.style.width = d + "px";
    ring.style.height = d + "px";
    floatLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 480);
    for (let i = 0; i < 9; i++) {
      const p = document.createElement("span");
      p.className = "shard";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.background = i % 3 === 0 ? "#fff" : (i % 3 === 1 ? "var(--accent)" : "var(--bubble-text)");
      floatLayer.appendChild(p);
      const ang = (i / 9) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 30 + Math.random() * 46;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      const rot = 160 + Math.random() * 220;
      if (p.animate) {
        const a = p.animate([
          { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
          { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) rotate(" + rot + "deg)", opacity: 0 }
        ], { duration: 360 + Math.random() * 220, easing: "cubic-bezier(.17,.67,.35,1)" });
        if (a) a.onfinish = () => p.remove();
      }
      setTimeout(() => p.remove(), 750);
    }
  } catch (_) {}
}

function floatText(x, y, text, kind) {
  const s = document.createElement("span");
  s.className = "float " + kind;
  s.textContent = text;
  const wrap = pbtm.parentElement.getBoundingClientRect();
  s.style.left = Math.max(8, Math.min(x - wrap.left - 10, wrap.width - 60)) + "px";
  s.style.top = Math.max(8, y - wrap.top - 12) + "px";
  floatLayer.appendChild(s);
  setTimeout(() => s.remove(), 820);
}

/* Liquid FLIP reorder: positions glide, optionally with fresh numbers.
   transform-only + one shared transition class, so it stays at 60fps. */
function shuffleBoard(renumber) {
  const cells = [...pbtm.children];
  if (cells.length < 2) return;
  const animated = !reducedMotion();
  const first = new Map();
  if (animated) for (const c of cells) first.set(c, c.getBoundingClientRect());
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
  }
  for (const c of cells) pbtm.appendChild(c);
  if (renumber) {
    for (const c of pbtm.querySelectorAll(".bubble")) {
      const v = randDigit();
      c.dataset.val = String(v);
      c.textContent = String(v);
    }
  }
  if (!animated) return;
  pbtm.classList.add("liquid");
  for (const c of cells) {
    const f = first.get(c);
    if (!f) continue;
    const l = c.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (dx !== 0 || dy !== 0) c.style.transform = `translate(${dx}px,${dy}px)`;
  }
  void pbtm.offsetWidth; // commit start positions before gliding home
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const c of cells) c.style.transform = "";
    setTimeout(() => {
      pbtm.classList.remove("liquid");
      for (const c of cells) c.style.transform = "";
    }, 500);
  }));
}

/* Hard-mode drift engine: every bubble floats continuously inside the
   box (wall-bouncing, transform-only = 60fps). One rAF loop, torn down
   whenever hard mode is not actively playing. */
let driftRAF = null, driftCells = [], driftW = 0, driftH = 0, driftSize = 50, driftLast = 0;
let driftSolid = true; // false = overlap allowed (extreme / custom)
const driftActive = () => driftRAF !== null;

function driftBounds() {
  driftW = pbtm.clientWidth;
  driftH = pbtm.clientHeight;
  // stay at the board's scale, but small enough that the whole set can spread
  // out without permanent overlap
  const n = Math.max(1, driftCells.length || fit.cols * fit.rows);
  const room = Math.sqrt((driftW * driftH) / n) * 0.72;
  driftSize = Math.round(Math.max(30, Math.min(fit.cell, room)));
  pbtm.style.setProperty("--drift-size", driftSize + "px");
}

/* Circle-vs-circle collision: bubbles never overlap — on contact they
   separate positionally and bounce off each other (equal-mass elastic).
   O(n²) pairs is trivial for ~77 cells. */
function collideCells(withBounce) {
  const minD = driftSize;
  const minD2 = minD * minD;
  for (let i = 0; i < driftCells.length; i++) {
    const a = driftCells[i];
    for (let j = i + 1; j < driftCells.length; j++) {
      const b = driftCells[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      if (dx === 0 && dy === 0) { dx = (Math.random() - 0.5) * 0.02; dy = (Math.random() - 0.5) * 0.02; }
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD2) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, ny = dy / d;
      const ov = (minD - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov;
      b.x += nx * ov; b.y += ny * ov;
      if (withBounce) {
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const ix = vn * nx, iy = vn * ny;
          a.vx += ix; a.vy += iy;
          b.vx -= ix; b.vy -= iy;
        }
      }
    }
  }
}

function startDrift() {
  stopDrift();
  if (reducedMotion()) return;
  // freeze current grid height so switching to absolute layout never jumps
  const h = pbtm.offsetHeight;
  const minArena = window.innerWidth < 640 ? 320 : 380;
  pbtm.classList.add("drift");
  pbtm.style.height = Math.max(h, minArena) + "px";
  driftBounds();
  driftSolid = !settings().overlap;
  driftCells = [...pbtm.querySelectorAll(".bubble")].map((el) => {
    const a = Math.random() * Math.PI * 2;
    const sp = (35 + Math.random() * 55) * settings().mult; // px per second; custom speed applies
    const cell = {
      el,
      x: Math.random() * Math.max(1, driftW - driftSize),
      y: Math.random() * Math.max(1, driftH - driftSize),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp
    };
    el.style.transform = `translate(${cell.x}px,${cell.y}px)`;
    return cell;
  });
  // pre-separate: settle random spawn overlaps before the first frame
  // (solid modes only — overlap modes WANT piled-up bubbles)
  if (driftSolid) {
    for (let k = 0; k < 40; k++) collideCells(false);
    for (const c of driftCells) {
      c.x = Math.max(0, Math.min(Math.max(1, driftW - driftSize), c.x));
      c.y = Math.max(0, Math.min(Math.max(1, driftH - driftSize), c.y));
      c.el.style.transform = `translate(${c.x}px,${c.y}px)`;
    }
  }
  driftLast = performance.now();
  const loop = (t) => {
    if (!driftActive()) return;
    const dt = Math.min(0.05, (t - driftLast) / 1000);
    driftLast = t;
    if (playing && !paused) {
      const maxX = Math.max(1, driftW - driftSize), maxY = Math.max(1, driftH - driftSize);
      for (const c of driftCells) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
      // solid modes: bounce off each other, never overlap (overlap modes pile freely)
      if (driftSolid) collideCells(true);
      for (const c of driftCells) {
        if (c.x <= 0) { c.x = 0; c.vx = Math.abs(c.vx); }
        else if (c.x >= maxX) { c.x = maxX; c.vx = -Math.abs(c.vx); }
        if (c.y <= 0) { c.y = 0; c.vy = Math.abs(c.vy); }
        else if (c.y >= maxY) { c.y = maxY; c.vy = -Math.abs(c.vy); }
        c.el.style.transform = `translate(${c.x}px,${c.y}px)`;
      }
    }
    driftRAF = requestAnimationFrame(loop);
  };
  driftRAF = requestAnimationFrame(loop);
}

function stopDrift() {
  if (driftRAF !== null) cancelAnimationFrame(driftRAF);
  driftRAF = null;
  driftCells = [];
  pbtm.classList.remove("drift");
  pbtm.style.height = "";
  for (const b of pbtm.querySelectorAll(".bubble")) b.style.transform = "";
}

/* Speed burst on every correct hit — scales with the speed setting. */
function driftBurst() {
  const m = settings().mult;
  const kick = 22 * m;
  const max = 150 * m;
  for (const c of driftCells) {
    const a = Math.random() * Math.PI * 2;
    c.vx += Math.cos(a) * kick;
    c.vy += Math.sin(a) * kick;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > max) { c.vx = (c.vx / sp) * max; c.vy = (c.vy / sp) * max; }
  }
}

function correctAt(x, y, el) {
  hits++;
  streak++;
  bestStreak = Math.max(bestStreak, streak);
  score += POINTS_GOOD;
  let bonus = 0;
  if (streak % STREAK_EVERY === 0) { bonus = STREAK_BONUS; score += bonus; }
  updateScoreUI("good");
  el.classList.add("good");
  floatText(x, y, "+" + POINTS_GOOD, "good");
  if (bonus) setTimeout(() => floatText(x, y + 22, "+" + bonus + " streak", "bonus"), 130);
  sfx("scoreIncreaseSound");
  buzz(bonus ? HAPTIC.bonus : HAPTIC.hit(streak)); // tap hardens with the streak, flourish on the bonus
  const s = settings();
  if (s.numbers === "frozen") {
    // nothing changes anywhere — brief flash only
    setTimeout(() => el.classList.remove("good"), reducedMotion() ? 0 : 260);
    return;
  }
  if (s.numbers === "popped") {
    // fixed places, but the popped bubble itself gets a fresh number
    blastAt(el);
    el.classList.add("vanish");
    setTimeout(() => {
      let v = randDigit(), guard = 0;
      while (String(v) === el.dataset.val && guard++ < 20) v = randDigit();
      el.dataset.val = String(v);
      el.textContent = String(v);
      el.classList.remove("vanish", "good", "crack");
      if (!reducedMotion()) {
        el.classList.add("spawn");
        setTimeout(() => el.classList.remove("spawn"), 260);
      }
      ensureHitExists(2); // re-guarantee target after the re-roll
    }, reducedMotion() ? 0 : 130);
    return;
  }
  if (!driftActive()) {
    // static boards: every bubble's number re-rolls in place, zero movement
    blastAt(el);
    setTimeout(() => {
      el.classList.remove("good", "crack");
      for (const c of pbtm.querySelectorAll(".bubble")) {
        const v = randDigit();
        c.dataset.val = String(v);
        c.textContent = String(v);
      }
      ensureHitExists(2); // re-guarantee target after the re-roll
    }, reducedMotion() ? 0 : 120);
    return;
  }
  // hard: numbers re-roll after each correct hit; in drift mode the
  // bubbles are already floating nonstop, so just re-roll + speed burst
  if (driftActive()) {
    blastAt(el);
    el.classList.add("vanish");
    setTimeout(() => {
      el.classList.remove("vanish", "good", "crack");
      for (const c of pbtm.querySelectorAll(".bubble")) {
        const v = randDigit();
        c.dataset.val = String(v);
        c.textContent = String(v);
      }
      driftBurst();
      ensureHitExists(2); // re-guarantee target after the re-roll
    }, reducedMotion() ? 0 : 130);
    return;
  }
}

function wrongAt(x, y, el) {
  if (!playing || paused) return;
  misses++;
  streak = 0;
  const before = score;
  score = Math.max(0, score - POINTS_BAD);
  updateScoreUI("bad");
  const lost = before - score;
  if (lost > 0) floatText(x, y, "−" + lost, "bad"); // score 0 → red flash only, no fake −5
  sfx("scoreDecreaseSound");
  buzz(HAPTIC.miss); // heavier, longer than any hit — a miss should never feel like a pop
  if (el) {
    el.classList.remove("wrong");
    void el.offsetWidth;
    el.classList.add("wrong");
    setTimeout(() => el.classList.remove("wrong"), 300);
  }
}

function clearTimer() {
  if (timerId !== null) { clearInterval(timerId); timerId = null; }
}
function runTimer() {
  clearTimer();
  timerId = setInterval(() => {
    if (paused) return;
    if (unlimited()) {
      // nothing to run down, so count up — the round ends only when you end it
      elapsed++;
      updateTimerUI();
      return;
    }
    if (timer > 0) {
      timer--;
      updateTimerUI();
      if (timer === 0) endGame();
    }
  }, 1000);
}

function setOverlays({ start, pause, over }) {
  startOverlay.classList.toggle("hidden", !start);
  pauseOverlay.classList.toggle("hidden", !pause);
  gameOverOverlay.classList.toggle("hidden", !over);
  pauseBtn.classList.toggle("hidden", !(playing && !over && !start));
}

/* Fresh setup page: wipe every trace of the last round so a new game
   never shows stale score / streak / target. */
function showSetup() {
  stopAllSfx();
  playing = false; paused = false; clearTimer();
  stopDrift();
  score = 0; streak = 0; bestStreak = 0; hits = 0; misses = 0;
  hit = -1; hitVal.textContent = "–";
  timer = roundSecs;
  elapsed = 0;
  updateScoreUI();
  updateTimerUI();
  makeBubble(false);
  setOverlays({ start: true, pause: false, over: false });
}

function startGame() {
  stopAllSfx(); // never let the round-over fanfare bleed into the new round
  clearTimer();
  timer = roundSecs;
  elapsed = 0;
  score = 0; hit = -1;
  streak = 0; bestStreak = 0; hits = 0; misses = 0;
  paused = false;
  playing = true;
  updateScoreUI();
  updateTimerUI();
  makeBubble(true);
  getNewHit();
  ensureHitExists();
  if (settings().drift) startDrift();
  else stopDrift();
  setOverlays({ start: false, pause: false, over: false });
  runTimer();
}

function endGame() {
  playing = false;
  paused = false;
  clearTimer();
  stopDrift();
  timer = 0;
  updateTimerUI();
  stopSfx("scoreIncreaseSound"); // don't layer the fanfare over a last-moment pop
  stopSfx("scoreDecreaseSound");
  sfx("timerEndSound");
  buzz(HAPTIC.end); // round-over signature
  const isBest = score > best;
  if (isBest) {
    best = score;
    try { localStorage.setItem("bubble-blast-best", String(best)); } catch (_) {}
    bestVal.textContent = best;
  }
  const total = hits + misses;
  statHits.textContent = hits;
  statStreak.textContent = bestStreak;
  statAcc.textContent = (total === 0 ? 0 : Math.round((hits / total) * 100)) + "%";
  if (overMeta) overMeta.textContent = mode.toUpperCase() + " · " + roundLabel();
  newBestMsg.classList.toggle("hidden", !(isBest && score > 0));
  // simple count-up, rAF only (no lib)
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    finalScore.textContent = Math.round(score * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && playing === false && !gameOverOverlay.classList.contains("hidden")) requestAnimationFrame(step);
  };
  setOverlays({ start: false, pause: false, over: true });
  if (reducedMotion()) finalScore.textContent = score;
  else requestAnimationFrame(step);
}

function pauseGame() {
  if (!playing || paused) return;
  paused = true;
  document.querySelector("#pauseScore").textContent = score;
  pauseTime.textContent = unlimited() ? elapsed : timer;
  if (pauseTimeLabel) pauseTimeLabel.textContent = unlimited() ? "s elapsed" : "s left";
  pauseOverlay.classList.remove("hidden");
  pauseBtn.textContent = "▶";
  pauseBtn.setAttribute("aria-label", "Resume game");
}
function resumeGame() {
  if (!playing || !paused) return;
  paused = false;
  pauseOverlay.classList.add("hidden");
  pauseBtn.textContent = "⏸";
  pauseBtn.setAttribute("aria-label", "Pause game");
}

pbtm.addEventListener("click", (e) => {
  if (!playing || paused) return;
  const b = e.target && e.target.closest ? e.target.closest(".bubble") : null;
  if (!b || !pbtm.contains(b)) return;
  if (Number(b.dataset.val) === hit) {
    correctAt(e.clientX, e.clientY, b);
    getNewHit();
    ensureHitExists(2);
  } else {
    wrongAt(e.clientX, e.clientY, b);
  }
});

/* keyboard play: digits pop first matching bubble, space pauses */
document.addEventListener("keydown", (e) => {
  if (/^[0-9]$/.test(e.key) && playing && !paused &&
      startOverlay.classList.contains("hidden") && gameOverOverlay.classList.contains("hidden")) {
    const want = Number(e.key);
    if (want === hit) {
      const cell = [...pbtm.querySelectorAll(".bubble")].find((b) => Number(b.dataset.val) === hit);
      const r = (cell || pbtm).getBoundingClientRect();
      correctAt(r.left + r.width / 2, r.top + r.height / 2, cell || pbtm);
      getNewHit();
      ensureHitExists(2);
    } else {
      const r = pbtm.getBoundingClientRect();
      wrongAt(r.left + r.width / 2, r.top + 60, null);
    }
  } else if ((e.code === "Space" || e.key === "Escape") && playing && gameOverOverlay.classList.contains("hidden")) {
    e.preventDefault();
    paused ? resumeGame() : pauseGame();
  } else if (e.key === "Enter" && !startOverlay.classList.contains("hidden")) {
    startGame();
  }
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
resumeButton.addEventListener("click", resumeGame);
pauseBtn.addEventListener("click", () => (paused ? resumeGame() : pauseGame()));
quitButton.addEventListener("click", () => { pauseOverlay.classList.add("hidden"); endGame(); });
changeDurButton.addEventListener("click", showSetup);
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  if (!soundOn) stopAllSfx(); // muting kills any sound mid-playback
  soundBtn.textContent = soundOn ? "♪" : "✕";
  soundBtn.setAttribute("aria-pressed", String(soundOn));
});

function syncHapticBtn() {
  hapticBtn.textContent = hapticOn ? "≈" : "✕";
  hapticBtn.setAttribute("aria-pressed", String(hapticOn));
  hapticBtn.title = hapticOn ? "Vibration on" : "Vibration off";
}
hapticBtn.addEventListener("click", () => {
  hapticOn = !hapticOn;
  try { localStorage.setItem("bubble-blast-haptics", hapticOn ? "on" : "off"); } catch (_) {}
  syncHapticBtn();
  if (hapticOn) buzz(HAPTIC.hit(1)); // feel it the instant it's switched on
});

let resizeT = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (driftActive()) { driftBounds(); return; }
    if (!playing) makeBubble(false);
    else fitBoard(); // mid-round: resize the cells in place, keep the numbers
  }, 250);
}, { passive: true });

/* boot: fresh setup page, zero stale state */
showSetup();
setTheme(currentTheme(), false);
syncHapticBtn();
