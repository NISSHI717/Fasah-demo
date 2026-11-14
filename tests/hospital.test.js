import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEDS, bedById, suits, roleFor, approverFor, poolAt, durationRange, typicalOf, fmtTime, CONFIG } from '../src/core/hospital.js';

test('36 beds with the right wards, sexes and isolation rooms', () => {
  assert.equal(BEDS.length, 36);
  assert.equal(bedById('B01').ward, 'A');
  assert.equal(bedById('B01').sex, 'M');
  assert.equal(bedById('B19').sex, 'F');
  assert.equal(bedById('B19').ward, 'B');
  const iso = BEDS.filter(b => b.isolation).map(b => b.id);
  assert.deepEqual(iso, ['B17', 'B18', 'B35', 'B36']);
});

test('suits requires matching sex and exact isolation flag', () => {
  assert.equal(suits(bedById('B17'), { sex: 'M', isolation: true }), true);
  assert.equal(suits(bedById('B17'), { sex: 'M', isolation: false }), false);
  assert.equal(suits(bedById('B20'), { sex: 'M', isolation: false }), false);
  assert.equal(suits(bedById('B20'), { sex: 'F', isolation: false }), true);
});

test('roles, approvers, pool and durations', () => {
  assert.equal(roleFor('cleaning'), 'housekeeper');
  assert.equal(roleFor('pharmacy'), 'pharmacist');
  assert.equal(roleFor('transport'), 'transporter');
  assert.equal(approverFor('cleaning'), 'Housekeeping lead');
  assert.equal(approverFor('borrow'), 'Charge nurse, lending ward');
  assert.equal(poolAt(600), 1);
  assert.equal(poolAt(800), 0);
  assert.equal(poolAt(1000), 1);
  assert.equal(poolAt(1400), 0);
  assert.equal(poolAt(600 + 1440), 1);
  assert.deepEqual(durationRange('cleaning', bedById('B35')), [45, 60, 90]);
  assert.deepEqual(durationRange('cleaning', bedById('B20')), [20, 30, 45]);
  assert.equal(typicalOf('pharmacy', bedById('B20')), 40);
  assert.equal(CONFIG.staff.housekeeper, 2);
});

test('fmtTime formats minutes as HH:MM and wraps days', () => {
  assert.equal(fmtTime(660), '11:00');
  assert.equal(fmtTime(785), '13:05');
  assert.equal(fmtTime(1860), '07:00');
});
