// 하늘 계단 (Sky Stairs) — 우성오락실
// 좌우로 꺾이는 계단을 끝없이 오른다. 버튼 둘: 오르기 / 방향 전환. 시간 막대가 다 닳거나 헛디디면 끝.
// YouTube Playables 요건: SDK 먼저, firstFrameReady/gameReady, onPause/onResume 로만 정지,
// 유튜브 음소거 따름, saveData/loadData, 모든 화면비, 터치·마우스·키보드.
"use strict";

// ───────────── 유튜브 SDK (밖에서는 localStorage) ─────────────
const YT = (typeof ytgame !== "undefined") ? ytgame : null;
const IN_YT = !!(YT && YT.IN_PLAYABLES_ENV);
const SAVE_KEY = "woosung-sky-stairs-v1";
const sdk = {
  firstFrameReady() { try { YT && YT.game.firstFrameReady(); } catch (e) {} },
  gameReady() { try { YT && YT.game.gameReady(); } catch (e) {} },
  async load() {
    if (IN_YT) { try { return await YT.game.loadData(); } catch (e) { return ""; } }
    try { return localStorage.getItem(SAVE_KEY) || ""; } catch (e) { return ""; }
  },
  async save(str) {
    if (IN_YT) { try { await YT.game.saveData(str); } catch (e) {} return; }
    try { localStorage.setItem(SAVE_KEY, str); } catch (e) {}
  },
  score(v) { if (IN_YT) { try { YT.engagement.sendScore({ value: Math.floor(v) }); } catch (e) {} } },
  audioOn() { if (IN_YT) { try { return YT.system.isAudioEnabled(); } catch (e) {} } return true; },
  async lang() { if (IN_YT) { try { return await YT.system.getLanguage(); } catch (e) {} } return navigator.language || "ko"; },
  interstitial() { if (IN_YT) { try { return YT.ads.requestInterstitialAd(); } catch (e) {} } return Promise.resolve(); },
};

const TEXT = {
  ko: { title: "하늘 계단", start: "눌러서 시작", turn: "방향 전환", climb: "오르기", best: "최고", over: "떨어졌어요!",
        again: "다시 오르기", steps: "계단", how: "꺾이는 곳에서 방향 전환!", zones: ["하늘", "노을", "밤하늘", "우주"] },
  en: { title: "Sky Stairs", start: "Tap to start", turn: "TURN", climb: "CLIMB", best: "BEST", over: "You fell!",
        again: "Climb again", steps: "STEPS", how: "Turn where the stairs bend!", zones: ["Sky", "Sunset", "Night", "Space"] },
};
let T = TEXT.ko;

// ───────────── 세계 ─────────────
const LS = 40 / 15;                 // 저해상도 픽셀 / 세계 단위 (서 있는 캐릭터 40px = 15 단위)
const SW = 36 / LS, SH = 19 / LS;   // 계단 한 칸 = 계단 그림(36×19px) 크기
const CHAR_H = 15;                  // 캐릭터 키
const C = { pink: "#ff40a0", cyan: "#3ce6ff", yellow: "#ffd640", night: "#0e0a22", white: "#fff" };

// 높이별 하늘 (계단 수 기준) — 낮 → 노을 → 밤 → 우주
const ZONES = [
  { at: 0,   top: [120, 200, 255], bot: [200, 235, 255], stair: ["#ffcf8a", "#d9894a"], edge: "#fff3dc" },
  { at: 120, top: [255, 120, 150], bot: [255, 200, 120], stair: ["#ff9aa8", "#c2506a"], edge: "#ffe0e6" },
  { at: 300, top: [20, 24, 70],    bot: [70, 40, 120],   stair: ["#3a3f8a", "#1f2260"], edge: C.cyan },
  { at: 550, top: [8, 4, 20],      bot: [40, 10, 60],    stair: ["#2a1240", "#16081f"], edge: C.pink },
];
function zoneAt(n) { let z = 0; for (let i = 0; i < ZONES.length; i++) if (n >= ZONES[i].at) z = i; return z; }
function lerp(a, b, k) { return a + (b - a) * k; }
function mixRGB(a, b, k) { return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(",")})`; }

// ───────────── 상태 ─────────────
const st = {
  mode: "title", ready: false, paused: false,
  stairs: [], idx: 0, facing: 1, time: 1, steps: 0, best: 0, plays: 0,
  anim: 0, fromX: 0, fromY: 0, fall: null, cam: { x: 0, y: 0 }, t: 0,
  banner: null, bannerT: 0, pops: [], pressFx: { turn: 0, climb: 0 }, coins: 0,
};

function genStairs(n) {
  const s = st.stairs;
  while (s.length < n) {
    const prev = s[s.length - 1];
    let dir = prev.dir;
    const k = s.length;
    if (k > 3) {                                             // 처음 몇 칸은 곧게
      const turnP = Math.min(0.42, 0.22 + k * 0.0006);
      if (Math.random() < turnP) dir = -dir;
    }
    s.push({ col: prev.col + dir, dir, coin: k > 6 && Math.random() < 0.12 });
  }
}

function newRun() {
  st.stairs = [{ col: 0, dir: 1, coin: false }]; genStairs(40); st.coins = 0;
  st.idx = 0; st.facing = 1; st.time = 1; st.steps = 0; st.anim = 0; st.fall = null; st.pops = [];
  st.cam.x = 0; st.cam.y = 0;
}

function stepPos(i) { const s = st.stairs[i]; return { x: s.col * SW, y: -i * SH }; }

// ───────────── 저장 ─────────────
function save() { if (st.ready) sdk.save(JSON.stringify({ v: 1, best: st.best, plays: st.plays })); }
async function loadSave() {
  const raw = await sdk.load(); if (!raw) return;
  try { const d = JSON.parse(raw); st.best = d.best || 0; st.plays = d.plays || 0; } catch (e) {}
}

// ───────────── 소리 ─────────────
let actx = null, master = null, audioEnabled = true;
function ensureAudio() {
  if (actx) { if (actx.state === "suspended" && audioEnabled && !st.paused) actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = audioEnabled ? 0.3 : 0; master.connect(actx.destination);
  } catch (e) { actx = null; }
}
function setAudio(on) { audioEnabled = on; if (master) master.gain.value = on ? 0.3 : 0; }
function tone(f, dur, type = "square", vol = 0.25, slide = 0) {
  if (!actx || !audioEnabled || st.paused) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  step() { tone(520 + (st.steps % 8) * 40, 0.05, "square", 0.12); },
  turn() { tone(380, 0.05, "triangle", 0.18); tone(620, 0.05, "square", 0.08); },
  fall() { tone(600, 0.7, "sawtooth", 0.25, 0.15); },
  coin() { tone(988, 0.05, "square", 0.15); setTimeout(() => tone(1319, 0.12, "square", 0.15), 50); },
  mile() { [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.1, "square", 0.18), i * 80)); },
};

// ───────────── 조작 ─────────────
function act(turn) {
  ensureAudio();
  if (!st.ready) return;
  if (st.mode === "title") { st.mode = "play"; newRun(); }
  if (st.mode !== "play" || st.fall) return;
  st.pressFx[turn ? "turn" : "climb"] = 1;
  if (turn) st.facing = -st.facing;
  const next = st.stairs[st.idx + 1];
  const here = stepPos(st.idx);
  if (next.col - st.stairs[st.idx].col === st.facing) {         // 맞는 방향 → 한 칸 위로
    st.fromX = here.x; st.fromY = here.y; st.idx++; st.steps++; st.anim = 1;
    st.time = Math.min(1, st.time + 0.07);
    const got = st.stairs[st.idx];
    if (got.coin) { got.coin = false; st.coins++; st.time = Math.min(1, st.time + 0.08); sfx.coin(); st.pops.push({ i: st.idx, life: 1 }); }
    genStairs(st.idx + 40);
    turn ? sfx.turn() : sfx.step();
    if (st.steps % 100 === 0) { banner(`${st.steps} ${T.steps}!`, C.yellow); sfx.mile(); }
    const z = zoneAt(st.steps);
    if (z > 0 && ZONES[z].at === st.steps) banner(T.zones[z], C.cyan);
  } else {                                                   // 헛디딤
    startFall(here.x + st.facing * SW * 0.6, here.y);
  }
}

function startFall(x, y) {
  st.fall = { x, y, vy: -30, vx: st.facing * 12, rot: 0, t: 0 };
  sfx.fall();
}

function gameOver() {
  st.mode = "over"; st.plays++;
  if (st.steps > st.best) st.best = st.steps;
  sdk.score(st.best); save();
  if (window.WSA_LB) window.WSA_LB.submit(st.steps);          // 웹판 명예의 전당 (있을 때만)
}

async function restart() {
  if (st.plays > 0 && st.plays % 4 === 0) {                 // 네 판마다 전면 광고 (유튜브 안에서만)
    st.paused = true; try { await sdk.interstitial(); } catch (e) {} st.paused = false; startLoop();
  }
  st.mode = "play"; newRun();
}

function banner(text, col) { st.banner = { text, col }; st.bannerT = 1.6; }

// ───────────── 갱신 ─────────────
function update(dt) {
  st.t += dt;
  if (st.bannerT > 0) st.bannerT -= dt;
  for (const k of ["turn", "climb"]) st.pressFx[k] = Math.max(0, st.pressFx[k] - dt * 6);
  if (st.anim > 0) st.anim = Math.max(0, st.anim - dt * 12);
  for (const p of st.pops) p.life -= dt * 2; st.pops = st.pops.filter(p => p.life > 0);
  if (st.mode === "play" && !st.fall) {
    const drain = 0.16 + Math.min(0.55, st.steps * 0.0012);  // 높이 오를수록 빨리 닳는다
    st.time -= drain * dt;
    if (st.time <= 0) { const p = stepPos(st.idx); startFall(p.x, p.y); }
  }
  if (st.fall) {
    const f = st.fall; f.t += dt; f.vy += 160 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 6 * st.facing;
    if (f.t > 1.1 && st.mode === "play") gameOver();
  }
  // 카메라: 캐릭터를 화면 아래쪽 2/3 지점에
  const p = charPos();
  const tx = p.x, ty = st.fall ? st.cam.y : p.y;
  st.cam.x += (tx - st.cam.x) * Math.min(1, dt * 8);
  st.cam.y += (ty - st.cam.y) * Math.min(1, dt * 8);
}

function charPos() {
  if (st.fall) return { x: st.fall.x, y: st.fall.y };
  const p = stepPos(st.idx);
  if (st.anim > 0) { const k = 1 - st.anim; return { x: lerp(st.fromX, p.x, k), y: lerp(st.fromY, p.y, k) - Math.sin(k * Math.PI) * 3 }; }
  return p;
}

// ───────────── 화면 (저해상도에 그린 뒤 정수 배율로 키운다 = 또렷한 픽셀) ─────────────
const cv = document.getElementById("c");
const cx = cv.getContext("2d");
const low = document.createElement("canvas");
const lx = low.getContext("2d");
const view = { w: 0, h: 0, dpr: 1, k: 1, lw: 0, lh: 0 };
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  view.dpr = dpr; view.w = w; view.h = h;
  // 세로 화면에서 가로로 세계 100단위(=267px)가 보이도록 정수 배율 k 를 고른다
  view.k = Math.max(1, Math.round(Math.min(cv.width / 267, cv.height / 400)));
  view.lw = Math.ceil(cv.width / view.k); view.lh = Math.ceil(cv.height / view.k);
  low.width = view.lw; low.height = view.lh;
}
window.addEventListener("resize", layout);
const R = Math.round;
function wx(x) { return R(view.lw / 2 + (x - st.cam.x) * LS); }
function wy(y) { return R(view.lh * 0.6 + (y - st.cam.y) * LS); }

// 픽셀 그림 (Codex 생성)
function img(n) { const im = new Image(); im.src = `img/${n}.png`; return im; }
const CHAR = [img("char0"), img("char1"), img("char2")];
const TILE = [img("tile0"), img("tile1"), img("tile2"), img("tile3")];
const COIN = img("coin");
function imgOk(im) { return im.complete && im.naturalWidth > 0; }

// 픽셀 글꼴 (갈무리, OFL)
const PIX_FONT = '"Galmuri11", "Apple SD Gothic Neo", "Noto Sans KR", monospace';
try {
  const ff = new FontFace("Galmuri11", "url(fonts/Galmuri11-Bold.woff2)");
  ff.load().then(f => document.fonts.add(f)).catch(() => {});
} catch (e) {}

function text(str, x, y, size, color, align = "center", shadow = true) {
  cx.save();
  cx.font = `${Math.round(size)}px ${PIX_FONT}`;
  cx.textAlign = align; cx.textBaseline = "middle";
  if (shadow) { cx.fillStyle = "#1a1030"; const o = Math.max(2, Math.round(size / 11)); cx.fillText(str, x + o, y + o); }
  cx.fillStyle = color; cx.fillText(str, x, y); cx.restore();
}

const CLOUDS = Array.from({ length: 12 }, () => ({ x: Math.random() * 300 - 150, y: -Math.random() * 1500, w: 3 + Math.floor(Math.random() * 3) }));
const STARS = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), b: Math.random() }));

function skyColors() {
  const n = st.steps, z = zoneAt(n), Z = ZONES[z], N = ZONES[z + 1];
  const k = N ? Math.min(1, Math.max(0, (n - Z.at) / (N.at - Z.at) - 0.6) / 0.4) : 0;
  const mix = (a, b) => a.map((v, i) => lerp(v, b[i], k));
  return { top: N ? mix(Z.top, N.top) : Z.top, bot: N ? mix(Z.bot, N.bot) : Z.bot };
}

function drawSky() {
  const { top, bot } = skyColors(), W = view.lw, H = view.lh, bands = 10;
  for (let i = 0; i < bands; i++) {                           // 계단식 띠 하늘 (레트로)
    const k = i / (bands - 1);
    lx.fillStyle = `rgb(${top.map((v, j) => R(lerp(v, bot[j], k))).join(",")})`;
    lx.fillRect(0, R(H * i / bands), W, R(H / bands) + 1);
  }
  const n = st.steps;
  const nightK = Math.min(1, Math.max(0, (n - 220) / 80));
  if (nightK > 0) {
    for (const s of STARS) {
      if (s.b > nightK) continue;
      const on = Math.sin(st.t * 3 + s.x * 50) > -0.3;
      lx.fillStyle = on ? "#ffffff" : "#9aa0ff";
      lx.fillRect(R(s.x * W), R(s.y * H), 1, 1);
    }
  }
  const dayK = 1 - Math.min(1, Math.max(0, (n - 200) / 80));
  if (dayK > 0.05) {                                         // 픽셀 구름
    lx.fillStyle = "#ffffff";
    for (const c of CLOUDS) {
      const X = R(W / 2 + (c.x - st.cam.x * 0.3) * LS * 0.5), Y = R(H * 0.5 + (((c.y - st.cam.y * 0.3) % 1500 + 1500) % 1500 - 750) * LS * 0.35);
      const u = c.w * 2;
      lx.fillRect(X, Y, u * 4, u); lx.fillRect(X + u, Y - u, u * 2, u); lx.fillRect(X - u, Y + u, u * 6, u);
    }
  }
}

function drawStairs() {
  const from = Math.max(0, st.idx - 16), to = Math.min(st.stairs.length - 1, st.idx + 26);
  for (let i = to; i >= from; i--) {
    const p = stepPos(i), X = wx(p.x), Y = wy(p.y), t = TILE[zoneAt(i)];
    if (imgOk(t)) lx.drawImage(t, X - (t.naturalWidth >> 1), Y);
    else { lx.fillStyle = ZONES[zoneAt(i)].stair[0]; lx.fillRect(X - 18, Y, 36, 19); }
    if (i === st.idx + 1 && st.mode === "play" && !st.fall && Math.floor(st.t * 6) % 2 === 0) {
      lx.fillStyle = "#ffffff"; lx.fillRect(X - 17, Y - 1, 34, 1);          // 다음 칸 깜빡 표시
    }
    if (st.stairs[i].coin && imgOk(COIN)) {
      const bob = R(Math.sin(st.t * 4 + i) * 2);
      lx.drawImage(COIN, X - (COIN.naturalWidth >> 1), Y - COIN.naturalHeight - 4 + bob);
    }
  }
  for (const p of st.pops) {                                  // 동전 먹은 자리 +1
    const q = stepPos(p.i), X = wx(q.x), Y = wy(q.y) - 30 - R((1 - p.life) * 16);
    lx.globalAlpha = p.life; lx.fillStyle = "#ffd640";
    lx.fillRect(X - 1, Y - 3, 2, 6); lx.fillRect(X - 3, Y - 1, 6, 2); lx.globalAlpha = 1;
  }
}

function drawChar() {
  const p = charPos(), X = wx(p.x), Y = wy(p.y) + 4;           // 발이 계단 윗면에 닿게
  const pose = st.fall ? 2 : st.anim > 0 ? 1 : 0, im = CHAR[pose];
  lx.save(); lx.translate(X, Y);
  if (st.fall) lx.rotate(Math.round(st.fall.rot * 0.3 / (Math.PI / 4)) * (Math.PI / 4));   // 45° 단위로만 회전 (픽셀 느낌)
  lx.scale(st.facing, 1);
  if (imgOk(im)) {
    const bob = pose === 0 && Math.floor(st.t * 3) % 2 ? -1 : 0;
    lx.drawImage(im, -(im.naturalWidth >> 1), -im.naturalHeight + bob);
  } else { lx.fillStyle = "#ff40a0"; lx.fillRect(-8, -36, 16, 36); }
  lx.restore();
}

function pixelBox(x, y, w, h, fill, edge, press) {           // 픽셀 버튼: 각진 모서리 + 두 겹 테두리
  const o = Math.round(press * 4);
  cx.fillStyle = "#1a1030"; cx.fillRect(x, y + 6, w, h);                    // 그림자
  cx.fillStyle = edge; cx.fillRect(x, y + o, w, h);
  cx.fillStyle = fill; cx.fillRect(x + 4, y + o + 4, w - 8, h - 8);
  cx.fillStyle = "rgba(255,255,255,.35)"; cx.fillRect(x + 8, y + o + 8, w - 16, 4);
  return o;
}

function drawHud() {
  const w = view.w, h = view.h, u = Math.min(w, h * 0.62) / 100;
  const big = Math.max(22, Math.round(11 * u / 11) * 11);       // 갈무리11 은 11의 배수 크기가 가장 또렷
  text(String(st.steps), w / 2, h * 0.08, big * 1.4, "#ffffff");
  text(`${T.best} ${Math.max(st.best, st.steps)}`, w / 2, h * 0.08 + big * 1.0, Math.round(big * 0.5), "#ffd640");
  if (st.coins) text(`● ${st.coins}`, w - 12, h * 0.08, Math.round(big * 0.55), "#ffd640", "right");
  if (st.mode === "play") {                                   // 시간 막대 (칸 단위로 끊어서)
    const cells = 20, bw = Math.min(w * 0.72, 300), cw = bw / cells, bx = (w - bw) / 2, by = h * 0.08 + big * 1.6;
    const on = Math.ceil(Math.max(0, st.time) * cells);
    for (let i = 0; i < cells; i++) {
      cx.fillStyle = i < on ? (st.time < 0.3 ? "#ff4d6d" : st.time < 0.6 ? "#ffd640" : "#5cff8a") : "rgba(26,16,48,.5)";
      cx.fillRect(R(bx + i * cw + 1), R(by), R(cw - 2), 10);
    }
  }
  const bh = Math.round(Math.min(h * 0.12, 90)), pad = 14, y = h - bh - pad - 8, bw = (w - pad * 3) / 2;
  const o1 = pixelBox(pad, y, bw, bh, "#3ce6ff", "#1a6f8a", st.pressFx.turn);
  text(T.turn, pad + bw / 2, y + o1 + bh / 2, Math.round(bh * 0.3), "#1a1030", "center", false);
  const o2 = pixelBox(pad * 2 + bw, y, bw, bh, "#ff40a0", "#8a1a55", st.pressFx.climb);
  text(T.climb, pad * 2 + bw * 1.5, y + o2 + bh / 2, Math.round(bh * 0.3), "#ffffff", "center", false);
  if (st.banner && st.bannerT > 0 && Math.floor(st.bannerT * 8) % 2 === 0) text(st.banner.text, w / 2, h * 0.3, big, st.banner.col);
}

function drawOverlay() {
  const w = view.w, h = view.h, u = Math.min(w, h * 0.62) / 100;
  const big = Math.max(22, Math.round(11 * u / 11) * 11);
  if (st.mode === "title") {
    cx.fillStyle = "rgba(14,10,34,.35)"; cx.fillRect(0, 0, w, h);
    text(T.title, w / 2, h * 0.27, big * 1.6, "#ffffff");
    text("WOOSUNG ARCADE", w / 2, h * 0.27 + big * 1.3, Math.round(big * 0.45), "#ffd640");
    if (st.ready && Math.floor(st.t * 2) % 2 === 0) text(T.start, w / 2, h * 0.45, Math.round(big * 0.7), "#ffffff");
    text(T.how, w / 2, h * 0.52, Math.round(big * 0.5), "#ffffff");
  }
  if (st.mode === "over") {
    cx.fillStyle = "rgba(14,10,34,.72)"; cx.fillRect(0, 0, w, h);
    text(T.over, w / 2, h * 0.28, big * 1.2, "#ff40a0");
    text(`${st.steps} ${T.steps}`, w / 2, h * 0.28 + big * 1.6, big, "#ffffff");
    text(`${T.best} ${st.best}`, w / 2, h * 0.28 + big * 2.6, Math.round(big * 0.55), "#ffd640");
    const bw = Math.min(w * 0.6, 260), bh = Math.round(big * 1.6), x = (w - bw) / 2, y = h * 0.28 + big * 3.4;
    againBtn = { x, y, w: bw, h: bh };
    pixelBox(x, y, bw, bh, "#ff40a0", "#8a1a55", 0);
    text(T.again, w / 2, y + bh / 2, Math.round(big * 0.6), "#ffffff", "center", false);
  }
}

function draw() {
  lx.imageSmoothingEnabled = false;
  drawSky(); drawStairs(); drawChar();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(low, 0, 0, view.lw * view.k, view.lh * view.k);
  cx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawHud(); drawOverlay();
}

// ───────────── 입력 ─────────────
let againBtn = null;
cv.addEventListener("pointerdown", e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (st.mode === "over") {
    ensureAudio();
    if (againBtn && x >= againBtn.x && x <= againBtn.x + againBtn.w && y >= againBtn.y && y <= againBtn.y + againBtn.h) restart();
    return;
  }
  act(x < view.w / 2);                                       // 왼쪽 절반 = 방향 전환, 오른쪽 절반 = 오르기
});
window.addEventListener("keydown", e => {
  if (e.repeat) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;   // 이름 입력 중엔 게임 조작 안 함
  const k = e.key;
  if (st.mode === "over" && (k === "Enter" || k === " ")) { restart(); e.preventDefault(); return; }
  if (k === "ArrowLeft" || k === "a" || k === "z") act(true);
  else if (k === "ArrowRight" || k === "d" || k === "x" || k === " " || k === "ArrowUp") { act(false); e.preventDefault(); }
});

// ───────────── 루프 ─────────────
let last = 0, rafId = 0, firstFrame = false;
function frame(now) {
  rafId = 0;
  if (st.paused) return;
  // 화면 배율(dpr)이나 크기가 바뀌면 다시 맞춘다 — resize 이벤트가 안 오는 기기 대비
  { const d = Math.min(window.devicePixelRatio || 1, 2.5); if (Math.abs(cv.width - Math.round((cv.clientWidth || innerWidth) * d)) > 2) layout(); }
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  update(dt); draw();
  if (!firstFrame) { firstFrame = true; sdk.firstFrameReady(); }
  rafId = requestAnimationFrame(frame);
}
function startLoop() { if (!rafId) { last = 0; rafId = requestAnimationFrame(frame); } }

(async function boot() {
  layout(); newRun(); startLoop();
  const lang = (await sdk.lang() || "").toLowerCase();
  T = lang.startsWith("ko") ? TEXT.ko : TEXT.en;
  document.title = T.title;
  audioEnabled = sdk.audioOn();
  await loadSave();
  st.ready = true;
  sdk.gameReady();
  if (IN_YT) {
    YT.system.onPause(() => { st.paused = true; if (actx) actx.suspend(); save(); });
    YT.system.onResume(() => { st.paused = false; if (actx && audioEnabled) actx.resume(); startLoop(); });
    YT.system.onAudioEnabledChange(on => setAudio(on));
  }
})();
