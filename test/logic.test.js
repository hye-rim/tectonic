'use strict';

// 지각 변동 규칙·컴퓨터 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function ready(opts = {}) {                                                        // 말을 바로 놓아 둔 판(시험용)
  const st = L.newGame({ seed: 1, ...opts }); st.phase = 'move'; st.turn = opts.first || 'you'; return st;
}

test('board: 84 hexagonal tiles, neighbours are symmetric, the middle has 6 neighbours, the edge has 34 tiles', () => {
  assert.strictEqual(L.N, 84);
  for (let i = 0; i < L.N; i++) for (const n of L.NB[i]) assert.ok(L.NB[n].includes(i), `${i}-${n}`);
  assert.strictEqual(L.NB[L.idOf(3, 5)].length, 6);
  assert.strictEqual(L.EDGE.length, 34);
  for (const e of L.EDGE) assert.ok(L.NB[e].length < 6);
  for (let i = 0; i < L.N; i++) if (!L.EDGE.includes(i)) assert.strictEqual(L.NB[i].length, 6);
});

test('placing: the second player places first, alternately, only on free edge tiles; then the first player moves', () => {
  const st = L.newGame({ seed: 1, first: 'you' });
  assert.strictEqual(st.phase, 'place'); assert.strictEqual(st.turn, 'cpu');
  assert.strictEqual(L.place(st, 'you', L.EDGE[0]).why, 'turn');
  const inner = L.idOf(3, 5); assert.strictEqual(L.place(st, 'cpu', inner).why, 'tile', 'not on the edge');
  assert.ok(L.place(st, 'cpu', L.EDGE[0]).ok); assert.strictEqual(L.place(st, 'you', L.EDGE[0]).why, 'tile', 'taken');
  assert.ok(L.place(st, 'you', L.EDGE[5]).ok);
  let g = 0; while (st.phase === 'place' && g++ < 40) { const side = st.turn; L.place(st, side, L.placeOptions(st)[0]); }
  assert.strictEqual(st.phase, 'move'); assert.strictEqual(st.turn, 'you'); assert.strictEqual(st.pieces.you.length, 5); assert.strictEqual(st.pieces.cpu.length, 5);
});

test('moves: a straight line in any of six directions, stopping anywhere before a piece, a removed tile or the edge', () => {
  const st = ready(); st.pieces.you = [L.idOf(3, 5)]; st.pieces.cpu = [L.idOf(3, 8)];
  const d = L.destinations(st, L.idOf(3, 5));
  assert.ok(d.includes(L.idOf(3, 6)) && d.includes(L.idOf(3, 7)), 'the same row up to the blocking piece');
  assert.ok(!d.includes(L.idOf(3, 8)), 'not onto a piece'); assert.ok(!d.includes(L.idOf(3, 9)), 'not past a piece');
  assert.ok(d.includes(L.idOf(3, 0)), 'all the way to the edge on the other side');
  st.alive.delete(L.idOf(3, 3)); assert.ok(!L.destinations(st, L.idOf(3, 5)).includes(L.idOf(3, 2)), 'cannot jump over a removed tile');
  assert.ok(L.destinations(st, L.idOf(3, 5)).includes(L.idOf(3, 4)));
  // 모든 목적지는 같은 방향 직선 위에 있다
  for (const to of L.destinations(st, L.idOf(3, 5))) assert.ok(to !== L.idOf(3, 5));
});

test('moving removes the tile that was left; turns 1 and 2 remove nothing else, from turn 3 on one more tile must be removed', () => {
  const st = ready(); st.pieces.you = [L.idOf(3, 2), L.idOf(0, 0)]; st.pieces.cpu = [L.idOf(5, 9), L.idOf(6, 11)];
  const first = L.legalMoves(st, 'you')[0];
  assert.ok(L.move(st, 'you', first.from, first.to).ok); assert.ok(!st.alive.has(first.from)); assert.strictEqual(st.alive.size, 83); assert.strictEqual(st.turn, 'cpu');
  const m2 = L.legalMoves(st, 'cpu')[0]; L.move(st, 'cpu', m2.from, m2.to); assert.strictEqual(st.alive.size, 82);
  const m3 = L.legalMoves(st, 'you')[0]; L.move(st, 'you', m3.from, m3.to); assert.strictEqual(st.alive.size, 81, 'second turn: still only the left tile');
  const m4 = L.legalMoves(st, 'cpu')[0]; L.move(st, 'cpu', m4.from, m4.to); assert.strictEqual(st.alive.size, 80);
  // 세 번째 차례: 추가로 없앨 타일이 필요하다
  const m5 = L.legalMoves(st, 'you')[0];
  assert.strictEqual(L.move(st, 'you', m5.from, m5.to).why, 'extra', 'an extra tile is required');
  const target = L.extraOptions(st, m5.to).find((x) => x !== m5.from && L.NB[x].some((n) => n !== m5.from));
  assert.ok(L.move(st, 'you', m5.from, m5.to, target).ok); assert.ok(!st.alive.has(target)); assert.ok(!st.alive.has(m5.from));
});

test('the extra tile cannot be one with a piece on it, the new place of the moved piece, or a tile that is already gone', () => {
  const st = ready(); st.turns = { you: 2, cpu: 2 }; st.pieces.you = [L.idOf(3, 2)]; st.pieces.cpu = [L.idOf(5, 9)];
  const m = L.legalMoves(st, 'you')[0];
  assert.strictEqual(L.move(st, 'you', m.from, m.to, st.pieces.cpu[0]).why, 'extra');
  assert.strictEqual(L.move(st, 'you', m.from, m.to, m.to).why, 'extra');
  assert.strictEqual(L.move(st, 'you', m.from, m.to, m.from).why, 'extra');
  st.alive.delete(L.idOf(0, 5)); assert.strictEqual(L.move(st, 'you', m.from, m.to, L.idOf(0, 5)).why, 'extra');
});

test('a piece with no tile left around it is removed, and so is a tile with no neighbour tile left', () => {
  const st = ready(); const p = L.idOf(3, 5); st.pieces.you = [p, L.idOf(0, 0)]; st.pieces.cpu = [L.idOf(6, 11)];
  for (const n of L.NB[p]) st.alive.delete(n);                                   // 말 주변 타일을 모두 없앰
  L.cascade(st);
  assert.deepStrictEqual(st.pieces.you, [L.idOf(0, 0)], 'the isolated piece is gone'); assert.ok(!st.alive.has(p), 'its tile is gone too');
  assert.strictEqual(st.lost.you, 1);
  for (const n of L.NB[L.idOf(0, 0)].slice(1)) st.alive.delete(n); L.cascade(st);                        // 이웃이 하나만 남은 타일은 남는다
  assert.ok(st.alive.has(L.idOf(0, 0)) || st.pieces.you.length === 0);
});

test('a piece next to another piece is not isolated (a tile with a piece on it still counts)', () => {
  const st = ready(); const p = L.idOf(3, 5); st.pieces.you = [p]; st.pieces.cpu = [L.NB[p][0], L.idOf(6, 11)];
  for (const n of L.NB[p].slice(1)) st.alive.delete(n); L.cascade(st);
  assert.deepStrictEqual(st.pieces.you, [p]);
});

test('losing the last piece loses the game: moving next to nothing leaves the piece isolated', () => {
  const st = ready({ first: 'you' }); const q = L.idOf(3, 0), p = L.NB[q].find((n) => L.step(q, 0) === n || true);
  const pp = L.NB[q][0];
  st.pieces.you = [pp]; st.pieces.cpu = [L.idOf(6, 11), L.idOf(0, 11)];
  for (const n of L.NB[q]) if (n !== pp) st.alive.delete(n);                       // q 의 이웃 중 pp 만 남긴다
  const r = L.move(st, 'you', pp, q);                                                // pp 에서 q 로(떠난 pp 가 없어지면 q 는 고립)
  assert.ok(r.ok); assert.ok(st.over); assert.strictEqual(st.winner, 'cpu'); assert.strictEqual(st.pieces.you.length, 0); assert.ok(st.events.some((e) => e.t === 'lost' && e.side === 'you'));
  void p;
});

test('a side with no legal move at its turn loses', () => {
  const st = ready({ first: 'cpu' }); const corner = L.idOf(0, 0), nb = L.NB[corner];
  st.pieces.you = [corner]; st.pieces.cpu = nb.concat([L.idOf(6, 11)]);                // 모서리의 이웃을 모두 상대 말이 막음
  assert.strictEqual(L.legalMoves(st, 'you').length, 0);
  const m = L.legalMoves(st, 'cpu').find((x) => x.from === L.idOf(6, 11)); assert.ok(m);
  const r = L.move(st, 'cpu', m.from, m.to); assert.ok(r.ok);
  assert.ok(st.over); assert.strictEqual(st.winner, 'cpu');
});

test('the computer only plays legal moves and every game ends, on every level', () => {
  for (const level of ['easy', 'normal']) for (let seed = 1; seed <= 6; seed++) {
    const st = L.newGame({ seed, level, first: seed % 2 ? 'you' : 'cpu' }); let g = 0;
    while (!st.over && g++ < 400) {
      const side = st.turn;
      if (st.phase === 'place') { const t = L.choosePlace(st, side); assert.ok(L.place(st, side, t).ok); }
      else { const m = L.chooseMove(st, side); assert.ok(m, 'there is a move'); const r = L.move(st, side, m.from, m.to, m.extra); assert.ok(r.ok, `${level}/${seed}: ${r.why}`); }
    }
    assert.ok(st.over, `${level}/${seed} finished`); assert.ok(st.winner === 'you' || st.winner === 'cpu');
  }
});

test('a stronger computer wins more (computer against computer)', () => {
  function game(seed, lv1, lv2) { const st = L.newGame({ seed, first: seed % 2 ? 'you' : 'cpu' }); let g = 0; while (!st.over && g++ < 400) { const side = st.turn; st.level = side === 'you' ? lv1 : lv2; if (st.phase === 'place') L.place(st, side, L.choosePlace(st, side)); else { const m = L.chooseMove(st, side); L.move(st, side, m.from, m.to, m.extra); } } return st.winner; }
  let strong = 0, weak = 0;
  for (let s = 1; s <= 30; s++) { const w = game(s * 5, 'easy', 'normal'); if (w === 'cpu') strong++; else weak++; }
  assert.ok(strong > weak * 3, `normal ${strong} vs easy ${weak}`);
});
