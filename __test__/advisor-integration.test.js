import { describe, expect, it } from 'vitest';
import { parseFixture } from './helpers/parsed-fixtures';
import raw from '../data/raw.json';
import { getMaxDamage } from '../parsers/damage';
import { getDropRate } from '../parsers/character';
import { mainStatMap } from '../parsers/talents';
import { getRecommendations } from '../utility/advisor/engine';

describe('advisor with a parsed Toolbox save', () => {
  it('accepts actual damage and drop-rate formula results', () => {
    const { account, characters } = parseFixture(raw);
    expect(characters.length).toBeGreaterThan(0);
    const selected = characters[0];
    const damage = getMaxDamage(selected, characters, account);
    expect(Number.isFinite(damage.maxDamage)).toBe(true);
    expect(Number.isFinite(damage.hitChance)).toBe(true);
    const damageResult = getRecommendations({
      objective: 'damage', account, characters, characterName: selected.name,
      stats: { [selected.name]: { ...damage, mainStat: mainStatMap[selected.class] } }
    });
    expect(damageResult.diagnostics.join(' ')).toContain('Displayed maximum damage:');
    const stats = Object.fromEntries(characters.map((character) => {
      const { dropRate } = getDropRate(character, account, characters);
      expect(Number.isFinite(dropRate)).toBe(true);
      return [character.name, { dropRate }];
    }));
    const result = getRecommendations({ objective: 'dropRate', account, characters,
      characterName: selected.name, stats });
    expect(result.diagnostics.join(' ')).toContain('Calculated drop rate:');
    for (const recommendation of [...damageResult.recommendations, ...result.recommendations]) {
      expect(Number.isFinite(recommendation.score)).toBe(true);
      expect(recommendation.evidence.length).toBeGreaterThan(0);
    }
  });
});
