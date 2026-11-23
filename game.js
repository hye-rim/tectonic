'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 지각 변동: 화면·입력·소리. 규칙과 컴퓨터는 logic.js (LOGIC_TS)
(() => {
const L = LOGIC_TS;
const $ = (id) => document.getElementById(id);
const TUT = /[?&]tutorial=1/.test(location.search);
const REC_KEY = 'tectonicRec', WINS_KEY = 'tectonicWins', MUTE_KEY = 'tectonicMuted';
const LEVELS = [{ id: 'easy', name: '쉬움', desc: '아무렇게나 움직여요' }, { id: 'normal', name: '보통', desc: '길과 영역을 계산해요' }, { id: 'hard', name: '어려움', desc: '상대의 대응까지 내다봐요' }];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let rec = (() => { try { const o = JSON.parse(store.get(REC_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } })();
let muted = store.get(MUTE_KEY) === '1';
const saveRec = () => { store.set(REC_KEY, JSON.stringify(rec)); store.set(WINS_KEY, String(Object.values(rec).reduce((a, r) => a + (r.w || 0), 0))); };

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.08, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  place: () => tone(420, 0.06, 'triangle', 0.07), select: () => tone(600, 0.04, 'triangle', 0.06), move: () => tone(300, 0.1, 'triangle', 0.07, 200),
  crack: () => tone(140, 0.14, 'sawtooth', 0.06, -50), lost: () => seq([300, 220, 160], 90, 'sawtooth', 0.07), win: () => seq([523, 659, 784, 1047, 1319], 100, 'triangle', 0.1), over: () => seq([392, 330, 262, 196], 140, 'sawtooth', 0.06),
};

// ---------- 상태 ----------
let st = null, level = 'normal', mode = 'title', selected = null, pending = null, busy = false, timers = [], flashes = [], lastMove = null, clock = 0;
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const cvs = $('board'), ctx = cvs.getContext('2d');
let W = 600, H = 380, SZ = 24, OX = 10, OY = 10;

function startGame(lv) {
  clearTimers(); level = lv; mode = 'play'; selected = null; pending = null; busy = false; flashes = []; lastMove = null;
  st = L.newGame({ seed: TUT ? 6 : (Date.now() % 99991) + 1, level: TUT ? 'easy' : lv, first: TUT ? 'you' : (Math.random() < 0.5 ? 'you' : 'cpu'), pieces: TUT ? 2 : L.PIECES });
  $('overlay').classList.add('hidden'); layout(); render(); next();
}

// ---------- 그리기 ----------
function layout() {
  const r = $('boardBox').getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(280, Math.floor(r.width - 8)); H = Math.max(180, Math.floor(r.height - 8));
  cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  SZ = Math.min(W / ((L.C + 0.5) * Math.sqrt(3)), H / (L.R * 1.5 + 0.5)); OX = (W - (L.C + 0.5) * Math.sqrt(3) * SZ) / 2 + Math.sqrt(3) * SZ / 2; OY = (H - (L.R * 1.5 + 0.5) * SZ) / 2 + SZ;
}
addEventListener('resize', () => { layout(); });
function centerOf(id) { const r = Math.floor(id / L.C), c = id % L.C; return [OX + (c + (r & 1) * 0.5) * Math.sqrt(3) * SZ, OY + r * 1.5 * SZ]; }
function hexPath(x, y, s) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); const px = x + s * Math.cos(a), py = y + s * Math.sin(a); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); }
function draw() {
  clock += 1 / 60; ctx.clearRect(0, 0, W, H);
  if (!st) return;
  const occ = L.occupied(st), dests = new Set(selected !== null && !pending ? L.destinations(st, selected) : []), places = new Set(st.phase === 'place' && st.turn === 'you' && !busy ? L.placeOptions(st) : []);
  const extra = pending ? new Set(L.extraOptions(st, pending.to).filter((x) => x !== pending.from)) : new Set();
  for (let id = 0; id < L.N; id++) {
    if (!st.alive.has(id)) continue;
    const [x, y] = centerOf(id), r = Math.floor(id / L.C), c = id % L.C;
    hexPath(x, y, SZ * 0.97); ctx.fillStyle = (r + c) % 2 ? '#d9b980' : '#e6c98f'; ctx.fill(); ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 1.5; ctx.stroke();
    if (dests.has(id)) { hexPath(x, y, SZ * 0.97); ctx.fillStyle = 'rgba(63,191,90,.45)'; ctx.fill(); }
    if (places.has(id)) { ctx.beginPath(); ctx.arc(x, y, SZ * 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(63,191,90,.9)'; ctx.fill(); }
    if (extra.has(id)) { hexPath(x, y, SZ * 0.97); ctx.fillStyle = `rgba(230,57,70,${0.3 + 0.2 * Math.sin(clock * 8)})`; ctx.fill(); }
  }
  // 방금 둔 수 표시
  if (lastMove && lastMove.t > 0) { const [x1, y1] = centerOf(lastMove.from), [x2, y2] = centerOf(lastMove.to); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); }
  // 사라지는 타일 효과
  flashes = flashes.filter((f) => f.t > 0); for (const f of flashes) { const [x, y] = centerOf(f.tile); hexPath(x, y, SZ * 0.97 * (0.6 + 0.4 * f.t)); ctx.fillStyle = `rgba(230,57,70,${f.t * 0.7})`; ctx.fill(); f.t -= 1 / 30; }
  // 말
  for (const side of ['you', 'cpu']) for (const p of st.pieces[side]) {
    let at = p, [x, y] = centerOf(at);
    if (pending && side === 'you' && p === pending.from) [x, y] = centerOf(pending.to);
    ctx.beginPath(); ctx.arc(x, y + 2, SZ * 0.55, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, SZ * 0.55, 0, Math.PI * 2); ctx.fillStyle = side === 'you' ? '#2f7bff' : '#e5484d'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = selected === p ? '#ffd23f' : '#2b1d52'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x - SZ * 0.15, y - SZ * 0.15, SZ * 0.15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  }
  if (lastMove && lastMove.t > 0) lastMove.t -= 1 / 60;
}
function loop() { draw(); requestAnimationFrame(loop); }
function render() {
  if (!st) return;
  $('tilesN').textContent = st.alive.size; $('myN').textContent = st.pieces.you.length; $('cpuN').textContent = st.pieces.cpu.length;
  $('cancelBtn').disabled = !(selected !== null || pending);
}
function setMsg(t) { $('msg').textContent = t; }

// ---------- 흐름 ----------
function next() {
  if (!st || st.over) return;
  if (st.turn === 'cpu') { busy = true; setMsg('컴퓨터가 생각하는 중...'); render(); later(cpuTurn, 600); return; }
  busy = false; render();
  if (st.phase === 'place') setMsg(`내 말을 놓아요 (${st.placed.you}/${st.total}) — 초록 점이 있는 가장자리 타일을 눌러요`);
  else setMsg(L.needsExtra(st, 'you') ? '말을 눌러 고르고 도착할 칸을 누른 뒤, 없앨 타일을 하나 더 골라요' : '말을 눌러 고르고, 초록으로 표시된 도착 칸을 눌러요');
}
function cpuTurn() {
  if (!st || st.over) return;
  if (st.phase === 'place') { const t = L.choosePlace(st, 'cpu'); L.place(st, 'cpu', t); sfx.place(); busy = false; render(); return after(); }
  const m = L.chooseMove(st, 'cpu'); if (!m) return;
  const r = L.move(st, 'cpu', m.from, m.to, m.extra); if (!r.ok) return;
  lastMove = { from: m.from, to: m.to, t: 1.4 }; sfx.move(); handleEvents(); busy = false; render(); after();
}
function handleEvents() {
  for (const e of st.events) { if (e.t === 'remove') { flashes.push({ tile: e.tile, t: 1 }); sfx.crack(); } if (e.t === 'lost') sfx.lost(); }
}
function after() {
  if (st.over) return finish();
  if (st.phase === 'move' && st.turn === 'you' && st.events.some((e) => e.t === 'lost')) setMsg('말을 잃었어요!');
  later(next, 450);
}

// ---------- 입력 ----------
function tileAt(px, py) {
  let best = -1, bd = SZ * 0.95;
  for (let id = 0; id < L.N; id++) { const [x, y] = centerOf(id), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = id; } }
  return best;
}
cvs.addEventListener('click', (e) => {
  if (!st || st.over || busy || st.turn !== 'you' || mode !== 'play') return;
  const rect = cvs.getBoundingClientRect(), px = (e.clientX - rect.left) * (W / rect.width), py = (e.clientY - rect.top) * (H / rect.height), id = tileAt(px, py);
  if (id < 0 || !st.alive.has(id)) { if (!pending) { selected = null; render(); } return; }
  if (st.phase === 'place') { if (L.place(st, 'you', id).ok) { sfx.place(); tutorialSignal('place'); render(); after(); } return; }
  // 말 움직이기
  if (pending) {                                                                          // 없앨 타일 고르기
    const ok = L.extraOptions(st, pending.to).filter((x) => x !== pending.from);
    if (ok.includes(id)) { const { from, to } = pending; pending = null; selected = null; const r = L.move(st, 'you', from, to, id); if (r.ok) { lastMove = { from, to, t: 1.2 }; sfx.move(); handleEvents(); tutorialSignal('move'); tutorialSignal('remove'); render(); after(); } }
    return;
  }
  if (st.pieces.you.includes(id)) { selected = selected === id ? null : id; sfx.select(); if (selected !== null) tutorialSignal('select'); render(); return; }
  if (selected !== null && L.destinations(st, selected).includes(id)) {
    if (L.needsExtra(st, 'you') && L.extraOptions(st, id).filter((x) => x !== selected).length) { pending = { from: selected, to: id }; setMsg('없앨 타일을 하나 골라요 (붉게 표시된 타일)'); tutorialSignal('move'); render(); return; }
    const from = selected; selected = null; const r = L.move(st, 'you', from, id); if (r.ok) { lastMove = { from, to: id, t: 1.2 }; sfx.move(); handleEvents(); tutorialSignal('move'); render(); after(); }
  }
});
$('cancelBtn').onclick = () => { selected = null; pending = null; render(); next(); };
addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 'm') toggleMute(); else if (k === 'escape') $('cancelBtn').click(); });
function toggleMute() { muted = !muted; store.set(MUTE_KEY, muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 끝 / 처음 화면 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function finish() {
  busy = true; mode = 'over'; render(); const won = st.winner === 'you', r = rec[level] || (rec[level] = { w: 0, l: 0 });
  if (!TUT) { if (won) r.w++; else r.l++; saveRec(); }
  (won ? sfx.win : sfx.over)(); tutorialSignal('over');
  const why = st.events.find((e) => e.t === 'over' && e.why === 'stuck') ? '움직일 수 있는 말이 없어서' : '말을 모두 잃어서';
  setMsg(won ? '이겼어요!' : '졌어요…');
  later(() => {
    showOverlay(`<h2>${won ? '이겼어요! 🎉' : '졌어요…'}</h2><p>${won ? '컴퓨터가' : '내가'} ${why} 끝났어요.</p><dl class="stats"><dt>남은 말</dt><dd>내 말 ${st.pieces.you.length}개 · 컴퓨터 ${st.pieces.cpu.length}개</dd><dt>남은 타일</dt><dd>${st.alive.size}개</dd>${!TUT ? `<dt>${LEVELS.find((l) => l.id === level).name} 전적</dt><dd>${r.w}승 ${r.l}패</dd>` : ''}</dl><div class="col"><button id="b1">${TUT ? '확인' : '한 판 더'}</button>${TUT ? '' : '<button class="sub" id="b2">난이도 고르기</button>'}</div>`);
    $('b1').onclick = () => (TUT ? showTitle() : startGame(level)); if ($('b2')) $('b2').onclick = showTitle;
  }, 900);
}
function showTitle() {
  clearTimers(); mode = 'title'; busy = true;
  const rules = `<p>육각 타일 <b>84개</b> 위에서 말 5개씩으로 겨뤄요. <b>가장자리 타일</b>에 번갈아 말을 놓고(상대가 먼저), 내 차례에 말 하나를 <b>일직선</b>으로 움직여요(다른 말·사라진 타일 앞까지).<br>움직이면 <b>떠난 타일이 사라지고</b>, <b>각자 3번째 차례부터는 타일 하나를 더</b> 없애요. <b>주변 타일이 모두 사라진 말은 제거</b>돼요. 말을 모두 잃거나 움직일 수 없으면 져요!</p>`;
  if (TUT) { showOverlay(`<h1>지각 변동 🌋</h1>${rules}<div class="col"><button id="b1">시작하기</button></div>`); $('b1').onclick = () => startGame('easy'); return; }
  const rows = LEVELS.map((l) => { const r = rec[l.id] || {}; return `<button data-lv="${l.id}">${l.name}<small>${l.desc}${r.w || r.l ? ` · ${r.w || 0}승 ${r.l || 0}패` : ''}</small></button>`; }).join('');
  showOverlay(`<h1>지각 변동 🌋</h1>${rules}<div class="col">${rows}</div>`);
  for (const b of document.querySelectorAll('#overlay [data-lv]')) b.onclick = () => startGame(b.dataset.lv);
}

st = L.newGame({ seed: 1 }); layout(); render(); showTitle(); requestAnimationFrame(loop);
/* @test-hooks:start */
window.__ts = { get st() { return st; }, get busy() { return busy; }, get mode() { return mode; }, get selected() { return selected; }, get pending() { return pending; }, startGame, centerOf, get geo() { return { W, H, SZ }; } };
/* @test-hooks:end */
})();
