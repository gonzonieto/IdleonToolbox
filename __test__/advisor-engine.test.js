import { describe, expect, it } from 'vitest';
import { getRecommendations } from '../utility/advisor/engine';

const account = {
  stamps: { combat: [
    { displayName: 'A', level: 14 }, { displayName: 'B', level: 4 }, { displayName: 'C', level: 6 }
  ] },
  alchemy: { bubblesFlat: [
    { bubbleName: 'DROPPIN_LOADS', level: 7 },
    { bubbleName: 'FARQUAD_FORCE', level: 12 }
  ] }
};
const characters = [
  { name: 'Archer', targetMonster: 'slime', talentPointsLeft: [12, 0, 1] },
  { name: 'Mage', targetMonster: 'slime', talentPointsLeft: [0, 0, 0] }
];

describe('local progression advisor', () => {
  it('does not invent recommendations without a parsed account', () => {
    expect(getRecommendations({ objective: 'damage', characters })).toMatchObject({ recommendations: [] });
  });
  it('detects a concrete hit-chance bottleneck before generic stamp checks', () => {
    const result = getRecommendations({
      account, characters, characterName: 'Archer', objective: 'damage',
      stats: { Archer: { hitChance: 78, survivability: 100, maxDamage: 2500 } }
    });
    expect(result.recommendations[0].id).toBe('damage:accuracy');
    expect(result.recommendations[0].evidence).toContain('Current hit chance: 78.0%');
    expect(result.recommendations.some((r) => r.id === 'damage:talents')).toBe(true);
  });
  it('does not offer hit-chance advice without trustworthy numbers', () => {
    const result = getRecommendations({ account, characters, objective: 'damage', stats: {} });
    expect(result.recommendations.some((r) => r.id === 'damage:accuracy')).toBe(false);
  });
  it('compares actual calculated drop-rate values without presenting a promised gain', () => {
    const result = getRecommendations({
      account, characters, objective: 'dropRate', characterName: 'Archer',
      stats: { Archer: { dropRate: 7 }, Mage: { dropRate: 12 } }
    });
    expect(result.recommendations[0].id).toBe('dropRate:compare-characters');
    expect(result.recommendations[0].caveat).toMatch(/NOT a predicted improvement/);
  });
  it('is deterministic on identical input and never produces infinite scores', () => {
    const input = { account, characters, objective: 'damage' };
    expect(getRecommendations(input)).toEqual(getRecommendations(input));
    expect(getRecommendations(input).recommendations.every((r) => Number.isFinite(r.score))).toBe(true);
  });
  it('ignores unreleased and missing bubble levels', () => {
    const result = getRecommendations({
      account: { alchemy: { bubblesFlat: [{ bubbleName: 'DROPPIN_LOADS', level: 0 }] } },
      characters, objective: 'dropRate'
    });
    expect(result.recommendations.some((r) => r.id.includes('bubble'))).toBe(false);
  });
});
