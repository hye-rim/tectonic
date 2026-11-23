'use strict';
// 지각 변동(데스게임 시즌2 준결승 2라운드): 육각 타일 84개 위에서 말 5개씩으로 겨룬다.
// 가장자리 빈 타일에 번갈아 말을 놓고(후공부터), 내 차례에 말 하나를 일직선으로 움직이면 떠난 자리의 타일이 사라지고,
// 각자 3번째 차례부터는 타일 하나를 더 없앨 수 있다. 주변 타일이 모두 사라져 고립된 말은 제거되고, 말 5개를 모두 잃으면 진다.
// 규칙·컴퓨터는 화면 없이 여기서 (LOGIC_TS).
const LOGIC_TS = (() => {
  const R = 7, C = 12, N = R * C, PIECES = 5;                         // 7줄 × 12칸 = 84칸
  const other = (s) => (s === 'you' ? 'cpu' : 'you');
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];     // 육각 좌표(axial)의 여섯 방향

  function rng(seed) {
    let t = (seed >>> 0) || 1;
    return () => {
      t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 줄(r)·칸(c) ↔ 번호. 홀수 줄이 반 칸 오른쪽으로 밀린 배치(odd-r). 이웃·일직선 계산은 axial 좌표로
  const idOf = (r, c) => (r >= 0 && r < R && c >= 0 && c < C ? r * C + c : -1);
  const toAxial = (id) => { const r = Math.floor(id / C), c = id % C; return [c - (r - (r & 1)) / 2, r]; };
  const fromAxial = (q, r) => idOf(r, q + (r - (r & 1)) / 2);
  const step = (id, d) => { const [q, r] = toAxial(id); return fromAxial(q + DIRS[d][0], r + DIRS[d][1]); };
  const NB = Array.from({ length: N }, (_, i) => DIRS.map((_, d) => step(i, d)).filter((x) => x >= 0));
  const isEdge = (id) => DIRS.some((_, d) => step(id, d) < 0);          // 이웃이 하나라도 판 밖이면 가장자리
  const EDGE = Array.from({ length: N }, (_, i) => i).filter(isEdge);

  function newGame(opts = {}) {
    const pieces = opts.pieces || PIECES;
    const st = {
      rand: opts.rand || rng(opts.seed || 1), level: opts.level || 'normal', total: pieces, first: opts.first || 'you',
      alive: new Set(Array.from({ length: N }, (_, i) => i)), pieces: { you: [], cpu: [] }, phase: 'place', placed: { you: 0, cpu: 0 },
      turn: other(opts.first || 'you'), turns: { you: 0, cpu: 0 }, over: false, winner: null, events: [], lost: { you: 0, cpu: 0 },
    };
    return st;
  }
  const occupied = (st) => new Set(st.pieces.you.concat(st.pieces.cpu));

  function placeOptions(st) { const occ = occupied(st); return EDGE.filter((i) => st.alive.has(i) && !occ.has(i)); }
  function place(st, side, tile) {
    st.events = [];
    if (st.over || st.phase !== 'place') return { ok: false, why: 'phase' };
    if (st.turn !== side) return { ok: false, why: 'turn' };
    if (!placeOptions(st).includes(tile)) return { ok: false, why: 'tile' };
    st.pieces[side].push(tile); st.placed[side]++; st.events.push({ t: 'place', side, tile });
    if (st.placed.you >= st.total && st.placed.cpu >= st.total) { st.phase = 'move'; st.turn = st.first; checkNoMoves(st); }
    else st.turn = other(side);
    return { ok: true };
  }

  // 한 말이 갈 수 있는 칸: 여섯 방향으로 일직선, 사라진 타일이나 다른 말(또는 판 밖)에 막히기 전까지 원하는 곳에서 멈출 수 있다
  function destinations(st, from) {
    const occ = occupied(st), out = [];
    for (let d = 0; d < 6; d++) { let at = step(from, d); while (at >= 0 && st.alive.has(at) && !occ.has(at)) { out.push(at); at = step(at, d); } }
    return out;
  }
  function legalMoves(st, side) { const out = []; for (const p of st.pieces[side]) for (const to of destinations(st, p)) out.push({ from: p, to }); return out; }
  const needsExtra = (st, side) => st.turns[side] >= 2;                // 각자 세 번째 차례부터

  // 말 움직이기: 떠난 자리의 타일이 사라지고, 세 번째 차례부터는 타일 하나(말이 없는 곳)를 더 없앤다
  function extraOptions(st, to) { const occ = occupied(st); return [...st.alive].filter((i) => !occ.has(i) && i !== to); }
  function move(st, side, from, to, extra) {
    st.events = [];
    if (st.over || st.phase !== 'move') return { ok: false, why: 'phase' };
    if (st.turn !== side) return { ok: false, why: 'turn' };
    if (!st.pieces[side].includes(from) || !destinations(st, from).includes(to)) return { ok: false, why: 'move' };
    const must = needsExtra(st, side);
    if (must && !(extra !== undefined && extra !== null && st.alive.has(extra) && extra !== to && !occupied(st).has(extra) && extra !== from)) {
      // 떠난 자리는 방금 없어지므로 extra 로 또 고를 수 없다. 남은 타일이 없으면 생략
      const cand = extraOptions(st, to).filter((i) => i !== from);
      if (cand.length) return { ok: false, why: 'extra' };
    }
    st.pieces[side] = st.pieces[side].map((p) => (p === from ? to : p)); st.alive.delete(from); st.turns[side]++;
    st.events.push({ t: 'move', side, from, to }); st.events.push({ t: 'remove', tile: from, kind: 'left' });
    if (must && extra !== undefined && extra !== null) { st.alive.delete(extra); st.events.push({ t: 'remove', tile: extra, kind: 'extra' }); }
    cascade(st);
    if (!finish(st, side)) { st.turn = other(side); checkNoMoves(st); }
    return { ok: true };
  }

  // 고립 정리: 주변 타일이 하나도 남지 않은 타일은 사라지고(그 위의 말도), 주변 타일이 없는 말은 제거된다. 더 이상 바뀌지 않을 때까지
  function cascade(st) {
    for (let again = true; again;) {
      again = false;
      for (const t of [...st.alive]) if (!NB[t].some((n) => st.alive.has(n))) { st.alive.delete(t); st.events.push({ t: 'remove', tile: t, kind: 'island' }); again = true; }
      for (const side of ['you', 'cpu']) {
        const keep = []; for (const p of st.pieces[side]) { if (st.alive.has(p) && NB[p].some((n) => st.alive.has(n))) keep.push(p); else { st.events.push({ t: 'lost', side, tile: p }); st.lost[side]++; again = true; } }
        st.pieces[side] = keep;
      }
    }
  }
  function finish(st, mover) {
    const y = st.pieces.you.length, c = st.pieces.cpu.length;
    if (y > 0 && c > 0) return false;
    st.over = true; st.winner = y === 0 && c === 0 ? other(mover) : (y === 0 ? 'cpu' : 'you'); st.events.push({ t: 'over', winner: st.winner }); return true;
  }
  function checkNoMoves(st) {                                            // 움직일 말이 없으면 진다
    if (st.over || st.phase !== 'move') return;
    if (legalMoves(st, st.turn).length === 0) { st.over = true; st.winner = other(st.turn); st.events.push({ t: 'over', winner: st.winner, why: 'stuck' }); }
  }

  // ---------- 컴퓨터 ----------
  // 판의 가치(side 에게): 남은 말 수, 움직일 수 있는 칸 수(기동성), 내가 상대보다 먼저 닿는 타일 수(영역)
  function bfsDist(st, srcs) { const dist = new Map(); const q = []; for (const s of srcs) { dist.set(s, 0); q.push(s); } for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of NB[v]) if (st.alive.has(w) && !dist.has(w)) { dist.set(w, dist.get(v) + 1); q.push(w); } } return dist; }
  function evaluate(st, side) {
    const foe = other(side), ys = st.pieces[side], cs = st.pieces[foe];
    if (st.over) return st.winner === side ? 1e6 : -1e6;
    let v = (ys.length - cs.length) * 150;
    let mobMe = 0, mobFoe = 0; for (const p of ys) mobMe += destinations(st, p).length; for (const p of cs) mobFoe += destinations(st, p).length;
    v += (mobMe - mobFoe) * 1.5;
    const dm = bfsDist(st, ys), df = bfsDist(st, cs); let terr = 0;
    for (const t of st.alive) { const a = dm.get(t) ?? 99, b = df.get(t) ?? 99; if (a < b) terr++; else if (b < a) terr--; }
    return v + terr * 1.2;
  }
  function clone(st) { return { ...st, alive: new Set(st.alive), pieces: { you: st.pieces.you.slice(), cpu: st.pieces.cpu.slice() }, turns: { ...st.turns }, placed: { ...st.placed }, lost: { ...st.lost }, events: [] }; }

  // 상대 말 가까이의 타일 위주로 '없앨 타일' 후보를 줄인다
  function removalCandidates(st, side, to, limit) {
    const foe = other(side), cand = extraOptions(st, to), fd = bfsDist(st, st.pieces[foe]), md = bfsDist(st, st.pieces[side].map((p) => (p)));
    cand.sort((a, b) => ((fd.get(a) ?? 99) - (md.get(a) ?? 99) * 0.5) - ((fd.get(b) ?? 99) - (md.get(b) ?? 99) * 0.5) + (st.rand() - 0.5) * 0.2);
    return cand.slice(0, limit);
  }
  function bestReply(st, side, limit) {                                   // side 가 한 번 둘 때 가장 좋은 판단(1수 앞)
    let best = null;
    for (const m of legalMoves(st, side)) {
      const opts = needsExtra(st, side) ? removalCandidates(st, side, m.to, limit).filter((x) => x !== m.from) : [null];
      for (const x of (opts.length ? opts : [null])) { const c = clone(st); const r = move(c, side, m.from, m.to, x); if (!r.ok) continue; const v = evaluate(c, side); if (!best || v > best.v) best = { ...m, extra: x, v }; }
    }
    return best;
  }
  function chooseMove(st, side) {
    const rand = st.rand, moves = legalMoves(st, side);
    if (!moves.length) return null;
    if (st.level === 'easy') {
      const m = moves[Math.floor(rand() * moves.length)]; const opts = needsExtra(st, side) ? extraOptions(st, m.to).filter((x) => x !== m.from) : [];
      return { ...m, extra: opts.length ? opts[Math.floor(rand() * opts.length)] : null };
    }
    const limit = st.level === 'hard' ? 10 : 6; let cands = [];
    for (const m of moves) {
      const opts = needsExtra(st, side) ? removalCandidates(st, side, m.to, limit).filter((x) => x !== m.from) : [null];
      for (const x of (opts.length ? opts : [null])) { const c = clone(st); if (!move(c, side, m.from, m.to, x).ok) continue; cands.push({ ...m, extra: x, v: evaluate(c, side) + (st.level === 'normal' ? rand() * 6 : rand() * 0.5), c }); }
    }
    cands.sort((a, b) => b.v - a.v);
    if (st.level === 'hard') {                                                 // 상위 후보마다 상대의 가장 좋은 대응을 보고 고른다
      let best = null;
      for (const cd of cands.slice(0, 8)) {
        let v = cd.v; if (!cd.c.over) { const reply = bestReply(cd.c, other(side), 6); if (reply) { const c2 = clone(cd.c); move(c2, other(side), reply.from, reply.to, reply.extra); v = evaluate(c2, side); } }
        if (!best || v > best.v) best = { ...cd, v };
      }
      return best;
    }
    return cands[0];
  }
  function choosePlace(st, side) {
    const opts = placeOptions(st), rand = st.rand;
    if (st.level === 'easy') return opts[Math.floor(rand() * opts.length)];
    let best = null;
    for (const t of opts) { const c = clone(st); c.pieces = { you: c.pieces.you.slice(), cpu: c.pieces.cpu.slice() }; c.pieces[side].push(t); const dm = bfsDist(c, c.pieces[side]), df = bfsDist(c, c.pieces[other(side)].length ? c.pieces[other(side)] : [t]); let terr = 0; for (const x of c.alive) { const a = dm.get(x) ?? 99, b = df.get(x) ?? 99; if (a < b) terr++; else if (b < a) terr--; } const mob = destinations(c, t).length; const v = terr * 0.5 + mob * 1.2 + rand() * 1.5; if (!best || v > best.v) best = { t, v }; }
    return best.t;
  }

  return { R, C, N, PIECES, DIRS, rng, idOf, toAxial, step, NB, EDGE, isEdge, newGame, occupied, placeOptions, place, destinations, legalMoves, needsExtra, extraOptions, move, cascade, evaluate, chooseMove, choosePlace, other };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LOGIC_TS;
