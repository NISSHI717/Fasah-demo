import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/random.js';

test('same seed gives the same sequence', () => {
  const a = createRng(7), b = createRng(7);
  const sa = Array.from({ length: 5 }, () => a.next());
  const sb = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(sa, sb);
  sa.forEach(x => assert.ok(x >= 0 && x < 1));
});

test('different seeds give different sequences', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('triangular(20,40,90) stays in range with the right mean', () => {
  const r = createRng(2026);
  let sum = 0;
  for (let i = 0; i < 1000; i++) {
    const x = r.triangular(20, 40, 90);
    assert.ok(x >= 20 && x <= 90);
    sum += x;
  }
  const mean = sum / 1000; // theoretical mean = 50
  assert.ok(mean >= 45 && mean <= 52, `mean ${mean}`);
});

test('int and bernoulli behave', () => {
  const r = createRng(3);
  for (let i = 0; i < 200; i++) {
    const n = r.int(1, 3);
    assert.ok([1, 2, 3].includes(n));
  }
  assert.equal(r.bernoulli(0), false);
  assert.equal(r.bernoulli(1), true);
});
