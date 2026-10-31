import '../polyfills';
import { describe, expect, it } from 'vitest';
import { parseFixture } from './helpers/parsed-fixtures';
import raw from '../data/raw.json';
import { evaluateUpgrades } from '../utility/advisor/evaluate';
import { getRecommendations } from '../utility/advisor/engine';

describe('advisor with real parsed save and formulas', () => {
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
