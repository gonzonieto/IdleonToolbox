import '../polyfills';
import { describe, expect, it } from 'vitest';
import { evaluateUpgrades } from '../utility/advisor/evaluate';
import { bubblePurchase } from '../utility/advisor/alchemy';
import { getGoldCostToMaxLevel } from '../parsers/world-1/stamps';
import { OPT } from '../parsers/accountOptions';

const makeAccount = ({ fish = 20e9, uses = 0, level = 5000 } = {}) => {
  const bubble = { bubbleName: 'DROPPIN_LOADS', bubbleIndex: 'c1', index: 1, level, cauldron: 'kazam',
    itemReq: [{ rawName: 'Fish1', name: 'Goldfish', baseCost: 3 }, { rawName: 'Liquid1', name: 'Liquid1', baseCost: 2 }] };
  const rows = Array.from({ length: 17 }, (_, i) => ({ level: 0, bubbleIndex: `c${i}` })); rows[1] = bubble;
  return { alchemy: { bubbles: { kazam: rows }, bubblesFlat: [bubble], liquids: [70000], vials: [] },
    storage: { list: [{ rawName: 'Fish1', amount: fish }] },
    atoms: { particles: 1e6, atoms: Array.from({ length: 5 }, () => ({ level: 1 })) },
    accountOptions: { [OPT.alternateParticles]: uses }, achievements: [] };
};
const evaluate = (account, batchSize = 10) => evaluateUpgrades({ objective: 'dropRate', account,
  characters: [{ name: 'Test' }], batchSize }, (c, peers, acc) => {
  expect(acc.alchemy.bubblesFlat[0].level).toBe(acc.alchemy.bubbles.kazam[1].level);
  return acc.alchemy.bubblesFlat[0].level ** 2;
});

describe('grouped bubble upgrades', () => {
  it('creates one +10 card with cumulative costs and the actual nonlinear combined gain', () => {
    const acc = makeAccount(); const before = JSON.stringify(acc);
    const result = evaluate(acc);
    expect(result.actions).toHaveLength(1);
    const action = result.actions[0];
    expect(action).toMatchObject({ levelCount: 10, targetLevel: 5010, after: 5010 ** 2 });
    expect(action.title).toContain('by 10 levels');
    expect(action.costs.find((c) => c.rawName === 'Fish1').amount).toBe(10e9);
    expect(action.gainPercent).toBeCloseTo(((5010 ** 2 - 5000 ** 2) / 5000 ** 2) * 100, 12);
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('returns a smaller group when the shared material balance runs out', () => {
    const action = evaluate(makeAccount({ fish: 2.5e9 })).actions[0];
    expect(action.levelCount).toBe(2);
    expect(action.costs.find((c) => c.rawName === 'Fish1').amount).toBe(2e9);
  });
  it('does not reuse the same daily Boron allowance for every level', () => {
    const action = evaluate(makeAccount({ fish: 0, uses: 3 })).actions[0];
    expect(action.levelCount).toBe(3);
    expect(action.costs.find((c) => c.rawName === 'BoronUses').amount).toBe(3);
  });
  it('can pay early levels with materials and later levels with particles', () => {
    const action = evaluate(makeAccount({ fish: 2.1e9, uses: 2 })).actions[0];
    expect(action.levelCount).toBe(4);
    expect(action.costs.find((c) => c.rawName === 'Fish1').amount).toBe(2e9);
    expect(action.costs.find((c) => c.rawName === 'BoronUses').amount).toBe(2);
  });
  it('reprices levels across liquid-cost thresholds', () => {
    const acc = makeAccount({ level: 19 });
    let liquid = 0;
    for (let i = 0; i < 10; i++) liquid += bubblePurchase(acc, { ...acc.alchemy.bubblesFlat[0], level: 19 + i }).costs.find((c) => c.rawName === 'Liquid1').amount;
    expect(evaluate(acc).actions[0].costs.find((c) => c.rawName === 'Liquid1').amount).toBe(liquid);
    expect(evaluate(acc, 1).actions[0].levelCount).toBe(1);
  });
});

describe('grouped stamp coin levels', () => {
  const stamp = { rawName: 'Sword', displayName: 'Sword Stamp', effect: 'Base_Damage',
    level: 1, maxLevel: 20, baseCoinCost: 10, powCoinBase: 1.1, reqItemMultiplicationLevel: 5 };
  const account = (money) => ({ currencies: { rawMoney: money }, stamps: { combat: [stamp] } });
  const metric = (c, peers, acc) => acc.stamps.combat[0].level ** 2;
  const price = (acc, level) => getGoldCostToMaxLevel({ ...stamp, level, maxLevel: level + 1 }, acc);
  it('sums each coin price and evaluates the target level once', () => {
    const acc = account(1e6); const before = JSON.stringify(acc);
    const action = evaluateUpgrades({ account: acc, characters: [{ name: 'Test' }] }, metric).actions[0];
    expect(action).toMatchObject({ levelCount: 10, targetLevel: 11, after: 121 });
    expect(action.amount).toBe(Array.from({ length: 10 }, (_, i) => price(acc, 1 + i)).reduce((a, b) => a + b, 0));
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('stops before spending coins twice', () => {
    const acc = account(1e6); const budget = price(acc, 1) + price(acc, 2);
    const action = evaluateUpgrades({ account: account(budget), characters: [{ name: 'Test' }] }, metric).actions[0];
    expect(action.levelCount).toBe(2);
    expect(action.amount).toBe(budget);
  });
});
