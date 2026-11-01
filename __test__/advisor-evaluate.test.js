import '../polyfills';
import { describe, expect, it } from 'vitest';
import { evaluateUpgrades } from '../utility/advisor/evaluate';

const talent = { name: 'GILDED_SWORD', skillIndex: 1, baseLevel: 10, level: 30, maxLevel: 100 };
const character = (overrides = {}) => ({ name: 'Advanced', talentPointsLeft: [12, 9000],
  talents: { 0: { orderedTalents: [{ ...talent }] } }, flatTalents: [{ ...talent }], ...overrides });
const metric = (c) => c.flatTalents[0].level;

describe('spendable and measured talent actions', () => {
  it('spends only points in the matching tab and preserves bonus levels', () => {
    const selected = character();
    const before = JSON.stringify(selected);
    const result = evaluateUpgrades({ account: {}, characters: [selected], batchSize: 25 }, (c, peers) => {
      expect(peers[0]).toBe(c);
      return metric(c);
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ amount: 12, after: 42 });
    expect(result.actions[0].gainPercent).toBeCloseTo(40);
    expect(result.actions[0].nextStep).toContain('12 points from tab 1');
    expect(JSON.stringify(selected)).toBe(before);
  });
  it('honors the chosen level count for talent groups too', () => {
    const input = { account: {}, characters: [character()] };
    expect(evaluateUpgrades(input, metric).actions[0].levelCount).toBe(10);
    expect(evaluateUpgrades({ ...input, batchSize: 1 }, metric).actions[0].levelCount).toBe(1);
  });
  it('suppresses capped talents with thousands of spare points', () => {
    const capped = { ...talent, baseLevel: 100, level: 300 };
    const selected = character({ talentPointsLeft: [9000, 9000], flatTalents: [capped],
      talents: { 0: { orderedTalents: [capped] } } });
    expect(evaluateUpgrades({ account: {}, characters: [selected] }, metric).actions).toEqual([]);
  });
  it('does not spend points from another tab or invent unknown caps', () => {
    expect(evaluateUpgrades({ account: {}, characters: [character({ talentPointsLeft: [0, 9000] })] }, metric).actions).toEqual([]);
    const unknown = { ...talent, maxLevel: -1 };
    expect(evaluateUpgrades({ account: {}, characters: [character({ talents: { 0: { orderedTalents: [unknown] } } })] }, metric).actions).toEqual([]);
  });
  it('stops at the cap and hides changes with zero, negative or unavailable gain', () => {
    const nearCap = { ...talent, baseLevel: 99, level: 119 };
    const selected = character({ talents: { 0: { orderedTalents: [nearCap] } }, flatTalents: [nearCap] });
    expect(evaluateUpgrades({ account: {}, characters: [selected] }, metric).actions[0].amount).toBe(1);
    for (const calculate of [() => 100, (c) => 200 - metric(c), () => NaN]) {
      expect(evaluateUpgrades({ account: {}, characters: [selected] }, calculate).actions).toEqual([]);
    }
  });
  it('retains extremely small positive gains', () => {
    const result = evaluateUpgrades({ account: {}, characters: [character()] },
      (c) => 100 + (metric(c) - 30) * 1e-12);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].gainPercent).toBeGreaterThan(0);
    expect(result.actions[0].gainPercent).toBeLessThan(1e-9);
  });
});

describe('affordable coin-only stamp actions', () => {
  const stamp = { rawName: 'Sword', displayName: 'Sword Stamp', effect: 'Base_Damage',
    level: 1, maxLevel: 5, baseCoinCost: 10, powCoinBase: 1.1, reqItemMultiplicationLevel: 5 };
  const account = (money, row = stamp) => ({ currencies: { rawMoney: money }, stamps: { combat: [row] } });
  const calculate = (c, peers, acc) => 100 + acc.stamps.combat[0].level;
  it('verifies the next level, its cost and positive gain without mutating the account', () => {
    const acc = account(1000);
    const before = JSON.stringify(acc);
    const result = evaluateUpgrades({ account: acc, characters: [{ name: 'Advanced' }], batchSize: 1 }, calculate);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ after: 102, resource: 'coins' });
    expect(result.actions[0].amount).toBeGreaterThan(0);
    expect(result.actions[0].amount).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('excludes unaffordable, locked and capped upgrades', () => {
    for (const acc of [account(0), account(1000, { ...stamp, level: 0 }), account(1000, { ...stamp, level: 5 })]) {
      expect(evaluateUpgrades({ account: acc, characters: [{ name: 'Advanced' }] }, calculate).actions).toEqual([]);
    }
  });
});
