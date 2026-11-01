import '../polyfills';
import { describe, expect, it } from 'vitest';
import { parseFixture } from './helpers/parsed-fixtures';
import raw from '../data/raw.json';
import { evaluateUpgrades } from '../utility/advisor/evaluate';
import { getRecommendations } from '../utility/advisor/engine';
import { stampBatch } from '../utility/advisor/stamps';
import { evaluateStamp } from '../parsers/world-1/stamps';

describe('advisor with real parsed save and formulas', () => {
  it('budgets repeated material unlocks and consumes the Hydrogen discount once', () => {
    const { account, characters } = parseFixture(raw);
    const template = account.stamps.combat.find((s) => s.effect.includes('Base_Damage') && !s.materials?.length);
    const stamp = { ...template, level: 1, maxLevel: 1, reqItemMultiplicationLevel: 5,
      baseMatCost: 1000, powMatBase: 2, baseCoinCost: 1, powCoinBase: 1.05, ownedMats: 1e9 };
    const options = [...account.accountOptions]; options[154] = 0;
    const acc = { ...account, accountOptions: options, atoms: { ...account.atoms, stampReducer: 90 },
      currencies: { ...account.currencies, rawMoney: 1e20 }, stamps: { combat: [stamp] } };
    const firstCost = evaluateStamp(stamp, acc, characters, false).materialCost;
    const nextStamp = { ...stamp, level: 6, maxLevel: 6 };
    const nextAccount = { ...acc, atoms: { ...acc.atoms, stampReducer: 0 }, stamps: { combat: [nextStamp] } };
    const secondCost = evaluateStamp(nextStamp, nextAccount, characters, false).materialCost;
    const before = JSON.stringify(acc);
    const plan = stampBatch({ account: acc, characters, category: 'combat', index: 0, limit: 10 });
    expect(plan).toMatchObject({ levels: 10, capUnlocks: 2, targetLevel: 11 });
    expect(plan.materials).toBe(firstCost + secondCost);
    expect(plan.account.atoms.stampReducer).toBe(0);
    expect(JSON.stringify(acc)).toBe(before);
    const limited = { ...acc, stamps: { combat: [{ ...stamp, ownedMats: firstCost + secondCost - 1 }] } };
    expect(stampBatch({ account: limited, characters, category: 'combat', index: 0, limit: 10 }).levels).toBe(5);
  });
  it('evaluates a material cap unlock plus the next coin level, and rejects missing materials', () => {
    const { account, characters } = parseFixture(raw);
    const template = account.stamps.combat.find((s) => s.effect.includes('Base_Damage') && !s.materials?.length);
    const stamp = { ...template, level: 1, maxLevel: 1, reqItemMultiplicationLevel: 5,
      baseMatCost: 1, powMatBase: 2, baseCoinCost: 1, powCoinBase: 1.05, ownedMats: 1000 };
    const acc = { ...account, currencies: { ...account.currencies, rawMoney: 1e20 },
      stamps: { combat: [stamp] } };
    const metric = (c, peers, a) => 100 + a.stamps.combat[0].level;
    const evaluation = evaluateUpgrades({ account: acc, characters, batchSize: 1 }, metric);
    const action = evaluation.actions.find((a) => a.resource === 'coins');
    expect(action).toBeTruthy();
    expect(action.after).toBe(102);
    expect(action.evidence.join(' ')).toContain('Material cap unlock');
    expect(action.cost).toContain(' + ');
    expect(acc.stamps.combat[0].maxLevel).toBe(1);
    const missing = { ...acc, stamps: { combat: [{ ...stamp, ownedMats: 0 }] } };
    expect(evaluateUpgrades({ account: missing, characters }, metric).actions).toEqual([]);
  });
  it.each(['damage', 'dropRate'])('evaluates %s without mutating the save', (objective) => {
    const { account, characters } = parseFixture(raw);
    const before = JSON.stringify({ account, characters });
    const evaluation = evaluateUpgrades({ objective, account, characters });
    expect(Number.isFinite(evaluation.baseline)).toBe(true);
    expect(evaluation.baseline).toBeGreaterThan(0);
    expect(evaluation.unavailable).toBe(0);
    if (objective === 'damage') {
      expect(evaluation.checked).toBeGreaterThan(0);
      expect(evaluation.actions.length).toBeGreaterThan(0);
    }
    const result = getRecommendations({ objective, account, characters, evaluation });
    for (const action of result.recommendations) {
      expect(action.after).toBeGreaterThan(action.before);
      expect(action.gainPercent).toBeCloseTo((action.after / action.before - 1) * 100);
      expect(action.amount).toBeGreaterThanOrEqual(0);
      expect(action.cost).toBeTruthy();
    }
    expect(JSON.stringify({ account, characters })).toBe(before);
  });
});
