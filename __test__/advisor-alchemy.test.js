import '../polyfills';
import { describe, expect, it } from 'vitest';
import { bubblePurchase, bubbleResourceName } from '../utility/advisor/alchemy';
import { evaluateUpgrades } from '../utility/advisor/evaluate';
import { OPT } from '../parsers/accountOptions';
const bubble = { bubbleName: 'DROPPIN_LOADS', bubbleIndex: 'c1', index: 1, level: 5000, cauldron: 'kazam',
  itemReq: [{ rawName: 'Fish1', name: 'Goldfish', baseCost: 3 }, { rawName: 'Liquid1', name: 'Liquid1', baseCost: 2 }] };
const account = ({ fish = 1.05e9, uses = 0, particles = 1e6, liquid = 70000 } = {}) => {
  const rows = Array.from({ length: 17 }, (_, i) => ({ level: 0, bubbleIndex: `c${i}` }));
  rows[1] = { ...bubble };
  return { alchemy: { bubbles: { kazam: rows }, bubblesFlat: [rows[1]], liquids: [liquid], vials: [] },
    storage: { list: [{ rawName: 'Fish1', amount: fish }] },
    atoms: { particles, atoms: Array.from({ length: 5 }, () => ({ level: 1 })) },
    accountOptions: { [OPT.alternateParticles]: uses }, achievements: [] };
};

describe('late-game bubble purchases', () => {
  it('checks materials and liquids for bubbles far beyond level 30', () => {
    const result = bubblePurchase(account(), bubble);
    expect(result.blocked).toBeUndefined();
    expect(result.costs[0]).toMatchObject({ rawName: 'Fish1', amount: 1e9 });
    expect(result.costs[1].name).toBe('Water Drops');
    expect(result.costs[1].amount).toBeGreaterThan(0);
  });
  it('uses particles only when the atom, particles and remaining daily use allow it', () => {
    const acc = account({ fish: 0, uses: 1 });
    const result = bubblePurchase(acc, bubble);
    expect(result.usingParticles).toBe(true);
    expect(result.costs.map((c) => c.rawName)).toContain('BoronUses');
    expect(bubblePurchase(account({ fish: 0, uses: 0 }), bubble).blocked).toBeTruthy();
    expect(bubblePurchase(account({ fish: 0, uses: 1, particles: 0 }), bubble).blocked).toBeTruthy();
    acc.atoms.atoms[4].level = 0;
    expect(bubblePurchase(acc, bubble).blocked).toBeTruthy();
  });
  it('requires liquids even when particles can replace the material', () => {
    expect(bubblePurchase(account({ fish: 0, uses: 1, liquid: 0 }), bubble).blocked).toBeTruthy();
  });
  it('does not reuse the placeholder Strung Jewels name for summoning essence', () => {
    expect(bubbleResourceName({}, { rawName: 'W6item6', name: 'Strung_Jewels' })).toBe('white summoning essence');
  });
  it('updates both bubble views and never mutates the original save', () => {
    const acc = account();
    const before = JSON.stringify(acc);
    const result = evaluateUpgrades({ objective: 'dropRate', account: acc, characters: [{ name: 'Advanced' }] },
      (c, peers, a) => {
        expect(a.alchemy.bubblesFlat[0].level).toBe(a.alchemy.bubbles.kazam[1].level);
        return 10 + a.alchemy.bubblesFlat[0].level / 1000000;
      });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].after).toBeGreaterThan(result.baseline);
    expect(JSON.stringify(acc)).toBe(before);
  });
});
