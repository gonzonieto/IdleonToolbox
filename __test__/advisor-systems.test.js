import '../polyfills';
import { describe, expect, it } from 'vitest';
import { parseFixture } from './helpers/parsed-fixtures';
import raw from '../data/raw.json';
import { additionalUpgradePlans } from '../utility/advisor/systems';
import { getVaultUpgradeCost, calculateVaultBonus } from '../parsers/misc/upgradeVault';
import { getArcadeGoldCost, getArcadeUpgradeBonus } from '../parsers/world-2/arcade';
import { getAtomUpgradeCost } from '../parsers/world-3/atomCollider';
const { account: base, characters } = parseFixture(raw);
const isolate = (overrides) => ({ ...base, upgradeVault: undefined, arcade: undefined, atoms: undefined, statues: [], ...overrides });
const plans = (account, objective = 'damage', limit = 10) => additionalUpgradePlans({ account, characters, objective, limit });

describe('Upgrade Vault actions', () => {
  const vaultAccount = (money = 1e20) => {
    const upgrades = base.upgradeVault.upgrades.map((r) => ({ ...r, level: 0, bonus: 0, maxLevel: 0, unlocked: false }));
    upgrades[0] = { ...upgrades[0], unlocked: true, maxLevel: 20 };
    return isolate({ upgradeVault: { ...base.upgradeVault, upgrades, totalUpgradeLevels: 0 }, currencies: { rawMoney: money } });
  };
  it('budgets cumulative prices and rebuilds cached bonuses', () => {
    const acc = vaultAccount(); const before = JSON.stringify(acc);
    const plan = plans(acc).plans[0];
    expect(plan.action).toMatchObject({ category: 'Vault', levelCount: 10, targetLevel: 10 });
    expect(plan.account.upgradeVault.upgrades[0].bonus).toBe(calculateVaultBonus(plan.account.upgradeVault.upgrades, 0));
    expect(plan.account.currencies.rawMoney).toBe(acc.currencies.rawMoney - plan.action.amount);
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('stops at caps, locked upgrades and the actual coin budget', () => {
    const acc = vaultAccount(); const first = getVaultUpgradeCost(acc.upgradeVault.upgrades, 0, acc);
    expect(plans(vaultAccount(first)).plans[0].action.levelCount).toBe(1);
    acc.upgradeVault.upgrades[0].level = 20;
    expect(plans(acc).coverage.Vault.skipped.capped).toBe(1);
    expect(plans(acc).plans).toEqual([]);
    acc.upgradeVault.upgrades[0] = { ...acc.upgradeVault.upgrades[0], level: 0, unlocked: false };
    expect(plans(acc).plans).toEqual([]);
  });
});

describe('Arcade actions', () => {
  const make = (royal = 5, omega = 2, active = true) => {
    const row = { ...base.arcade.shop[0], level: 99, active, iconName: 'PachiShopICON0' };
    const acc = isolate({ arcade: { ...base.arcade, shop: [row], goldBalls: 100000, royalBalls: royal, omegaBalls: omega } });
    row.bonus = getArcadeUpgradeBonus(row, acc);
    return acc;
  };
  it('crosses normal, Super and Omega levels with separate currencies and bonuses', () => {
    const acc = make(); const before = JSON.stringify(acc);
    const plan = plans(acc).plans[0];
    expect(plan.action).toMatchObject({ category: 'Arcade', levelCount: 3, targetLevel: 102 });
    expect(plan.account.arcade).toMatchObject({ royalBalls: 0, omegaBalls: 0 });
    expect(plan.account.arcade.goldBalls).toBe(100000 - getArcadeGoldCost(acc, 99, 0));
    expect(plan.account.arcade.shop[0].bonus).toBe(getArcadeUpgradeBonus(acc.arcade.shop[0], acc, 102));
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('does not buy an inactive offer or reuse cap currencies', () => {
    expect(plans(make(0, 2)).plans[0].action.targetLevel).toBe(100);
    expect(plans(make(5, 0)).plans[0].action.targetLevel).toBe(101);
    expect(plans(make(5, 2, false)).plans).toEqual([]);
    const acc = make(); acc.arcade.shop[0].level = 102;
    expect(plans(acc).plans).toEqual([]);
  });
  it('prices the shared gold-cost helper at the original curve boundaries', () => {
    const acc = { stamps: { misc: [] } };
    for (const [index, exponent, baseCost, multiplier] of [[0,1.3,5,3],[51,1.43,10,5],[54,1.43,10,5],[55,1.83,20,10],[60,1.3,5,3],[61,1.3,5,3],[62,1.69,20,10],[70,1.92,20,10]]) {
      expect(getArcadeGoldCost(acc, 10, index)).toBe(Math.round(baseCost + multiplier * 10 + 10 ** exponent));
    }
  });
});

describe('Atom actions', () => {
  const make = (particles = 1e50) => {
    const atoms = base.atoms.atoms.map((r) => ({ ...r }));
    atoms[9] = { ...atoms[9], level: 1, value: atoms[9].baseBonus, bonus: atoms[9].baseBonus, maxLevel: 4 };
    const towers = { ...base.towers, data: base.towers.data.map((r, i) => i === 8 ? { ...r, level: 1 } : r) };
    return isolate({ atoms: { ...base.atoms, atoms, particles, totalAtomsAvailable: 11 }, towers });
  };
  it('reprices Neon after its own cost discount changes and respects caps', () => {
    const acc = make(); const before = JSON.stringify(acc); const plan = plans(acc).plans[0];
    expect(plan.action).toMatchObject({ category: 'Atom', levelCount: 3, targetLevel: 4 });
    let total = 0;
    const working = structuredClone(acc);
    for (let level = 1; level < 4; level++) {
      working.atoms.atoms[9].level = level;
      total += getAtomUpgradeCost(working, 9, level);
    }
    expect(plan.action.amount).toBe(total);
    expect(plan.account.atoms.atoms[9].value).toBe(4 * acc.atoms.atoms[9].baseBonus);
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('requires particles and an unlocked collider', () => {
    expect(plans(make(0)).plans).toEqual([]);
    const acc = make(); acc.atoms.totalAtomsAvailable = 9;
    expect(plans(acc).plans).toEqual([]);
  });
  it('matches the existing parsed cost on a real save', () => {
    expect(getAtomUpgradeCost(base, 9, base.atoms.atoms[9].level)).toBeCloseTo(base.atoms.atoms[9].cost, 6);
  });
});

describe('shared statue turn-ins', () => {
  const make = (grade = 1) => isolate({ statues: [{ ...base.statues[0], statueIndex: 0, level: 1, progress: 1, rawName: 'StatueG1' }],
    statueGrades: [grade], storage: { list: [{ rawName: 'Statue1', amount: 1 }, { rawName: 'Statue1', amount: 1 }] },
    royalGuardian: { ...base.royalGuardian, statueFlair: { statues: [{ index: 0, expMulti: 2 }] } } });
  it('uses carried XP progress and the current flair multiplier, deducting stored items once', () => {
    const acc = make(); const before = JSON.stringify(acc); const plan = plans(acc, 'damage', 1).plans[0];
    expect(plan.action).toMatchObject({ category: 'Statue', levelCount: 1, amount: 1, targetLevel: 2 });
    expect(plan.account.statues[0].progress).toBe(1);
    expect(plan.account.storage.list.map((r) => r.amount)).toEqual([0, 1]);
    expect(JSON.stringify(acc)).toBe(before);
  });
  it('requires shared gold statues and does not assume missing statues can be farmed', () => {
    expect(plans(make(0)).plans).toEqual([]);
    const acc = make(); acc.storage.list = [];
    expect(plans(acc).plans).toEqual([]);
  });
});
